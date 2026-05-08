/**
 * middleware/auth.js — Vérification du token JWT
 *
 * À ajouter sur toutes les routes qui nécessitent d'être connecté.
 * Si le token est valide → ajoute req.userId et req.userEmail puis continue.
 * Sinon → répond 401 ou 403.
 */

const jwt        = require('jsonwebtoken');
const db         = require('../db');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-CHANGE-IN-PROD';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1]; // Format : "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Token manquant — connexion requise' });
  }

  try {
    const decoded  = jwt.verify(token, JWT_SECRET);
    req.userId     = decoded.userId;
    req.userEmail  = decoded.email;
    next();

    // Mise à jour last_active_at — non bloquant, max 1 fois/heure
    db.run(
      `UPDATE users SET last_active_at = NOW()
       WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '1 hour')`,
      [decoded.userId]
    ).catch(() => {});
  } catch {
    return res.status(403).json({ error: 'Token invalide ou expiré — reconnecte-toi' });
  }
};