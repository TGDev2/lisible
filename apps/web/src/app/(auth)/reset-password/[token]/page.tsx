"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resetPasswordSchema } from "@/lib/validations/auth";

type FieldErrors = {
  password?: string[];
  confirmPassword?: string[];
};

type TokenStatus = "loading" | "valid" | "invalid" | "expired" | "used";

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSuccess, setIsSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      try {
        const response = await fetch(`/api/auth/reset-password/${token}`);
        const data = await response.json();

        if (response.ok && data.valid) {
          setTokenStatus("valid");
        } else if (data.reason === "expired") {
          setTokenStatus("expired");
        } else if (data.reason === "used") {
          setTokenStatus("used");
        } else {
          setTokenStatus("invalid");
        }
      } catch {
        setTokenStatus("invalid");
      }
    }

    if (token) {
      validateToken();
    }
  }, [token]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // Client-side validation
    const validationResult = resetPasswordSchema.safeParse({
      token,
      password,
      confirmPassword,
    });

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      setFieldErrors({
        password: errors.password,
        confirmPassword: errors.confirmPassword,
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.reason === "expired") {
          setTokenStatus("expired");
        } else if (data.reason === "used") {
          setTokenStatus("used");
        } else {
          setError(data.error || "Une erreur est survenue");
        }
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/login?reset=success");
      }, 3000);
    } catch {
      setError("Une erreur est survenue. Veuillez r&eacute;essayer.");
    } finally {
      setIsLoading(false);
    }
  }

  // Loading state
  if (tokenStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                V&eacute;rification du lien...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token
  if (tokenStatus === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Lien invalide
            </CardTitle>
            <CardDescription className="text-center">
              Ce lien de r&eacute;initialisation n&apos;est pas valide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
              Le lien que vous avez utilis&eacute; est invalide ou a &eacute;t&eacute; modifi&eacute;.
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/forgot-password" className="w-full">
              <Button className="w-full">Demander un nouveau lien</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Expired token
  if (tokenStatus === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Lien expir&eacute;
            </CardTitle>
            <CardDescription className="text-center">
              Ce lien de r&eacute;initialisation a expir&eacute;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-amber-500/15 p-4 text-sm text-amber-700 dark:text-amber-400">
              Les liens de r&eacute;initialisation expirent apr&egrave;s 1 heure pour des
              raisons de s&eacute;curit&eacute;.
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/forgot-password" className="w-full">
              <Button className="w-full">Demander un nouveau lien</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Already used token
  if (tokenStatus === "used") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Lien d&eacute;j&agrave; utilis&eacute;
            </CardTitle>
            <CardDescription className="text-center">
              Ce lien de r&eacute;initialisation a d&eacute;j&agrave; &eacute;t&eacute; utilis&eacute;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-amber-500/15 p-4 text-sm text-amber-700 dark:text-amber-400">
              Chaque lien ne peut &ecirc;tre utilis&eacute; qu&apos;une seule fois. Si vous
              avez besoin de r&eacute;initialiser votre mot de passe &agrave; nouveau,
              demandez un nouveau lien.
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Link href="/forgot-password" className="w-full">
              <Button variant="outline" className="w-full">
                Demander un nouveau lien
              </Button>
            </Link>
            <Link href="/login" className="w-full">
              <Button className="w-full">Retour &agrave; la connexion</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Mot de passe r&eacute;initialis&eacute;
            </CardTitle>
            <CardDescription className="text-center">
              Votre mot de passe a &eacute;t&eacute; modifi&eacute; avec succ&egrave;s.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-green-500/15 p-4 text-sm text-green-700 dark:text-green-400">
              <p className="font-medium">Succ&egrave;s !</p>
              <p className="mt-1">
                Vous allez &ecirc;tre redirig&eacute; vers la page de connexion...
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button className="w-full">Se connecter maintenant</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Reset password form (valid token)
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Nouveau mot de passe
          </CardTitle>
          <CardDescription className="text-center">
            Cr&eacute;ez un nouveau mot de passe pour votre compte
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isLoading}
                required
              />
              {fieldErrors.password && (
                <p className="text-sm text-destructive">
                  {fieldErrors.password[0]}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Min. 8 caract&egrave;res avec majuscule, minuscule et chiffre
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isLoading}
                required
              />
              {fieldErrors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {fieldErrors.confirmPassword[0]}
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Modification en cours..." : "Modifier le mot de passe"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Retour &agrave; la connexion
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
