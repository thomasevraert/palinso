// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://TON-PROJET.up.railway.app/api';
// Pour dev local :
// const API_BASE = 'http://localhost:3000/api';

// ── Helper : requête avec token JWT ──────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const { token } = await chrome.storage.local.get('token');
  return fetch(API_BASE + endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...(options.headers || {}),
    },
  });
}

// ── Listener ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'SEND_ARTICLE') {
    sendArticle(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_ARTICLES') {
    apiFetch('/articles')
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    apiFetch('/kindle/settings')
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    apiFetch('/kindle/settings', {
      method: 'POST',
      body: JSON.stringify({ kindleEmail: message.kindleEmail }),
    })
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SEND_TO_KINDLE') {
    apiFetch('/kindle/send', {
      method: 'POST',
      body: JSON.stringify({
        articleId:   message.articleId,
        kindleEmail: message.kindleEmail,
      }),
    })
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

});

// ── Envoi article ─────────────────────────────────────────────────
async function sendArticle({ url, html, format = 'epub3', title = null, category = null, kindleEmail = null }) {
  const response = await apiFetch('/articles', {
    method: 'POST',
    body: JSON.stringify({ url, html, format, title, category, kindleEmail }),
  });

  if (response.status === 401 || response.status === 403) {
    return { error: 'SESSION_EXPIRED' };
  }

  if (!response.ok) {
    throw new Error(`Erreur serveur : ${response.status}`);
  }

  return response.json();
}