/**
 * routes/auth.js — Authentification
 *
 * POST /api/auth/register         → créer un compte (+ trial 7j automatique)
 * POST /api/auth/login            → se connecter
 * POST /api/auth/change-password  → changer de mot de passe
 */

const crypto     = require('crypto');
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const Stripe     = require('stripe');
const rateLimit  = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db             = require('../db');
const authMiddleware = require('../middleware/auth');
const { getEffectiveSubscription } = require('./subscription');
const { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes.' }),
});

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES = '30d';

// ── POST /api/auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, kindleEmail } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  }

  try {
    const existing = await db.get(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id             = uuidv4();

    // Trial Premium 7 jours automatique à l'inscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    await db.run(
      `INSERT INTO users (id, email, password, name, kindle_email, plan, trial_end)
       VALUES ($1, $2, $3, $4, $5, 'pro', $6)`,
      [id, email.toLowerCase(), hashedPassword, name || null, kindleEmail || null, trialEnd.toISOString()]
    );

    // Envoi email de vérification — non bloquant
    try {
      const rawVerifToken = crypto.randomBytes(32).toString('hex');
      const verifHash     = crypto.createHash('sha256').update(rawVerifToken).digest('hex');
      const verifExpires  = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), id, verifHash, verifExpires.toISOString()]
      );

      await sendVerificationEmail(email.toLowerCase(), rawVerifToken, name || email.toLowerCase());
   } catch (emailErr) {
  console.error('Erreur envoi email vérification:', emailErr.message);
}

    setTimeout(async () => {
      try {
        await sendWelcomeEmail(email.toLowerCase(), name || email.toLowerCase());
      } catch (err) {
        console.error('Erreur envoi welcome email:', err);
      }
    }, 15 * 60 * 1000);

    const token        = jwt.sign({ userId: id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const subscription = await getEffectiveSubscription(id);

    res.status(201).json({
      token,
      email:        email.toLowerCase(),
      name:         name         || null,
      kindleEmail:  kindleEmail  || null,
      subscription,
    });

  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    const user = await db.get(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (user.auth_provider === 'google' && !user.password) {
      return res.status(401).json({ error: 'Ce compte utilise la connexion Google. Connectez-vous via Google ou définissez un mot de passe.' });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token        = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const subscription = await getEffectiveSubscription(user.id);

    res.json({
      token,
      email:        user.email,
      name:         user.name         || null,
      kindleEmail:  user.kindle_email || null,
      subscription,
    });

  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/auth/change-password ───────────────────────────────
router.post('/change-password', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token manquant' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Token invalide ou expiré' });
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mots de passe requis' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (!user.password) {
      return res.status(400).json({ error: 'Aucun mot de passe défini sur ce compte. Utilisez la réinitialisation de mot de passe.' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const newHashed = await bcrypt.hash(newPassword, 12);
    await db.run('UPDATE users SET password = $1 WHERE id = $2', [newHashed, decoded.userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur change-password:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/auth/google ────────────────────────────────────────
router.post('/google', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    const googleRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`
    );
    if (!googleRes.ok) {
      return res.status(401).json({ error: 'Token Google invalide' });
    }

    const { sub: googleId, email: rawEmail, given_name: firstName } = await googleRes.json();
    const email = rawEmail.toLowerCase();

    let user = await db.get(
      'SELECT * FROM users WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );

    if (user && user.google_id === null) {
      await db.run(
        `UPDATE users SET google_id = $1, first_name = COALESCE(first_name, $2),
         auth_provider = CASE WHEN auth_provider = 'local' THEN 'both' ELSE auth_provider END,
         email_verified = TRUE
         WHERE id = $3`,
        [googleId, firstName, user.id]
      );
      user = await db.get('SELECT * FROM users WHERE id = $1', [user.id]);
    }

    if (!user) {
      const id = uuidv4();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

      await db.run(
        `INSERT INTO users (id, email, google_id, first_name, plan, trial_end, auth_provider, email_verified)
         VALUES ($1, $2, $3, $4, 'pro', $5, 'google', TRUE)`,
        [id, email, googleId, firstName, trialEnd.toISOString()]
      );
      user = await db.get('SELECT * FROM users WHERE id = $1', [id]);
    }

    const jwtToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token: jwtToken, email: user.email, firstName: user.first_name });

  } catch (err) {
    console.error('Erreur auth/google:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/auth/forgot-password ──────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  const GENERIC = { message: 'Si cet email existe, un lien a été envoyé.' };

  if (!email) {
    return res.status(400).json({ error: 'Email requis' });
  }

  try {
    const user = await db.get(
      'SELECT id, email, auth_provider FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      return res.status(200).json(GENERIC);
    }

    const provider   = user.auth_provider || 'local';
    const tokenType  = provider === 'google' ? 'set' : 'reset';
    const rawToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt  = new Date(Date.now() + 30 * 60 * 1000);

    await db.run(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, token_type, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), user.id, tokenHash, tokenType, expiresAt.toISOString()]
    );

    await sendPasswordResetEmail(user.email, rawToken, tokenType);

    return res.status(200).json(GENERIC);

  } catch (err) {
    console.error('Erreur forgot-password:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/auth/reset-password ───────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  }

  try {
    const tokenHash   = crypto.createHash('sha256').update(token).digest('hex');
    const now         = new Date().toISOString();

    const tokenRecord = await db.get(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1
         AND expires_at > $2
         AND used_at IS NULL`,
      [tokenHash, now]
    );

    if (!tokenRecord) {
      return res.status(400).json({ error: 'Lien invalide ou expiré' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db.run(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, tokenRecord.user_id]
    );

    if (tokenRecord.token_type === 'set') {
      await db.run(
        "UPDATE users SET auth_provider = 'both' WHERE id = $1",
        [tokenRecord.user_id]
      );
    }

    await db.run(
      'UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2',
      [new Date().toISOString(), tokenRecord.id]
    );

    const message = tokenRecord.token_type === 'set'
      ? 'Mot de passe défini avec succès'
      : 'Mot de passe mis à jour';

    return res.status(200).json({ success: true, message });

  } catch (err) {
    console.error('Erreur reset-password:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET /api/auth/reset-password-page ───────────────────────────
router.get('/reset-password-page', (req, res) => {
  const { token } = req.query;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Palinso – Nouveau mot de passe</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 40px 36px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 2px 4px rgba(26,58,92,0.06), 0 12px 32px rgba(26,58,92,0.10);
    }
    .card::before {
      content: '';
      display: block;
      height: 4px;
      background: linear-gradient(90deg, #1a3a5c, #2e6da4);
      border-radius: 4px 4px 0 0;
      margin: -40px -36px 32px;
      border-radius: 16px 16px 0 0;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #1a3a5c;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 14px;
      color: #6b7f90;
      margin-bottom: 28px;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #2e6da4;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .form-group { margin-bottom: 18px; }
    input {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid #dde4ea;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      color: #0d1f2d;
      background: #fafafa;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus {
      border-color: #1a3a5c;
      background: #fff;
      box-shadow: 0 0 0 3px rgba(26,58,92,0.08);
    }
    input::placeholder { color: #b0bec5; }
    .btn {
      width: 100%;
      padding: 13px;
      background: #1a3a5c;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      margin-top: 8px;
      transition: opacity 0.2s, transform 0.1s;
    }
    .btn:hover { opacity: 0.9; }
    .btn:active { transform: translateY(1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .msg {
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }
    .msg-error   { background: #fdf2f1; border: 1px solid #f0c5c1; color: #c0392b; }
    .msg-success { background: #f0f7f0; border: 1px solid #b8ddb8; color: #1d6b1d; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Nouveau mot de passe</h1>
    <p class="subtitle">Choisissez un mot de passe d'au moins 8 caractères.</p>

    <div id="msg-error"   class="msg msg-error"></div>
    <div id="msg-success" class="msg msg-success"></div>

    <form id="reset-form">
      <div class="form-group">
        <label>Nouveau mot de passe</label>
        <input type="password" id="new-password" placeholder="••••••••" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Confirmer le mot de passe</label>
        <input type="password" id="confirm-password" placeholder="••••••••" autocomplete="new-password" />
      </div>
      <button type="submit" class="btn" id="btn-submit">Définir le nouveau mot de passe</button>
    </form>
  </div>

  <script>
    const TOKEN = new URLSearchParams(window.location.search).get('token') || '';
    const API   = '/api/auth/reset-password';

    const form    = document.getElementById('reset-form');
    const btn     = document.getElementById('btn-submit');
    const errBox  = document.getElementById('msg-error');
    const okBox   = document.getElementById('msg-success');

    if (!TOKEN) {
      form.style.display   = 'none';
      errBox.textContent   = 'Lien invalide ou expiré. Veuillez faire une nouvelle demande.';
      errBox.style.display = 'block';
    }

    function showError(msg) {
      errBox.textContent   = msg;
      errBox.style.display = 'block';
      okBox.style.display  = 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';

      const newPassword     = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      if (newPassword.length < 8) {
        return showError('Le mot de passe doit faire au moins 8 caractères.');
      }
      if (newPassword !== confirmPassword) {
        return showError('Les deux mots de passe ne correspondent pas.');
      }

      btn.disabled    = true;
      btn.textContent = 'Enregistrement...';

      try {
        const res  = await fetch(API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token: TOKEN, newPassword }),
        });
        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Une erreur est survenue.');
          return;
        }

        form.style.display  = 'none';
        okBox.innerHTML     = '✅ Mot de passe mis à jour avec succès !<br>Vous pouvez retourner sur l\\'extension Palinso.<br>Fermeture automatique dans 3 secondes...';
        okBox.style.display = 'block';
        setTimeout(() => window.close(), 3000);

      } catch {
        showError('Impossible de joindre le serveur. Vérifiez votre connexion.');
      } finally {
        btn.disabled    = false;
        btn.textContent = 'Définir le nouveau mot de passe';
      }
    });
  </script>
</body>
</html>`;

  res.set('Content-Type', 'text/html').send(html);
});

// ── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Token invalide ou expiré' });
  }
  try {
    const user = await db.get(
      'SELECT email, name, email_verified, auth_provider FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({
      email:          user.email,
      name:           user.name          || null,
      email_verified: !!user.email_verified,
      auth_provider:  user.auth_provider || 'local',
    });
  } catch (err) {
    console.error('Erreur /me:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rate-limit mémoire pour resend-verification : 3 appels / heure / user
const resendAttempts = new Map();
function checkResendRateLimit(userId) {
  const now       = Date.now();
  const windowMs  = 60 * 60 * 1000;
  const attempts  = (resendAttempts.get(userId) || []).filter(t => now - t < windowMs);
  if (attempts.length >= 3) return false;
  resendAttempts.set(userId, [...attempts, now]);
  return true;
}

// ── POST /api/auth/resend-verification ───────────────────────────
router.post('/resend-verification', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Token invalide ou expiré' });
  }
  try {
    const user = await db.get(
      'SELECT id, email, name, email_verified FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.email_verified) return res.status(400).json({ error: 'Email déjà vérifié' });

    if (!checkResendRateLimit(user.id)) {
      return res.status(429).json({ error: 'Limite atteinte — réessayez dans une heure.' });
    }

    await db.run(
      'DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.run(
      `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), user.id, tokenHash, expiresAt.toISOString()]
    );

    await sendVerificationEmail(user.email, rawToken, user.name || user.email);
    res.json({ message: 'Email de vérification renvoyé' });
  } catch (err) {
    console.error('Erreur resend-verification:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET /api/auth/verify-email ───────────────────────────────────
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  const htmlError = (msg) => `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Vérification email</title></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;"><div style="text-align:center;padding:40px;">${msg}</div></body></html>`;

  if (!token) {
    return res.status(400).set('Content-Type', 'text/html').send(htmlError('❌ Lien invalide ou expiré.'));
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now       = new Date().toISOString();

    const record = await db.get(
      `SELECT * FROM email_verification_tokens
       WHERE token_hash = $1
         AND expires_at > $2
         AND used_at IS NULL`,
      [tokenHash, now]
    );

    if (!record) {
      return res.status(400).set('Content-Type', 'text/html').send(htmlError('❌ Lien invalide ou expiré.'));
    }

    await db.run(
      'UPDATE users SET email_verified = TRUE WHERE id = $1',
      [record.user_id]
    );

    await db.run(
      'UPDATE email_verification_tokens SET used_at = $1 WHERE id = $2',
      [new Date().toISOString(), record.id]
    );

    const htmlSuccess = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Vérification email</title></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;"><div style="text-align:center;padding:40px;"><p>✅ Email vérifié avec succès !</p><p>Cet onglet va se fermer automatiquement...</p></div><script>setTimeout(() => window.close(), 3000)</script></body></html>`;
    return res.status(200).set('Content-Type', 'text/html').send(htmlSuccess);

  } catch (err) {
    console.error('Erreur verify-email:', err);
    return res.status(500).set('Content-Type', 'text/html').send(htmlError('❌ Lien invalide ou expiré.'));
  }
});

// ── DELETE /api/auth/account ─────────────────────────────────────
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT stripe_subscription_id, subscription_status FROM users WHERE id = $1',
      [req.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    if (user.stripe_subscription_id && ['active', 'past_due'].includes(user.subscription_status)) {
      try {
        await stripe.subscriptions.cancel(user.stripe_subscription_id);
      } catch (stripeErr) {
        console.error('Erreur annulation Stripe (non bloquante):', stripeErr.message);
      }
    }

    await db.run('DELETE FROM email_verification_tokens WHERE user_id = $1', [req.userId]);
    await db.run('DELETE FROM password_reset_tokens WHERE user_id = $1', [req.userId]);
    await db.run('DELETE FROM article_quota_log WHERE user_id = $1', [req.userId]);
    await db.run('DELETE FROM articles WHERE user_id = $1', [req.userId]);
    await db.run('DELETE FROM users WHERE id = $1', [req.userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur delete account:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;