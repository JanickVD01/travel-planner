# DESIGN.md — Travel Planner

The **taste contract** for this app's look and feel. Everything visual is measured against it.

> **Read this before any UI change.** It is the durable record of *why the app looks the way it
> does*; `public/tokens.css` is the machine-readable half (the shipped tokens). This file is the
> single source of visual intent — the way `shared/core.js` is the single source of business logic.
>
> **Status:** **locked and shipped.** The chosen direction is **C "Transit Line"** (metro/route look),
> calmer via progressive disclosure; palette is the warm light-primary set with the coral accent
> `#C8542F`; fonts are **Space Grotesk / Instrument Sans / Spline Sans Mono** (self-hosted). All live
> in `public/tokens.css` + `public/styles.css` since effort 0003 — the hex values below are the
> shipped targets, not drafts.

---

## 1. Brand adjectives — the north star

Two adjectives, held in tension on purpose:

- **Crisp & precise** — a confident grid, tight tabular figures, exacting alignment, restraint.
  Structure you can trust with money and dates. (Linear/transit-diagram rigor.)
- **Warm & editorial** — it should feel like a *travel journal*, not a dashboard: generous type, a
  distinctive display face, warm paper tones, a sense of story. (Airbnb/Polarsteps warmth.)

**Thesis:** *precise structure carrying editorial warmth.* The skeleton (timeline, budget, chips)
is engineered and legible; the surface (type, color temperature, the one accent) is warm and
human. When a decision is ambiguous, ask: **does it make the app more precise, or more warm — and
does it betray the other half?** Neither adjective may win completely on any single screen.

Secondary qualities that fall out of the two: **calm** (one accent, not a rainbow), **tactile**
(satisfying press/toggle states), **honest** (money and status are never ambiguous).

---

## 2. Reference apps (admired) — what we take, what we leave

We **read and translate** these into hand-written vanilla CSS. We never copy assets, fonts, or code.

### Airbnb — our *warmth-through-restraint* anchor
- **Take:** a **warm-neutral base ramp** (warm-tinted grays, never blue-slate) — the single cheapest
  way to buy "editorial" in pure CSS. **Single-voltage accent** (Rausch `#FF385C`): exactly *one*
  accent element per view (primary CTA / active tab / Confirmed chip / budget fill), never body text.
  A **radius ramp** (8 buttons · 12 cards · 16 hero · 9999 pills). A **soft-lift shadow** used
  sparingly (`0 0 0 1px …, 0 2px 6px …, 0 4px 8px …`), swapped for a hairline border in dark mode.
  **Pill status chips** (Confirmed/Pending vocabulary → our Idea/Planned/Booked/Confirmed). The
  **dual-value price block** (big bold primary figure + small muted secondary line) → our THB + €.
- **Leave:** full-bleed pro **photography on everything** (we have sparse/no images — photo-only
  cards render as broken plates); Airbnb's **marketing-scale whitespace** (too airy for a phone
  planner — dial to *balanced*); **Cereal** the typeface (proprietary — use a Fontsource analog);
  the near-borderless grid on **data-dense screens** (Budget/Checklist need containment). Airbnb does
  **not** give us the timeline spine — that's Polarsteps' job.

### Polarsteps — our *journey-as-a-drawn-line* anchor (most relevant)
- **Take:** the **single continuous spine** — the trip *is* the drawn line threading every step in
  date order. **Two node grammars on one line:** a **STAY** = filled marker + solid segment (you
  dwell here); a **TRAVEL** leg = ringed/hollow marker + dashed segment with a transport glyph (you
  are moving A→B). Markers **punch onto the line** via a canvas-colored ring so the spine reads
  continuous but never bleeds through a dot. **Warm paper canvas** (not white). **Sticky trip hero**
  (cover + scrim + title/dates) doubling as the View-Transition anchor from the Home card. The
  **draw-on motion** (spine grows top→down, markers pop in sequence) — the "route unfurling" feeling,
  free in CSS.
- **Leave:** the **live Mapbox map** (needs their SDK/tiles/keys — violates $0/no-deps; we render our
  own CSS spine instead); reliance on **beautiful user photos at scale** (hold up text/data-first
  with a warm placeholder); the **chromeless viewer** UI (they *show* finished trips; we *edit*
  plans — we need visible chips, forms, budget bars, edit affordances they hide). Its coral stays a
  rare structural accent (spine / active step / CTA / over-budget), never a general UI color.

