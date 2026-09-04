# Testing — operational field notes

> Carved out of [`../TESTING.md`](../TESTING.md) on 2026-09-03 (tree restructure
> Phase 5). These are DATED MEASUREMENTS of this container and of CI, not rules:
> the rule they support is in `AGENTS.md` §Verification or in `TESTING.md` §1.
> Cited from AGENTS.md and the skills as **TESTING field notes**.


The measured history behind the testing gates. AGENTS.md carries the rules;
this section carries the evidence so the rules survive re-litigation.

**Audit-then-fix of the pause / settings / results sheets — what a mini-dom
test could and could not settle (2026-09-02).** Six defects were CONFIRMED in
Node and fixed with `tests/unit/ui-sheets-audit.test.mjs` red-before /
green-after: RESULTS top-10 and the WORLD CHAMPION panel ranked by points alone
while STANDINGS used `SeasonCal.rank` countback (a points tie crowned the
field-order driver); STANDINGS titled a sprint weekend by the previous round and
called the race being driven "NEXT" from the pause menu; the in-race two-tap
reload confirm in `js/perf/quality-preset.js` (now `js/perf/renderer-picker.js`) never disarmed (stale "END THIS RACE
& RELOAD?" label, and the flag outlived the race so the next race's first tap
reloaded unasked) and wrote its question as `textContent` on the `<select>`,
which drops the options; MUSIC & SOUND said "Music off" beside a MUSIC switch
reading ON when the master SOUND gate was shut, captioned DEFAULT as
"Built-in", and described the disabled MY TRACKS button instead of the selected
source. Left as PLAUSIBLE — each needs a screenshot, in `ui` / `tiny` (neither
run here): the RESULTS sheet carries no gap or finish-time column at all (only
position / name / pts) — check whether a 3-lap race result reads as a
classification without one; DSQ has no model path, so nothing renders it;
constructors ties fall to first-to-score order (no team countback in
`SeasonCal`, so RESULTS, STANDINGS and career agree with each other); the
DISPLAY tab's injected order puts GRAPHICS below the renderer status paragraph —
at `data-shape="wide"` (two-column grid) check GRAPHICS is not orphaned beside
the paragraph; THREE PATH / SCREENSHOTS stay live under RENDERER: WEBGL2 where
they change nothing until the renderer does; the armed question on the RENDERER
`<select>` is an option label, so on a 393-wide portrait phone at 130% check it
is not clipped by the select's width; "GRAPHICS: ULTRA — FULLY APPLIES AFTER A
RELOAD" and "IN PROGRESS: ROUND 3 — …" are the longest new strings — check they
wrap rather than ellipsise in the wide grid's ~350px column; HIDE HUD from
SETTINGS resumes the race outright and RESTART RACE has no confirm (both
`js/game.js`, outside this pass); with the camera picker open, Escape should
close the picker without also pausing (the picker's handler stops propagation
after `TopModal`'s capture pass declines it).

**A probe that returns "no change" is guilty until proven innocent (2026-08-29).**
The report was that the editor's TEAM LOGO colour did nothing on the Audi tail.
Three offline probes ran before one of them was trustworthy. The first hashed
every 97th byte of the atlas region — fine for a full-region tint, useless for
Audi's mark, which is four thin ring STROKES, so it reported "no change" for a
region that changed. The second hashed every byte but tested against a livery
whose paint no candidate colour could clear, so all three test colours collapsed
to the SAME `inkOn(under)` fallback and it again reported "no change" — a true
statement about a rigged input. Only the third, on a field both marks could
clear, separated the real answer: the fin BADGE responds to `liv.logo`, the fin
GRAPHIC never does (that is the TAIL GRAPHIC row, `liv.finArt`), and the actual
defect was upstream of both — `markPalette` substituted a different colour for
the authored one whenever it fell under `MARK_FLOOR`, which for Audi's
`[0.96,0.02,0.22]` fin is nearly every mid-tone in the picker. Measured with
`tools/car/logo-authored-sweep.mjs`: 9015 of 12112 authored colours were overruled;
after the authored-halo path, the shark-fin badge keeps 91.2% (was 33.9%). The
engine cover stays lower (37.4%, was 17.2%) and that is geometry, not a bug —
`drawTailGraphic` washes it with an alpha gradient of `stripe||c2`, so the mark
is scored against c1 AND c2 at once, and for a near-black-plus-bright-red pair
NO colour clears 4.2 against both. Lesson: a negative result from a probe you
wrote is a claim about the probe until an independent positive control passes.

**`child exited on SIGTERM` is a WORKER line, not the run (2026-08-17).** A
`test:tiny` log showed `[playwright] child exited on SIGTERM` at 28/73 while
`test-bg.mjs --status` still said `running`. The log line won the argument and a
replacement run was started in tmux — so TWO `playwright test` processes then
shared four cores, load average reached 15.7 against the < 3 guidance, and both
were writing progress the whole time. `ps -o pid,ppid,lstart -p …` attributed
them in one command; killing the older tree left the queue clean. Two lessons,
both already rules that a plausible-looking log line talked me out of: only the
terminal `= run …` line ends a run, and `pgrep -fa 'playwright test'` BEFORE
starting anything is the check that makes duplication impossible. (Also: a
`test-bg` run launched from an ephemeral shell can lose its parent — start long
queues inside tmux, where the queue survives the shell that spawned it.)

**A total-red run is almost never the code (2026-08-17).** `test:tiny` reported
`73/73 failed` and the first line of the log said
`browserType.launch: Executable doesn't exist … chromium_headless_shell-1228`.
`npm install` had run with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` — which is the
right flag for the install step and leaves the browser absent. The specs launch
Playwright's headless SHELL, not any system Chrome a box may ship,
so nothing browser-driven can pass until
`npx playwright install chromium-headless-shell` runs (2.3 MB, seconds). Read the
FIRST failure's message before forming any hypothesis about a red run: when EVERY
test in a group fails, the cause is upstream of the code under test — a missing
browser, a missing `node_modules`, a dead dev server, a syntax error in a file
every page loads. Bisecting the diff for a fault the harness is reporting
verbatim is pure waste.

**Watcher anchoring.** Anchor on the reporter's terminal line
`= run (passed|failed|timedout|interrupted)` and NOTHING looser: the 30 s
heartbeat lines contain `N/M done, K failed`, so a pattern like
`[0-9]+ (passed|failed)` fires on the FIRST heartbeat — AGENTS.md recommended
exactly that for weeks and every watcher built from it misfired. Match every
terminal status, not just `passed`: a success-only watcher is silent through a
crash, and silence looks like "still running". Watch the LOG, never the
process table — a watcher whose command line contains its own grep pattern
matches itself (`pgrep -cf "python3 -m http.server"` returned 1 on a box with
no server; that 1 was the grep). Never `| tail` a live background run — tail
buffers to EOF and the file stays empty. Adding `|Error:` to the UNTIL pattern
gives early warning on the first stack trace, but re-arm for the terminal line.

**Long queues (2026-08-07 measurements, seven groups, container-killed at
80 min).** (1) `Monitor` caps at 30 minutes and `persistent: true` DOES NOT
lift it — tried twice, both lapsed silently; pair every Monitor with a
`Bash run_in_background` waiter on the queue's own completion marker. (2) Seed
the seen-file when arming a de-duplicating watcher, or the first event is the
entire backlog. (3) Make the driver resumable via terminal-marker files the
driver writes AFTER a run returns — a fixed-list driver re-ran 86 minutes of
banked groups after a restart. A group that started and died has no marker and
correctly re-runs whole: a killed Playwright run banks nothing.
(2026-08-13 addendum: name the driver's group list anything but `GROUPS` —
that is a readonly bash builtin array and the assignment fails silently.)

**One process, one browser group.** Local runs set `reuseExistingServer`, so
a second Playwright process attaches to the first's HTTP server; killing
either strands the survivor's specs with `net::ERR_CONNECTION_REFUSED`
(measured: 33 false failures in a row reading like product bugs). Pairing two
BROWSER groups in one batch runs 2 processes x 2 workers on 4 cores —
measured on 2026-08-13 as the source of every over-budget timeout in a
five-batch run (projection at 144-176 s vs a 120 s budget, props-over-road at
1518 s vs its own comment predicting exactly this). Browser+node pairs are
fine. To cover more at once, hand every spec to ONE process and raise
`APEX_WORKERS`.

**Orphans vs a second run.** Orphans from a killed run keep eating the box
invisibly (`node tools/ci/test-bg.mjs --stop`, then `pkill -9 -f
'tools/run-playwright'; pkill -9 -f pw-browsers`). But before concluding
"orphans", check `ps -eo pid,etimes,args` for a LIVE `playwright test` — a
second run you forgot is indistinguishable from orphans by process count.
One specific orphan bites the NEXT run: a superseded/killed batch can strand
its `python3 -m http.server 3456`, and the following direct `npx playwright
test` then dies instantly with "Process from config.webServer was not able to
start. Exit code: 1" (measured 2026-08-17). `pgrep -af http.server`, kill it,
re-run — that error is the port, not the code.

**A waiter is not a work slot.** Starting a browser run and then sitting in a
blocking wait wastes the whole run's wall time (measured 2026-08-17: 17 idle
minutes on one `--wait`). Start the run in the BACKGROUND and spend the run
doing what it permits: docs edits, test/tools edits, log analysis, commit
prep, subagent audits — everything except `js/`/`css/` edits and the
`?v=N`/`version.json` bump, which stay queued until the terminal line. Check
the log for `= run (passed|failed|timedout|interrupted)` when you come back;
never re-enter a foreground wait just to "keep an eye on it".

**`waitForFunction` on a rendering page.** Playwright polls the predicate on
`requestAnimationFrame`; a SwiftShader page running the game loop starves the
poll so the declared timeout never fires. MEASURED: `{ timeout: 3000 }`
against a never-true predicate ran 109,665 ms on a parked Monza — 36x its
bound — and overran on a menu page too. Only a THROWING predicate terminates
promptly (11 ms). Pass `{ polling: 100, timeout: N }` on any rendering page.
And once polling is fixed, a wait that still overruns means the CONDITION is
unreachable, not that the page is slow — `tlx-probes`' M6 skid took four
wrong mechanisms before anyone checked whether `skidVerts` could move
(`skids.stamp()` runs in `render()`; the stint drove through `act()`, which
never presents a frame). The habit that settled it: reach for an instrument
(a wrapper logging call counts) instead of a fifth theory.

**Subagent worktrees.** Worktree isolation bases new worktrees on the
default-branch ref, and this repo's `origin/main` is a stale unrelated
lineage (measured 2026-08-13: eight fix agents landed on a pre-restructure
tree with an 8,409-line game.js). Every worktree brief starts with
`git checkout -B <branch> <session SHA>` plus a fingerprint check of a
session-known file.

**WebGPU IS validatable in-container — stop shipping "read-verified" WGSL
(2026-08-17).** For months every `js/render/webgpu/` change carried a "WGSL is
not compilable in this container" disclaimer and shipped on read-review alone.
That belief was FALSE, and it shipped a phone-visible defect: a
`derivative_uniformity` violation (derivatives called behind `roadMarkings`'s
`hw > 0.5` early return — the road surface itself) that enforcing Dawn builds
reject (WGX silently fell back to GLX) and warning-mode phone builds executed
as undefined values — the entire road + shoulders rendered NaN-white while
grass, walls and cars looked fine. Two more spec violations sat alongside it:
MSAA count 2 (WebGPU permits only 1 and 4 — invalid on EVERY device) and
rg11b10ufloat render targets without the `rg11b10ufloat-renderable` feature.
All three were one-line Dawn errors the moment the code ran on a real device.
`node tools/gfx/wgx-validate.mjs` (~5 s) is that device: the FULL Playwright
Chromium (the headless shell has no `navigator.gpu`) with `--headless=new
--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader
--use-webgpu-adapter=swiftshader` exposes a real Dawn adapter that parses
every WGSL module and validates every pipeline. The ceiling, corrected
2026-08-17: Dawn here EXECUTES shader work — `node tools/gfx/wgx-capture.mjs`
returns real rendered pixels (offscreen mode; see
`docs/research/WEBGPU-PARITY.md` §1a for the four bugs the first capture
found). **Software compositor (2026-08-17, cache 1342+):** WGX soft-presents
the final pass into a `COPY_SRC` texture and 2D-blits onto visible `#game` —
play with this in SETTINGS ▸ SCREENSHOTS (AUTO / 2D BLIT / NATIVE) and the
three.js counterpart SETTINGS ▸ THREE PATH (AUTO / WEBGL2 / WEBGPU).
`node tools/gfx/gfx-probe.mjs --backend webgpu` is the primary visible-canvas
gate; native swapchain screenshots stay black. `GLX.capturePixels()` readback
(`wgx-capture.mjs` → `frame.png`) is a secondary oracle and can still flake on
SwiftShader when concurrent with display readback. Still environmental: the
first `getCurrentTexture()` call breaks `mapAsync` device-wide (why WGX never
touches the swapchain on software adapters), software adapters force MSAA 1,
and the full desktop stack can LOSE the device seconds in. Validation evidence
here is exact; visible-canvas evidence exists in-container via soft-present;
PERFORMANCE truth still needs a real GPU.

**TLX M4/M5/M9 on SwiftShader is fill-bound after the compile-storm fix
(2026-08-17).** The 595-program TSL storm is gone (17 links / 6.1 s Monza
load). The remaining group timeouts were GPU fill: M4 left the loop
presenting, Playwright tore the page down, and M5's first frame sat behind a
387% GPU process. `setTimeOfDay("night")` / a second `race()` on a live TLX
page does not return (530 s+ hung `evaluate`, measured four times). Product
cuts: software-GL shadow maps 512/256/256, clear-only 64px env faces, one
cube face per frozen frame. Test cuts: M5 is day-sky only (night `uStars`
lives on M6), M4/M5/M9 `waitForFunction` with `{ polling: 100 }`, and
`stopRendering` at the end of M4 so the next spec is not starved. Solo
verdict after those cuts, M4 still presenting: M4 10.0 s, M5 313.1 s,
M9 278.9 s. After M4 calls `stopRendering`: M4 10.1 s, M5 **63.5 s**,
M9 261.4 s, `= run passed (3/3)` in 336.4 s. M9 stays near the
`test.slow()` 360 s budget because the env-probe wait is fill-bound on
SwiftShader even with a quiet GPU; do not widen assertion tolerances.

**Software pixels + Lavapipe on Cursor Cloud (2026-08-17).** Native WebGPU
swapchain present stays black on SwiftShader/Lavapipe; WGX soft-presents to
visible `#game` via a 2D blit (auto on software adapters +
`sessionStorage apex26.wgxCapture=1`). Primary probe:
`node tools/gfx/gfx-probe.mjs --backend webgpu|three` (checks `#game` after
`awaitSoftPresent`). Readback oracle: `node tools/gfx/wgx-capture.mjs`. Lavapipe
needs `mesa-vulkan-drivers` (`lvp_icd.json`); stock Cloud images lacked
`/usr/share/vulkan/icd.d/` until that package was installed and the env
snapshot Saved. TLX CI stays on WebGL2 (`--backend three` / `tlxForceGL`);
THREE PATH: WEBGPU 2D-blits the LDR target (`readRenderTargetPixelsAsync`).
`mappedAtCreation` uploads are shimmed to `queue.writeBuffer` so SwiftShader
does not exhaust Dawn's mappable pool. SETTINGS ▸ WEBGPU / THREE.JS stay on
those backends (phones and Safari included — lite stack, 8-bit swapchain);
they must not silently bind GLX. THREE PATH AUTO may land on three
WebGL2 (`--tlx-auto-gl` / `apex26.tlxAutoGL`) after WebGPU dies in this
tab — still TLX, not game WEBGL2. THREE PATH: WEBGL2 remains the CI pin.
`--backend three --tlx-webgpu --lavapipe` waits on `GLX.awaitSoftPresent`.

**TLX WebGPU `configure` null was a self-poison (2026-08-18).**
`detectSoftwareGL()` called `#game.getContext("webgl2")` after
`renderer.init()`. three r185.1 does not claim the canvas in `init()` —
`getContext("webgpu")+configure()` is lazy on first present(). MDN: one
context type per canvas for life. Fix: sniff GL only when `forceWebGL`;
the WebGPU path uses `_softAdapter`. Instanced prop colour is a geometry
`InstancedBufferAttribute` named `color` (not `imesh.instanceColor`).
The 2D overlay must be opaque and force blit alpha to 255 — the SSR
car-paint tag (0.35) in HDR alpha is not compositor opacity.
Index: `AGENTS.md` §Seeing the game / §Cursor Cloud;
`CI-RENDERING-PERFORMANCE.md` §Measured.

**TLX software-GL washout was fog-as-clear + a broken TSL sky (2026-08-18).**
Dusk `fogColor` is beige `~[0.68,0.64,0.54]`. `begin()` used that as
`scene.background`; when the TSL `backgroundNode` missed the whole frame
was that beige. When the node *did* compile against the HDR target on
SwiftShader, `screenUV`/`invViewProj` reconstruction collapsed the dome
to horizon beige (`~[0.76,0.68,0.52]`) — kill-fog did not help because
density was never the path. World frames now clear to `skyZenith`, and
software GL arms `tsl-sky.js`'s zenith-only `fallbackNode` (M5
`skyState().on` stays true). Real GPUs keep the full SKY_FS node. Same
box, GLX was never this washed: it draws the sky as a real fullscreen
mesh. Real-GPU TLX (user device) already looked correct; this is not a
color-management change.

