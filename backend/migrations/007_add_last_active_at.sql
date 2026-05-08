-- Migration 007 : Ajout de la colonne last_active_at sur la table users
-- Exécution sur Railway :
--   railway run psql $DATABASE_URL -f migrations/007_add_last_active_at.sql
-- Ou depuis le dashboard Railway → shell PostgreSQL :
--   \i migrations/007_add_last_active_at.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
