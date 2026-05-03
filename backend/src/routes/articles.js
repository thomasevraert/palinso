const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { extractFromUrl, extractFromHtml } = require('../services/extractor');
const { generateEpub }  = require('../services/epub');
const { execFile }      = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Conversion KEPUB ──────────────────────────────────────────────
// Robuste : scan du dossier après conversion pour trouver le fichier généré
function convertToKepub(epubPath) {
  return new Promise((resolve, reject) => {
    const dir  = path.dirname(epubPath);
    const base = path.basename(epubPath, '.epub');

    // Chemins possibles selon les versions de kepubify
    const candidats = [
      path.join(dir, `${base}.kepub.epub`),
      path.join(dir, `${base}_converted.kepub.epub`),
    ];

    // Déjà converti ?
    for (const c of candidats) {
      if (fs.existsSync(c)) return resolve(c);
    }

    // Snapshot du dossier AVANT conversion
    const avant = new Set(fs.readdirSync(dir));

    execFile('kepubify', ['-o', dir, epubPath], (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(
          `kepubify introuvable ou erreur de conversion.\n` +
          `Installe-le avec : brew install kepubify\n` +
          `Détail : ${err.message}`
        ));
      }

      // Cherche tout nouveau fichier .kepub.epub apparu dans le dossier
      const apres = fs.readdirSync(dir);
      const nouveau = apres.find(f =>
        !avant.has(f) && f.endsWith('.kepub.epub')
      );

      if (nouveau) return resolve(path.join(dir, nouveau));

      // Fallback : cherche n'importe quel .kepub.epub dans le dossier
      const existant = apres.find(f => f.endsWith('.kepub.epub'));
      if (existant) return resolve(path.join(dir, existant));

      reject(new Error(
        `Conversion terminée mais fichier KEPUB introuvable.\n` +
        `Vérifie que kepubify est bien installé : kepubify --version`
      ));
    });
  });
}

// ────────────────────────────────────────────────────────────────
// ROUTES STATIQUES (avant /:id)
// ────────────────────────────────────────────────────────────────

// DELETE /api/articles  — Suppression de tous les articles
router.delete('/', (req, res) => {
  const articles = db.prepare('SELECT epub_path FROM articles').all();

  // Supprime tous les fichiers sur disque
  for (const a of articles) {
    if (a.epub_path) {
      const base = a.epub_path.replace(/\.epub$/, '');
      [`${base}.epub`, `${base}.kepub.epub`].forEach(f => {
        if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
      });
    }
  }

  db.prepare('DELETE FROM articles').run();
  res.json({ success: true, deleted: articles.length });
});

