# 0016 — PostHog integration: product analytics, error tracking, session replay (research + plan)

> **Status:** 🚧 In progress. **Phase 1** (this record + [`research.md`](research.md), 2026-07-16):
> research complete, approach decided. **Phase 2 — core integration shipped in PR** (2026-07-16,
> milestones 2–6): PostHog EU account created; `*.posthog.com` allow-listed in the CSP; the library +
> `analytics.js` load; manual `$pageview` on the hash router; the two users identified from `/api/me`;
> error tracking on. **Session replay added** (2026-07-16, M7): `worker-src 'self' blob:` added to the
> CSP, recording on with form inputs masked (page text visible). **Still open (deliberate opt-ins):**
> feature-flag/usage-event/survey wiring (M8) and the final reconcile (M9). See the index —
> [`README.md`](../README.md) — and the data map in [`CLAUDE.md`](../../../CLAUDE.md).

## Context

The owner wants **PostHog** in the Travel Planner and asked the three questions this effort answers:
**can it be done at $0, how, and what will it actually get me?** The full, source-cited investigation is
in [`research.md`](research.md); the short version:

- **$0 — yes.** PostHog Cloud's free tier needs **no credit card**, and with no card on file you
  **cannot be charged** (over-limit data is dropped, not billed). Free monthly allowances (1M events, 5K
  session replays, 1M flag requests, 100K error exceptions, 1,500 surveys) dwarf what 2 users generate.
  Satisfies the repo's "never attach a payment method" hard rule. **Self-hosting is rejected** — it needs
  an always-on ~16 GB VM (impossible on serverless Cloudflare; not $0/no-card anywhere).
- **The pivotal constraint is the strict CSP** ([`public/_headers`](../../../public/_headers):
  `script-src 'self'; connect-src 'self'`), the same wall that shaped 0015. PostHog's normal install
  (external CDN script + events sent to `*.i.posthog.com`) is blocked on both axes.
- **What you get worth having (2 users):** **error tracking** (free crash monitoring + alerts) and
  **session replay** (watch the exact buggy session) are the real wins; **feature flags** as a
  self-gate/kill-switch; a **few manual usage events**. The growth-analytics half of PostHog (funnels,
  retention, web analytics, experiments) is dead weight at 2 users.

**Values tension (named, not hidden):** [`DESIGN.md`](../../../DESIGN.md) sells the app's self-hosted map
as a virtue because it has *"no tiles/keys/tracking"* / no external hosts. Adding PostHog introduces
third-party **telemetry** and (with the chosen approach) **widens the strict CSP**. Accepted deliberately
for simplicity at 2-user private scale; mitigated by EU residency + DPA, memory-only persistence (no
consent banner), `respect_dnt`, `identified_only`, and masked replay text.

## Decision

