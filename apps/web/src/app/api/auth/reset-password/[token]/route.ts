import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { getDb, users, passwordResetTokens, eq, and, isNull } from "@sme-studio/db";
import { z } from "zod";

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
});

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/auth/reset-password/[token]
 * Validate if a password reset token is valid
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { token } = await params;

    if (!token || token.length !== 64) {
      return NextResponse.json(
        { valid: false, reason: "invalid" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Find token in database
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    if (!resetToken) {
      return NextResponse.json(
        { valid: false, reason: "invalid" },
        { status: 404 }
      );
    }

    // Check if token has been used
    if (resetToken.usedAt) {
      return NextResponse.json(
        { valid: false, reason: "used" },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json(
        { valid: false, reason: "expired" },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { valid: false, reason: "error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/reset-password/[token]
 * Reset password using the token
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = await request.json();

    if (!token || token.length !== 64) {
      return NextResponse.json(
        { error: "Token invalide", reason: "invalid" },
        { status: 400 }
      );
    }

    // Validate password
    const validationResult = passwordSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Mot de passe invalide",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { password } = validationResult.data;
    const db = getDb();

    // Find valid, unused token
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          isNull(passwordResetTokens.usedAt)
        )
      )
      .limit(1);

    if (!resetToken) {
      return NextResponse.json(
        { error: "Token invalide ou déjà utilisé", reason: "invalid" },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json(
        { error: "Ce lien a expiré", reason: "expired" },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user password
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, resetToken.userId));

    // Mark token as used (invalidate)
    await db
      .update(passwordResetTokens)
      .set({
        usedAt: new Date(),
      })
      .where(eq(passwordResetTokens.id, resetToken.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue" },
      { status: 500 }
    );
  }
}
