CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password text NOT NULL, sample boolean NOT NULL DEFAULT false, workspace jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY, owner uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires timestamptz NOT NULL);

