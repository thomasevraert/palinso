// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://palinso-production.up.railway.app/api';
// Pour dev local :
// const API_BASE = 'http://localhost:3000/api';

let allArticles       = [];
let activeCategory    = 'all';
let pollingTimer      = null;
let dashUserPlan      = null;
let emailVerifPolling = null;

async function getDashUserPlan() {
  if (dashUserPlan) return dashUserPlan;
  const stored = await new Promise(r => chrome.storage.local.get('subscription', r));
  return stored.subscription?.plan || 'free';
}

function showProModal(message) {
  document.getElementById('pro-modal-text').textContent = message;
  document.getElementById('pro-modal').classList.add('open');
}

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

function getUserFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['token', 'email', 'name', 'kindleEmail'], (result) => {
      resolve({
        token:       result.token       || null,
        email:       result.email       || null,
        name:        result.name        || null,
        kindleEmail: result.kindleEmail || null,
      });
    });
  });
}

// ── Vérification session ──────────────────────────────────────────
chrome.storage.local.get(['token', 'name', 'email'], (result) => {
  if (!result.token) {
    window.location.href = chrome.runtime.getURL('auth/auth.html');
    return;
  }
  document.getElementById('dashboard-user').textContent = result.name || result.email || 'Utilisateur';
  initEmailVerificationBanner();
});

// ── Messages depuis le popup ──────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'REFRESH_ARTICLES')    loadArticles();
  if (message.type === 'OPEN_PROFILE')        switchTab('profile');
  if (message.type === 'OPEN_SUBSCRIPTION')   switchTab('subscription');
  if (message.type === 'OPEN_GENERATION')     switchTab('generation');
  if (message.type === 'SUBSCRIPTION_UPDATED') loadSubscription();
});

// ── Rafraîchissement au retour sur la page ────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const activeTab = document.querySelector('.nav-item.active')?.dataset?.tab;
    if (activeTab === 'subscription') loadSubscription();
    refreshQuota();
  }
});

// ── Navigation ────────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.nav-item').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.getElementById('view-articles').classList.toggle('active',     tabName === 'articles');
  document.getElementById('view-profile').classList.toggle('active',      tabName === 'profile');
  document.getElementById('view-subscription').classList.toggle('active', tabName === 'subscription');
  document.getElementById('view-generation').classList.toggle('active',   tabName === 'generation');

  if (tabName === 'profile')      loadProfile();
  if (tabName === 'subscription') loadSubscription();
  if (tabName === 'generation')   loadGeneration();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

document.getElementById('dashboard-user').addEventListener('click', () => switchTab('profile'));

if (window.location.hash === '#profile')      switchTab('profile');
if (window.location.hash === '#subscription') switchTab('subscription');
if (window.location.hash === '#generation')   switchTab('generation');

// ── Init ──────────────────────────────────────────────────────────
loadArticles();

document.getElementById('btn-logout-dashboard').addEventListener('click', () => {
  stopPolling();
  stopEmailVerifPolling();
  chrome.storage.local.remove(['token', 'name', 'email', 'kindleEmail', 'subscription'], () => {
    window.location.href = chrome.runtime.getURL('auth/auth.html');
  });
});

document.getElementById('refresh-btn').addEventListener('click', loadArticles);
document.getElementById('btn-delete-all').addEventListener('click', deleteAll);

document.getElementById('kindle-modal-cancel').addEventListener('click', () => {
  document.getElementById('kindle-missing-modal').classList.remove('open');
});

document.getElementById('kindle-modal-go-profile').addEventListener('click', () => {
  document.getElementById('kindle-missing-modal').classList.remove('open');
  switchTab('profile');
});

document.getElementById('pro-modal-cancel').addEventListener('click', () => {
  document.getElementById('pro-modal').classList.remove('open');
});

document.getElementById('pro-modal-subscribe').addEventListener('click', () => {
  document.getElementById('pro-modal').classList.remove('open');
  switchTab('subscription');
});

document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
document.getElementById('btn-change-password').addEventListener('click', changePassword);

