// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://palinso-production.up.railway.app/api';
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

let cachedQuota = null;
const proModal = document.getElementById('pro-modal');

function isFreePlan() {
  if (cachedQuota && cachedQuota.plan) return cachedQuota.plan === 'free';
  return new Promise(resolve => {
    chrome.storage.local.get('subscription', r => resolve(!r.subscription || r.subscription.plan === 'free'));
  });
}

function showProModal(message) {
  document.getElementById('pro-modal-text').textContent = message;
  proModal.classList.add('open');
}

// ── Format ────────────────────────────────────────────────────────
let selectedFormat = 'epub3';

document.querySelectorAll('.format-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.format-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedFormat = pill.dataset.format;
    const labels = { epub3: 'Convertir en EPUB3', kepub: 'Convertir en KEPUB', fb2: 'Convertir en FB2' };
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

// ── Modal offre Pro requise ───────────────────────────────────────
document.getElementById('pro-modal-cancel').addEventListener('click', function() {
  proModal.classList.remove('open');
});

document.getElementById('pro-modal-subscribe').addEventListener('click', async function() {
  proModal.classList.remove('open');
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
  const textEl = document.getElementById('quota-modal-text');
  textEl.textContent = `Vous avez utilisé vos ${quota.limit} conversion${quota.limit > 1 ? 's' : ''} du mois (offre Gratuite). Passez à l'offre Pro pour des conversions illimitées.`;
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
        text.innerHTML   = '<strong>Essai Pro</strong> — plus que <strong>' + daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + '</strong> !';
      } else {
        banner.className = 'trial';
        icon.textContent = '⭐';
        text.innerHTML   = '<strong>Essai Pro</strong> en cours — <strong>' + daysLeft + ' jours</strong> restants';
      }
      banner.style.display = 'flex';
      return;
    }

    // Abonnement payant actif
    banner.className     = 'active-plan';
    icon.textContent     = '⭐';
    text.innerHTML       = 'Plan <strong>Pro</strong> actif';
    banner.style.display = 'flex';
  });
}

// ── Quota : vérification préventive ──────────────────────────────
async function loadQuota() {
  try {
    const { token } = await chrome.storage.local.get('token');
    if (!token) return;
    const res = await fetch(`${API_BASE}/articles/quota`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;
    cachedQuota = await res.json();
  } catch (e) { /* serveur non disponible */ }
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
  await loadQuota();
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

    if (pageData === null) {
      showStatus('⚠️ Extraction échouée — le site bloque peut-être l\'accès au contenu.', 'error');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else if (pageData.partial === true) {
      showStatus('⚠️ Extraction partielle — l\'article semble incomplet. Le site utilise peut-être un paywall.', 'warning');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const payload = {
      url:        tab.url,
      html:       pageData ? pageData.html : null,
      format:     selectedFormat,
      title:      customTitleInput.value.trim() || tab.title || '',
      category:   customCategoryInput.value.trim() || null,
      kindleMode: kindleMode,
      partial:    pageData?.partial || false,
    };

    // Écriture en storage d'abord — le dashboard y réagit via storage.onChanged
    await chrome.storage.local.set({ generationPayload: payload });

    // Cherche un onglet dashboard déjà ouvert (URL exacte ou avec hash)
    const allTabs    = await chrome.tabs.query({});
    const existing   = allTabs.find(t => t.url && t.url.startsWith(dashboardUrl));

    if (existing) {
      // storage.onChanged déclenchera automatiquement la vue génération
      chrome.tabs.update(existing.id, { active: true });
      chrome.windows.update(existing.windowId, { focused: true });
    } else {
      // Nouvel onglet — le hash #generation déclenche loadGeneration()
      chrome.tabs.create({ url: dashboardUrl + '#generation' });
    }
    window.close();
  } catch (err) {
    showStatus('❌ ' + err.message, 'error');
  }
}

// ── Bouton : Convertir ────────────────────────────────────────────
btnSend.addEventListener('click', async function() {
  if (cachedQuota && cachedQuota.limit !== null && cachedQuota.remaining === 0) {
    showQuotaModal(cachedQuota);
    return;
  }
  if (selectedFormat === 'kepub' && await isFreePlan()) {
    showProModal('Le format KEPUB est réservé aux abonnés Pro. Passez à l\'offre Pro pour télécharger vos articles en KEPUB, optimisé pour les liseuses Kobo.');
    return;
  }
  if (selectedFormat === 'fb2' && await isFreePlan()) {
    showProModal('Le format FB2 est réservé aux abonnés Pro. Passez à l\'offre Pro pour télécharger vos articles en FB2.');
    return;
  }
  btnSend.disabled = true;
  showStatus('Préparation de l\'aperçu...', 'info');
  await openGenerationView(false);
  btnSend.disabled = false;
});

// ── Bouton : Envoyer vers Kindle ──────────────────────────────────
btnKindle.addEventListener('click', async function() {
  if (cachedQuota && cachedQuota.limit !== null && cachedQuota.remaining === 0) {
    showQuotaModal(cachedQuota);
    return;
  }
  if (await isFreePlan()) {
    showProModal('L\'envoi direct vers votre Kindle est réservé aux abonnés Pro. Passez à l\'offre Pro pour débloquer cette fonctionnalité.');
    return;
  }
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