**Cloud-agent `npm install` "Exit handler never called!" (2026-08-17).**
`bld-20260817-e70b375f` failed `INSTALL` after `npm install --ignore-scripts`
spent ~70 s hitting `https://registry.npmjs.org` with `ECONNRESET` (audit
endpoint included), then npm 10.9.7 crashed instead of exiting on the fetch
errors. The leftover debug log still had "http cache … cache hit" followed by
"tarball no local data … Extracting by manifest" — metadata in `~/.npm` but
no tarball bytes, so every package re-fetched in parallel. The same VM's
`npm ping` still ECONNRESETs; `archive.ubuntu.com` Release files 404 through
Envoy, so `apt-get update` cannot repair a snapshot that is missing
`mesa-vulkan-drivers`. Cure: dashboard install → `tools/env/cloud-agent-install.sh`
(skip npm only when `node_modules/<pkg>/package.json` exists — hollow
directories from a crashed reify are not usable — `--no-audit
--prefer-offline`, retries; do not fail the build on apt 404 when
packages are already present).
Allowlist `registry.npmjs.org`, `archive.ubuntu.com`, `security.ubuntu.com`,
and `cdn.playwright.dev` if a cold snapshot must actually download.

**Deploy-union review, zero regressions in ~340 union-run tests
(2026-08-27).** Deploy-union review at bd9c875 / shell 1582. Five rounds from
two lineages (perf/WGX branch; adaptive-ui-devices incl. the dialog
migration) cross-merged through builds 1557–1582; this entry is the union's
first browser-level verification (CI's change-aware selection never runs on
deploy pushes — deploy tips are gated by smoke + characterization + guards
+ conditional sweeps only). Static review, three subagents: merge topology
CLEAN (only index.html/version.json ever hand-resolved; 166/166 `?v=` hashes
recompute at tip; line-survival regrep of every cross-lineage commit lost 0
lines; use `git diff-tree --cc`, never `--stat`, for merge resolutions —
first-parent diffstat reads as phantom resolutions); semantic audit CLEAN
(hub.js dialog × data-fix union, sw.js dual rewrite, game.js A+B edits, all
four WGX rounds present exactly once with no raw litPass state calls; unit
suite 1366/0). Stale LOCAL deploy-branch ref (223f4cb, 44 builds behind)
fast-forwarded to origin — anything reading the local name had been seeing
an ancient tree. Live probe on the union: GLX default boot + race clean
(console: only the three known-benign warns), WGX boot + race clean with
every round's counters holding (setPipeline 41/frame, submit 1.3/frame,
createBindGroup 0). Browser batches on the union, serial, one Playwright:

