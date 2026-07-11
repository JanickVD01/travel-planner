# 0004 — In-app editing & creation (feedback refinements)

> **Status:** ✅ Shipped 2026-07-09 (PRs #19–#23). One numbered record per effort — see
> [`README.md`](../README.md) for the index.

## Context

The 12-milestone build ([`0003`](../0003-feature-expansion/)) shipped and the user then used the live
app with a real dummy trip (France, 2 weeks, Paris + Provence). Hands-on feedback surfaced a batch of
concrete gaps — some are one-line polish, some are missing data, one is an infra switch, and two are
genuinely new features (building steps and activities **from the browser**, not only by talking to
Claude). This effort turns that feedback into an executable train of small PRs.

**Outcome:** the France trip is fully explorable and editable in the browser — dates *and* times on
travel, tap-to-edit dates/times/estimates, Google Maps links, one-tap status, working photo uploads,
a demo packing list, and **guided wizards to add steps (insert anywhere on the timeline) and
activities** — all still $0, no payment method, business logic still only in `shared/core.js`.

## What the exploration confirmed (grounding)

- **Creation already works over `/api/*`.** `steps`/`activities`/`packing` routes each expose
  `POST` → `createStep`/`createActivity`/`createPacking` (HTTP 201). The wizards need **no backend
  change** — the UI simply has no create form for steps/activities yet (only packing does). Mirror
  that form + the `api → invalidateTrip → vt(route)` pattern.
- **Insert-between is a two-call move.** `flatCreate` appends at `MAX(sort_order)+10`; `flatPatch`
  can set an **integer** `sort_order` (truncates to int, needs a real JS number). So: create (lands
  at end) → PATCH `sort_order` to the integer midpoint of the two neighbors; re-space when a gap runs
  out.
- **Editable fields already modeled** — `cost_est`/`cost_actual` on steps & activities, `day` on
  activities, `arrive`/`depart`/`arrive_time`/`depart_time` on steps. No schema change anywhere;
  server PATCH already accepts them (they're spec columns). Just wire UI.
- **Map URL is duplicated in 3 mirrors** — `shared/core.js` (`rowMapsUrl`), `functions/api/_mock.js`
  (`mapsUrl`), `public/app.js` (`mapsUrl`, the browser one, `safeUrl`-gated). All three build OSM
  today; must change together.
- **Two-tap status** = after `ctrl.focus()` in `openEditor` nothing opens the native `<select>`; the
  second tap does. `showPicker()` fixes it.
- **Photo uploads 503** purely because `IMAGES_KV` isn't bound (the route self-guards on
  `!env.DB || !env.IMAGES_KV`). Needs a namespace + binding + redeploy.
- **Preview mock does not persist or echo created rows** — POST returns `{ok:true, demo:true}`. The
  wizards must not depend on the echoed row for the *real* path; optionally enhance the mock so
  previews demo the flow.

## Locked decisions

| Topic | Decision |
|---|---|
| Coordinates in the wizard | **Paste a Google Maps link or `lat, lng`** → a `parseLatLng()` helper extracts coords (`@lat,lng`, `?q=`/`query=lat,lng`, or bare `lat,lng`). Short `goo.gl`/`maps.app.goo.gl` links can't be resolved under CSP `connect-src 'self'` → hint to paste the full link/coords. Blank = no location. |
| Wizard style | **Guided multi-step** bottom-sheet (one decision per screen, Next/Back, final Review) — matches the "calmer / progressive disclosure" mandate. |
| Step dates/times | **Inline-editable on the timeline** (tap a date/time → native picker), *in addition to* being set in the wizard. |
| Maps | **Google Maps** link-out: `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (native app on mobile), `map_url` fallback preserved. |
| Packing demo | Seed France packing with **shared + mine + a placeholder `partner@example.com`** so all three owner filters demo. |
| Delivery | One `code/*` or `content/*` branch per milestone, `scripts/pr-safe-push.sh`, 4-line PR desc, CI `validate`, merge-commit; auto-merge each once `validate` passes. |

## Milestone / PR train

| # | Branch | Lands | Dep | Worker | Status |
|---|---|---|---|---|---|
| M1 | `content/plan-0004` | This record + README index row | — | n | ✅ #19 |
| M2 | `code/ui-polish` | Google Maps links · single-tap status (`showPicker`) · editable `cost_est` · editable activity `day` · inline-editable step dates/times · date+time on travel legs | — | y | ✅ #20 |
| M3 | `code/enable-kv` | Create `IMAGES_KV` namespace + bind → photo uploads go live | — | y | ✅ #22 |
| M4 | *ops* (throwaway CI branch, not merged) | Seed France packing list (travel-leg dates already present → M2 render alone fixed the display) | M2 | — | ✅ CI |
| M5 | `code/step-wizard` | Timeline "+ insert step" affordances + guided step wizard | M2 | n | ✅ #21 |
| M6 | `code/activity-wizard` | "+ add activity" + guided activity wizard (+ idempotent-create fix from review) | M5 | n | ✅ #23 |
| M7 | `content/release-notes` | `releases.json` v0.4.0 + README status → ✅ + MEMORY journal | ALL | n | ✅ |

Status legend: ✅ shipped · 🚧 in progress · ⏳ pending.

## Per-milestone detail

### M2 — `code/ui-polish` (the quick wins)
- **Google Maps** — in all three `mapsUrl`/`rowMapsUrl` mirrors, replace the OSM branch with
  `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (keep the `map_url` fallback;
  `app.js` keeps its `safeUrl()` gate).
- **Single-tap status** — after `ctrl.focus()` in `openEditor`'s select branch:
  `try { ctrl.showPicker && ctrl.showPicker(); } catch {}`. Progressive enhancement.
- **New editor input types** — extend `openEditor` with `date` → `<input type="date">` and `time` →
  `<input type="time">`; commit on `change` **and** `blur` (native pickers are single-tap; values
  already match `cleanDate`/`cleanTime`). Guarded by the existing `settled` flag.
- **Editable `cost_est`** — wrap the est display span in `editable(..., {field:"cost_est",
  input:"decimal"})` on step cards, activity cards, and the activity detail view.
- **Editable activity `day`** — wrap `dayHTML` in `editable(fmtDate(a.day) || "+ date",
  {field:"day", input:"date"})`.
- **Inline-editable step dates/times** — in `stepCardHTML` wrap `arrive`/`depart` (`input:"date"`)
  and `arrive_time`/`depart_time` (`input:"time"`), with a subtle `+ date`/`+ time` affordance when
  empty (mirror the `+ actual` pattern).
- **Date + time on travel legs** — travel branch shows `dep <fmtDate(depart)> <depart_time>` /
  `arr <fmtDate(arrive)> <arrive_time>` (each part omitted if null); stays keep the date range and
  append times when present. Keep it compact.

### M3 — `code/enable-kv` (turn photo uploads on)
- **Create the namespace** via a throwaway-branch GitHub Actions workflow running
  `npx --yes wrangler@4 kv namespace create IMAGES_KV`; read the `id` from the run log. **⚠ If create
  fails with an auth error** (token lacks Workers-KV-Edit), stop and ask the user to add the
  permission or run it locally — do not fabricate an id.
- **Bind it** — paste the id into `wrangler.jsonc` **`env.production` only** and top-level
  `worker-mcp/wrangler.jsonc`. Merge `code/enable-kv` → redeploy.

### M4 — ops: seed France data (throwaway CI branch, NOT merged to main)
- `SELECT` the France travel steps, then `UPDATE` `st-fr-1`/`st-fr-3`/`st-fr-5` to set
  `arrive`/`depart` **dates** (keep existing times) so date+time renders.
- `INSERT` a dummy packing list (`space='france-2026'`, `list='packing'`, `deleted=NULL`,
  `sort_order` in tens): shared (adapter, first-aid, sunscreen, guidebook), mine
  (`janick.vandamme@verity.global`: passport, meds, camera, running shoes), partner
  (`partner@example.com`: passport, makeup bag, paperback). Vary category/qty/packed.

### M5 — `code/step-wizard` (build steps from the browser)
- **Insertion affordances** — interleave a `<li class="tl-insert">` "+ add step here" before the
  first step, between each pair, and after the last (index in `data-index`); replace the empty state
  with a first "+ add step".
- **Guided step wizard** (bottom-sheet, Next/Back, Review): (1) kind Travel/Stay [required]; (2) core
  fields per kind with **neighbor-date hints** ("Previous step ends: …" / "Next step starts: …",
  hints only); (3) optional cost est + currency, booking status/url, paste-coords, note; (4) review →
  Create.
- **Create + reposition** — `POST steps/<slug>/flow`; if not appended at the end, PATCH the new row's
  `sort_order` to `Math.floor((prev+next)/2)` (re-space to `(i+1)*10` first if the gap is exhausted),
  then `invalidateTrip; vt(route)`. New id from the 201 `row.id` (skip reposition on the preview
  stub).
- **`parseLatLng(text)`** helper — matches `@lat,lng`, `?q=`/`query=lat,lng`, or bare `lat,lng`;
  returns `{lat,lng}` or `null` (server still runs `cleanLat`/`cleanLng`).

### M6 — `code/activity-wizard`
- "+ add activity" in each stay's activity sub-list (carries the parent `step_id`); guided wizard
  reusing M5's modal + `parseLatLng` + date inputs: (1) title [required] + day; (2) optional
  location, paste-coords, cost est + currency, book-ahead, status/url, note; (3) review → Create.
- `POST activities/<slug>/activities` with `{step_id, ...}` → `invalidateTrip; vt(route)`.

### M7 — `content/release-notes`
- Prepend `releases.json` **v0.4.0 "Plan it yourself"**; README index status for 0004 → ✅; fill this
  record's Outcome; update the `ui-upgrade-roadmap` memory journal.

## Verification

- **Per-PR:** `node scripts/validate-data.mjs` (CI-required) + demo preview on a phone.
- **Local real path:** `wrangler pages dev public --d1 DB=travel-planner-db --binding
  DEV_EMAIL=you@example.com` on a seeded local D1 — inline edits, both wizards, Google Maps links.
- **KV (M3):** upload/serve/delete a photo on the live France trip; previews still serve the mock and
  never 500.

## Key risks & mitigations

- **KV token scope** (M3) — if `kv namespace create` fails, stop and hand the user the one-command
  fallback (don't fabricate an id).
- **Integer `sort_order`** (M5) — integer midpoints, re-space when exhausted; PATCH `sort_order` as a
  **number**, not a string.
- **Preview create stub** (M5/M6) — the wizard must not read the created row on the demo path.
- **Short Google Maps links** — can't be resolved under CSP; hint to paste the full link or coords.
- **`showPicker()` support varies** — guarded in try/catch; graceful fallback.

## Outcome

Shipped 2026-07-09 across PRs #19–#23 (merge-commit only), each gated by CI `validate`.

- **Delivered:** Google Maps map links (3 mirrors); single-tap status via `showPicker()`; inline-editable
  cost estimates, activity dates, and step dates/times (new `date`/`time` editor inputs); date+time on
  travel legs; a guided step wizard with insert-anywhere + `sort_order` repositioning + paste-a-Google-
  Maps-link coordinates; a guided activity wizard; photo uploads switched on (KV bound in prod + MCP
  worker); a France demo packing list (mine / partner / shared).
- **Data note (M4):** the France travel legs already carried dates — the "time only" complaint was purely
  a render gap that M2 fixed. So M4 reduced to seeding the packing list (11 rows) via a throwaway CI job.
- **KV (M3):** the deploy token initially lacked Workers-KV permission (`kv namespace create` →
  `Authentication error 10000`); the user broadened the token, then the namespace
  (`a43ae5ff444c418f9eb8a604d50082b2`) was created via CI and bound. Both Pages + MCP worker redeployed
  green.
- **Quality gate:** an adversarial review workflow (4 dimensions → verify) ran over the whole client
  diff. It cleared inline-edit, `parseLatLng`, escaping, and mock routing, and caught one real bug — the
  wizard's non-atomic POST-then-PATCH could create a **duplicate** step if the reposition PATCH failed and
  the user retried. Fixed by memoizing the created id on the wizard state (idempotent retry) before M6 merged.
- **Not verifiable headlessly:** a real photo upload and the wizards' touch behaviour on a phone — to be
  confirmed by the user on the Access-gated production site.
