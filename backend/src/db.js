/**
 * db.js — Base de données
 *
 * Schéma users (colonnes subscription) :
 *   plan          TEXT    DEFAULT 'free'   → free | pro
 *   billing       TEXT    DEFAULT NULL     → monthly | annual | NULL (free)
 *   subscribed_at TEXT/TIMESTAMPTZ NULL    → date de souscription PAYANTE (pas le trial)
 *   trial_end     TEXT/TIMESTAMPTZ NULL    → date de fin du trial (7j après inscription)
 *
 * Règle métier : si trial_end < NOW() → le trial est expiré → plan effectif = free
 * Cette règle est appliquée côté backend à chaque appel /api/subscription
 */

let db;

if (process.env.DATABASE_URL) {
  // ── PRODUCTION : PostgreSQL ──────────────────────────────────────
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,
    name          TEXT,
    kindle_email  TEXT,
    plan          TEXT DEFAULT 'free',
    billing       TEXT DEFAULT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT NULL,
    trial_end          TIMESTAMPTZ DEFAULT NULL,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    articles_generated INTEGER DEFAULT 0,
    email_token        TEXT UNIQUE DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS articles (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    title         TEXT,
    author        TEXT,
    content_html  TEXT,
    epub_path     TEXT,
    status        TEXT DEFAULT 'pending',
    kindle_sent   INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT,
    category      TEXT DEFAULT NULL,
    format        TEXT DEFAULT 'epub3'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS article_quota_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    token_hash  TEXT NOT NULL,
    token_type  VARCHAR(10) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
`).then(() => {
  // Migrations pour les tables existantes
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS articles_generated INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(10) DEFAULT 'local'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_token TEXT UNIQUE DEFAULT NULL`,
  ];
  return Promise.all(migrations.map(sql => pool.query(sql)));
}).then(async () => {
  try {
    const crypto = require('crypto');
    const usersWithoutToken = await db.all(`SELECT id FROM users WHERE email_token IS NULL`);
    for (const user of usersWithoutToken) {
      const token = crypto.randomBytes(8).toString('hex');
      await db.run(`UPDATE users SET email_token = $1 WHERE id = $2`, [token, user.id]);
    }
  } catch (err) {
    console.error('Erreur backfill email_token (PostgreSQL):', err);
  }
}).catch(err => console.error('Erreur init DB PostgreSQL:', err));

  db = {
    run: async (sql, params = []) => {
      await pool.query(sql, params);
    },
    get: async (sql, params = []) => {
      const res = await pool.query(sql, params);
      return res.rows[0] || null;
    },
    all: async (sql, params = []) => {
      const res = await pool.query(sql, params);
      return res.rows;
    },
  };

} else {
  // ── DÉVELOPPEMENT : SQLite ───────────────────────────────────────
  const Database = require('better-sqlite3');
  const path     = require('path');

  const sqlite = new Database(path.join(__dirname, '../data.sqlite'));
  sqlite.pragma('journal_mode = WAL');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password      TEXT NOT NULL,
      name          TEXT,
      kindle_email  TEXT,
      plan          TEXT DEFAULT 'free',
      billing       TEXT DEFAULT NULL,
      subscribed_at TEXT DEFAULT NULL,
      trial_end          TEXT DEFAULT NULL,
      created_at         TEXT DEFAULT (datetime('now')),
      articles_generated INTEGER DEFAULT 0,
      email_token        TEXT UNIQUE DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS articles (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      url           TEXT NOT NULL,
      title         TEXT,
      author        TEXT,
      content_html  TEXT,
      epub_path     TEXT,
      status        TEXT DEFAULT 'pending',
      kindle_sent   INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now')),
      error_message TEXT,
      category      TEXT DEFAULT NULL,
      format        TEXT DEFAULT 'epub3'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS article_quota_log (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      token_hash  TEXT NOT NULL,
      token_type  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      token_hash  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations pour les bases existantes
  const migrations = [
    `ALTER TABLE articles ADD COLUMN category TEXT DEFAULT NULL`,
    `ALTER TABLE articles ADD COLUMN format TEXT DEFAULT 'epub3'`,
    `ALTER TABLE articles ADD COLUMN user_id TEXT`,
    `ALTER TABLE users ADD COLUMN name TEXT`,
    `ALTER TABLE users ADD COLUMN kindle_email TEXT`,
    `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`,
    `ALTER TABLE users ADD COLUMN billing TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN subscribed_at TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN trial_end TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN articles_generated INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'`,
    `ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN email_token TEXT DEFAULT NULL`,
  ];
  for (const sql of migrations) {
    try { sqlite.exec(sql); } catch { /* colonne déjà existante */ }
  }

  try {
    const crypto = require('crypto');
    const users = sqlite.prepare('SELECT id FROM users WHERE email_token IS NULL').all();
    const stmt = sqlite.prepare('UPDATE users SET email_token = ? WHERE id = ?');
    for (const user of users) {
      stmt.run(crypto.randomBytes(8).toString('hex'), user.id);
    }
  } catch (err) {
    console.error('Erreur backfill email_token (SQLite):', err);
  }

  const toSQLite = (sql) => sql.replace(/\$\d+/g, '?');

  db = {
    run: (sql, params = []) => {
      sqlite.prepare(toSQLite(sql)).run(...params);
      return Promise.resolve();
    },
    get: (sql, params = []) => {
      const row = sqlite.prepare(toSQLite(sql)).get(...params);
      return Promise.resolve(row || null);
    },
    all: (sql, params = []) => {
      const rows = sqlite.prepare(toSQLite(sql)).all(...params);
      return Promise.resolve(rows);
    },
  };
}

module.exports = db;