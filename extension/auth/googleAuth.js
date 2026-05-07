// ⚠️ REMPLACE PAR L'URL DE TON SERVEUR RAILWAY APRÈS DÉPLOIEMENT
const API_BASE = 'https://palinso-production.up.railway.app/api';
// Pour dev local :
// const API_BASE = 'http://localhost:3000/api';

export const signInWithGoogle = async () => {
  const { oauth2 } = chrome.runtime.getManifest();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', oauth2.client_id);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  authUrl.searchParams.set('scope', oauth2.scopes.join(' '));
  authUrl.searchParams.set('prompt', 'select_account');

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (url) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(url);
        }
      }
    );
  });

  const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
  const token = params.get('access_token');

  const response = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error);
  }

  await chrome.storage.local.set({
    token: data.token,
    email: data.email,
    name: data.firstName,
  });

  return data;
};
