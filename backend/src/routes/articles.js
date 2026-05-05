const express       = require('express');
const router        = express.Router();
const { v4: uuidv4 } = require('uuid');
const db            = require('../db');
const { extractFromUrl, extractFromHtml } = require('../services/extractor');
const { generateEpub }  = require('../services/epub');
const { execFile }      = require('child_process');
const fs   = require('fs');
const path = require('path');

const authMiddleware = require('../middleware/auth');
const { getEffectiveSubscription } = require('./subscription');

const PLAN_LIMITS = {
  free:      5,
  essentiel: 20,
  premium:   null,
};

async function getMonthlyUsage(userId) {
  const now = new Date();
  const startOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const row = await db.get(
    `SELECT COUNT(*) as count FROM article_quota_log WHERE user_id = $1 AND created_at >= $2`,
    [userId, startOfMonth]
  );
  return parseInt(row.count || 0, 10);
}

// ── Conversion KEPUB ──────────────────────────────────────────────
function convertToKepub(epubPath) {
  return new Promise((resolve, reject) => {
    const dir  = path.dirname(epubPath);
    const base = path.basename(epubPath, '.epub');

    const candidats = [
      path.join(dir, `${base}.kepub.epub`),
      path.join(dir, `${base}_converted.kepub.epub`),
    ];

    for (const c of candidats) {
      if (fs.existsSync(c)) return resolve(c);
    }

    const avant = new Set(fs.readdirSync(dir));

    execFile('kepubify', ['-o', dir, epubPath], (err) => {
      if (err) {
        return reject(new Error(
          `kepubify introuvable ou erreur de conversion.\n` +
          `Installe-le avec : brew install kepubify\n` +
          `Détail : ${err.message}`
        ));
      }

      const apres   = fs.readdirSync(dir);
      const nouveau = apres.find(f => !avant.has(f) && f.endsWith('.kepub.epub'));

      if (nouveau) return resolve(path.join(dir, nouveau));

      const existant = apres.find(f => f.endsWith('.kepub.epub'));
      if (existant) return resolve(path.join(dir, existant));

      reject(new Error(`Conversion terminée mais fichier KEPUB introuvable.`));
    });
  });
}

// ────────────────────────────────────────────────────────────────
// ROUTES STATIQUES (avant /:id) — toutes protégées par authMiddleware
// ────────────────────────────────────────────────────────────────

