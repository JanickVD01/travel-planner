# Travel Planner — Requirements & Design (Thailand trip)

> **What this document is.** A researched requirements + design specification for a shared trip
> planner, built as an additive extension of the existing AI-first Cloudflare scaffold in this
> repo. It is intended to feed a **later, separate session** that turns the phased roadmap below
> into a detailed, milestone-by-milestone implementation plan. It contains an authoritative data
> model, MCP/API surface, UI/UX design, budget/currency logic, a risk register, and a verification
> strategy — but **not** the line-by-line build steps.

---

## 1. Context

You and your girlfriend want to plan a trip to Thailand together. You have a Samsung (Android
Chrome) and she has an Apple device (iOS Safari); you build with VS Code + Claude Code; and you
want the whole thing to stay inside this project's hard constraints — **$0 forever, two users, an
MCP server as the primary (but not only) interface.**

The existing repo is a deliberately generic, verifiable scaffold: a no-build static SPA + `/api/*`
Pages Functions + a single domain core (`shared/core.js`) + a Cloudflare D1 database + a remote MCP
worker, all behind Cloudflare Access and shipped through a hardened GitHub PR flow. Its only entity
today is a placeholder `entries` list. The scaffold was **designed to be extended** by an
"add-a-list" pattern (~6 lines per entity), and the travel planner maps onto it cleanly.

**Intended outcome.** A friendly, mobile-first overview of the whole trip as a **vertical flow of
steps** (each step either *travel* A→B or a *stay* somewhere), each carrying dates, accommodation/
transport, bookings, activities, costs, and location — plus a **budget view** you can update in
situ, all editable by talking to Claude from your phones and viewable/tweakable in the browser.

---

## 2. Goals, scope & locked decisions

### In scope
- A **vertical, ordered timeline** of steps: `travel` steps (how you get from A→B) and `stay` steps
  (a place/city/island with a duration and activities).
- Per step: arrival & departure **dates (and times)**, location (+ map link), accommodation or
  transport details, **booking status + booking-document link**, and an **estimated + actual cost**.
- Per stay: a nested list of **activities**, each with its own cost, an **"advance booking needed"**
  flag, booking status/link, and location.
- A **budget view**: total estimated, total actual, remaining-vs-target, projected, and a category
  breakdown — all in EUR, with per-line THB↔EUR display.
- A **pre-trip checklist**, plus an auto-derived "needs advance booking" section.
- **MCP tools** so the entire trip can be built/edited by talking to Claude (phone app, Claude Code
  CLI, or Claude Code web), and a **browser UI** for viewing and light edits.

### Locked decisions (from requirements Q&A)
| # | Decision |
|---|---|
| D1 | **Web UI = view + light edits.** The browser shows the timeline/budget/checklist and lets you tweak field-level values (cost estimate, actual cost, cost currency, booking status, booking link, notes, mark-done, and — on the budget view — the FX rate & budget target). **Adding and reordering steps is done via Claude/MCP.** |
| D2 | **Budget = estimated + actual.** Every cost has a planned estimate and an actual amount; the view shows total est, total actual, remaining-vs-target and a projection. **No per-person splitting.** |
| D3 | **Currency = dual THB + EUR.** Each amount is entered in THB or EUR; totals are shown in **EUR** using a **single conversion rate stored on the trip**. Home currency = EUR. |
| D4 | **Extras in scope:** map links per location; booking-document links (URLs to confirmations/tickets/booking pages); a pre-trip checklist. |

### Out of scope (v1)
- PWA / offline mode / push notifications (iOS Safari support is unreliable; the app is
  online-first and "add-to-home-screen"-friendly only).
- Cost splitting / who-paid / settle-up between the two of you.
- Multi-currency beyond THB + EUR; historical/locked FX snapshots (conversion is always live).
- Drag-to-reorder in the browser (reordering is an MCP/Claude action).
- Any charting library, build step, or external runtime dependency.

---

## 3. Non-functional requirements

- **$0 free tier, always.** Never attach a payment method to Cloudflare (free tier errors instead
  of billing). Everything uses free primitives: Pages, D1 (5 GB), Workers, **SQLite** Durable
  Objects (`new_sqlite_classes`), the in-worker rate-limit binding, and Cloudflare Access (free
  ≤ 50 users — two is trivial).
