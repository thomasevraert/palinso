/**
 * routes/subscription.js
 *
 * GET  /api/subscription       → retourne l'abonnement effectif de l'utilisateur
 * POST /api/subscription       → met à jour l'abonnement (pour les futurs paiements)
 *
 * Logique trial :
 *   - À l'inscription : trial_end = NOW + 7 jours, plan = 'pro'
 *   - Si trial_end < NOW : le trial est expiré → on remet plan = 'free' en base
 *   - L'objet retourné contient toujours le plan EFFECTIF
 */

const express        = require('express');
const router         = express.Router();
const db             = require('../db');
const authMiddleware = require('../middleware/auth');
const { deleteExpiredArticlesForUser } = require('../services/cleanup');

// ── Helper : calcule l'abonnement effectif ────────────────────────
async function getEffectiveSubscription(userId) {
  const user = await db.get(
    'SELECT plan, billing, subscribed_at, trial_end FROM users WHERE id = $1',
    [userId]
  );

  if (!user) return null;

  const now      = new Date();
  const trialEnd = user.trial_end ? new Date(user.trial_end) : null;

  // Trial en cours
  if (trialEnd && trialEnd > now) {
    const msLeft   = trialEnd - now;
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return {
      plan:          'pro',
      billing:       'trial',
      subscribedAt:  null,
      trialEnd:      user.trial_end,
      isTrialActive: true,
      trialDaysLeft: daysLeft,
    };
  }

  // Trial expiré → downgrade automatique en base
  if (trialEnd && trialEnd <= now && user.plan === 'pro' && !user.subscribed_at) {
    await db.run(
      `UPDATE users SET plan = 'free', billing = NULL, trial_end = NULL WHERE id = $1`,
      [userId]
    );
    return {
      plan:          'free',
      billing:       null,
      subscribedAt:  null,
      trialEnd:      null,
      isTrialActive: false,
      trialDaysLeft: 0,
    };
  }

  // Abonnement payant actif
  return {
    plan:          user.plan          || 'free',
    billing:       user.billing       || null,
    subscribedAt:  user.subscribed_at || null,
    trialEnd:      null,
    isTrialActive: false,
    trialDaysLeft: 0,
  };
}

// ── GET /api/subscription ─────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sub = await getEffectiveSubscription(req.userId);
    if (!sub) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(sub);
  } catch (err) {
    console.error('Erreur GET subscription:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/subscription ────────────────────────────────────────
// Désactivée : le plan est mis à jour exclusivement via les webhooks Stripe
// (checkout.session.completed, customer.subscription.updated, customer.subscription.deleted).
// Laisser cette route ouverte permettrait à n'importe quel utilisateur authentifié
// de s'upgrader en Pro sans paiement.
router.post('/', authMiddleware, (req, res) => {
  res.status(403).json({
    error: 'Cette route est désactivée. Le plan est mis à jour automatiquement via Stripe.',
  });
});

module.exports = router;
module.exports.getEffectiveSubscription = getEffectiveSubscription;