- ui: `= run failed` (115/115, 3 failed) → all three triaged: ui-redesign +
  ui-resize green solo (machine); rotation-recovery failed the 2-worker
  solo file run too but passes at `--workers=1` on BOTH the union and the
  pre-union baseline 4fc1167 (worktree A/B), and the live probe repro
  (touch-emulated portrait) shows the blocker up with `#rotate-controls`
  focused and no open top-layer dialogs — 2-worker contention flake of
  the documented rAF-starvation family, NOT a union regression.
- api: `= run failed` (140/140, 8 failed) → obs-act-edge pair green solo
  (machine). headless-api's 5–6 reds REPRODUCE solo — but the pre-union
  baseline worktree fails the same file the same way (5/24, same ~15 s
  wait-timeout signature, wandering test subset): PRE-EXISTING
  budget-vs-box (10 s waits vs ~21 s SwiftShader boot), not a union
  regression. Candidate for a waits fix in the ce68d3f pattern, its own
  change.
- physics: `= run failed` (20/20, 2 failed) → projection spec 3/3 green
  solo (machine). Characterization green — the re-blessed baseline holds
  on the union.
- collision: 45/46 → the one red (offtrack "stopped on-track throttle")
  failed solo with the exact headless-api signature (8 s boot-wait
  timeout at grid state, zero assertion failures) but PASSES at
  `--workers=1`: contention family, not a union regression.
- season + season-format: 18/18 green.
- webgl: `= run failed` (32/32, 4 failed) at loadavg 6.5–8 during the run —
  all four long-duration timeout-family (lighting-ab night fog 191.8 s;
  lighting-tuner-grade COPY ALL 337.3 s; webgl-probes monaco tunnel bake
  57.0 s; webgl-probes night ≤48 lights 74.9 s). Solo verdicts:
  webgl-probes whole-file at `--workers=1` passed 6/6 (incl. both former
  reds at 62/66 s vs their 57/75 s red durations); lighting-ab night-fog
  1/1 solo (98.3 s vs 191.8 s red); lighting-tuner-grade solo 2/2 (COPY
  ALL 148.6 s vs 337.3 s red). All four cleared — machine contention.
- tlx: the deploy branch moved DURING the review (bd9c875..d5180be, shell
  1582→1594: TLX hardening + car-parts/audio + the standing-reds fix
  train incl. the rAF-starved-waits fix this review kept rediscovering as
  contention). HEAD was an ancestor ⇒ pure fast-forward, and tlx — never
  union-run and now carrying fresh vendored-three patches — ran on the NEW
  tip d5180be instead of the stale one, after tooling-fast on the same tip
  (112/112 green, 139.5 s): `= run failed` (16/16, 5 failed) at 2 workers —
  all five in tlx-probes.spec.js, 84–124 s durations, first error a bare
  60 s `page.waitForFunction` timeout. Whole-file solo at `--workers=1`:
  `= run passed` (16/16, 0 failed) — the entire red set was 2-worker
  contention on the heavier hardened TLX boots, not a regression.

Operational: the container restarted THREE times mid-review, each time
killing the background test chain (`test-bg --wait` chains die with the
box; `artifacts/` logs and the scratchpad survive). Lesson: on this host
run each browser group as its OWN background task so a restart costs at
most one group, and re-read surviving logs for `= run` lines before
re-running anything. Two watchers ALSO re-proved the self-match trap above
in new clothes: a `while pgrep -f 'playwright test'` wait-loop matches its
own command line and never exits, and a compound kill-then-relaunch whose
pkill pattern appears later in the same command line kills its own shell
(exit 144) — check (`pgrep -af 'playwright[ ]test'`) and launch in SEPARATE
shell invocations, and anchor waits on the LOG's terminal line, never the
process table. NOT RUN this review (named per AGENTS): foundation, sweeps
(no track delta since last green), behaviour, debris, steering, camera,
audio, parts, net (untouched in range), scenery, gallery, baseline,
shimmer, map, paths, hooks, agent, circuit, fast, headless, ab, render.
shared-road-vbuf (unblocked by the wgx-vid-repro measurement) deliberately
deferred to its own round — a review reviews a fixed tree.

**A CSS specificity defeat is invisible to every string match (2026-08-29).** A
player reported that BRAKE lit up under the thumb and GAS did not. Both
`:active` rules existed and had for as long as the file has, so every grep and
every unit assertion for "the pressed rule is present" was green — and the
pressed colour was still unreachable. `body.steer-buttons #btn-throttle` is
(1,1,1) and `#btn-throttle:active` is (1,1,0), so two byte-identical
restatements of the idle fill in the buttons-mode blocks beat the pressed rule
in EVERY state. It shipped because BRAKE carried no such restatement: exactly
one of a symmetric pair was broken, in one steering mode.

The only instrument that sees this is a REAL POINTER on a REAL BROWSER —
`page.mouse.down()` over the box, then `getComputedStyle`. `:active` cannot be
forced from page script and cannot be matched from a file. A fixture built from
the shell's own `<link>` order (`tools/manifest.cjs` CSS) plus the shell's own
dock markup is enough; it needs no game boot, so it costs ~10 s rather than a
browser group. Run it against `git show HEAD:css/overlays.css` first — an
assertion never seen to fail is not an assertion, and this one reproduced the
reported symptom exactly, GAS red and BRAKE green.

One trap inside the instrument, which cost it a false red of its own:
`button { transition: background 0.14s }` (css/tokens.css) means the computed
background the instant the pointer lands is the START of the animation, so a
working pressed colour reads identical to a missing one. Settle ~300 ms before
reading. `opacity` carries no transition and jumped immediately, which is what
gave the contradiction away — the same rule had applied one of its two
declarations and apparently not the other.

The durable guard is in `tests/unit/ui-journey-race.test.mjs`: no `body.<class>
#btn-throttle` / `#btn-brake` rule may declare a `background` at all. That is a
narrower claim than "the pressed state works", and it is the one a file can
actually hold.

**Measure the fallback before you call it broken (2026-08-29).** COPY VALUES in
the LIGHTING TUNER reached `execCommand("copy")` only from inside the clipboard
promise's REJECTION handler. That reads like a guaranteed failure — the copy
command needs user activation and a rejection handler runs a microtask after the
click — and it was written up as one. A clipboard READ-BACK said otherwise:
with `navigator.clipboard.writeText` stubbed to reject, the shipped handler
still put all 182,631 characters on the clipboard in Chromium, which keeps
transient activation for about five seconds. WebKit is documented to require the
copy during gesture processing rather than merely soon after, so the iPhone
story may well hold — but it is UNVERIFIED here and was labelled as such in the
code: this container's proxy blocks `cdn.playwright.dev`, so
`npx playwright install webkit` 403s and nobody can run it. The fix (attempt the
synchronous copy first) is right either way; the CLAIM had to be corrected.

The measurable half was the payload: 182,631 characters, against 146 for the
same tune once the export carried only the player's overrides.

**A saturated main thread looks exactly like a missing element.** Driving the
tuner in that probe, `page.locator("#lt-copy").click()` timed out with
`waiting for locator('#lt-copy')` while `page.evaluate` in the same page
answered instantly and reported the element present, visible and 145x46. Nothing
was wrong with the DOM: the game's rAF loop on llvmpipe was starving
Playwright's actionability poll. `__apex.headless(true)` before touching the
panel fixed it outright. Reach for that before believing a locator that cannot
find what `getElementById` can.

Measured a third time 2026-09-01, on a lazily-injected bundle rather than a
click: VS FRIEND pulling js/net took **39.7 s** with the menu flyby rendering
and **0.1 s** with `#game` hidden — same page, same 11 files, **150 ms of
actual fetch** in both. A wall-clock number taken from a rendering page is
measuring llvmpipe, so decompose it (resource timings) or take a
not-rendering control before believing it says anything about the code.

Seen again 2026-08-30 with a live race running: `page.click("#rotate-race")`
timed out after resolving the locator and logging "element is visible, enabled
and stable", while `elementFromPoint` at the same coordinates returned that
button. `el.click()` inside `page.evaluate` drives the real handler and is the
right probe when the page must keep rendering.

**`context.setOffline(true)` is NOT offline against `127.0.0.1`.** Chromium's
network emulation exempts loopback, so a page under `setOffline` still reaches
the local test server. Measured 2026-09-01 while proving the service-worker
precache fix (`scratch/offline-check.cjs`): with `setOffline(true)` in force, a
`fetch()` **from inside the page** for a URL no cache can hold returned
`reachable (404)`. Asking `context.request` — a separate APIRequestContext that
need not honour page-level emulation at all — gives the same wrong answer for a
second reason, so a probe placed there is not even measuring the right process.

The cost of not noticing is a green run that proves nothing: the first cut of
the offline test passed **with the precache deliberately deleted**, because the
"offline" browser simply re-fetched the missing scenery from the still-live
server. The cure is to make the origin actually stop existing —
`srv.closeAllConnections()` then `srv.close()` — with `setOffline(true)` kept on
as well, because the service worker's navigate handler branches on
`navigator.onLine` and a returning player really is flagged offline. Under that
shape the same probe reads `blocked: Failed to fetch`, and only then does the
number after it mean anything.

