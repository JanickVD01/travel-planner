# 0010 — Pinned step photo: a chosen image as the card's background

> **Status:** ✅ Shipped 2026-07-09 (PR #38 kickoff+preview, #39 feature; #40 added the CI `migrate`
> workflow). Migration `002_pinned.sql` applied to prod D1 via the `migrate` workflow before #39 merged;
> Pages + MCP worker redeployed on merge. This record carries the full plan and was **updated in place**
> as milestones landed (like [0003](0003-feature-expansion.md)). See [`README.md`](README.md) for the index.
> **Visual treatment superseded by [0011](0011-pinned-photo-text-plate.md)** (same day): the photo is now
> left vivid and only the text sits on a contained frosted plate, instead of darkening the whole card.
>
> **Sign-off decisions (owner, 2026-07-09):** travel legs get NO photo (stays only); default look =
> **muted** (photo desaturated to a calm texture); scrim floor left at **0.82**. *(The muted/scrim-floor
> darkening was reversed by 0011 — see above.)*

## Context

Steps already support multiple photo attachments (bytes in Workers KV, served at `/api/image/<slug>/<id>`),
but photos render **only in the detail view** — never on the timeline, and no attachment is designated
"special." The owner wants to **pin one photo per step** so it renders as the **background behind that
step's card** in the timeline ("a nice view of the mountain behind our stay" while scrolling), for both
**travel legs** and **stays**.

**Hard requirement:** text must stay readable over *any* photo. Delivery is **preview-first** — a
faithful in-repo mockup for sign-off on the look before the real feature is built. Default look =
**Balanced**: photo clearly visible, but a scrim mathematically guarantees WCAG 2.2 AA.

Prereq already met: `IMAGES_KV` is bound in production (`wrangler.jsonc`, created 2026-07-09), so
uploads are live and there are real photos to pin.

## Decisions

