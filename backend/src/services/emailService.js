const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(to, token, userName) {
  const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#F2F1DF;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1DF;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
              <tr>
                <td style="background:#034C8C;padding:24px 40px;">
                  <p style="margin:0;color:#ffffff;font-size:24px;font-family:Georgia,serif;">Palinso</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <h1 style="margin:0 0 24px;font-size:22px;color:#034C8C;font-family:Georgia,serif;">Vérifiez votre adresse email</h1>
                  <p style="margin:0 0 24px;color:#333333;font-size:16px;font-family:Arial,sans-serif;line-height:1.6;">
                    Bonjour ${userName}, merci de vous être inscrit sur Palinso. Cliquez sur le bouton ci-dessous pour activer votre compte.
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-radius:6px;background:#034C8C;">
                        <a href="${verificationUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;text-decoration:none;border-radius:6px;">
                          Vérifier mon email
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;color:#5A7E8C;font-size:13px;font-family:Arial,sans-serif;line-height:1.6;">
                    Ce lien expire dans 24 heures.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 40px 24px;text-align:center;">
                  <p style="margin:0;color:#5A7E8C;font-size:12px;font-family:Arial,sans-serif;">© Palinso — palinso.app</p>
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
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1DF;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
              <tr>
                <td style="background:#034C8C;padding:24px 40px;">
                  <p style="margin:0;color:#ffffff;font-size:24px;font-family:Georgia,serif;">Palinso</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <h1 style="margin:0 0 24px;font-size:22px;color:#034C8C;font-family:Georgia,serif;">${heading}</h1>
                  <p style="margin:0 0 24px;color:#333333;font-size:16px;font-family:Arial,sans-serif;line-height:1.6;">
                    ${body}
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-radius:6px;background:#034C8C;">
                        <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;text-decoration:none;border-radius:6px;">
                          ${buttonLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;color:#5A7E8C;font-size:13px;font-family:Arial,sans-serif;line-height:1.6;">
                    ${subText}
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 40px 24px;text-align:center;">
                  <p style="margin:0;color:#5A7E8C;font-size:12px;font-family:Arial,sans-serif;">© Palinso — palinso.app</p>
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
