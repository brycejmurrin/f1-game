# Shareable result cards (PNG) — plan (2026-10-04)

Date: 2026-10-04
Status: **PLAN** — docs-only; implement as four draft PRs against
`claude/f1-game-project-26h3ng`, one slice each, in the order below. Do not merge.
Scope: client-only image cards for race result, daily result, lap-vs-ghost,
season/championship summary and the career season card; one shared renderer,
PNG via canvas, `navigator.share({files})` with a download fallback, and a short
link/QR that re-opens the same challenge. No backend, no accounts, no leaderboards.

A path written `js/<new>/…` is a PROPOSED file (drop the `<new>/` segment when
creating it). Backticked paths without `<new>` already exist on disk.

## Related (do not duplicate)

| Doc / module | Relationship |
|---|---|
| `docs/plans/2026-09-30-player-a11y.md` Slice 4 (origin: `docs/notes/PRODUCT-BRAINSTORM-2026-09-16.md` item 7) | Owns TEXT envelopes and `#share=`. This plan owns the IMAGE and a minimal `#card=` link; if Slice 4 lands first, `#card=` becomes one more kind in its envelope. |
| `js/car/ghost-share.js` | Stays the ONLY carrier of ghost samples; cards never embed one. |
| `js/ui/photo-studio.js` | Owns 3D capture + PNG library; cards may reuse a capture as backdrop. |
| `js/editor/designer.js` `shareCard` | Existing designer card; Slice 1 lifts its share/save tail into the shared module. |

## Goal

One tap on any results screen produces a good-looking, honest PNG (1080x1350
portrait or 1200x630 landscape) that can be posted anywhere, carries a QR / link
that opens the same circuit and conditions, and is unmistakably an unofficial fan
game. `js/game.js` does not grow; no ratchet is raised.

Budgets (measured 2026-10-04): `js/game.js` is 8981 lines, ratchet 8982 lines /
4816 codeLines / 285 gMembers in `tests/data/ratchets.json` (slack ~0). Shell
nodes and CSS classes are tight (`shellNodes`, `cssClasses` in the same file):
buttons are created from JS like the ghost buttons are, no new `index.html` nodes,
no new CSS classes (reuse `sel-chip`).

## Non-goals

- Leaderboards, hosted image URLs, link shorteners, Open Graph previews (static host).
- Embedding a ghost or setup in the QR; video/GIF; social-network APIs.
- Pixel-compare tests of the PNG.

## Current state (file / line evidence)

### Results screens and the results camera
- Classification and podium DOM: `js/ui/results-story.js` — `summary()` L10–19
  builds `{podium, player}` from the canonical order; `render()` L21+ emits the
  podium `<ol>` (L44–52). Pure data in `summary()` is exactly what a card needs.
- Race / TT results builders: `js/ui/results-sheet.js` (654 lines): TT section
  with ghost delta row (~L402–417), medal row (~L424–437), DAILY share button
  `res-daily-share` (L456–470, clipboard text only via `G.daily.shareText`),
  ghost COPY LINK / COPY CODE / DOWNLOAD buttons (L472–530). Championship
  standings (`buildStandings`, ~L346–378) end in `VIEW CHAMPION` after the last
  round (L374).
- `js/camera/results-cam.js`: phases `chequered | orbit | highlights`
  (`live()` ~L72); publishes `G.dbgCam` poses (`publish`, ~L86). Under
  `state === "results"` the camera is already framing the winner, so a card
  backdrop can be a normal Photo Studio capture rather than new camera code.

### Photo Studio
- `js/ui/photo-studio.js` (307 lines): `ASPECTS` L8, private `blobOf(canvas,type,q)`
  L51–55, `download(blob,name)` L56–60, 6-photo IndexedDB library (`DB`, `LIMIT = 6`),
  `compose()` ~L216 (optional postcard caption), `exportPhoto` L247. Constructed in
  `js/game.js` L8362 (`PhotoStudio.create(G, …)`). Readback is
  `G.gfx.capturePixels()` — asynchronous, and software-rendered here
  (`docs/notes/CI-RENDERING-PERFORMANCE.md`), so a card must never block on it.