- **Two users, shared.** A single shared trip; both have full read/write; every change is
  attributed to the actor's email in an immutable audit log. No per-user private data.
- **Cross-platform.** Works on desktop browsers, **Android Chrome**, and **iOS Safari**. Mobile-
  first, responsive, dark/light theme (already in the scaffold).
- **AI-first.** MCP is the primary editing surface; the browser is the primary *viewing* surface
  and a light-edit surface. Business logic lives **only** in `shared/core.js`, so the API and Claude
  can never disagree.
- **Safe parallel delivery.** All changes ship through the repo's existing PR flow: one task = one
  branch (`code/*` or `content/*`) = one PR; `scripts/pr-safe-push.sh`; `validate` gate + demo-mode
  preview; merge-commit-only to prod. Previews never get a `DB` binding (demo data only).

---

## 4. Canonical data model (the authoritative column dictionary)

> This section is the single source of truth for entities, scoping, columns, cleaners, and enum
> values. It resolves the divergences surfaced during design review. All columns are `TEXT`
> (the engine is flat: `(space, list, id)` rows, no foreign keys, no nesting, no type enforcement);
> validation is done by pluggable `clean*` functions, exactly like the existing `cleanDate`/
> `cleanStatus`. Each entity is wired with the repo's ~6-line add-a-list pattern.

### 4.1 Scoping model
| Entity | `space` | `list` | Notes |
|---|---|---|---|
| **trips** (registry + config) | `app` | `trips` | One row per trip. Its `slug` becomes the `space` of that trip's child rows. Global, cross-trip config lives here (FX rate, budget target). |
| **steps** (the vertical flow) | trip slug, e.g. `thailand-2026` | `flow` | Single table; `kind` = `travel`\|`stay`. `sort_order` **is** the timeline order. |
| **activities** | trip slug | `activities` | One list; each row links to its step via a free-text `step_id`. Grouped under steps client-side. |
| **checklist** | trip slug | `checklist` | **Reuses the existing `entries` table** (cols `title/note/status/due`). No new table. |

Router mapping is direct: `#/thailand-2026/flow`, `#/thailand-2026/activities`, `#/thailand-2026/checklist`, plus friendly trip routes `#/trip/<slug>[/budget|/checklist]` (see §6).

### 4.2 New cleaners (add to `shared/core.js`, mirroring `cleanDate`/`cleanStatus`)
```js
// numbers / money — stored as TEXT, full precision, rounded only at display
export function cleanNumber(v){ const n=Number(v); return (v==null||v===""||!Number.isFinite(n))?null:String(n); }
export function cleanMoney(v){  const n=Number(v); return (v==null||v===""||!Number.isFinite(n)||n<0)?null:String(n); }
// enums — default to the safe/first value on anything unexpected (like cleanStatus)
export function cleanKind(v){ return String(v)==="travel"?"travel":"stay"; }                       // default stay
const TRANSPORTS=["plane","train","bus","ferry","car","other"];
export function cleanTransport(v){ return (v==null||v==="")?null:(TRANSPORTS.includes(String(v))?String(v):"other"); }
export const BOOKINGS=["Idea","Planned","Booked","Confirmed"];
export function cleanBooking(v){ return BOOKINGS.includes(String(v))?String(v):"Idea"; }             // default Idea
export const CCYS=["THB","EUR"];
export function cleanCcy(v){ return CCYS.includes(String(v))?String(v):"THB"; }                      // default THB
export function cleanYesNo(v){ return (String(v)==="yes"||v===true)?"yes":"no"; }                    // default no
export function cleanTime(v){ return /^\d{2}:\d{2}$/.test(String(v))?String(v):null; }               // HH:MM or null
```

### 4.3 `trips` — registry & trip-wide config (`space='app'`, `list='trips'`)
| Column | Cleaner | Meaning |
|---|---|---|
| `title` | — | e.g. "Thailand 2026" |
| `slug` | — | e.g. `thailand-2026`; the `space` key for all child rows |
| `home_ccy` | `cleanCcy` | display/home currency (default `EUR`) |
| `thb_per_eur` | `cleanNumber` (nullable) | **the single FX rate: 1 EUR = N THB (~39)**. Conversion: `EUR = amount_thb / thb_per_eur` |
| `budget_target_eur` | `cleanMoney` (nullable) | budget target, in EUR |
| `start_date` / `end_date` | `cleanDate` (nullable) | trip bounds |
| `note` | — | free text |

