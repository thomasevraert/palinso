require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { runGlobalCleanup } = require('./services/cleanup');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/articles',     require('./routes/articles'));
app.use('/api/kindle',       require('./routes/kindle'));
app.use('/api/subscription', require('./routes/subscription'));

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Serveur KTool Clone opérationnel' });
});

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