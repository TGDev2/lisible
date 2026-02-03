import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Create auth middleware using Edge-compatible config (no bcrypt)
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    /*
     * Match only protected and auth routes
     */
    "/projects/:path*",
    "/editor/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/login",
    "/register",
    "/forgot-password",
  ],
};