---

## 3. Locked parameters

| Parameter | Decision | Notes |
|---|---|---|
| **Density** | **Balanced** | Comfortable on a phone but scannable; ~44px+ targets, a few cards per screen. Not Airbnb-airy, not power-user-dense. |
| **Primary theme** | **Light-primary** | Light is the default; dark is a fully-polished, contrast-checked alternate. |
| **Target devices** | **Mobile-first**: Android Chrome + iOS Safari, thumb-operated by both partners. Desktop is secondary (centered max-width). |
| **Motion** | anime.js v4 (vendored) + CSS transitions + View Transitions API — **all** behind `prefers-reduced-motion`. |

> ⚠ **Migration note for Phase 3 (light-primary flips the scaffold).** The shell currently defaults
> to **dark** — the theme-before-paint script in `public/index.html:8-10` falls back to `dark`, and
> `public/styles.css:2` defines dark on `:root` with light as the `[data-theme="light"]` override.
> Phase 3 must **invert** this: light on `:root`, dark under `[data-theme="dark"]` /
> `@media (prefers-color-scheme: dark)`, and flip the boot-script fallback to `light`. Also sync
> `public/data/app.json` `accent` (today `#4aa3ff`) to the chosen accent.

---

## 4. Subject-world vernaculars → the three Phase-1 directions

The app should borrow the visual grammar of a **real travel object**, not generic SaaS. Phase 1
builds three throwaway mockup pages — each a different vernacular and a different balance of the two
adjectives — for a side-by-side phone review. All three are **light-primary**, render the same
hardcoded Thailand content (timeline + budget + checklist), and stay within the $0/vanilla stack.

| # | Name | Vernacular | Balance (crisp ↔ warm) | Leans on | Signature move |
|---|---|---|---|---|---|
| **A** | **Gate & Stub** | Boarding-pass / ticket-stub | ~60 / 40 (crisp-leaning) | Airbnb | Perforated ticket-stub card: pure-CSS punch-notches + dashed tear line + mono fare/confirmation block; "gate" status pills (HOLD→SCHEDULED→CHECKED-IN→BOARDING). |
| **B** | **Field Notes** | Field-notebook / travel journal | ~70 / 30 (warm-leaning) | Polarsteps | Editorial serif display (Fraunces) + rubber-stamp status motif over a ruled baseline grid; the connector *is* the notebook margin rule. |
| **C** | **Transit Line** | Transit-map / route schematic | ~75 / 25 (crisp-leaning) | Polarsteps | Mode-coded route line (rail=solid, flight=dashed, ferry=dotted) + interchange-station markers + a legend key; the most literal reading of the brief. |

**Timeline treatment per direction** (the signature screen):
- **A** — dashed "flight-path" thread; markers are punch-holes (TRAVEL carries a mode glyph, STAY is
  a solid dot); TRAVEL = compact stubs, STAY = key-card panels, activities = indented mini-stubs.
- **B** — a single warm margin rule; hand-inked dots / wax-seal circles; TRAVEL = one-line italic
  annotations, STAY = journal cards with a stamped date header, activities = bulleted marginalia.
- **C** — left-aligned line whose **stroke style encodes transport mode**; STAY = double-ring
  interchange (sized up for more nights); TRAVEL rides *on* the line as thin segment labels;
  activities branch off as sub-stations on a short spur (must collapse gracefully on narrow phones).

**Known risks to judge on the phone:** A can turn gimmicky/cluttered (reserve perforations for
travel legs, mono for codes/figures only); B can tip twee/skeuomorphic and cream can fail AA
(restrain texture, watch contrast); C can read cold and demands strict colorblind-safe/AA mode
color discipline. Synthesis (Phase 2) is expected to mix winners, not pick one whole.

---

## 5. Type system

**Rule:** distinctive variable faces, **self-hosted** as variable `woff2` vendored from Fontsource
npm tarballs (`@fontsource-variable/<name>`) into `public/fonts/` + the OFL `LICENSE`. **No font
CDNs** (no Google, no Bunny). **NEVER Inter or Roboto** as a primary face. Expose faces as semantic
roles — `--font-display` (trip/place/section titles), `--font-text` (body/UI/chips), `--font-num`
(costs, €-equivalents, dates, flight codes; or `font-variant-numeric: tabular-nums`).

**Shortlist** (all verified as `@fontsource-variable/*` variable woff2, OFL-1.1, on npm 2026-07-08).
Pin the exact vendored version at Phase-3 vendor time.

