"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function BillingSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    sessionId ? "loading" : "error"
  );

  useEffect(() => {
    if (!sessionId) return;

    // Validate that the checkout session exists
    async function verifySession() {
      try {
        const res = await fetch(
          `/api/billing/checkout/verify?session_id=${encodeURIComponent(sessionId!)}`
        );
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }

    verifySession();
  }, [sessionId]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Vérification en cours...</CardTitle>
            <CardDescription>
              Nous confirmons votre paiement, un instant.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Session invalide</CardTitle>
            <CardDescription>
              Cette session de paiement est invalide ou a expiré.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push("/pricing")}>
              Retour aux tarifs
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <CardTitle>Abonnement activé</CardTitle>
          <CardDescription>
            Votre abonnement Pro est maintenant actif. Vous disposez de 200
            minutes de sous-titrage par mois.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>200 minutes / mois incluses</li>
            <li>Export PDF sans watermark</li>
            <li>Traitement prioritaire</li>
          </ul>
          <Button
            className="w-full"
            size="lg"
            onClick={() => router.push("/projects")}
          >
            Accéder au dashboard
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
