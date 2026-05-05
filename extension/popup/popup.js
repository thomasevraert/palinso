// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://kolio-production.up.railway.app/api';
// Pour dev local :
// const API_BASE = 'http://localhost:3000/api';

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
    chrome.storage.local.get(['kindleEmail'], function(result) {
      resolve(result.kindleEmail || null);
    });
  });
}

// ── Session (JWT) ─────────────────────────────────────────────────
chrome.storage.local.get(['token', 'name', 'email'], function(result) {
  if (!result.token) {
    chrome.tabs.create({ url: chrome.runtime.getURL('auth/auth.html') });
    window.close();
    return;
  }
  userBar.style.display  = 'flex';
  const displayName      = result.name || result.email || 'Utilisateur';
  userNameEl.textContent = '👤 ' + displayName;
});

// ── Déconnexion ───────────────────────────────────────────────────
btnLogout.addEventListener('click', function() {
  chrome.storage.local.remove(['token', 'name', 'email', 'kindleEmail', 'subscription'], function() {
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

// ── Modal quota dépassé ───────────────────────────────────────────
const quotaModal = document.getElementById('quota-modal');

document.getElementById('quota-modal-cancel').addEventListener('click', function() {
  quotaModal.classList.remove('open');
});

document.getElementById('quota-modal-upgrade').addEventListener('click', async function() {
  quotaModal.classList.remove('open');
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
    chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_SUBSCRIPTION' });
  } else {
    chrome.tabs.create({ url: dashboardUrl + '#subscription' });
  }
});

function showQuotaModal(quota) {
  const planLabels = { free: 'Gratuit', essentiel: 'Essentiel', premium: 'Premium' };
  const nextPlan   = { free: 'Essentiel', essentiel: 'Premium' };
  const planLabel  = planLabels[quota.plan] || quota.plan;
  const next       = nextPlan[quota.plan];
  const textEl     = document.getElementById('quota-modal-text');
  textEl.textContent = `Vous avez utilisé vos ${quota.limit} conversions de ce mois (offre ${planLabel}).`
    + (next ? ` Passez à l'offre ${next} pour en obtenir davantage.` : '');
  quotaModal.classList.add('open');
}

// ── Bandeau plan / essai (depuis cache localStorage) ─────────────
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

    // Trial actif
    if (sub.isTrialActive && sub.trialDaysLeft !== undefined) {
      const daysLeft = sub.trialDaysLeft;

      if (daysLeft <= 0) {
        banner.className = 'trial-urgent';
        icon.textContent = '⚠️';
        text.innerHTML   = '<strong>Essai expiré.</strong> Choisissez un plan dans le dashboard.';
      } else if (daysLeft <= 2) {
        banner.className = 'trial-urgent';
        icon.textContent = '⏳';
        text.innerHTML   = '<strong>Essai Premium</strong> — plus que <strong>' + daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + '</strong> !';
      } else {
        banner.className = 'trial';
        icon.textContent = '⭐';
        text.innerHTML   = '<strong>Essai Premium</strong> en cours — <strong>' + daysLeft + ' jours</strong> restants';
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
    const { token } = await chrome.storage.local.get('token');
    const response = await fetch(`${API_BASE}/articles/categories/list`, {
      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
    });
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

// ── Ouverture du dashboard en mode génération ─────────────────────
async function openGenerationView(kindleMode) {
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let pageData = null;
    try { pageData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_HTML' }); } catch (e) {}

    const payload = {
      url:        tab.url,
      html:       pageData ? pageData.html : null,
      format:     selectedFormat,
      title:      customTitleInput.value.trim() || tab.title || '',
      category:   customCategoryInput.value.trim() || null,
      kindleMode: kindleMode,
    };

    await chrome.storage.local.set({ generationPayload: payload });

    const existingTabs = await chrome.tabs.query({ url: dashboardUrl });
    if (existingTabs.length > 0) {
      await chrome.tabs.update(existingTabs[0].id, { active: true });
      await chrome.windows.update(existingTabs[0].windowId, { focused: true });
      chrome.tabs.sendMessage(existingTabs[0].id, { type: 'OPEN_GENERATION' });
    } else {
      chrome.tabs.create({ url: dashboardUrl + '#generation' });
    }
    window.close();
  } catch (err) {
    showStatus('❌ ' + err.message, 'error');
  }
}

// ── Bouton : Convertir ────────────────────────────────────────────
btnSend.addEventListener('click', async function() {
  btnSend.disabled = true;
  showStatus('Préparation de l\'aperçu...', 'info');
  await openGenerationView(false);
  btnSend.disabled = false;
});

// ── Bouton : Envoyer vers Kindle ──────────────────────────────────
btnKindle.addEventListener('click', async function() {
  const kindleEmail = await getKindleEmailFromProfile();
  if (!kindleEmail) { kindleModal.classList.add('open'); return; }

  btnKindle.disabled = true;
  showStatus('Préparation de l\'aperçu...', 'info');
  await openGenerationView(true);
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