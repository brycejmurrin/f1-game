# Tree restructuring — decision and plan of record (2026-09-03)

> Errata: none yet. Landed: Phase 0 Commit A `bcf17c8`, Commit B `f2d6f44`
> (the `?v=dev` policy, `bump-cache --apply` refusal, sw.js dev network-first
> rule, `cache-bump-only` deleted; unit-suite count 186), deploy merge
> `3685460` (deploy branch tip), Phase 1-lite (tests-split + physics-baseline-present
> deleted, mcp tests split fast/`test:mcp`, module-size → `tests/data/ratchets.json` +
> `tools/ratchets.mjs`; unit-suite count 185). Live checklist: §Status and remaining steps.

## Context

The owner asked for a fresh, deep read of the whole project with a view to a
MAJOR tree and file restructuring, explicitly re-opening the module ratchets /
limits and the current layout under a comprehensibility lens: is this the
easiest structure for a human or an agent to understand and change safely?
They also asked which tests/guards, tools and docs are still necessary and
which to combine, delete or split.

The 2026-08 panels (STRUCTURE-REDECISION, ARCHITECTURE-REDESIGN) upheld the
current layout on migration-risk grounds and adopted "Bedrock"; Phase 0 and
half of Phase 1 landed, Phase 2 (a generated manifest/shell) was authorized
and never executed. Both panels named that generator as THE precondition
for any js/ move. This plan executes the precondition first, then does the
moves the panels deferred, and cuts the guard/test/tool/doc surface to what
earns its keep.

Method (this session, plan mode, read-only): nine Fable deep-readers (whole
files read; ~500 numbered file:line claims) → eight Sonnet verifiers
re-checking every claim (≈85% confirmed; every conclusion-bearing number
below survived or is corrected) → one Fable design review of the draft.
History is a 199-commit squash (2026-09-01..03), so churn is not evidence.

Baseline (2026-09-03, branch `claude/project-structure-review-p6eu08`):

| area | files | lines | note |
|---|---|---|---|
| js/ (all) | 214 | 131,674 | 15,507 is baked `light-presets.js` |
| js/game.js | 1 | 9,273 | 43% comment-only lines; ceiling 9,274 |
| js/game/ | 59 | 45,696 | six module lifecycles in one dir |
| js/render/ | 26 | 25,883 | WGX 9,528 + TLX 7,864 deferred, opt-in only |
| js/track + js/circuits | 20 + 80 | 9,592 + 24,970 | per-circuit data in 7 homes |
| js/car / data / net | 8 / 8 / 11 | 6,569 / 3,738 / 5,651 | mostly clean domains |
| index.html | 1 | 1,905 | 138 script tags; in 77 of 199 commits |
| css/ | 11 | 9,988 | |
| tests/unit | 188 | 45,577 | 140 in `test:tooling-fast`; 1,848 source-text pins |
| tests/specs | 115 | 32,739 | 55 need a browser; 25 VM-portable; 11 fully twinned |
| tools/ | 160 | ~39,400 | flat; ~27 with no functional caller |
| docs/ | 137 | 39,575 | 28 top-level; research 22; archive 16.5k |
| .claude/skills | 31 skills / 75 files | 6,454 | |
| npm scripts | 54 (43 `test*`) | | 12 topical browser groups + node groups |

## Diagnosis (verified)

1. **Every file costs five to seven edits.** New eager js file = file +
   `<script>` tag at the right index + `FULL` entry in `tools/manifest.cjs`
   + `HARD_EDGES` pair if eval-time + `bump-cache --apply` (rewrites 151
   committed `?v=` hashes) + often a pick-tests rule + periodically a
   `NODE_CEILING` bump in `css-class-ratchet.test.mjs` (it counts `<script>`
   tags as shell nodes). A lazy file edits a game.js mirror array and a
   sw.js optional-set line instead; both are guard-asserted
   (`load-order.test.mjs:192-210, 248-355`), so omission is caught, but the
   rosters live in three hand copies. `manifest.cjs:4-9` says index.html
   "cannot be generated"; `bump-cache.mjs:129-135` already rewrites its
   tags in place. index.html is in 77 of 199 commits, almost all hash bumps.
2. **`js/game/` holds six lifecycles in one directory**: 22 `create(G)`
   modules, 4 `init(gfx)`, 11 self-initialising DOM helpers, plain data,
   one `create(store, cb)`, one `create(_G)` that ignores G. Confusable
   clusters (cameras/cam-modes/cam-tune/cam-tuner; lighting/light-store/
   light-presets/tuner; perf/loop-health/gfx-quality/gfx-debug) and files
   that bundle unrelated screens (photomode.js owns the lighting tuner's
   buttons; gfx-quality.js is ~55% renderer picker; cockpit-opts.js has a
   second IIFE building the METRICS panel).
3. **`js/game.js` is 43% prose and `G` is a mirror, not a seam.** 218
   members: 112 have one consumer, 63 are consumed only by the dev API. Ten
   one-line passthroughs and ~19 deferred arrows exist because the literal
   sits mid-file. `render()` (1,726 lines) touches ~35 closure lets not on
   G; `updateCar()` (1,286) is fenced by
   `physics-characterization-vm`. The module-size ceiling was raised ~111×
   and lowered 4× while game.js grew 7,970 → 9,274; the test is ~1,280
   comment lines for 64 of code and appears in 88 of 199 commits.
