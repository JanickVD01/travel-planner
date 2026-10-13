-- 004_todos — a free-form trip to-do list (effort 0020): table + audit + index. Apply ONCE to prod via the
-- `migrate` workflow BEFORE merging the todos PR (per CLAUDE.md): on merge, deploy-worker.yml (triggers on
-- shared/** + worker-mcp/**) can run before deploy.yml re-applies schema.sql, and the MCP to-do tools must
-- find the table. Idempotent (IF NOT EXISTS) — safe to re-run. The same block is mirrored in schema.sql.
CREATE TABLE IF NOT EXISTS todos (
  space TEXT NOT NULL, list TEXT NOT NULL, todo_id TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  done           TEXT NOT NULL DEFAULT '0',         -- '0' | '1'
  note           TEXT,
  deleted        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT,
  PRIMARY KEY (space, list, todo_id)
);
CREATE INDEX IF NOT EXISTS idx_todos ON todos (space, list, sort_order);
CREATE TABLE IF NOT EXISTS todos_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, list TEXT NOT NULL, todo_id TEXT,
  op TEXT NOT NULL, detail TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);
