> **ARCHIVED (2026-08).** Dated backlog record, kept verbatim as provenance.
> Statuses in this file were live when written and are NOT maintained — several
> findings were fixed, retracted, or re-measured in place, which is why the file
> reads as a changelog of its own corrections. One claim was wrong even for its
> day and stayed misleading: §1 "No CI runs any test" — `.github/workflows/ci.yml`
> exists and gates the Pages deploy (guards / sweeps / smoke). The standing
> assessment now lives in docs/ARCHITECTURE-REVIEW.md.

# Audit findings — August 2026

Findings from a repo-wide audit that are **not fixed** in the accompanying
cleanup branch. They were verified by reading the code (and, where noted, by
running it), but each needs its own reviewed change rather than being folded
into a cleanup pass.

The audit's *fixed* findings are in the branch's commit messages. This file is
the backlog.

---

## 0. The suite is not green — 12 pre-existing failures  *(mostly CLEARED — see 0a)*

Every one of these was verified to fail identically at the commit *before* the
Aug-2026 cleanup branch, so none is fallout from it. They are listed here so the
next person does not re-diagnose them. This is also the strongest argument for
finding 1: with no CI, a suite drifts red and nobody notices when.

**Kept as the record of what was found. Almost all of it has since been worked
through — see 0a for what each one actually turned out to be, and 0b for the
one live defect the pass uncovered.** The table below is the state *as
measured*, not the state now.

**Measured before the branch merged with the deploy branch (build 937 → 938).**
That merge brought fixes for two of them — `webgpu-lifecycle.test.mjs` (a missing
`setTimeout` in its VM sandbox) and `season.spec.js` (a stale helper) — so treat
the counts below as an upper bound and re-measure rather than trusting them.

| group | failing | symptom |
|---|---|---|
| `test:physics` | 5 / 105 | `physics-abudhabi-foundation` ×2 (`definition.hasElevations` true, expected false), `physics-bahrain-foundation` (expected model ids missing), `physics-interlagos-migration` ×2 |
| `test:behaviour` | 2 / 73 | `collisions` "two overlapping cars push apart" (gap 1.367, expected > 1.6); `world-physics` "AI stays on track after the racing-line flip" (minProg 7.9, expected > 70) |
| `test:agent` | 2 / 128 | `agent-view` "linear furniture is spans" (span kind `tieredBowl` missing from the allowed list); `agent-view` "agentHelp() describes the surface" |
| `test:tlx` | 2 / 15 | `M6 skid batch` and `M9 env probe` exceed the 120 s timeout — they need ~132 s and ~151 s on SwiftShader |
| `test:webgl` | 1 / 30 *under load only* | `lighting-tuner-grade` "new grading controls clamp…" is a ~106 s test against a 120 s cap; passes in isolation (105.8 s here, 110.8 s at baseline) |

The two TLX ones and the webgl one are budget problems, not logic problems —
either raise the per-test timeout for those specs or accept that they cannot run
alongside a full group on a 4-core box.

Also environmental rather than code: `net-qr.test.mjs` and
`lighting-campaign.test.mjs` fail without `npm install` (`jsqr` and `playwright`
are devDependencies, and the repo ships no `node_modules`).

## 0a. What the follow-up pass cleared, and what each turned out to be

Every entry in the table above was re-run against the merged tree and worked
through. **Not one was a live defect in the game** — each was a test that had
outlived the behaviour it was written against, and in three cases the test was
measuring something it never intended to. That is worth recording, because a
red suite that is "all stale tests" is exactly the state in which a real
regression hides.