| Topic | Decision |
|---|---|
| Designator | A **`pinned` boolean on the attachment** (not a `hero_attachment_id` on the step): natural "pin *this* photo" UX, **auto-cleanup** when the photo is deleted (no dangling ref), and it reuses the `included` boolean precedent end-to-end. |
| "One pinned per parent" | No DB uniqueness available → **app logic in one core fn** (`setPinned`) that pins the target and un-pins its siblings atomically in a single `env.DB.batch`, modeled on `purgeStepDeep`. Rule lives ONLY in `shared/core.js` (invariant). |
| Readability | A **theme-independent warm dark "media island"** (light ink): a single lazy `<img>` under a **text-anchored scrim** with a guaranteed **floor alpha (~0.82)**. Worst case (pure-white photo) → title ≈ **10.8:1**, dates ≈ **8.7:1** (computed); even at the slider floor 0.70 it stays 6.9:1 / 5.6:1 — AA holds across the whole range, both themes, zero per-image JS. |
| Why not other techniques | Pretty 40–50% scrims fail AA on bright photos; `backdrop-filter` mean-luminance still tracks the photo + GPU cost; `text-shadow` isn't in the WCAG formula; canvas luminance-adaptive ink fails on mixed-luminance photos and needs CORS/JS. |
| Image element | `<img loading="lazy">`, **not** CSS `background-image` (not lazy → would fetch every off-screen photo, blowing the Thai-mobile data budget). |
| Travel legs | Transparent today → **promoted** to a media card when pinned (border/radius/min-height/img/scrim); unpinned legs unchanged; metro grammar preserved (ringed transport marker stays on the spine; shorter photo window than a stay). |
| Design contract | Deliberately amends **DESIGN.md §8** (which bans full-bleed hero on *every* step): an **opt-in, scrimmed, AA-guaranteed** pinned photo is sanctioned — the §2 "cover + scrim" move — with spine + markers still primary. |
| Scope | **Timeline card only** (the owner's ask). Detail-view hero banner = possible later follow-up. Steps only (the `pinned` column exists on attachments generally, but only steps render a background). |

## Milestones

- **M1 — Kickoff record + process convention** *(this record)*: created this `0010` record + index row
  **before code**; added the front-of-effort rule to `CLAUDE.md`. — ✅ (PR #38)
- **M2 — Preview** (throwaway `public/design/pin-preview.html` + external `pin-preview.js`): faithful
  matrix {bright/dark/busy} × {stay/travel, short/tall}, both themes, scrim-strength slider with a live
  worst-case-contrast readout, Balanced↔muted toggle. **Sign-off gate — passed.** — ✅ (PR #38)
- **M3 — Data model + core**: `FLAT_SPECS.attachments` gained `{name:"pinned",clean:cleanBool}`; new
  `setPinned` core fn (pin + atomic un-pin siblings on the same parent); `schema.sql` mirror;
  `migrations/002_pinned.sql` (additive ALTER); `_mock.js` seed `pinned:"1"` on the Bangkok stay. — ✅
- **M4 — API + MCP**: attachments PATCH branches `"pinned" in body → setPinned`; `pin_image` MCP tool
  (`{slug,id,pinned?}`) + core import. (worker redeploy) — ✅
- **M5 — Frontend**: pin/unpin toggle on gallery thumbnails (stays only, mirrors `deletePhoto`);
  `stepCardHTML` renders the pinned `<img>` + `.pin-body` for the **stay** branch only (travel legs
  unchanged per sign-off); treatment CSS in `styles.css`/`tokens.css` — **muted by default** (desaturate
  + full-card scrim + text-band scrim), `--on-media*` recolor, focus ring, forced-colors plate; a
  capture-phase `error` listener reverts a card if its photo 404s (CSP forbids inline `onerror`). — ✅
- **M6 — Reconcile**: deleted `public/design/**`; finalized this record + index; amended DESIGN.md §8 +
  decision log; added `pinned` to the CLAUDE.md attachments line; `releases.json` v0.6.0 "What's New". — ✅

## Verification

1. **Preview (M2):** `wrangler pages dev public` → `/design/pin-preview.html`; both themes, all three
   image types, short/tall cards; contrast readout stays ≥4.5:1 across the slider. Sign-off gate.
2. **Local e2e:** seed local D1 (`--file=./schema.sql`), `pages dev … --binding DEV_EMAIL=…`; upload ≥2
   photos, pin one → shows behind the card; pin another → first un-pins; unpin → reverts; delete pinned
   → reverts. On a stay AND a travel leg, light AND dark.
3. **MCP smoke:** `cd worker-mcp && npm run dev` + `npm run smoke`; exercise `pin_image` (+ `pinned:false`);
   `list_attachments` shows the flag.
4. **Migration:** apply `002_pinned.sql` `--local` first (and `--remote` prod once, before merge);
   `node scripts/validate-data.mjs` before every push.
5. **A11y:** focus a pinned card's title (ring visible over bright + dark photos); reduced-motion has no
   photo motion; forced-colors renders a legible plate.

## Verification (done)

- **Preview (M2):** served locally; contrast readout confirmed ≥4.5:1 across the full slider range
  (computed: floor 0.82 → title 10.8:1 / dates 8.7:1; even floor 0.70 → 6.9:1 / 5.6:1). Owner signed off.
- **Backend e2e (M3+M4):** `wrangler pages dev` on a fresh local D1 (schema incl. `pinned`) + KV.
  Uploaded 2 photos to `st-1` + 1 to `st-2`; `PATCH {pinned:"yes"}` on photo A → A=1; on photo B (same
  step) → **A auto-flipped to 0**, B=1 (exclusive *per parent*); a photo on `st-2` pinned independently
  (per-parent, not global); `PATCH {pinned:"no"}` cleared it; a caption-only PATCH still routed to
  `patchAttachment` (pin unchanged). All ✓.
- **Static:** `node --check` on all changed JS; `node scripts/validate-data.mjs` ✓.
- **Frontend render:** proven via the M2 preview (same treatment CSS + markup); owner to confirm live
  after deploy (project's customer-feedback loop).

## Outcome

Shipped. The additive column was applied to prod D1 by dispatching the `migrate` workflow
(`.github/workflows/migrate.yml`, added in #40) with `ref=code/pinned-step-photo`,
`file=migrations/002_pinned.sql` — it runs `wrangler d1 execute --remote` on a CI runner where the
Cloudflare token secret is injected (secrets are write-only and can't be read off-runner). Run logged
"1 rows written". #39 then merged; `deploy` (Pages) and `deploy-worker` (MCP `pin_image` tool) both
succeeded. Owner to confirm the look live and pin real photos.

**Reusable outcome:** the `migrate` workflow now gives migrations a sanctioned CI path (dispatch a
`.sql` from any ref), instead of a local `wrangler --remote` needing the token on someone's machine.