| Topic | Decision |
|---|---|
| Host | **PostHog Cloud EU** (Frankfurt), free tier, **no card**. Region is permanent at signup → must be EU from the start. Self-host rejected (not $0/no-card; impossible on Cloudflare). |
| CSP approach | **(B) Allow-list `*.posthog.com`** (owner's choice — simplest). Add `https://*.posthog.com` to `script-src` + `connect-src` in [`public/_headers`](../../../public/_headers). Approach **(A) same-origin reverse-proxy** (keeps CSP pure `'self'`) is documented in [`research.md`](research.md) §2 as the alternative if CSP purity is ever reprioritised. |
| No inline scripts | The app has **no `'unsafe-inline'`** for scripts, so PostHog's inline snippet is **not** used. Load `array.js` from `eu-assets.i.posthog.com` via an external `<script src>` (now allowed) and `posthog.init()` from our own `public/analytics.js`. |
| Session replay | **Enabled (M7, 2026-07-16).** Adds **`worker-src 'self' blob:`** (rrweb's blob-URL compression worker). Masking: **form inputs masked** (PostHog default; passwords always), **page text visible** — owner's choice so replays are useful for self-debugging. Tighten later via `maskTextSelector:'*'` / `ph-no-capture` if desired. |
| Privacy | EU Cloud + self-serve DPA; **`persistence:'memory'`** (no consent banner); **`respect_dnt:true`**; **`person_profiles:'identified_only'`**; identify the 2 known emails from `/api/me`. |
| Governance | One **`code/`** branch + PR (touches `public/**` + `_headers`). **No migration**, **no MCP-worker redeploy** (browser-only). Owner-only prerequisite: PostHog EU signup + public token + $0 billing limits. |

## Milestones

1. **Record + research** — ✅ 2026-07-16. This file + [`research.md`](research.md) + index row (🚧).
2. **Owner one-time (prerequisite)** — ✅ 2026-07-16. Owner signed up at `eu.posthog.com`, created the
   project, provided the public project token, EU region confirmed.
3. **CSP edit** — ✅ 2026-07-16. Added `https://*.posthog.com` to `script-src` + `connect-src` in
   [`public/_headers`](../../../public/_headers) + updated the comment block (incl. the future `worker-src`
   note for replay).
4. **Load + init** — ✅ 2026-07-16. [`public/index.html`](../../../public/index.html): external
   `<script src="https://eu-assets.i.posthog.com/static/array.full.js">` then `analytics.js`, before
   `app.js`. New **[`public/analytics.js`](../../../public/analytics.js)** — a guarded `window.Analytics`
   wrapper; `init(me)` runs `posthog.init` (`api_host: eu.i.posthog.com`, `persistence:'memory'`,
   `respect_dnt:true`, `person_profiles:'identified_only'`, `capture_pageview:false`,
   `capture_exceptions:true`, `disable_session_recording:true`) + `identify`, deferred so demo/preview
   (mock identity) is skipped.
5. **Identify + pageviews** — ✅ 2026-07-16. [`public/app.js`](../../../public/app.js): `Analytics.init(state.me)`
   in `boot()` after `/api/me`; `Analytics.pageview(hash)` at the top of `route()` (fires on first load +
   every hash navigation).
6. **Error tracking on** — ✅ 2026-07-16 (via `capture_exceptions:true`; **zero extra CSP**). *Follow-up:*
   wire a PostHog alert (email/Slack) for new issues — a UI-only step in the PostHog app.
7. **(Opt-in) Session replay** — ✅ 2026-07-16. Added `worker-src 'self' blob:` to
   [`public/_headers`](../../../public/_headers); `disable_session_recording:false` +
   `session_recording:{ maskAllInputs:true }` in [`public/analytics.js`](../../../public/analytics.js).
   **Masking posture:** form inputs masked (passwords always), **page text left visible** so the owners
   can see their own sessions when debugging — owner's choice for testing. Tighten later with
   `maskTextSelector:'*'` or `ph-no-capture` on sensitive nodes if desired.
8. **(Opt-in) Feature flags + a few manual usage events + one survey** — ⏳ pending (`Analytics.capture(...)`
   helper is already in place for the events).
9. **Verify + reconcile** — 🔧 partial (this PR: [`CLAUDE.md`](../../../CLAUDE.md) data map). Final reconcile
   (DESIGN.md, index status, `releases.json`, GitHub About) after the opt-ins settle.

## Verification

- **Phase 1 (this turn):** the [index](../README.md) row renders; `node scripts/validate-data.mjs` stays
  green (no `public/data/**` change).
- **Phase 2 (build) — the real test is CSP fidelity:** serve under
  `npx wrangler@4 pages dev public …` with the production `_headers`, exercise the app, and confirm
  **zero CSP violations**; that the only external host contacted is **`*.posthog.com`** (no other host
  crept in) and **no `'unsafe-inline'`** was added for scripts; and that a hash-route change emits exactly
  one `$pageview`. With replay on, the only additional CSP delta is `worker-src 'self' blob:`. Confirm
  events / identify / exceptions land in the **PostHog EU** UI, and a deliberately thrown error appears as
  an issue.

## Outcome

_Phase 1 (research + decision) and the Phase 2 **core integration** shipped 2026-07-16. The app now loads
PostHog (EU Cloud) via an external `<script>` + a guarded `analytics.js`, sends a manual `$pageview` per
hash-route, identifies the two signed-in users (real prod sessions only — demo/previews are skipped), and
captures unhandled JS exceptions for error tracking — all with the CSP widened only by
`https://*.posthog.com` on `script-src` + `connect-src` (no `'unsafe-inline'`). **Session replay** (M7)
followed the same day — `worker-src 'self' blob:` added, recording on with form inputs masked and page
text visible. Feature-flag/usage-event/survey wiring (M8) and the final doc reconcile (M9) remain
deliberate follow-ups. This section will be finalised when the effort closes._
