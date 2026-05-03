require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Autorise les requêtes venant de l'extension Chrome et du navigateur en local
app.use(cors({
  origin: '*', // En production, restreindre cette valeur
}));

// Permet de lire le JSON envoyé dans les requêtes (5mb max pour les grandes pages)
app.use(express.json({ limit: '5mb' }));

// Connecte les routes
app.use('/api/articles', require('./routes/articles'));
app.use('/api/kindle', require('./routes/kindle'));

// Route de vérification : permet de savoir si le serveur tourne
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
});