### Daily, ghost, season, career data
- `js/race/daily-challenge.js` (156 lines): plan is a pure function of the UTC date
  (`plan()` L24–34); `record()` L84–113 advances the streak from `active.day`
  (`prevDay` logic L95–98); `shareText(medal)` L121–133 yields
  `APEX 26 DAILY <day> · <TRACK> · <time> · <MEDAL> · STREAK n`;
  `liveStreak()` ~L141. NOTE: `record()` on a PAST day with `streak.last === today`
  resets the streak to 1, so a link may stage only today's daily (see Design).
- `js/car/ghost-share.js` (302 lines): limits L6–9 (`MAX_FRAGMENT_CHARS 14 KiB`),
  `shareUrl` L104–107 → `#ghost=<code>`; consumed by `consumeGhostHash` in
  `js/ui/title-flow.js` L27–52 which STAGES the picker (daily if `shared.day ===
  today`, else free-play track) and never calls `startRace`. `js/car/ghost.js`
  exposes `snapshot()` L216, `timeAt(s)` L358, `medal()` L223: enough to compute a
  speed trace (ds/dt) and a PB-vs-rival delta (`GhostShare.timeAt`, L244).
- Season: `js/career/season-cal.js` (`rank`, `netPts`, `rounds()`); results-sheet
  already sorts drivers/teams for the post-round table (L357–367).
- Career year summary: `rollover()` in `js/career/career.js` (~L1481–1500) writes
  `career.history` entries `{year, team, pos, pts, cPos, cPts, champion, wins,
  podiums, craft}`; shown as "THE YEAR" card in `js/career/career-ui.js` L1286–1292.
- There is NO player display-name setting anywhere in `js/` (grep for
  playerName/driverName/nickname finds none relevant), so privacy-by-default holds.

### Existing canvas -> PNG -> share code (three private copies)
- `js/editor/designer.js`: `saveFile` L1431 (`NativeDownload` in
  `js/core/native-download.js`, else `<a download>`), `blobOf` L1441, `cardCanvas`
  L1478 (640x360), `shareCard` L1508–1530: `new File`, `canShare({files})`, `share`,
  `AbortError` = the player's choice, else save.
- Duplicates: `js/ui/photo-studio.js` `blobOf` + `download`; `js/data/export.js`
  L187 `canvasPng`; `js/net/lobby-codes.js` `canShare` L58 / `handOff` L157 (text only).
- QR: `js/net/qr.js` `NetQr.draw(canvas, text, {px, light, dark})` L312;
  `NetQr.capacity()` = **858 bytes** (version 20, ECC L; `L_BLOCKS` L46–54);
  guarded caller `LobbyCodes.paintQr` L51; jsQR-verified in `tests/unit/net-qr.test.mjs`.

### Fonts / tokens
- `css/tokens.css` L25–45 ships self-hosted Titillium Web and Barlow Condensed
  (`assets/fonts/`); tokens `--font-ui` L472, `--red` L236, `--bg` L242,
  `--gold/--silver/--bronze` L578–580. A canvas needs `document.fonts.load()`
  first or it silently uses the fallback. L17 notes Titillium is the real F1 site's
  family (see Risks, IP).

### Web-API facts (verified 2026-10-04)
- `navigator.canShare({files})` is false where file sharing is unsupported; HTTPS
  only; not Baseline. https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare
- `navigator.share()` needs HTTPS and transient activation; `NotAllowedError` =
  no activation / blocked, `AbortError` = cancel.
  https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- `OffscreenCanvas.convertToBlob()` is Baseline since March 2023; `SecurityError`
  on a tainted bitmap. https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob
- iOS Safari canvas area cap 16,777,216 px (third-party, undocumented by Apple).
  https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/

## Design

### Principle: the card is a view of a plain data object
`CardModel` is a frozen, JSON-serialisable object built by pure functions from data
the game already holds. Layout is a pure function `layout(model, spec) -> ops[]`
(a flat list of `{op:"rect"|"text"|"line"|"path"|"qr", …}` in card pixels). A
tiny painter executes ops on any 2D context. Everything testable is pure; only the
painter touches canvas.