### 4.4 `steps` — travel + stay in one table (`space=<slug>`, `list='flow'`)
`kind` discriminates; each kind leaves the other's columns empty. **One primary cost pair per step**
(accommodation cost for a stay; fare/ticket cost for a travel leg). Activities carry their own costs.
| Column | Cleaner | travel | stay |
|---|---|---|---|
| `kind` | `cleanKind` | `travel` | `stay` |
| `title` | — | "Fly BKK→CNX" | "Chiang Mai" |
| `location` | — | route "BKK → CNX" | place "Chiang Mai" *(required free text)* |
| `map_url` | — | optional | optional map link *(D4)* |
| `arrive` / `arrive_time` | `cleanDate` / `cleanTime` (nullable) | arrival date/time | check-in date/time |
| `depart` / `depart_time` | `cleanDate` / `cleanTime` (nullable) | departure date/time | check-out date/time |
| `accom_name` | — | — | hotel/guesthouse name |
| `transport` | `cleanTransport` (nullable) | plane/train/bus/ferry/car/other | — |
| `carrier` | — | "AirAsia FD3446" | — |
| `cost_est` / `cost_actual` | `cleanMoney` (nullable) | fare estimate/actual | accommodation estimate/actual |
| `cost_ccy` | `cleanCcy` | governs both est & actual | governs both est & actual |
| `booking_status` | `cleanBooking` | Idea\|Planned\|Booked\|Confirmed | Idea\|Planned\|Booked\|Confirmed |
| `booking_url` | — | ticket/confirmation link *(D4)* | hotel confirmation link *(D4)* |
| `note` | — | free text | free text |

`sort_order` (engine-native INT) is the vertical order; new steps get `max+10` (gap-insert). Multi-
leg travel days = **one travel step per leg** (documented convention; the model needs nothing extra).

### 4.5 `activities` — hang off a stay via free-text `step_id` (`space=<slug>`, `list='activities'`)
| Column | Cleaner | Meaning |
|---|---|---|
| `step_id` | — | id string of the parent step (NOT FK-enforced) |
| `title` | — | "Elephant sanctuary" |
| `location` | — | optional |
| `map_url` | — | optional map link *(D4)* |
| `day` | `cleanDate` (nullable) | optional date within the stay |
| `needs_advance` | `cleanYesNo` | `yes` ⇒ surfaces in checklist's "needs advance booking" section |
| `cost_est` / `cost_actual` | `cleanMoney` (nullable) | per-activity estimate/actual |
| `cost_ccy` | `cleanCcy` | governs both |
| `booking_status` | `cleanBooking` | Idea\|Planned\|Booked\|Confirmed |
| `booking_url` | — | booking-page/ticket link *(D4)* |
| `note` | — | free text |

Add index `idx_activities_step ON activities (space, list, step_id, sort_order)` for the group-by-step
read; ordering within a step = the global `sort_order` restricted to a `step_id` group.

### 4.6 checklist — **reuses the existing `entries` table** (`space=<slug>`, `list='checklist'`)
Existing columns fit exactly: `title`, `note`, `status` (Open\|Doing\|Blocked\|Done — the checkbox
state), `due` (booking deadline). **No schema change, no new cleaners.** The "needs advance booking"
list is a **derived, read-only view** computed from `activities` where `needs_advance='yes'` (always
in sync; nothing stored, no de-dupe problem). `entries`/`createEntry` etc. already exist in the repo.

### 4.7 Honest limits of the flat model + mitigations
- **No cascade delete.** Deleting a step orphans its activities. → MCP `delete_step` warns if any
  activities reference it; `delete_step_deep` cascades (deletes children then the step, all audited).
- **No referential integrity on `step_id`.** → On read, activities whose `step_id` matches no step
  render in an **"Unassigned"** bucket (never silently dropped). On write, `add_activity` can
  validate the `step_id` exists.
- **No joins/transactions across lists.** The timeline is built from ≤3 reads (trips + steps +
  activities); totals are computed by a shared helper. Trivial at trip scale (tens of rows).
