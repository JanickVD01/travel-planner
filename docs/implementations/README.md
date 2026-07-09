# Implementation history

A committed log of every implementation effort in this project — what we built, why, and how it
shipped. **One numbered record per effort** (`NNNN-slug.md`); update the **Status** column here as an
effort's milestones land.

**Convention.** A new, distinct effort gets the next ordinal. Each record follows the shape:
*Context → Decisions → What shipped (milestones / PRs) → Verification → Outcome*. Larger efforts (like
`0003`) carry a full milestone plan and are updated in place as each milestone PR merges. See the data
map in [`CLAUDE.md`](../../CLAUDE.md) for where this folder fits.

| # | Title | Date | Status | PRs |
|---|---|---|---|---|
| [0001](0001-ui-design-brief.md) | UI design brief — `DESIGN.md` taste contract | 2026-07-08 | ✅ Shipped | #5 |
| [0002](0002-design-directions.md) | Three design directions → **Direction C** chosen | 2026-07-08 | ✅ Decided (mockups throwaway) | #6 (closed unmerged) |
| [0003](0003-feature-expansion.md) | Feature expansion — the 12-milestone build (Direction C) | 2026-07-08 | ✅ Shipped (M1–M12) | #7–#17 |
| [0004](0004-ui-editing-and-creation.md) | In-app editing & creation — feedback refinements (Google Maps, tap-to-edit, wizards, KV) | 2026-07-09 | ✅ Shipped | #19–#25 |
| [0005](0005-budget-detail-included-maps.md) | Budget depth, step detail, included-costs, map-URL-first & doc reconciliation | 2026-07-09 | ✅ Shipped | #26–#31 |
| [0006](0006-mcp-connector-redirect-uri.md) | claude.ai web/mobile connector fix — Managed-OAuth redirect-URI allowlist | 2026-07-09 | ✅ Shipped | #33 |
| [0007](0007-mobile-copy-values.md) | Mobile fix — long-press to copy a value (selectable span, not a button) | 2026-07-09 | ✅ Shipped | #34 |
| [0008](0008-timeline-declutter-delete.md) | Timeline cards slimmed to title/dates/status + "Delete step" in detail | 2026-07-09 | ✅ Shipped | #35 |
| [0009](0009-mobile-card-polish.md) | Mobile polish — "Lodging" label + stacked title/dates/status line | 2026-07-09 | ✅ Shipped | #37 |
| [0010](0010-pinned-step-photo.md) | Pinned step photo — a chosen image as the card's background (readability-guaranteed) | 2026-07-09 | 🚧 In progress | — |

Status legend: ✅ shipped/decided · 🚧 in progress · 🅿️ paused · ❌ abandoned.

**Standing convention (since 0005):** every effort's **final milestone is a Reconciliation pass** — bring
`CLAUDE.md`, `DESIGN.md`, the `MEMORY` journal, `README.md`, `public/data/app.json`, this folder's index,
and the **GitHub About** into line with the decisions that shipped, so the project's self-description never
drifts back toward the generic scaffold.

**0003 build summary:** all 12 milestones merged — design foundation (tokens/fonts/anime, light-primary),
trips + metro Timeline, inline editing, activities + nesting + coordinates, activity detail + notes,
Budget page, Packing list (owner filters), photo attachments (KV), Trash (restore/delete-forever),
and a strict CSP. One optional one-time step remains to switch photo uploads on:

## Enabling photo uploads (Workers KV) — one-time, ~2 min

Photo/screenshot attachments (M9) store image **bytes** in a Workers KV namespace. The code is live
and guarded; until KV is bound, uploads return a friendly "photo uploads aren't set up yet" (503) and
everything else works normally. To turn uploads on ($0 — KV is on the free Workers plan, no card):

1. From the repo root: `npx --yes wrangler@4 kv namespace create IMAGES_KV` → copy the returned `id`.
2. In `wrangler.jsonc`, inside **`env.production`** only (NOT `preview`), add:
   `"kv_namespaces": [ { "binding": "IMAGES_KV", "id": "<paste-id>" } ]`
3. In `worker-mcp/wrangler.jsonc`, add the **same** binding at top level (so MCP purges delete the bytes).
4. Open a normal `code/` PR and merge to redeploy. Uploads now work.

(Both wrangler files already contain a commented stub showing exactly where to paste.)