| Pairing | Display | Text/UI | Mono (codes/figures) | Feel |
|---|---|---|---|---|
| **Lead ✅** | **Fraunces** (wght·opsz·SOFT·WONK) | **Instrument Sans** (wght·wdth) | **Spline Sans Mono** | Warm-editorial serif + crisp humanist grotesque — the two adjectives land in two faces with no compromise. |
| Alt 1 | Newsreader (wght·opsz) | Space Grotesk (wght only) | JetBrains Mono | More bookish/literary; Space Grotesk is wider/louder as body. |
| Alt 2 (all-sans) | Bricolage Grotesque (wght·wdth·opsz) | IBM Plex Sans (wght·wdth) | Geist Mono | Warmth-through-personality, no serif — closest to Airbnb's Cereal spirit. |

**Lead rationale:** Fraunces **is** "warm & editorial" (its `opsz` gives big titles magazine
contrast; `SOFT`/`WONK` tune warmth); Instrument Sans **is** "crisp & precise" (its `wdth` keeps
dense phone lists scannable at 44px+ targets); Spline Sans Mono gives warm **tabular** figures for
dual-currency costs and flight codes. Best mobile legibility of the three.

**Caveats:** **IBM Plex Mono and Space Mono are NOT available as variable Fontsource packages**
(404 — static only); use Spline Sans Mono / JetBrains Mono / Geist Mono for the mono slot. If a
direction ever wants an all-sans "Cereal analog," **Plus Jakarta Sans** (Figtree/Onest alternates)
is the closest Fontsource match — never Inter/Roboto. Verify Fraunces mid-weights (~340–380) for
dark-mode captions. Every face used gets `font-display: swap` + a preload of the primary display face.

---

## 6. Color & tokens thesis (feeds Phase 3 `tokens.css`)

Author every token in **OKLCH** (baseline-supported in current Chrome/Safari) so each role's
lightness is tuned to hit AA independently in light and dark. **Two tiers:** *base ramps* feed
*semantic roles*; **components reference only semantic roles**, never raw ramps or hex.

- **Light-primary = warm paper, not white.** Canvas is a warm off-white (≈ `oklch(0.985 0.006 70)`,
  ~`#FBF8F3`) — the single biggest lever from generic-SaaS-white to editorial. Raised cards are
  *cleaner/lighter* than the page → **elevate by tone, not shadow** (crisp white cards on warm paper
  is the Airbnb/editorial move).
- **Warm-neutral base ramp**, not blue-gray: anchor ~11 steps (`--warm-50…--warm-950`) to a warm hue
  (~40–80° OKLCH) at very low chroma (~0.004–0.018) — the narrow "intentional" band between cold-SaaS
  (zero chroma) and dated-sepia (too much).
- **Warm ink:** `--text-primary` is a warm near-black (≈ `oklch(0.22 0.02 60)`, ~`#221C15`), not
  `#000`; ladder `--text-secondary`/`--text-muted` down the same ramp.
- **One distinctive warm signature accent**, ramped in OKLCH — **terracotta/clay, sunset-coral, or
  temple-gold** (all fit Thailand + warm-editorial). Brand + the *one* primary CTA only; never
  decoration. (Final hue pinned in Phase 2.)
- **Booking-status hues** — harmonized but distinct, each a tinted `--status-x-bg` + stronger
  `--status-x-fg`: Idea = warm-gray (tentative), Planned = muted slate/indigo, Booked = amber/gold,
  Confirmed = grounded olive/green. Verify chip fg-on-bg ≥ 4.5:1 and the pill boundary ≥ 3:1 in
  **both** themes.
- **`--danger` is a warm RED clearly separate from the accent** so "over budget" never blends into
  the brand. Budget fill = accent (or a calm positive tone) under 100%, flips to `--danger` at ≥100%.
- **Dark alternate = warm charcoal/espresso, not pure black** (`--surface-page` ≈ `oklch(0.17 0.01
  60)`, ~`#17130E`) so night mode is the *same warm brand*, not an OLED void. Elevate by **lightening**
  surfaces; nudge accent lightness up so it stays vivid without going neon.
- **Same semantic role names across themes;** only swap base values under `:root` vs
  `:root[data-theme="dark"]` / `@media (prefers-color-scheme: dark)`.

