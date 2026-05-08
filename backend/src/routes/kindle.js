/**
 * routes/kindle.js — Envoi au Kindle
 *
 * POST /api/kindle/send      → envoie un article par email au Kindle (Pro)
 * GET  /api/kindle/settings  → lit les réglages globaux Kindle
 * POST /api/kindle/settings  → sauvegarde l'adresse email Kindle globale
 *
 * Toutes les routes sont protégées par authMiddleware.
 * L'envoi au Kindle est réservé aux utilisateurs Pro (requirePro).
 */

const express        = require('express');
const router         = express.Router();
const db             = require('../db');
const { sendToKindle } = require('../services/mailer');
const fs             = require('fs');
const authMiddleware = require('../middleware/auth');
const requirePro     = require('../middleware/requirePro');

// ── POST /api/kindle/send ─────────────────────────────────────────
router.post('/send', authMiddleware, requirePro, async (req, res) => {
  const { articleId, kindleEmail } = req.body;

  if (!articleId || !kindleEmail) {
    return res.status(400).json({ error: 'articleId et kindleEmail sont requis' });
  }

  try {
    const article = await db.get(
      'SELECT * FROM articles WHERE id = $1 AND user_id = $2',
      [articleId, req.userId]
    );

    if (!article) {
      return res.status(404).json({ error: 'Article non trouvé' });
    }

    if (article.status !== 'done') {
      return res.status(400).json({ error: "L'article n'est pas encore prêt" });
    }

    if (!article.epub_path || !fs.existsSync(article.epub_path)) {
      return res.status(404).json({ error: 'Fichier EPUB introuvable' });
    }

    await sendToKindle(article.epub_path, kindleEmail, article.title);
    await db.run('UPDATE articles SET kindle_sent = 1 WHERE id = $1', [article.id]);
    res.json({ success: true, message: 'Envoyé au Kindle !' });
  } catch (err) {
    res.status(500).json({ error: `Échec de l'envoi : ${err.message}` });
  }
});

// ── GET /api/kindle/settings ──────────────────────────────────────
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const rows     = await db.all('SELECT key, value FROM settings');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/kindle/settings ─────────────────────────────────────
router.post('/settings', authMiddleware, async (req, res) => {
  const { kindleEmail } = req.body;
  if (!kindleEmail) {
    return res.status(400).json({ error: 'kindleEmail requis' });
  }

  try {
    await db.run(
      `INSERT INTO settings (key, value) VALUES ('kindle_email', $1)
       ON CONFLICT(key) DO UPDATE SET value = $2`,
      [kindleEmail, kindleEmail]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
