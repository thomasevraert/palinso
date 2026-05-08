-- psql $DATABASE_URL -f migrations/003_add_auth_provider.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(10) NOT NULL DEFAULT 'local';

-- Drop existing named constraint to allow re-applying with updated allowed values
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IN ('local', 'google', 'both'));