Semantic roles to define (minimum): `--surface-page/-card/-raised`, `--text-primary/-secondary/-muted`,
`--border-subtle/-strong`, `--accent`, `--accent-contrast`, `--status-{idea,planned,booked,confirmed}-{bg,fg}`,
`--danger` (+ bg). Dividers and the timeline connector use warm low-contrast tokens (`--border-subtle`,
not cool `#e5e7eb`); give the spine a `--border-strong`/muted-accent tint so it reads as brand
structure, not a default `<hr>`.

---

## 7. Motion budget

Enhancement only, and **always** behind `@media (prefers-reduced-motion: no-preference)` with a valid
static end-state. Animate **only `transform`/`opacity`** (never `top/left/width/height` — janks on
low-end Android). Signature moves:

1. **Spine draw-on** — the timeline connector grows top→down (`transform: scaleY(0→1)`, origin top,
   or SVG `stroke-dashoffset`).
2. **Marker stagger** — step markers pop in date order (`scale(.6→1)` + fade) — the "route unfurling."
3. **Hero morph** — View Transition on Home trip-card → Timeline (shared cover image).
4. **Chip/toggle "pop"** — anime.js spring `scale` on status change / save; tonal cross-fade on
   status-bg changes.
5. **Budget bar fill** — bar animates to its `--pct` width on mount.
6. **Skeletons** — CSS shimmer while content loads. Press states = subtle `scale(~0.98)` + slight
   lift, never a color flash.

---

## 8. NEVER / INSTEAD — the taste guardrails

| NEVER | INSTEAD | Why |
|---|---|---|
| Generic SaaS/fintech **blue** accent (`#3b82f6`-style) for brand or status | ONE distinctive **warm signature accent** (terracotta/coral/temple-gold, OKLCH ramp); color means *semantic state*, never decoration | Blue reads generic-dashboard and fights "warm & editorial." |
| **Drop-shadow soup** (a shadow on every card/chip/marker) | **Elevate by tone**: surface-tone step + a warm 1px border; reserve one tuned shadow for genuinely floating chrome (sticky nav, sheets) | Shadow-on-everything muddies a phone list and taxes low-end Android GPUs. |
| **Hairline-only** cool borders (`#e5e7eb`) as the sole separator | Warm border **+ tonal surface step + padding**; on the Timeline let the spine + whitespace carry structure | Thin cool hairlines vanish in phone glare / on OLED. |
| **Emoji as UI iconography** (✈️🏨✅ for modes/status) | A tiny hand-built **inline-SVG** set (`currentColor`, ~1.5–2px stroke, one grid); emoji only inside user content | Emoji differ per OS, can't inherit theme color, break alignment, look toylike (icon fonts also banned). |
| A **chart library** for budget bars/breakdown | Pure CSS/HTML **meters**: track + fill sized by `--pct`, `role="meter"` + `aria-valuetext`, flip a `--over` role to danger at ≥100% | Chart libs violate $0/no-build/no-deps; a CSS meter is weightless, themeable, accessible. |
| **Cramped tap targets** (tiny chips, dense rows on the line) | ≥44px hit area (padding or a `::before` hit-slop even when the pill is smaller); space adjacent steps | Two thumbs on phones; sub-44px fails WCAG 2.5.5 and mis-taps between steps. |
| Encode **status / over-budget by color alone** | Redundant cues: **text label + icon/shape + color**; budget bar turns red AND crosses a labeled 100% marker | Color-only fails WCAG 1.4.1, invisible in sunlight, and CVD-unsafe. |
| **Ambiguous money** — bare number, guessed currency, silent/stale FX | Explicit symbol/code **+ labeled €-equivalent** (`฿4,200 · ≈ €108`), tabular figures, surface the FX rate + date | Dual-currency clarity is the whole point; ambiguity causes real budgeting errors. |
| **Full-bleed hero photo on every step**, burying A→B structure | Keep the **connector-spine + markers** primary; images are optional restrained thumbnails in fixed aspect boxes, lazy-loaded. **One opt-in exception (0010, refined 0011):** a user may pin ONE photo as a **stay** card's background — the photo is left **vivid** and only the text sits on a small rounded **frosted scrim plate** whose tint keeps it AA over any photo. Never travel legs, never automatic. | The signature screen must stay scannable and fast on Thai mobile networks; a pinned photo is opt-in and readability-guaranteed (text-plate, not a whole-card darken), so it stays the exception, not the rule. |
| **Layout-property or unguarded** entrance animation | Animate `transform`/`opacity` only; route changes via View Transitions; wrap **all** motion in `prefers-reduced-motion` | Layout animation janks; unguarded motion is an a11y + perf regression. |