// GET /api/articles/categories/list
router.get('/categories/list', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT category FROM articles
    WHERE category IS NOT NULL AND category != ''
    ORDER BY category ASC
  `).all();
  res.json(rows.map(r => r.category));
});

// ────────────────────────────────────────────────────────────────
// ROUTES COLLECTION
// ────────────────────────────────────────────────────────────────

// GET /api/articles
router.get('/', (req, res) => {
  const articles = db.prepare(`
    SELECT id, url, title, author, status, kindle_sent, created_at, error_message, category, format
    FROM articles
    ORDER BY created_at DESC
    LIMIT 100
  `).all();
  res.json(articles);
});

// POST /api/articles
router.post('/', async (req, res) => {
  const { url, html, format = 'epub3', title: customTitle, category, kindleEmail } = req.body;

  const VALID_FORMATS = ['epub3', 'kepub'];
  if (!url) return res.status(400).json({ error: 'URL requise' });
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: `Format invalide. Valeurs acceptées : ${VALID_FORMATS.join(', ')}` });
  }

  const id = uuidv4();

  // Insère immédiatement avec le titre et la catégorie fournis par l'utilisateur
  db.prepare(`
    INSERT INTO articles (id, url, status, format, title, category) VALUES (?, ?, 'processing', ?, ?, ?)
  `).run(id, url, format, customTitle || null, category || null);

  res.status(202).json({ id, status: 'processing' });

  try {
    const article    = html ? extractFromHtml(html, url) : await extractFromUrl(url);
    const finalTitle = customTitle || article.title;
    const epubPath   = await generateEpub({ ...article, title: finalTitle }, id);

    db.prepare(`
      UPDATE articles
      SET title = ?, author = ?, content_html = ?, epub_path = ?, status = 'done'
      WHERE id = ?
    `).run(finalTitle, article.author, article.content, epubPath, id);

    console.log(`✅ Article traité [${format}] : ${finalTitle}`);

    // Envoi automatique au Kindle si une adresse a été fournie
    if (kindleEmail) {
      try {
        const { sendToKindle } = require('../services/mailer');
        await sendToKindle(epubPath, kindleEmail, finalTitle);
        db.prepare('UPDATE articles SET kindle_sent = 1 WHERE id = ?').run(id);
        console.log(`📬 Envoyé au Kindle : ${kindleEmail}`);
      } catch (mailErr) {
        console.error(`⚠️ Génération OK mais envoi Kindle échoué : ${mailErr.message}`);
      }
    }

  } catch (err) {
    console.error(`❌ Erreur traitement article ${id} :`, err.message);
    db.prepare(`UPDATE articles SET status = 'error', error_message = ? WHERE id = ?`)
      .run(err.message, id);
  }
});

// ────────────────────────────────────────────────────────────────
// ROUTES DYNAMIQUES /:id
// ────────────────────────────────────────────────────────────────

// GET /api/articles/:id
router.get('/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article non trouvé' });
  res.json(article);
});

// GET /api/articles/:id/download?format=epub3|kepub
router.get('/:id/download', async (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

  if (!article) {
    return res.status(404).json({ error: 'Article non trouvé' });
  }
  if (article.status !== 'done') {
    return res.status(400).json({ error: "L'article n'est pas encore prêt (statut : " + article.status + ")" });
  }
  if (!article.epub_path) {
    return res.status(404).json({ error: 'Chemin du fichier absent en base de données' });
  }
  if (!fs.existsSync(article.epub_path)) {
    return res.status(404).json({
      error: `Fichier EPUB source introuvable sur le serveur.\nChemin attendu : ${article.epub_path}`
    });
  }

  // Le format demandé peut différer du format de l'article
  // Ex : article généré en KEPUB, téléchargé en EPUB3 → on sert le .epub source directement
  const formatDemande = req.query.format || article.format || 'epub3';

  try {
    let filePath, mimeType, ext;

    if (formatDemande === 'kepub') {
      filePath = await convertToKepub(article.epub_path);
      mimeType = 'application/epub+zip';
      ext      = 'kepub.epub';
    } else {
      // epub3 — on sert toujours le fichier .epub source, quel que soit le format d'origine
      filePath = article.epub_path;
      mimeType = 'application/epub+zip';
      ext      = 'epub';
    }

    const safeName = (article.title || 'article')
      .replace(/[^a-zA-Z0-9\s\-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    console.error(`❌ Erreur téléchargement article ${req.params.id} :`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id/epub  (rétrocompatibilité)
router.get('/:id/epub', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article non trouvé' });
  if (!article.epub_path || !fs.existsSync(article.epub_path)) {
    return res.status(404).json({ error: 'Fichier introuvable' });
  }
  res.setHeader('Content-Type', 'application/epub+zip');
  res.setHeader('Content-Disposition', `attachment; filename="article.epub"`);
  fs.createReadStream(article.epub_path).pipe(res);
});

// DELETE /api/articles/:id
router.delete('/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article non trouvé' });

  if (article.epub_path) {
    const base = article.epub_path.replace(/\.epub$/, '');
    [`${base}.epub`, `${base}.kepub.epub`].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
    });
  }

  db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST et PATCH /api/articles/:id/category
router.post('/:id/category', updateCategory);
router.patch('/:id/category', updateCategory);

function updateCategory(req, res) {
  const { category } = req.body;
  const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article non trouvé' });
  db.prepare('UPDATE articles SET category = ? WHERE id = ?').run(category || null, req.params.id);
  res.json({ success: true, category: category || null });
}

module.exports = router;