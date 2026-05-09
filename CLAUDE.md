# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Maintenance de ce fichier

**CLAUDE.md est une source de vérité vivante. Tu as l'obligation de le mettre à jour.**

### Quand mettre à jour

Mets à jour CLAUDE.md **dans la même session** (pas après, pas "plus tard") dès que tu :

- Ajoutes une route, un endpoint, ou un middleware
- Modifies le comportement d'un composant existant (extension, backend, DB)
- Ajoutes une variable d'environnement
- Changes un flux (auth, traitement d'article, Stripe, email)
- Ajoutes une dépendance externe significative
- Modifies la structure des dossiers ou des fichiers clés
- Changes un comportement de quota, de rétention, ou de plan

### Ce que tu dois mettre à jour

- Les sections concernées (pas une section générique "Changelog")
- Les exemples de commandes si nécessaire
- Les tableaux (variables d'env, etc.)
- Les flux décrits en prose si le comportement change

### Règles

1. **Ne jamais laisser CLAUDE.md décrire un comportement qui n't'existe plus.**
2. Si tu ajoutes quelque chose de non trivial et qu'il n'y a pas de section appropriée, crée-en une.
3. La mise à jour de CLAUDE.md fait partie du travail — ce n'est pas une tâche optionnelle ou de fin de session.
4. Si tu n'es pas sûr de ce qu'il faut documenter, demande.

## Project Overview

**Palinso** is a Chrome extension (Manifest V3) paired with a Node.js/Express backend that converts web articles into EPUB/KEPUB files and sends them to Kindle. The project has two components:

- `backend/` — Express API deployed on Railway
- `extension/` — Chrome extension (no build step, loaded directly in Chrome)

## Backend Commands

```bash
cd backend

npm run dev    # development with nodemon (auto-reload)
npm start      # production start
```

No test framework is configured.

## Architecture

### Dual Database (SQLite dev / PostgreSQL prod)

`backend/src/db.js` exports a unified async interface `{ run, get, all }` that switches automatically:
- **No `DATABASE_URL` env var** → SQLite (`data.sqlite` file, synchronous under the hood but Promise-wrapped)
- **`DATABASE_URL` set** → PostgreSQL via `pg` Pool

Both use `$1, $2...` parameter placeholders. The SQLite adapter translates them to `?` internally via `toSQLite()`. Always use PostgreSQL-style placeholders when writing queries.

### Subscription / Plan Logic

Two separate but related systems:

1. **`getEffectiveSubscription(userId)`** in `routes/subscription.js` — reads `plan`, `billing`, `subscribed_at`, `trial_end`. Returns the computed plan object including trial state. Automatically downgrades the user to `free` in DB when the trial expires.

2. **`isPro(userId)`** in `middleware/requirePro.js` — reads `subscription_status`, `current_period_end`, `trial_end`, `trial_used`. Returns boolean. Used as route middleware and inline quota checks.

The plan in DB is **only updated via Stripe webhooks** — `POST /api/subscription` is intentionally disabled (returns 403). Never update `plan` or `subscription_status` manually; go through Stripe webhook events.

### Article Processing Flow

1. Extension popup captures page HTML via content script (`Readability.js` + `content.js`)
2. Popup posts a `generationPayload` to `chrome.storage.local` then opens `dashboard.html#generation`
3. Dashboard reads storage and calls `POST /api/articles` with `{ url, html, format, title, category, kindleEmail }`
4. Backend immediately returns `202 { id, status: 'processing' }`, then processes asynchronously (no job queue — fire-and-forget in the same request handler)
5. `extractor.js` uses `@mozilla/readability` with JSDOM — prefers HTML from extension (more reliable), falls back to server-side fetch
6. `epub.js` calls `epub-gen` to produce an EPUB file in `backend/epubs/`
7. For KEPUB format: `kepubify` CLI must be installed (`brew install kepubify`) — it's invoked via `execFile`
8. Dashboard polls `GET /api/articles/:id` to detect `status: 'done'`

### Stripe Webhook Critical Detail

The webhook route is registered in `index.js` **before** `express.json()` using `express.raw()`. This is mandatory — `express.json()` would consume the request stream and break Stripe signature verification. Do not reorder these middleware registrations.

### Extension Communication Pattern

- **Popup** (`popup/popup.js`) — handles UI, quota checks, calls background via `chrome.runtime.sendMessage`
- **Background** (`background.js`) — service worker, handles API calls with JWT from `chrome.storage.local`, owns `apiFetch()` helper
- **Content script** (`content.js` + `Readability.js`) — injected into every page, responds to `GET_PAGE_HTML` messages
- **Dashboard** (`dashboard/dashboard.html`) — full-page tab opened by the extension, makes API calls directly (not via background)

JWT token is stored in `chrome.storage.local` under the key `token`. Subscription cache is stored under `subscription`.

### Article Quota

Free plan: 3 articles/month tracked via `article_quota_log` table (rolling calendar month). Pro plan: unlimited (`null` limit). Quota is checked in `POST /api/articles` before processing starts.

### Article Retention / Cleanup

- Free users: articles older than 7 days are deleted
- Pro users: articles older than 365 days are deleted
- `runGlobalCleanup()` runs at server startup and every 6 hours via `setInterval`

### Auth Flows

- **Local**: email + bcrypt password, JWT (30-day expiry)
- **Google OAuth**: handled in extension via `chrome.identity.getAuthToken`, access token validated server-side against `googleapis.com/oauth2/v3/userinfo`
- **Password reset tokens**: SHA-256 hashed in DB, 30-minute expiry, served via a server-rendered HTML page at `/api/auth/reset-password-page`
- Google-only accounts get `token_type = 'set'` for password reset (sets a password rather than resetting one), toggling `auth_provider` to `'both'`

### Email Service

Transactional emails (verification, password reset) use **Resend** (`resend` npm package) from `hello@palinso.app`. Kindle delivery uses **nodemailer** (SMTP) with subject prefix `"Convert:"` which triggers Amazon's automatic EPUB→MOBI conversion.

## Environment Variables (backend)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL — absence triggers SQLite mode |
| `JWT_SECRET` | JWT signing secret |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` | Stripe Price IDs |
| `RESEND_API_KEY` | Resend transactional email |
| `BACKEND_URL` | Public URL used in email links (e.g. `https://palinso-production.up.railway.app`) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Kindle delivery SMTP credentials |

## Extension Development

The extension has no build step. Load `extension/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

To switch between local and production API, edit `API_BASE` at the top of `background.js` and `popup/popup.js` (two separate files, both need updating).

## Production

Backend is deployed on **Railway** at `https://palinso-production.up.railway.app`. The SQLite file and `epubs/` directory are local to the Railway instance and will be lost on redeploy — this is expected for ephemeral storage; the production DB is PostgreSQL.
