// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://kolio-production.up.railway.app/api';
// Pour dev local :
// const API_BASE = 'http://localhost:3000/api';

let allArticles    = [];
let activeCategory = 'all';

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
});

// ── Messages depuis le popup ──────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'REFRESH_ARTICLES') loadArticles();
  if (message.type === 'OPEN_PROFILE')     switchTab('profile');
});

// ── Navigation ────────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.nav-item').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.getElementById('view-articles').classList.toggle('active',     tabName === 'articles');
  document.getElementById('view-profile').classList.toggle('active',      tabName === 'profile');
  document.getElementById('view-subscription').classList.toggle('active', tabName === 'subscription');

  if (tabName === 'profile')      loadProfile();
  if (tabName === 'subscription') loadSubscription();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

// Clic sur le nom → profil
document.getElementById('dashboard-user').addEventListener('click', () => switchTab('profile'));

if (window.location.hash === '#profile') switchTab('profile');

// ── Init ──────────────────────────────────────────────────────────
loadArticles();

document.getElementById('btn-logout-dashboard').addEventListener('click', () => {
  chrome.storage.local.remove(['token', 'name', 'email', 'kindleEmail'], () => {
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

document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
document.getElementById('btn-change-password').addEventListener('click', changePassword);

document.querySelectorAll('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type  = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

document.getElementById('articles-body').addEventListener('click', (e) => {
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

// ── Articles ──────────────────────────────────────────────────────
async function loadArticles() {
  const loading = document.getElementById('loading');
  const table   = document.getElementById('articles-table');
  const empty   = document.getElementById('empty');

  loading.style.display = 'block';
  table.style.display   = 'none';
  empty.style.display   = 'none';

  try {
    const response = await apiFetch('/articles');

    if (response.status === 401 || response.status === 403) {
      chrome.storage.local.remove(['token', 'name', 'email', 'kindleEmail'], () => {
        window.location.href = chrome.runtime.getURL('auth/auth.html');
      });
      return;
    }

    allArticles           = await response.json();
    loading.style.display = 'none';
    refreshCategoryFilters();
    renderArticles();
  } catch {
    loading.textContent = '❌ Impossible de contacter le serveur.';
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
  const { kindleEmail } = await getUserFromStorage();
  if (!kindleEmail) {
    document.getElementById('kindle-missing-modal').classList.add('open');
    return;
  }
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

// ── Téléchargement ────────────────────────────────────────────────
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
      allArticles = []; activeCategory = 'all';
      refreshCategoryFilters(); renderArticles();
    } else alert(`❌ ${result.error}`);
  } catch (err) {
    alert(`❌ ${err.message}`);
  } finally {
    btn.disabled = false; btn.textContent = '🗑 Tout supprimer';
  }
}

// ── Abonnement ────────────────────────────────────────────────────
function loadSubscription() {
  const billingSwitch = document.getElementById('billing-switch');
  const labelMonthly  = document.getElementById('label-monthly');
  const labelAnnual   = document.getElementById('label-annual');
  const banner        = document.getElementById('current-plan-banner');
  const trialBanner   = document.getElementById('trial-banner');
  const trialInner    = document.getElementById('trial-banner-inner');
  const trialIcon     = document.getElementById('trial-icon');
  const trialText     = document.getElementById('trial-text');
  const trialSubtext  = document.getElementById('trial-subtext');

  function renewalDate(since, billing) {
    const d = new Date(since);
    billing === 'annual' ? d.setFullYear(d.getFullYear() + 1) : d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function resetPlanButtons() {
    document.querySelectorAll('.plan-btn').forEach(function(btn) {
      const p = btn.dataset.plan;
      if (p === 'free') { btn.textContent = 'Offre gratuite'; btn.disabled = true; btn.style.opacity = '0.45'; }
      else { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = "S'abonner"; }
    });
  }

  chrome.storage.local.get(['subscription'], function(result) {
    const sub = result.subscription || null;

    if (sub && sub.billing === 'trial' && sub.trialEnd) {
      const msLeft   = new Date(sub.trialEnd) - Date.now();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      trialBanner.style.display = 'block';
      banner.style.display      = 'none';

      if (daysLeft <= 0) {
        trialInner.className = 'trial-dashboard-banner trial-urgent';
        trialIcon.textContent = '⚠️';
        trialText.innerHTML   = '<strong>Votre essai Premium a expiré.</strong>';
        trialSubtext.textContent = 'Choisissez un plan pour continuer à profiter de toutes les fonctionnalités.';
      } else if (daysLeft <= 2) {
        trialInner.className = 'trial-dashboard-banner trial-urgent';
        trialIcon.textContent = '⏳';
        trialText.innerHTML   = '<strong>Plus que ' + daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + " d'essai Premium !</strong>";
        trialSubtext.textContent = 'Abonnez-vous maintenant pour ne pas perdre vos accès.';
      } else {
        trialInner.className = 'trial-dashboard-banner trial';
        trialIcon.textContent = '⭐';
        trialText.innerHTML   = '<strong>Essai Premium en cours</strong> — ' + daysLeft + ' jours restants';
        trialSubtext.textContent = "Profitez de toutes les fonctionnalités Premium jusqu'au " +
          new Date(sub.trialEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      }

      resetPlanButtons();
      document.querySelectorAll('.plan-btn[data-plan="premium"]').forEach(function(b) {
        b.textContent = 'Essai en cours'; b.disabled = true; b.style.opacity = '0.55';
      });
      return;
    }

    trialBanner.style.display = 'none';

    if (sub && sub.plan !== 'free') {
      const planLabel    = sub.plan === 'premium' ? 'Premium' : 'Essentiel';
      const billingLabel = sub.billing === 'annual' ? 'annuel' : 'mensuel';
      banner.style.display = 'flex';
      document.getElementById('current-plan-text').innerHTML =
        '✦ Plan actif : <strong>' + planLabel + '</strong> (' + billingLabel + ')' +
        ' &nbsp;·&nbsp; Renouvellement le <strong>' + renewalDate(sub.since, sub.billing) + '</strong>';
      resetPlanButtons();
      document.querySelectorAll('.plan-btn').forEach(function(btn) {
        if (btn.dataset.plan === sub.plan) { btn.textContent = 'Plan actuel'; btn.disabled = true; btn.style.opacity = '0.55'; }
        if (btn.dataset.plan === 'free') { btn.textContent = "Résilier l'abonnement"; btn.disabled = false; btn.style.opacity = '1'; btn.className = 'plan-btn plan-btn-ghost'; }
      });
    } else {
      banner.style.display = 'none';
      resetPlanButtons();
      document.querySelectorAll('.plan-btn[data-plan="free"]').forEach(function(b) {
        b.textContent = 'Plan actuel'; b.disabled = true; b.style.opacity = '0.55';
      });
    }
  });

  function updatePrices(isAnnual) {
    labelMonthly.classList.toggle('active', !isAnnual);
    labelAnnual.classList.toggle('active', isAnnual);
    document.querySelectorAll('.plan-price').forEach(function(el) {
      el.textContent = parseFloat(isAnnual ? el.dataset.annual : el.dataset.monthly).toFixed(2).replace('.', ',');
    });
    document.querySelectorAll('.plan-billing-note').forEach(function(el) {
      el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly;
    });
  }

  updatePrices(billingSwitch.checked);

  const freshSwitch = billingSwitch.cloneNode(true);
  billingSwitch.parentNode.replaceChild(freshSwitch, billingSwitch);
  freshSwitch.addEventListener('change', function() { updatePrices(freshSwitch.checked); });

  const trialCta = document.getElementById('trial-cta');
  const freshCta = trialCta.cloneNode(true);
  trialCta.parentNode.replaceChild(freshCta, trialCta);
  freshCta.addEventListener('click', function() {
    document.getElementById('plan-essentiel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.querySelectorAll('.plan-btn').forEach(function(btn) {
    const freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);
    freshBtn.addEventListener('click', function() {
      if (freshBtn.disabled) return;
      const plan    = freshBtn.dataset.plan;
      const billing = document.getElementById('billing-switch')?.checked ? 'annual' : 'monthly';

      if (plan === 'free') {
        if (!confirm("Résilier votre abonnement ? Vous reviendrez sur l'offre gratuite.")) return;
        chrome.storage.local.remove('subscription', loadSubscription);
        return;
      }
      chrome.storage.local.set({ subscription: { plan, billing, since: new Date().toISOString() } }, loadSubscription);
    });
  });

  const btnCancel   = document.getElementById('btn-cancel-plan');
  const freshCancel = btnCancel.cloneNode(true);
  btnCancel.parentNode.replaceChild(freshCancel, btnCancel);
  freshCancel.addEventListener('click', function() {
    if (!confirm("Résilier votre abonnement ? Vous conserverez l'accès jusqu'à la fin de la période en cours.")) return;
    chrome.storage.local.remove('subscription', loadSubscription);
  });
}

function statusLabel(status) {
  return { done: '✅ Prêt', processing: '⏳ En cours', error: '❌ Erreur', pending: '⏸ En attente' }[status] || status;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}