#!/bin/bash
# Build script Firefox pour Palinso.
# Copie extension/ dans dist-firefox/, adapte les fichiers pour Firefox MV3,
# puis crée firefox-extension.zip prêt pour addons.mozilla.org.
#
# Usage : bash extension/build-firefox.sh
# Prérequis : rsync, perl, python3, zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$REPO_DIR/dist-firefox"
ZIP_PATH="$REPO_DIR/firefox-extension.zip"

echo "=== Palinso — Build Firefox Extension ==="
echo

# ── 1. Copie de l'extension ────────────────────────────────────────
echo "→ Copie extension/ → dist-firefox/ ..."
rm -rf "$DIST_DIR"
rsync -a \
  --exclude='.DS_Store' \
  --exclude='*.md' \
  --exclude='build-firefox.sh' \
  --exclude='manifest.firefox.json' \
  --exclude='*.zip' \
  "$SCRIPT_DIR/" "$DIST_DIR/"

# ── 2. Remplacement du manifest ────────────────────────────────────
echo "→ Manifest : remplacement par manifest.firefox.json ..."
cp "$SCRIPT_DIR/manifest.firefox.json" "$DIST_DIR/manifest.json"

# ── 3. Polyfill dans background.js (chemin service worker) ─────────
echo "→ background.js : injection importScripts polyfill ..."
TMP="$(mktemp)"
printf "importScripts('./lib/browser-polyfill.min.js');\n\n" > "$TMP"
cat "$DIST_DIR/background.js" >> "$TMP"
mv "$TMP" "$DIST_DIR/background.js"

# ── 4. Polyfill dans les fichiers HTML ─────────────────────────────
echo "→ HTML : injection <script> polyfill ..."

# popup/popup.html — avant <script src="popup.js">
perl -i -pe \
  's|<script src="popup\.js"></script>|<script src="../lib/browser-polyfill.min.js"></script>\n  <script src="popup.js"></script>|' \
  "$DIST_DIR/popup/popup.html"

# dashboard/dashboard.html — avant <script src="dashboard.js">
perl -i -pe \
  's|<script src="dashboard\.js"></script>|<script src="../lib/browser-polyfill.min.js"></script>\n  <script src="dashboard.js"></script>|' \
  "$DIST_DIR/dashboard/dashboard.html"

# auth/auth.html — avant <script type="module" src="auth.js">
# Injecte le polyfill + le shim Google Firefox
perl -i -pe \
  's|<script type="module" src="auth\.js"></script>|<script src="../lib/browser-polyfill.min.js"></script>\n  <script src="../lib/firefox-google-shim.js"></script>\n  <script type="module" src="auth.js"></script>|' \
  "$DIST_DIR/auth/auth.html"

# ── 5. TODO Firefox dans auth/googleAuth.js ────────────────────────
echo "→ auth/googleAuth.js : ajout commentaire TODO Firefox ..."
python3 - "$DIST_DIR/auth/googleAuth.js" << 'PYEOF'
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

todo_block = (
    "  // TODO Firefox: chrome.identity.getAuthToken n'est pas supporté sur Firefox.\n"
    "  // Ce flow utilise launchWebAuthFlow (compatible Firefox via polyfill), MAIS\n"
    "  // la clé 'oauth2' du manifest est spécifique à Chrome — elle est absente du\n"
    "  // manifest Firefox. Résultat : chrome.runtime.getManifest().oauth2 = undefined.\n"
    "  // Remplacer par un flow OAuth2 PKCE manuel avec identity.launchWebAuthFlow.\n"
    "  // Voir : https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow\n"
)

target = "  const { oauth2 } = chrome.runtime.getManifest();"
if target in content:
    content = content.replace(target, todo_block + target)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("  ✓ TODO ajouté")
else:
    print("  ⚠ Ligne cible non trouvée dans googleAuth.js — vérification manuelle requise")
PYEOF

# ── 6. Création du ZIP ─────────────────────────────────────────────
echo "→ Création de firefox-extension.zip ..."
rm -f "$ZIP_PATH"
(
  cd "$DIST_DIR"
  zip -r "$ZIP_PATH" . \
    --exclude "*.DS_Store" \
    --exclude "*.map" \
    --exclude "manifest.firefox.json"
)

echo
echo "=== Build terminé ==="
echo "  dist-firefox/         → Extension non packagée (chargeable dans about:debugging)"
echo "  firefox-extension.zip → Prêt pour addons.mozilla.org"
echo
echo "=== NON supporté sur Firefox ==="
echo "  ✗ Authentification Google (clé 'oauth2' absente du manifest Firefox)"
echo "    → Les boutons 'Se connecter avec Google' affichent un message d'erreur."
echo "    → Inscription et connexion email/mot de passe : 100% fonctionnels."
echo "    → Toutes les fonctionnalités Kindle (conversion, envoi) : 100% fonctionnelles."
