import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingSuccessContent } from "./billing-success-content";

export const metadata: Metadata = {
  title: "Abonnement confirmé — SME Studio Confort",
  description: "Votre abonnement Pro a été activé avec succès.",
};

function BillingSuccessFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted">
      <p className="text-sm text-muted-foreground">Chargement...</p>
    </main>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<BillingSuccessFallback />}>
      <BillingSuccessContent />
    </Suspense>
  );
}
