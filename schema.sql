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

-- ===== Travel-planner entities (docs/implementations/0003). New tables => no migration;
-- every content table carries `deleted` (ISO ts, NULL = live) so soft-delete needs no ALTER. =====

-- trips: registry + trip-wide config. space='app', list='trips'; `slug` becomes the space of child rows.
CREATE TABLE IF NOT EXISTS trips (
  space TEXT NOT NULL, list TEXT NOT NULL, trip_id TEXT NOT NULL,
  title             TEXT NOT NULL DEFAULT '',
  slug              TEXT,
  home_ccy          TEXT NOT NULL DEFAULT 'EUR',
  thb_per_eur       TEXT,                        -- 1 EUR = N THB (~39); EUR = thb / rate
  budget_target_eur TEXT,
  start_date        TEXT, end_date TEXT,
  note              TEXT,
  deleted           TEXT,                         -- ISO timestamp; NULL = live
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, trip_id)
);
CREATE INDEX IF NOT EXISTS idx_trips ON trips (space, list, sort_order);
CREATE TABLE IF NOT EXISTS trips_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, trip_id TEXT,
  op TEXT NOT NULL,                               -- create|update|delete|restore|purge|seed
  detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);

-- steps: the vertical timeline. space=<slug>, list='flow'; kind = travel|stay; sort_order IS the order.
CREATE TABLE IF NOT EXISTS steps (
  space TEXT NOT NULL, list TEXT NOT NULL, step_id TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'stay',    -- travel | stay
  title          TEXT NOT NULL DEFAULT '',
  location       TEXT NOT NULL DEFAULT '',
  map_url        TEXT,
  lat            TEXT, lng TEXT,                   -- one central coordinate (link-out to maps)
  arrive         TEXT, arrive_time TEXT,
  depart         TEXT, depart_time TEXT,
  accom_name     TEXT,
  transport      TEXT, carrier TEXT,
  cost_est       TEXT, cost_actual TEXT,
  cost_ccy       TEXT NOT NULL DEFAULT 'THB',      -- governs both est & actual
  booking_status TEXT NOT NULL DEFAULT 'Idea',     -- Idea|Planned|Booked|Confirmed
  booking_url    TEXT,
  included       TEXT NOT NULL DEFAULT '0',       -- '1' = cost covered by another ticket (hidden + excluded from budget)
  note           TEXT,
  deleted        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, step_id)
);
CREATE INDEX IF NOT EXISTS idx_steps ON steps (space, list, sort_order);
CREATE TABLE IF NOT EXISTS steps_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, step_id TEXT,
  op TEXT NOT NULL, detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);

-- activities: things to do, hung off a step. space=<slug>, list='activities'; step_id = parent step
-- id (free-text, not an FK); sort_order orders within a step. needs_advance = yes|no.
CREATE TABLE IF NOT EXISTS activities (
  space TEXT NOT NULL, list TEXT NOT NULL, activity_id TEXT NOT NULL,
  step_id        TEXT NOT NULL DEFAULT '',       -- parent step id (free-text, not an FK)
  title          TEXT NOT NULL DEFAULT '',
  location       TEXT,
  map_url        TEXT,
  lat            TEXT, lng TEXT,                   -- one coordinate (link-out to maps)
  day            TEXT,                             -- ISO date or NULL
  needs_advance  TEXT NOT NULL DEFAULT 'no',       -- yes | no (book/reserve ahead?)
  cost_est       TEXT, cost_actual TEXT,
  cost_ccy       TEXT NOT NULL DEFAULT 'THB',      -- governs both est & actual
  booking_status TEXT NOT NULL DEFAULT 'Idea',     -- Idea|Planned|Booked|Confirmed
  booking_url    TEXT,
  included       TEXT NOT NULL DEFAULT '0',       -- '1' = cost covered by another ticket (hidden + excluded from budget)
  note           TEXT,
  deleted        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_activities_step ON activities (space, list, step_id, sort_order);
CREATE TABLE IF NOT EXISTS activities_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, activity_id TEXT,
  op TEXT NOT NULL, detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);

-- packing: the packing list, one row per item. space=<slug>, list='packing'. owner = 'shared' or a
-- person's email (lowercased); packed = '0'|'1'; qty = int>=1 or NULL. Replaces the old to-do checklist.
CREATE TABLE IF NOT EXISTS packing (
  space TEXT NOT NULL, list TEXT NOT NULL, packing_id TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  owner          TEXT NOT NULL DEFAULT 'shared',   -- 'shared' | person's email
  packed         TEXT NOT NULL DEFAULT '0',         -- '0' | '1'
  category       TEXT,
  qty            TEXT,                              -- integer >= 1 or NULL
  note           TEXT,
  deleted        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, packing_id)
);
CREATE INDEX IF NOT EXISTS idx_packing ON packing (space, list, sort_order);
CREATE TABLE IF NOT EXISTS packing_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, packing_id TEXT,
  op TEXT NOT NULL, detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);

-- attachments (M9): photo METADATA. space=<slug>, list='attachments'. Image BYTES live in Workers KV
-- (binding IMAGES_KV) at key att/<slug>/<attachment_id>; only /api/image/** ever touches the bytes.
-- parent_type = step|activity; kv_key is rebuilt server-side from slug+id (never trusted from a client).
CREATE TABLE IF NOT EXISTS attachments (
  space TEXT NOT NULL, list TEXT NOT NULL, attachment_id TEXT NOT NULL,
  parent_type    TEXT NOT NULL DEFAULT 'step',      -- step | activity
  parent_id      TEXT NOT NULL DEFAULT '',          -- parent step/activity id (free-text, not an FK)
  kv_key         TEXT NOT NULL DEFAULT '',          -- KV key holding the bytes: att/<slug>/<attachment_id>
  caption        TEXT,
  content_type   TEXT,                              -- image/* whitelist value or NULL
  size           TEXT,                              -- byte count (integer as TEXT) or NULL
  pinned         TEXT NOT NULL DEFAULT '0',         -- '1' = this photo is the parent step's card background (one per parent; see migrations/002)
  deleted        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, attachment_id)
);
CREATE INDEX IF NOT EXISTS idx_attachments_parent ON attachments (space, list, parent_type, parent_id, sort_order);
CREATE TABLE IF NOT EXISTS attachments_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, attachment_id TEXT,
  op TEXT NOT NULL, detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
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
