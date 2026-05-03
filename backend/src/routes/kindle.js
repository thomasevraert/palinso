const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendToKindle } = require('../services/mailer');
const fs = require('fs');

// Envoyer un article au Kindle par email
router.post('/send', async (req, res) => {
  const { articleId, kindleEmail } = req.body;

  if (!articleId || !kindleEmail) {
    return res.status(400).json({ error: 'articleId et kindleEmail sont requis' });
  }

  const article = db.prepare(
    'SELECT * FROM articles WHERE id = ?'
  ).get(articleId);

  if (!article) {
    return res.status(404).json({ error: 'Article non trouvé' });
  }

  if (article.status !== 'done') {
    return res.status(400).json({ error: "L'article n'est pas encore prêt" });
  }

  if (!fs.existsSync(article.epub_path)) {
    return res.status(404).json({ error: 'Fichier EPUB introuvable' });
  }

  try {
    await sendToKindle(article.epub_path, kindleEmail, article.title);
    db.prepare('UPDATE articles SET kindle_sent = 1 WHERE id = ?').run(articleId);
    res.json({ success: true, message: 'Envoyé au Kindle !' });
  } catch (err) {
    res.status(500).json({ error: `Échec de l'envoi : ${err.message}` });
  }
});

// Lire les réglages (email Kindle sauvegardé)
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

// Sauvegarder l'adresse email Kindle
router.post('/settings', (req, res) => {
  const { kindleEmail } = req.body;
  if (!kindleEmail) {
    return res.status(400).json({ error: 'kindleEmail requis' });
  }

  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('kindle_email', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(kindleEmail);

  res.json({ success: true });
});

module.exports = router;