| was failing | what it actually was |
|---|---|
| `physics-abudhabi-foundation` ×2 | the circuit gained elevation data; the spec still pinned `hasElevations === false`. Range measured at 9.24 m and pinned as a band. |
| `physics-bahrain-foundation` | the required-model list had grown 4 → 7. |
| `physics-interlagos-migration` ×2 | two reservoirs consolidated into one; the vertex budget had moved to 563,578 against a 350,000 cap. |
| `agent-view` "linear furniture is spans" | the span vocabulary grew to 8 kinds and the spec's list of 4 was never updated. Now guarded mechanically by `tests/span-kinds.test.mjs`. |
| `agent-view` "agentHelp()" | the manifest measured 5507 bytes against a 5500 ceiling — a bound seven bytes above the artefact. Trimmed one redundant entry; ceiling restated at 6 KB. |
| `collisions` "two overlapping cars push apart" | **measuring the wrong thing.** It sampled the lateral gap once at t = 2 s, by which point the pair is ~5 m apart along the road and each is simply driving its own line. The push is prompt and correct: 1.2 → 1.97 m within 0.25 s. Now measured over the window in which the cars are actually alongside. |
| `world-physics` "AI stays on track after the racing-line flip" | **measuring the wrong thing**, and the open question in its own comment is now answered. `minProg > 70` is not a progress measurement: the last of 22 cars *starts* at prog −182 on Monza, so the assertion demanded a back marker average 25 m/s from a standstill through the whole field. Measured per-car delta instead — every car covers 142–221 m in 10 s, nobody stuck. |
| `elevation-tracks` "monaco: slope gravity" | **measuring the wrong thing.** The flat-out reference run was taken *after* a 300-station scan, i.e. five seconds into the race, and on Monaco it dropped the player into the field and shoved it 66 m backwards — so `flatMax` came out at 20.3 m/s, a first-corner speed. The descent then "overspeeded" a reference that was never a top speed. Reference now taken before the scan, plus a guard that fails loudly if it is ever blocked again. 47/47 green. |
| `custom-team` ×2 | the garage became a STEP in the flow (`#select` START → garage → DONE goes *forward* to RACE SETTINGS), so the helper's route back to `#select` no longer existed; and the mesh-leak assertion counted created-vs-freed at the end, which always trails by the live mesh the save itself rebuilds. |
| `car-effects` "ERS indicator" | its "no deployment" case was *too fast to deploy*, which stopped existing when the deploy taper was floored (a BOOST that produced no thrust and cost no energy on every straight was the bug). Re-anchored on a flat battery. |
| `parts-livery-contrast` "every decal region sits on…" | the wing band's backing surface is the top rear plane, which ACTIVE AERO hoisted out of the baked body mesh so it can rotate — so a body-mesh probe cannot find it by construction. Replaced with a check against the flap's own rest geometry. |
| `test:tlx` ×2, `lighting-tuner-grade` | unchanged: budget problems, not logic problems. |

### 0b. One real defect found on the way — the wing sponsor band does not move with its wing

Not fixed here; it belongs to whoever owns the active-aero work.

