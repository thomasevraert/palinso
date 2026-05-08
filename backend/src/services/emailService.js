const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(to, token, userName) {
  const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
              <tr>
                <td style="background:#1a1a2e;padding:32px 40px;">
                  <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">Palinso</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Vérifiez votre adresse email</h1>
                  <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                    Bonjour ${userName},
                  </p>
                  <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
                    Merci de vous être inscrit sur Palinso. Cliquez sur le bouton ci-dessous pour confirmer votre adresse email. Ce lien est valable <strong>24 heures</strong>.
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-radius:6px;background:#1a1a2e;">
                        <a href="${verificationUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">
                          Vérifier mon email
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                    <a href="${verificationUrl}" style="color:#1a1a2e;word-break:break-all;">${verificationUrl}</a>
                  </p>
                  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    Si vous n'avez pas créé de compte sur Palinso, ignorez cet email.
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
    from: process.env.RESEND_FROM_EMAIL,
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
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const isSet = tokenType === 'set';
  const subject = isSet
    ? 'Définir un mot de passe pour votre compte – Palinso'
    : 'Réinitialisation de votre mot de passe – Palinso';
  const heading = isSet ? 'Définir un mot de passe' : 'Réinitialisation de mot de passe';
  const body = isSet
    ? `Vous vous êtes connecté via Google. Cliquez ci-dessous pour ajouter un mot de passe à votre compte. Ce lien est valable <strong>30 minutes</strong>.`
    : `Nous avons reçu une demande de réinitialisation du mot de passe associé à votre compte. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>30 minutes</strong>.`;
  const buttonLabel = isSet ? 'Définir mon mot de passe' : 'Réinitialiser mon mot de passe';
  const footer = isSet
    ? `Si vous n'avez pas fait cette demande, ignorez cet email.`
    : `Si vous n'avez pas demandé de réinitialisation, ignorez cet email. Votre mot de passe ne sera pas modifié.`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
              <tr>
                <td style="background:#1a1a2e;padding:32px 40px;">
                  <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">Palinso</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">${heading}</h1>
                  <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
                    ${body}
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-radius:6px;background:#1a1a2e;">
                        <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">
                          ${buttonLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                    <a href="${resetUrl}" style="color:#1a1a2e;word-break:break-all;">${resetUrl}</a>
                  </p>
                  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    ${footer}
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
    from: process.env.RESEND_FROM_EMAIL,
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
