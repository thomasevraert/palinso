const db         = require('../db');
const fs         = require('fs');
const { isPro }  = require('../middleware/requirePro');

// Durée de rétention en jours par plan
const RETENTION_DAYS = {
  free: 7,
  pro:  365,
};

function getThreshold(plan) {
  const days = RETENTION_DAYS[plan] ?? RETENTION_DAYS.free;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function removeEpubFiles(epubPath) {
  if (!epubPath) return;
  const base = epubPath.replace(/\.epub$/, '');
  [`${base}.epub`, `${base}.kepub.epub`].forEach(f => {
    if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch {}
  });
}

// Supprime les articles expirés d'un utilisateur donné selon son plan actuel.
// Appelé immédiatement lors d'un downgrade vers free.
async function deleteExpiredArticlesForUser(userId, plan) {
  const threshold = getThreshold(plan);
  const articles  = await db.all(
    `SELECT id, epub_path FROM articles WHERE user_id = $1 AND created_at < $2`,
    [userId, threshold]
  );

  for (const a of articles) removeEpubFiles(a.epub_path);

  if (articles.length > 0) {
    await db.run(
      `DELETE FROM articles WHERE user_id = $1 AND created_at < $2`,
      [userId, threshold]
    );
    console.log(`🗑 Expiration : ${articles.length} article(s) supprimé(s) pour ${userId} (plan: ${plan})`);
  }

  return articles.length;
}

// Parcourt tous les utilisateurs et supprime leurs articles expirés.
// Appelé au démarrage du serveur et toutes les 6 heures.
async function runGlobalCleanup() {
  try {
    const users = await db.all(`SELECT id FROM users`);
    let total   = 0;

    for (const user of users) {
      const pro  = await isPro(user.id);
      const plan = pro ? 'pro' : 'free';
      total += await deleteExpiredArticlesForUser(user.id, plan);
    }

    if (total > 0) console.log(`🧹 Cleanup global : ${total} article(s) supprimé(s) au total`);

    const processingTimeout = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: stuckCount } = await db.get(
      `SELECT COUNT(*) AS count FROM articles WHERE status = 'processing' AND created_at < $1`,
      [processingTimeout]
    ) ?? { count: 0 };
    if (stuckCount > 0) {
      await db.run(
        `UPDATE articles SET status = 'error', error_message = 'Traitement interrompu (timeout serveur)' WHERE status = 'processing' AND created_at < $1`,
        [processingTimeout]
      );
      console.log(`⏱ Cleanup processing : ${stuckCount} article(s) bloqué(s) repassé(s) en erreur`);
    }
  } catch (err) {
    console.error('Erreur cleanup global :', err.message);
  }
}

module.exports = { deleteExpiredArticlesForUser, runGlobalCleanup };
