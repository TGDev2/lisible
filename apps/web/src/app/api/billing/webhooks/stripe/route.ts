import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  getDb,
  users,
  creditTransactions,
  auditLogs,
  eq,
} from "@sme-studio/db";

// ── Constants ──────────────────────────────────────────────────────────
const PRO_CREDITS = 200; // minutes/month for Pro plan

// ── API POST /api/webhooks/stripe (Next.js route) ──────────
// Disable body parsing — Stripe needs the raw body for signature check
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let event: Stripe.Event;

  // ── Signature HMAC verification ────────────────────────
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("[Webhook] Missing stripe-signature header");
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Webhook] STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook] Signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // ── Idempotency check (event ID) ──────────────────────
  const db = getDb();
  const eventId = event.id;

  const [existing] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(eq(auditLogs.resourceId, eventId))
    .limit(1);

  if (existing) {
    console.log(`[Webhook] Event ${eventId} already processed, skipping`);
    return NextResponse.json({ received: true, deduplicated: true });
  }

  // ── Logging événements ────────────────────────────────
  console.log(`[Webhook] Processing event ${event.type} (${eventId})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // Log processed event for idempotency + audit trail
    await db.insert(auditLogs).values({
      action: "stripe_webhook",
      resourceType: "stripe_event",
      resourceId: eventId,
      metadata: {
        eventType: event.type,
        processedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[Webhook] Error processing ${event.type}:`, error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

// ── Handler checkout.session.completed ─────────────────────
// Activates Pro plan after successful Stripe Checkout
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error("[Webhook] checkout.session.completed: missing userId in metadata");
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (!subscriptionId) {
    console.error("[Webhook] checkout.session.completed: missing subscription ID");
    return;
  }

  const db = getDb();

  // Check current state before applying (guard against out-of-order events)
  const [user] = await db
    .select({ plan: users.plan, subscriptionStatus: users.subscriptionStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    console.error(`[Webhook] checkout.session.completed: user ${userId} not found`);
    return;
  }

  if (user.plan === "pro" && user.subscriptionStatus === "active") {
    console.log(`[Webhook] User ${userId} already Pro/active, skipping`);
    return;
  }

  // Activate Pro plan + allocate credits
  const now = new Date();
  const newBalance = PRO_CREDITS;

  await db
    .update(users)
    .set({
      plan: "pro",
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "active",
      creditsTotal: PRO_CREDITS,
      creditsUsed: 0,
      creditsRollover: 0,
      creditsResetAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  // Record credit allocation in ledger
  await db.insert(creditTransactions).values({
    userId,
    type: "allocation",
    amount: PRO_CREDITS,
    balanceAfter: newBalance,
    description: "Activation abonnement Pro : 200 minutes",
  });

  console.log(`[Webhook] User ${userId} upgraded to Pro, ${PRO_CREDITS} credits allocated`);
}

// ── Handler invoice.paid ───────────────────────────────────
// Renews credits on successful recurring payment
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Skip the first invoice (handled by checkout.session.completed)
  if (invoice.billing_reason === "subscription_create") {
    console.log("[Webhook] invoice.paid: initial subscription invoice, skipping (handled by checkout)");
    return;
  }

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) {
    console.error("[Webhook] invoice.paid: missing customer ID");
    return;
  }

  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      plan: users.plan,
      creditsTotal: users.creditsTotal,
      creditsUsed: users.creditsUsed,
      creditsRollover: users.creditsRollover,
    })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.error(`[Webhook] invoice.paid: no user found for customer ${customerId}`);
    return;
  }

  // Calculate rollover (unused minutes, capped at 200)
  const currentTotal = user.creditsTotal ?? 0;
  const currentUsed = user.creditsUsed ?? 0;
  const unused = Math.max(0, currentTotal - currentUsed);
  const rollover = Math.min(unused, PRO_CREDITS); // cap rollover at 200 min

  const newBalance = PRO_CREDITS + rollover;
  const now = new Date();

  await db
    .update(users)
    .set({
      plan: "pro",
      subscriptionStatus: "active",
      creditsTotal: PRO_CREDITS,
      creditsUsed: 0,
      creditsRollover: rollover,
      creditsResetAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  // Record rollover if any
  if (unused > 0 && rollover < unused) {
    await db.insert(creditTransactions).values({
      userId: user.id,
      type: "rollover",
      amount: -(unused - rollover),
      balanceAfter: newBalance,
      stripeInvoiceId: invoice.id,
      description: `Expiration : ${unused - rollover} minutes non reportées`,
    });
  }

  // Record new allocation
  await db.insert(creditTransactions).values({
    userId: user.id,
    type: "allocation",
    amount: PRO_CREDITS,
    balanceAfter: newBalance,
    stripeInvoiceId: invoice.id,
    description: `Renouvellement mensuel : ${PRO_CREDITS} minutes${rollover > 0 ? ` (+${rollover} rollover)` : ""}`,
  });

  console.log(
    `[Webhook] User ${user.id} credits renewed: ${PRO_CREDITS} + ${rollover} rollover, invoice ${invoice.id}`
  );
}

// ── Handler subscription.deleted ───────────────────────────
// Downgrades user to Free plan when subscription is fully cancelled
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) {
    console.error("[Webhook] subscription.deleted: missing customer ID");
    return;
  }

  const db = getDb();

  const [user] = await db
    .select({ id: users.id, plan: users.plan })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.error(`[Webhook] subscription.deleted: no user found for customer ${customerId}`);
    return;
  }

  // Guard: already free
  if (user.plan === "free") {
    console.log(`[Webhook] User ${user.id} already on Free plan, skipping`);
    return;
  }

  const now = new Date();

  await db
    .update(users)
    .set({
      plan: "free",
      subscriptionStatus: "canceled",
      subscriptionEndsAt: now,
      stripeSubscriptionId: null,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  console.log(`[Webhook] User ${user.id} downgraded to Free (subscription deleted)`);
}

// ── Handler subscription.updated (cancel at period end) ────
// Tracks partial updates: cancellation scheduled, plan changes, past_due
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) {
    console.error("[Webhook] subscription.updated: missing customer ID");
    return;
  }

  const db = getDb();

  const [user] = await db
    .select({ id: users.id, plan: users.plan })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.error(`[Webhook] subscription.updated: no user found for customer ${customerId}`);
    return;
  }

  // Map Stripe status to our subscription_status
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    trialing: "active",
    paused: "canceled",
  };

  const newStatus = statusMap[subscription.status] ?? subscription.status;

  // Handle cancel_at_period_end (user clicked "Cancel" in portal)
  const subscriptionEndsAt = subscription.cancel_at_period_end && subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  await db
    .update(users)
    .set({
      subscriptionStatus: newStatus,
      stripeSubscriptionId: subscription.id,
      ...(subscriptionEndsAt ? { subscriptionEndsAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  console.log(
    `[Webhook] User ${user.id} subscription updated: status=${newStatus}` +
    (subscription.cancel_at_period_end ? `, cancels at ${subscriptionEndsAt?.toISOString()}` : "")
  );
}
