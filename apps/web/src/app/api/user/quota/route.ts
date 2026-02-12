import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users, eq } from "@sme-studio/db";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Non authentifie" }, { status: 401 });
    }

    const db = getDb();
    const [user] = await db
      .select({
        plan: users.plan,
        creditsTotal: users.creditsTotal,
        creditsUsed: users.creditsUsed,
        creditsRollover: users.creditsRollover,
        creditsResetAt: users.creditsResetAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ message: "Utilisateur non trouve" }, { status: 404 });
    }

    const creditsTotal = user.creditsTotal ?? 30;
    const creditsUsed = user.creditsUsed ?? 0;
    const creditsRollover = user.creditsRollover ?? 0;

    // Total disponible = allocation du mois + rollover
    const total = creditsTotal + creditsRollover;
    const available = Math.max(0, total - creditsUsed);
    const percentUsed = total > 0 ? Math.round((creditsUsed / total) * 100) : 100;

    return NextResponse.json({
      plan: user.plan ?? "free",
      credits: {
        total,
        used: creditsUsed,
        available,
        rollover: creditsRollover,
        percentUsed,
      },
      resetAt: user.creditsResetAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Error fetching quota:", error);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
