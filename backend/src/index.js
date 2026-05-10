require('dotenv').config();
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
});

const express = require('express');
const cors    = require('cors');
const { runGlobalCleanup } = require('./services/cleanup');

const path = require('path');

const app = express();

// Webhook Stripe : doit recevoir le corps brut (Buffer), enregistré AVANT express.json()
// express.json() consommerait le stream et la vérification de signature échouerait
const { webhookHandler } = require('./routes/stripe');
const emailInboundHandler = require('./routes/email-inbound');

app.post('/api/stripe/webhook', express.raw({ type: '*/*' }), webhookHandler);
app.use('/api/webhooks/email-inbound', emailInboundHandler);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/articles',     require('./routes/articles'));
app.use('/api/kindle',       require('./routes/kindle'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/stripe',       require('./routes/stripe'));

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Serveur KTool Clone opérationnel' });
});

Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ✅ Serveur démarré !
  → http://localhost:${PORT}
  → Test : http://localhost:${PORT}/health
  `);

  // Nettoyage des articles expirés : au démarrage puis toutes les 6 heures
  runGlobalCleanup();
  setInterval(runGlobalCleanup, 6 * 60 * 60 * 1000);
});