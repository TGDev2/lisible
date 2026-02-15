import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Non authentifié" },
        { status: 401 }
      );
    }

    const sessionId = request.nextUrl.searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { message: "session_id manquant" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify the session belongs to this user
    if (checkoutSession.metadata?.userId !== session.user.id) {
      return NextResponse.json(
        { message: "Session non autorisée" },
        { status: 403 }
      );
    }

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { message: "Paiement non confirmé" },
        { status: 402 }
      );
    }

    return NextResponse.json({
      status: checkoutSession.status,
      paymentStatus: checkoutSession.payment_status,
    });
  } catch (error) {
    console.error("Verify checkout error:", error);
    return NextResponse.json(
      { message: "Erreur de vérification" },
      { status: 500 }
    );
  }
}
