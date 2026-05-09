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

async function sendWelcomeEmail(to, userName) {
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#F2F1DF;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1DF;padding:32px 20px 40px;">
        <tr>
          <td align="center">

            <!-- Card -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;max-width:600px;border-radius:8px;">

              <!-- Header -->
              <tr>
                <td style="background:#034C8C;padding:32px 40px;border-radius:8px 8px 0 0;">
                  <p style="margin:0 0 4px;color:#ffffff;font-size:26px;font-family:Georgia,serif;font-style:italic;">Palinso</p>
                  <p style="margin:0;color:#819FA6;font-size:13px;font-family:Arial,sans-serif;">Lisez le web sur votre liseuse</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:40px;">

                  <!-- Greeting -->
                  <p style="margin:0 0 8px;font-size:16px;color:#1a1a1a;font-family:Arial,sans-serif;">Bonjour ${userName},</p>
                  <p style="margin:0 0 32px;font-size:15px;color:#555555;font-family:Arial,sans-serif;line-height:1.6;">Bienvenue sur Palinso — votre essai Pro de 7 jours commence maintenant.</p>

                  <!-- Comment ça marche -->
                  <h2 style="margin:0 0 16px;font-size:18px;color:#034C8C;font-family:Georgia,serif;">Comment ça marche</h2>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                    <tr>
                      <td align="center" valign="top" style="padding:0 8px 0 0;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#034C8C;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.05em;">Étape 1</p>
                        <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:#1a1a1a;font-family:Arial,sans-serif;">Trouvez un article</p>
                        <p style="margin:0;font-size:13px;color:#555555;font-family:Arial,sans-serif;line-height:1.5;">sur Medium, Substack, la presse...</p>
                      </td>
                      <td align="center" valign="middle" style="padding:0 8px;font-size:20px;color:#A68A56;font-family:Arial,sans-serif;white-space:nowrap;">→</td>
                      <td align="center" valign="top" style="padding:0 8px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#034C8C;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.05em;">Étape 2</p>
                        <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:#1a1a1a;font-family:Arial,sans-serif;">Cliquez sur Palinso</p>
                        <p style="margin:0;font-size:13px;color:#555555;font-family:Arial,sans-serif;line-height:1.5;">choisissez EPUB, KEPUB ou Kindle</p>
                      </td>
                      <td align="center" valign="middle" style="padding:0 8px;font-size:20px;color:#A68A56;font-family:Arial,sans-serif;white-space:nowrap;">→</td>
                      <td align="center" valign="top" style="padding:0 0 0 8px;">
                        <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#034C8C;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.05em;">Étape 3</p>
                        <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:#1a1a1a;font-family:Arial,sans-serif;">Lisez sur votre liseuse</p>
                        <p style="margin:0;font-size:13px;color:#555555;font-family:Arial,sans-serif;line-height:1.5;">le fichier est prêt en quelques secondes</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Ce que vous pouvez faire -->
                  <h2 style="margin:0 0 12px;font-size:18px;color:#034C8C;font-family:Georgia,serif;">Ce que vous pouvez faire</h2>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                    <tr><td style="padding:5px 0;font-size:14px;color:#1a1a1a;font-family:Arial,sans-serif;">&#10003; Conversions illimitées pendant 7 jours</td></tr>
                    <tr><td style="padding:5px 0;font-size:14px;color:#1a1a1a;font-family:Arial,sans-serif;">&#10003; EPUB3, KEPUB et envoi direct Kindle</td></tr>
                    <tr><td style="padding:5px 0;font-size:14px;color:#1a1a1a;font-family:Arial,sans-serif;">&#10003; Stockage de vos articles convertis</td></tr>
                    <tr><td style="padding:5px 0;font-size:14px;color:#1a1a1a;font-family:Arial,sans-serif;">&#10003; Dashboard pour retrouver vos fichiers</td></tr>
                  </table>

                  <!-- Comparatif des offres -->
                  <h2 style="margin:0 0 16px;font-size:18px;color:#034C8C;font-family:Georgia,serif;">Nos offres</h2>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                    <tr>
                      <td width="48%" valign="top" style="background:#F2F1DF;border:1px solid #E8E6CE;border-radius:8px;padding:20px;">
                        <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#034C8C;font-family:Georgia,serif;">Gratuit — 0€/mois</p>
                        <p style="margin:0 0 6px;font-size:13px;color:#555555;font-family:Arial,sans-serif;">3 conversions / mois</p>
                        <p style="margin:0 0 6px;font-size:13px;color:#555555;font-family:Arial,sans-serif;">Formats EPUB3, KEPUB, Kindle</p>
                        <p style="margin:0;font-size:13px;color:#555555;font-family:Arial,sans-serif;">Stockage 7 jours</p>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" valign="top" style="background:#034C8C;border-radius:8px;padding:20px;">
                        <p style="margin:0 0 4px;font-size:15px;font-weight:bold;color:#ffffff;font-family:Georgia,serif;">Pro — 4,99€/mois</p>
                        <p style="margin:0 0 12px;font-size:12px;color:#819FA6;font-family:Arial,sans-serif;">ou 3,99€/mois (annuel)</p>
                        <p style="margin:0 0 6px;font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">Conversions illimitées</p>
                        <p style="margin:0 0 6px;font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">Tous formats simultanés</p>
                        <p style="margin:0 0 6px;font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">Stockage 1 an</p>
                        <p style="margin:0 0 6px;font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">Envoi Kindle automatique</p>
                        <p style="margin:0;font-size:13px;color:#ffffff;font-family:Arial,sans-serif;">Support prioritaire</p>
                      </td>
                    </tr>
                  </table>

                  <!-- CTA -->
                  <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
                    <tr>
                      <td align="center" style="background:#A68A56;border-radius:8px;">
                        <a href="https://palinso.app/#tarifs" style="display:block;padding:16px 32px;color:#ffffff;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;text-decoration:none;text-align:center;">
                          Découvrir l'offre Pro →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Closing -->
                  <p style="margin:0 0 8px;font-size:14px;color:#555555;font-family:Arial,sans-serif;">Des questions ? Répondez directement à cet email.</p>
                  <p style="margin:0;font-size:14px;color:#555555;font-family:Arial,sans-serif;">— Thomas de Palinso</p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="padding:24px 40px;border-top:1px solid #F2F1DF;">
                  <p style="margin:0;color:#5A7E8C;font-size:12px;font-family:Arial,sans-serif;text-align:center;">© Palinso — palinso.app</p>
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
    from: 'Thomas de Palinso <hello@palinso.app>',
    to,
    subject: 'Bienvenue sur Palinso — votre essai Pro commence maintenant',
    html,
  });

  if (error) {
    console.error('[emailService] sendWelcomeEmail failed:', error);
    throw new Error(`Échec de l'envoi du welcome email : ${error.message}`);
  }

  return { success: true };
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail };
