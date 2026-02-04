import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getRateLimitKey,
} from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations/auth";

/**
 * POST /api/auth/login
 * Check rate limiting before login attempt.
 * The actual authentication is handled by NextAuth signIn.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Données invalides",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email } = validationResult.data;

    // Get client IP
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Check rate limit by IP + email combo
    const rateLimitKey = getRateLimitKey(ip, email);
    const rateLimitResult = checkRateLimit(rateLimitKey);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Trop de tentatives de connexion",
          message: `Veuillez réessayer dans ${rateLimitResult.resetIn} secondes`,
          retryAfter: rateLimitResult.resetIn,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.resetIn.toString(),
          },
        }
      );
    }

    // Return OK - client will proceed with NextAuth signIn
    return NextResponse.json({
      ok: true,
      remaining: rateLimitResult.remaining,
    });
  } catch (error) {
    console.error("Login check error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/login
 * Record failed login attempt for rate limiting.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Get client IP
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Record failed attempt
    const rateLimitKey = getRateLimitKey(ip, email);
    recordFailedAttempt(rateLimitKey);

    const rateLimitResult = checkRateLimit(rateLimitKey);

    return NextResponse.json({
      ok: true,
      remaining: rateLimitResult.remaining,
      blocked: !rateLimitResult.success,
      retryAfter: rateLimitResult.resetIn,
    });
  } catch (error) {
    console.error("Record failed attempt error:", error);
    return NextResponse.json({ ok: true }); // Don't expose errors
  }
}

/**
 * DELETE /api/auth/login
 * Clear rate limit after successful login.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Get client IP
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Clear rate limit
    const rateLimitKey = getRateLimitKey(ip, email);
    clearRateLimit(rateLimitKey);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Clear rate limit error:", error);
    return NextResponse.json({ ok: true }); // Don't expose errors
  }
}