4. **Per-circuit data lives in seven homes** (def, scenery file,
   `geo-paths.js`, `markings.js`, four id-keyed tables in
   `scenery-data.js`, `docs/tracks/<id>.md`); `_sceneryShift` is consumed
   at 9 sites and explained only in `space.js:53-90`; `segs` is dead in all
   24 defs that carry it; 10 of 111 frozen scenery(api) members are used by
   no circuit and 6 by one; the 16 foundation specs are hand-authored files
   sharing only their import line, and their entire hook set is
   VM-computable (two VM foundation tests already exist).
5. **The test tree encodes kind in headers, not names.** 188 flat unit
   files: 30 structural guards, 8 ratchets with 5 different slack rules, 15
   meta-tests of the test infrastructure, 5 MCP-wrapper tests (two for
   unattached wrappers), 16 source-text-pin files, 70 behavioural, 13 VM
   twins. Browser specs: 11 are twinned test-for-test by VM tests yet still
   run (3,118 lines); 37 declare timeouts above the 120 s selected gate as
   `select-specs.mjs` counts them, so never gate a deploy; 39 use raw
   `@playwright/test` and lose the `__apex` failure attachments. Group
   membership is a 140-entry list plus 54 npm scripts; one new test forces
   three doc edits.
6. **Docs and tools accrete and are policed for consistency, not size.**
   28 top-level docs + 22 research + 16.5k archive lines; single facts in
   3–12 places (`snapCam()` rule: 12 files / 51 lines); AGENTS.md ~28% war
   story; 7 doc guards (1,955 lines) hold ~40 numbers and ~60 phrases.
   tools/ is 160 flat files with three harness generations, forwarders to
   forwarders, 8 `@skill` tags naming skills that no longer exist, ~27
   files with no functional caller. 31 skills; 22 route to siblings by name.

## Where this stands (2026-09-03, end of the Phase 2b move)

Sessions so far have landed 38 commits on `claude/project-structure-review-p6eu08`,
of which Phase 0, Phase 1-lite and Phase 2a are DEPLOYED (deploy branch tip
`bfde168`) and Phase 2b's move is pushed but not yet deployed.

**What the tree looks like now vs. the diagnosis this plan opened with:**

| the diagnosis said | today |
|---|---|
| a new eager file costs 5-7 coordinated edits | file + ONE manifest line (`gen-shell` writes the rest) |
| index.html in 77 of 199 commits, almost all hash bumps | tags read `?v=dev`; the deploy stamps hashes; the shell changes only when markup does |
| `js/game/` holds six module lifecycles in one directory | `js/game/` no longer exists — 16 domain directories |
| per-circuit data lives in seven homes | the def is the single home (`js/circuits/<id>.js`) |
| eight ratchets with five different slack rules | one mechanism: `tests/data/ratchets.json` + `tools/ratchets.mjs` |
| pick-tests routes by a filename list, one `|` per file | directory rules; blanket-only routing 33 -> 1 |

**The four sweep blind spots** found while moving are worth recording because
they are the reason the move was safe rather than lucky. Each was a class of
path reference the exact-token sweep could not see, each would have silently
broken files, and each is now fixed IN THE TOOL with a regression test:
a `/`-prefixed relative suffix (`"../../js/log.js"`); the sweep eating its own
move plans and the MOVED block's historical keys; a path written as an escaped
regex; and a path built from separate quoted segments, which is now REPORTED
at plan time rather than guessed at. The last one paid for itself immediately:
it named all six of batch 4's hazards before that batch ran.

## Status and remaining steps (2026-09-03)

Order of landing: **0 → 1-lite → 2 (splits, then the move window) → 1 → 3
→ 4 → 5**. Each step ends green on `test:tooling-fast`, is one commit or
one PR on the session branch, and is deployed by `node tools/deploy.mjs`
(merge the deploy tip → local gate → fast-forward push; no PRs) at the
windows marked ⚑. Browser evidence is capped at two groups per step and
the boot group's verdict comes from the `ci.yml` runner shards, not this
box (`docs/TESTING.md` §Field notes 2026-09-03).

- [x] **Phase 0 / Commit A** `bcf17c8` — `tools/gen-shell.mjs`, marked blocks
      in index.html / carview / sw.js, generated `js/roster.js`, game.js reads
      `ApexRoster` (9,274 → 9,202), load-order's seven mirror tests → one drift
      test.
- [x] **Phase 0 / Commit B** `f2d6f44` — tags read `?v=dev`; `bump-cache
      --apply` refuses off the staged copy; sw.js dev-host network-first;
      `cache-bump-only` deleted; guards + 27-file prose sweep. Runner CI green
      (smoke shards included).
- [x] **Phase 0 deploy merge** `3685460` — deploy tip 0ea825d merged (index.html
      → ours + gen-shell; game.js ceiling re-measured 9,307 → 9,235 on the
      union), pushed by `deploy.mjs` (10 gate suites verified). DEPLOY-SIDE
      PROOF: `pages.yml` run 1938 — every CI job green incl. the four smoke
      shards, "Stamp the shell generation" (`bump-cache --apply --at N --root
      _site` + `--check --root _site`) green, "Live version.json equals the
      stamped build" green. The `?v=dev` policy ships.