Two more traps in the same test, both of which produced a false PASS first:

- **Race a circuit the session has never touched.** The SW's fetch-miss handler
  caches whatever the online phase requested, so reusing one circuit for the
  online reference and the offline subject tests the runtime cache, not the
  precache. The test now warms on `spa` and goes cold on `cota`.
- **`sw.js` does not `clients.claim()`**, so the page that registers the worker
  is not controlled by it. One reload — what a returning player does anyway —
  is required before any cache assertion means anything.

**The phone audit that a css-rules read CAN settle, and the cells it cannot
(2026-09-02).** Audit-then-fix of the phone driving surface at 390x844 /
844x390 and HUD SIZE 100/150/200 %, done entirely as rules over the sheets
(`tests/helpers/css-rules.mjs`) and `Input` in a VM — no browser, so the
verdicts split into what the numbers prove and what needs a device.
CONFIRMED and fixed (`tests/unit/phone-touch-surface.test.mjs` pins each):
the portrait blocker's three pills were `min-height: var(--tap-min)` — the
24px WCAG floor, with `padding: 0 1rem` and inherited type, on a layer gated to
`(pointer: coarse)` phones — so RACE IN PORTRAIT / OPEN CONTROLS / EXIT RACE
painted 24px tall (now `--tap`, 52px on touch); the portrait buttons-mode
`.hud-bottom` anchor added `var(--sab)` raw inside its `zoom: var(--hud-z)`
subtree, the one anchor in the zoom list without the division; and
`Input.requestGyro()` latched `gyroDenied` on ANY rejection — including the
transient "no user gesture" kind — and never cleared it on a later grant, so
STEER read "(NO GYRO)" while tilt was driving. CONFIRMED-OK and now guarded:
every `:hover` in `css/` sits under `(hover: hover)`, every scroll container
declares `overscroll-behavior`, both dock tiers clear 44px (54/72 and 48/64,
24px painted floor below 100 %), and the tallest dock column — BOOST/OT/AERO at
3 x 54 + 2 x 5.3 = 172.7 authored — is 345px at 200 %, inside 390 - 31, so
`fitHud`'s `--hud-z-dock` cap ((390 - 30) / 172.7 = 2.08) never has to act on
a 390px phone: the "BRAKE at y=-216" measurement in `js/ui/hud.js` predates
the grouped dock and is covered. The double-tap trio (viewport
`maximum-scale=1` + `viewport-fit=cover`, `touch-action: manipulation` on `*`,
`#game` none, root `overscroll-behavior: none`, the inline touchend killer) is
present and pinned. PLAUSIBLE — arithmetic says so, a device has to show it;
the visual checks, each one screenshot:

1. iPhone 844x390 landscape (notch LEFT), STEER: TILT, GEARS: AUTO, HUD SIZE
   200 %: does the BRAKE pedal's top edge sit under `#minimap`? The dock cap
   budgets viewport height (3 x `FIT_AIR`), not the corner clusters — at 200 %
   the pedal column tops out at y ≈ 23px, the map spans y 8..~124. Expect
   overlap from ~160 %; 150 % is marginal (≈3px, notched only). Owner:
   `fitHud` in `js/ui/hud.js`.
2. Same phone, STEER: BUTTONS (pedals RIGHT), HUD SIZE 200 %: GAS/BRAKE column
   against `#pausebtn` (y 8..60, right edge). Expect contact from ~185 %.
3. 390x844 portrait, tap RACE IN PORTRAIT, HUD SIZE 100 %: are POS/LAP/TIME/
   BEST and the map painted at roughly HALF size? `fitHud`'s top-band cap uses
   the landscape geometry (map beside the POS row: 224 + 183 > 195 half-width),
   so `--hud-z-top` computes to ~0.5 on a 390px-wide screen at every setting.
4. iPhone + Bluetooth pad, STEER: TILT, start the race with the pad's A button:
   does the motion prompt appear, or does STEER silently flip to BUTTONS? The A
   press is a synthesised `.click()` with no user activation, so
   `requestPermission()` should reject. Then tap STEER back to TILT with a
   finger: the prompt must appear and the label must read "STEER: TILT" with
   no "(NO GYRO)" (the fix above).
5. Any iPhone, SETTINGS, tap the RENDERER `›` stepper twice within ~300 ms on
   the same spot: does it advance once or twice? The `index.html` double-tap
   killer calls `preventDefault()` on the second touchend, which also cancels
   its click. Out of this change's territory; a fix would exempt buttons.
6. Any phone, HUD SIZE 60 %, landscape: BOOST/OT/AERO paint 32px — the
   documented 24px floor, under Apple's 44. A design decision (2026-08 axis
   audit), recorded here so it is not re-found as a bug.
### Menu keyboard / gamepad / a11y audit (2026-09-02) — the PLAUSIBLE half

The audit behind `tests/unit/menu-a11y-audit.test.mjs` enumerated every screen
from `index.html` + `UiLayers.LAYER_IDS` and split its findings in two. The
CONFIRMED ones (demonstrable on `tests/helpers/mini-dom.mjs`) are fixed and
pinned in that file. The rest need a screenshot or a screen reader, and this is
the list, each with the exact check — the browser group for all of it is `ui`:

| # | screen / cell | what to look for |
|---|---|---|
| P1 | GARAGE, 844x390 @100% (compact stacked) | `#cs-tabs .cs-tab` is `min-height: 0; padding: 2px` there (`css/carsetup.css`). Measure `getBoundingClientRect().height` of a tab on a touch profile: the touch ladder promises ≥ 44px and this cell may pay ~26px |
| P2 | LIGHTING / CAMERA TUNER, touch viewport | `.lt-tab` is `min-height: var(--tap-min)` (24px) + 5px padding (`css/tuner.css`) — expect ~28px tabs; decide whether a tuner is a player surface |
| P3 | DATA HUB, `body[data-density="compact"]` and narrow | `.dh-tab` / `.dh-close` drop to `--tap-min` (24px) (`css/data.css`); measure the tab strip on 390x844 |
| P4 | SETTINGS (`#pmsettings`), both rail shapes | ArrowDown on the horizontal tab strip now leaves it for the first panel control (focus ring should land inside `#pm-panel-*`); on the single-column rail (`aria-orientation="vertical"`) Up/Down still cycle tabs and ArrowRight is the exit — with nothing to the right it falls to DOM order (the next tab, then the panel), so check the pad can still walk into the panel. Up/Down on the strip no longer page-scroll the sheet |
| P5 | GARAGE paired (1280x800) and stacked (844x390) | from the category rail, ArrowRight (paired) / ArrowDown (stacked) must reach the parts list and the rail's own handler must NOT snap focus back; Left/Right (stacked) still cycle categories with selection following focus |
| P6 | SELECT / GARAGE / CAREER opened by MOUSE or TOUCH | focus now lands on the selected control at open. Chrome's `:focus-visible` heuristic should paint NO ring after a pointer open; a ring after a click is the regression to look for. The landing must not scroll `#sel-tracks` (the ALL chip is at the top) |
| P7 | SELECT → BACK by Escape vs by pointer | Escape: the title door that opened the screen (`#mb-race`) shows a ring; pointer BACK: focus returns silently (no ring). Garage BACK returns SELECT with focus on `#sel-go` |
| P8 | CUSTOMIZE MY TEAM | `.cz-sep` separator labels are now `var(--dim)` (was white @0.4); confirm they still read as section labels, not body text |
| P9 | SELECT, pad only | Right from the CLASSICS chip lands on the search field; D-pad Down must now leave it for the first circuit row; Left/Right/Home/End stay in the field |
| P10 | any settings slider | Home/End now jump the slider to min/max (ARIA slider ends) instead of the pane's first/last control |
| P11 | title after a race, 844x390 @150% | `#menu-buttons` overflows; the `.sf-b` fade + thumb must appear (the title's own `hidden` flip now triggers ScrollFade's settle) |
| P12 | SELECT, first arrow press | lands on the ALL filter chip (`aria-pressed`) rather than the selected circuit row — a design choice worth a look with a pad in hand |
| P13 | SELECT / CAREER / GARAGE with a screen reader | entering announces "SELECT, region" (or GARAGE / CAREER); RESUME / RESTART / QUIT on the pause menu are NOT announced as toggles; LIGHTS OUT / FINAL LAP / FINISH are read from `#announce` (`role="status"`) without repeating |

### 2026-09-02 — a 54–107 s boot on this box is the box, not the tree
  A/B closed the question the same day: the 2026-09-01 20:23 tree (3fe7dc74,
  before the deploy merge and the process commit) loads in 48.6 s at 852x393 on
  this box against 59.1 s for a4a08011 and 54.2 s for HEAD — the same order for
  every tree, so no commit of the last day moved boot time; the box (and, that
  night, the ubuntu/windows runners: census run 21's 120 s waits, run 1881's
  boot-guard) simply boots the game in ~50 s on software GL at that size.

Symptom: desktop-viewport specs (audio-smoke, menu-keyboard's desktop describe,
ui-scale) hit the 120 s test timeout with the game booted but the main thread
"gone" for 30–75 s at a time; `__apex.logs()` showed build done at 4.8 s, then
lobby create 17.7 s, AgentView.create 49.8 s, SeasonCal.engage 124.9 s. The
same tests passed on the GitHub smoke shards (7–9 min per shard, normal).

