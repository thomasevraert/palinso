-- Migration 006 : Ajout des colonnes Stripe sur la table users
--
-- Exécution sur Railway :
--   1. Récupère DATABASE_URL depuis Railway > ton service > Variables
--   2. Lance dans ton terminal :
--      psql $DATABASE_URL -f migrations/006_add_stripe_columns.sql
--   Ou depuis le Railway CLI :
--      railway run psql $DATABASE_URL -f migrations/006_add_stripe_columns.sql
--
-- Cette migration est idempotente (IF NOT EXISTS) : sans danger si relancée.

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status    TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end   BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used             BOOLEAN DEFAULT false;
