/**
 * db.js — Base de données
 *
 * En local (dev) : SQLite — rien à configurer, fonctionne tel quel
 * En production  : PostgreSQL via Railway (variable DATABASE_URL automatique)
 *
 * API unifiée (toujours async) :
 *   await db.run(sql, params)   → INSERT / UPDATE / DELETE
 *   await db.get(sql, params)   → SELECT une ligne
 *   await db.all(sql, params)   → SELECT plusieurs lignes
 *
 * Les requêtes SQL utilisent la syntaxe PostgreSQL ($1, $2, $3...)
 * Le wrapper SQLite les convertit automatiquement en ? pour SQLite.
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
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      name         TEXT,
      kindle_email TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
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
  `).catch(err => console.error('Erreur init tables PostgreSQL:', err));

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
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      name         TEXT,
      kindle_email TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
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
  `);

  // Migrations pour les bases existantes (qui n'ont pas encore user_id, format, category)
  const migrations = [
    `ALTER TABLE articles ADD COLUMN category TEXT DEFAULT NULL`,
    `ALTER TABLE articles ADD COLUMN format TEXT DEFAULT 'epub3'`,
    `ALTER TABLE articles ADD COLUMN user_id TEXT`,
    `ALTER TABLE users ADD COLUMN name TEXT`,
    `ALTER TABLE users ADD COLUMN kindle_email TEXT`,
  ];
  for (const sql of migrations) {
    try { sqlite.exec(sql); } catch { /* colonne déjà existante, on ignore */ }
  }

  // Convertit $1, $2, $3... → ? pour SQLite
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