Measured with a CDP sampling profile over the first 70 s of boot on the
working tree (`scratch/bootprofile.mjs`, 2 ms interval): 77.2 of 79.6 s is
`(program)` — native time outside JavaScript; the largest JS self time is
`drainGlErrors` at 333 ms. No slow or pending requests; DOMContentLoaded at
1.1 s and `load` at 107 s (1280×800) / 54 s (852×393). A/B against a worktree
at a4a08011 (before the UI round) at 852×393: 59 s. So the cost scales with
the viewport, is identical before and after the round, and lives in the
software GL path (the title flyby renders full-scale while the boot scripts
run — the race-gated PerfGov item in ARCHITECTURE-REVIEW §7). Read a desktop
timeout here as the box; verify desktop-viewport specs on a runner. Playwright
was bumped to Chromium 1228 by the deploy tip (be24dc66) while this container
has 1194: `playwright.config.js` pins the sandbox binary, a bare
`chromium.launch()` in a scratch script needs `executablePath`.

**The change-aware gate selected the two slowest boot specs for every source edit, and never carried a failure forward (2026-09-02).** Pages runs 1888 (twice) and push run 2229 went red on `boot-guard.spec.js` (PERMANENT 404: 120 s while Playwright set up the browser context) and `logging.spec.js` (the Monaco build) — both pass locally in 86 s, so the reds were runner starvation. They were selected because pick-tests' blanket rules (`/^(js|css)\//` → "any source edit: does the page still boot", `index.html` → "script tags + DOM shell") route every diff to the boot group, and inside a 10-test budget its cheapest-by-count specs are exactly those two, the slowest per test in the tree. That question is already answered by the FIXED smoke gate (four shards) on every push and deploy, so `select-specs` now drops the boot group when only the blanket rules named it (`dropBootFallback`, `bootCoveredBySmoke` in the JSON). Separately, the "Record failing specs" step never recorded anything: Playwright writes `<system-out>` BEFORE `<failure>`/`<error>` inside a testcase, so a "testcase immediately followed by failure" regex matched nothing, and the classname it would have captured (`specs/x.spec.js`) lacks the `tests/` prefix the selector filters on — `tools/ci/junit-failed.mjs` parses the block and normalises the path. Runner boots measured in these runs: a context that takes 120 s to create is the machine; do not widen the 45 s boot wait for it.

**tooling-fast is not the deploy gate's node half (2026-09-02).** Pages run
1889 went red on two `quali-persist` source pins that were green nowhere
locally, because `quali-persist` lives in `test:state-unit`, which the gate's
"Pure-node unit suites" step runs and `tooling-fast` does not (the same step
also runs `node-slow`, the VM twins, the net/audio/agent-contract groups).
`node tools/ci/deploy.mjs` now runs exactly that step's `npm run test:*` lines,
parsed from `ci.yml` so the two lists cannot drift; the edit loop stays
`tooling-fast`, and a pre-deploy run pays the extra ~4 minutes once.

**Re-measured 2026-09-03 for the `?v=dev` shell (Phase 0 Commit B).** `tiny`
went 72/73 with `smoke` › "page loads without WebGL error" at 150 s, and the
spec ALONE on a quiet box repeated it (150 s): that test's `page.goto("/")`
waits for `load` with no navigation timeout, so a >120 s load event reads as
the bare "Test timeout" with the page alive in `apex-logs`. Boot probe
(`load` event, 1280×720, one browser at a time, two rounds each) against a
worktree at the pre-Phase-0 tip vs the working tree: 71 s / 62 s before,
70 s / 21 s after — DOMContentLoaded ~3 s on both, the SW controlling on
both. Neither the generated shell, the dev tokens, nor sw.js's dev-host
network-first rule moved boot time; the deploy-side proof of the tokens is
`pages.yml`'s `--check --root _site`, and the boot group's verdict comes from
the runner shards (`ci.yml` `group: tiny`), not this box.

### 2026-09-02 — two instruments that lie on this container

**`etime`/`etimes` does not track wall clock here.** A probe polled across ten
minutes of tool calls reported `etimes 29`, and a second read seven seconds
later had advanced by over a minute. Every "it has been running too long, it
must be wedged" judgement made from the process table this session was
measuring nothing, and one of them killed a healthy run. **Poll the artifact for
content, not the process for age** — `[ -s artifacts/x.log ] && ! pgrep …` in a
long-bounded loop, and let the log's own terminal line be the verdict. The
companion trap is older and already documented: a `pgrep -f`/`pkill -f` pattern
matches the controlling shell's own command line, so use explicit PIDs.

**An `await requestAnimationFrame` inside `page.evaluate()` has no timeout of
its own.** A probe that awaited a double-rAF to measure frame liveness hung
indefinitely with no output and no error — `evaluate` waits for the promise,
and a throttled or stopped loop never resolves it. Playwright's test timeout is
the outer backstop; a scratch script has none. Measure liveness with a counter
read across two ordinary `waitForTimeout`s instead.

**A screenshot of the WebGPU canvas needs `GLX.awaitSoftPresent()` first**
(`tools/gfx/gfx-probe.mjs:301`). A raw CDP `Page.captureScreenshot` reads the
un-blitted canvas and produces a confident, wrong answer — it cost one fully
written-up "WGX mis-frames the garage" reproduction that had to be retracted
(PERF-FINDINGS.md §2t).

### 2026-09-02 — probing the DEPLOYED build, and what that probe could not show

Chromium in this container cannot reach `https://brycejmurrin.github.io/f1-game/`
— the agent proxy returns `net::ERR_TUNNEL_CONNECTION_FAILED`. The TinyFish
fetch tool reaches it because it fetches remotely; that is not egress this
browser has. The way to drive the SHIPPED code locally is a detached worktree at
the deployed sha served over `npx serve`:

```sh
git worktree add --detach <scratch>/livewt <deployed-sha>
(cd <scratch>/livewt && ln -s /home/user/f1-game/node_modules node_modules && npx serve -l 3499 .)
LIVE_URL=http://127.0.0.1:3499/ BACKEND=webgl2 node scratch/live-probe.mjs
```

All three backends boot, race and finish clean on the deployed tree — GLX, TLX
and WGX each `gpuErrors 0`, zero page errors, zero console errors across boot,
track build and 25 s of held throttle.

Two things that probe did NOT establish, recorded so a later session does not
read it as coverage it isn't:

