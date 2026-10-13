-- 003_region_id — regions: the planning layer above steps (effort 0017, Trip › Region › Location › Step).
-- Creates the `regions` table (+ audit + index) and adds `steps.region_id` (parent region id; free-text,
-- not an FK; NULL = no region). Apply ONCE to prod via the `migrate` workflow BEFORE merging effort 0017's
-- core PR (per CLAUDE.md). The final shape is mirrored in schema.sql.
--
-- The CREATE statements are idempotent and come FIRST on purpose: on merge, deploy-worker.yml (triggers on
-- shared/**) can run before deploy.yml re-applies schema.sql, so the table must already exist. The ALTER is
-- ADDITIVE but non-idempotent (SQLite ADD COLUMN errors if it already exists), so it is LAST, followed only
-- by the index that needs the new column.
CREATE TABLE IF NOT EXISTS regions (
  space TEXT NOT NULL, list TEXT NOT NULL, region_id TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  planned_nights TEXT,
  start_date     TEXT, end_date TEXT,
  note           TEXT,
  deleted        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, region_id)
);
CREATE INDEX IF NOT EXISTS idx_regions ON regions (space, list, sort_order);
CREATE TABLE IF NOT EXISTS regions_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, region_id TEXT,
  op TEXT NOT NULL, detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);
ALTER TABLE steps ADD COLUMN region_id TEXT;
CREATE INDEX IF NOT EXISTS idx_steps_region ON steps (space, list, region_id);
