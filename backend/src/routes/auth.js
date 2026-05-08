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
const rateLimit  = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db         = require('../db');
const { getEffectiveSubscription } = require('./subscription');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

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
      console.error('Erreur envoi email vérification:', emailErr);
    }

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
         auth_provider = CASE WHEN auth_provider = 'local' THEN 'both' ELSE auth_provider END
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
        `INSERT INTO users (id, email, google_id, first_name, plan, trial_end, auth_provider)
         VALUES ($1, $2, $3, $4, 'pro', $5, 'google')`,
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

// ── GET /api/auth/verify-email ───────────────────────────────────
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' });
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
      return res.status(400).json({ error: 'Lien invalide ou expiré' });
    }

    await db.run(
      'UPDATE users SET email_verified = TRUE WHERE id = $1',
      [record.user_id]
    );

    await db.run(
      'UPDATE email_verification_tokens SET used_at = $1 WHERE id = $2',
      [new Date().toISOString(), record.id]
    );

    return res.status(200).json({ success: true, message: 'Email vérifié avec succès' });

  } catch (err) {
    console.error('Erreur verify-email:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;