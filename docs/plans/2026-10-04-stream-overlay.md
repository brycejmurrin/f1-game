# Stream overlay mode — broadcast graphics on a transparent page for OBS

Date: 2026-10-04
Status: **PLAN** — docs-only; implement as four draft PRs against
`claude/f1-game-project-26h3ng`, one slice each, in the order below. Do not merge.
Scope: a read-only overlay page (timing tower, radio captions, battle graphic,
sector flashes) that an OBS Browser Source composites over the player's own game
capture. No gameplay, physics or renderer change; `js/game.js` does not grow.

Paths written `js/<new>/name.js` are PROPOSED. A backticked path without `<new>`
exists on disk. Proposed non-JS files (the overlay page, its stylesheet, tests)
are named in plain text, not backticks, until they land.

## Related (do not duplicate)

| Doc / module | What it owns | Relation |
|---|---|---|
| [2026-09-30-broadcast-feel.md](2026-09-30-broadcast-feel.md) | TV director, replay, results highlights inside the game | Different surface: that is in-game camera work; this is a second page. Reuses `Broadcast.battles` only |
| `js/race/broadcast.js` | WATCH timing tower (`#bc-tower`), `battles()` (BATTLE_S = 1.0), 4 Hz tower tick | Source of the battle rule and the 4 Hz cadence. Its tower is REAL-RACE-replay only, so it is not the live source |
| `js/input/phone-pad.js` + controller.html | Second page joins the game over WebRTC and gets a dash stream back | The precedent for transport (b). Same wire pattern, reversed payload |
| `docs/MULTIPLAYER.md` | RACE A FRIEND star topology, Nostr rendezvous, TURN | Overlay joins it passively; must not take a grid seat (`MAX_GUESTS = 3`) |
| `docs/DEBUG-HOOKS.md` | `__apex` hook reference | Hooks named below as existing are from here |

## Goal
A streamer opens one URL in an OBS Browser Source and gets F1-style graphics over
their gameplay with a transparent background, driven live by the game they are
playing in their normal browser. Setup should be: toggle one setting, paste one
link into OBS.

## Non-goals

- Running the whole game inside OBS as the primary path (see Transport, option a).
- Any backend, account, or installed helper in the primary path.
- Chat integration, alerts or viewer interaction (output-only); replacing the
  in-game HUD or `hud(false)`; recording overlay data; real F1 branding.

## Current state (evidence)

### HUD, hooks, boot

- HUD DOM is in `index.html`: `#hud` (L515), `#hud-gap-ahead` / `#hud-gap-behind`,
  `#hud-sectors`, WATCH-only `#bc-tower`, `#announce` (+ spoken twin
  `#announce-live`), `canvas#game` (L398). `body.hud-hidden` (`js/game.js` ~L8738,
  `css/touch-controls.css` L704–709) only hides HUD nodes: the page background is
  `var(--bg)` (`css/tokens.css` L1121) and the renderer still runs, so it is NOT
  a basis for an overlay.
- Sector colours (purple field best, green personal best, `sec-flash`) are the
  rule at `js/ui/hud.js` ~L1160–1195, fed by `sectorLast` / `sectorBests` /
  `fieldSectorBests` (`js/game.js` L897–900).
- Tower data: `__apex.field()` (`js/agent/agentview.js` L599) gives per car `pos`,
  `id`, `code`, `team`, `isPlayer`, `lap`, `gapToLeaderS`, `intervalS`, plus `seq`,
  `t`, `raceState`. The older `fieldState()` (`js/agent/apex.js` L2182) is metres:
  prefer `field()`. `sectorState()` (L2136) is player-only with no field best
  (PROPOSED: add `fieldBest`). `timing()` (L2156) gaps are metres, not seconds.
  `info()` (L468) gives `track`, `lapsTarget`, `sectors`, `session`.
- Battle: `Broadcast.battles()` (`js/race/broadcast.js` L106, exported L347) is
  `(a.prog - b.prog) / max(speed, 20)` with a 1.0 s gate. Reuse; do not re-derive.
