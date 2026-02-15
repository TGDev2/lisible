import type { Metadata } from "next";
import { BillingSuccessContent } from "./billing-success-content";

export const metadata: Metadata = {
  title: "Abonnement confirmé — SME Studio Confort",
  description: "Votre abonnement Pro a été activé avec succès.",
};

export default function BillingSuccessPage() {
  return <BillingSuccessContent />;
}
