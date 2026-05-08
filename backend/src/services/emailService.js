const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(to, token, userName) {
  const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#F2F1DF;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1DF;padding:32px 20px 40px;">
        <tr>
          <td align="center">

            <!-- Top nav -->
            <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;margin-bottom:20px;">
              <tr>
                <td style="padding:0 4px 12px;">
                  <p style="margin:0;color:#034C8C;font-size:20px;font-family:Georgia,serif;font-weight:bold;">Palinso</p>
                </td>
              </tr>
            </table>

            <!-- Card -->
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;max-width:560px;">
              <tr>
                <td align="center" style="padding:48px 48px 40px;">

                  <!-- Logo mark -->
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                    <tr>
                      <td align="center" valign="middle" style="width:52px;height:52px;background:#034C8C;border-radius:26px;text-align:center;">
                        <span style="color:#ffffff;font-size:22px;font-family:Georgia,serif;font-weight:bold;">P</span>
                      </td>
                    </tr>
                  </table>

                  <!-- Heading -->
                  <h1 style="margin:0 0 16px;font-size:26px;color:#1a1a1a;font-family:Georgia,serif;font-weight:bold;text-align:center;">
                    Vérifiez votre adresse email
                  </h1>

                  <!-- Body -->
                  <p style="margin:0 0 32px;color:#555555;font-size:15px;font-family:Arial,sans-serif;line-height:1.6;text-align:center;">
                    Bonjour ${userName}, merci de vous être inscrit sur Palinso. Cliquez sur le bouton ci-dessous pour activer votre compte.
                  </p>

                  <!-- CTA Button -->
                  <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                    <tr>
                      <td align="center" style="background:#034C8C;border-radius:8px;">
                        <a href="${verificationUrl}" style="display:block;padding:16px 32px;color:#ffffff;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;text-decoration:none;text-align:center;">
                          Vérifier mon email
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Disclaimer -->
                  <p style="margin:0;color:#999999;font-size:13px;font-family:Arial,sans-serif;line-height:1.6;text-align:center;">
                    Ce lien expire dans 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre compte ne sera pas modifié.
                  </p>

                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;margin-top:36px;">
              <tr>
                <td align="center" style="padding:0 20px;">
                  <p style="margin:0 0 6px;color:#666666;font-size:13px;font-family:Arial,sans-serif;text-align:center;line-height:1.5;">
                    Votre solution de gestion intelligente, pensée pour les professionnels.
                  </p>
                  <p style="margin:0 0 12px;color:#888888;font-size:12px;font-family:Arial,sans-serif;text-align:center;">
                    palinso.app
                  </p>
                  <p style="margin:0;color:#aaaaaa;font-size:11px;font-family:Arial,sans-serif;text-align:center;">
                    © Palinso — Tous droits réservés
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: 'Palinso <hello@palinso.app>',
    to,
    subject: 'Vérifiez votre adresse email – Palinso',
    html,
  });

  if (error) {
    console.error('[emailService] sendVerificationEmail failed:', error);
    throw new Error(`Échec de l'envoi de l'email de vérification : ${error.message}`);
  }

  return { success: true };
}

async function sendPasswordResetEmail(to, token, tokenType = 'reset') {
  const resetUrl = `${process.env.BACKEND_URL}/api/auth/reset-password-page?token=${token}`;

  const isSet = tokenType === 'set';
  const subject = isSet
    ? 'Définir un mot de passe pour votre compte – Palinso'
    : 'Réinitialisation de votre mot de passe – Palinso';
  const heading = isSet
    ? 'Définir un mot de passe pour votre compte'
    : 'Réinitialisation de votre mot de passe';
  const body = isSet
    ? `Votre compte Palinso est associé à une connexion Google. Cliquez ci-dessous pour ajouter un mot de passe à votre compte.`
    : `Vous avez demandé à réinitialiser votre mot de passe Palinso. Cliquez sur le bouton ci-dessous pour en définir un nouveau.`;
  const buttonLabel = isSet ? 'Définir mon mot de passe' : 'Réinitialiser mon mot de passe';
  const subText = isSet
    ? `Ce lien expire dans 30 minutes.`
    : `Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#F2F1DF;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1DF;padding:32px 20px 40px;">
        <tr>
          <td align="center">

            <!-- Top nav -->
            <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;margin-bottom:20px;">
              <tr>
                <td style="padding:0 4px 12px;">
                  <p style="margin:0;color:#034C8C;font-size:20px;font-family:Georgia,serif;font-weight:bold;">Palinso</p>
                </td>
              </tr>
            </table>

            <!-- Card -->
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;max-width:560px;">
              <tr>
                <td align="center" style="padding:48px 48px 40px;">

                  <!-- Logo mark -->
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                    <tr>
                      <td align="center" valign="middle" style="width:52px;height:52px;background:#034C8C;border-radius:26px;text-align:center;">
                        <span style="color:#ffffff;font-size:22px;font-family:Georgia,serif;font-weight:bold;">P</span>
                      </td>
                    </tr>
                  </table>

                  <!-- Heading -->
                  <h1 style="margin:0 0 16px;font-size:26px;color:#1a1a1a;font-family:Georgia,serif;font-weight:bold;text-align:center;">
                    ${heading}
                  </h1>

                  <!-- Body -->
                  <p style="margin:0 0 32px;color:#555555;font-size:15px;font-family:Arial,sans-serif;line-height:1.6;text-align:center;">
                    ${body}
                  </p>

                  <!-- CTA Button -->
                  <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                    <tr>
                      <td align="center" style="background:#034C8C;border-radius:8px;">
                        <a href="${resetUrl}" style="display:block;padding:16px 32px;color:#ffffff;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;text-decoration:none;text-align:center;">
                          ${buttonLabel}
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Disclaimer -->
                  <p style="margin:0;color:#999999;font-size:13px;font-family:Arial,sans-serif;line-height:1.6;text-align:center;">
                    ${subText}
                  </p>

                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;margin-top:36px;">
              <tr>
                <td align="center" style="padding:0 20px;">
                  <p style="margin:0 0 6px;color:#666666;font-size:13px;font-family:Arial,sans-serif;text-align:center;line-height:1.5;">
                    Votre solution de gestion intelligente, pensée pour les professionnels.
                  </p>
                  <p style="margin:0 0 12px;color:#888888;font-size:12px;font-family:Arial,sans-serif;text-align:center;">
                    palinso.app
                  </p>
                  <p style="margin:0;color:#aaaaaa;font-size:11px;font-family:Arial,sans-serif;text-align:center;">
                    © Palinso — Tous droits réservés
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: 'Palinso <hello@palinso.app>',
    to,
    subject,
    html,
  });

  if (error) {
    console.error('[emailService] sendPasswordResetEmail failed:', error);
    throw new Error(`Échec de l'envoi de l'email de réinitialisation : ${error.message}`);
  }

  return { success: true };
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
