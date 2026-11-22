CREATE TABLE IF NOT EXISTS desk_pdfs (
  id uuid PRIMARY KEY,
  owner uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest text NOT NULL,
  title text NOT NULL,
  pages jsonb NOT NULL,
  UNIQUE(owner,digest)
);
