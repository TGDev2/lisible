import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users, auditLogs, eq } from "@sme-studio/db";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Non authentifié" },
        { status: 401 }
      );
    }

    const db = getDb();

    // Check if user exists and has a pending deletion
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        deletionRequestedAt: users.deletionRequestedAt,
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

    // Check if there's a pending deletion
    if (!user.deletionRequestedAt) {
      return NextResponse.json(
        { message: "Aucune demande de suppression en cours" },
        { status: 400 }
      );
    }

    // Check if the grace period has expired (72h)
    const gracePeriodMs = 72 * 60 * 60 * 1000;
    const deletionRequestTime = new Date(user.deletionRequestedAt).getTime();
    const now = Date.now();

    if (now - deletionRequestTime >= gracePeriodMs) {
      return NextResponse.json(
        { message: "Le délai de grâce est expiré, la suppression ne peut plus être annulée" },
        { status: 410 }
      );
    }

    // Cancel the deletion
    await db
      .update(users)
      .set({
        deletionRequestedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    // Log the action
    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: "account_deletion_cancelled",
      resourceType: "user",
      resourceId: session.user.id,
      metadata: {
        originalDeletionRequestedAt: user.deletionRequestedAt?.toISOString(),
      },
    });

    return NextResponse.json({
      message: "Suppression annulée avec succès",
    });
  } catch (error) {
    console.error("Error cancelling account deletion:", error);
    return NextResponse.json(
      { message: "Erreur serveur" },
      { status: 500 }
    );
  }
}
