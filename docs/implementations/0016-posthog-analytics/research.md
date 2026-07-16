# 0016 · Research — PostHog in a $0, strict-CSP, no-build Cloudflare app

> Companion to the [effort record](README.md). This is the "can it be done, at $0, and what will it
> actually get me?" investigation the owner asked for — every answer filtered through **this app's hard
> constraints** (strict CSP · $0/no-card · no build step · 2 private users · EU/GDPR). Findings were
> gathered by a 10-agent research pass (6 web dimensions + 4 adversarial fact-checks) against current
> (2026) official PostHog sources; the load-bearing claims were re-verified to *refute* them before being
> written here. Sources are linked inline. Written 2026-07-16.

## 0. The constraints that decide everything

### What is a CSP (plain language)

A **Content-Security-Policy** is one line the server sends the browser with every page — a **security
rulebook**. The browser reads it and then *refuses* to load or run anything the rulebook doesn't
explicitly allow. Think of it as a **guest list / bouncer** for the page. This app ships a deliberately
strict one in [`public/_headers`](../../../public/_headers):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
```

The two directives that decide this feature:

- **`script-src 'self'`** — the browser will only run JavaScript **from this same origin**. An external
  `<script src="https://other.com/x.js">` is refused, and — because there is **no `'unsafe-inline'`**
  keyword for scripts — an **inline** `<script>…code…</script>` block is refused too. (The app
  externalised even its tiny theme-before-paint code into
  [`theme-init.js`](../../../public/theme-init.js) precisely to avoid ever needing `'unsafe-inline'`;
  see the comment in [`public/index.html`](../../../public/index.html).)
- **`connect-src 'self'`** — JavaScript on the page may only `fetch`/XHR **to this same origin**. Any
  attempt to send data to another server is refused.

This strict CSP is an **anti-XSS backstop**: if an attacker ever injected a script, these rules stop it
both from executing and from exfiltrating data. The repo treats it as a point of pride — effort **0015**
self-hosted an entire map engine (D3 + Natural Earth JSON) rather than weaken it, and
[`DESIGN.md`](../../../DESIGN.md) sells *"no tiles/keys/tracking"* / no external hosts as a feature.

### The other hard rules

1. **$0, and never attach a payment method** (`CLAUDE.md` hard rules). Anything that could bill, or that
   needs a card even to sign up, is disqualifying.
2. **No build step** — `public/` is served as-is; scripts are classic `<script>` tags (the one precedent
   for a library is a self-hosted file in [`public/vendor/`](../../../public/vendor), e.g. `d3.min.js`).
3. **2 private users behind Cloudflare Access**, storing **personal trip data**, owner **EU-based** (GDPR).

Everything below is judged against these five constraints.

## 1. Is it $0? — billing & the no-card guarantee  *(verdict: YES — confirmed)*

PostHog Cloud's free tier is a genuine fit for the "never attach a card" rule.

- **No credit card to sign up or to run the free tier.** [posthog.com/pricing](https://posthog.com/pricing)
  labels the Free plan *"No credit card required"*; there is no trial clock, minimum spend, or annual
  contract. A card is required **only** to unlock pay-as-you-go / paid overages.
- **With no card on file you cannot be charged.** When you exceed a free monthly allowance, additional
  data is **permanently dropped** (and feature flags return a default, quota-limited response) — *not*
  billed. ([pricing FAQ](https://posthog.com/pricing);
  [billing docs](https://posthog.com/docs/billing/common-questions).) Being charged requires having
  added a card to enable pay-as-you-go, so a card-less account is effectively a hard $0 cap.
- **Belt-and-suspenders:** you can set a per-product **billing limit** (down to effectively $0) —
  *"we will stop ingesting and processing your data so you are not charged over the set limit"*
  ([limits & alerts](https://posthog.com/docs/billing/limits-alerts)). Alert emails fire at 80 % / 100 %.
  (Mostly relevant only *if* a card is ever added.)

**Free monthly allowances** (reset monthly; unused amounts do **not** roll over):

| Product | Free / month | Enough for 2 users? |
|---|---|---|
| Product analytics events | **1,000,000** | Astronomically — a rounding error |
| Session replay (web) | **5,000** recordings (+2,500 mobile) | Yes; 1-month retention on free |
| Feature flag requests | **1,000,000** | Yes |
| Error-tracking exceptions | **100,000** | Yes |
| Surveys | **1,500** responses | Yes |
| Data warehouse rows | **1,000,000** | N/A (not needed) |
| LLM / AI observability | **100,000** events | N/A (no in-app LLM) |

Source: [posthog.com/pricing](https://posthog.com/pricing), accessed 2026-07-16. **EU and US Cloud have
identical free tiers and pricing** — only data-residency differs. The only real risk in a no-card setup
is *silent data loss* after a cap (e.g. a runaway autocapture loop), never a surprise bill — and at
2-user scale you use a tiny fraction of every allowance, so a cap is unreachable in normal use.

**Gotchas (none can bill a card-less account):** add-ons like Group Analytics and Identified-events
person-profiles meter separately (each 1M/month free, then per-event), and CDP/data-pipeline exports
meter too — but all are usage-capped-and-dropped without a card, and only activate if you turn them on.
([addons](https://posthog.com/addons).)

## 2. Integrating under the strict CSP  *(the pivotal question)*

PostHog's normal install does exactly the two things the CSP forbids: it (a) loads its script from
PostHog's CDN (`*-assets.i.posthog.com`) → blocked by `script-src 'self'`, and (b) sends events to
`*.i.posthog.com` → blocked by `connect-src 'self'`. Pasted in as-is, the browser **silently refuses
both** and you get nothing. Two documented ways resolve it:

### (A) Same-origin reverse proxy — keeps the CSP pure `'self'`  *(documented alternative)*

Vendor a **no-external** SDK bundle (`posthog-js/dist/module.full.no-external` / `array.full.no-external.js`
— all extensions pre-bundled so nothing lazy-loads a remote script), served from your own origin, **and**
run a same-origin proxy so ingest is first-party. On Cloudflare Pages the proxy must be a **Pages Function**
(`functions/relay/[[path]].js`) — `_redirects` cannot proxy an external origin
([CF redirects](https://developers.cloudflare.com/pages/configuration/redirects/)). Routing
([proxy reference](https://posthog.com/docs/advanced/proxy/proxy-reference)):

```
/relay/static/*  →  https://eu-assets.i.posthog.com/static/*
/relay/array/*   →  https://eu-assets.i.posthog.com/array/*
/relay/*  (else) →  https://eu.i.posthog.com/*
```

Client: `posthog.init(token, { api_host: '/relay', ui_host: 'https://eu.posthog.com' })`. The Function
must **strip the `cookie` + `Cf-Access-Jwt-Assertion` headers** (never leak the two users' SSO identity
to PostHog), preserve the exact path + query (PostHog uses trailing-slashed `/e/`, `/flags/`, `/decide/`),
and forward `X-Forwarded-For` only if you *want* geo. This is what effort 0015 would have done; it keeps
`script-src`/`connect-src` at pure `'self'`. Runs on the CF free tier (Pages Functions:
100,000 invocations/day). PostHog documents this pattern for exactly the CSP case:
*"All you would have to do with your CSP … is ensure this domain is permitted rather than PostHog ones."*
([CSP doc](https://posthog.com/docs/advanced/content-security-policy),
[reverse proxy](https://posthog.com/docs/advanced/proxy).)

### (B) Allow-list `*.posthog.com` in the CSP — **CHOSEN** (simplest)

Add PostHog's host to the two directives it needs:

```
script-src  'self' https://*.posthog.com;
connect-src 'self' https://*.posthog.com;
```

(`https://*.posthog.com` matches both `eu.i.posthog.com` and `eu-assets.i.posthog.com` — CSP host
wildcards match any subdomain ending in `.posthog.com`.) Then, because there is **no `'unsafe-inline'`**,
we do **not** paste PostHog's inline snippet; we load the library as an **external** file and init from
our own file:

```html
<!-- external, from PostHog's CDN — allowed by script-src … *.posthog.com -->
<script src="https://eu-assets.i.posthog.com/static/array.js"></script>
<!-- our own file on our own origin — allowed by 'self' -->
<script src="analytics.js"></script>
```

with `analytics.js` holding `posthog.init('phc_…', { api_host: 'https://eu.i.posthog.com',
ui_host: 'https://eu.posthog.com', … })`. **No proxy, no vendored bundle.** With `script-src` now allowing
`*.posthog.com`, the SDK may also lazy-load its extensions (recorder, surveys) straight from the CDN, so
the standard `array.js` is fine (no need for the no-external build). The only capability added to the CSP
is *"load / talk to `*.posthog.com`"* — **not** *"run inline scripts."*

**Tradeoff (accepted, recorded in the [record](README.md)):** (B) widens the strict CSP to trust an
external host — a conscious departure from the zero-external-host thesis. If that host (or a subdomain)
were ever compromised it becomes a script + data-exfil path; and ad-blockers may drop some
`*.posthog.com` requests. At 2-user private scale the security delta is modest and the simplicity wins.
(A) remains available if CSP purity is ever reprioritised.

### Common to both approaches

- **Session replay needs one extra directive: `worker-src 'self' blob:`.** rrweb runs its compression in
  a Web Worker created from a `blob:` URL; with no `worker-src` the policy falls back to `script-src 'self'`,
  which blocks `blob:`. PostHog's own recommended CSP includes `worker-src 'self' blob: data:`. So
  **enabling replay is the one thing that touches the CSP a second time** — hence it's an explicit opt-in.
  (Fact-check verdict: *partly-true* on "no relaxation at all" — replay is the exception.)
- **Surveys** inject inline **styles**, already covered by the existing `style-src 'self' 'unsafe-inline'`.
- **`img-src 'self' data: blob:`** already covers replay/UI images.
- **Toolbar** can only load at runtime from `us/eu.posthog.com`; behind Cloudflare Access it's moot anyway.
- **Avoid** Hedgehog mode (needs `script-src 'unsafe-eval'`) and heatmaps/toolbar embedding (need
  `frame-ancestors https://*.posthog.com`, conflicting with the app's `frame-ancestors 'none'`). None are
  needed here. ([CSP doc](https://posthog.com/docs/advanced/content-security-policy).)

## 3. What's actually worth enabling at 2 users

PostHog is a suite; most of it is built for traffic this app will never have. Honest verdict:

| Product | Value at 2 private users | Enable? |
|---|---|---|
| **Error tracking** | Highest-value: auto-captures unhandled JS errors with stack traces, groups them into issues, ties to a release, and **alerts** (email/Slack/Discord/Teams/webhook). Effectively free crash monitoring. | **✅ Yes** |
| **Session replay** | Per-*session*, not per-population: watch the exact reconstructed session where you or your partner hit a bug. A real solo-debugging superpower. Costs the `worker-src blob:` CSP add + careful masking (see §4). | **✅ Yes (opt-in)** |
| **Feature flags** | Gate a half-built feature to your own email; kill-switch without a redeploy; JSON remote-config. Percentage rollouts/experiments are meaningless at 2 users. | **〜 Handy** |
| **Usage analytics** | Only a handful of **manual** events as a lightweight usage/debug log ("map opened", "save failed"). Funnels/retention/cohorts/paths are statistical noise at 2 users. | **〜 A few manual events** |
| **Surveys** | Could pop an in-app question, but you can just talk to each other. Free, marginal. | **〜 Optional** |
| Web analytics · Experiments · Data warehouse · LLM analytics | Near-useless or N/A (no acquisition story; no statistical power; no external data; in-app LLM work happens in Claude via the MCP server, not the browser). | **✗ Skip** |

Error-tracking specifics: the browser SDK defaults are `capture_unhandled_errors: true` and
`capture_unhandled_rejections: true` (console errors off by default); explicit paths use
`posthog.captureException(err)` (never hand-roll `capture('$exception')`). Source-map upload is supported
(less critical here — the app ships unminified). GA since ~April 2025, 100K exceptions/month free.
([error tracking](https://posthog.com/docs/error-tracking),
[capture](https://posthog.com/docs/error-tracking/capture),
[alerts](https://posthog.com/docs/error-tracking/alerts).)

## 4. Privacy / GDPR / EU residency

- **Pick EU Cloud at signup — it's effectively permanent.** `eu.posthog.com` is an independent instance in
  AWS **eu-central-1 (Frankfurt, Germany)**; `us.posthog.com` is Virginia. Region is chosen at account
  creation; migrating US→EU is **not** self-serve and is gated to paid Scale/Enterprise plans, so signing
  up on EU up front is a hard requirement, not a preference.
  ([GDPR](https://posthog.com/docs/privacy/gdpr-compliance),
  [migrate](https://posthog.com/docs/migrate/migrate-to-cloud).)
- **DPA is self-serve and free:** generate + download a counter-signed Data Processing Agreement (EU/UK
  SCCs, Swiss FADP) at `app.posthog.com/legal`. ([dpa](https://posthog.com/dpa).) Sub-processors are a
  short, auditable list — for EU Cloud, data-at-rest sits in Germany (AWS, PlanetScale, Modal); Cloudflare
  is the global edge. ([subprocessors](https://posthog.com/subprocessors).)
- **EU Cloud disables IP capture by default** — a GDPR advantage over US Cloud.
  ([analytics privacy](https://posthog.com/docs/product-analytics/privacy).)
- **Client-side footguns to set correctly:**
  - posthog-js sets a **first-party cookie by default** (`localStorage+cookie`, 365-day expiry) → an
    ePrivacy consent trigger. To avoid a consent banner entirely for a private app, use
    **`persistence: 'memory'`** (or `cookieless_mode: 'always'`) so nothing is stored on the device.
    ([persistence](https://posthog.com/docs/libraries/js/persistence),
    [data collection](https://posthog.com/docs/privacy/data-collection).)
  - Session replay **masks form inputs by default (passwords always), but NOT ordinary page text.** A
    replay of itinerary/step screens would therefore record trip destinations, dates and notes verbatim.
    → for this personal-data app, enable **`maskAllText`** and/or add **`ph-no-capture`** to itinerary
    containers, or leave replay off. Masking runs client-side, so masked data never leaves the device.
    ([replay privacy](https://posthog.com/docs/session-replay/privacy).)
  - **`respect_dnt: true`** (defaults to *false*) to honour Do-Not-Track / GPC.
  - **`person_profiles: 'identified_only'`** is already the default (good data-minimisation).
  - Right-to-be-forgotten deletion is trivial at 2 users (delete a person in the UI / API).

## 5. No-build mechanics for THIS app

- **Loading (approach B):** two external `<script src>` tags in
  [`public/index.html`](../../../public/index.html) — PostHog's `array.js` from `eu-assets.i.posthog.com`,
  then our own `analytics.js` — placed before `app.js`. No inline snippet (keeps `'unsafe-inline'` out).
  The **project token is a public write-only key**, not a secret — consistent with the repo's secret
  rules (hard-code it in `analytics.js`).
- **Pageviews on a hash router:** this app is a **pure hash router** —
  [`public/app.js`](../../../public/app.js#L1777) does `window.addEventListener('hashchange', () => vt(route))`
  and navigates via `location.hash`; it never calls `history.pushState`. PostHog's automatic
  `capture_pageview: 'history_change'` hooks the History API and would **miss every in-app navigation**
  (PostHog's SPA tutorial says so explicitly for hash routers). → set **`capture_pageview: false`** and
  fire `posthog.capture('$pageview')` manually inside the existing `route()`/`hashchange` handler (it also
  runs on first load). ([SPA pageviews](https://posthog.com/tutorials/single-page-app-pageviews),
  [config](https://posthog.com/docs/libraries/js/config).)
- **Identify the 2 users (no anonymous phase):** the client already learns the signed-in email —
  `/api/me` → `state.me.email` ([`public/app.js`](../../../public/app.js#L170)). Call
  `posthog.identify(state.me.email, { email: state.me.email })` in `boot()` right after `/api/me`.
  Produces exactly 2 person profiles. Free tier is 1M events/month **regardless** of anonymous vs
  identified, so the choice is about analytics quality, not cost.
  ([identify](https://posthog.com/docs/product-analytics/identify).)
- **Runtime network calls to expect** (all allowed once `connect-src` includes `*.posthog.com`):
  ingestion (`/e/`, `/i/v0/e/`, `/batch/`), the feature-flag config call (`/flags`, formerly `/decide`)
  on init, and remote config (`/array/<token>/config.js`). If you don't use flags, the `/flags` call can
  be suppressed (`advanced_disable_flags` / `advanced_disable_feature_flags` — confirm the exact name for
  the installed version). ([js library](https://posthog.com/docs/libraries/js).)

## 6. Self-host vs Cloud  *(verdict: Cloud EU is the only realistic $0 path — confirmed)*

Self-hosting PostHog (open-source, MIT) is real but **not viable here**:

- Requires an **always-on Linux VM ≈ 4 vCPU / 16 GB RAM / >30 GB disk** (ClickHouse + Kafka + Zookeeper +
  Postgres + Redis). ([self-host](https://posthog.com/docs/self-host).)
- **Impossible on Cloudflare** — Pages/Workers is serverless with no always-on VM and no containers on the
  free plan. You'd rent a VM elsewhere (~€15–30/mo) — money **and** a card. Every "always-free" VM tier is
  either too small (GCP e2-micro ~1 GB) or needs a card (Oracle Always Free fits the specs but requires a
  card at signup — disqualified by the hard rule).
- Self-hosted is also **feature-crippled** (many products Cloud-only), caps around ~300 K events/month,
  and ships with **no support**. ([open-source disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer).)

PostHog itself steers everyone to Cloud (*"literally never seen this math work out"* for self-hosting).
→ **Cloud EU free tier**, no card.

## 7. Bottom line

- **$0?** Yes — PostHog Cloud EU free tier, **no card**, over-limit data dropped (never billed), and 2-user
  usage is a rounding error against every allowance. Self-hosting fails $0/no-card outright.
- **How?** **Allow-list `*.posthog.com`** on `script-src` + `connect-src` (owner's choice), load `array.js`
  externally + init from our own `analytics.js` (no inline snippet, no proxy, no vendoring). Manual
  `$pageview` on `hashchange`; `identify` the 2 known emails. Session replay costs one extra directive
  (`worker-src 'self' blob:`) and careful text-masking, so it's a deliberate opt-in.
- **What you get (worth having):** **error tracking** (free crash monitoring + alerts) and **session
  replay** (watch the exact buggy session) are the real wins; **feature flags** as a self-gate/kill-switch;
  a **few manual usage events**; surveys if you want them. The growth-analytics half of PostHog is dead
  weight at 2 users.
- **The cost that isn't money:** you widen a CSP the project is proud of, and you send first-party trip
  telemetry to a third party. Mitigated by EU residency + DPA, memory-only persistence (no consent
  banner), `respect_dnt`, `identified_only`, and masked replay text.

### Open questions to confirm at build time

- Exact `array.js` behaviour when loaded as a bare external script without the inline stub (it should
  self-define `window.posthog`; verify init ordering — load `array.js` **before** `analytics.js`).
- Does session replay strictly need `worker-src 'self' blob:`, or does current posthog-js fall back to a
  main-thread compressor when the blob worker is CSP-blocked? (Verify in a preview; watch the console.)
- Exact current option name to suppress the `/flags` init call (`advanced_disable_flags` vs
  `advanced_disable_feature_flags`).
- Surveys free allowance is **1,500**/month on the current pricing page (older third-party pages say 250) —
  confirm in-product at signup.
- Confirm the self-serve **DPA** is available on a **free** EU org.
- Confirm `respect_dnt` still defaults to *false* in the installed version before relying on it.
