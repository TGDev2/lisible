import type { NextAuthConfig } from "next-auth";

/**
 * Auth configuration without bcrypt/database dependencies.
 * Used by the middleware (Edge Runtime compatible).
 */
export const authConfig = {
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtectedRoute = [
        "/projects",
        "/editor",
        "/settings",
        "/billing",
      ].some((route) => nextUrl.pathname.startsWith(route));

      const isAuthRoute = ["/login", "/register", "/forgot-password"].some(
        (route) => nextUrl.pathname.startsWith(route)
      );

      if (isProtectedRoute && !isLoggedIn) {
        return false; // Redirect to login
      }

      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL("/projects", nextUrl));
      }

      return true;
    },
  },
  providers: [], // Providers are configured in auth.ts
  trustHost: true,
} satisfies NextAuthConfig;