document.querySelectorAll('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type  = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

document.getElementById('articles-body').addEventListener('click', async (e) => {
  const categoryDisplay = e.target.closest('.category-display');
  if (categoryDisplay) {
    const cell = categoryDisplay.closest('.category-cell');
    categoryDisplay.style.display = 'none';
    cell.querySelector('.category-edit-form').classList.add('visible');
    cell.querySelector('.category-input').focus();
    return;
  }
  if (e.target.classList.contains('category-cancel-btn')) {
    const cell = e.target.closest('.category-cell');
    cell.querySelector('.category-edit-form').classList.remove('visible');
    cell.querySelector('.category-display').style.display = 'flex';
    return;
  }
  if (e.target.classList.contains('category-save-btn')) {
    const cell      = e.target.closest('.category-cell');
    const articleId = cell.dataset.id;
    const value     = cell.querySelector('.category-input').value.trim();
    saveCategory(articleId, value, cell);
    return;
  }
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action    = btn.dataset.action;
  const articleId = btn.dataset.id;
  if (action === 'delete')      deleteArticle(articleId, btn);
  if (action === 'send-kindle') handleKindleSend(articleId, btn);
  if (action === 'download') {
    const format = btn.closest('tr').querySelector('.format-select')?.value || 'epub3';
    if (format === 'kepub' && await getDashUserPlan() === 'free') {
      showProModal('Le téléchargement en KEPUB est réservé aux abonnés Pro. Passez à l\'offre Pro pour accéder à ce format, optimisé pour les liseuses Kobo.');
      return;
    }
    downloadArticle(articleId, format, btn);
  }
});

document.getElementById('articles-body').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('category-input')) {
    const cell = e.target.closest('.category-cell');
    saveCategory(cell.dataset.id, e.target.value.trim(), cell);
  }
  if (e.key === 'Escape' && e.target.classList.contains('category-input')) {
    const cell = e.target.closest('.category-cell');
    cell.querySelector('.category-edit-form').classList.remove('visible');
    cell.querySelector('.category-display').style.display = 'flex';
  }
});

document.getElementById('category-filters').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (btn) setFilter(btn.dataset.category);
});

// ── Polling auto-refresh ──────────────────────────────────────────
function startPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(async () => {
    const hasProcessing = allArticles.some(a => a.status === 'processing');
    if (!hasProcessing) { stopPolling(); return; }
    await silentRefresh();
  }, 3000);
}

function stopPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

// ── Vérification email — bannière + polling ───────────────────────
async function initEmailVerificationBanner() {
  try {
    const res = await apiFetch('/auth/me');
    if (!res.ok) return;
    const { email_verified } = await res.json();
    if (email_verified) return;
    document.getElementById('email-verification-banner').classList.add('visible');
    startEmailVerifPolling();
  } catch { /* silencieux */ }
}

function startEmailVerifPolling() {
  if (emailVerifPolling) return;
  emailVerifPolling = setInterval(async () => {
    try {
      const res = await apiFetch('/auth/me');
      if (!res.ok) return;
      const { email_verified } = await res.json();
      if (!email_verified) return;
      stopEmailVerifPolling();
      document.getElementById('email-verification-banner').classList.remove('visible');
      if (!localStorage.getItem('palinso_email_verified_shown')) {
        document.getElementById('email-verified-modal').classList.add('open');
        localStorage.setItem('palinso_email_verified_shown', '1');
      }
    } catch { /* silencieux */ }
  }, 4000);
}

function stopEmailVerifPolling() {
  if (emailVerifPolling) { clearInterval(emailVerifPolling); emailVerifPolling = null; }
}

document.getElementById('btn-close-verified-modal').addEventListener('click', () => {
  document.getElementById('email-verified-modal').classList.remove('open');
});

document.getElementById('btn-resend-verification').addEventListener('click', async () => {
  const btn = document.getElementById('btn-resend-verification');
  btn.disabled = true;
  btn.textContent = '⏳ Envoi...';
  try {
    const res = await apiFetch('/auth/resend-verification', { method: 'POST' });
    if (res.ok) {
      btn.textContent = '✅ Email envoyé !';
    } else {
      const err = await res.json().catch(() => ({}));
      btn.textContent = err.error || '❌ Erreur';
    }
  } catch {
    btn.textContent = '❌ Erreur réseau';
  }
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "Renvoyer l'email";
  }, 4000);
});

async function silentRefresh() {
  try {
    const response = await apiFetch('/articles');
    if (!response.ok) return;
    allArticles = await response.json();
    refreshCategoryFilters();
    renderArticles();
    if (!allArticles.some(a => a.status === 'processing')) stopPolling();
  } catch { /* silencieux */ }
}

// ── Articles ──────────────────────────────────────────────────────
async function loadArticles() {
  const loading = document.getElementById('loading');
  const table   = document.getElementById('articles-table');
  const empty   = document.getElementById('empty');

  loading.style.display = 'block';
  table.style.display   = 'none';
  empty.style.display   = 'none';

  try {
    const [articlesRes, quotaRes] = await Promise.all([
      apiFetch('/articles'),
      apiFetch('/articles/quota'),
    ]);
    if (articlesRes.status === 401 || articlesRes.status === 403) {
      chrome.storage.local.remove(['token', 'name', 'email', 'kindleEmail', 'subscription'], () => {
        window.location.href = chrome.runtime.getURL('auth/auth.html');
      });
      return;
    }
    allArticles           = await articlesRes.json();
    loading.style.display = 'none';
    refreshCategoryFilters();
    renderArticles();
    if (allArticles.some(a => a.status === 'processing')) startPolling();

    if (quotaRes.ok) {
      const quota = await quotaRes.json();
      renderQuotaBar(quota);
    }
  } catch {
    loading.textContent = '❌ Impossible de contacter le serveur.';
  }
}