- Captions: NO hook. `showAnnounce` (`js/game.js` L1052) fills `#announce-num`,
  `#announce-who`, `#announce-text`, `dataset.kind`; gating is `js/race/race-radio.js`.
- Query flags are ad hoc (`?seed=` `js/game.js` L590, `?upscale=1`
  `js/render/three/tlx.js` L907, `?gfxdebug=1` `js/perf/gfx-debug-overlay.js` L30);
  hashes carry payloads (`#vs=` `js/net/handshake.js` L308, `#ghost=`). No router;
  `index.html` loads game and renderer by script tags, so `?overlay=1` there cannot
  skip boot cheaply.
- Root pages exist: bench.html, controller.html, cockpit-view.html. controller.html
  loads only the `CONTROLLER` subset (`tools/manifest.cjs` L974): no game, renderer
  or store. A root page must be in `tools/desktop/stage-files.mjs` or it 404s on
  Pages (`tests/unit/deploy-staging.test.mjs` asserts it).

### Transport evidence (the design trap)

- `js/input/phone-pad.js` header documents exactly the needed pattern: a separate
  page joins the game over a WebRTC DataChannel signalled through a six-letter
  room code on public Nostr relays (`js/net/rendezvous.js`, `js/net/nostr.js`,
  `js/net/transport.js`), and the host streams a ~15 Hz dash back (`HUD_MS = 66`).
- `js/net/netplay.js` has roles `host` / `guest` only; `MAX_GUESTS = 3`
  (`js/net/lobby.js` L22). A third passive role is anticipated in a comment at
  `js/net/netplay.js` L1056. The overlay must use the phone-pad style side channel, not
  a seat in a race.
- OBS Browser Source is CEF (Chromium Embedded Framework): OBS's own embedded
  Chromium, https://obsproject.com/kb/browser-source and
  https://github.com/obsproject/obs-browser. The default source CSS is
  `body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; ... }`, default
  800x600, 30 FPS, with "Shutdown source when not visible" (same KB page).
- BroadcastChannel needs the same origin AND storage partition (browser profile):
  https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API. OBS's CEF
  is an embedded Chromium with its own profile and cache (secondary source only:
  https://obsproject.com/forum/resources/webkitgtk-browser.2607/; no first-party
  OBS statement found, so the checklist re-tests it). So BroadcastChannel,
  localStorage and postMessage cannot bridge the player's tab and an OBS source.
  Local-file sources in OBS 27+ also break BroadcastChannel; use a URL.

## Design

### Transport decision

| | (a) game runs in OBS as the source | (b) overlay joins as passive spectator over WebRTC/Nostr | (c) second window, BroadcastChannel, window capture | (d) local relay |
|---|---|---|---|---|
| Effort | M (transparent canvas through 3 renderers; keyboard focus via OBS Interact) | M (phone-pad pattern reversed; new read-only feed) | S (no net code) | M + a binary to ship |
| Latency | 0 | ~50–250 ms (same Wi-Fi: a few ms, per phone-pad docs); text at 4 Hz hides it | ~0 | ~0 |
| Streamer friction | High: plays the game inside OBS, no real input, double capture | Low: setting toggle, copy link, paste into OBS | Medium: second window, Window Capture, chroma key (window capture has no alpha) | High: install and run a helper |
| CPU, desktop | Highest: full WebGL in CEF at 30 FPS plus the player's own copy | Lowest: DOM text page, no WebGL | Low-medium: second tab, background throttling | Low |
| Phone | Not feasible | The phone plays; the PC runs OBS and pulls the feed; phone sends ~1 KB/s extra | n/a (phone cannot run a second window) | n/a |
| Transparency | Needs the renderer's alpha canvas (`alpha: !0` hard-coded in TLX, comments at `js/render/three/tlx.js` L200–300; GLX uses `alpha:false`) | Native: DOM page, CSS transparent | Not available: chroma only | Native |
| Works offline | Yes | No (Nostr handshake, ~10 s) | Yes | Yes |

**Recommendation: (b) as the primary**, because it is the only option that gives
the Browser Source URL workflow (no window capture, true alpha, no chroma) with
no install, and the repo already ships the exact machinery (`PhonePad` host,
`controller.html`, `NetTransport`, `NetRendezvous`). It also keeps OBS CPU near
zero: the overlay page never loads the game, a renderer or a store.