- [x] **Phase 1-lite** (landed 2026-09-03; no js/css change, tooling-fast 136/136 + `test:mcp` 31/31):
  1. delete `tests-split.test.mjs` + `tools/tests-split.mjs` (+ README regen,
     docs-integrity comment, TESTING row, carves.md, APEX-TOOLS-MCP);
  2. delete `physics-baseline-present.test.mjs` after confirming the VM twin
     `readFileSync`s the baseline (fails, never skips, on absence);
  3. tinyfish-mcp / probe-mcp: keep the tools (live callers — see the phase
     section), move the stays-tools assertions into `tests/unit/mcp-cli.test.mjs`
     on the fast gate, move the proxy/serve assertions to a `test:mcp` node
     group off `tooling-fast`;
  4. `tests/data/ratchets.json` + `tools/ratchets.mjs` (`--check` / `--update`
     / `--json`) + `tests/unit/ratchets.test.mjs` replace `module-size.test.mjs`;
     metrics `lines` (all old CEILINGS files), `codeLines` (game.js, apex.js),
     `gMembers` + `topLets` (game.js); one slack rule max(60, 4 %); history →
     `docs/notes/CEILING-HISTORY.md`; 20-file reference sweep incl. AGENTS.md,
     deploy.mjs + check-changes `deploy.md` merge rule, the guard pins.
