import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { getDb, users, eq } from "@sme-studio/db";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validation Zod côté serveur
    const validationResult = registerSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    const { email, password, honeypot } = validationResult.data;

    // Honeypot anti-spam check
    if (honeypot) {
      // Silently reject spam bots
      return NextResponse.json(
        { error: "Registration failed" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Vérifier si l'email existe déjà
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 }
      );
    }

    // Hash bcrypt du password
    const passwordHash = await bcrypt.hash(password, 12);

    // Création user avec plan=free, credits=30
    const result = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        plan: "free",
        creditsTotal: 30,
        creditsUsed: 0,
        creditsRollover: 0,
      })
      .returning({ id: users.id, email: users.email, plan: users.plan });

    const newUser = result[0];

    if (!newUser) {
      return NextResponse.json(
        { error: "Échec de la création du compte" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          plan: newUser.plan,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de l'inscription" },
      { status: 500 }
    );
  }
}