`CarMesh.carDecalData` emits `REGIONS.wing` as a fixed quad in the baked decal
mesh, positioned from the aero recipe's `upperTrailY`. That put it exactly on
the rear wing's top plane — and that plane is now an ACTIVE AERO element,
handed out by `Car3D.aeroFlaps()` and drawn by `drawAeroFlaps()` with a live
rotation from `c.aeroX`. At rest the two agree (verified: the band sits wholly
inside the top plane's rest envelope, 0 m escape). In X-mode the flap rotates
toward flat and the band stays where it was, so a sponsor wordmark hangs in the
air beside the wing for the length of every activation zone.

Fixing it properly means the band has to ride its element: either a small
textured mesh drawn inside `drawAeroFlaps` with the same hinge transform, or
moving the band onto the mainplane, which does not rotate — but the mainplane
is painted `c1`, and `tests/parts-livery-contrast.spec.js` deliberately inks
that band for the `wing` slot, so that second option is a livery decision and
not a mechanical one.

## 1. No CI runs any test

`grep -rn "npm |playwright|node --test|npm ci" .github/workflows/` returns
nothing. There are two workflows:

- `pages.yml` — checkout → copy files → deploy. No Node, no install, no tests.
- `import-models.yml` — `workflow_dispatch` only, and `:87` swallows
  `tools/assets.mjs verify`'s exit code with `|| echo "::warning::…"`.

So **every Playwright spec and Node suite in the repo gates nothing** on push or PR. Every
guard in the repo is advisory, enforced only by whoever remembers to run it.

That matters most for the guards written *because* production diverged from
local:

- `tests/load-order.test.mjs` — the only thing that catches a missing or
  misordered `<script>`. No build step, so a missing tag is a missing global is
  a dead game.
- `tests/deploy-staging.test.mjs` — its own header recounts `vendor/` shipping
  broken to Pages for real. It runs in `test:tooling-fast`, which CI does not run.
- The `?v=N` / `version.json` equality check — a mismatch ships a permanently
  stale PWA shell.
- `node tools/verify-track.cjs --all` — catches a scenery throw that strands the
  game on the menu.

**Cheapest fix with the best coverage per second:** a `push` + `pull_request`
workflow running `npm ci && npm run test:tooling-fast` (~4 s, pure Node, no
browser) plus `node tools/verify-track.cjs --all` (~4 min). That alone covers
load order, deploy staging, the scenery API contract, docs integrity, and every
circuit's build.

## 2. Two specs have zero assertions

Verified: `expect(` appears **0 times** in both.

| spec | tests | `expect(` |
|---|---|---|
| `tests/ui-audit.spec.js` | 34 | 0 |
| `tests/ui-desktop.spec.js` | 5 | 0 |

Both only `goto → click → waitFor → page.screenshot(...)`. They pass unless a
locator times out. `ui-audit.spec.js:19` additionally swallows its data-hub wait
with `.catch(() => {})`, and neither uses the `pageErrors` fixture — so an
uncaught exception mid-walk is invisible.

`docs/TESTING.md` sells `ui-audit` as "portrait+landscape screenshots of all 10
screens" (accurate) but lists it as an audited fixture consumer (misleading), and
describes `ui-desktop` as covering "desktop-mode layout (`body.desktop`),
keyboard controls, non-touch UI" — it asserts none of those three. If
`body.desktop` stopped applying, all five tests still pass and silently capture
the wrong layout.

They are also both in `RENDER_SPECS`, so 39 assertion-free tests occupy the
capped 4-worker SwiftShader pool.

**Options:** relabel them in `docs/TESTING.md` as gallery emitters (honest, free),
or give them real assertions (`body.desktop` applied, no page errors, key
controls present).

## 3. ~~Skips that swallow the regression the test exists for~~ — PARTLY FIXED

**`tests/instanced-draw.spec.js` fixed on this branch:** both `skipped` escapes
are gone and a built Monza must now produce a non-zero batch count. The
remaining items in this section stand.

- **`tests/instanced-draw.spec.js:34,70`** — `if (!batches.length) return
  { skipped: … }` then `test.skip(!!r.skipped)`. If `TrackGraph.batches()`
  regresses to returning nothing — instancing completely broken — both tests
  **skip green**. The file header says its job is that "a real track's batches()
  payload survives the trip into GL buffers"; zero batches is the loudest form of
  that failing and is the one outcome routed to `skip`. Assert
  `batches.length > 0` instead; `track-graph.test.mjs` already proves Monza
  produces batches headlessly.
- **`npm run test:shimmer`** — `tests/material-shimmer.spec.js:89` is
  `test.skip(!process.env.APEX_SHIMMER, …)` at describe scope, and
  `package.json`'s `test:shimmer` does not set `APEX_SHIMMER`. The documented
  invocation runs zero tests and exits 0, while satisfying the coverage guard
  (which is name-matching only).
- **`tests/webgl-probes.spec.js:144`** — titled "UBO light count **matches**
  lightState", but never reads the UBO. `expect(ls.numLights)
  .toBeGreaterThanOrEqual(0)` on a count is always true; only the `<= 32` half is
  real.

## 4. `tools/extract-module.mjs` cannot run

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'espree'
```

`:18-19` imports `espree` and `eslint-scope`; neither is in `devDependencies`.
It is advertised as a working tool in two places (`CLAUDE.md`, `tools/README.md`).
Either add the deps or mark it unmaintained.

## 5. ~~`tools/ssr-probe.mjs` — two dead anchors~~ — FIXED

**Fixed on this branch.** The anchor set now carries the live `post.js` line
plus the two historical variants, and `mix` is listed in the usage text.

`:75-76` `ANCHOR_COVER` / `ANCHOR_COVER_ALT` match nothing in
`js/render/shaders/post.js` (the live line is `post.js:952`, `float cover =
carDom ? conf : 0.60;`), so `--debug=hitmiss` and `--debug=hitcol` both throw.
It fails loudly by design, which is why this is a broken tool rather than silent
rot. One-line fix. Its `mix` mode is implemented but missing from the usage text.

## 6. `tests/shared-track-foundation-characterization.test.cjs` is unrunnable-by-design

299 lines, 5 `node:test` tests, referenced by nothing — not `package.json`, not
any doc or workflow. And it cannot be caught: `tools/test-coverage-audit.mjs:36`
filters on `.spec.js || .test.mjs`, and this is `.test.cjs`. The guard reports
"all 129 covered" while a 5-test suite sits unrun beside it. Wire it up or delete
it; either way widen the audit's extension filter.

## 7. `CLAUDE.md` documents `test:tiny` as the wrong project

`CLAUDE.md` says "(~40 s, **headless project only**)". `package.json` runs it
`--project=render`. **The script is right and the doc is wrong** — both specs are
in `RENDER_SPECS`, so `--project=headless` would run zero tests and exit 0.
Anyone who "fixes" the script to match the doc turns the recommended first
command into a silent no-op.

## 8. The geometry ratchets can be reset instead of fixed

`prop-clipping` and `coplanar-faces` are well built — a growth gate plus a
no-slack test that fails when a cap sits above the measured value. But
`git show 0f847cc` ("regenerate the clip and coplanar ratchets") raised
hockenheim 9 → 136, catalunya 34 → 73, and gave estoril and indianapolis 96 each
from an implicit 0. Once regenerated both go green and the prior cap survives
only in git. There is no upper bound on a cap, no fleet total, no `--write` flag,
and no documented regeneration procedure — so regenerating is indistinguishable
from fixing at the test level. A `sum(BASELINE) <= N` assertion is the number a
wholesale regeneration cannot quietly move.

Related: `tools/coplanar-audit.cjs --gate` has no `out.length` guard, so it can
print "✓ all 0 circuit(s) within the baseline" and exit 0. Its argv filter
(`:283-284`) also drops any positional following any `--flag`, including boolean
ones — `coplanar-audit.cjs --horizontal monza` silently audits nothing.

## 9. Arrow keys drive the screen behind three open sheets

`js/game/menunav.js:31-33` hard-codes `LAYER_IDS` and is missing `audioset`,
`vsfriend` and `spotifypanel` — all of which open *without* hiding what is
underneath (`js/game.js:6489`, `js/net/lobby.js:775`). `activeLayer()` therefore
returns the underlying layer and `onKeyDown` `preventDefault()`s before moving
focus into it.

**Repro:** Pause → SETTINGS → MUSIC & SOUND → ArrowDown. Focus lands on a
SETTINGS button behind the sheet and the pane behind scrolls; every control in
MUSIC & SOUND is unreachable by arrow key, and Enter activates something the
player cannot see.

The same three ids are missing from `ScrollFade`'s `SCREENS` and (for
`spotifypanel`/`campicker`) from `AriaState`'s `ROOTS` — three modules each
keeping their own list, all three drifted. One shared list would fix the class.