- **FX rate is a live snapshot** (no per-row EUR cache) — editing the rate re-converts all THB
  totals immediately. Accepted per D3.

---

## 5. MCP tool surface (the primary interface)

All tools are **thin wrappers over `shared/core.js`** — the same functions `/api/*` calls — so Claude
and the UI never diverge. Reads/writes go through the generic `flat*` engine; composite read tools
are **new pure functions in `shared/core.js`** (so both MCP and API reuse them). Actor = the verified
Cloudflare Access email (stamped into the audit log); rate-limited 120 req/min per email.

### 5.1 Tools
- **Trip config:** `get_trip`, `set_trip` *(title, `thb_per_eur`, `budget_target_eur`, dates)*.
- **Steps (CRUD):** `list_steps`, `add_step`, `edit_step`, `delete_step`, `delete_step_deep`.
- **Steps (friendly wrappers):** `add_stay` *(place, arrive, nights|depart, accommodation, cost, ccy…)*,
  `add_travel` *(from, to, mode, date/time, cost, ccy…)*. These compute `title`/`location`, derive
  `depart` from `nights` when given, then delegate to `createStep`.
- **Activities (CRUD):** `list_activities` *(optionally by `step_id`)*, `add_activity`, `edit_activity`,
  `delete_activity`.
- **Checklist (CRUD over `entries`):** `list_checklist`, `add_checklist`, `edit_checklist`,
  `delete_checklist`.
- **Composites (the ergonomic layer):**
  - `get_trip_overview` → the whole itinerary as nested JSON (steps in order, each stay with its
    activities, each amount pre-converted to EUR) — Claude's single read model.
  - `get_budget` → server-side EUR totals (est/actual/remaining/projected + category breakdown).
  - `reorder_step` *(absolute position)* / `move_step` *(before/after a target)* → patch `sort_order`.
  - `set_booking` *(step or activity: status + optional URL)*.

Shared Zod atoms: `TRIP=z.string()`, `DATE=/^\d{4}-\d{2}-\d{2}$/`, `TIME=/^\d{2}:\d{2}$/`,
`CCY=z.enum(["THB","EUR"])`, `BOOKING=z.enum(["Idea","Planned","Booked","Confirmed"])`,
`KIND=z.enum(["travel","stay"])`. **`booking_url` is a plain optional string** (must accept
Drive/Dropbox/PDF/app deep-links — do *not* enforce strict `.url()`).

### 5.2 Connection & auth (both users, from their phones)
- The MCP worker is already fronted by **Cloudflare Access with Managed OAuth** (OAuth 2.1 + PKCE,
  JWT verified offline via JWKS) — exactly what Claude custom connectors speak.
- **One-time setup per user, on claude.ai web:** *Settings → Connectors → Add custom connector →*
  the worker's `/mcp` URL. Complete the Access email one-time-PIN once. The connector then **syncs to
  the iOS and Android Claude apps and Desktop** automatically — after that, both of you just talk to
  Claude from your phones.
- Both emails go on the **Cloudflare Access allow-list** (free ≤ 50). For MCP, each person needs
  their **own Claude account**; **use personal accounts** — work Google Workspace accounts often have
  connectors admin-disabled. Claude Code CLI (`claude mcp add --transport http …`) and Claude Code web
  are the other two supported surfaces.
- Composite tools are coarse-grained on purpose (e.g. `get_trip_overview` = one MCP request that does
  N DB reads internally) to conserve the per-email rate budget.

### 5.3 Example transcript (NL → tool)
1. "Set our trip: 21 days, budget €4000, 39 baht to the euro." → `set_trip`
2. "Add a 4-night stay in Chiang Mai arriving Nov 8th, hotel Tamarind Village ~8000 baht." → `add_stay`
3. "Ferry Krabi→Ko Lanta on the 14th, about €25." → `add_travel`
4. "In Chiang Mai add an elephant sanctuary — 2500 baht, needs booking ahead." → `add_activity`
5. "What's our total so far and how much is left?" → `get_budget`
6. "Mark the Bangkok hotel booked, here's the confirmation link." → `set_booking`
7. "Move the ferry before the Ko Lanta stay." → `move_step`
8. "Show me the whole itinerary." → `get_trip_overview`

