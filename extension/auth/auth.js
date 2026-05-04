// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://kolio-production.up.railway.app/api';
// Pour dev local :
// const API_BASE = 'http://localhost:3000/api';

// ── Onglets ──────────────────────────────────────────────────────
document.getElementById('tab-signup').addEventListener('click', () => {
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('view-signup').classList.add('active');
  document.getElementById('view-login').classList.remove('active');
});

document.getElementById('tab-login').addEventListener('click', () => {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('view-login').classList.add('active');
  document.getElementById('view-signup').classList.remove('active');
});

// ── Helpers ──────────────────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent   = msg;
  el.style.display = 'block';
}

function hideError(id) {
  document.getElementById(id).style.display = 'none';
}

function showSuccess(id, msg) {
  const el = document.getElementById(id);
  el.textContent   = msg;
  el.style.display = 'block';
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
}

// ── Inscription ──────────────────────────────────────────────────
document.getElementById('btn-signup').addEventListener('click', async () => {
  hideError('signup-error');
  document.getElementById('signup-success').style.display = 'none';

  const name        = document.getElementById('signup-name').value.trim();
  const email       = document.getElementById('signup-email').value.trim();
  const password    = document.getElementById('signup-password').value;
  const kindleEmail = document.getElementById('signup-kindle').value.trim();

  if (!name)               return showError('signup-error', 'Le nom est obligatoire.');
  if (!email)              return showError('signup-error', "L'email est obligatoire.");
  if (password.length < 6) return showError('signup-error', 'Le mot de passe doit faire au moins 6 caractères.');

  const btn = document.getElementById('btn-signup');
  btn.disabled    = true;
  btn.textContent = 'Création...';

  try {
    const res  = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, kindleEmail: kindleEmail || null }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError('signup-error', data.error || 'Erreur lors de la création.');
      return;
    }

    // Essai Premium 7 jours automatique (stocké localement pour l'UI)
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    const trial = {
      plan:     'premium',
      billing:  'trial',
      since:    new Date().toISOString(),
      trialEnd: trialEnd.toISOString(),
    };

    chrome.storage.local.set({
      token:        data.token,
      email:        data.email,
      name:         data.name,
      kindleEmail:  kindleEmail || null,
      subscription: trial,
    }, () => {
      showSuccess('signup-success', `Compte créé ! Bienvenue ${name} 🎉 — 7 jours Premium offerts`);
      setTimeout(openDashboard, 1500);
    });

  } catch {
    showError('signup-error', 'Impossible de joindre le serveur. Vérifie ta connexion.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Créer mon compte →';
  }
});

// ── Connexion ────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  hideError('login-error');

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email)    return showError('login-error', "L'email est obligatoire.");
  if (!password) return showError('login-error', 'Le mot de passe est obligatoire.');

  const btn = document.getElementById('btn-login');
  btn.disabled    = true;
  btn.textContent = 'Connexion...';

  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError('login-error', data.error || 'Email ou mot de passe incorrect.');
      return;
    }

    chrome.storage.local.set({
      token:       data.token,
      email:       data.email,
      name:        data.name || data.email,
      kindleEmail: data.kindleEmail || null,
    }, openDashboard);

  } catch {
    showError('login-error', 'Impossible de joindre le serveur. Vérifie ta connexion.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Se connecter →';
  }
});