## 10. `aria-modal="true"` on 15 dialogs, with no focus trap anywhere

`grep -rn "inert|trapFocus"` finds nothing. Several of those dialogs open over a
screen that stays in the DOM and un-`hidden` (`#teampicker` over `#carsetup`,
`#audioset` over `#pmsettings`, the three career sheets over `#career`,
`#track-detail` over `#select`, `#vsfriend` over `#overlay`). `aria-modal` hides
the outside from a screen reader but does not affect Tab, so the keyboard walks
into controls the AT refuses to announce. Nothing moves focus into the dialog on
open either.

## 11. `AriaState` misses every group that marks selection with `.on`

`ariastate.js:29` keys on `ON = ["active", "dh-active"]`. These use `on` instead
and are never synced: the LIGHTING TUNER's TIME and WEATHER chips
(`tuner.js:34-35`), the CAMERA TUNER's mode chips (`cam-tuner.js:101` — which are
`role="tab"` and never get `aria-selected` at all, unlike `tuner.js:85` which
does it correctly for `#lt-tabs`), the in-race `#campicker` (built into
`document.body`, outside every `ROOTS` selector), and `#spotifypanel`'s
shuffle/repeat toggles.

## 12. ~~`css/career.css` closes its cascade layer early~~ — FIXED

Found independently and fixed more thoroughly on the deploy branch before this
audit merged (`c9bf8d2`, `4fbe405`): the same defect was in **four** stylesheets,
not one — `menus.css` (200 lines outside its layer, and the true cause of the
phone-portrait preview card never applying), `career.css` (129), `overlays.css`
(the whole VS FRIEND lobby, 234) and `components.css` (9).

