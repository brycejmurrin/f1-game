# Bug hunt, round 2: register (2026-10-10)

What this records: a second whole-tree hunt run on the deploy tip `2628dae2b`, one day after round 1
(the ledger note BUG-HUNT-LEDGER-2026-10-09 on the branch `cursor/bug-hunt-ledger-88f2`, not on the deploy branch). Sixteen read-only
hunters worked one subsystem each, with the round-1 ledger, `docs/BUGS.md` and sibling PR #1289 as the
do-not-re-report list. Every headline claim below was re-read at the cited lines before it was acted on.
Dated by design: line numbers are those of `2628dae2b`.

Totals: 79 findings, 23 already fixed in the sibling draft #1289 (not re-done), 56 open at the time.

## How the work was run (reusable)

1. One shared brief (read-only, evidence per finding: file:line, quoted fragment, trigger, fix, confidence).
2. Re-read each cited line yourself; discard what does not reproduce.
3. Lane-scoped Sonnet fix agents in isolated worktrees, disjoint OWNED/FORBIDDEN globs, a unit test that
   fails on the base, commit + push per item, draft PR. Waves of 4-5 (one agent died on a session rate limit).
4. Main session: ready-gate, ONE remote browser group per PR (`tools/ci/remote-group.mjs`), cap check
   (`tools/ci/ready-full-cap.mjs`), then ready + squash auto-merge.

## Lessons that cost time

- Auto-merge waits only for the required fast-tier checks. **"Per-circuit geometry sweeps" is not required**,
  so #1311 merged with it red (a stale clip cap). A geometry PR should wait for that job, or run
  `npm run test:sweeps` first. When geometry shrinks, every cap in `tools/track/{coplanar,clip,props-tris}-baseline.json`
  and `tests/data/scenery-audit-baseline.json` must come down (the "no stale entries" ratchets enforce it).
- A new unit test must be registered in a group the pre-push gate derives (`tests/groups.json` `toolingFast`),
  not only `test:sweeps`, and the group list is kept sorted by `tools/check/merge-hygiene.mjs --fix`.
- A `file.js:123` citation in another file fails `comment-citations`; cite the symbol.
- `git add` and `git commit` must be separate commands (the guard measures the staged tree).
- A GitHub re-run is refused while the run is still in progress; re-run once after it completes.
- A test pinning an old code shape (`boot-idle-prefetch`) fails when the code is intentionally restructured;
  update the assertion to the new shape and keep the intent.
- Git's racy-timestamp check made `workTreeId` flaky (a same-size rewrite inside one timestamp tick); the
  temp index copy now inherits the real index mtime (`tools/lib/work-tree-id.mjs`).

## Findings by area and where they went

Legend: **M** merged to the deploy branch; **1289** fixed in sibling draft #1289; **hand** handed to a sibling
session; **open** not yet fixed.

### Player physics / frame loop
- Flying-start and JUMP IN hand-over gave the player the drop-point heading (up to 93 degrees off at
  Silverstone, wall within 0.5 s): `RealRace.seatOnRoad` re-seeds head/pose at hand-over. **M #1302**
- RECOVER (manual R or auto-rescue) left a TT/qualifying lap valid: now invalidates it (user decision). **M #1302**
- Incident-sim handback of an inverted human car re-entered `release()` (double demote, over-counted fallbacks). **M #1302**
- OVERTAKE allowance drained while braking; GRIP STEER `alphaPk` still used pi/2. **1289**

### AI and field
- Host AI read a remote human's pace as 0 (`_vmaxNow`/`paceF` written only in the per-car update that net-owned
  cars skip): `paceVmax` falls back to `vTop()`. **M #1302**
- AI corridor reads live state (order dependent), AI stuck timer under red flag, `startRaceBody` ignoring a
  failed `ensureRaceSession()`. **1289**

### Race flow
- `FlyingStart.lastState` stale after a quit mid-countdown (next TT/quali never arms). **M #1302**
- DAILY chosen before the race-session bundle lands is refused every lap ("settings changed"); audio-panel
  toggles written before the bundle are lost; cold-build "prep" phase shows a blank vignette. **hand / open**
- Weather plan duration read the stale `G.lapsTarget`; `quitToMenu` not cancelling an in-flight start. **1289**

