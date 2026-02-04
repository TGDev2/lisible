"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";

type AccountInfo = {
  email: string;
  createdAt: string;
  plan: string;
  deletionRequestedAt?: string | null;
};

type FieldErrors = {
  currentPassword?: string[];
  newPassword?: string[];
  confirmNewPassword?: string[];
};

type ExportState = {
  isExporting: boolean;
  downloadUrl: string | null;
  expiresAt: string | null;
  error: string | null;
};

type DeletionState = {
  isRequesting: boolean;
  isCancelling: boolean;
  error: string | null;
  success: string | null;
  scheduledAt: string | null;
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [exportState, setExportState] = useState<ExportState>({
    isExporting: false,
    downloadUrl: null,
    expiresAt: null,
    error: null,
  });
  const [deletionState, setDeletionState] = useState<DeletionState>({
    isRequesting: false,
    isCancelling: false,
    error: null,
    success: null,
    scheduledAt: null,
  });
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchAccountInfo();
    }
  }, [status, router]);

  // Handle cancel_deletion query param from email link
  useEffect(() => {
    const cancelToken = searchParams.get("cancel_deletion");
    if (cancelToken && status === "authenticated") {
      handleCancelDeletion();
      // Clear the query param
      router.replace("/settings");
    }
  }, [searchParams, status, router]);

  async function fetchAccountInfo() {
    try {
      const response = await fetch("/api/user/account");
      if (response.ok) {
        const data = await response.json();
        setAccountInfo(data);
        if (data.deletionRequestedAt) {
          const scheduledDate = new Date(data.deletionRequestedAt);
          scheduledDate.setHours(scheduledDate.getHours() + 72);
          setDeletionState((prev) => ({
            ...prev,
            scheduledAt: scheduledDate.toISOString(),
          }));
        }
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

  async function handleExportData() {
    setExportState({
      isExporting: true,
      downloadUrl: null,
      expiresAt: null,
      error: null,
    });

    try {
      const response = await fetch("/api/user/export");
      const result = await response.json();

      if (!response.ok) {
        setExportState({
          isExporting: false,
          downloadUrl: null,
          expiresAt: null,
          error: result.message || "Une erreur est survenue lors de l'export",
        });
        return;
      }

      setExportState({
        isExporting: false,
        downloadUrl: result.downloadUrl,
        expiresAt: result.expiresAt,
        error: null,
      });
    } catch {
      setExportState({
        isExporting: false,
        downloadUrl: null,
        expiresAt: null,
        error: "Une erreur est survenue. Veuillez reessayer.",
      });
    }
  }

  async function handleDeleteAccount() {
    if (!deleteConfirmChecked || deleteConfirmText !== "SUPPRIMER") {
      return;
    }

    setDeletionState((prev) => ({
      ...prev,
      isRequesting: true,
      error: null,
      success: null,
    }));

    try {
      const response = await fetch("/api/user/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: deleteConfirmText }),
      });

      const result = await response.json();

      if (!response.ok) {
        setDeletionState((prev) => ({
          ...prev,
          isRequesting: false,
          error: result.message || "Une erreur est survenue",
        }));
        return;
      }

      setDeletionState({
        isRequesting: false,
        isCancelling: false,
        error: null,
        success: "Demande de suppression enregistree. Vous allez recevoir un email de confirmation.",
        scheduledAt: result.deletionScheduledAt,
      });

      // Reset form
      setDeleteConfirmChecked(false);
      setDeleteConfirmText("");
      setDeleteDialogOpen(false);

      // Refresh account info
      await fetchAccountInfo();
    } catch {
      setDeletionState((prev) => ({
        ...prev,
        isRequesting: false,
        error: "Une erreur est survenue. Veuillez reessayer.",
      }));
    }
  }

  async function handleCancelDeletion() {
    setDeletionState((prev) => ({
      ...prev,
      isCancelling: true,
      error: null,
      success: null,
    }));

    try {
      const response = await fetch("/api/user/account/cancel-deletion", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        setDeletionState((prev) => ({
          ...prev,
          isCancelling: false,
          error: result.message || "Une erreur est survenue",
        }));
        return;
      }

      setDeletionState({
        isRequesting: false,
        isCancelling: false,
        error: null,
        success: "Suppression annulee avec succes. Votre compte est preserve.",
        scheduledAt: null,
      });

      // Refresh account info
      await fetchAccountInfo();
    } catch {
      setDeletionState((prev) => ({
        ...prev,
        isCancelling: false,
        error: "Une erreur est survenue. Veuillez reessayer.",
      }));
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

  function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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

  const hasPendingDeletion = !!accountInfo?.deletionRequestedAt;
  const canSubmitDelete = deleteConfirmChecked && deleteConfirmText === "SUPPRIMER";

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
          {/* Export section */}
          {exportState.error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {exportState.error}
            </div>
          )}
          {exportState.downloadUrl && (
            <div className="rounded-md bg-green-500/15 p-4 space-y-2">
              <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                Export genere avec succes !
              </p>
              <p className="text-sm text-green-700 dark:text-green-400">
                Le lien est valide pendant 24 heures.
              </p>
              <a
                href={exportState.downloadUrl}
                download="sme-studio-export.json"
                className="inline-block mt-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
              >
                Telecharger le fichier JSON
              </a>
            </div>
          )}

          {/* Deletion state messages */}
          {deletionState.error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {deletionState.error}
            </div>
          )}
          {deletionState.success && (
            <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-700 dark:text-green-400">
              {deletionState.success}
            </div>
          )}

          {/* Pending deletion warning */}
          {hasPendingDeletion && deletionState.scheduledAt && (
            <div className="rounded-md bg-amber-500/15 border border-amber-500/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Suppression programmee
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Votre compte sera supprime le{" "}
                    <strong>{formatDateTime(deletionState.scheduledAt)}</strong>.
                    Vous pouvez annuler cette demande avant cette date.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelDeletion}
                disabled={deletionState.isCancelling}
                className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
              >
                {deletionState.isCancelling
                  ? "Annulation en cours..."
                  : "Annuler la suppression"}
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              variant="outline"
              onClick={handleExportData}
              disabled={exportState.isExporting}
            >
              {exportState.isExporting
                ? "Generation en cours..."
                : "Exporter mes donnees"}
            </Button>

            {!hasPendingDeletion && (
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive">Supprimer mon compte</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-destructive">
                      Supprimer mon compte
                    </DialogTitle>
                    <DialogDescription>
                      Cette action est irreversible. Toutes vos donnees seront
                      definitivement supprimees apres un delai de 72 heures.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4">
                      <h4 className="text-sm font-medium text-destructive mb-2">
                        Consequences de la suppression :
                      </h4>
                      <ul className="text-sm text-destructive/90 space-y-1 list-disc list-inside">
                        <li>Tous vos projets et fichiers seront supprimes</li>
                        <li>Votre historique de transcriptions sera efface</li>
                        <li>Votre abonnement sera annule</li>
                        <li>Vous ne pourrez plus recuperer vos donnees</li>
                      </ul>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="deleteConfirm"
                          checked={deleteConfirmChecked}
                          onCheckedChange={(checked) =>
                            setDeleteConfirmChecked(checked === true)
                          }
                        />
                        <Label
                          htmlFor="deleteConfirm"
                          className="text-sm font-normal cursor-pointer"
                        >
                          Je comprends que cette action est irreversible
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="deleteConfirmText">
                          Pour confirmer, saisissez <strong>SUPPRIMER</strong>{" "}
                          ci-dessous :
                        </Label>
                        <Input
                          id="deleteConfirmText"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="SUPPRIMER"
                          className="font-mono"
                        />
                      </div>
                    </div>

                    {deletionState.error && (
                      <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                        {deletionState.error}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDeleteDialogOpen(false);
                        setDeleteConfirmChecked(false);
                        setDeleteConfirmText("");
                        setDeletionState((prev) => ({ ...prev, error: null }));
                      }}
                      disabled={deletionState.isRequesting}
                    >
                      Annuler
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={!canSubmitDelete || deletionState.isRequesting}
                    >
                      {deletionState.isRequesting
                        ? "Traitement en cours..."
                        : "Confirmer la suppression"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {hasPendingDeletion
              ? "Votre demande de suppression est en cours de traitement."
              : "La suppression prend effet apres un delai de 72 heures, durant lequel vous pouvez annuler votre demande."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