- **The car barely moves, and that is the BOX.** 25 s of wall clock with
  `setInput({throttle:true})` held reached 1.9 m/s on GLX and 2.4 on TLX, with
  `s` unmoved to the metre. At this box's SwiftShader frame rate 25 s is a few
  dozen physics frames. It proves input reaches physics on the shipped build; it
  is not a driving test, and the speeds are not a measurement of anything. (WGX
  reached 14.5 m/s over the same wall clock, which is a statement about the
  soft-present path's cost here, not about the game.)
- **The garage leg was vacuous.** `garageCam().on` came back `false` on all three
  — there is no `__apex.openSetup()` and the DOM fallback selector matched
  nothing, so the probe sampled the default `dist: 8.5` from the menu. The garage
  screen on the deployed build is UNTESTED by this run. A probe that reports a
  plausible number from a screen it never opened is the §R14 vacuous-measurement
  class; it is recorded here rather than quietly dropped.
**A renderer probe measures nothing unless it is in the TIER that runs the code**
(2026-09-02). `apex26.forceMobileTier=1` and the GRAPHICS preset are two
different axes, and every round of the TLX mirror-sweep work set the first and
not the second. `forceMobileTier` forces `GLX.isMobile` — the renderer's own
downgrades — and `GfxQuality.init()` then defaults a mobile device to MEDIUM,
so it lands on `PerfGov.tier() === 2`. LOW is tier 4, and tier 4 is where
`js/game.js:2444` stops chunking road ribbons and the road becomes a plain
mesh. A defect that only touches plain geometry is invisible at tier 0 and
tier 2, and the software probe reports a confident 4.8 % road coverage with
zero GPU errors in every arm. Set BOTH:

```sh
node tools/gfx/gfx-probe.mjs --backend three --lite \
  --ls apex26.forceMobileTier=1 --ls 'apex26.gfxPreset="low"' montreal
```

The preset goes through `GameStore`, so it is a JSON string and the quotes are
part of the value. The full tier -> feature table is in
`PERF-FINDINGS.md` §2s "Putting a probe in the configuration that exposes
the code".

### 2026-09-03 — a soft-present capture is not a frame until a second one differs

Every three-WebGPU probe in this container (Dawn on Lavapipe, `gfx-probe
--backend three --tlx-webgpu --lavapipe`) reported PASS with a dark "dusk, no
cars, unlit road" frame that survived every route-patched source variant
byte for byte — because it was the FIRST frame the soft-present overlay ever
read back. `readRenderTargetPixelsAsync` on a lit frame at phone resolution
never settled on llvmpipe, `_softReadPending` stayed true, and the 2D overlay
kept that first (pre-lighting, pre-cars) frame while the game moved on
underneath. Measured: `awaitSoftPresent` never resolving again after a
camera move (120 s, three runs), timings `[19109 ms, 120007, 120013, 120004]`
at a 480×222 viewport, identical PNGs across `nomaps` / `nopos` patches.

What changed: TLX submits NO new frame while a soft-present read is in
flight (back-pressure: 18,172 presents were queued against one completed
read in 300 s — a copy queued behind that backlog can never land), abandons
a readback older than 20 s or three times the last completed read (`SOFT_READ_STALE_MS`, epoch-guarded — a 2 s floor was
tried first and abandoned EVERY llvmpipe read, which take tens of seconds),
counts rejected reads in `backendState().softRead`, and `gfx-probe` captures
twice around an `__apex.orbit` and FAILS when the two captures are identical
(`frame.stale`; `--no-stale-check` opts out and says so). Two capture rules
for anyone probing this path:

- **Two captures or it is not a frame.** A single soft-present capture on a
  slow adapter is evidence of the first readback, not the scene.
- **Route patches need `serviceWorkers: "block"`.** sw.js precaches the
  deferred backends, and a Playwright `page.route` never sees a fetch the
  service worker serves — the patched file simply does not load. Put a
  `console.log("[patch-live]")` in the patched source and assert it.

The steady-state lit frame on three-WebGPU is correct here (small viewport,
`artifacts/diag-small/canvas-0.png`: lit car, textured road), so the owner's
black-car report on an iPhone is WebKit-specific; the GOV panel and
`__apex.diag().env.backendState` now carry `api`, `gpuErrors` and the first
GPU/shader error so the next phone screenshot names it.

### 2026-09-03 — the census gate failed on its own script, and what the real GPU said

`gpu-census.yml` run `33757119814` came back FAILURE with every game check
green: the Verdict step is a `node -e '…'` inside a bash single-quoted string,
and a comment in it said "three's" — the apostrophe ended the string and node
was handed half a program (`SyntaxError: Unexpected end of input`). The gate
failed closed this time; the same slip inside a condition could drop a clause
and pass. `tests/unit/ci-coverage.test.mjs` now extracts every inline
`node -e` block from the three workflows exactly as bash would and compiles it
(`vm.Script`), and refuses any apostrophe in the body.

The run itself is the real-GPU baseline after the WebKit AUTO → three-WebGL2
change: all four legs `ok`, `gpuErrors 0` (table in
`CI-RENDERING-PERFORMANCE.md` §There IS a real GPU). One number
to carry: three-WebGL2 on ANGLE-Metal spent **16.2 s in a single first frame**
(program link + synchronous Metal compile of the TSL lit program). The frames
themselves are on Azure blob storage the container proxy denies — read them in
the Actions UI.

`tools/gfx/wgx-validate.mjs` (live run) now prepends
`diagnostic(error, derivative_uniformity);` to every module it compiles,
because that is WebKit's default severity and Dawn's is a console warning:
a WGSL module that only warns here refuses to build on an iPhone and WGX falls
back to GLX without a word. `--lax-uniformity` restores Dawn's default to
bisect a red run. The tree passed on the first run (montreal, 90 frames,
`gpuErrors 0`, `wgslParseErrors 0`).

### 2026-09-03 — `image-grade-visual` is threshold-marginal on a real GPU

`ci.yml` run 33762205584 (dispatch, `renderer_macos: true`, tip 905ad6c): the
Metal renderer job failed ONE spec — `image-grade-visual.spec.js › highlights
predominantly change bright pixels`, bright/dark delta ratio 1.86 against the
required 2.0 — and `blacks visibly change the deepest image detail` passed
only on retry (first attempt moved the deepest pixels the wrong way). The
single allowed re-run was green on the same commit, and the local GLX frame
on the same tree rendered normally, so this is a flake, not a regression.
Mechanism: the spec compares two full-page screenshots of a `park()`-frozen
race, but the render clock keeps advancing between captures (cloud drift,
sky), and on a 60 fps GPU the two captures are more frames apart than on
SwiftShader. `__apex.renderClock(t)` exists to pin that and the spec does not
call it — pin it before each capture pair when this spec is next touched.

### 2026-09-03 — the iPhone's three-WebGPU failure, measured on Dawn before and after

The phone's metrics `log` tab named it: every lit pipeline refused with
WebKit's "The combined byte size of all variables in the private address
space exceeds 8192 bytes". The fix was verified here without a phone by
dumping every WGSL module three generates (scratch `dump-wgsl.mjs`, Dawn on
Lavapipe, iPhone UA, `artifacts/wgsl-dump-iphone` → `artifacts/wgsl-dump-2`):

| | before | after |
|---|---|---|
| lit fragment size | 359 434 B | 99 204 B |
| module-scope `var<private>` in the lit fragment | 1,597 (~12.4 KB) | 1 (`output`, 16 B) |
| `vnoise` bodies in the lit fragment | inlined per call | 1 function, 106 calls |
| Dawn `gpuErrors` / pipelines | 0 / 24 | 0 / 24 |

Dawn compiles both, which is the point: this class of defect is invisible to
every Chromium run and only a WebKit device or a private-variable count on
the dump can see it. When a TSL change lands, re-dump and keep the module-scope
private sum well under 8,192 bytes; the `gfx-backend-canary` pins the patch
and the noise layouts. The phone is the confirmation step (THREE PATH:
WEBGPU, one lap, GOV `gfx` row `err 0`).

### 2026-09-03 — the TSL layout pass, measured on the same dumps

Second round of the WebKit work: `matBumpHeight` (lit) and the sky's
`hash3`/`hash2`/`vnoise`/`fbm` took `setLayout`, so each compiles once as a
real function instead of being inlined at every call. Dawn dump, iPhone UA,
`artifacts/wgsl-dump-2` → `artifacts/wgsl-dump-3`:

| module | before | after |
|---|---|---|
| lit fragment (instanced) | 99 204 B | 69 707 B |
| lit fragment (plain) | 99 064 B | 69 567 B |
| lit fragment (chunked) | 97 267 B | 67 770 B |
| sky fragment | 40 601 B | 16 780 B |
| all 33 modules | 473 731 B | 361 406 B |

`main`'s node-variable count fell with it (lit 452 → 354, sky 173 → 62).
Cumulative with `a6a1566`, the lit fragment is 359 434 B → 69 707 B. The
figure this aims at is the census's 16.2 s three-WebGL2 first frame on
ANGLE-Metal, which only `gpu-census.yml` can re-measure. `gpuErrors` 0 and
24 pipelines in both dumps.

### 2026-09-03 — the standing smoke boot red went green when the backends left

`test-bg tiny` on the WGX/TLX spike-out commit (`cc8d138`):
**`= run passed (73/73 done, 0 failed)`**.

That is the first fully green `tiny` on this box in the restructure. The
known-benign red every earlier run carried — `smoke.spec.js › Apex 26 — smoke ›
page loads without WebGL error`, whose `page.goto` waits for `load` with no
navigation timeout while this container boots in 54–154 s — did not reproduce.

The likely cause is the change itself: the spike-out took `js/render/webgpu/`,
`js/render/three/` and the 1.1 MB vendored three.js island out of the shipped
tree, and although those files were DEFERRED (no `<script>` tag, injected only
on an opt-in), the service worker seeded the three vendor bundles into its
OPTIONAL precache set and the shell carried their importmap. Fewer bytes to
fetch and parse before `load` fires is exactly the direction that moves a
boot sitting on the edge of a timeout.

Treat this as ONE observation, not a new baseline: it is a single run, the
box's load varies, and the underlying defect (a `load` wait with no navigation
timeout) is still there and will still bite on a slow run. The rule in
`AGENTS.md` §Verification stands — read the FIRST failure's message before
believing any red run. What this DOES retire is the assumption that a red
smoke boot is unavoidable here; if it comes back, it is worth timing rather
than waving through.

## The change-aware gate can be cancelled by a spec that never had a chance

**Pages #1967, run 33822785596, job 100868882762, 2026-09-04.** The run reported
`cancelled` with zero failing jobs, in `Selected specs (change-aware gate)`:

```
running 6/32 done, 6 failed
x FAIL 7/32 hud-layout.spec.js › notched-portrait › tilt / auto gears (134.3s)
   Test timeout of 120000ms exceeded.
```

The job's own header derives its 26-minute cap from a worst case of "10 tests x
120 s + ~4 min setup". It selected 32 tests and spent the whole cap failing the
first seven, then died at the cap — and `ci.yml`'s own header already records
that a cancelled job reads as "0 failures". Second time in one night that a
timeout wore a cancellation's clothes; the first was `guards`.

