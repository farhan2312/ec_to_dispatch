-- ===========================================================================
-- ECtoDispatch — database schema
-- Target: Azure Database for PostgreSQL (Flexible Server)
-- Apply with:  npm run db:migrate
-- ===========================================================================

-- Note: gen_random_uuid() is built into PostgreSQL core (v13+), which Azure
-- Flexible Server runs, so no pgcrypto extension is required.

-- ---------------------------------------------------------------------------
-- users
-- Roles and access status match the login / "Request Access" signup flow.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     TEXT         NOT NULL,
    email         TEXT         NOT NULL,
    password_hash TEXT         NOT NULL,
    role          TEXT         NOT NULL
                               CHECK (role IN ('admin', 'accounts', 'assembly')),
    status        TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Case-insensitive unique email (so Jane@x.com == jane@x.com).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
    ON users (lower(email));

-- Bring existing tables up to date with the CHECK constraints above.
-- (CREATE TABLE IF NOT EXISTS above is a no-op once the table exists, so the
--  'admin' role and 'rejected' status must be added explicitly.)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'accounts', 'assembly'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD  CONSTRAINT users_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'disabled'));

-- Keep updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
