PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ml_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  title TEXT,
  price REAL,
  original_price REAL,
  currency_id TEXT,
  seller_id TEXT,
  captured_at INTEGER NOT NULL,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_resource_time
  ON price_snapshots (resource_id, captured_at DESC);
