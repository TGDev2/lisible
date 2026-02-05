import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "SME Studio <noreply@smestudio.com>";

interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailParams) {
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Réinitialisation de votre mot de passe - SME Studio",
    html: getPasswordResetEmailTemplate(resetUrl),
    text: getPasswordResetEmailText(resetUrl),
  });

  if (error) {
    console.error("Failed to send password reset email:", error);
    throw new Error("Failed to send email");
  }

  return data;
}

function getPasswordResetEmailTemplate(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de mot de passe</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                SME Studio
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #18181b;">
                Réinitialisation de votre mot de passe
              </h2>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #52525b;">
                Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.
              </p>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #18181b; text-decoration: none; border-radius: 6px;">
                      Réinitialiser mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 22px; color: #71717a;">
                Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #a1a1aa;">
                Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; line-height: 18px; color: #3b82f6; word-break: break-all;">
                ${resetUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #71717a;">
                &copy; ${new Date().getFullYear()} SME Studio. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getPasswordResetEmailText(resetUrl: string): string {
  return `
Réinitialisation de votre mot de passe - SME Studio

Vous avez demandé la réinitialisation de votre mot de passe.

Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :
${resetUrl}

Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.

© ${new Date().getFullYear()} SME Studio. Tous droits réservés.
  `.trim();
}

// ============================================
// Account Deletion Emails
// ============================================

interface SendAccountDeletionRequestEmailParams {
  to: string;
  cancellationUrl: string;
  deletionDate: string;
}

export async function sendAccountDeletionRequestEmail({
  to,
  cancellationUrl,
  deletionDate,
}: SendAccountDeletionRequestEmailParams) {
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Confirmation de suppression de compte - SME Studio",
    html: getAccountDeletionRequestEmailTemplate(cancellationUrl, deletionDate),
    text: getAccountDeletionRequestEmailText(cancellationUrl, deletionDate),
  });

  if (error) {
    console.error("Failed to send account deletion request email:", error);
    throw new Error("Failed to send email");
  }

  return data;
}

function getAccountDeletionRequestEmailTemplate(
  cancellationUrl: string,
  deletionDate: string
): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de suppression de compte</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                SME Studio
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #dc2626;">
                Demande de suppression de compte
              </h2>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #52525b;">
                Vous avez demandé la suppression de votre compte SME Studio. Cette action est irréversible.
              </p>

              <div style="margin: 20px 0; padding: 16px; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #dc2626;">
                <p style="margin: 0; font-size: 14px; line-height: 22px; color: #991b1b;">
                  <strong>Votre compte sera définitivement supprimé le ${deletionDate}</strong><br>
                  Toutes vos données, fichiers et projets seront effacés.
                </p>
              </div>

              <p style="margin: 20px 0; font-size: 16px; line-height: 24px; color: #52525b;">
                Si vous avez changé d'avis, vous pouvez annuler cette demande dans les 72 heures en cliquant sur le bouton ci-dessous :
              </p>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${cancellationUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #16a34a; text-decoration: none; border-radius: 6px;">
                      Annuler la suppression
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 22px; color: #71717a;">
                Si vous n'avez pas demandé cette suppression, cliquez immédiatement sur le bouton ci-dessus pour protéger votre compte.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #a1a1aa;">
                Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; line-height: 18px; color: #3b82f6; word-break: break-all;">
                ${cancellationUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #71717a;">
                &copy; ${new Date().getFullYear()} SME Studio. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getAccountDeletionRequestEmailText(
  cancellationUrl: string,
  deletionDate: string
): string {
  return `
Demande de suppression de compte - SME Studio

Vous avez demandé la suppression de votre compte SME Studio. Cette action est irréversible.

IMPORTANT : Votre compte sera définitivement supprimé le ${deletionDate}
Toutes vos données, fichiers et projets seront effacés.

Si vous avez changé d'avis, vous pouvez annuler cette demande dans les 72 heures en cliquant sur le lien ci-dessous :
${cancellationUrl}

Si vous n'avez pas demandé cette suppression, cliquez immédiatement sur le lien ci-dessus pour protéger votre compte.

© ${new Date().getFullYear()} SME Studio. Tous droits réservés.
  `.trim();
}

interface SendAccountDeletedEmailParams {
  to: string;
}

export async function sendAccountDeletedEmail({
  to,
}: SendAccountDeletedEmailParams) {
  const { data, error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Votre compte a été supprimé - SME Studio",
    html: getAccountDeletedEmailTemplate(),
    text: getAccountDeletedEmailText(),
  });

  if (error) {
    console.error("Failed to send account deleted email:", error);
    throw new Error("Failed to send email");
  }

  return data;
}

function getAccountDeletedEmailTemplate(): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compte supprimé</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                SME Studio
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #18181b;">
                Votre compte a été supprimé
              </h2>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #52525b;">
                Conformément à votre demande, votre compte SME Studio a été définitivement supprimé.
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #52525b;">
                Toutes vos données personnelles, fichiers et projets ont été effacés de nos serveurs conformément au RGPD.
              </p>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 22px; color: #71717a;">
                Nous vous remercions d'avoir utilisé SME Studio. Si vous souhaitez revenir, vous êtes toujours le bienvenu pour créer un nouveau compte.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #71717a;">
                &copy; ${new Date().getFullYear()} SME Studio. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getAccountDeletedEmailText(): string {
  return `
Votre compte a été supprimé - SME Studio

Conformément à votre demande, votre compte SME Studio a été définitivement supprimé.

Toutes vos données personnelles, fichiers et projets ont été effacés de nos serveurs conformément au RGPD.

Nous vous remercions d'avoir utilisé SME Studio. Si vous souhaitez revenir, vous êtes toujours le bienvenu pour créer un nouveau compte.

© ${new Date().getFullYear()} SME Studio. Tous droits réservés.
  `.trim();
}
