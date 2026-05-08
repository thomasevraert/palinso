-- psql $DATABASE_URL -f migrations/005_add_email_verified.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