```
CardModel = { v:1, kind:"race"|"daily"|"ghost"|"season"|"career",
  title, subtitle, trackId, trackName, dayKey|null, weather|null,
  rows:[{pos,code,name,teamColor,value}],        // race / season (<=10)
  hero:{label,value,medal|null,streak|null},     // daily / ghost
  chart:{s:[], a:[], b:[]|null}|null,            // ghost: speed + delta, <=120 pts
  display:{name|null}, link:string|null }        // name is the player's choice
```

### Modules (all new; each an IIFE with one global, manifest entry, `gen-shell`)
- `js/<new>/ui/share-card-data.js` (`ShareCardData`): pure builders
  `fromRace(order, opts)` (reuses `ResultsStory.summary`), `fromDaily(day, entry,
  medal, streak)`, `fromGhost(ghostA, ghostB, meta)` (speed = ds/dt over `s,t`,
  delta = `timeAt` difference, both resampled to <= 120 points),
  `fromSeason(season, standings)`, `fromCareerYear(historyEntry)`.
  Sanitises text (strip control chars, clamp lengths — mirror `photo-studio.js`
  `text()` L11) and drops every field not in the model.
- `js/<new>/ui/share-card-layout.js` (`ShareCardLayout`): `SPECS`
  (`portrait 1080x1350`, `landscape 1200x630`, `square 1080x1080`), `layout(model,
  spec)`, text fitting by a measure function passed in (so unit tests use a fake
  metric), chart scaling, QR placement. No DOM, no canvas.
- `js/<new>/ui/share-card.js` (`ShareCard.create(G)`): `render(model, spec, opts)
  -> Promise<Blob>` (OffscreenCanvas + `convertToBlob` when
  `typeof OffscreenCanvas === "function"`, else a detached `<canvas>` + `toBlob`);
  `ensureFonts()` (`document.fonts.load` for the three faces, 1.5 s cap, falls back
  to `system-ui`); `deliver(blob, name, {title,text,url})` = canShare -> share ->
  `AbortError` silent -> `NativeDownload`/`<a download>` fallback. The designer's
  `shareCard` tail and `blobOf` become thin callers of `deliver`/`render`
  (Slice 1 deletes the duplicate code, net negative lines).
- `js/<new>/ui/share-link.js` (`ShareLink`): `encode(kind, fields) -> "#card=…"`,
  `decode(hash)`, `consumeHash(deps)`. Compact, versioned, hard-capped (below).

### Link / QR: what it carries and why not the ghost
A ghost URL can be 14 KiB (`ghost-share.js` L7) and the QR holds 858 bytes, so the
QR carries only a SHORT staging link:
`<origin><path>#card=1.<kind>.<trackId>.<day|->.<timeMs|->.<ctx|->` (< 120 chars).
Consuming it STAGES, never starts, mirroring `consumeGhostHash` in
`js/ui/title-flow.js` L27–52: `day === today` -> `G.daily.select(day)`; otherwise
`G.daily.stop()` and select the free-play track (never a past-day daily, because
`record()` would reset the streak — daily-challenge.js L95–98); a "beat 1:21.345"
target is shown as an announce line, not a ghost. The full ghost remains the
existing COPY LINK button. If the link cannot encode, the QR is omitted and the
card still renders (the "unofficial" mark and text stay).

### Layouts (one renderer, five models)
| kind | content | source |
|---|---|---|
| `race` | podium 1-3 with team colour bars, player row if outside, fastest lap | `ResultsStory.summary` |
| `daily` | date, circuit/weather/time, big time, medal, STREAK n, QR | `DailyChallenge` inputs, `liveStreak()` |
| `ghost` | two lap times, delta, speed trace + delta mini-chart | `Ghost.snapshot()` vs rival |
| `season` | top-10 drivers, top-3 teams, rounds done | `SeasonCal.rank`, `season.teamPts` |
| `career` | year, team, pos / pts, wins/podiums, champion code | `career.history` entry |

