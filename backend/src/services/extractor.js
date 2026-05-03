const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

// Méthode 1 : le serveur va lui-même télécharger et lire la page
// Limitation : ne fonctionne pas sur les sites qui requièrent du JavaScript
async function extractFromUrl(url) {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  const dom = new JSDOM(response.data, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Impossible d'extraire le contenu de cette page.");
  }

  return {
    title: article.title || 'Sans titre',
    author: article.byline || 'Auteur inconnu',
    content: article.content,
    siteName: article.siteName || '',
  };
}

// Méthode 2 : l'extension envoie directement le HTML de la page
// C'est plus fiable car le navigateur a déjà rendu la page
function extractFromHtml(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Impossible d'extraire le contenu depuis le HTML fourni.");
  }

  return {
    title: article.title || 'Sans titre',
    author: article.byline || 'Auteur inconnu',
    content: article.content,
    siteName: article.siteName || '',
  };
}

module.exports = { extractFromUrl, extractFromHtml };