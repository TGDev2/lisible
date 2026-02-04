import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || "SME Studio <noreply@smestudio.com>";

/**
 * Send email notification when account has been deleted
 */
export async function sendAccountDeletedEmail(to: string): Promise<void> {
  const { error } = await resend.emails.send({
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
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                SME Studio
              </h1>
            </td>
          </tr>
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
