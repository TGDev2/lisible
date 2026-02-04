"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";

type AccountInfo = {
  email: string;
  createdAt: string;
  plan: string;
};

type FieldErrors = {
  currentPassword?: string[];
  newPassword?: string[];
  confirmNewPassword?: string[];
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchAccountInfo();
    }
  }, [status, router]);

  async function fetchAccountInfo() {
    try {
      const response = await fetch("/api/user/account");
      if (response.ok) {
        const data = await response.json();
        setAccountInfo(data);
      }
    } catch (error) {
      console.error("Failed to fetch account info:", error);
    } finally {
      setIsLoadingInfo(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const data: ChangePasswordInput = {
      currentPassword: formData.get("currentPassword") as string,
      newPassword: formData.get("newPassword") as string,
      confirmNewPassword: formData.get("confirmNewPassword") as string,
    };

    const validationResult = changePasswordSchema.safeParse(data);

    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      setFieldErrors({
        currentPassword: errors.currentPassword,
        newPassword: errors.newPassword,
        confirmNewPassword: errors.confirmNewPassword,
      });
      setIsChangingPassword(false);
      return;
    }

    try {
      const response = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setPasswordError(result.message || "Une erreur est survenue");
        setIsChangingPassword(false);
        return;
      }

      setPasswordSuccess("Mot de passe modifie avec succes");
      setTimeout(() => {
        setPasswordDialogOpen(false);
        setPasswordSuccess(null);
      }, 2000);
    } catch {
      setPasswordError("Une erreur est survenue. Veuillez reessayer.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatPlan(plan: string): string {
    switch (plan) {
      case "pro":
        return "Pro";
      case "free":
      default:
        return "Gratuit";
    }
  }

  if (status === "loading" || isLoadingInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-10 px-4">
      <h1 className="text-3xl font-bold mb-8">Mon compte</h1>

      {/* Account Information Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Informations du compte</CardTitle>
          <CardDescription>
            Vos informations personnelles et votre abonnement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm">Email</Label>
              <p className="font-medium">
                {accountInfo?.email || session?.user?.email}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">
                Date d&apos;inscription
              </Label>
              <p className="font-medium">
                {accountInfo?.createdAt
                  ? formatDate(accountInfo.createdAt)
                  : "-"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">
                Plan actuel
              </Label>
              <p className="font-medium">
                <span
                  className={
                    accountInfo?.plan === "pro"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }
                >
                  {formatPlan(accountInfo?.plan || session?.user?.plan || "free")}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Securite</CardTitle>
          <CardDescription>Gerez la securite de votre compte</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Modifier le mot de passe</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modifier le mot de passe</DialogTitle>
                <DialogDescription>
                  Entrez votre mot de passe actuel puis choisissez un nouveau mot
                  de passe.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleChangePassword}>
                <div className="space-y-4 py-4">
                  {passwordError && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-700 dark:text-green-400">
                      {passwordSuccess}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      disabled={isChangingPassword}
                      required
                    />
                    {fieldErrors.currentPassword && (
                      <p className="text-sm text-destructive">
                        {fieldErrors.currentPassword[0]}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      disabled={isChangingPassword}
                      required
                    />
                    {fieldErrors.newPassword && (
                      <p className="text-sm text-destructive">
                        {fieldErrors.newPassword[0]}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmNewPassword">
                      Confirmer le nouveau mot de passe
                    </Label>
                    <Input
                      id="confirmNewPassword"
                      name="confirmNewPassword"
                      type="password"
                      disabled={isChangingPassword}
                      required
                    />
                    {fieldErrors.confirmNewPassword && (
                      <p className="text-sm text-destructive">
                        {fieldErrors.confirmNewPassword[0]}
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPasswordDialogOpen(false)}
                    disabled={isChangingPassword}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword
                      ? "Modification en cours..."
                      : "Modifier le mot de passe"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* RGPD Card */}
      <Card>
        <CardHeader>
          <CardTitle>Donnees personnelles (RGPD)</CardTitle>
          <CardDescription>
            Gerez vos donnees conformement au RGPD
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="outline" disabled>
              Exporter mes donnees
            </Button>
            <Button variant="destructive" disabled>
              Supprimer mon compte
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Ces fonctionnalites seront bientot disponibles.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