const PLAN_LABELS = { free: 'Offre Gratuite', pro: 'Offre Pro' };
const NEXT_PLAN   = { free: 'pro' };

function renderQuotaBar(quota) {
  const bar         = document.getElementById('quota-bar');
  const labelEl     = document.getElementById('quota-bar-label');
  const planEl      = document.getElementById('quota-bar-plan');
  const fill        = document.getElementById('quota-progress-fill');
  const cta         = document.getElementById('quota-upgrade-cta');
  const ctaText     = document.getElementById('quota-upgrade-text');
  const ctaBtn      = document.getElementById('btn-quota-upgrade');

  // Les utilisateurs Premium n'ont pas de limite — on cache la barre
  if (quota.limit === null) { bar.style.display = 'none'; return; }

  bar.style.display = 'block';
  labelEl.textContent = `${quota.used} / ${quota.limit} article${quota.limit > 1 ? 's' : ''} ce mois`;
  planEl.textContent  = PLAN_LABELS[quota.plan] || quota.plan;

  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  fill.style.width = `${pct}%`;
  fill.className   = 'quota-progress-fill' +
    (pct >= 100 ? ' danger' : pct >= 80 ? ' warning' : '');

  if (pct >= 80) {
    cta.style.display = 'flex';
    cta.className     = 'quota-upgrade-cta' + (pct >= 100 ? ' danger' : '');
    ctaText.textContent = pct >= 100
      ? `Quota atteint — passez à l'offre supérieure pour continuer à convertir.`
      : `Vous avez utilisé ${pct}% de votre quota mensuel.`;

    const freshBtn = ctaBtn.cloneNode(true);
    ctaBtn.parentNode.replaceChild(freshBtn, ctaBtn);
    freshBtn.addEventListener('click', () => switchTab('subscription'));
  } else {
    cta.style.display = 'none';
  }
}

function renderArticles() {
  const table        = document.getElementById('articles-table');
  const empty        = document.getElementById('empty');
  const tbody        = document.getElementById('articles-body');
  const btnDeleteAll = document.getElementById('btn-delete-all');

  const filtered = activeCategory === 'all'
    ? allArticles
    : allArticles.filter(a => (a.category || '') === activeCategory);

  btnDeleteAll.style.display = allArticles.length > 0 ? 'inline-block' : 'none';

  if (!filtered.length) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }

  const formatLabels = { epub3: 'EPUB3', kepub: 'KEPUB' };

  tbody.innerHTML = filtered.map(a => {
    const fmt      = a.format || 'epub3';
    const category = a.category || '';
    return `
    <tr>
      <td class="title-cell">
        <a href="${a.url}" target="_blank">${a.title || a.url}</a>
        ${a.error_message ? `<div class="error-tooltip">⚠️ ${a.error_message}</div>` : ''}
      </td>
      <td class="category-cell" data-id="${a.id}">
        <div class="category-display" title="Cliquer pour modifier">
          <span class="category-tag ${!category ? 'empty' : ''}">${category || 'Aucune'}</span>
          <span class="category-edit-icon">✏️</span>
        </div>
        <div class="category-edit-form">
          <input class="category-input" type="text" value="${category}" placeholder="Catégorie..." list="category-suggestions" />
          <datalist id="category-suggestions">
            ${[...new Set(allArticles.map(x => x.category).filter(Boolean))].map(c => `<option value="${c}">`).join('')}
          </datalist>
          <button class="category-save-btn">✓</button>
          <button class="category-cancel-btn">✕</button>
        </div>
      </td>
      <td><span class="badge-format badge-format-${fmt}">${formatLabels[fmt] || fmt.toUpperCase()}</span></td>
      <td><span class="badge badge-${a.status}">${statusLabel(a.status)}</span></td>
      <td>${a.kindle_sent ? '✅ Envoyé' : '—'}</td>
      <td>${formatDate(a.created_at)}</td>
      <td>
        <div class="actions">
          ${a.status === 'done' ? `
            <div class="download-group">
              <select class="format-select">
                <option value="epub3" ${fmt === 'epub3' ? 'selected' : ''}>EPUB3</option>
                <option value="kepub" ${fmt === 'kepub'  ? 'selected' : ''}>KEPUB</option>
              </select>
              <button class="btn-action" data-action="download" data-id="${a.id}">⬇ Télécharger</button>
            </div>
            <button class="btn-action btn-kindle-action" data-action="send-kindle" data-id="${a.id}">📬 Kindle</button>
          ` : ''}
          <button class="btn-action btn-delete" data-action="delete" data-id="${a.id}">🗑</button>
        </div>
      </td>
    </tr>`}).join('');

  table.style.display = 'table';
  empty.style.display = 'none';
  const countEl = document.getElementById('count-info');
  if (countEl) countEl.textContent = `${filtered.length} article${filtered.length > 1 ? 's' : ''}`;
}

