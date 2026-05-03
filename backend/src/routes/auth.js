/**
 * routes/auth.js — Authentification
 *
 * POST /api/auth/register         → créer un compte
 * POST /api/auth/login            → se connecter
 * POST /api/auth/change-password  → changer de mot de passe (authentifié)
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-CHANGE-IN-PROD';
const JWT_EXPIRES = '30d';

// ── POST /api/auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, kindleEmail } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  try {
    const existing = await db.get(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id             = uuidv4();

    await db.run(
      'INSERT INTO users (id, email, password, name, kindle_email) VALUES ($1, $2, $3, $4, $5)',
      [id, email.toLowerCase(), hashedPassword, name || null, kindleEmail || null]
    );

    const token = jwt.sign(
      { userId: id, email: email.toLowerCase() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      token,
      email:       email.toLowerCase(),
      name:        name || null,
      kindleEmail: kindleEmail || null,
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

    // Message identique pour éviter l'énumération d'emails
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      email:       user.email,
      name:        user.name        || null,
      kindleEmail: user.kindle_email || null,
    });

  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/auth/change-password ──────────────────────────────
router.post('/change-password', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

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
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const newHashed = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password = $1 WHERE id = $2',
      [newHashed, decoded.userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error('Erreur change-password:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;