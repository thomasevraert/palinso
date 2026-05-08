/**
 * routes/stripe.js — Paiements Stripe
 *
 * Routes protégées par JWT (enregistrées via app.use('/api/stripe', router)) :
 *   POST /api/stripe/create-checkout-session  → génère une URL de paiement Checkout
 *   POST /api/stripe/create-portal-session    → génère une URL Customer Portal
 *   GET  /api/stripe/status                   → statut d'abonnement de l'utilisateur connecté
 *
 * Route sans JWT, body brut (enregistrée directement dans index.js avant express.json()) :
 *   POST /api/stripe/webhook                  → reçoit et traite les événements Stripe
 *
 * Le plan en base est mis à jour EXCLUSIVEMENT via les webhooks Stripe.
 */

const express        = require('express');
const router         = express.Router();
const Stripe         = require('stripe');
const db             = require('../db');
const authMiddleware = require('../middleware/auth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual:  process.env.STRIPE_PRICE_ANNUAL,
};

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

function getBillingFromPriceId(priceId) {
  if (priceId === PRICE_IDS.monthly) return 'monthly';
  if (priceId === PRICE_IDS.annual)  return 'annual';
  return 'monthly';
}

// ── POST /api/stripe/create-checkout-session ─────────────────────
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  const { plan } = req.body;

  if (!['monthly', 'annual'].includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide. Valeurs acceptées : monthly, annual' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId || priceId.startsWith('price_REMPLACER')) {
    return res.status(500).json({ error: 'Prix Stripe non configuré — ajoute STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL dans les variables d\'environnement' });
  }

  try {
    const user = await db.get(
      'SELECT id, email, name, stripe_customer_id FROM users WHERE id = $1',
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db.run(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, user.id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer:                  customerId,
      mode:                      'subscription',
      line_items:                [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'if_required',
      success_url:               `${BACKEND_URL}/payment-success.html`,
      cancel_url:                `${BACKEND_URL}/payment-cancel.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur create-checkout-session:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/stripe/create-portal-session ───────────────────────
router.post('/create-portal-session', authMiddleware, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun abonnement Stripe associé à ce compte' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: `${BACKEND_URL}/payment-success.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur create-portal-session:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET /api/stripe/status ────────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = await db.get(
      `SELECT plan, subscription_status, current_period_end, cancel_at_period_end, trial_end
       FROM users WHERE id = $1`,
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    res.json({
      plan:                 user.plan                 || 'free',
      subscription_status:  user.subscription_status  || 'free',
      current_period_end:   user.current_period_end   || null,
      cancel_at_period_end: user.cancel_at_period_end || false,
      trial_end_date:       user.trial_end             || null,
    });
  } catch (err) {
    console.error('Erreur GET stripe/status:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/stripe/webhook ──────────────────────────────────────
// Enregistré dans index.js avec express.raw() AVANT express.json().
// Pas de middleware JWT : l'authenticité est garantie par la signature Stripe.
async function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  console.log('[Webhook] Content-Type:', req.headers['content-type']);
  console.log('[Webhook] body type:', typeof req.body, Buffer.isBuffer(req.body) ? `Buffer(${req.body.length})` : 'NOT a Buffer');
  console.log('[Webhook] secret prefix:', process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 10));

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Erreur signature webhook Stripe:', err.message);
    return res.status(400).json({ error: `Signature invalide : ${err.message}` });
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        if (!session.subscription) break; // paiement one-time, ignoré

        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId      = subscription.items.data[0].price.id;
        const billing      = getBillingFromPriceId(priceId);
        const periodEnd    = new Date(subscription.current_period_end * 1000).toISOString();
        const now          = new Date().toISOString();

        await db.run(
          `UPDATE users SET
             stripe_subscription_id = $1,
             plan                   = 'pro',
             billing                = $2,
             subscription_status    = 'active',
             current_period_end     = $3,
             subscribed_at          = COALESCE(subscribed_at, $4),
             trial_used             = true,
             trial_end              = NULL
           WHERE stripe_customer_id = $5`,
          [subscription.id, billing, periodEnd, now, session.customer]
        );
        console.log(`✅ Webhook checkout.session.completed — customer: ${session.customer}`);
        break;
      }

      case 'invoice.paid': {
        const invoice   = event.data.object;
        const periodRaw = invoice.lines?.data?.[0]?.period?.end;
        const periodEnd = periodRaw ? new Date(periodRaw * 1000).toISOString() : null;

        await db.run(
          `UPDATE users SET
             subscription_status = 'active',
             current_period_end  = COALESCE($1, current_period_end)
           WHERE stripe_customer_id = $2`,
          [periodEnd, invoice.customer]
        );
        console.log(`✅ Webhook invoice.paid — customer: ${invoice.customer}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await db.run(
          `UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
        console.warn(`⚠️ Webhook invoice.payment_failed — customer: ${invoice.customer}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub       = event.data.object;
        const priceId   = sub.items.data[0].price.id;
        const billing   = getBillingFromPriceId(priceId);
        const plan      = ['active', 'trialing'].includes(sub.status) ? 'pro' : 'free';
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        await db.run(
          `UPDATE users SET
             plan                 = $1,
             billing              = $2,
             subscription_status  = $3,
             current_period_end   = $4,
             cancel_at_period_end = $5
           WHERE stripe_customer_id = $6`,
          [plan, billing, sub.status, periodEnd, sub.cancel_at_period_end, sub.customer]
        );
        console.log(`✅ Webhook customer.subscription.updated — customer: ${sub.customer}, status: ${sub.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db.run(
          `UPDATE users SET
             subscription_status    = 'canceled',
             plan                   = 'free',
             billing                = NULL,
             stripe_subscription_id = NULL,
             cancel_at_period_end   = false
           WHERE stripe_customer_id = $1`,
          [sub.customer]
        );
        console.log(`✅ Webhook customer.subscription.deleted — customer: ${sub.customer}`);
        break;
      }

      default:
        // Événement non géré, ignoré intentionnellement
        break;
    }
  } catch (err) {
    console.error(`Erreur traitement webhook ${event.type}:`, err);
    return res.status(500).json({ error: 'Erreur traitement webhook' });
  }

  res.json({ received: true });
}

module.exports                = router;
module.exports.webhookHandler = webhookHandler;
