import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { auth } from "@/lib/auth";
import { getDb, users, eq } from "@sme-studio/db";
import { changePasswordSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Non authentifie" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validationResult = changePasswordSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Donnees invalides",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validationResult.data;

    const db = getDb();
    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { message: "Utilisateur non trouve" },
        { status: 404 }
      );
    }

    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!isValidPassword) {
      return NextResponse.json(
        { message: "Mot de passe actuel incorrect" },
        { status: 400 }
      );
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({
      message: "Mot de passe modifie avec succes",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { message: "Erreur serveur" },
      { status: 500 }
    );
  }
}