**Fallback: (c)**, shipped first as the dev/test transport and for offline use or
a blocked Nostr/WebRTC path: the overlay page opened in a second window of the
SAME browser, captured with OBS Window Capture and keyed with `?chroma=green`.
Both transports carry the same frame schema, so the renderer is transport-blind.
Not recommended: (a) (a 3D game in CEF at 30 FPS is the worst CPU and input
story), (d) (installs and a local server are out of scope for a static site).

Unverified before slice 3: whether CEF in current OBS (v31/32) gets WebRTC
host/srflx candidates and allows the Nostr WebSockets. OBS Browser Source is
Chromium, so both should work, but the manual checklist must prove it on Windows
and macOS before slice 3 is called done. Mixed-content note: the overlay page is
served over https from Pages and talks only to Nostr over `wss:` and a peer;
nothing is `ws://` (MDN treats loopback http as exempt but does not state
`ws://localhost`, so (d) is deliberately excluded).

### Pieces

1. **Overlay page** (new root page, overlay.html, modelled on controller.html;
   a subset in `tools/manifest.cjs` like `CONTROLLER`). Loads: `js/core/log.js`,
   the net subset, then proposed `js/<new>/overlay/feed.js` (schema + mapping),
   `js/<new>/overlay/render.js` (DOM painter), `js/<new>/overlay/bridge.js` (transport).
   `index.html?overlay=1` is not honoured by the game shell; a tiny head redirect
   to overlay.html is an Open question (cost: a generated-shell block).
