import type { Metadata } from "next";
import { PricingContent } from "./pricing-content";

export const metadata: Metadata = {
  title: "Tarifs — SME Studio Confort",
  description:
    "Comparez les plans Free et Pro de SME Studio. 150€/mois pour 200 minutes de sous-titrage professionnel.",
};

export default function PricingPage() {
  return <PricingContent />;
}