It is now guarded by `tests/css-layers.test.mjs`, which checks every stylesheet's
braces balance, that its layer closes on its last line of content, and that the
cascade order is declared only in `tokens.css`. Kept here only as the record that
the finding was real.

*(That suite arrived in no `test:*` group, so `npm run test:audit` was failing on
the deploy branch. Added to `test:tooling` and `test:tooling-fast` as part of the
merge.)*

## 13. `store.set` swallows quota failures and caches the value anyway

`js/game/store.js:24-29`: the `catch` is empty, and `this._cache.set(key, v)`
runs regardless. `store.get` is cache-first, so for the rest of the session
everything reports as saved. Callers cannot detect it — `js/game.js:7516` wraps
it in its own `try/catch`, which can never fire.

This composes with two unbounded writers:

- **`js/data/api.js:48-54`** — the hub caches every distinct URL under
  `apex26.api.<url>` with no TTL, no LRU, no size budget and no eviction on quota
  failure. The telemetry tab is a key generator (a URL per session × driver × lap
  window, storing the raw rows). Once quota is gone, **every** `store.set` fails
  silently — including `Career.save()`. The player finishes rounds, sees the
  balance update, reloads, and is back several rounds with no warning.
- **`js/game.js:1163-1164`** — the custom-livery list is uncapped, unlike
  `TT_BOARD_MAX = 10` and `Career.HISTORY_MAX`. Each entry carries up to 13
  colour arrays, × 11 teams. `buildLiveryOptions` rebuilds a row per livery on
  every `buildSetup()` (every tab, part and driver click), so the garage also
  gets visibly slow first.

## 14. Custom team/driver names reach `innerHTML` unescaped

`js/game.js:7217`'s `clean()` is trim + truncate, no escaping. Those fields land
in `Teams.LIST` and are interpolated into `innerHTML` at `js/net/lobby.js:347`
(`title="${full}"`) and `:372-373`. 22 chars is enough for
`" onfocus=alert(1) x="`. More seriously, `lobby.js:373` renders `_peerProfile` —
the **remote peer's** name, arriving over the data channel with no length limit.
Fix at the sink (`textContent`) or reject `<>&"'` in `clean()`.

Checked and clean: uploaded music filenames, custom livery names, and all career
driver/team names all go through `textContent`/`setAttribute`.

## 15. Data-hub lifetime and index bugs

- **`js/data/telemetry.js:445-463`** — `telGen` is bumped by
  `renderTelemetryBody` and `loadTelemetrySet`, but **not** by `DataHub.close()`
  or `showTab()`. Press LOAD LAP, close the hub, and when the multi-second fetch
  lands `openTelemPopup` appends a full-screen `aria-modal` dialog to
  `document.body` — over the menu or the race — and focuses it.
- **`js/data/telemetry.js:486 vs :534`** — `laneCols` is indexed by `tels`, but
  every consumer indexes it with a `view.laps` index, and `laps` is `tels`
  **filtered** for lanes that have car data. Any lane without telemetry (routine
  on OpenF1) shifts every colour from that index on. The same divergence makes
  the extra-lane loop start at the wrong index, so a selected lane can get no
  speed trace at all while its dot still moves on the map.
- **`js/data/export.js:24-111`** — the ~10-minute gather chain has no
  cancellation token; closing the hub or starting a race leaves it issuing
  requests. `canvasPng` never rejects, so a failure hangs the ZIP with the button
  stuck on "Zipping…".
