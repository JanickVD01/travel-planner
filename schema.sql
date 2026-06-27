-- Full D1 schema. Idempotent: re-applying is safe (CREATE IF NOT EXISTS / INSERT OR IGNORE).
-- CI re-applies this to prod whenever it changes on main (see .github/workflows/deploy.yml).
--   npx --yes wrangler@4 d1 execute travel-planner-db --remote --file=./schema.sql   (production)
--   npx --yes wrangler@4 d1 execute travel-planner-db --local  --file=./schema.sql   (local dev)
--
-- Every row is scoped by (space, list). For a travel planner the natural mapping is
-- space = a trip (e.g. 'tokyo-2026'), list = a category within it (e.g. 'itinerary').
-- `entries` is the generic PLACEHOLDER list; repeat this CREATE + its _audit + index per real list.

CREATE TABLE IF NOT EXISTS entries (
  space      TEXT    NOT NULL,
  list       TEXT    NOT NULL,
  entry_id   TEXT    NOT NULL,
  title      TEXT    NOT NULL DEFAULT '',
  note       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'Open',
  due        TEXT,                              -- ISO date or NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT,
  updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_entries ON entries (space, list, sort_order);

-- Append-only audit for entries.
CREATE TABLE IF NOT EXISTS entries_audit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  space    TEXT NOT NULL,
  list     TEXT NOT NULL,
  entry_id TEXT,                                -- '*' for list-level ops (seed/reorder)
  op       TEXT NOT NULL,                       -- create|update|delete|seed
  detail   TEXT,                                -- JSON of the change (optional)
  actor    TEXT NOT NULL,
  at       TEXT NOT NULL
);

-- OPTIONAL roles layer: who may edit, plus an audit. Super-admin comes from env (SUPER_ADMIN_EMAIL).
CREATE TABLE IF NOT EXISTS role_members (
  role_key TEXT NOT NULL, email TEXT NOT NULL, added_by TEXT, added_at TEXT,
  PRIMARY KEY (role_key, email)
);
CREATE TABLE IF NOT EXISTS role_members_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, role_key TEXT NOT NULL, email TEXT NOT NULL,
  op TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL
);

-- One-time seed flags, if you need them.
CREATE TABLE IF NOT EXISTS meta ( k TEXT PRIMARY KEY, v TEXT );