async function handleKindleSend(articleId, btn) {
  if (await getDashUserPlan() === 'free') {
    showProModal('L\'envoi direct vers votre Kindle est réservé aux abonnés Pro. Passez à l\'offre Pro pour débloquer cette fonctionnalité.');
    return;
  }
  const { kindleEmail } = await getUserFromStorage();
  if (!kindleEmail) { document.getElementById('kindle-missing-modal').classList.add('open'); return; }
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const response = await apiFetch('/kindle/send', {
      method: 'POST',
      body: JSON.stringify({ articleId, kindleEmail }),
    });
    const result = await response.json();
    if (result.success) { alert('✅ Envoyé au Kindle !'); loadArticles(); }
    else alert(`❌ Erreur : ${result.error}`);
  } catch (err) {
    alert(`❌ Erreur réseau : ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = '📬 Kindle';
  }
}

// ── Profil ────────────────────────────────────────────────────────
async function loadProfile() {
  const { email, name, kindleEmail } = await getUserFromStorage();
  document.getElementById('profile-name').value                = name  || '';
  document.getElementById('profile-email-display').textContent = email || '—';
  document.getElementById('profile-kindle').value              = kindleEmail || '';
}

async function saveProfile() {
  const newName     = document.getElementById('profile-name').value.trim();
  const kindleEmail = document.getElementById('profile-kindle').value.trim();
  const feedback    = document.getElementById('profile-feedback');

  if (!newName) {
    feedback.textContent = '⚠️ Le nom ne peut pas être vide.';
    feedback.className   = 'profile-feedback error';
    feedback.style.display = 'block';
    return;
  }
  chrome.storage.local.set({ name: newName, kindleEmail: kindleEmail || null }, () => {
    const userEl = document.getElementById('dashboard-user');
    if (userEl) userEl.textContent = newName;
    feedback.textContent   = '✅ Profil sauvegardé';
    feedback.className     = 'profile-feedback success';
    feedback.style.display = 'block';
    setTimeout(() => { feedback.style.display = 'none'; }, 3000);
  });
}

async function changePassword() {
  const currentPwd = document.getElementById('pwd-current').value;
  const newPwd     = document.getElementById('pwd-new').value;
  const confirmPwd = document.getElementById('pwd-confirm').value;
  const feedback   = document.getElementById('pwd-feedback');

  function showPwdFeedback(msg, type) {
    feedback.textContent   = msg;
    feedback.className     = `profile-feedback ${type}`;
    feedback.style.display = 'block';
    if (type === 'success') setTimeout(() => { feedback.style.display = 'none'; }, 4000);
  }

  if (!currentPwd)           return showPwdFeedback('⚠️ Saisissez votre mot de passe actuel.', 'error');
  if (!newPwd)               return showPwdFeedback('⚠️ Saisissez un nouveau mot de passe.', 'error');
  if (newPwd.length < 6)     return showPwdFeedback('⚠️ Le nouveau mot de passe doit faire au moins 6 caractères.', 'error');
  if (newPwd !== confirmPwd) return showPwdFeedback('⚠️ Les mots de passe ne correspondent pas.', 'error');
  if (newPwd === currentPwd) return showPwdFeedback("⚠️ Le nouveau mot de passe doit être différent de l'actuel.", 'error');

  try {
    const response = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
    });
    const result = await response.json();
    if (!response.ok) return showPwdFeedback(`❌ ${result.error}`, 'error');
    document.getElementById('pwd-current').value = '';
    document.getElementById('pwd-new').value     = '';
    document.getElementById('pwd-confirm').value = '';
    showPwdFeedback('✅ Mot de passe modifié avec succès.', 'success');
  } catch (err) {
    showPwdFeedback(`❌ Erreur réseau : ${err.message}`, 'error');
  }
}

// ── Catégorie ─────────────────────────────────────────────────────
async function saveCategory(articleId, category, cell) {
  try {
    const response = await apiFetch(`/articles/${articleId}/category`, {
      method: 'POST',
      body: JSON.stringify({ category: category || null }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    const article = allArticles.find(a => a.id === articleId);
    if (article) article.category = category || null;
    refreshCategoryFilters();
    renderArticles();
  } catch (err) {
    alert(`❌ Erreur : ${err.message}`);
    cell.querySelector('.category-edit-form').classList.remove('visible');
    cell.querySelector('.category-display').style.display = 'flex';
  }
}

function refreshCategoryFilters() {
  const container  = document.getElementById('category-filters');
  if (!container) return;
  const categories = [...new Set(allArticles.map(a => a.category).filter(Boolean))];
  container.innerHTML = `
    <button class="filter-btn ${activeCategory === 'all' ? 'active' : ''}" data-category="all">Tous (${allArticles.length})</button>
    ${categories.map(cat => `
      <button class="filter-btn ${activeCategory === cat ? 'active' : ''}" data-category="${cat}">
        ${cat} (${allArticles.filter(a => a.category === cat).length})
      </button>`).join('')}`;
}

function setFilter(category) {
  activeCategory = category;
  refreshCategoryFilters();
  renderArticles();
}

async function downloadArticle(articleId, format, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    const { token } = await chrome.storage.local.get('token');
    const response  = await fetch(`${API_BASE}/articles/${articleId}/download?format=${format}`, {
      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      alert(`❌ Téléchargement impossible : ${err.error}`);
      return;
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const match       = disposition.match(/filename="?([^"]+)"?/);
    const ext         = format === 'kepub' ? 'kepub.epub' : 'epub';
    const filename    = match ? match[1] : `article.${ext}`;
    const blob        = await response.blob();
    const blobUrl     = URL.createObjectURL(blob);
    const a           = document.createElement('a');
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    alert(`❌ Erreur réseau : ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Télécharger'; }
  }
}

