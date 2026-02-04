import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users, auditLogs, eq } from "@sme-studio/db";
import { sendAccountDeletionRequestEmail } from "@/lib/email";
import { deleteAccountSchema } from "@/lib/validations/auth";

const GRACE_PERIOD_HOURS = 72;

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Non authentifié" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = deleteAccountSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Validation échouée",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if user exists and is not already pending deletion
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        deletionRequestedAt: users.deletionRequestedAt,
        stripeSubscriptionId: users.stripeSubscriptionId,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { message: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Check if already pending deletion
    if (user.deletionRequestedAt) {
      const deletionDate = new Date(user.deletionRequestedAt);
      deletionDate.setHours(deletionDate.getHours() + GRACE_PERIOD_HOURS);

      return NextResponse.json(
        {
          message: "Une demande de suppression est déjà en cours",
          deletionScheduledAt: deletionDate.toISOString(),
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const deletionDate = new Date(now);
    deletionDate.setHours(deletionDate.getHours() + GRACE_PERIOD_HOURS);

    // Mark user for deletion
    await db
      .update(users)
      .set({
        deletionRequestedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, session.user.id));

    // Log the action
    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: "account_deletion_requested",
      resourceType: "user",
      resourceId: session.user.id,
      metadata: {
        gracePeriodHours: GRACE_PERIOD_HOURS,
        deletionScheduledAt: deletionDate.toISOString(),
      },
    });

    // Generate cancellation URL with a secure token
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const cancellationToken = Buffer.from(`${session.user.id}:${now.getTime()}`).toString("base64url");
    const cancellationUrl = `${baseUrl}/settings?cancel_deletion=${cancellationToken}`;

    // Send confirmation email
    try {
      await sendAccountDeletionRequestEmail({
        to: user.email,
        cancellationUrl,
        deletionDate: deletionDate.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    } catch (emailError) {
      console.error("Failed to send deletion confirmation email:", emailError);
      // Continue anyway - the deletion is scheduled
    }

    return NextResponse.json({
      message: "Demande de suppression enregistrée",
      deletionScheduledAt: deletionDate.toISOString(),
      gracePeriodHours: GRACE_PERIOD_HOURS,
    });
  } catch (error) {
    console.error("Error requesting account deletion:", error);
    return NextResponse.json(
      { message: "Erreur serveur" },
      { status: 500 }
    );
  }
}