Palette is read once from `getComputedStyle` and frozen into the spec (tests pass
a fixed one). Default backdrop is a flat gradient plus circuit outline (the
designer's `strokeOutline`, L1450–1466, as a `path` op); a Photo Studio capture is
an optional Slice 3 backdrop.

### IP and privacy (hard rules, each with a test)
- Visible footer on every card: `UNOFFICIAL FAN GAME · APEX 26` plus the site
  host; footer contrast >= 4.5:1 against its band. No F1 logo, wordmark, trophy art,
  car/helmet likeness of real branding, or "FORMULA 1" string; team and driver names
  only where the game already shows them. Data-origin of any real-race row is not
  carried (real-race data is a separate licence topic).
- No personal data: the only free text is `display.name`, opt-in, entered in the
  share sheet each time (default empty -> "DRIVER"), stored under
  `apex26.cardName` only if the player ticks "remember". No device id, locale, time
  zone, or save-slot name; no EXIF (canvas PNG has none).

### UI placement and state flow
One button per screen, created from JS (no shell node), `className = "sel-chip"`:
`res-daily-share` row gets a sibling `res-card-share` (`SHARE CARD`) next to
COPY DAILY RESULT (results-sheet.js L456); `buildTTResults` adds it beside the
ghost buttons; `buildStandings` adds it on the champion panel; `career-ui.js`
adds it under "THE YEAR". Tap -> `ShareCardData.from*` -> `ShareCard.render`
(button `DRAWING…`, disabled) -> `deliver`. `share()` needs transient activation
and rendering is async, so if `NotAllowedError` fires, show a PREVIEW `<img>` with
a second SHARE tap. Call sites in
`results-sheet.js` / `career-ui.js` only; `js/game.js` is NOT touched.

## Slices

### Slice 1 — Shared renderer + deliver, daily card (M)
**PR title:** `share-cards: shared card renderer, daily result card`
- Files: new `js/<new>/ui/share-card-data.js`, `share-card-layout.js`,
  `share-card.js`, `share-link.js` (encode/decode); edit `tools/manifest.cjs` (+
  `npm run gen`), `js/ui/results-sheet.js` (<= 25 lines), `js/editor/designer.js`
  (swap `blobOf` / share tail for `ShareCard.deliver`, net negative);
  `tests/groups.json` group + `docs/TESTING.md` §5 row.
- Tests: `tests/unit/<new>share-card-layout.test.mjs`, `share-card-data.test.mjs`,
  `share-link.test.mjs`; `tests/unit/daily-challenge.test.mjs` stays green.
- Verification (one subsystem): new units + `npm run test:tooling-fast`; one designer
  spec alone for the refactor.
- Ratchets: `game.js` +0 (untouched); `designer.js` net negative; zero shell nodes
  and CSS classes.

### Slice 2 — Race result + season + career cards (M)
**PR title:** `share-cards: race, season and career year cards`
- Files: `share-card-data.js` (`fromRace`, `fromSeason`, `fromCareerYear`),
  `share-card-layout.js` (podium/table), call sites in `js/ui/results-sheet.js`
  (race table + `buildStandings`) and `js/career/career-ui.js`; name field is an
  existing `sel-chip` row.
- Tests: extend Slice 1 units — top-3 plus player row outside the podium; DNF/DSQ
  rows; 10-row clamp; career entry from a real `rollover()` fixture.
- Verification: units; the career unit tests naming `rollover`/`history`; one browser
  spec alone only if `career-ui.js` DOM changes. Ratchets: `game.js` +0.

### Slice 3 — Lap-vs-ghost card, speed/delta chart, `#card=` consume (M–L)
**PR title:** `share-cards: ghost lap card, mini-chart, staging link`
- Files: `share-card-data.js` (`fromGhost`: resample, ds/dt, delta), a chart op in the
  layout; `share-link.js` `consumeHash`, called from `js/ui/title-flow.js` beside
  `consumeGhostHash()` (L52, <= 6 lines); QR via `NetQr.draw` (length asserted under
  `NetQr.capacity()`); optional backdrop hook in `js/ui/photo-studio.js` only if net >= 0 lines.
- Tests: unit — delta at the finish equals `a.time - b.time` within 1 ms, equal-length
  resampling, `b = null`; link round trip; consume never calls `startRace`/`gridUp`
  (inject stubs); past-day link stages the track, never `G.daily.select`.
- Verification: unit tests; `node tools/ci/remote-group.mjs ui` on the pushed branch
  if a browser spec is added; paste-ghost regression = `tests/unit/ghost-share.test.mjs`.
- Ratchets: `game.js` +0; `title-flow.js` small add.

### Slice 4 — Polish: sizes, memory, a11y, docs (S)
**PR title:** `share-cards: preview sheet, size options, docs`
- Preview `<img alt>` with a polite status line; portrait/landscape/square choice;
  byte-budget guard (<= 1.5 MB or fall back to a smaller spec); `npm run gen`;
  one `docs/PLATFORM.md` paragraph on Safari limits; `docs/TESTING.md` §5 rows.
- Verification: `test:tooling-fast`; one existing UI spec in phone-portrait. Ratchets: none.

## Verification (what is asserted, what is not)
All logic tests are node unit tests with a recording fake 2D context and a fake
measure function; **no test compares pixels**, no PNG is committed.
- Layout: no op exceeds the card; text fits via the fake metric; row counts clamp;
  the footer op exists on every kind/spec; no op contains "FORMULA 1".
- Data: sanitisation; `display.name` absent -> "DRIVER"; no keys outside the
  schema (privacy); JSON round-trip.
- Link: round-trip; rejects wrong version, oversize, unknown track, bad time;
  length < 120 and < `NetQr.capacity()`.
- Deliver: stub `navigator` — canShare false -> download; `AbortError` -> no
  fallback; `NotAllowedError` -> fallback; null blob -> message.
- Static: card modules contain no `fetch`, no `localStorage` write except
  `apex26.cardName`, no bare `console.*`; manifest puts `qr.js` before `share-card.js`.
Manual sign-off (cannot run here): one share each on iOS Safari and Android Chrome,
recorded in the PR body.

## Risks
1. **Share API gaps / activation.** File share is absent on desktop Firefox and some
   Chromium builds; `share()` needs transient activation and async render can outlast
   it. Mitigation: download path always; preview + second tap; `AbortError` is silent.
2. **iOS Safari canvas limits.** 16.7 Mpx area cap; 1080x1350 is 1.46 Mpx, so keep
   specs <= 2 Mpx, scale 1 (no devicePixelRatio), set `width = 0` after export. A
   tainted canvas throws on export: same-origin assets only.
3. **IP.** The game already uses Titillium Web and `#e10600`; an exported image loses
   in-game context. Footer says "unofficial fan game", no logo/wordmark/trophy/trade
   dress; owner reviews the footer wording.
4. **Phone cost.** One render on tap, no timers; backdrop capture optional
   (SwiftShader-slow here, fast on a GPU); fonts load once with a cap.
5. **Daily streak corruption** if a link staged a past-day daily — closed by the
   today-only rule and a test.
6. **Concurrent PRs.** player-a11y Slice 4 may land first; run
   `node tools/ci/who-is-on-it.mjs` first and keep `share-link.js` a thin adapter.

## Open questions for the owner
1. Player display name at all, or anonymous "DRIVER"? Proposed: anonymous, optional
   name typed per share.
2. Footer wording; is the QR (to `https://brycejmurrin.github.io/f1-game/`) on by default?
3. May cards use Titillium/Barlow and the `#e10600` accent, or a distinct palette?
4. Ghost card link: opponent-time target only (this plan), or a thinned ghost (< ~800 B)?
5. Order against player-a11y Slice 4: cards first (adapter) or fold into its envelope?
6. Real-race watch/highlights results are excluded (data licence); confirm.

## Effort
| Slice | Size |
|---|---|
| 1 Shared renderer + daily card | M |
| 2 Race / season / career cards | M |
| 3 Ghost chart card + `#card=` consume | M–L |
| 4 Polish and docs | S |