- **`js/data/live.js:174,201,207`** — the gap-bar feature is dead: it gates on
  `p.timeDiff`, but `F1API.positions()` maps only `{num, pos}`. No bar ever
  renders.
- **`js/data/api.js:73-85`** — the `!res.ok` branch does `JSON.parse(txt)` then
  reads `j.detail`; a body of `null` or a bare number throws a `TypeError` whose
  message matches none of the catch's filters, so it is rethrown *instead of*
  `HTTP <status>`.

## 16. Career economy has no floor

`js/game/career.js:819` — `career.money += … - wages` is unfloored, and
`hireDriver`/`renewHire` never check affordability while `hireAsk` compounds up
to +45 % per renewal. A long MY TEAM save can go negative. Nothing crashes
(`research` blocks purchases above the balance), but there is no bankruptcy rule
despite a comment claiming it cannot happen.

Also `js/game/career.js:832-833` — `matePts` does not check `mate.retired`,
unlike the player's `player.retired ? 0` on `:796`. Latent today because
`endRace` sorts retirees last.

## 17. `openCareer()` can crash on a completed season

`js/game.js:6675/6702` set `trackIdx = Career.trackIndex()` unconditionally, and
`Tracks.seasonIndex` returns **-1** once the calendar is exhausted.
`scheduleFlybyTrack()` then calls `loadTrack(-1)` 120 ms later, where
`Tracks.LIST[-1]` is `undefined` and `def.night` throws — which `index.html`'s
error handler turns into a full-screen "JS error" overlay.

**Repro:** finish round 24 → results → NEXT → hub → BACK to title → press CAREER.
Compare `$("mb-season")` (`js/game.js:6656-6661`), which resets the season
*before* computing `trackIdx`; the career path has no equivalent guard.

## 18. Smaller items

- **`tests/agent-view.spec.js:154`** and **`tests/tracks-walls.spec.js:48-52`** —
  loop-only assertions with no non-empty guard; an empty collection passes.
  Contrast `agent-view.spec.js:1812`, which asserts length first.
- **`playwright.config.js:38-39`** claims "a coverage-audit npm script asserts
  every spec lands in exactly one project". No such assertion exists —
  `tools/test-coverage-audit.mjs` only checks `test:*` group membership by
  filename. The partition happens to be sound; the invariant is unenforced and
  the config says otherwise.
- **`tests/parts-liveries.spec.js:196,238`** take screenshots but are not in
  `RENDER_SPECS` — the only such spec on disk — so they run in the wide-worker
  headless project.
- **`js/game/scrollfade.js:124-129`** never `unobserve`s, and only observes the
  *first* generation of a pane's children. The leak is bounded to one generation
  per pane; the functional half is worse — a later generation that changes size
  without a DOM mutation (font swap, zoom) no longer repaints the fade.
- **`index.html:396`** — `#sel-tracks` is `role="listbox"` but
  `js/game/menus.js:197-202` interleaves plain `<div class="track-group-head">`
  headings between the `role="option"` buttons. `#sel-teams` gets this right.
- **`tools/README.md:10`** documents a `.vt-warn.cjs` helper under `tools/` that
  does not exist (there are no dotfiles there at all);
  `:42` is a 3-column row appended to a 2-column table and renders broken.
- ~~**`npm run test:graph-parity`** defaults `BASE=HEAD`, so on a committed tree it
  diffs HEAD against HEAD and always passes.~~ Since fixed: with no explicit
  `BASE` and a working tree clean under `js/track/` + `js/circuits/`, the tool
  now refuses to run instead of trivially passing. Still most useful as
  `BASE=<pre-migration-ref>`.
- **`tools/test-shards.sh:47`** appends `-- --workers=N` to every group, but nine
  `test:*` scripts are `node --test` or bare node.
- **`docs/TESTING.md`** lists `tooling` twice with different descriptions, and
  several group descriptions have drifted from their commands (`webgl`, `modes`,
  `audio`, `scenery`, `parts` all run more than the docs say; `sweeps` is
  described as two audits and runs three).
