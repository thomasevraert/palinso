const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    author TEXT,
    content_html TEXT,
    epub_path TEXT,
    status TEXT DEFAULT 'pending',
    kindle_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    error_message TEXT,
    category TEXT DEFAULT NULL,
    format TEXT DEFAULT 'epub3'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migrations pour les bases existantes
const migrations = [
  `ALTER TABLE articles ADD COLUMN category TEXT DEFAULT NULL`,
  `ALTER TABLE articles ADD COLUMN format TEXT DEFAULT 'epub3'`,
];

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* colonne déjà existante */ }
}

module.exports = db;