---

## 9. Accessibility baseline (WCAG 2.2 AA, both themes)

- **`:focus-visible`** on every interactive element — ≥2px ring in an accent-contrasting color with
  `outline-offset`; never bare `outline:none`.
- **Contrast:** 4.5:1 body, 3:1 large text (≥24px / ≥18.66px bold), **3:1 UI/graphical** (chip
  fg-on-bg, budget fill vs track, connector, focus ring) — in **both** themes. (APCA as a sanity
  check; WCAG 2 AA is the gate.)
- **Reduced motion:** `prefers-reduced-motion: reduce` instant-completes every anime.js/CSS/View
  transition to a valid static state.
- **Target size:** floor at SC 2.5.8 (24px), aim for the project **44×44** (SC 2.5.5 / Apple HIG /
  Material 48dp).
- **Never color-alone** (SC 1.4.1) for status / over-budget.
- **Real semantics:** `<nav>`/`<main>` landmarks, in-order headings; the **Timeline is an `<ol>`**
  (sequence conveyed non-visually); budget bar is `<meter>`/`role="meter"` with
  `aria-valuenow`/`aria-valuetext`; chips expose accessible text; currency toggle is labeled with
  `aria-pressed`.
- **No hover-only affordances** (touch has no hover). Respect `forced-colors`/high-contrast and
  `prefers-reduced-transparency`.
- **Reflow:** survives 200% zoom / large OS fonts with no clipping or horizontal scroll (rem/em +
  `clamp()`/`min()`); form inputs ≥16px so iOS Safari doesn't force-zoom.

---

## 10. Mobile baseline

- **Per-scheme `theme-color`:** two `<meta name="theme-color">` (light/dark `media=`) + a no-media
  fallback, each = that scheme's top surface token (Safari rejects pure `#000`/some saturated hues —
  use the surface token).
- **`apple-touch-icon` 180×180** (opaque square; iOS masks it) + standard favicons + a manifest with
  maskable icons and `theme_color`/`background_color` = the light scheme.
- **Viewport** `width=device-width, initial-scale=1, viewport-fit=cover`; pad every fixed/sticky
  element with `env(safe-area-inset-*)` (sub-nav clears the notch; bottom clears the home indicator).
- **Money fields** `inputmode="decimal"` (**not** `type=number` — spinners + locale decimal bugs) +
  `enterkeyhint`.
- **Sticky per-trip sub-nav** (Timeline / Budget / Checklist): `position: sticky; top:0` + safe-area
  top pad + a scrolled/elevated state; `scroll-padding-top` so it never hides a focused input.
- `touch-action: manipulation` on controls (kills the 300ms delay / double-tap zoom); ≥44px targets
  with real spacing between adjacent steps/chips.
- All inputs **≥16px** font-size (no iOS auto-zoom).
- Full-height layouts use **`dvh`/`svh`** (not `vh`) so the collapsing URL bar doesn't clip sticky
  chrome; `overscroll-behavior` contains pull-to-refresh where it fights a scroll panel.
- **Data hygiene:** images lazy-loaded with explicit `width/height` or `aspect-ratio` (zero CLS);
  `content-visibility: auto` on long timelines; vendored `woff2` + `font-display: swap` + preload the
  display face.

---

## 11. Current interface inventory (what exists today)

The baseline the restyle starts from — a deliberately minimal shell (see `public/`):

