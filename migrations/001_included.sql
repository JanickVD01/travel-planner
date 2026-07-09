-- 001_included — add the "included in another cost" flag to steps + activities.
-- '1' = this cost is covered by another ticket; hidden on the card and excluded from the budget.
-- ADDITIVE, non-idempotent (SQLite ADD COLUMN errors if it already exists) — apply ONCE to prod
-- before merging effort 0005 (per CLAUDE.md). The final column shape is mirrored in schema.sql.
ALTER TABLE steps ADD COLUMN included TEXT NOT NULL DEFAULT '0';
ALTER TABLE activities ADD COLUMN included TEXT NOT NULL DEFAULT '0';
