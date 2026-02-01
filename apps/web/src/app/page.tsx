import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Sous-titres SME livrables.
            <span className="block text-primary">Sans les aller-retours.</span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground">
            Score de lisibilité, correction guidée, dossier de preuves. Livrez
            en 2h ce qui vous prenait une journée.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg">Tester avec mon SRT</Button>
            <Button size="lg" variant="outline">
              Tester avec ma vidéo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Score SME instantané</CardTitle>
              <CardDescription>
                Voyez vos problèmes en 5 secondes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Analyse automatique de la vitesse de lecture, longueur des
                segments, chevauchements et plus encore.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Correction clavier-first</CardTitle>
              <CardDescription>
                Naviguez et corrigez sans souris
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Interface optimisée pour les pros. Raccourcis clavier, édition
                inline, recalcul du score en temps réel.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dossier PDF versionné</CardTitle>
              <CardDescription>
                Prouvez la conformité à vos clients
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Générez un dossier de preuves complet avec score, alertes
                résolues et historique des modifications.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
