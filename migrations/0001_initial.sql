PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Singapore',
  default_latitude REAL NOT NULL DEFAULT 1.3521,
  default_longitude REAL NOT NULL DEFAULT 103.8198,
  taste_notes TEXT NOT NULL DEFAULT '',
  default_setting TEXT NOT NULL DEFAULT 'mixed',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fragrances (
  id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES fragrances(id),
  active INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL,
  notes TEXT,
  image_url TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, profile_id)
);

CREATE TABLE IF NOT EXISTS wear_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_ids_json TEXT NOT NULL,
  worn_at TEXT NOT NULL,
  context_json TEXT NOT NULL,
  enjoyment INTEGER,
  strength TEXT,
  longevity TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wear_logs_user_worn_at ON wear_logs(user_id, worn_at DESC);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_date TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, recommendation_date, context_hash, engine_version)
);

CREATE INDEX IF NOT EXISTS recommendations_lookup
  ON recommendations(user_id, recommendation_date, context_hash, engine_version);

CREATE TABLE IF NOT EXISTS migration_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  PRIMARY KEY (user_id, source)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
