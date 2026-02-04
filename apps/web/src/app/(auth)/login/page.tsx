"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

type FieldErrors = {
  email?: string[];
  password?: string[];
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  // Get callback URL from query params (for redirect after login)
  const callbackUrl = searchParams.get("callbackUrl") || "/projects";
  const registered = searchParams.get("registered");
  const reset = searchParams.get("reset");
  const authError = searchParams.get("error");

  useEffect(() => {
    // Show success message after registration
    if (registered === "true") {
      setSuccessMessage("Compte créé avec succès. Vous pouvez maintenant vous connecter.");
    }

    // Show success message after password reset
    if (reset === "success") {
      setSuccessMessage("Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.");
    }

    // Handle NextAuth errors
    if (authError) {
      switch (authError) {
        case "CredentialsSignin":
          setError("Email ou mot de passe incorrect");
          break;
        case "SessionRequired":
          setError("Vous devez être connecté pour accéder à cette page");
          break;
        default:
          setError("Une erreur est survenue lors de la connexion");
      }
    }
  }, [registered, reset, authError]);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (retryAfter > 0) {
      const timer = setInterval(() => {
        setRetryAfter((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [retryAfter]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const data: LoginInput = {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      rememberMe: formData.get("rememberMe") === "on",
    };

    // Client-side validation
    const validationResult = loginSchema.safeParse(data);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email,
        password: errors.password,
      });
      setIsLoading(false);
      return;
    }

    try {
      // Check rate limiting before attempting login
      const rateLimitCheck = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });

      if (rateLimitCheck.status === 429) {
        const rateLimitData = await rateLimitCheck.json();
        setError(rateLimitData.message || "Trop de tentatives de connexion");
        setRetryAfter(rateLimitData.retryAfter || 60);
        setIsLoading(false);
        return;
      }

      // Attempt sign in with NextAuth
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        // Record failed attempt for rate limiting
        await fetch("/api/auth/login", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: data.email }),
        });

        setError("Email ou mot de passe incorrect");
        setIsLoading(false);
        return;
      }

      // Success - clear rate limit
      await fetch("/api/auth/login", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });

      // Redirect to callback URL or dashboard
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
      setIsLoading(false);
    }
  }

  const isRateLimited = retryAfter > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Connexion
          </CardTitle>
          <CardDescription className="text-center">
            Connectez-vous à votre compte SME Studio
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {successMessage && (
              <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-700 dark:text-green-400">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
                {isRateLimited && (
                  <span className="block mt-1 font-medium">
                    Réessayez dans {retryAfter}s
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="vous@exemple.com"
                autoComplete="email"
                disabled={isLoading || isRateLimited}
                required
              />
              {fieldErrors.email && (
                <p className="text-sm text-destructive">{fieldErrors.email[0]}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLoading || isRateLimited}
                required
              />
              {fieldErrors.password && (
                <p className="text-sm text-destructive">
                  {fieldErrors.password[0]}
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                name="rememberMe"
                disabled={isLoading || isRateLimited}
              />
              <Label
                htmlFor="rememberMe"
                className="text-sm font-normal cursor-pointer"
              >
                Se souvenir de moi
              </Label>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isRateLimited}
            >
              {isLoading
                ? "Connexion en cours..."
                : isRateLimited
                  ? `Réessayer dans ${retryAfter}s`
                  : "Se connecter"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{" "}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                S&apos;inscrire
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-pulse text-muted-foreground">
            Chargement...
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
