import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/providers";

export const metadata: Metadata = {
  title: "SME Studio Confort",
  description:
    "Sous-titres SME livrables. Score de lisibilité, correction guidée, dossier de preuves.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
