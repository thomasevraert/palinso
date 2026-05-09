function findBestArticleEl() {
  const candidates = document.querySelectorAll('div, section, article');
  let bestEl = null;
  let bestScore = 0;

  candidates.forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (['nav', 'header', 'footer', 'aside'].includes(tag)) return;
    if (el.querySelector('nav, header, footer')) return;

    const textLength = (el.innerText || '').length;
    if (textLength < 500) return;

    const descendants = el.querySelectorAll('*').length || 1;
    const score = textLength / descendants;

    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  });

  return bestEl;
}

function extractHTML() {
  const documentClone = document.cloneNode(true);

  [
    'aside', 'nav', 'header', 'footer',
    '[class*="donate"]', '[class*="donation"]',
    '[class*="newsletter"]', '[class*="subscribe"]',
    '[class*="paywall"]', '[class*="banner"]',
    '[class*="sidebar"]', '[class*="related"]',
    '[class*="cookie"]', '[class*="ad-"]', '[class*="-ad"]',
    '[class*="social"]', '[class*="share"]',
    '[id*="paywall"]', '[id*="overlay"]', '[id*="subscribe"]',
    '[id*="subscription"]', '[id*="gate"]', '[id*="modal"]', '[id*="wall"]',
    '[class*="overlay"]', '[class*="gate"]', '[class*="modal"]',
    '[class*="popup"]', '[class*="metered"]', '[class*="wall"]',
    '.tp-backdrop', '.tp-modal', '.tp-container',
    '[class*="piano"]'
  ].forEach(selector => {
    documentClone.querySelectorAll(selector).forEach(el => el.remove());
  });

  const reader = new Readability(documentClone);
  const article = reader.parse();

  const totalTextLength = document.body.innerText.length;

  // Fallback si Readability retourne moins de 30% du texte total
  if (!article || article.content.length < totalTextLength * 0.3) {
    const bestEl = findBestArticleEl();
    if (bestEl) {
      return {
        html: bestEl.innerHTML,
        title: document.querySelector('h1')?.innerText || document.title,
        partial: true,
      };
    }
  }

  if (!article || article.content.length < 500) return null;

  const extracted = {
    html: article.content,
    title: article.title,
  };
  if (article.content.length < 1000) extracted.partial = true;
  return extracted;
}

// Écoute le message venant du popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_HTML') {
    if (document.readyState === 'complete') {
      setTimeout(() => sendResponse(extractHTML()), 500);
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => sendResponse(extractHTML()), 500);
      }, { once: true });
    }
  }
  return true;
});