### Career / persistence
- `team: null` slot throws in CAREER MODES; `goalKind` prototype keys throw; `daily.v1` import trusted after an
  `isObj`; LOAD SETTINGS/CAREER FILE had no size cap; the 32-livery import cap silently drops liveries
  (decision: raise it to the garage's real maximum). **hand**

### Net
- Guest BACK on the friend-qualifying sheet never tells the host (host hangs on "WAITING FOR THEIR LAP");
  `quitToMenu` does not cancel the lobby when `openQuali` prepare fails; VS FRIEND silent when `ensureNet`
  fails; QUALI/QLIVE relay unrate-limited; `controller.html` lacks the build meta. **hand**

### Input / UI / HUD
- `phoneFitStampSync` rewrote a root custom property every 10 Hz tick (style recalc before each fit read);
  `fitRows` never cleared inline caps. **1289**. Dock REPOSITION translate not divided by zoom. **hand**
- `update-check` blocked retries for 10 minutes after a failed version fetch. **M #1306**

### Renderers
- TLX AUTO `refuseTab()` reloaded into the same boot with no cap; `_mirFails` was a lifetime counter;
  `gfxContextLost()` built the 50-field `backendState()` every frame; GLX mirror/env begin not exception safe;
  mirror cadence replayed an old pack after a lite interval; WGX lamp-table cursor leaked (13.0k of 16384
  after five night builds); COPY DIAG always said NO DIAG for players. **M #1308**
- Frozen mirror frame replays matrices but not per-instance colours; paused SAVE SCREENSHOT never presents.
  Landed by a sibling in #1332 (verify on the tip).

### Lighting
- Lightning bleach is not restored when the strike gate closes mid-flash (`game.js` ~7260). **hand**

### Track engine
- Bay-less complexes (jeddah, jerez, mont_tremblant) painted the pit box 1.3 m past the wall; odd-n street
  barriers double-covered a node (vegas, singapore, baku); the garage live atlas died on a LAZY stub. **M #1305**

### Car / garage
- MY TEAM preview never invalidated the decal atlas; hi-res swap leaked ~7 MB per livery browsed; the 36-slot
  LRU counted a 26.7 MB hi-res atlas like a small one; a failed hi-res build retried every draw. **hand**

### Audio
- WATCH transport pause keeps engine/rival/SFX sounding at the stale rpm; trace-end rpm; engine rebuild
  without `ctx.state` recheck. **hand**. Rival pitch curve. **1289**

### Camera / FX / editor
- Hostile `#track=` link froze the tab (282-char code, 993 km loop, `TrackValidate.check` 10.6 s / 227 MB):
  loop-length bound. Deleting point 0 / start-crossing stamp shifted every elevation height. **M #1303**
- Name lost on undo; card image shows ~36 chars of the share link. **hand / open**

### Core / boot / data
- LAZY_RACE lighting presets fetched once with no retry; UPDATE READY silently refused every lazy load;
  failed hub tabs stuck across reopen; telemetry SESSION/GP change left stale lane fetches queued; desktop
  Chrome fetched the 42 KB XR bundle with no headset. **M #1306**
- Partial bundle load treated as complete on retry; `inject()` throw left the loader pending. **1289**
- `renderer-boot` guards `ApexXR` before the lazy bundle exists, so xrCaps and the VR rows never appear.
  **open (decision):** loading it earlier routes to GLX, which has no `attachXrSession`; the real fix is the
  XR plan resolving to TLX + `tlxForceGL` (`xr-plan.js`, `tests/specs/xr-plan.spec.js`).

### Tooling / CI / hooks
- `PAGE_SOURCES` listed 3 files (ADAPTED specs ran nowhere for log/spline/pit/line/physics/agent edits); a
  failed selected shard with no junit passed as infra-retry; a heredoc `bash <<EOF ... git commit` bypassed the
  commit guard; `timeout`/`xargs pkill` unblocked; curl allow-rules were unanchored prefixes; stale PR base-sha
  diffs; constant timeouts invisible; draft-run reuse ignored a moved base; import-models force pushes; ratchet
  `--base` compared only ceilings; ready-full-cap read 100 runs. **M #1312** (as `1171c1b9d`)
- Residual (open, user decision): userinfo curl form `127.0.0.1:80@evil.example`; `git -C . push ...` to the
  deploy branch and a bare `git push` not in the deny list.

### Merged scenery review
- Qatar pit keep-out and half the dressing in the old frame; Vegas `place()` strips culled; Hungaroring
  village across the infield and pit/stands 427 m from the line; Mexico volcanoes 17 degrees off and swapped;
  Madrid airport SSE instead of NE; stale baseline rows; `audit-circuit` failing at exactly its cap.
  **M #1307, #1310, #1311**
- Open: korea baseline (buried 3 / flatCoplanar 13 vs 1/12 before #1215); Hungaroring row missing from
  `tests/data/scenery-audit-baseline.json` (flatCoplanar 1 vs an implicit 0); T1/pit-exit stands still in the
  authored frame; `audit-circuit` treats a missing baseline row as no cap while `ground-audit --gate` reads 0.
- Lamp cap: hungaroring calls `lampPost` 127 times against `CUSTOM_LAMP_CAP` 96 (31 braking-zone lamps drawn
  unlit); the mast stride reads `LightTune.LT.lampDensity` in a Worker that has no LightTune; baked pack models
  never enter `track.props.list`. **open** (a follow-up PR was started).
