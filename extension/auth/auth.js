import { signInWithGoogle } from './googleAuth.js';

// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://palinso-production.up.railway.app/api';
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

// ── Case CGU ─────────────────────────────────────────────────────
document.getElementById('terms-agree').addEventListener('change', (e) => {
  const btn = document.getElementById('btn-signup');
  btn.disabled = !e.target.checked;
  btn.classList.toggle('terms-gate', !e.target.checked);
});

document.getElementById('link-cgu').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://palinso.app/terms.html' });
});

document.getElementById('link-privacy').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://palinso.app/privacy.html' });
});

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

    // Sauvegarde token + subscription retournée par le backend
    chrome.storage.local.set({
      token:        data.token,
      email:        data.email,
      name:         data.name,
      kindleEmail:  kindleEmail || null,
      subscription: data.subscription || null,
    }, () => {
      showSuccess('signup-success', 'Compte créé ! Bienvenue ' + name + ' 🎉 — 7 jours Premium offerts');
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

    // Le backend retourne le plan effectif (trial expiré → free automatiquement)
    chrome.storage.local.set({
      token:        data.token,
      email:        data.email,
      name:         data.name || data.email,
      kindleEmail:  data.kindleEmail || null,
      subscription: data.subscription || null,
    }, openDashboard);

  } catch {
    showError('login-error', 'Impossible de joindre le serveur. Vérifie ta connexion.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Se connecter →';
  }
});

// ── Google (login + signup) ───────────────────────────────────────
async function handleGoogleAuth(btnId, errorId, loadingText, defaultText) {
  const btn = document.getElementById(btnId);
  btn.disabled    = true;
  btn.textContent = loadingText;

  try {
    await signInWithGoogle();
    openDashboard();
  } catch (err) {
    showError(errorId, err.message || 'Erreur lors de la connexion Google.');
    btn.disabled    = false;
    btn.textContent = defaultText;
  }
}

document.getElementById('btn-google').addEventListener('click', () =>
  handleGoogleAuth('btn-google', 'login-error', 'Connexion en cours...', 'Se connecter avec Google')
);

document.getElementById('btn-google-signup').addEventListener('click', () =>
  handleGoogleAuth('btn-google-signup', 'signup-error', 'Connexion en cours...', 'Créer un compte avec Google')
);

// ── Mot de passe oublié ──────────────────────────────────────────
document.getElementById('link-forgot-password').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('view-login').classList.remove('active');
  document.getElementById('view-forgot').classList.add('active');
});

document.getElementById('link-back-to-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('view-forgot').classList.remove('active');
  document.getElementById('view-login').classList.add('active');
});

document.getElementById('btn-forgot').addEventListener('click', async () => {
  document.getElementById('forgot-error').style.display = 'none';
  document.getElementById('forgot-success').style.display = 'none';

  const email = document.getElementById('forgot-email').value.trim();
  const btn = document.getElementById('btn-forgot');
  btn.disabled    = true;
  btn.textContent = 'Envoi en cours...';

  try {
    await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    showSuccess('forgot-success', 'Si cet email existe, un lien a été envoyé. Vérifiez vos spams.');
  } catch {
    showError('forgot-error', 'Une erreur est survenue, réessayez.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Envoyer le lien →';
  }
});