---

## 6. Web UI / UX (view + light edits)

Vanilla JS, template strings, `esc()`, no libraries, no build. Reuses the existing CSS-variable
design system (`.panel/.card/.chip`, dark-first, responsive @720px). Adds ~90 lines of CSS.

### 6.1 Views & routes
- **Home (`#/`)** — trip cards from the `('app','trips')` registry (fetched once). Each links to its
  timeline. (This replaces the placeholder `app.json` `lists[]` cards — one source of truth.)
- **Timeline (`#/trip/<slug>`)** — the signature view: a vertical connector line with round step
  markers; each step is a `.card` showing a kind icon (✈ train 🚆 ferry ⛴ bus 🚌 car 🚗 / stay 🛏 📍),
  title, `arrive → depart` (with times when set), location + `map ↗` link, accommodation/carrier, a
  **booking-status chip**, cost (entered ccy **+ € equivalent**, est vs actual), and a `booking ↗`
  link. **Stay steps nest their activities** as indented sub-cards (title, cost, a "needs advance
  booking" flag chip, booking link). A one-line hint: *"Tap a value to edit it. To add or reorder
  steps, ask Claude."*
- **Budget (`#/trip/<slug>/budget`)** — totals (est / actual / remaining-vs-target / projected) in a
  panel with a **pure-CSS progress bar** (turns red past 100%), a **category breakdown** (accommodation
  / transport / activities) as proportional div-width bars, and a per-step list. No chart library.
- **Checklist (`#/trip/<slug>/checklist`)** — (1) manual pre-trip to-dos from `entries` with a
  done-toggle; (2) an auto-derived **"needs advance booking"** section from activities.
- A per-trip sub-nav (Timeline / Budget / Checklist) as a sticky chip-tab row for mobile.

### 6.2 The "view + light edits" boundary (D1)
Inline-editable in the browser (whitelist): on steps & activities — `cost_est`, `cost_actual`,
`cost_ccy`, `booking_status`, `booking_url`, `note`; on checklist entries — `status` (done toggle);
on the **budget view** — `thb_per_eur` and `budget_target_eur`. **Not editable in the browser:**
title, kind, dates, location, adding/reordering/deleting steps → all via Claude/MCP.

Implementation: one small reusable `editable()` helper renders each value as a click target carrying
`data-*` coordinates; a single delegated listener swaps it for an `<input>`/`<select>`, and on
`blur`/`change` fires a `PATCH /api/<entity>/<slug>/<list>/<id>` then re-renders. Money inputs use
**`inputmode="decimal"`** (not `type=number`) for correct iOS keypads and to avoid Safari quirks.
Server-side cleaners coerce/validate, so a bad value is safely normalized.

### 6.3 Client state
Cache the loaded trip bundle in `state.trip[slug]` = `{trip, steps, activities}` so Timeline↔Budget↔
Checklist tab-switching is instant (Budget & Checklist are pure derivations). Every successful PATCH
calls `invalidateTrip(slug)` then re-renders, so totals recompute from fresh data. `api()` itself
stays uncached; the cache lives one layer up, per trip.

### 6.4 Mobile & "add to home screen"
Timeline collapses cleanly (absolute markers, full-width cards, wrapping cost line). Tap targets
≥ 44px. Sticky topbar + sticky sub-nav. Add (no PWA machinery): `<meta name="theme-color">` per
scheme, `apple-mobile-web-app-title`, and a single 180×180 `apple-touch-icon` for a proper
home-screen icon on both phones.

---

## 7. Budget & currency logic

- **FX rate:** one `thb_per_eur` on the trip (1 EUR = N THB, ~39). Canonical conversion, in one
  shared helper: `toEur(amt, ccy, rate) = amt==null ? null : (ccy==='EUR' ? amt : amt/rate)`.
  Amounts are stored in their entry currency; conversion is **always live** (no cached EUR).
- **Definitions (all EUR):** `Total Estimated` = Σ est_eur; `Total Actual` = Σ act_eur;
  `EstOfUnspent` = Σ est_eur where est≠null ∧ actual=null; `Remaining` = target − TotalActual;
  `Projected` = target − TotalActual − EstOfUnspent (negative ⇒ forecast overspend).
- **Categories** derived from row type: accommodation ← stay steps, transport ← travel steps,
  activities ← activity rows (cannot drift out of sync).
- **Display rounding only:** EUR to cents (`€40.00`), THB to whole baht (`฿1,560`). Storage never
  rounds. Per D3 the primary totals are **EUR**; per-line shows entered-ccy + € equivalent (a
  whole-trip THB-equivalent subtotal is an easy optional addition to the budget summary).
- **Shared helper (core invariant):** `computeBudget(rate, target, steps, activities)` is a **pure**
  function in `shared/core.js`; `getBudget(env, {space}, actor)` reads the three lists and calls it.
  Both `/api/budget/<slug>` and the MCP `get_budget` tool call `getBudget` — parity is guaranteed and
  unit-testable. Missing/zero/garbage rate ⇒ `getBudget` throws `422 no_rate` **before** any division
  (never `NaN`/`Infinity`); the budget view prompts to set the rate.
- **Half-entered data:** `cleanMoney` maps empty/garbage/negative to `null`; nulls contribute to no
  sum. "Actual but no estimate" and "estimate but no actual" are both well-defined (see definitions).

---

## 8. Risk register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Free-tier overrun | Low | Med | Never attach a payment method (free tier errors, never bills). All primitives free (SQLite DO, rate-limit, D1, Pages, Access ≤50). |
| R2 | 2nd user can't get access / no usable Claude account | Med | High | Add her email to the Access allow-list (Pages **and** the MCP app AUD). Web UI = email OTP, zero setup. MCP = her **personal** Claude account (Free is enough; work accounts may block connectors); connector added once on web, syncs to mobile. |
| R3 | iOS Safari quirks in light-edit | High | Med | `inputmode="decimal"` (not `type=number`); commit on blur + explicit affordance; ≥44px targets; `Intl.NumberFormat` for money; real-device test. |
| R4 | Concurrent edits clobber | Med | Low | Last-write-wins by design; partial PATCH (different fields never collide); every write audited (actor + before/after in `detail`) → fully recoverable/attributable. |
| R5 | Accidental delete | Med | Med | Hard delete but audited (recoverable by replaying audit); no cascade; `delete_step` warns when activities remain; prefer status/archive over delete where possible. |
| R6 | Secret leakage | Low | High | Only secret = Cloudflare API token, only in GitHub repo secrets. `TEAM_DOMAIN`/`POLICY_AUD`/account/D1 ids are non-secret. No token in client/D1/`.env`. |
| R7 | Demo preview touches prod D1 | Low | High | Structural: preview env has `d1_databases:[]` + `DEMO_API=1`; mock serves only when `!env.DB && DEMO_API=1`; a lost prod binding fails loud (500). **Every new `/api/*` route needs a `_mock.js` branch** or previews 404. |
| R8 | Schema migration ordering | Med | High | Apply migrations to prod D1 **before** merge. Additive-only `ALTER`s in `migrations/NNN_*.sql`, then mirror final shape into idempotent `schema.sql`. New tables are `CREATE IF NOT EXISTS`. PR notes the `migration none/NNN` line. |
| R9 | Bad FX/target corrupts totals | Med | Med | `cleanMoney`/`cleanNumber` validate; `getBudget` throws `422 no_rate` on bad rate before dividing; rate changes are audited on the trips row. |

---

## 9. Assumptions & the one open item

- **Resolved by this spec** (were inconsistent across design passes; now locked): single `steps`
  table with `kind`; single `activities` list keyed by `step_id`; checklist reuses `entries`; FX =
  `thb_per_eur` with `EUR = thb/rate`; booking enum `Idea|Planned|Booked|Confirmed`; money stored
  full-precision as string; advance flag = `needs_advance` (`yes|no`); dates are source of truth and
  `nights` is always derived; time-of-day added via `arrive_time`/`depart_time`.
- **Open (minor, defaulted):** whether the budget summary should also show a **whole-trip THB
  subtotal** alongside EUR. Defaulted to *EUR-primary with per-line THB shown*; a THB grand-total is
  a one-line addition if wanted. Not blocking.

---

## 10. Proposed phasing (feeds the later implementation-planning session)

> Detailed, milestone-by-milestone build steps are intentionally deferred to a separate session, as
> requested. This is the recommended shape and the thin first slice.

- **Phase 0 — Lock the column dictionary.** §4 above *is* this artifact; treat it as canonical.
- **Phase 1 — Thin end-to-end vertical slice.** `cleanMoney/cleanCcy/cleanBooking/cleanYesNo/cleanKind/
  cleanTransport/cleanTime` + `FLAT_SPECS.trips` + `FLAT_SPECS.steps` + wrappers; schema blocks; route
  copies + `_mock.js` branches; MCP `set_trip`/`add_stay`/`add_travel`/`list_steps`/`edit_step`; UI
  home card → timeline (steps only) → one inline edit (`cost_actual`); seed the Thailand trip + rate +
  target. **Done = "Claude adds a stay from the phone; it shows in the browser timeline; I edit its
  actual cost inline; it persists."**
- **Phase 2 — Activities + nesting + derived advance-booking section** (+ `get_trip_overview`).
- **Phase 3 — Budget view** (`computeBudget`/`getBudget`, `/api/budget` + mock + MCP `get_budget`,
  in-situ rate/target/cost edits; smoke test asserts MCP == API parity).
- **Phase 4 — Checklist (manual) + reorder + `delete_step_deep` + "Unassigned" bucket + empty states
  + mobile polish + both-user connector setup.**
- **Phase 5 — Hardening:** two-device pass, migrate-before-merge drill, audit-recovery check,
  live-reconversion check.

---

## 11. Verification strategy (how to prove it works)

1. **Local D1 + real API:** `wrangler d1 execute … --local --file=./schema.sql` then
   `wrangler pages dev public --d1 DB=travel-planner-db --binding DEV_EMAIL=you@…`; seed a trip
   (`thb_per_eur=39`, `budget_target_eur=4000`) + a few steps/activities; hit `GET /api/budget/<slug>`
   and verify by hand (`1560 THB → €40.00`; EUR passes through; totals per §7). Flip the rate, confirm
   live re-conversion.
2. **MCP smoke (parity):** `cd worker-mcp && npm run dev && npm run smoke`; extend it to call
   `get_budget` and assert equality with `/api/budget` (same `getBudget` ⇒ proves no divergence).
3. **`node scripts/validate-data.mjs`** (required CI gate) green locally.
4. **Demo preview:** push via `scripts/pr-safe-push.sh code/<branch>`, open the PR, confirm the
   demo-mode preview renders from `_mock.js` (proves R7 + mock branches exist) and edits don't persist.
5. **Apply migration to prod D1 before merge** (R8), then merge (merge-commit only).
6. **Two-device manual pass:** Android Chrome + iOS Safari edit costs, mark booked, toggle an
   advance-booking activity (confirm it surfaces in the checklist), watch totals update; have the 2nd
   user run an MCP edit from the Claude mobile app and confirm it appears in the other's browser
   (proves R2 access + R4 concurrency + audit attribution).

---

## 12. Critical files (where the work lands)
- `shared/core.js` — new cleaners; `FLAT_SPECS.trips/steps/activities` + 5 wrappers each; the
  composite `computeBudget`/`getBudget`/`tripOverview` and friendly `add_stay`/`add_travel` helpers.
  **All business logic lives here.**
- `schema.sql` — `trips`/`steps`/`activities` tables + `_audit` + indexes (idempotent). `entries`
  (checklist) needs no change. `ALTER`s → `migrations/NNN_*.sql` applied to prod before merge.
- `functions/api/<entity>/[[path]].js` — copy `functions/api/entries/[[path]].js` per entity; plus
  read routes `/api/overview/<slug>` and `/api/budget/<slug>`.
- `functions/api/_mock.js` — a branch per new route (or previews 404).
- `worker-mcp/src/mcp.js` — `registerTool` for the ~20 tools with Zod schemas, each delegating to a
  core wrapper via `self.run`. `worker-mcp/src/index.js` needs no change (auth/rate-limit/actor already
  correct).
- `public/app.js` / `public/styles.css` / `public/index.html` — router branches; `loadTrip`/
  `invalidateTrip`; timeline/budget/checklist views; `editable()` helper + delegated listener; money
  formatters; ~90 lines of CSS; theme-color/apple-touch-icon meta.
