# Bug hunt: share card (2026-11-03)

Kind: hunt · Lane 10 · Re-measure-by: 2027-02-01

Slice: `js/share/**` (ShareCard, ShareCardData, ShareCardLayout, ShareCardChips). Correctness,
edge cases and visual defects. Callers outside the slice (`js/ui/results-sheet.js`,
`js/race/daily-challenge.js`, `js/career/career-ui.js`) were traced read-only via apex-lsp;
fixes stay inside OWNED paths.

Method: Board claim on #1780 → open-PR ownership check (no live PR holds `js/share/**` /
`tests/unit/share-card*` / this note) → apex-lsp outlines + callers → prior art (H3-11 QR
polarity fixed; F4 URL rewrite still open; C2-17 render coverage since filled) → unit repros
for each fixed row. Nothing measured in a browser (AGENTS.md rule 5).

## Ranked findings (player impact ÷ fix risk)

| # | Where | Verdict | What | Action |
|---|-------|---------|------|--------|
| 1 | `share-card-chips.js` `preview`/`draw` | CONFIRMED (unit repro) | A failed `ShareCard.render` (byte-budget or device) left `busy(true)` with no `busy(false)` in the `catch`, so SHARE and SAVE stayed disabled for the life of the sheet. Status told the player to try another size; the size chips still worked, but the foot actions did not. | Fixed: `finally` re-enables when this draw is current and the dialog is still mounted. Test: `share-card.test.mjs` "over the byte budget". |
| 2 | `share-card-data.js` `common`/`linkOf` | CONFIRMED (unit repro; prior F4) | Share links went through `text()`, which rewrites `/formula\s*1/gi` → `GRAND PRIX` and is case-sensitive on `https?://`. A QR payload of `https://…/formula1/…`, `http://formula1.example/…`, or `HTTPS://…` was either corrupted or dropped (`null`). Titles/track names still rewrite the mark. | Fixed: dedicated `linkOf` — control-char strip + case-insensitive `http(s)` + 512 cap, no trademark rewrite. Test: `share-card-data.test.mjs` "keeps share links intact". |
| 3 | `share-card-layout.js` daily streak | CONFIRMED (geometry) | On a linked daily card the STREAK line used `maxWidth = w - pad*2`, which on landscape ran under the QR tile. Short "STREAK 12" painted clear; a longer value (or a looser measure) could draw through the code. | Fixed: reserve `qrSize + pad/2` when `model.link` is set. Test: `share-card-layout.test.mjs` "streak maxWidth stops short of the QR". |
| 4 | `share-card-layout.js` hero delta colour | PLAUSIBLE | Ahead-of-ghost green only matches Unicode minus (`−`, U+2212). An ASCII `-` delta (hand-built model or a future caller) stays white. `ShareCardData.signed` always emits Unicode today. | Deferred: one-character regex widen; not in the three-fix budget. |
| 5 | `share-card-layout.js` | gap | `model.display.name` is in `MODEL_KEYS` and set by every `from*` helper, but no paint op ever shows it. Cards stay anonymous even when a display name was passed. | Deferred: layout design (where to put the name on each spec). |
| 6 | `share-card-chips.js` `altText` | low a11y | Preview `<img alt>` omits medal and streak, so a daily gold / streak-N card's alternative text misses those facts. | Deferred. |
| 7 | `share-card-chips.js` SAVE | low | `saveBtn.onclick` has no `try/catch`; a throwing `ShareCard.download` is an unhandled rejection and the status line never updates. | Deferred. |
| 8 | `share-card-data.js` `linkOf` | latent | A URL longer than 512 chars is still hard-sliced; the QR may encode a truncated, non-resolving link. Cap kept (byte/QR budget); callers should pass short deep links. | None (document). |
| 9 | `share-card.js` `ensureFonts` | low | A timed-out or failed font load caches `fontsReady` as `false`; later renders never retry Barlow Condensed. Fallback stack still paints. | Deferred. |
| 10 | `share-card.js` `canShareFiles` / `deliver` | design | `!env.navigator` gates the Capacitor `NativeDownload` path. Callers that omit `env` still hit Web Share first when present; native only when Web Share declines. `NativeDownload.viable()` is mobile+plugin-only. | Cleared. |

## Covered and cleared

Paint ops (rect/text/line/path/QR), PNG→JPEG byte budget and `too-large`, Web Share /
AbortError / NotAllowedError+retry / download fallback, native share cancel vs hard fail,
QR dark-on-light decode on every spec (H3-11), lazy QR load for solo daily, preview sheet
(size redraw, alt, polite status, second-tap share), `fromDaily` / `fromRace` / `fromSeason` /
`fromCareerYear` / `fromGhost` schema freeze and podium/standings clamps, Formula-mark rewrite
on titles (not links).

## Not covered (next hunt)

Caller wiring in `results-sheet.js` / `daily-challenge.js` / `career-ui.js` (outside OWNED);
live iPhone share-sheet activation; real Web Share Level 2 `canShare({files})` matrix;
photo-backdrop cards if/when a backdrop lands (byte-budget path is tested with synthetic
sizes only).

## Prior art (do-not-re-report)

- H3-11 light-on-dark QR — fixed `73748ab7` / decode test in `share-card.test.mjs`.
- F4 link-through-`text()` — was PLAUSIBLE in `hunt-career-data-garage-share.md`; confirmed and fixed as #2 here.
- C2-17 missing `render()` coverage — filled by later share-card tests; not re-opened.
