// Firefox: désactivation de l'authentification Google.
//
// La clé 'oauth2' est absente du manifest Firefox (Chrome-specific).
// Sur Firefox, chrome.runtime.getManifest().oauth2 retourne undefined,
// ce qui provoquerait un crash dans googleAuth.js.
//
// Ce script est chargé AVANT auth.js (script régulier, non-module).
// Il intercepte les clics sur les boutons Google en phase de capture,
// avant que les listeners d'auth.js (phase bubble) n'aient l'occasion de s'exécuter.
(function () {
  function blockGoogleAuth(btnId, errorId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopImmediatePropagation();
      var errEl = document.getElementById(errorId);
      if (errEl) {
        errEl.textContent = 'Google login non disponible sur Firefox.';
        errEl.style.display = 'block';
      }
    }, true); // capture = true : s'exécute avant les listeners bubble d'auth.js
  }

  blockGoogleAuth('btn-google', 'login-error');
  blockGoogleAuth('btn-google-signup', 'signup-error');
})();
