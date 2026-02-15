import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users, eq } from "@sme-studio/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Non authentifie" },
        { status: 401 }
      );
    }

    const db = getDb();
    const [user] = await db
      .select({
        email: users.email,
        createdAt: users.createdAt,
        plan: users.plan,
        deletionRequestedAt: users.deletionRequestedAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { message: "Utilisateur non trouve" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      email: user.email,
      createdAt: user.createdAt?.toISOString(),
      plan: user.plan || "free",
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Error fetching account info:", error);
    return NextResponse.json(
      { message: "Erreur serveur" },
      { status: 500 }
    );
  }
}
