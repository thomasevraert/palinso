// ── Références DOM ────────────────────────────────────────────────
const btnSend             = document.getElementById('btn-send');
const btnKindle           = document.getElementById('btn-kindle');
const btnDashboard        = document.getElementById('btn-dashboard');
const statusDiv           = document.getElementById('status');
const pageTitleDiv        = document.getElementById('page-title');
const customTitleInput    = document.getElementById('custom-title');
const customCategoryInput = document.getElementById('custom-category');
const categoriesList      = document.getElementById('categories-list');
const userBar             = document.getElementById('user-bar');
const userNameEl          = document.getElementById('user-name');
const btnLogout           = document.getElementById('btn-logout');
const kindleModal         = document.getElementById('kindle-modal');

// ── Format ────────────────────────────────────────────────────────
let selectedFormat = 'epub3';

document.querySelectorAll('.format-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.format-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedFormat = pill.dataset.format;
    const labels = { epub3: 'Convertir en EPUB3', kepub: 'Convertir en KEPUB' };
    btnSend.textContent = '📤 ' + labels[selectedFormat];
  });
});

// ── Helpers ───────────────────────────────────────────────────────
function showStatus(message, type) {
  type = type || 'info';
  statusDiv.textContent   = message;
  statusDiv.className     = 'status-' + type;
  statusDiv.style.display = 'block';
}

function getKindleEmailFromProfile() {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['session', 'users'], function(result) {
      const session = result.session;
      const users   = result.users || [];
      const user    = users.find(function(u) { return u.email === (session && session.email); });
      resolve((user && user.kindleEmail) || (session && session.kindleEmail) || null);
    });
  });
}

// ── Session ───────────────────────────────────────────────────────
chrome.storage.local.get(['session'], function(result) {
  const session = result.session;
  if (!session || !session.loggedIn) {
    chrome.tabs.create({ url: chrome.runtime.getURL('auth/auth.html') });
    window.close();
    return;
  }
  userBar.style.display  = 'flex';
  userNameEl.textContent = '👤 ' + session.name;
});

// ── Déconnexion ───────────────────────────────────────────────────
btnLogout.addEventListener('click', function() {
  chrome.storage.local.remove('session', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('auth/auth.html') });
    window.close();
  });
});

// ── Modal Kindle manquant ─────────────────────────────────────────
document.getElementById('modal-cancel').addEventListener('click', function() {
  kindleModal.classList.remove('open');
});

document.getElementById('modal-go-profile').addEventListener('click', async function() {
  kindleModal.classList.remove('open');
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
    chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_PROFILE' });
  } else {
    chrome.tabs.create({ url: dashboardUrl + '#profile' });
  }
});

// ── Bandeau plan / essai ──────────────────────────────────────────
function loadPlanBanner() {
  chrome.storage.local.get(['subscription'], function(result) {
    const sub    = result.subscription || null;
    const banner = document.getElementById('plan-banner');
    const icon   = document.getElementById('plan-banner-icon');
    const text   = document.getElementById('plan-banner-text');

    if (!sub || sub.plan === 'free') {
      banner.style.display = 'none';
      return;
    }

    if (sub.billing === 'trial' && sub.trialEnd) {
      const msLeft   = new Date(sub.trialEnd) - Date.now();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        banner.className     = 'trial-urgent';
        icon.textContent     = '⚠️';
        text.innerHTML       = '<strong>Essai expiré.</strong> Choisissez un plan dans le dashboard.';
      } else if (daysLeft <= 2) {
        banner.className     = 'trial-urgent';
        icon.textContent     = '⏳';
        text.innerHTML       = '<strong>Essai Premium</strong> — plus que <strong>' + daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + '</strong> !';
      } else {
        banner.className     = 'trial';
        icon.textContent     = '⭐';
        text.innerHTML       = '<strong>Essai Premium</strong> en cours — <strong>' + daysLeft + ' jours</strong> restants';
      }
      banner.style.display = 'flex';
      return;
    }

    // Abonnement payant actif
    const planLabel      = sub.plan === 'premium' ? 'Premium' : 'Essentiel';
    banner.className     = 'active-plan';
    icon.textContent     = sub.plan === 'premium' ? '⭐' : '✦';
    text.innerHTML       = 'Plan <strong>' + planLabel + '</strong> actif';
    banner.style.display = 'flex';
  });
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageTitleDiv.textContent = tab.title || tab.url;
  customTitleInput.value   = tab.title || '';

  try {
    const response   = await fetch('http://localhost:3000/api/articles/categories/list');
    const categories = await response.json();
    categoriesList.innerHTML = categories.map(function(c) { return '<option value="' + c + '">'; }).join('');
  } catch (e) { /* serveur non disponible */ }

  loadPlanBanner();
}

// ── Collecte les données communes ─────────────────────────────────
async function buildPayload(tab, pageData) {
  return {
    url:      tab.url,
    html:     pageData ? pageData.html : null,
    format:   selectedFormat,
    title:    customTitleInput.value.trim() || null,
    category: customCategoryInput.value.trim() || null,
  };
}

// ── Bouton : Convertir ────────────────────────────────────────────
btnSend.addEventListener('click', async function() {
  btnSend.disabled = true;
  showStatus('Extraction de la page en cours...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let pageData = null;
    try { pageData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_HTML' }); } catch (e) {}

    showStatus('Génération du fichier ' + selectedFormat.toUpperCase() + '...', 'info');

    const result = await chrome.runtime.sendMessage({
      type: 'SEND_ARTICLE',
      payload: await buildPayload(tab, pageData),
    });

    if (result.error) showStatus('❌ Erreur : ' + result.error, 'error');
    else showStatus('✅ En cours de traitement en ' + selectedFormat.toUpperCase() + ' ! Vérifie le dashboard.', 'success');

  } catch (err) {
    showStatus('❌ ' + err.message, 'error');
  }

  btnSend.disabled = false;
});

// ── Bouton : Envoyer vers Kindle ──────────────────────────────────
btnKindle.addEventListener('click', async function() {
  const kindleEmail = await getKindleEmailFromProfile();

  if (!kindleEmail) {
    kindleModal.classList.add('open');
    return;
  }

  btnKindle.disabled = true;
  showStatus('Extraction et envoi vers Kindle en cours...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let pageData = null;
    try { pageData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_HTML' }); } catch (e) {}

    const payload = await buildPayload(tab, pageData);
    payload.kindleEmail = kindleEmail;

    const result = await chrome.runtime.sendMessage({ type: 'SEND_ARTICLE', payload });

    if (result.error) showStatus('❌ Erreur : ' + result.error, 'error');
    else showStatus("✅ En cours d'envoi vers votre Kindle ! Vérifiez dans quelques minutes.", 'success');

  } catch (err) {
    showStatus('❌ ' + err.message, 'error');
  }

  btnKindle.disabled = false;
});

// ── Bouton : Dashboard ────────────────────────────────────────────
btnDashboard.addEventListener('click', async function() {
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
    chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_ARTICLES' });
  } else {
    chrome.tabs.create({ url: dashboardUrl });
  }
});

init();