const API_BASE = 'http://localhost:3000/api';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'SEND_ARTICLE') {
    sendArticle(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_ARTICLES') {
    fetch(`${API_BASE}/articles`)
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    fetch(`${API_BASE}/kindle/settings`)
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    fetch(`${API_BASE}/kindle/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kindleEmail: message.kindleEmail }),
    })
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SEND_TO_KINDLE') {
    fetch(`${API_BASE}/kindle/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

async function sendArticle({ url, html, format = 'epub3', title = null, category = null }) {
  const response = await fetch(`${API_BASE}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, html, format, title, category }),
  });

  if (!response.ok) {
    throw new Error(`Erreur serveur : ${response.status}`);
  }

  return response.json();
}