async function deleteArticle(articleId, btn) {
  if (!confirm('Supprimer cet article et ses fichiers ?')) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    const response = await apiFetch(`/articles/${articleId}`, { method: 'DELETE' });
    const result   = await response.json();
    if (result.success) {
      allArticles = allArticles.filter(a => a.id !== articleId);
      refreshCategoryFilters(); renderArticles();
    } else {
      alert(`❌ ${result.error}`);
      btn.disabled = false; btn.textContent = '🗑';
    }
  } catch (err) {
    alert(`❌ ${err.message}`);
    btn.disabled = false; btn.textContent = '🗑';
  }
}

async function deleteAll() {
  if (!confirm(`Supprimer les ${allArticles.length} article(s) ? Irréversible.`)) return;
  const btn = document.getElementById('btn-delete-all');
  btn.disabled = true; btn.textContent = '⏳ Suppression...';
  try {
    const response = await apiFetch('/articles', { method: 'DELETE' });
    const result   = await response.json();
    if (result.success) {
      stopPolling(); allArticles = []; activeCategory = 'all';
      refreshCategoryFilters(); renderArticles();
    } else alert(`❌ ${result.error}`);
  } catch (err) {
    alert(`❌ ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = '🗑 Tout supprimer';
  }
}

// ── Abonnement — source de vérité : backend ───────────────────────
async function loadSubscription() {
  const banner       = document.getElementById('current-plan-banner');
  const trialBanner  = document.getElementById('trial-banner');
  const trialInner   = document.getElementById('trial-banner-inner');
  const trialIcon    = document.getElementById('trial-icon');
  const trialText    = document.getElementById('trial-text');
  const trialSubtext = document.getElementById('trial-subtext');

  // Affiche un état de chargement
  trialBanner.style.display = 'none';
  banner.style.display      = 'none';

  // Fetch depuis le backend (source de vérité)
  let sub;
  try {
    const response = await apiFetch('/subscription');
    if (!response.ok) throw new Error('Erreur');
    sub = await response.json();
    // Met à jour le cache localStorage
    chrome.storage.local.set({ subscription: sub });
  } catch {
    // Fallback sur le cache localStorage si le backend est injoignable
    sub = await new Promise(resolve => {
      chrome.storage.local.get(['subscription'], r => resolve(r.subscription || { plan: 'free', billing: null }));
    });
  }

  renderSubscriptionUI(sub);
  setupSubscriptionActions(sub);
}

function renderSubscriptionUI(sub) {
  const banner       = document.getElementById('current-plan-banner');
  const trialBanner  = document.getElementById('trial-banner');
  const trialInner   = document.getElementById('trial-banner-inner');
  const trialIcon    = document.getElementById('trial-icon');
  const trialText    = document.getElementById('trial-text');
  const trialSubtext = document.getElementById('trial-subtext');
  const billingSwitch = document.getElementById('billing-switch');
  const labelMonthly  = document.getElementById('label-monthly');
  const labelAnnual   = document.getElementById('label-annual');

  // ── Trial actif ───────────────────────────────────────────────
  if (sub.isTrialActive) {
    const daysLeft = sub.trialDaysLeft || 0;
    trialBanner.style.display = 'block';
    banner.style.display      = 'none';

    if (daysLeft <= 2) {
      trialInner.className     = 'trial-dashboard-banner trial-urgent';
      trialIcon.textContent    = '⏳';
      trialText.innerHTML      = '<strong>Plus que ' + daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + " d'essai Premium !</strong>";
      trialSubtext.textContent = 'Abonnez-vous maintenant pour ne pas perdre vos accès.';
    } else {
      trialInner.className     = 'trial-dashboard-banner trial';
      trialIcon.textContent    = '⭐';
      trialText.innerHTML      = '<strong>Essai Premium en cours</strong> — ' + daysLeft + ' jours restants';
      trialSubtext.textContent = sub.trialEnd
        ? "Profitez de toutes les fonctionnalités Premium jusqu'au " +
          new Date(sub.trialEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '';
    }

    resetPlanButtons();
    document.querySelectorAll('.plan-btn[data-plan="pro"]').forEach(b => {
      b.textContent = 'Essai en cours'; b.disabled = true; b.style.opacity = '0.55';
    });
    updatePrices(billingSwitch.checked, labelMonthly, labelAnnual);
    return;
  }

  trialBanner.style.display = 'none';

  // ── Plan payant actif ─────────────────────────────────────────
  if (sub.plan !== 'free') {
    const planLabel    = 'Pro';
    const billingLabel = sub.billing === 'annual' ? 'annuel' : 'mensuel';
    const renewalDate  = sub.subscribedAt
      ? (() => {
          const d = new Date(sub.subscribedAt);
          sub.billing === 'annual' ? d.setFullYear(d.getFullYear() + 1) : d.setMonth(d.getMonth() + 1);
          return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        })()
      : '—';

    banner.style.display = 'flex';
    document.getElementById('current-plan-text').innerHTML =
      '✦ Plan actif : <strong>' + planLabel + '</strong> (' + billingLabel + ')' +
      ' &nbsp;·&nbsp; Renouvellement le <strong>' + renewalDate + '</strong>';

    resetPlanButtons();
    document.querySelectorAll('.plan-btn').forEach(btn => {
      if (btn.dataset.plan === sub.plan) { btn.textContent = 'Plan actuel'; btn.disabled = true; btn.style.opacity = '0.55'; }
      if (btn.dataset.plan === 'free')   { btn.textContent = "Résilier l'abonnement"; btn.disabled = false; btn.style.opacity = '1'; btn.className = 'plan-btn plan-btn-ghost'; }
    });
  } else {
    // ── Plan gratuit ──────────────────────────────────────────────
    banner.style.display = 'none';
    resetPlanButtons();
    document.querySelectorAll('.plan-btn[data-plan="free"]').forEach(b => {
      b.textContent = 'Plan actuel'; b.disabled = true; b.style.opacity = '0.55';
    });
  }

  updatePrices(billingSwitch.checked, labelMonthly, labelAnnual);
}

function resetPlanButtons() {
  document.querySelectorAll('.plan-btn').forEach(btn => {
    const p = btn.dataset.plan;
    if (p === 'free') { btn.textContent = 'Offre gratuite'; btn.disabled = true; btn.style.opacity = '0.45'; }
    else { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = "S'abonner"; }
  });
}

function updatePrices(isAnnual, labelMonthly, labelAnnual) {
  const lm = labelMonthly || document.getElementById('label-monthly');
  const la = labelAnnual  || document.getElementById('label-annual');
  lm.classList.toggle('active', !isAnnual);
  la.classList.toggle('active',  isAnnual);
  document.querySelectorAll('.plan-price').forEach(el => {
    el.textContent = parseFloat(isAnnual ? el.dataset.annual : el.dataset.monthly).toFixed(2).replace('.', ',');
  });
  document.querySelectorAll('.plan-billing-note').forEach(el => {
    el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly;
  });
  const priceOld = document.getElementById('price-original');
  if (priceOld) priceOld.classList.toggle('visible', isAnnual);
}

function setupSubscriptionActions(currentSub) {
  const billingSwitch = document.getElementById('billing-switch');
  const labelMonthly  = document.getElementById('label-monthly');
  const labelAnnual   = document.getElementById('label-annual');

  // Toggle mensuel/annuel
  const freshSwitch = billingSwitch.cloneNode(true);
  billingSwitch.parentNode.replaceChild(freshSwitch, billingSwitch);
  freshSwitch.addEventListener('change', () => updatePrices(freshSwitch.checked, labelMonthly, labelAnnual));

  // CTA trial
  const trialCta = document.getElementById('trial-cta');
  const freshCta = trialCta.cloneNode(true);
  trialCta.parentNode.replaceChild(freshCta, trialCta);
  freshCta.addEventListener('click', () => {
    document.getElementById('plan-pro').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Boutons plans
  document.querySelectorAll('.plan-btn').forEach(btn => {
    const freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);
    freshBtn.addEventListener('click', async () => {
      if (freshBtn.disabled) return;
      const plan    = freshBtn.dataset.plan;
      const billing = document.getElementById('billing-switch')?.checked ? 'annual' : 'monthly';

      if (plan === 'free') {
        try {
          const response = await apiFetch('/stripe/create-portal-session', { method: 'POST' });
          const result = await response.json();
          chrome.tabs.create({ url: result.url });
        } catch (err) {
          alert(`❌ Erreur : ${err.message}`);
        }
      } else {
        freshBtn.disabled = true;
        freshBtn.textContent = '⏳ Chargement...';
        try {
          const response = await apiFetch('/stripe/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ plan: billing }),
          });
          const result = await response.json();
          chrome.tabs.create({ url: result.url });
        } catch { /* silencieux */ } finally {
          freshBtn.textContent = "S'abonner";
          freshBtn.disabled = false;
        }
      }
    });
  });

  // Résiliation via bouton dans le bandeau
  const btnCancel   = document.getElementById('btn-cancel-plan');
  const freshCancel = btnCancel.cloneNode(true);
  btnCancel.parentNode.replaceChild(freshCancel, btnCancel);
  freshCancel.addEventListener('click', async () => {
    try {
      const response = await apiFetch('/stripe/create-portal-session', { method: 'POST' });
      const result = await response.json();
      chrome.tabs.create({ url: result.url });
    } catch (err) {
      alert(`❌ Erreur : ${err.message}`);
    }
  });
}

async function refreshQuota() {
  try {
    const res = await apiFetch('/articles/quota');
    if (res.ok) renderQuotaBar(await res.json());
  } catch { /* silencieux */ }
}

// ── Vue Génération ────────────────────────────────────────────────
let genPayload   = null;
let genExtracted = null;
let genFormat    = 'epub3';
let genState     = null; // 'url-input' | 'loading' | 'preview' | 'error'

// Réagit immédiatement quand le popup écrit le payload en storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.generationPayload && changes.generationPayload.newValue) {
    switchTab('generation');
  }
});

async function loadGeneration() {
  const { generationPayload } = await chrome.storage.local.get('generationPayload');

  if (generationPayload) {
    // Payload du popup → extraction immédiate
    genPayload = generationPayload;
    chrome.storage.local.remove('generationPayload');
    startExtraction();
  } else if (genState !== 'preview' && genState !== 'loading') {
    // Aucun payload et pas de génération en cours → retour aux articles
    switchTab('articles');
  }
  // Si genState === 'preview' ou 'loading', on ne réinitialise pas
}

async function startExtraction() {
  genState = 'loading';
  document.getElementById('gen-loading').style.display   = 'block';
  document.getElementById('gen-error').style.display     = 'none';
  document.getElementById('gen-content').style.display   = 'none';
  document.getElementById('gen-back-btn').textContent    = '← Retour';
  document.getElementById('gen-loading-text').textContent = 'Extraction du contenu en cours…';

  genFormat = genPayload.format || 'epub3';
  document.querySelectorAll('.gen-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.format === genFormat);
  });
  updateGenSubmitLabel();

  const kindleBtn = document.getElementById('gen-submit-kindle');
  kindleBtn.style.display = genPayload.kindleMode ? 'block' : 'none';

  try {
    const [extractRes, quotaRes] = await Promise.all([
      apiFetch('/articles/extract', {
        method: 'POST',
        body: JSON.stringify({ url: genPayload.url, html: genPayload.html }),
      }),
      apiFetch('/articles/quota'),
    ]);

    if (!extractRes.ok) {
      const err = await extractRes.json().catch(() => ({ error: 'Erreur inconnue' }));
      showGenError(err.error || 'Impossible d\'extraire le contenu.');
      return;
    }

    genExtracted = await extractRes.json();

    document.getElementById('gen-title').value    = genPayload.title || genExtracted.title || '';
    document.getElementById('gen-category').value = genPayload.category || '';

    loadCategorySuggestions();
    if (quotaRes.ok) renderGenQuota(await quotaRes.json());

    renderGenPreview();

    genState = 'preview';
    document.getElementById('gen-loading').style.display = 'none';
    document.getElementById('gen-content').style.display = 'grid';

  } catch (err) {
    showGenError(err.message);
  }
}

function showGenError(msg) {
  genState = 'error';
  document.getElementById('gen-loading').style.display  = 'none';
  document.getElementById('gen-error').style.display    = 'block';
  document.getElementById('gen-error-text').textContent = msg;
}

function renderGenPreview() {
  if (!genExtracted) return;
  document.getElementById('gen-preview-title').textContent  = document.getElementById('gen-title').value || genExtracted.title;
  document.getElementById('gen-preview-site').textContent   = genExtracted.siteName || (() => { try { return new URL(genPayload.url).hostname; } catch { return ''; } })();
  document.getElementById('gen-preview-author').textContent = genExtracted.author || '';
  document.getElementById('gen-preview-body').innerHTML     = genExtracted.content_html || '';
}

function renderGenQuota(quota) {
  const box      = document.getElementById('gen-quota');
  const textEl   = document.getElementById('gen-quota-text');
  const planEl   = document.getElementById('gen-quota-plan');
  const fill     = document.getElementById('gen-quota-fill');
  const alertEl  = document.getElementById('gen-quota-alert');
  const submitEl = document.getElementById('gen-submit-epub');
  const kindleEl = document.getElementById('gen-submit-kindle');

  dashUserPlan = quota.plan;

  if (quota.limit === null) { box.style.display = 'none'; return; }

  box.style.display  = 'block';
  textEl.textContent = `${quota.used} / ${quota.limit} ce mois`;
  planEl.textContent = PLAN_LABELS[quota.plan] || quota.plan;

  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  fill.style.width = `${pct}%`;
  fill.className   = 'gen-quota-fill' + (pct >= 100 ? ' danger' : pct >= 80 ? ' warning' : '');

  if (quota.remaining === 0) {
    alertEl.style.display = 'block';
    alertEl.textContent   = 'Quota atteint — passez à l\'offre supérieure.';
    submitEl.disabled     = true;
    kindleEl.disabled     = true;
  } else {
    alertEl.style.display = 'none';
    submitEl.disabled     = false;
    kindleEl.disabled     = false;
  }
}

function updateGenSubmitLabel() {
  const btn = document.getElementById('gen-submit-epub');
  if (btn) btn.textContent = `Générer en ${genFormat.toUpperCase()}`;
}

async function loadCategorySuggestions() {
  try {
    const res  = await apiFetch('/articles/categories/list');
    if (!res.ok) return;
    const cats = await res.json();
    document.getElementById('gen-category-list').innerHTML =
      cats.map(c => `<option value="${c}">`).join('');
  } catch { /* silencieux */ }
}

async function submitGeneration(kindleMode) {
  if (!genExtracted || !genPayload) return;

  const userPlan = await getDashUserPlan();

  if (genFormat === 'kepub' && userPlan === 'free') {
    showProModal('Le format KEPUB est réservé aux abonnés Pro. Passez à l\'offre Pro pour télécharger vos articles en KEPUB, optimisé pour les liseuses Kobo.');
    return;
  }

  if (kindleMode && userPlan === 'free') {
    showProModal('L\'envoi direct vers votre Kindle est réservé aux abonnés Pro. Passez à l\'offre Pro pour débloquer cette fonctionnalité.');
    return;
  }

  const submitEpub   = document.getElementById('gen-submit-epub');
  const submitKindle = document.getElementById('gen-submit-kindle');
  const progress     = document.getElementById('gen-progress');

  submitEpub.disabled    = true;
  submitKindle.disabled  = true;
  progress.style.display = 'block';

  const title    = document.getElementById('gen-title').value.trim() || genExtracted.title;
  const category = document.getElementById('gen-category').value.trim() || null;
  const images   = document.getElementById('gen-images').checked;

  let kindleEmail = null;
  if (kindleMode) {
    const stored = await new Promise(r => chrome.storage.local.get('kindleEmail', r));
    kindleEmail  = stored.kindleEmail || null;
    if (!kindleEmail) {
      document.getElementById('kindle-missing-modal').classList.add('open');
      submitEpub.disabled    = false;
      submitKindle.disabled  = false;
      progress.style.display = 'none';
      return;
    }
  }

  try {
    const response = await apiFetch('/articles', {
      method: 'POST',
      body: JSON.stringify({ url: genPayload.url, html: genPayload.html, format: genFormat, title, category, images, kindleEmail }),
    });

    if (response.status === 401 || response.status === 403) {
      chrome.storage.local.remove(['token', 'name', 'email', 'kindleEmail', 'subscription'], () => {
        window.location.href = chrome.runtime.getURL('auth/auth.html');
      });
      return;
    }

    const result = await response.json();

    if (result.error === 'QUOTA_EXCEEDED') {
      renderGenQuota(result.quota);
      progress.style.display = 'none';
      return;
    }

    if (result.error) {
      alert(`❌ ${result.error}`);
      submitEpub.disabled    = false;
      submitKindle.disabled  = false;
      progress.style.display = 'none';
      return;
    }

    // Succès → retour à la liste
    genPayload   = null;
    genExtracted = null;
    genState     = null;
    switchTab('articles');
    loadArticles();

  } catch (err) {
    alert(`❌ Erreur réseau : ${err.message}`);
    submitEpub.disabled    = false;
    submitKindle.disabled  = false;
    progress.style.display = 'none';
  }
}

// ── Listeners de la vue génération ───────────────────────────────
document.getElementById('gen-back-btn').addEventListener('click', () => {
  genState     = null;
  genExtracted = null;
  genPayload   = null;
  switchTab('articles');
});

document.getElementById('gen-retry-btn').addEventListener('click', () => {
  genState     = null;
  genExtracted = null;
  genPayload   = null;
  switchTab('articles');
});


document.querySelectorAll('.gen-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.gen-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    genFormat = pill.dataset.format;
    updateGenSubmitLabel();
  });
});

document.getElementById('gen-images').addEventListener('change', function() {
  document.getElementById('gen-preview-body').classList.toggle('no-images', !this.checked);
});

document.getElementById('gen-title').addEventListener('input', function() {
  document.getElementById('gen-preview-title').textContent = this.value || (genExtracted ? genExtracted.title : '');
});

document.getElementById('gen-submit-epub').addEventListener('click',  () => submitGeneration(false));
document.getElementById('gen-submit-kindle').addEventListener('click', () => submitGeneration(true));

function statusLabel(status) {
  return { done: '✅ Prêt', processing: '⏳ En cours', error: '❌ Erreur', pending: '⏸ En attente' }[status] || status;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}