**The cause is not the budget model.** `select-specs.mjs` already has the right
guard — `EXCLUDED (declares Ns test budget > gate 120s)` — and 32 race-fixture
specs are excluded by it. It keys on `test.setTimeout`, and `hud-layout.spec.js`
declared nothing, so `fit()` read "undeclared" as "fits in 120 s". It boots a
full race (22 cars, a built circuit, the maps pass) for each of ~19 generated
cases; the page log puts that fixture at **76-80 s before the test body starts**.
It was never going to pass at 120 s. Fixed by declaring 300 s, the value its
peers on the same fixture already carry, and pinned in
`tests/unit/select-specs.test.mjs` as a RULE (above whatever the gate's cap is),
not as the number.

### …and WHY it looked affordable (added after the fix, from the CI log)

The fix works — Pages #1972's gate printed, on a healthy 7m29s job:

```
fits 10 tests; selected 0 across 0 specs
EXCLUDED (declares 300s timeout): tests/specs/hud-layout.spec.js (2 tests)
```

**"(2 tests)".** It runs 25 — 4 VIEWS x 3 steer modes x 2 gear modes, plus one
desktop case. `declaredTests` counts literal `test(...)` calls by AST, and 24
of those 25 come from one `test(...)` call inside two nested `for` loops.

So the budget priced this spec at 2 x 79.7 s ~= 160 s. The truth is ~25 x 130 s
~= 54 minutes. THAT is why an undeclared 120 s budget looked affordable: the
missing declaration was the trigger, but a 12x undercount is what made the
selector willing to take it. My first write-up above credited only the
declaration, and that was half the story.

The undercount is not unique to it. Seventeen specs of 114 generate tests in a
loop, so for all of them `declaredTests` returns a LOWER BOUND, not a count —
the same figure `tools/ci/select-budget.mjs` already cites from
`tools/ci/test-observed.mjs` ("17 across 16 specs"):

```
  44 of 44 looped  ui-audit.spec.js          3 of  3  menu-baseline.spec.js
   4 of  7 looped  hud-layout.spec.js        3 of 11  ui-scale.spec.js
   2 of  5 looped  autopilot.spec.js         2 of  8  elevation-tracks.spec.js
   2 of  5 looped  tracks-walls.spec.js      + 10 more with 1 each
```

Most are already excluded by a declared budget. The principled fix is that an
unknown count should be treated as unknown rather than as small — the same
shape as "an undeclared budget is unknown, not safe" — but that changes what
the gate selects, and it is not a change to make on a hunch at the end of a
long session. The damage is already bounded by `--max-failures=3`, which stops
any such spec in ~6 minutes instead of 26.

Two things this leaves open, both stated rather than guessed at:

- **48 race-fixture specs still declare <= 120 s** (`maxDeclaredTimeout`, against
  a `race(`/`loadTrack`/`goToRace` probe). Only ONE of them has been measured
  failing. Declaring budgets for the other 47 on a heuristic would be the
  unmeasured change this repo forbids, so they are named here and left alone.
  The honest read is that an UNDECLARED budget is unknown, not safe — and the
  gate currently treats the two as the same.
- **A cancelled job writes no junit**, so `junit-failed.mjs` logged "no failures
  to carry" and the failing-spec cache learned nothing from the run that most
  needed remembering. The gate's fail-fast memory is blind to exactly the
  failures that kill it.

> **These two are the same gate failing from opposite ends, on the same day.**
> Above: a spec with no declared budget was selected and blew the cap.
> Below: a diff that touched `ratchets.json` selected nothing at all. One
> says the selection can pick what it cannot afford; the other says it can
> decline to pick anything. Both leave the standing gates as the whole
> story, and neither is visible in a green check.

## The change-aware gate has a coverage inversion (measured 2026-09-04)

Measured on the 13-file audit push (`0f5daac..227070f`), which changed
`js/game.js`, `car3d.js`, `career*`, `gltf.js`, `onboard.js`, `vantage.js`,
`engine.js` and `tuner-panel.js`:

```
$ node tools/ci/select-specs.mjs --since 0f5daac
13 changed file(s) [infra] -> groups: test:car, test:circuits, test:driving,
                                      test:gfx, test:hooks, test:input, test:modes, test:ui
SELECTION NOT MEANINGFUL: this diff touches 1 tracked/infra path(s)
  (tests/data/ratchets.json) -- a change there can affect any spec, so nothing
  is selected and the GATES own this push.
budget fits 10 tests (retries 0, 120s/test, surviving 1 timeout); selected 0
```

and CI's "Selected specs (change-aware gate)" job accordingly skipped its
Install-browser and Run-the-selection steps. **This is by design and the design
is defensible** — the gates (4x Smoke, Driving model characterization, geometry
sweeps, the parts census, the node suites) did run and did pass. But two rules
compose into an inversion worth knowing about:

1. **Touching `tests/data/ratchets.json` zeroes the selection.** Reasonable in
   isolation. It is also the file that a large change is most likely to touch,
   because any file crossing its ceiling forces an edit there.
2. **The 120 s/10-test budget skips by size.** Every remaining spec printed
   `SKIPPED (over budget)` — `camera-hooks`, `world-physics`, `longitudinal`,
   `debris`, `drift`, `season`, `audit`, and 18 more.

So a diff touching one file gets a targeted spec selection; a diff touching
thirteen gets none. The breadth comes from the standing gates, not the
selection, and the two are sized independently — the gates do not widen when
the selection empties.

Not proposing a change: raising the budget makes every push slower, and the
`ratchets.json` rule exists because that file really can affect any spec. What
is worth having is the awareness that on a big push the targeted layer
contributes nothing, so the gates are the whole story — and it is the gates,
not the selection, that should be argued about when deciding what a deploy has
actually verified.


## 2026-09-04 — the third spec family billed at a rate it cannot pay

`tools/ci/select-specs.mjs` excludes a spec from the 120 s change-aware gate
when the spec DECLARES a budget bigger than the gate's — `EXCLUDED (declares
Ns test budget > gate 120s)`. The guard keys on `test.setTimeout` /
`describe.configure({timeout})` / `test.slow()`, so it can only see a cost the
spec states. A spec that is silent about a 240 s cost is billed at 120 s,
selected, and killed at exactly "Test timeout of 120000ms exceeded" with
nothing asserted wrong.

That has now happened three times in two days:

| when | spec(s) | measured | outcome |
|---|---|---|---|
| Pages #1967 | `hud-layout.spec.js` | 134.3 s killed / 149 s local | 6 of 7 tests red, burned the job cap, CANCELLED the deploy |
| Pages #1974 | `parts-factory-presets` | 240.1 s | 3-failure stop; the run's only red job |
| Pages #1974 | `multiplayer-scan-cancel` › CANCEL stops the camera | 238.2 s | same run |
| Pages #1974 | `multiplayer-scan` › the camera reads a code | 229.7 s | same run |

All four now declare 300 s — the value their peers on a race fixture already
carry — so the gate excludes them BY NAME and reports it. That is the fix for
these four, not for the class.

**CORRECTION, from the fuller #1977 log.** Three of the four are budget kills
("Test timeout of 120000ms exceeded", nothing asserted wrong). The fourth,
`multiplayer-scan › the camera reads a code and puts it where it belongs`, is
NOT — and the first read of the #1974 tail, which only showed the other two
failures in detail, said it was. It fails an ASSERTION:

    expect(locator('#vs-invite-in')).toHaveValue(…)  Expected: "APEX1.s.aB3…"  Received: ""
    179410ms [net] info: scan stop
    179431ms [net] warn: handshake accept fail corrupt_code

That assertion carries its own `{ timeout: 45000 }`, and `test.setTimeout` does
NOT extend an expect timeout — the two budgets are independent. The page log
shows why it expires: `scan start` lands at 57.8 s on a starved runner (the
decoder is 257 KB fetched on demand, on top of a SwiftShader boot and a fake-
webcam video stream), leaving the 45 s assertion window to cover a decode that
had not begun. The `corrupt_code` line arrives 20 ms after `scan stop`, i.e.
during teardown, so it is a CONSEQUENCE of the abandoned scan rather than
evidence that the QR path is broken.

So the 300 s declaration is still right for this spec — it costs far more than
the gate's 120 s and does not belong on it — but it does NOT make this test
pass, and must not be described as having fixed it. What that one needs is a
measurement of how long the scan actually takes to first decode on a loaded
runner, and then either a wait budget set from that number or a fixture that
does not pay the on-demand decoder fetch inside the assertion window. That is a
`js/net` decision with no measurement behind it yet, so it is recorded here
rather than guessed at.

**A blanket "declare your budget" guard was considered and rejected on a
measurement.** 65 of the 114 specs match a naive boot-heavy-fixture heuristic
(`racePage|sharedTest|BOOT_MS|__apex.race(`) while declaring nothing, and most
of them are legitimately cheap per test — `headless-api` runs 24 tests on ONE
shared boot. A guard flagging 65 files would be noise, and noise is how the
`multiplayer-session` "SKIPPED (over budget)" line sat unread for weeks.

The narrower mechanism, not yet built: the gate already knows the difference
between a test killed by ITS OWN declared budget and one killed by the gate's
generic cap. Only the second is a budgeting mistake, and it is self-identifying
at the moment it happens. Reporting it as a BUDGET failure that names its own
fix ("declare `test.setTimeout` so the gate can exclude this spec") would turn
a confusing red into an instruction, without guessing at 65 files up front.


## BOOT_MS is an IDLE-box number, and the gate is never idle

**Pages #1987, run 33881691888, 2026-09-04.** All three `rotation-recovery`
tests failed the change-aware gate on `waitForFunction: Timeout 45000ms
exceeded`, at 83.1 s / 74.4 s / 72.4 s. Nothing asserted was wrong. The page
log shows the fixture stalling:

```
 3634ms  [car] build mclaren
77029ms  [car] build mercedes     <- a 73-second gap
```

Three parallel workers each booting a full race on one shared runner.

`tests/helpers/fixtures.js` sets `BOOT_MS = 45000`, and its own comment is
careful about where that came from: **"MEASURED on an idle container (loadavg
0.00)"**, worst case 24.6 s. It is a good number for the box it was measured
on. The change-aware gate is not that box — it runs several race fixtures at
once, and the same boot takes 77 s there.

**88 specs import BOOT_MS**, so this is not a one-spec problem. It is also not
one to fix by guessing a bigger constant: the honest fix is the shape
`smoke.spec.js` already uses after Pages #1953/#1954 — derive the wait from
`test.info().timeout` with today's constant as the FLOOR, so nothing gets
looser locally and CI scales up. That is an 88-import change and wants its own
measurement on a LOADED runner, which this box cannot take reliably while it
is itself the loaded runner.

Recorded, not attempted. What IS done: `rotation-recovery.spec.js` declares
its own measured 300 s, so the gate excludes it instead of selecting it into a
120 s budget its boot alone cannot clear. That is the fifth spec through this
route (hud-layout, multiplayer-scan, multiplayer-scan-cancel,
parts-factory-presets, rotation-recovery); 43 candidates remain unmeasured.

**Sixth: `parts-ers.spec.js` (2026-09-04, Pages run 2002 / 33904063866).** The
backlog is not theoretical and it does not wait to be worked through — it fires
whenever a diff pulls a fresh spec into the selection. A `js/garage/` change
brought in `test:car`, the selector picked this file for the first time, and
three of its tests failed on a plain 120 s timeout having RUN for 195.1 s,
175.4 s and 150.9 s. Not an assertion: the state dump showed the game healthy
(real `phys`, twelve cars built) with the first car build logged at 186218 ms.
The whole cost is the first boot — `sharedTest` hands the same page to the rest,
which is why two of the four take 0.2 s. Same file on this box: 4/4 green,
slowest test 29.4 s. Runner, not code. Declared 300 s; the gate now names it
EXCLUDED instead of going red on it, and the deploy it was blocking can move.

That is the shape to expect from the remaining 42: a healthy spec, a
deterministic false red, and a blocked deploy — one per newly-touched area.

Note the containment held: `--max-failures=3` stopped the job at 3/7 in 12m18s
against a 26-minute cap, wrote its junit, and carried the failing spec forward.

**Seventh: `presets.spec.js` (2026-09-04, Pages run 2015 / 33921254382).** The
prediction written under the sixth entry — "a healthy spec, a false red, a
blocked deploy, one per newly-touched area" — came true within the day, and the
newly-touched area was `css/hud.css`. The metrics-panel width work pulled this
file into the selection for the first time and it took the deploy down with it:
`Selected specs` failed, so `current-tip`, `deploy` and `verify-live` were all
SKIPPED and the commit sat on the branch un-published.

Two details worth keeping, because both were misleading at first glance.

The failures were NOT slow tests hitting a cap. Both read `Test timeout of
120000ms exceeded WHILE SETTING UP "context"` — Playwright never got a browser
context, so the spec's own code never ran. The per-worker pattern says the same:
each worker passed exactly ONE test and failed the next during setup, whereupon
Playwright span up a fresh worker that again managed exactly one. That is worker
churn on a loaded runner, and no assertion was ever reached.

And the local run does NOT look like parts-ers. 4/4 green here, but the first
test costs 1.7 min (102 s) of boot against the 120 s default, with the other
three at 13.7 / 9.9 / 9.9 s. So this file was already sitting ~15 % under the cap
on an IDLE box before the runner added anything — where parts-ers had 29.4 s
local against 195 s on CI, a 6.6x stretch with room to spare locally. Two
different distances from the same cliff, the same landing.

Declared 300 s, so select-specs EXCLUDES it by name. Verified: the same diff now
selects `ui-redesign.spec.js` alone, which passed on the failing run.

**80 of 115 specs still declare no budget.** Every one is a deploy blocked at
the moment some future diff first reaches it, and the cost of finding out is
always a failed Pages run rather than a red local suite. The measurement is
cheap — one `npx playwright test <spec>` and read the slowest line — and the
declaration is one line. What is expensive is discovering them one deploy at a
time, which is now three for three.


## The `test:ui` group has NO blocking coverage on a push (2026-09-04)

The route above — a spec declares its measured budget, the change-aware gate
excludes it by name rather than selecting it into a budget it cannot clear — is
the right behaviour and the selector is loud about it. What was never checked is
where the excluded specs land afterwards. The answer, on a push, is nowhere.

Enumerated on the deploy tip against a `css/` + `js/ui/` + `js/garage/` diff
(`node tools/ci/select-specs.mjs --since <ref>`): groups `test:car, test:ui`,
then

```
EXCLUDED (declares 360s test budget > gate 120s): ui-scale.spec.js
EXCLUDED (declares 300s test budget > gate 120s): hud-layout.spec.js
EXCLUDED (declares 300s test budget > gate 120s): ui-resize.spec.js
EXCLUDED  … custom-team, parts-budget, parts-factory-presets,
            parts-mesh-cache, rotation-recovery
UNREACHABLE (declares N tests > the whole 10-test cap — this gate can NEVER
            run it): menu-survey 11, music-library 13, parts-setup-ids 14,
            parts-catalog 16, menu-keyboard 19, ui-button-touch 20,
            parts-physics 69
```

Every one of those is in `test:ui` or `test:car`. Neither group runs on a push:
ci.yml's only group step is

```yaml
- name: Boot group (nightly) / dispatched group
  if: … && (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch')
  … npm run "test:${GROUP:-tiny}"
```

— schedule or dispatch only, and defaulting to `tiny`, not `ui`. So the blocking
browser coverage of a push is `smoke.spec.js` (4 shards, boot only),
`physics-characterization.spec.js`, and whatever `Selected specs` can fit. For a
UI diff that is: nothing.

**This is not hypothetical.** `ui-scale.spec.js` was red on five landscape
garage cases (`#cs-tab-livery` clipped to 53x6 px, 0 % visible, unreachable at
every UI SIZE — see the 15-tabs-in-14-slots fix). It was red on 5502e403 before
this branch touched anything, it stayed red through several deploys, and no
blocking job ever ran it. Pages run 1998's `Selected specs` job reported
**success having skipped "Run the selection" outright** — the gate passed by not
looking.

Three ways out, none taken here because runner spend is the owner's call:

1. **A fixed job for `ui-scale.spec.js`**, the way `smoke` and
   `physics-characterization` already have one — `FIXED_GATE_SPECS` in
   select-specs.mjs exists for exactly "this spec has its own blocking job with
   its own timeout policy", and those two are its only members. One runner, and
   it is the highest-value UI spec there is: 6 screens x 5 scales x 2
   orientations. This is the recommendation.
2. A `ui` shard in the push matrix — four runners, full group, much more cost.
3. Shrinking the declared timeouts to fit the 120 s gate — rejected: 300-360 s is
   what those specs MEASURE on a loaded runner, and cutting them buys green by
   making them flaky, which is the failure mode this whole file exists to stop.

What must NOT happen is leaving it as it is on the assumption that "the gate is
green". It is green because it declined to look, and it said so in its own log.

## 2026-09-04 — the gate's timeout bounded the MEAN test, not the slowest

The fourth occurrence of the family above, and the one that showed the class is
wider than "a spec that is silent about its cost". Pages #2019 and #2020 both
failed `Selected specs` on the same three:

| spec | measured, IDLE box, one worker | gate was |
|---|---|---|
| `physics-fixes` › lap distance … through Monaco | **124.2 s** | 120 s |
| `albert-park-foundation` › fountains and safe water | **110.1 s** | 120 s |
| `abudhabi-foundation` › contracts hold at night | timed out setting up context | 120 s |

All three PASS locally. Monaco was over the gate outright, so it failed every
time the selector picked it; Albert Park sat at 92 % of budget, which any runner
contention closes. Neither declares a budget, so the exclusion guard could not
see them — and excluding them was not the right answer anyway, since they are
exactly the specs the gate exists to run.

**Where the 120 came from, and why it was wrong.** `select-budget.mjs` derives
the gate from a MEASURED 79.7 s/test. That is the right input for *how many
tests fit* and the wrong one for *the per-test timeout*, which has to clear the
SLOWEST spec that could be selected, not the average one. The mean was 79.7 s;
the slowest was 124.2 s. Nothing in the model made that gap visible.

**Two wrong turns worth not repeating.** The first read was "starved runner" —
the failures are all timeouts, one was `while setting up "context"` (Playwright
could not create a context, which no game code reaches), and Albert Park's page
log stops at 6090 ms while the test runs to 194 s. Every one of those points at
infrastructure, and the 124.2 s local pass on an idle box refutes all of them.
The second was that the loop was the cost: the Monaco test drives 4500 `step()`
calls, each also drawing a frame through SwiftShader, so `headless(true)` (which
short-circuits `render()` and touches no physics) looked like the fix. Measured:
124.2 → **120.4 s**. Four seconds. The render was never the cost — the sibling
test in the same file runs 100 steps and still takes 57.3 s, so ~55 s of each is
Monaco boot + track build, which no test-side change removes.

**The carry-forward cache turns one budget defect into a branch-wide red.**
`.selected-failed.txt` is keyed by branch and re-runs the last run's failures
FIRST. With `--max-failures=3`, three over-budget specs are hoisted to the front
of every subsequent push, fail again, stop the job before anything behind them
reports, and re-save themselves. #2020's own diff selected only `ui-redesign`;
the other three came entirely from the cache. A budget defect therefore reads as
a spreading regression on unrelated commits, which is how it cost three deploys
before anyone measured a spec.

**Fix: 120 → 180 s, and `timeout-minutes` 26 → 36** (`cap >= tests × timeout +
setup + margin` = 10 × 180 s + ~4 min). Shrinking the selection instead was
rejected on the model's own numbers: at 15 min surviving one failure, 180 s/
retries-0 fits **10 tests — the same 10 as at 120 s**. The selection capacity
does not move, because a PASSING test never reaches its timeout; only the
worst-case ceiling does, for a case that essentially never happens. Paying
coverage on every run to save minutes only the pathological run spends is the
wrong trade.

`select-specs.test.mjs` now pins the gate against the slowest MEASURED spec with
25 % margin, and asserts `ci.yml` actually runs the number the selector models —
only the workflow is the one the runner obeys.

**Raising it found a FIFTH copy of the number.** `ci-coverage.test.mjs` asserted
`--timeout=120000` as a literal and went red the moment `ci.yml` moved, so the
guard that exists to catch drift was itself the thing that drifted. It now
imports `SELECTED_GATE` and derives the value, as `select-specs.test.mjs` does.
Count the copies before changing a CI constant here: `ci.yml` (the run step and
the `timeout-minutes` derivation), `select-specs.mjs` (`SELECTED_GATE`, the
owner), `select-budget.mjs` (the variant table), and two test files. Only the
first is what the runner obeys; the rest have to be derived from the owner or
they are four chances to describe a job that does not exist.

## 2026-09-04 — Selected-specs 180s cap then caught audio-smoke
`pages.yml` Selected on `6fe9bee1` (`run 33930263150`) routed
`test:car` + `test:ui`. `audio-smoke` declares exactly 180s, so
`own > 180000` is false and Selected **includes** it. The persisted
SOUND OFF case then hit the ceiling at 192.1s (`Test timeout of
180000ms exceeded`) — hang is cold `page.reload` + settings +
`#soundbtn`, not an assertion. Earlier red Selected runs
(`33927358590`, `33926744372`, `33924077769`, `33923442435`)
**excluded** `audio-smoke` (gate was still 120s, or the 180s declare
was already over-cap) and died on Albert Park / physics-fixes /
Abu Dhabi via the carry-forward cache. Same route as hud-layout:
the spec now declares 300s so Selected EXCLUDES it; smoke
(`test:ui` shard) keeps running it. Do not raise
`SELECTED_GATE.perTestTimeoutSec`.
