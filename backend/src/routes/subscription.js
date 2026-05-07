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
// Pour les futurs paiements — met à jour le plan en base
router.post('/', authMiddleware, async (req, res) => {
  const { plan, billing } = req.body;

  const VALID_PLANS    = ['free', 'pro'];
  const VALID_BILLINGS = ['monthly', 'annual', null];

  if (!VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: `Plan invalide. Valeurs : ${VALID_PLANS.join(', ')}` });
  }

  if (billing !== undefined && !VALID_BILLINGS.includes(billing)) {
    return res.status(400).json({ error: `Billing invalide. Valeurs : monthly, annual` });
  }

  try {
    const isPaid       = plan !== 'free';
    const subscribedAt = isPaid ? new Date().toISOString() : null;
    const billingValue = isPaid ? (billing || 'monthly') : null;

    await db.run(
      `UPDATE users SET plan = $1, billing = $2, subscribed_at = $3, trial_end = NULL WHERE id = $4`,
      [plan, billingValue, subscribedAt, req.userId]
    );

    // Downgrade vers free : supprimer les articles de plus de 7 jours immédiatement
    if (plan === 'free') {
      await deleteExpiredArticlesForUser(req.userId, 'free');
    }

    const sub = await getEffectiveSubscription(req.userId);
    res.json(sub);
  } catch (err) {
    console.error('Erreur POST subscription:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.getEffectiveSubscription = getEffectiveSubscription;