- [~] **Phase 2a — splits** merged on the session branch 2026-09-03 from four
      parallel worktree branches: lighting `e345cdd` (lighting.js → knobs /
      track-lights / frame-lights behind a 16-line façade; the lt-* handlers
      → tuner), quali-store `8349abf` (quali model + quali-sheet; six modules'
      localStorage → GameStore's raw lane; store.js precedes js/game in FULL),
      options `9beb902` (renderer-picker out of gfx-quality; cockpit-opts'
      second IIFE + metrics-panel-style → metrics; tables.js → its owners,
      deleted), circuits `26877e9` (geo-paths, markings and FIVE id-keyed
      scenery tables folded into each def; `segs` deleted from 24 defs;
      `realPoints` throws on a path-less def; verts byte-identical,
      graph-parity 40/40 exact). Union verified: tooling-fast 137/137, game-vm 248/248, verify-track --all
      40 OK, state-unit 89/89; `test-bg tiny` 72/73 (the one red is the boot
      `load`-wait timeout, 147.8 s, the box — §Field notes 2026-09-03); runner
      push run 2346 on 66b6618 green incl. the four fixed smoke shards. The
      `ci.yml group: circuits` dispatch (run 2347) was CANCELLED externally
      at 42 min (GitHub Actions concurrency contention across sessions, not
      a code failure — several other runs cancelled the same window); not
      re-dispatched, since the plain push-run smoke gate on the identical
      commit already covered the boot group.
      **DEPLOYED** `bfde168` (deploy tip merge — one real conflict:
      `tests/unit/module-size.test.mjs` deleted on our side vs modified on
      theirs; resolved by taking our deletion and running
      `node tools/ratchets.mjs --update` on the union, which moved only
      `wgx.js` 6037→6060 and `tlx.js` 3132→3144, both from their WebKit fix).
      `node tools/deploy.mjs`: 12 gate suites + verify-track on all 40
      circuits, pushed in 1 attempt, 496 s. `pages.yml` run 1941 stamping.
      `tools/moves/phase2.json` maps 91 files for 2b.
- [x] **Phase 2b — the move window** DONE 2026-09-03, four batch commits
      (`c78847b` core/physics/race/career 17, `ac2df8c` lighting/camera/audio/
      perf/input 26, `5bd4fa6` ui/garage/agent/fx/data/car 24 — **js/game/ is
      gone**, `f1ee501` render/{shared,glx} + track/{core,scenery} 24). 91
      files into 16 domain directories; `tools/moves/phase2.json` + the four
      batch maps are the record. Verified per batch and at the end:
      tooling-fast 138/138, game-vm 248/248, verify-track --all 40 OK,
      gen-shell --check, check-gctx and ratchets clean; `test-bg tiny` and
      `ci.yml group: circuits` for the browser half.
      FOUR sweep blind spots surfaced and were fixed IN THE TOOL, each with a
      regression test, so the next move does not re-find them:
      (1) tokenRe's leading boundary excluded `/`, missing every path written
      as the suffix of a longer relative path (`"../../js/log.js"`);
      (2) the sweep walked `tools/moves/` and `manifest.cjs`'s MOVED block,
      corrupting the move plans and the historical keys deploy.mjs reads —
      both now excluded, MOVED protected by byte range;
      (3) a path written as an escaped REGEX (sw.js's optional-precache stamp
      filter) has no token to match — one instance, fixed by hand;
      (4) a path built from separate quoted segments
      (`path.join(ROOT, "js", "track", "geom.js")`) likewise — now REPORTED
      by `splitSegmentMentions()` at plan time, which named all six of batch
      4's before that batch ran.
      Also: move-tree's own test fixture used real repo paths, so a batch
      rewrote it — it now uses names no move map can contain (`js/zzfix/…`).
      pick-tests RULES are DIRECTORY rules now (the plan's item, possible
      once js/game/ emptied); blanket-only routing 33 -> 1, and the guard
      behind it became a COUNT ratchet in ratchets.json instead of a frozen
      16-path array that would have needed a hand edit per move.
      STILL TO DO in this phase: the WGX/TLX spike-out (map + checklist are
      committed and validated, `tools/moves/spike-backends.json` +
      `docs/notes/SPIKE-BACKENDS-CHECKLIST.md`), then the deploy ⚑.
- [ ] **Phase 1 — test taxonomy + one ratchet mechanism** (no js change):
      `tests/{guards,tools,node,node/twins,sweeps,browser/<group>,manual}/`,
      `tests/groups.json` generating npm scripts / tooling-fast list /
      TESTING §2 §5; 55 guard/meta files → 12; pin files → VM/mini-dom
      behaviour; remaining ratchets (css-class, css-token-adoption,
      silent-catch, wait-polling) join ratchets.json; 11 twinned browser
      specs → nightly (delete after two green nightlies); galleries +
      material-shimmer → manual; 16 foundation specs → one VM test +
      `tests/data/foundation/<id>.json`; multiplayer 8 → 3, parts 10 → 3,
      camera 4 → 1; split the >120 s tests; 23 `__apex`-only specs → VM
      twins; CI gate fixed / selected / nightly; harness tools 18 → 7.
      Verification: tooling-fast + `test:audit`; each rewritten spec alone;
      ≤ 2 groups per PR.
- [ ] **Phase 3 — game.js carves** (one PR each, `physics-characterization-vm`
      exact before/after, ratchet lowered in the same commit): comment triage
      → `docs/notes/GAME-JS-DECISIONS.md`; delete the 10 passthroughs + dead
      banners (region table + banner-order test); extract boot-loaders →
      collisions → car-draw → garage-preview → quali-net + race-settings-ui →
      custom-team-ui → live weather → atmosphere; `hooks-documented` → the
      espree walker. `render()` / `updateCar()` stay whole. End: `driving` +
      `hooks` groups once.
- [ ] **Phase 4 — tools/ 160 → ~95** in `tools/{lib,ci,check,gen,shot,gfx,
      track,car,ui,lighting,mcp,net,env}/`; delete the ~27 no-caller files
      (pins in tools-runnable / package.json first); families → one entry
      point with subcommands; three track-build harnesses → `track-build-vm`;
      `@skill` tags validated or dropped; README generated per directory;
      generated-docs floor + docs-integrity walker updated; apex-tools-mcp +
      AGENT-SURFACE in the same commit. The mcp family (tinyfish-mcp.sh,
      tinyfish-rpc.py, probe-mcp.py, chrome-devtools-mcp.sh, mcp-cli.mjs,
      mcp-smoke.mjs) consolidates here — that is where the Phase 1-lite
      deferral is decided. Verification: tooling-fast.
- [ ] **Phase 5 — docs/ + agent surface**: top level 28 → ~12 with generated
      tables; `docs/notes/` ledgers path-checked only; ATTIC absorbs the
      zero-citation research + superpowers/ + PNGs + workflow JS;
      `docs/README.md` → reading order; AGENTS.md → ~120 lines of rules;
      skills 31 → ~20 (owner's choice); `skill-progressive` loses its ~118
      prose pins; doc-guard counts become generated numbers. Verification:
      tooling-fast (`generated-docs`, `agent-surface`, `skill-progressive`).
- [ ] **Close-out**: `docs/research/TREE-RESTRUCTURE-2026-09.md` gets its
      errata + landed SHAs per phase; `docs/ARCHITECTURE.md` and
      `docs/TESTING.md` describe the final tree; the `MOVED` map and the
      two-nightly twinned specs are removed one release later.

## The plan

Order (from the design review): **0 → 2 → 1 → 3 → 4 → 5**, with a
"1-lite" allowed right after 0. Rationale: js moves are the only phase with
a conflict surface against other sessions' in-flight edits, so they land
soonest after the enabler and in one window; test files get their path
strings rewritten while still at stable paths (rename+modify merges are the
failure mode); `check-gctx`/`game-vm` are rewritten once, against the final
layout, before the game.js carves depend on them. Every phase ends green on
`test:tooling-fast` and is revertable. AGENTS.md/CLAUDE.md and the
`skill-progressive` phrase pins are updated in the same commit as each
phase, or tooling-fast is red at landing.

### Phase 0 — Kill the lockstep (`gen-shell`). Two commits.

**Commit A (generator, byte-identical):** `tools/gen-shell.mjs` (grown from
`bump-cache.mjs`) regenerates three marked blocks from `tools/manifest.cjs`:
the `<script>`/`<link>` block of `index.html` (`<!-- @gen-shell:scripts -->`
markers around 1759-1904 and the `<link>` block ~70-81; the two hand
comments inside the block become manifest comment entries or hoist above
the marker), the same for `tools/carview.html:61-79` driven by `CARVIEW`,
and the sw.js optional-set block (`sw.js:54-199`, plus the LAZY_AGENT filter
at 221-223). No `importScripts` (a worker has no `window`, and
`service-worker.test.mjs` runs sw.js in a bare vm context). A generated
`js/roster.js` (`self.ApexRoster = Object.freeze({...})`, in `FULL` after
`mat4.js`, HARD_EDGE to game.js) replaces `js/game.js:77-247`'s five mirror
arrays (~150 lines out of game.js). `gen-shell --check` must pass on the
committed tree with today's hashes before anything else changes.
`load-order.test.mjs` loses its seven mirror tests (160-178, 248-266,
313-363) and reduces 192-229 to "sw.js block == generated"; keeps the
HARD_EDGES toposort, SW registration and CARVIEW checks.

**Commit B (policy):** tags read `?v=dev`; `pages.yml:202` already stamps
real hashes into `_site` and `:205 --check --root _site` stays the only
hash guard. `bump-cache --apply` without `--at/--root` REFUSES (so a
habitual run cannot reintroduce 151 hashes); `deploy.mjs:118` calls
`gen-shell --write`; `bump-cache --since` and `cache-bump-only.mjs` (+test)
are deleted. sw.js gains a DEV rule (`localhost|127.0.0.1|[::1]` →
network-first, cache fallback) because cache-first on `?v=dev` would serve
stale js on `npx serve` forever; asserted in `service-worker.test.mjs`.
`css-class-ratchet` stops counting `<script>` tags (`NODE_CEILING` reset).
Result: new file = file + one manifest line; move = `git mv` + one manifest
line; index.html changes only when markup changes.

Also touched: `.claude/hooks/protect-worktree-files.sh:23` (add roster.js,
gen-shell.mjs), `tools/apex-tools-mcp.{mjs,json}` (`apex_bump_cache_check`),
`tests/unit/{agent-surface,change-driver-tools,ci-coverage,deploy-stamp,
global-registry,skill-progressive}.test.mjs`, `tools/verify-change.mjs`,
`tools/tooling-fast.mjs`, check-changes/pwa-cache skills and the seven
skills that say "bump-cache --apply", `AGENTS.md:180-206`,
`docs/ARCHITECTURE.md:23-29 + §Deploy`, `docs/AGENT-SURFACE.md`.

### Phase 1-lite — cheapest guard cuts, no file moves.

Scope after the 2026-09-03 survey (one deviation from the earlier line,
with its reason):

1. **Delete** `tests/unit/tests-split.test.mjs` + `tools/tests-split.mjs`
   (done-and-shipped migration; no functional reader — `cross-file-paths`
   does not import it). Sweep: tooling-fast list, `tools/README.md` row
   (regen), `docs-integrity.test.mjs` comment, `docs/TESTING.md` row,
   `slim-bloat/references/carves.md`, `docs/research/APEX-TOOLS-MCP.md`.
2. **Delete** `tests/unit/physics-baseline-present.test.mjs`: the VM twin
   (`physics-characterization-vm.test.mjs`) reads the baseline with
   `readFileSync` and FAILS on absence — the browser spec's skip path is
   already covered by a fixed-gate test.
3. **tinyfish-mcp / probe-mcp — tools NOT deleted here.** They have live
   callers: `cloud-agent-install.sh` (tinyfish setup), `apex-tools-mcp.mjs`
   (probe daemon-port discovery), `mcp-smoke.mjs`, and the `mcp-probe`
   skill (`probe-mcp.py chrome-start` is the multi-call Chrome daemon on a
   host with no chrome-devtools MCP). Their deletion is Phase 4's
   mcp-family consolidation. Here: the assertions about tools that STAY
   (`chrome-devtools-mcp.sh`, `mcp-cli.mjs`, `gfx-probe` flags, the Chrome
   wrapper flags, the Playwright/Chrome MCP release pins) move into
   `tests/unit/mcp-cli.test.mjs` on the fast gate; the tinyfish-proxy and
   probe-serve assertions leave `tooling-fast` for a `test:mcp` node group
   run by the Pages gate's node suites (13 s off the fast gate).
4. **module-size → one ratchet mechanism.** `tests/data/ratchets.json`
   (file → {metric → ceiling}), `tools/ratchets.mjs` (`--check` default,
   `--update` snaps every ceiling to the current value, `--json`),
   `tests/unit/ratchets.test.mjs`. Metrics: `lines` (split-newline, the old
   metric, for every file the old CEILINGS named); `codeLines`
   (non-comment, non-blank) for `js/game.js` and `js/agent/apex.js`;
   `gMembers` (`scanGameCtx().members.size` from check-gctx) and `topLets`
   (`^let ` at column 0 — 147 today) for `js/game.js`. ONE slack rule: a
   ceiling more than max(60, 4 %) above its value fails ("lower it"). The
   ~1,280 comment lines of ceiling history → `docs/notes/CEILING-HISTORY.md`.
   Reference sweep (20 files): AGENTS.md conventions bullet, deploy.mjs and
   check-changes `deploy.md` merge rule ("re-measure on the union" →
   `node tools/ratchets.mjs --update` on the merged tree), tooling-fast
   list, the tools-runnable / hooks-documented / global-registry /
   css-class-ratchet / css-token-adoption / comment-citations pins,
   wait-polling-lint / bloat-scan mentions, ARCHITECTURE / TESTING /
   PERF-FINDINGS / ARCHITECTURE-REVIEW prose.

Verification: tooling-fast + `npm run test:mcp` + `node tools/ratchets.mjs`
clean; no browser run (no js/css change). One commit on the session
branch; deployed with Phase 2a's splits or alone.

### Phase 2 — js/ becomes domain directories; js/game/ dissolves.

Protocol: (a) in-file SPLITS first, at old paths, as their own PR, deployed
and merged before any move (a split defeats rename detection; a pure
`git mv` merges cleanly); (b) then ALL moves, one commit per target
directory, landed in ONE `deploy.mjs` push window (≤ 1 h) so other sessions
absorb one rename-merge, not N; (c) `manifest.cjs` carries a `MOVED` map for
one release and `deploy.mjs` prints the new path on a modify/delete
conflict; (d) each move commit carries a scripted path sweep over docs,
skills, tests and tools (docs-integrity walks all three and fails between
commits otherwise); (e) squashed-name renames happen in the same commit as
the move (one rename event).

Splits (a): tables.js → CAM_MODES/DIFF/PAINT_* to their consumers;
lighting.js → knobs / track-lights / frame-lights; gfx-quality.js → preset
vs renderer picker; quali.js → model vs sheet; photomode's lt-* handlers →
tuner-panel; cockpit-opts IIFE 2 + metrics-panel-style → metrics; the 6
files' direct `localStorage` writes → store; `segs` deleted from 24 defs;
`geo-paths.js` / `markings.js` / the four id-keyed `scenery-data` tables
folded into each `js/circuits/<id>.js` (`path`, `turns`, `sectors`,
`furniture`, `kit`, `standSet`, `barrier`), gated by `track-verts --diff`
exact equality + `graph-parity --all`; `maps.js` → UI.

Target layout (b):

```
js/core/      log.js, mat4.js (+ shared rng32), store.js, roster.js (generated)
js/physics/   consts.js, ai-drive.js, aero-zones.js, body-attitude.js, brake-cue.js,
              debris-world.js, incident-sim.js
js/race/      race-control.js, reliability.js, quali-model.js
js/career/    career.js, career-ui.js, season-cal.js, season-ui.js
js/lighting/  knobs.js, track-lights.js, frame-lights.js, profiles.js (light-store),
              presets.js (baked), atmosphere.js, tuner-panel.js
js/camera/    vantage.js, offsets.js, mode-switch.js, tuner-panel.js, photo-cam.js, cockpit-opts.js
js/audio/     engine.js, panel.js, music-lib.js, spotify.js
js/perf/      governor.js, loop-health.js, quality-preset.js, metrics-overlay.js, gfx-debug-overlay.js
js/input/     input.js, steer-tuning.js
js/ui/        layers.js, modal.js, menu-nav.js, scroll-fade.js, sheet-shape.js, aria-state.js,
              css-zoom.js, hud.js, select-screen.js, results-sheet.js, quali-sheet.js,
              settings-tabs.js, scale.js, track-maps.js
js/garage/    scene.js, setup-sheet.js
js/car/       car3d.js, car-mesh.js, liveries.js, liverytex.js, crest-paths.js, parts.js, ghost.js
js/data/      as today + teams.js, driver-ratings.js (roster data; 13 non-car consumers)
js/net/       as today (+ stub-parity test)
js/agent/     apex.js, agentview.js, agentview-raster.js  (LAZY_AGENT)
js/fx/        particles.js, skidmarks.js
js/render/    gfx.js (+ install/loader from game.js), shared/{lamp-chunks,assets,gltf}.js,
              glx/{glx,post,shadow,chunked}.js + glx/shaders/glsl-*.js
spike/backends/  webgpu/ (wgx.js + wgsl-*), three/ (tlx*.js + tsl-*), vendor/three-0.185.1/,
              their tools, tests and docs — OUT of the shipped tree (owner's decision, see below)
js/track/     engine only: core/{spline,mesh,surface,space,geom}.js,
              scenery/{core,generic,nature,structures(+identity),city,graph,models,kits,themes,data}.js,
              tracks.js (~600 lines: LIST/resolve/build/palettes) — split gated by graph-parity
js/circuits/  <id>.js (def, now the single home of its data) + scenery/<id>.js (LAZY) — layout unchanged
js/game.js    stays at root
```

Dropped from the earlier draft: per-circuit `<id>/` directories (they break
`verify-track.cjs:147-149`, `track-build-vm.cjs:132-134` and
`deploy.mjs:66`, which filter `readdirSync` for `.js`); folding
`docs/tracks` briefs into scenery headers; a `wgx.js` split.

**WGX/TLX spike-out (owner's decision).** Move `js/render/webgpu/`,
`js/render/three/`, `vendor/three-0.185.1/` (1.1 MB, TLX-only), the nine
WGX/GPU tools (`wgx-*.mjs`, `gfx-probe.mjs --tlx-webgpu` path,
`gpu-game-check.mjs` legs, `tlx-pack-check.cjs`, `ssr-probe.mjs`,
`webgpu-chrome-args.cjs`, `wgpu-flag-test.mjs`), `tests/unit/{webgpu-lifecycle,
renderer-soft-lifecycle,road-lut-frame}.test.mjs`, `tests/specs/tlx-probes.spec.js`,
`docs/research/WEBGPU-PARITY.md` and the WGX/TLX sections of
`RENDERER-PERF-AUDIT` into `spike/backends/` (replacing today's closed
`spike/`), with a README stating how to re-attach. In the shipped tree:
delete `DEFERRED`/`DEFERRED_EDGES` from `manifest.cjs:370-388,480-493` and
the roster; delete the importmap (`index.html:1745-1757`) and the sw.js
optional entries for webgpu/three/vendor-three; `Gfx.create()` returns null
for the `three`/`webgpu` keys (GLX fallback, already the documented
behaviour) and the boot canary (`game.js:309-322`) simplifies; the RENDERER
picker in `gfx-quality.js` and its 30 `apex26.*` keys shrink to WEBGL2;
`backend-surface-parity` becomes GLX-vs-`gfx.js`-header; the
`godray-keep-nearest` lockstep shrinks to one copy; `LampChunks` header
(`lamp-chunks.js:1-7`) loses its WGX clause; `gpu-census.yml` legs 171-234
and `ci.yml` renderer jobs 826-969 move with the spike or are deleted;
AGENTS.md's two WGX/TLX verification rows (`:40-41`) and the software-pixels
section (`:103-141`) collapse to a pointer at the spike README; skills
`webgpu-debug` and the WGX half of `mcp-probe` move to the spike. Known
cost, accepted: opt-in players on `apex26.gfxBackend=three|webgpu` fall
back to WebGL2 on the next boot (the loss ladder and road-LUT fixes only
matter to them); ~550 KB of never-parsed bytes and ~9.5k+7.9k lines leave
the shipped tree. The GLX chain keeps the `glsl-*` renames so the naming
parity survives if a backend is ever re-attached.

Tools and guards rewritten in the same window (all read by the reviewer):
`check-gctx.mjs:61,76-77` (recursive walk over the `create(G)` dirs, within
its 2 s budget), `vstd-lint.mjs:52-58` + `vstd-invariant` ALLOWED keys,
`game-vm.cjs:55,510` (SKIP path; LAZY_AGENT from manifest),
`pick-tests.mjs:100-148` RULES → directory-level rules,
`test-groups.test.mjs:55-77` probe list, `load-order.test.mjs:277-300`
(recursive scan), `sw.js:221-223, 305-307` prefixes (generated),
`global-registry.test.mjs:82-90` keys, `.cursor/rules/*.mdc` globs,
`js/track/CLAUDE.md` (re-homed), `docs/ARCHITECTURE.md` module table
(regenerated per directory from file headers).

### Phase 1 — Test tree taxonomy and one ratchet mechanism.

- Directories become the taxonomy and the group: `tests/guards/` (~22
  after merges), `tests/tools/` (~14), `tests/node/` (~88) with
  `tests/node/twins/` (13), `tests/sweeps/` (14), `tests/browser/<group>/`
  (smoke, gfx, hooks, circuits, driving, car, input, ui, modes, net),
  `tests/manual/` (ui-audit, menu-survey, hud-audit, menu-baseline,
  material-shimmer). `tests/groups.json` = {dir, project, gate:
  fixed|selected|nightly, budgetMin}; npm scripts, `tooling-fast`'s file
  list and TESTING.md §2/§5 are generated from it; `test-groups.test.mjs`
  shrinks to "every dir has an entry, every entry a script, no orphan
  file"; `test-coverage-audit` becomes trivial.
- Merge 55 guard/meta files into 12 (guard-syntax, guard-load, guard-css,
  guard-docs, guard-ci, lints, spec-lints, ratchets, tool-test-selection,
  tool-test-honesty, tool-cli-contracts, lighting-knobs). Split
  gfx-backend-canary, webgpu-lifecycle, perf-try, source-integrity into
  mock-behaviour vs pins; convert 11 pure-pin files to VM/mini-dom
  behaviour. The remaining ratchets (css-class, css-token-adoption
  [exact-equality today], silent-catch, wait-polling) join ratchets.json.
- Browser specs: the 11 twinned specs go nightly-only now and are deleted
  after two green nightlies; galleries + material-shimmer → manual; the 16
  foundation specs → one VM-parametrised test with
  `tests/data/foundation/<id>.json` (keep the 4 `lightState` assertions in
  a browser); multiplayer 8 → 3, parts 10 → 3, camera 4 → 1 (convert the
  raw-import / 3 s-sleep specs to `sharedTest` + `racePage` first); split
  the hidden >120 s tests (autopilot, custom-team, new-hooks Madrid,
  parts-budget, parts-mesh-cache, ui-resize, terrain/props-over-road, career
  by phase); convert the 23 `__apex`-only specs to VM twins (sliders.spec.js
  reads DOM and stays). CI gate: fixed = smoke + physics-characterization-vm
  + tests/node/twins + tooling-fast; selected = budgeted browser specs;
  nightly = foundations, gfx, over-budget splits, macOS GPU.
- Harness tools 18 → 7 entry points: `run-playwright`, `test-bg`
  (run|status|solo|shards), `select` (specs|budget|recall|failed),
  `verify`, `audit` (coverage|assert|observed|honesty|ci), `tooling-fast`,
  `harness.mjs`.

### Phase 3 — game.js: from 9,273 lines to a readable core.

In crossing-count order, one PR per carve, `physics-characterization-vm`
exact before/after, ratchet lowered in the same commit:

1. Comment triage: war-story paragraphs → `docs/notes/GAME-JS-DECISIONS.md`
   keyed by function; one-line pointers stay (~1,500 lines, no behaviour).
2. Delete the 10 passthroughs; replace the dead banners with a region table
   at the top of the file, guarded by a cheap banner-order test.
3. Extract: boot-loaders (8 free refs; mostly gone after roster.js) →
   collisions (11) → car-draw (~68 refs, owns its 16 lets) → garage-preview
   (0 new G members once car-draw exists) → quali-net + race-settings-ui →
   custom-team-ui → live weather → atmosphere. `render()` and `updateCar()`
   stay whole (both panels fenced them; no VM gate observes render).
4. `hooks-documented` moves to the espree walker shared with
   `gen-hooks-table` (retires the "comment must not quote `const api = {`"
   hazard); apex.js stays one file.
Deferred: `G` pass 2 / `S` state object (the member-count ratchet already
delivers the measurable half); apex.js facet split; `_sceneryShift`
containment (semantics change with a 40-circuit blast radius — after 3).

### Phase 4 — tools/ 160 → ~95 in subdirectories.

`tools/{lib,ci,check,gen,shot,gfx,track,car,ui,lighting,mcp,net,env}/`.
Delete the ~27 files with no functional caller (0-citation, self-declared
broken, forwarders once their guard pins are dropped, unattached MCP
wrappers, spent one-offs — list in the tools report; `ui-survey.mjs` and
`wgx-gallery.mjs` are pinned by `tools-runnable.test.mjs:483-512` and
`package.json`, so those pins go first). Families become one entry point
with subcommands (`shot`, `select`, `test-bg`, `audit`, `lint`, `slim`,
`track`, `gfx`, `ui`, `chrome`). Three track-build harnesses consolidate on
`track-build-vm.cjs`. `@skill` header tag validated against
`.claude/skills/` or dropped; README generated per directory;
`generated-docs.test.mjs:63`'s ">120 rows" floor and `docs-integrity`'s
one-level walker updated; `apex-tools-mcp.{mjs,json}` + AGENT-SURFACE in
the same commit.

### Phase 5 — docs/ and the agent surface.

- docs/ top level 28 → ~12: ARCHITECTURE (+RENDERERS, RENDER-CLIPPING;
  module tables generated per directory), TESTING (§2/§5 generated; field
  notes out), PHYSICS, CAREER (+PARTS), MULTIPLAYER, SCENERY (+GROUNDING
  §1-3, MIGRATION-CHECKLIST), LIGHTING (REF + generated KNOBS), UI
  (generated COMPONENTS + LAYOUT axes + DESIGN-PRINCIPLES), PLATFORM
  (PLATFORM-INPUT-NOTES promoted + iOS), AGENT-API (AGENT-SURFACE with a
  generated wrap map), DEBUG-HOOKS (hand sections generated from `@doc`
  comments). `docs/notes/` holds dated ledgers (PERF, TESTING field notes,
  DEFECT-LEDGER from ARCHITECTURE-REVIEW §7-8, CI-RENDERING, WEBGPU-PARITY,
  probes, the two decision records) — path-checked, never count-checked.
  ATTIC absorbs the 5 research files with zero outside citations
  (BROWSER-GRAPHICS, CLEANUP-SWEEP, PERF-HUNT, RENDERER-PERF-AUDIT,
  SURVEY-BUGS-PERF), superpowers/, the 47 PNGs, workflows/*.js, raw JSON;
  other dated research docs move to notes/ with citations retargeted
  (PERF-FINDINGS is cited by 52 files: its path keeps a one-line stub).
- `docs/README.md` becomes a reading order (agent: AGENTS → ARCHITECTURE →
  TESTING §1-2 → area doc → skill; human: README → ARCHITECTURE →
  PHYSICS/CAREER → TESTING §1).
- AGENTS.md → ~120 lines of rules; the ~780 words of evidence move to the
  docs they already link.
- Skills 31 → ~20 (owner's choice): merge the pointer-only and no-references skills into
  their cluster hub (ai-racecraft, input-controls, game-feel → physics;
  season-mode → career; car-viewer, debug-cameras → probe; asset-pack →
  renderers; restructure-screens-css → ui; slim-bloat → check-changes;
  debug-tracks → tracks); keep description-triggered skills that a host
  auto-selects. `skill-progressive` keeps its structural checks and loses
  the ~118 prose pins. Agents (5) unchanged; workflows → archive.
- Doc guards: keep path/link/index checks; counts become generated numbers;
  delete the AGENTS prose pins once AGENTS is minimal.

## Guards: keep / convert / delete

| keep as-is | convert | delete |
|---|---|---|
| global-registry, scenery-api-contract, game-ctx-surface, physics-characterization-vm, graph-parity, verify-track, deploy-staging, circuit-def-fields, godray-keep-nearest, road-lut-frame, net-stub-surface, assert-audit, select recall, service-worker | load-order → gen-drift + toposort; module-size + 4 ratchets → ratchets.json; docs count regexes → generated; hooks-documented → espree; backend-surface-parity → derived from game.js `gfx.*` usage; 16 foundation specs → 1 VM test; test-groups → groups.json | tests-split, physics-baseline-present, tinyfish-mcp, probe-mcp, cache-bump-only, 11 twinned browser specs (after two green nightlies), ~20 skill-progressive prose pins, 9 off-topic pins in source-integrity |

## Verification (per phase; two browser groups max, background, no js edits mid-run)

- Phase 0: tooling-fast; `test:service-worker`; `node tools/game-vm.cjs monza`
  (FULL still boots headless); `tools/offline-precache-check.cjs` in the
  background (it stays a tool and joins the Pages gate); `test-bg tiny` once.
- Phase 2: per commit tooling-fast (load-order, global-registry,
  check-gctx, docs-integrity). Phase end: `verify-track --all` (bg),
  `test:game-vm`, `graph-parity --all`, `track-verts --diff` exact for the
  circuit fold-in, then `test-bg tiny` once and dispatch `ci.yml` with
  `group: circuits` (two browser groups total). Renderer spike-out: GLX
  boot positive signal (`canvas.getContext("webgl2")` non-null after
  `test-bg tiny`), `backend-surface-parity` rebased, one `gpu-census.yml`
  dispatch with `census_only: true` to confirm the workflow still parses.
- Phase 1: tooling-fast + `test:audit`; every rewritten spec runs alone;
  never more than two groups per PR.
- Phase 3: `physics-characterization-vm` exact per carve; `driving` +
  `hooks` groups once at the end.
- Phase 4/5: tooling-fast only (`generated-docs`, `agent-surface`,
  `skill-progressive` are the guards).

## Effort and critical path

≈16 focused sessions: Phase 0 — 2; Phase 2 — 3 (splits PR; move window;
tool/guard rewrites); Phase 1 — 3; Phase 3 — 4; Phase 4 — 2; Phase 5 — 2.
Critical path 0 → 2 → 3 (the only hard chain: roster/gen-shell → stable
dirs for check-gctx/game-vm → carves); 0 and 2 need a quiet deploy branch;
1, 4, 5 interleave with feature work.
