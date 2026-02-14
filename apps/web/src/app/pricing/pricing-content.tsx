"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PricingCard } from "@/components/shared/PricingCard";

const FREE_FEATURES = [
  "Score SME instantané",
  "Analyse vitesse, longueur, chevauchements",
  "Export SRT / VTT",
  "Éditeur de sous-titres",
];

const FREE_LIMITS = [
  "3 fichiers ou 30 minutes max",
  "Fichiers jusqu'à 100 MB",
  "Vidéos jusqu'à 10 min",
  "PDF avec watermark",
  "Pas de glossaire",
];

const PRO_FEATURES = [
  "200 minutes / mois incluses",
  "Rollover 1 mois (max 200 min)",
  "Score SME instantané",
  "Analyse complète + alertes",
  "Export SRT / VTT illimité",
  "Dossier PDF sans watermark",
  "Glossaire projet",
  "Historique des versions",
  "Traitement prioritaire",
  "Fichiers jusqu'à 500 MB",
  "Vidéos jusqu'à 30 min",
];

const COMPARISON_ROWS: { feature: string; free: string; pro: string }[] = [
  { feature: "Minutes incluses", free: "30 min (unique)", pro: "200 min / mois" },
  { feature: "Nombre de fichiers", free: "3", pro: "Illimité" },
  { feature: "Taille max fichier", free: "100 MB", pro: "500 MB" },
  { feature: "Durée max vidéo", free: "10 min", pro: "30 min" },
  { feature: "Score SME", free: "Oui", pro: "Oui" },
  { feature: "Alertes (vitesse, longueur, overlap)", free: "Oui", pro: "Oui" },
  { feature: "Éditeur sous-titres", free: "Oui", pro: "Oui" },
  { feature: "Export SRT / VTT", free: "Oui", pro: "Oui" },
  { feature: "Dossier PDF preuves", free: "Watermarké", pro: "Complet" },
  { feature: "Glossaire projet", free: "Non", pro: "Oui" },
  { feature: "Historique versions", free: "Non", pro: "Oui" },
  { feature: "Rollover minutes", free: "Non", pro: "1 mois (max 200 min)" },
  { feature: "Traitement prioritaire", free: "Non", pro: "Oui" },
  { feature: "Minutes supplémentaires", free: "Non", pro: "1 € / min" },
];

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Que se passe-t-il quand j'atteins ma limite gratuite ?",
    answer:
      "Une fois vos 30 minutes ou 3 fichiers utilisés, vous ne pourrez plus uploader de nouveaux fichiers. Vous pouvez passer au plan Pro à tout moment pour continuer à travailler.",
  },
  {
    question: "Comment fonctionne le rollover de minutes ?",
    answer:
      "Les minutes non utilisées du mois en cours sont reportées sur le mois suivant, dans la limite de 200 minutes. Ce report est valable 1 mois uniquement.",
  },
  {
    question: "Puis-je annuler mon abonnement à tout moment ?",
    answer:
      "Oui, vous pouvez annuler à tout moment depuis votre espace compte. L'accès Pro reste actif jusqu'à la fin de la période de facturation en cours.",
  },
  {
    question: "Que se passe-t-il si je dépasse mes 200 minutes ?",
    answer:
      "Les minutes supplémentaires sont facturées à 1 € / minute, avec un maximum de 100 minutes de dépassement par mois.",
  },
  {
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Nous acceptons les cartes bancaires (Visa, Mastercard, etc.) via notre partenaire Stripe. Le paiement est sécurisé et conforme PCI-DSS.",
  },
  {
    question: "Les données sont-elles hébergées en Europe ?",
    answer:
      "Oui, toutes les données sont hébergées en France (Paris) sur des serveurs conformes RGPD. Les fichiers sources vidéo sont supprimés après traitement.",
  },
];

export function PricingContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const userPlan = session?.user?.plan ?? null;

  async function handleCheckout() {
    if (!session) {
      router.push("/login?callbackUrl=/pricing");
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handleFreeCta() {
    if (!session) {
      router.push("/register");
    } else {
      router.push("/projects");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <section className="container mx-auto px-4 pt-20 pb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Des tarifs simples et transparents
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Commencez gratuitement, passez Pro quand vous êtes prêt. Pas
          d&apos;engagement, annulation à tout moment.
        </p>
      </section>

      {/* Pricing Cards */}
      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          <PricingCard
            name="Free"
            description="Pour découvrir SME Studio"
            price="0 €"
            features={FREE_FEATURES}
            limits={FREE_LIMITS}
            cta={session ? "Accéder au dashboard" : "Commencer gratuitement"}
            ctaVariant="outline"
            isCurrentPlan={userPlan === "free"}
            onCtaClick={handleFreeCta}
          />

          <PricingCard
            name="Pro"
            description="Pour les équipes e-learning"
            price="150 €"
            priceDetail="/ mois"
            features={PRO_FEATURES}
            cta="S'abonner"
            highlighted
            isCurrentPlan={userPlan === "pro"}
            onCtaClick={handleCheckout}
            disabled={checkoutLoading}
          />
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="container mx-auto px-4 pb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">
          Comparaison détaillée
        </h2>
        <div className="mx-auto max-w-3xl overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 pr-4 text-left font-medium">
                  Fonctionnalité
                </th>
                <th className="px-4 py-3 text-center font-medium">Free</th>
                <th className="px-4 py-3 text-center font-medium text-primary">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="border-b last:border-0">
                  <td className="py-3 pr-4">{row.feature}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {formatCell(row.free)}
                  </td>
                  <td className="px-4 py-3 text-center">{formatCell(row.pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 pb-20">
        <h2 className="mb-8 text-center text-2xl font-bold">
          Questions fréquentes
        </h2>
        <div className="mx-auto max-w-2xl space-y-4">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border bg-card"
            >
              <summary className="flex cursor-pointer items-center justify-between p-4 font-medium">
                {item.question}
                <svg
                  className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-4 pb-4 text-sm text-muted-foreground">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="container mx-auto px-4 pb-20 text-center">
        <div className="mx-auto max-w-xl rounded-lg border bg-card p-8">
          <h3 className="mb-2 text-xl font-bold">Prêt à gagner du temps ?</h3>
          <p className="mb-6 text-muted-foreground">
            Divisez par 3 votre temps de post-production sous-titres.
          </p>
          {userPlan === "pro" ? (
            <Button variant="outline" disabled>
              Plan actuel
            </Button>
          ) : (
            <Button size="lg" onClick={handleCheckout} disabled={checkoutLoading}>
              S&apos;abonner — 150 € / mois
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

function formatCell(value: string) {
  if (value === "Oui") {
    return (
      <svg
        className="mx-auto h-5 w-5 text-primary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (value === "Non") {
    return (
      <svg
        className="mx-auto h-5 w-5 text-muted-foreground/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
      </svg>
    );
  }
  return value;
}
