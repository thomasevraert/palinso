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
  el.textContent  = msg;
  el.style.display = 'block';
}

function hideError(id) {
  document.getElementById(id).style.display = 'none';
}

function showSuccess(id, msg) {
  const el = document.getElementById(id);
  el.textContent  = msg;
  el.style.display = 'block';
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
}

// ── Inscription ──────────────────────────────────────────────────
document.getElementById('btn-signup').addEventListener('click', () => {
  hideError('signup-error');
  document.getElementById('signup-success').style.display = 'none';

  const name        = document.getElementById('signup-name').value.trim();
  const email       = document.getElementById('signup-email').value.trim();
  const password    = document.getElementById('signup-password').value;
  const kindleEmail = document.getElementById('signup-kindle').value.trim();

  if (!name)               return showError('signup-error', 'Le nom est obligatoire.');
  if (!email)              return showError('signup-error', "L'email est obligatoire.");
  if (password.length < 6) return showError('signup-error', 'Le mot de passe doit faire au moins 6 caractères.');

  chrome.storage.local.get(['users'], (result) => {
    const users  = result.users || [];
    const exists = users.find(u => u.email === email);
    if (exists) return showError('signup-error', 'Un compte existe déjà avec cet email.');

    const newUser = {
      name,
      email,
      password,
      kindleEmail: kindleEmail || null,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);

    // Essai Premium 7 jours automatique
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    const trial = {
      plan:      'premium',
      billing:   'trial',
      since:     new Date().toISOString(),
      trialEnd:  trialEnd.toISOString(),
    };

    chrome.storage.local.set({
      users,
      session:      { name, email, kindleEmail: kindleEmail || null, loggedIn: true },
      subscription: trial,
    }, () => {
      showSuccess('signup-success', `Compte créé ! Bienvenue ${name} 🎉 — 7 jours Premium offerts`);
      setTimeout(openDashboard, 1500);
    });
  });
});

// ── Connexion ────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', () => {
  hideError('login-error');

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email)    return showError('login-error', "L'email est obligatoire.");
  if (!password) return showError('login-error', 'Le mot de passe est obligatoire.');

  chrome.storage.local.get(['users'], (result) => {
    const users = result.users || [];
    const user  = users.find(u => u.email === email && u.password === password);

    if (!user) return showError('login-error', 'Email ou mot de passe incorrect.');

    chrome.storage.local.set({
      session: {
        name:         user.name,
        email:        user.email,
        kindleEmail:  user.kindleEmail || null,
        loggedIn:     true,
      },
    }, openDashboard);
  });
});