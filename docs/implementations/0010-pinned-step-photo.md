# 0010 — Pinned step photo: a chosen image as the card's background

> **Status:** 🚧 In progress (started 2026-07-09). A multi-milestone effort — this record carries the
> full plan and is **updated in place** as each milestone lands (like [0003](0003-feature-expansion.md)).
> One numbered record per effort — see [`README.md`](README.md) for the index.

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

- **M1 — Kickoff record + process convention** *(this record)*: create this `0010` record + index row
  **before code**; add the front-of-effort rule to `CLAUDE.md` (every effort starts by creating its
  numbered record, updated in place). — 🚧
- **M2 — Preview** (throwaway `public/design/pin-preview.html` + external `pin-preview.js`): faithful
  matrix {bright/dark/busy} × {stay/travel, short/tall}, both themes, scrim-strength slider with a live
  worst-case-contrast readout, Balanced↔muted toggle. **Sign-off gate.** — ⬜
- **M3 — Data model + core**: `FLAT_SPECS.attachments` gains `{name:"pinned",clean:cleanBool}`; new
  `setPinned` core fn (pin + atomic un-pin siblings); `schema.sql` mirror; `migrations/002_pinned.sql`
  (additive ALTER, applied to prod once before merge); `_mock.js` seed `pinned:"1"`. — ⬜
- **M4 — API + MCP**: attachments PATCH branches `"pinned" in body → setPinned`; `pin_image` MCP tool
  (`{slug,id,pinned?}`) + core import. (worker redeploy) — ⬜
- **M5 — Frontend**: pin/unpin toggle on gallery thumbnails (mirrors `deletePhoto`); `stepCardHTML`
  renders the pinned `<img>` + `.pinned`/`.pin-body` for both kinds; treatment CSS in
  `styles.css`/`tokens.css` (scrim, `--on-media*` recolor, focus ring, forced-colors plate). — ⬜
- **M6 — Reconcile**: delete `public/design/**`; finalize this record + index ✅; amend DESIGN.md §8 +
  decision log; add `pinned` to the CLAUDE.md attachments line; `releases.json` "What's New"; MEMORY /
  About if drifted. — ⬜

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

## Outcome

_Pending — updated as milestones land._
