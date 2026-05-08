// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://palinso-production.up.railway.app/api';
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

  if (message.type === 'CAPTURE_HTML') {
    captureHtmlFromUrl(message.url)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

});

// ── Capture HTML depuis un onglet navigateur ──────────────────────
// Ouvre l'URL en arrière-plan, attend le chargement complet, puis
// envoie GET_PAGE_HTML au content script (Readability auto-injecté).
function captureHtmlFromUrl(url) {
  return new Promise((resolve, reject) => {
    // Reuse an existing tab with this URL to avoid opening a new one
    chrome.tabs.query({ url }, (existingTabs) => {
      if (existingTabs && existingTabs.length > 0) {
        const existingTab = existingTabs[0];
        chrome.tabs.sendMessage(existingTab.id, { type: 'GET_PAGE_HTML' }, (result) => {
          if (chrome.runtime.lastError || !result || !result.html) {
            // Existing tab didn't respond, fall back to opening a new tab
            captureHtmlViaNewTab(url, resolve, reject);
          } else {
            resolve({ html: result.html, title: result.title });
          }
        });
      } else {
        captureHtmlViaNewTab(url, resolve, reject);
      }
    });
  });
}

function captureHtmlViaNewTab(url, resolve, reject) {
  let tabId   = null;
  let settled = false;
  let timeoutId;

  function settle(value) {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
    if (value instanceof Error) reject(value);
    else resolve(value);
  }

  function onUpdated(updatedTabId, changeInfo) {
    if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_HTML' }, (result) => {
      if (chrome.runtime.lastError || !result) {
        settle({ html: null });
        return;
      }
      settle({ html: result.html, title: result.title });
    });
  }

  chrome.tabs.onUpdated.addListener(onUpdated);

  chrome.tabs.create({ url, active: false }, (tab) => {
    if (chrome.runtime.lastError) {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    tabId     = tab.id;
    timeoutId = setTimeout(() => settle(new Error("Délai d'attente dépassé (30s).")), 30000);
  });
}

// ── Détection paiement Stripe réussi ─────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('payment-success.html')) {
    chrome.runtime.sendMessage({ type: 'SUBSCRIPTION_UPDATED' }).catch(() => {});
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
    const body = await response.json().catch(() => null);
    if (body && body.error) return body;
    throw new Error(`Erreur serveur : ${response.status}`);
  }

  return response.json();
}