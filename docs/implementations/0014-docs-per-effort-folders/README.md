# 0014 — `docs/implementations/` → one folder per effort

> **Status:** 🚧 In progress (2026-07-11). A structural change to this folder: each effort becomes a
> **folder** whose record is its `README.md`. Docs-only; no code, schema, migration, or worker change.
> The top-level index — [`README.md`](../README.md) — stays put. See the data map in
> [`CLAUDE.md`](../../../CLAUDE.md).

## Context

Efforts used to be single flat files `docs/implementations/NNNN-slug.md`. As features get more
involved, an effort needs room for more than one document. The concrete driver: a place to record
**changes made to a feature after it shipped** — so a future session can be pointed at one
implementation and catch up on its whole story, not just the frozen ship-time record.

We considered a separate per-effort `MEMORY.md` sidecar but chose **not** to add one: the record
itself already carries the decisions, and a second file invites drift over which is authoritative.
Instead the "memory" is **folded into the record** as an append-only `## Later changes` section.

## Decision

| Topic | Decision |
|---|---|
| Layout | Each effort is a folder `docs/implementations/NNNN-slug/`; the record moves inside as **`README.md`**. GitHub auto-renders a folder's `README.md`, so clicking the folder shows the record, and the index links become clean folder links (`NNNN-slug/`). |
| Index | The top-level `docs/implementations/README.md` index **stays put** (unmoved), so its `../../CLAUDE.md` link is unchanged. |
| Post-ship memory | When a *shipped* effort is later modified by a change too small to warrant a new numbered effort, append a dated **`## Later changes`** entry to that effort's `README.md` (append-only, newest last) rather than editing the frozen Outcome. No separate file, no empty backfill. |
| History | Records' historical prose/diagrams that name records by their old flat filename are **left intact** (they aren't links, so they don't rot). Only genuine links that would break are rewritten. |
| Safety | Nothing globs/parses/link-checks `docs/` (`scripts/validate-data.mjs` scans only `public/data/**`; no CI triggers on `docs/**`), and Pages serves only `public/`. So the only risk was silent dead links — closed by an exhaustive link-rewrite pass. |

## What ships

- All 13 existing records (`0001`–`0013`) moved via `git mv` into `NNNN-slug/README.md` (history preserved).
- Every internal link rewritten for the new depth: record→index `](../README.md)`, record→sibling
  `](../NNNN-slug/)`, record→repo-root `](../../../…)` (anchors preserved); index→record `](NNNN-slug/)`.
- `DESIGN.md`: its 4 clickable links to records (0003, 0008, 0010, 0011) repointed to the folders.
- `CLAUDE.md` + this folder's index header: the record-first rule and layout description updated to the
  folder/`README.md` form, plus the `## Later changes` convention documented.
- This record, born in the new layout.

## Verification

- `grep` shows **no** remaining `](README.md)` / `](NNNN-slug.md)` links and no `](../../…)` inside
  moved records (all now `](../../../…)`); the index's `](../../CLAUDE.md)` untouched.
- Folder-click on GitHub renders each record; `public/app.js#L…` anchors resolve.
- `node scripts/validate-data.mjs` green (unaffected; run per convention).

## Outcome

All 13 prior records (`0001`–`0013`) moved via `git mv` into `NNNN-slug/README.md` (git tracked every
one as a rename — history preserved; `0003` a pure rename with no body change). Every internal link was
rewritten for the new depth and both grep checks came back clean (no `](00NN-slug.md)` flat links, no
two-level `](../../…)` inside a moved record); `DESIGN.md`'s 4 record links repoint to the folders;
`CLAUDE.md` + the index now describe the folder layout and the `## Later changes` post-ship convention.
`node scripts/validate-data.mjs` green (it never read `docs/`). Docs-only, repo-side — Pages serves
`public/`, so the live site is unchanged.

