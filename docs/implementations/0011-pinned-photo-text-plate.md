# 0011 — Pinned photo: a contained text plate (stop darkening the whole image)

> **Status:** 🚧 In progress (2026-07-09). A live-feedback visual refinement of [0010](0010-pinned-step-photo.md)
> (as [0009](0009-mobile-card-polish.md) refined 0008). CSS-only — no schema/migration/worker. Updated
> in place as milestones land. See [`README.md`](README.md) for the index.

## Context

0010 shipped the pinned-photo stay-card background, but live use showed the whole image reads **too
dark**: the treatment darkened the photo three ways at once — a `filter` on `.pin-media`, a full-card
`::before` scrim, and a full-width bottom gradient on `.pin-body` (`public/styles.css`).

Owner ask: keep the **photo vivid**, and darken **only the text area** — a small rounded box (a
*scrim panel* / legibility plate) hugging the text, so the view shows through everywhere else. This is
the standard text-over-image legibility pattern; contained rounded corners (12–24px) read as soft
material; readability still needs the panel opaque enough for **WCAG AA (4.5:1 / 3:1)** behind text
(refs: Smashing Magazine "Accessible Text Over Images", NN/g "Text Over Images", WCAG.com).

## Decisions

| Topic | Decision |
|---|---|
| Treatment | Replace "darken the whole card" with a **contained rounded plate** behind only the text. Remove the `.pin-media` `filter` and the full-card `::before` scrim → **photo stays vivid**. |
| Plate | `.pin-body` becomes the plate: hugs the text (`align-items:flex-start` on the card), bottom-left, ~10–12px inset margin, `border-radius: var(--radius)` (14px), semi-opaque dark tint (`--pin-plate-alpha`, default ≈ **0.72**), subtle 1px light border + soft shadow to lift it off the photo. |
| Readability | Plate tint ≥ ~0.72 keeps light ink ≥ AA over any photo (worst case pure-white ≈ 7:1 title / 5.6:1 dates; darker photos improve). Frosted-glass (`backdrop-filter`) optional polish, gated to `prefers-reduced-transparency: no-preference`; the tint (not the blur) carries the contrast. |
| Unchanged | Light-ink recolor, `.chip` shadow, `:focus-visible` ring, `min-height`, `forced-colors` plate, markers/spine, `<img onerror>` revert, and all markup (`.pin-media` + `.pin-body` already emitted by `stepCardHTML`). |
| Tokens | Retire unused `--pin-floor`/`--pin-peak`; add `--pin-plate-alpha` (+ optional inset/radius). Keep `--media-scrim`, `--on-media*`, `--media-min-h`. |

## Milestones

- **M1 — Record** *(this)*: create record + index row before code. — 🚧
- **M2 — Preview** (throwaway `public/design/pin-plate-preview.html` + external `pin-plate-preview.js`):
  Bangkok-style card over a vivid photo; toggles for shape (hug-box ↔ inset bar), style (solid ↔
  frosted), an alpha slider with a live worst-case-contrast readout, and theme. **Sign-off gate.** — ⬜
- **M3 — Implement**: apply the chosen plate to `public/styles.css` + `public/tokens.css`. — ⬜
- **M4 — Reconcile**: delete preview; finalize this record + index; refine DESIGN.md §8 note + decision
  log (pinned exception is now a *contained scrim panel*, photo left vivid); add a forward pointer in
  the 0010 record. — ⬜

## Verification

1. **Preview (M2):** `wrangler pages dev public` → `/design/pin-plate-preview.html`; photo vivid, plate
   hugs the text, contrast readout ≥4.5:1 across the alpha range, both themes.
2. **Live-ish (M3):** `wrangler pages dev public` on demo data (Bangkok stay seeded `pinned:"1"`,
   `functions/api/_mock.js`) → Thailand timeline shows the Bangkok card with a vivid photo + a small
   rounded plate behind the text, light + dark.
3. **Static:** `node scripts/validate-data.mjs`. A11y: title focus ring visible; reduced-transparency
   drops only the blur (tint remains).

## Outcome

_Pending._