- **Shell** (`index.html`): sticky `.topbar` (hamburger · `✈️ Travel Planner` brand · signed-in
  email · theme toggle `◑`) + left `.nav` (Home / What's New / wiki topics) + `<main>` view; a
  hidden `.demo-banner`; a theme-before-paint inline script (currently **dark** fallback).
- **Design system** (`styles.css`, 69 lines): ~7 color tokens only (`--bg --panel --panel-2 --border
  --text --muted --accent` + 3 status pairs green/amber/red), `--radius:10px --gap:14px --maxw:980px`,
  **system font stack** (no custom face), **dark on `:root`**, light via `[data-theme="light"]`.
  Components: `.topbar .brand .icon-btn .layout .side .nav .panel .cards .card .chip .md`; responsive
  breakpoint at 720px.
- **Accent today:** `#4aa3ff` (generic blue), mirrored in `public/data/app.json`.
- **Real screens** (Home trip cards → Timeline → Budget → Checklist) are **spec'd but unbuilt**
  (`travel-planner-requirements.md` §6); the only live entity is the placeholder `entries` list.

Gap vs. this contract: no custom fonts, generic-blue accent, dark-default, cool-gray neutrals,
system font, emoji brand mark — all addressed by Phases 1–4.

---

## 12. Decision log

Records the locked brand inputs and the final visual decision.

- **2026-07-08 — Brand inputs locked (Phase 0 interview).** Adjectives: *Crisp & precise* + *Warm &
  editorial*. Reference apps: *Airbnb* + *Polarsteps*. Density: *Balanced*. Theme: *Light-primary*
  (flips the scaffold's dark default). Mobile-first (Android Chrome + iOS Safari). Font shortlist +
  guardrails + token thesis established via a verified research sweep.
- **2026-07-08 — Direction chosen (Phase 1 phone review).** Of the three throwaway mockups (PR #6),
  **Direction C "Transit Line"** won — the metro/route-schematic look. Feedback: the mockups were
  *too busy at first glance*, so the real product adopts **progressive disclosure** (compact cards,
  detail-on-tap). **Pinned type:** display **Space Grotesk**, body/UI **Instrument Sans**, data/mono
  **Spline Sans Mono** (all Fontsource variable, OFL). **Pinned palette:** warm light-primary — warm
  near-white ground (~`#FCFCFA`), warm near-black ink, ONE warm coral signature accent (~`#DE5C43`,
  OKLCH-ramped, finalized during the `tokens.css` build), transit mode-hues (rail/flight/ferry/road)
  used sparingly + functionally, status hues green/amber/slate/grey, warm-charcoal dark alternate
  (~`#0E0F12`). **Rejected:** A "Gate & Stub", B "Field Notes". `public/design/**` mockups are
  throwaway (never merged); this log + `tokens.css` are the durable record.
- **2026-07-08 — Feature scope for the build.** Separate pages (Timeline/Budget/Packing/Activity/Trash)
  via same-document View Transitions; a packing list (shared/individual items + owner filter) replaces
  the to-do checklist; one map coordinate per step + per activity (link-out); multiple captioned
  screenshots per step/activity (Workers KV); booking-status chips on steps + activities (no separate
  to-book view); soft-delete + trash. Full plan & milestones:
  [`docs/implementations/0003-feature-expansion.md`](docs/implementations/0003-feature-expansion.md).
- **2026-07-09 — Timeline cards slimmed + step delete.** Each timeline line shows only title, dates and
  the status chip; cost, photos, map/booking links, carrier/accommodation and the activity list move to
  the step **detail** view (tap a line to open it). Added a "Delete step" action (soft-delete → Trash) in
  that detail. Info-density feedback; supersedes Direction C's "activities as indented sub-stations" on
  the timeline. See [`docs/implementations/0008-timeline-declutter-delete.md`](docs/implementations/0008-timeline-declutter-delete.md).
- **2026-07-09 — Pinned step photo (opt-in card background).** A user can pin ONE uploaded photo per
  **stay** as that card's timeline background: a warm dark "media island" (theme-independent light ink)
  under a text-anchored scrim whose floor alpha (~0.82) guarantees WCAG AA (~10.8:1 title / ~8.7:1 dates
  over even a pure-white photo) in both themes. Desaturated ("muted") by default so the photo reads as a
  calm backdrop, not a competing picture. Travel legs never get one; nothing is automatic. Amends the §8
  "no full-bleed hero on every step" rule to allow this scrimmed, opt-in exception (the §2 Polarsteps
  "cover + scrim" move). See [`docs/implementations/0010-pinned-step-photo.md`](docs/implementations/0010-pinned-step-photo.md).
- **2026-07-09 — Pinned photo refined to a text plate.** Live feedback: darkening the whole card read
  too dark. Reversed it — the **photo now renders vivid** (no filter, no full-card scrim); only the text
  sits on a small rounded **frosted-glass plate** (a contained scrim panel) that hugs the text, tint
  `--pin-plate-alpha` ≈ 0.72 (title ~7.4:1 / dates ~6.0:1 over a white photo; frosted blur is dropped
  under `prefers-reduced-transparency`, the tint carries the contrast). Supersedes the 0010 "media
  island" darkening. See [`docs/implementations/0011-pinned-photo-text-plate.md`](docs/implementations/0011-pinned-photo-text-plate.md).