2. **Frame schema** (`js/<new>/overlay/feed.js`, pure, node-testable). One frame per
   publish tick:
   `{ v:1, seq, t, state, track, lap, laps, flag, rows:[{pos, code, team, interval|gap, tyre?, pit?, you?}], battle:{ahead, behind, gapS}|null, sectors:{idx, last:[3], best:[3], fieldBest:[3]}, caption:{n, who, text, kind, id}|null }`.
   Only changed parts are re-sent; a full frame every 2 s for late joiners.
   Tower rows come from `field()` with `intervalS`; the battle from
   `Broadcast.battles()` fed by the same rows; sector colours reuse the HUD's
   purple/green/yellow rule (copy the predicate into feed.js with a test that
   pins it to `js/ui/hud.js`'s result, not a second definition of "purple").
3. **Publisher** (player side, `js/<new>/overlay/publisher.js`): samples at 4 Hz for
   rows and sectors (timer, not rAF, so it never lands in the frame budget) and
   event-driven for captions. Caption tap: a `MutationObserver` on `#announce`
   (childList + attributes) plus reading `dataset.kind`, `#announce-num`,
   `#announce-who`, `#announce-text`. That needs ZERO `js/game.js` lines and
   runs only while an overlay peer is connected. If the observer proves
   fragile, the fallback is one call in `showAnnounce` paid for by an equal
   extraction (ratchets: `js/game.js` lines 8982, codeLines 4816).
4. **Painter** (`js/<new>/overlay/render.js`): builds 20 fixed rows once, then
   writes `textContent` / `dataset` only where a value changed, in one rAF, with
   no layout reads and no `innerHTML`. Rows are absolutely positioned and move by
   `transform`, so a place change never reflows; tabular digits keep numbers still.
   Sector flash and battle card are class toggles; reduced-motion makes the flash
   a static outline.
5. **Transparency and chroma.** overlay.html sets `html, body { background:
   transparent }` (it must not link the game's `css/tokens.css` rule at L1121
   verbatim; it declares its own sheet and imports only the font tokens). OBS
   already supplies a transparent default (KB above) but the page must not rely
   on it, since window capture and a plain browser tab need explicit alpha.
   `?chroma=green` sets `background:#00b140` (also `blue`, `magenta`); no
   anti-aliased glow or `box-shadow` blur in chroma mode (it fringes under a
   key), and text gets a 1 px solid outline instead. Other params:
   `?scale=` (0.5–2), `?side=left|right`, `?rows=10`, `?demo=1` (synthetic feed,
   no peer: the layout tool for OBS and the CI render).
6. **Accessibility.** The overlay is a viewer graphic; the player keeps the in-game
   HUD and `#announce-live`. Real text (no images), `role="region"` + label, 4.5:1
   text contrast on team plates, and the HUD's star / down / up sector glyphs so
   colour is never the only channel; `?only=captions` for caption-only use.
7. **No gameplay effect.** Read-only: no car-field writes, no `Tracks.curvature`
   read (PHYSICS.md's table is untouched), a timer outside the physics tick that
   stops when the peer leaves.
8. **Room setup in the game** (slice 3): a SETTINGS row STREAM OVERLAY in
   SETTINGS, next to PHONE AS CONTROLLER (reuse that pairing UI and QR/link
   pattern; no new shell nodes if the row reuses `js/ui/setting-row.js`
   conventions). It mints a room, shows a copyable overlay.html link with the
   code, and shows connected / waiting. Room codes are unguessable per
   `js/net/rendezvous.js`; the overlay is read-only so a guesser can only watch.

## Slices

Each slice is one draft PR; branch `claude/stream-overlay-<slice>`.

### Slice 1 — Schema, painter, demo page (M)

- New: `js/<new>/overlay/feed.js`, `js/<new>/overlay/render.js`; overlay.html, overlay
  stylesheet, `tools/manifest.cjs` subset + `tools/desktop/stage-files.mjs`
  entry, `npm run gen` for generated shells. Tests: unit tests for the mapping
  (below) and `tests/unit/deploy-staging.test.mjs` stays green.
- Ships `overlay.html?demo=1` with a synthetic feed: transparent page, chroma
  variants, scale/side params. No game changes at all.
- Verification (tools/tests-only row): `npm run test:tooling-fast`; one new
  Playwright spec asserting computed background is transparent and chroma sets
  the key colour. Ratchets: `js/game.js` untouched; shellNodes / cssClasses
  unaffected (separate page; confirm with `tools/check/ratchets.mjs`).

### Slice 2 — Same-browser publisher + BroadcastChannel fallback (S–M)

- New: `js/<new>/overlay/publisher.js`, `js/<new>/overlay/bridge.js` (BroadcastChannel half).
  Wiring goes through the `__apex` surface, so `js/game.js` does not grow (a `G`
  member, if unavoidable, ships with an equal extraction). Add `fieldBest` to `sectorState()` in `js/agent/apex.js` (PROPOSED field).
- Verification: unit tests; a browser spec booting a race, opening the overlay
  in a second page of the SAME context, asserting rows follow `__apex.field()`
  within 0.5 s. Run that single spec (`npm test -- tests/specs/<new>.spec.js`),
  never a whole group. `tools/ci/test-bg.mjs` in the background per rule 5.

### Slice 3 — Spectator link over WebRTC/Nostr (M–L)

- `js/<new>/overlay/bridge.js` gains the net half, following `PhonePad.host` / `pad`
  (`js/input/phone-pad.js` L276): the host mints a room via `NetRendezvous`, accepts
  a passive peer, sends frames on the unreliable state channel and captions as a
  reliable event; overlay.html joins by `#ov=CODE`; reconnect with backoff, full
  frame on join. Never touches `js/net/netplay.js` roles or `MAX_GUESTS`.
- Verification: a `NetTransport.loopback` unit test with injected latency / loss /
  jitter (ordering, resend, idempotent captions). Real WebRTC is not provable in
  CI: the manual OBS checklist is the gate. Add a section to `docs/MULTIPLAYER.md`.

### Slice 4 — Polish and streamer docs (S)

- `?only=captions`, `?rows=`, reduced-motion pass, team-colour contrast check;
  a streamer docs page (the setup below). Verify: unit + the overlay spec.

## Streamer setup

Primary (spectator link):
1. In Apex 26: SETTINGS, STREAM OVERLAY, press START. Copy the link shown.
2. In OBS: Sources, +, Browser. Paste the link as the URL. Width 1920, Height
   1080 (match the canvas). FPS 30 is enough. Do NOT tick Local file. Leave
   Custom CSS at its default (transparent body).
3. Leave "Shutdown source when not visible" ticked to save CPU.
4. Start your race. The tower, captions, battle card and sector flashes appear
   over your game capture. Hide the in-game HUD (SETTINGS, HUD, OFF) if you
   don't want it twice.

Fallback (same browser):
1. Open the overlay link (`?chroma=green`) in a second window of the same browser
   you play in. 2. OBS: Window Capture on that window, add Filters, Chroma Key,
   Key Color Type Green. 3. Keep that window unminimised (Chrome throttles
   hidden tabs; a covered window still captures).

## Verification

- Node unit tests for the mapping (the CI-provable part), proposed
  an overlay-feed unit test under `tests/unit/`: rows from a field fixture (order, interval
  vs gap toggle, player flag); battle graphic appears at 0.99 s and not 1.01 s
  and picks the closest pair; sector colour parity with the HUD predicate for
  purple / green / yellow / none; frame diffing (unchanged rows are not
  re-sent; a full frame every 2 s); caption dedupe by id; schema version gate;
  a source-regex test that the overlay modules contain no `Tracks`, `curvature`
  or physics write (pattern follows the grip-steer plan's regex test).
- Painter: a mini-DOM test that a place change moves by transform and unchanged
  text is not rewritten.
- Manual OBS checklist (CI cannot run OBS), on Windows and macOS: [ ] overlay over
  a game capture; [ ] real transparency (checkerboard in OBS preview); [ ] no
  green fringe under chroma key at 1080p; [ ] 4 Hz text, no flicker; [ ] battle
  card only within 1 s; [ ] sector flash on a lap; [ ] radio caption appears and
  clears; [ ] scene switch away and back reconnects; [ ] OBS CPU for the source
  under ~3 % and game frame time with publisher on equals off (`apex_frame_report`,
  within noise); [ ] phone host to PC OBS over one Wi-Fi.
- Per AGENTS.md: all edits first, then `npm run test:tooling-fast`, then
  `node tools/ci/deploy.mjs --gate-only` before push; browser specs one at a
  time via `tools/ci/test-bg.mjs`. A change that touches `js/agent/apex.js` is
  an engine/agent edit: name any groups not run in the PR body.

## Risks

1. **Transport unproven in CEF** (WebRTC candidates, Nostr WebSockets, OBS
   version spread). Mitigation: demo mode, the BroadcastChannel fallback, and a
   manual checklist gate on slice 3.
2. **Caption tap is DOM-coupled.** A markup change in `#announce` silently stops
   captions. Mitigation: a unit test pinning the selector set, and a fallback of
   one call site funded by an extraction.
3. **Shared Nostr relays and room codes** carry the feed: availability and
   privacy are the relays'. Mitigation: read-only data only, no player identity
   beyond driver codes; the host can stop the room at any time.
4. **New root page plumbing** (stage allow-list, manifest subset, precache): a miss
   is a 404 on Pages. Guarded by `tests/unit/deploy-staging.test.mjs`, `npm run gen:check`.
5. **Hook drift and duplicated purple logic**: pin both with the unit fixtures.

## Open questions for the owner

1. Separate overlay.html (with `index.html?overlay=1` merely redirecting, needing a
   shell head script), or must `index.html?overlay=1` itself be the overlay? The
   latter means gating game boot, which is invasive.
2. Is a public-relay Nostr link acceptable for a streaming feed, or wait for a
   self-hosted relay?
3. Live races only first, or also WATCH / HIGHLIGHTS (`Broadcast` already builds that tower)?
4. Tyre compound and pit status in the tower (tyre wear is OFF by default)?
5. Who runs the OBS checklist on Windows and macOS?

## Effort
| Slice | Size | Notes |
|---|---|---|
| 1 Schema, painter, demo page | M | Mostly new files; root-page plumbing is the fiddly part |
| 2 Publisher + BroadcastChannel fallback | S–M | No net code; one hook field |
| 3 Spectator link over WebRTC/Nostr | M–L | Reuse of PhonePad pattern keeps it M; CEF proof can push it to L |
| 4 Polish + streamer docs | S | |
