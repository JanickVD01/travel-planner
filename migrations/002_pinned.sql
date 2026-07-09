-- 002_pinned — add the "pinned" flag to attachments (effort 0010).
-- '1' = this photo is its parent step's card background (at most one pinned per parent; enforced in
-- shared/core.js setPinned, not by a DB constraint). ADDITIVE, non-idempotent (SQLite ADD COLUMN errors
-- if it already exists) — apply ONCE to prod before merging effort 0010 (per CLAUDE.md). The final
-- column shape is mirrored in schema.sql.
ALTER TABLE attachments ADD COLUMN pinned TEXT NOT NULL DEFAULT '0';