// DELETE /api/articles  — Suppression de tous les articles de l'utilisateur
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const articles = await db.all(
      'SELECT epub_path FROM articles WHERE user_id = $1',
      [req.userId]
    );

    for (const a of articles) {
      if (a.epub_path) {
        const base = a.epub_path.replace(/\.epub$/, '');
        [`${base}.epub`, `${base}.kepub.epub`].forEach(f => {
          if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
        });
      }
    }

    await db.run('DELETE FROM articles WHERE user_id = $1', [req.userId]);
    res.json({ success: true, deleted: articles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles/extract — extraction du contenu sans création en base
router.post('/extract', authMiddleware, async (req, res) => {
  const { url, html } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requise' });
  try {
    const article = html ? extractFromHtml(html, url) : await extractFromUrl(url);
    res.json({
      title:        article.title,
      author:       article.author,
      siteName:     article.siteName,
      content_html: article.content,
    });
  } catch (err) {
    let message = err.message;
    if (err.response) {
      const s = err.response.status;
      if (s === 429) message = 'Ce site bloque les accès automatiques (limite de taux). Essayez depuis la page de l\'article directement dans votre navigateur.';
      else if (s === 403) message = 'Ce site interdit l\'accès externe (403). Essayez depuis la page de l\'article.';
      else if (s === 404) message = 'Page introuvable (404). Vérifiez que l\'URL est correcte.';
      else if (s >= 500)  message = `Le site a retourné une erreur serveur (${s}). Réessayez plus tard.`;
      else                message = `Le site a retourné une erreur ${s}.`;
    }
    res.status(500).json({ error: message });
  }
});

// GET /api/articles/quota
router.get('/quota', authMiddleware, async (req, res) => {
  try {
    const sub   = await getEffectiveSubscription(req.userId);
    const plan  = sub ? sub.plan : 'free';
    const limit = plan in PLAN_LIMITS ? PLAN_LIMITS[plan] : PLAN_LIMITS.free;
    const used  = await getMonthlyUsage(req.userId);

    const now = new Date();
    const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

    res.json({
      plan,
      limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      resetDate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/categories/list
router.get('/categories/list', authMiddleware, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT DISTINCT category FROM articles
       WHERE user_id = $1 AND category IS NOT NULL AND category != ''
       ORDER BY category ASC`,
      [req.userId]
    );
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// ROUTES COLLECTION
// ────────────────────────────────────────────────────────────────

// GET /api/articles
router.get('/', authMiddleware, async (req, res) => {
  try {
    const articles = await db.all(
      `SELECT id, url, title, author, status, kindle_sent, created_at, error_message, category, format
       FROM articles
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.userId]
    );
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles
router.post('/', authMiddleware, async (req, res) => {
  const { url, html, format = 'epub3', title: customTitle, category, kindleEmail, images = true } = req.body;

  const VALID_FORMATS = ['epub3', 'kepub'];
  if (!url) return res.status(400).json({ error: 'URL requise' });
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: `Format invalide. Valeurs acceptées : ${VALID_FORMATS.join(', ')}` });
  }

  // Vérification du quota mensuel
  try {
    const sub   = await getEffectiveSubscription(req.userId);
    const plan  = sub ? sub.plan : 'free';
    const limit = PLAN_LIMITS[plan];
    if (limit !== null) {
      const used = await getMonthlyUsage(req.userId);
      if (used >= limit) {
        return res.status(429).json({
          error: 'QUOTA_EXCEEDED',
          quota: { plan, limit, used, remaining: 0 },
        });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors de la vérification du quota' });
  }

  const id = uuidv4();

  try {
    await db.run(
      `INSERT INTO articles (id, user_id, url, status, format, title, category) VALUES ($1, $2, $3, 'processing', $4, $5, $6)`,
      [id, req.userId, url, format, customTitle || null, category || null]
    );
    await db.run(
      `INSERT INTO article_quota_log (id, user_id) VALUES ($1, $2)`,
      [id, req.userId]
    );
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors de la création' });
  }

  res.status(202).json({ id, status: 'processing' });

  try {
    const article    = html ? extractFromHtml(html, url) : await extractFromUrl(url);
    const finalTitle = customTitle || article.title;

    let content = article.content;
    if (images === false) {
      content = content
        .replace(/<img[^>]*\/?>/gi, '')
        .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');
    }

    const epubPath = await generateEpub({ ...article, content, title: finalTitle }, id);

    await db.run(
      `UPDATE articles SET title = $1, author = $2, content_html = $3, epub_path = $4, status = 'done' WHERE id = $5`,
      [finalTitle, article.author, content, epubPath, id]
    );

    console.log(`✅ Article traité [${format}] : ${finalTitle}`);

    if (kindleEmail) {
      try {
        const { sendToKindle } = require('../services/mailer');
        await sendToKindle(epubPath, kindleEmail, finalTitle);
        await db.run('UPDATE articles SET kindle_sent = 1 WHERE id = $1', [id]);
        console.log(`📬 Envoyé au Kindle : ${kindleEmail}`);
      } catch (mailErr) {
        console.error(`⚠️ Génération OK mais envoi Kindle échoué : ${mailErr.message}`);
      }
    }

  } catch (err) {
    console.error(`❌ Erreur traitement article ${id} :`, err.message);
    await db.run(
      `UPDATE articles SET status = 'error', error_message = $1 WHERE id = $2`,
      [err.message, id]
    );
  }
});

// ────────────────────────────────────────────────────────────────
// ROUTES DYNAMIQUES /:id — toutes protégées + filtrées par user_id
// ────────────────────────────────────────────────────────────────

// GET /api/articles/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const article = await db.get(
      'SELECT * FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id/download?format=epub3|kepub
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const article = await db.get(
      'SELECT * FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (!article) return res.status(404).json({ error: 'Article non trouvé' });
    if (article.status !== 'done') {
      return res.status(400).json({ error: "L'article n'est pas encore prêt (statut : " + article.status + ")" });
    }
    if (!article.epub_path || !fs.existsSync(article.epub_path)) {
      return res.status(404).json({ error: 'Fichier EPUB introuvable sur le serveur' });
    }

    const formatDemande = req.query.format || article.format || 'epub3';

    let filePath, ext;

    if (formatDemande === 'kepub') {
      filePath = await convertToKepub(article.epub_path);
      ext      = 'kepub.epub';
    } else {
      filePath = article.epub_path;
      ext      = 'epub';
    }

    const safeName = (article.title || 'article')
      .replace(/[^a-zA-Z0-9\s\-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);

    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    console.error(`❌ Erreur téléchargement article ${req.params.id} :`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id/epub  (rétrocompatibilité)
router.get('/:id/epub', authMiddleware, async (req, res) => {
  try {
    const article = await db.get(
      'SELECT * FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });
    if (!article.epub_path || !fs.existsSync(article.epub_path)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    res.setHeader('Content-Type', 'application/epub+zip');
    res.setHeader('Content-Disposition', `attachment; filename="article.epub"`);
    fs.createReadStream(article.epub_path).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/articles/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const article = await db.get(
      'SELECT * FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    if (article.epub_path) {
      const base = article.epub_path.replace(/\.epub$/, '');
      [`${base}.epub`, `${base}.kepub.epub`].forEach(f => {
        if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
      });
    }

    await db.run(
      'DELETE FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST et PATCH /api/articles/:id/category
router.post('/:id/category',  authMiddleware, updateCategory);
router.patch('/:id/category', authMiddleware, updateCategory);

async function updateCategory(req, res) {
  const { category } = req.body;
  try {
    const article = await db.get(
      'SELECT id FROM articles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    await db.run(
      'UPDATE articles SET category = $1 WHERE id = $2',
      [category || null, req.params.id]
    );
    res.json({ success: true, category: category || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = router;