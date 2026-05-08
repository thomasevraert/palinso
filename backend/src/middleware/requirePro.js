/**
 * middleware/requirePro.js
 *
 * Vérifie que l'utilisateur a accès aux fonctionnalités Pro.
 * Doit être chaîné après authMiddleware (req.userId requis).
 *
 * Accès Pro accordé si :
 *   1. subscription_status = 'active' ET current_period_end > maintenant
 *   2. trial_end > maintenant ET trial_used = false (trial non encore converti)
 * Sinon : 403 { error, code: 'PRO_REQUIRED' }
 *
 * Exports :
 *   module.exports          → middleware Express (route-level)
 *   module.exports.isPro    → async (userId) => boolean (pour usage inline dans les handlers)
 */

const db = require('../db');

async function isPro(userId) {
  const user = await db.get(
    `SELECT subscription_status, current_period_end, trial_end, trial_used
     FROM users WHERE id = $1`,
    [userId]
  );

  if (!user) return false;

  const now = new Date();

  const hasActiveSub =
    user.subscription_status === 'active' &&
    user.current_period_end &&
    new Date(user.current_period_end) > now;

  const hasActiveTrial =
    user.trial_end &&
    new Date(user.trial_end) > now &&
    !user.trial_used;

  return hasActiveSub || hasActiveTrial;
}

async function requirePro(req, res, next) {
  try {
    const pro = await isPro(req.userId);
    if (pro) return next();

    return res.status(403).json({
      error: 'Abonnement Pro requis',
      code:  'PRO_REQUIRED',
    });
  } catch (err) {
    console.error('Erreur requirePro:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports        = requirePro;
module.exports.isPro  = isPro;
