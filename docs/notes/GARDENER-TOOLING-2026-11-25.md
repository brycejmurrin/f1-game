# Gardener survey: a ranked structure-cleanup plan for tools/, tests/ and .github/, 2026-11-25

Kind: survey · Re-measure-by: 2027-01-15

Asked by Bryce through the orchestrator (session `session_017Yzwxzch8ixiVZuLUxQGt6`, 2026-11-25 ~02:28Z). This is
the second Gardener survey; the first covered `js/` (`docs/notes/GARDENER-SURVEY-2026-11-25.md`, on draft PR #6442,
not yet merged), and its role rules apply here. Scope: `tools/`, `tests/` and `.github/workflows/` + `.github/actions/`.
Structure only: duplication, clarity, decoupling, dead tools. No bugs, perf or features. Read-only run, no browser.

Base: `c1e4f959` (`origin/claude/f1-game-project-26h3ng`). How it was made:
- four `code-hunter` agents, one per slice: `tools/ci/` + `tools/lib/`; `tools/check|gen|perf|shot|track/`;
  `tests/` (unit, helpers, fixtures, `groups.json`, the `package.json` test lists); `.github/`;
- one `prior-art-scout` (ACTIONS-AUDIT-2026-10-14, CI-CLOG-SURVEY-2026-10-15, TOOLING-HUNT-2026-11-09,
  PROCESS-SPEEDUP-2026-09, DEFECT-LEDGER);
- one `finding-verifier` pass on 15 claims: **15 confirmed, 0 stale, 0 refuted**, three numbers corrected in place
  (items 1, 4 and 10 below);
- apex-lsp for module shapes, and grep for the counts. See "apex-lsp on tools/" for why grep carries the counts here.

**Not re-reported (known):**
- ACTIONS-AUDIT-2026-10-14 §plan: the composite actions were judged healthy in October; item 6 is the sites added
  since that skip them. Its open items (gpu-census inline `node -e`, history-in-comments) are folded into item 9.
- PROCESS-SPEEDUP-2026-09: `game-vm.cjs` and `track-build-vm.cjs` are the shared VM loaders by design. Item 1 builds
  on them; it does not replace them.
- `tests/groups.json` is already the one source of the test groups: `gen-test-groups.mjs` writes the `package.json`
  scripts and the tooling-fast list, and `--check` is on the fast gate. The tests hunter found no drift, all 1,285
  unit files in some group, and no unused helper or fixture. Nothing to do there.
- #6436 (land.yml T1–T3, P1) and #6437 (knowledge-gc nightly, pages-red-tip): in flight, not re-reported.

## What keeps the tooling tree growing sideways

The `js/` tree has ratchets. `tools/` and `tests/` have almost none, so the shape a new script copies is whichever
file its author opened first:
1. **The shared helper exists, but it is not the easy path.** `tools/lib/cli-args.mjs` (`parseFlags`, `strictFlags`,
   `runCli`) is imported by ~100 tools files, yet 17 `tools/ci` files and 7 AI census scripts still hand-roll
   `arg()`/`opt()`/`flag()`. `tools/ci/github-api.mjs` calls itself the only GitHub client, yet 10 `tools/ci` files
   reach GitHub another way. `game-vm.cjs` has the right "load a js/ file" body (`runFile`, `:685`), but it is
   private, so 544 unit tests and 20 tools scripts write their own.
2. **Constants are copied, not imported.** The deploy branch is declared as a module constant in 13 files under 6
   names (`DEPLOY`, `DEPLOY_BRANCH`, `SHIP`, `SHIP_BRANCH`, `DOC_BRANCH`, `DEFAULT_DEPLOY_REF`).
3. **YAML holds logic.** `land.yml` is ~50% inline bash (701 of 1,395 lines), `gpu-census.yml` carries a Python
   heredoc, and the ci.yml "which files changed" preamble is written 5 times. Logic in YAML is tested only by
   extracting the step text (`merge-gate.test.mjs`'s `runStep`), so every copy needs its own extraction.

Nothing here is a bug today. Each copy is where the next drift starts. The drift that already happened:
`process-dashboard.yml:86` signs commits with a different bot email from the other five workflows, and the AI census
`flag()` copies already differ (`ai-strategy-census` lacks the `startsWith("--")` guard).

## Protected and config paths, once

`PROTECTED_CONFIG_PATH` (`tools/ci/merge-gate.mjs:138`) needs **Bryce's own `config-ok`**. It covers `merge-gate`,
`lib/provenance`, `lib/deploy-tip`, `lib/tip-gate`, `ready-gate`, `github-api`, `merge-train`, `github-token`,
`land.yml`, every host's hooks and settings, and the gate's closure outside `tools/ci/` (`gen/gen-test-groups`,
`lib/changed-files`, `lib/cli-args`, `lib/gate-receipt`, `lib/work-tree-id`). Every other `tools/ci/`,
`.github/workflows/`, `.github/actions/` and `package.json` path is a ROUTINE config path (`CONFIG_PATH`, `:124`):
it needs a `config-ok`, and an agent's counts (D-034). Each item names its class. **Importing** a protected module
from a new caller does not touch it. **Editing** it, or adding a module to the gate's import closure, does.

## The plan (ranked by payoff ÷ risk, quiet-queue order)

Each item has the same fields as survey 1: **What / where**, **Hurts**, **Shape**, **PRs** (one carve each), **Pin
first**, **Frees**, **Risk**, **Config** (protected / routine / none) and **Collides**.

### 1. One "load these js/ files into a VM" helper, for tools and tests

- **What / where:** `tools/lib/game-vm.cjs:685` `runFile` already does the four things every loader needs:
  `readFileSync`, the `^const` → `var` rewrite (so top-level consts land on the sandbox global), an absolute
  `filename` (V8 coverage drops relative names; `vm-filename-lint` polices it), and `runScriptCached`
  (`tools/lib/vm-script-cache.cjs:24`). It is not exported (`module.exports` at `:965` lists `createGame`, `settle`,
  … only). So:
  - **tests/unit:** 671 of 1,285 unit files use `vm.createContext`/`runInContext`/`runInNewContext`/`new vm.Script`;
    **544** of them import none of `game-vm`, `track-build-vm`, a `helpers/*-vm`, `vm-page` or `createGame`; **147**
    define their own `function load(`. 554 import `tests/helpers/abs-src.mjs` just to get the filename right.
  - **tools/:** 20 scripts in check/gen/shot/track build their own context over `js/` (e.g. `brake-cue-calibrate`,
    `voicepack`, `assets`, `gen-locales`, `cam-corners`, `cam-motion`, `replay-camera-probe`, `ai-ratings`).
    `verify-track.cjs` has two loaders (`:175`, `:261`). The const rewrite is copied in **12** tools files
    (verifier count: `slider-effect`, `cam-corners`, `coverage-merge`, `tlx-pack-check`, `voicepack`, `assets`,
    `verify-track`, `vm-debug-preload`, `track-build-vm`, `game-vm`, `brake-cue-calibrate`, `js-debugger-node`).
- **Hurts:** a loader rule change (coverage filenames, the script cache, the const rewrite) has to reach hundreds of
  files, and the lint exists because it does not.
- **Shape:** `tools/lib/load-js.cjs` exporting `runFile(ctx, rel)` (moved out of `game-vm.cjs`, which then imports
  it) and `loadJs(files, {globals}) → {ctx, get(name)}` with the base sandbox (`Math, console, JSON, …`).
  `tests/helpers/load-js.mjs` re-exports it with the optional `withI18n` / `seedStore` / `seedDom` pre-seeds.
  `track-build-vm.cjs:88` uses the same `runFile`.
- **PRs:**
  1. Extract `runFile` into `load-js.cjs`; `game-vm.cjs` and `track-build-vm.cjs` import it (zero behaviour change).
  2. Add `loadJs` and a **shrink-only count** of hand-rolled VM loaders in tests/unit (544 today), in
     `tools/check/tree-counts.mjs`.
  3. Codemod the 147 `function load(` tests in batches of ~40, each batch lowering the count.
  4. The 20 tools scripts, one directory per PR.
- **Pin first:** a unit test that `loadJs` and the old `runFile` produce the same global set for 3 real files
  (`js/core/mat4.js`, `js/ui/dom.js`, `js/data/results.js`), with absolute `filename`s; the existing
  `vm-filename-lint` and coverage-merge tests.
- **Frees:** ~1,500 test lines at full migration (≈10 lines × 147, plus sandboxes), ~150 tools lines.
- **Risk:** low for PR 1–2, low-med for the codemod (a test that relies on a quirk of its own sandbox).
- **Config:** none. `tools/lib/game-vm.cjs` is not a config path.
- **Collides:** none open.

### 2. One GitHub transport in tools/ci

- **What / where:** `tools/ci/github-api.mjs` (`lsp_outline`: `requestOnce :40`, `request :93`, `api :111`,
  `RETRY_DELAYS_MS :33`, ETag cache) is the documented only client. Ten files go around it:
  - three **identical** `function gh(args)` spawning `gh api` (`maxBuffer: 64 << 20`, stdout or null):
    `dropped-group-runs.mjs:253`, `reuse-draft-selected.mjs:139`, `selected-gate-verdict.mjs:396`, each with its own
    `pages()` splitter and JSON-parse helper; none imports `github-api.mjs`;
  - two more `gh api` spawns: `pages-rearm.mjs:48`, `pool-share.mjs:134` (which imports `github-api` for `REPO` only);
  - five hand-built `api.github.com` calls: `process-dashboard.mjs:26`, `flake-tally.mjs:83`, `live-run-check.mjs:44`,
    and `tooling-timings.mjs:94` / `ci-rerun.mjs:92-94`, which spawn `curl` although they already import `api`.
  - Four local functions named `api` with other shapes beside the shared one: `ci-watch.mjs:96`,
    `remote-group.mjs:311`, `cursor-agents.mjs:68` (another host: legitimately separate), `deploy.mjs:973`.
- **Hurts:** retry, 5xx and auth-failure handling differ per transport (#6436's T2 is exactly a 5xx class bug in a
  `gh` path). A fix to `request()` reaches 21 importers and misses these ten.
- **Shape:** every call goes through `request()`/`api()`; a caller that needs raw text or pagination uses
  `request(path, {raw, follow})` (`remote-group.mjs:311` already shows POST and follow). The local wrappers are
  renamed for what they add (`etagApi`, `cursorApi`). A guard: no `"gh", ["api"` and no `api.github.com` outside
  `github-api.mjs`/`github-token.mjs`.
- **PRs:**
  1. The three `gh()` clones (one PR: same body, same fix).
  2. `tooling-timings` + `ci-rerun` (already importers).
  3. `process-dashboard`, `flake-tally`, `live-run-check`.
  4. `pool-share`, then `pages-rearm` after #6437 lands. Then the guard.
- **Pin first:** each file's existing unit test with an injected `request`; where a file has none, a test that feeds
  a fake `request` a two-page response and asserts the joined rows (today's `pages()` behaviour).
- **Frees:** ~80 lines, and one retry policy.
- **Risk:** low-med (`gh` reads `GH_TOKEN`; `request()` reads `githubToken()`, check the Actions env has both).
- **Config:** routine (`tools/ci/`). Keep `github-api.mjs` itself unedited; if a caller needs a new `request`
  option, that edit is **protected**.
- **Collides:** #6437 edits `pages-rearm.mjs`: leave it for last.

### 3. One deploy-branch and repo constant

- **What / where:** `"claude/f1-game-project-26h3ng"` is a module constant in **13** files: `github-api.mjs:30`
  (`DEPLOY`), `behind-ship:23` (`SHIP`), `wait-for:30`, `process-dashboard:24`, `session-status:38`, `pick-tests:51`,
  `flake-tally:50`, `queue-depth:293`, `prune-branches:109`, `deploy:94`, `check/ratchets:397`,
  `shot/garage-before:28` (`SHIP_BRANCH`), `track/build-gallery.cjs:38` (`DOC_BRANCH`). It is inline in
  `branch-audit:242`, `base-verdict.sh:34`, `dispatch.mjs:97` and `gfx/stall-reload-sw-oracle.mjs:33,35`, and
  prefixed in `release-provenance:18`. Only `deploy`, `dispatch` and `queue-depth` already import `github-api.mjs`
  (verifier). `deploy.mjs:974,1011,1021` hard-code `brycejmurrin/f1-game` in URLs although `:827` defines `REPO`.
- **Hurts:** a rename of the deploy branch (it has happened to every long-lived project) is a 20-file hunt, and a
  missed copy fails silently (a tool reads the wrong branch).
- **Shape:** `tools/lib/repo.mjs` (`DEPLOY`, `REPO`, `OWNER`, read from `tools/ci/dispatch.json`, which already holds
  them) for the non-gate files; `.sh` reads `$DEPLOY_BRANCH` or `node -p`. A guard test allows the literal only in
  `dispatch.json`, `repo.mjs` and `github-api.mjs`.
- **PRs:**
  1. `repo.mjs` plus the 9 routine-path and 3 non-config files (ratchets, garage-before, build-gallery).
  2. The inline sites and `deploy.mjs`'s three URLs.
  3. The guard.
  4. **Protected, optional:** `github-api.mjs` re-exports from `repo.mjs` (this adds `repo.mjs` to the gate's import
     closure, so it needs Bryce's `config-ok` and a closure-test update).
- **Pin first:** a test that `repo.mjs` `DEPLOY === github-api.mjs DEPLOY === dispatch.json deployBranch`.
- **Frees:** ~20 lines; the value is one place to change.
- **Risk:** low.
- **Config:** routine for PRs 1–3 (most files are `tools/ci/`); protected for PR 4.
- **Collides:** none (#6412 touches `tooling-fast.mjs`, which has no copy).

### 4. Argument parsing through cli-args.mjs

- **What / where:** `tools/lib/cli-args.mjs` (`lsp_outline`: `runCli :28`, `parseFlags :38`, `strictFlags :57`,
  `makeFlags :74`, `exitIfHelp :159`). Its header names the failure it fixes: a hand-rolled parser drops the
  space form (`--team redbull`) and accepts unknown flags. Still hand-rolled:
  - **7 AI census scripts** with the same `flag(n, d)` one-liner: `check/ai-human:79`, `ai-tactics:49`,
    `ai-stuck:39`, `defend-duel:45`, `ai-field:106`, `ai-line:68`, `ai-strategy-census:34`. Six match; two have
    already drifted (`ai-tactics` adds `!= null`, `ai-strategy-census` lacks the `--` guard). `defend-duel:44` calls
    `parseFlags` and then redefines `flag` at `:45`.
  - **17 tools/ci files** with their own `arg()`/`opt()` (sampled by the verifier: `bump-cache:52`, `ci-watch:311`,
    `remote-group:327`, `verify-change:52`, `sync-pr:71`, `process-dashboard:554`, `prune-branches:159`), including
    `merge-gate` and `ready-gate`.
  - ~38 more in check/shot/perf/gen/track (11/14/6/5/3).
- **Hurts:** each copy differs on `--x=v` vs `--x v` and on unknown flags; a typo'd flag runs with the default.
- **Shape:** `const { flag, bool } = parseFlags(argv, KNOWN)` (or `strictFlags`) everywhere; the AI census scripts
  share one `KNOWN` + `--help` block.
- **PRs:**
  1. The 7 AI census scripts.
  2. tools/ci, two or three files per PR, the merge gates last.
  3. A shrink-only count of `argv.indexOf("--` in `tree-counts.mjs`.
- **Pin first:** per script, an argv table (`--x v`, `--x=v`, absent, unknown) recorded on the OLD parser. An unknown
  flag that used to run and now exits 2 is a behaviour change: list those in the PR and keep `parseFlags` (lax)
  where a caller relies on it.
- **Frees:** ~150 lines.
- **Risk:** low per script.
- **Config:** none for check/shot/…; routine for tools/ci; **protected** for `merge-gate.mjs` and `ready-gate.mjs`.
  `cli-args.mjs` itself is protected (gate closure) and does not change.
- **Collides:** none open.

### 5. One DOM fake and one storage fake for tests

- **What / where:** three DOM stubs: `tests/helpers/mini-dom.mjs` (`lsp_outline`: `makeDom :72`; 98 importers),
  `tests/helpers/seed-dom.mjs` (13), and `tools/lib/game-vm.cjs` (`makeClassList :85`, `makeStyle :106`,
  `createDom :157`). Storage: `game-vm.cjs makeStorage :283`, `tests/helpers/renderer-boot-vm.mjs:18 makeStorage`,
  `seed-store.mjs` (18) and `storage-faults.mjs` (3). Loose greps: 54 unit files stub `classList` without
  `mini-dom`, 126 define `getItem` without a storage helper.
- **Hurts:** a DOM behaviour a product change needs (e.g. `classList.toggle(force)`) is added to one fake and the
  tests on the other two pass on a fake that disagrees.
- **Shape:** `mini-dom` is the DOM fake; `seed-dom` and `game-vm createDom` build on it. A new
  `tests/helpers/fake-storage.mjs` (in `tools/lib/` if `game-vm.cjs` must require it) behind `seed-store`,
  `storage-faults`, `renderer-boot-vm` and `game-vm makeStorage`.
- **PRs:** fake-storage first (smaller), then `seed-dom` → `mini-dom`, then `game-vm createDom` (the twin suites).
- **Pin first:** a contract test run against all three DOM fakes today (`classList`, `style`, `querySelector`,
  listeners); the cases where they differ are recorded, not fixed, before the merge.
- **Frees:** ~250 lines.
- **Risk:** med for `game-vm createDom` (every twin suite boots through it).
- **Config:** none.
- **Collides:** none open.

### 6. Workflows: use the composites that exist

- **What / where:** `npx playwright install chromium` by hand in `chunk-merge-timing.yml:31`, `gpu-census.yml:427`,
  `garage-before.yml:105`, `car-shot.yml:71` and `capture-gallery.yml:33`, plus separate `install-deps chromium` at
  `car-shot.yml:75` and `gpu-census.yml:431`. `.github/actions/playwright-chromium` (cached, used 10 times) already
  has a `with-deps` input (`action.yml:17`). `car-shot.yml:81` inlines the Mesa + Xvfb step that
  `.github/actions/mesa-xvfb` owns (the lavapipe installs in `lit-wgsl-advisory`/`perf-census-webgpu` are a
  different package set: leave them).
- **Hurts:** five uncached browser downloads and five places to bump.
- **Shape:** `uses: ./.github/actions/playwright-chromium` with `with-deps: true` where `install-deps` ran.
- **PRs:** one for the five workflows; one for car-shot's Mesa step.
- **Pin first:** a workflow-lint row: no bare `playwright install chromium` in `.github/workflows/`.
- **Frees:** ~20 YAML lines; cache hits on manual runs.
- **Risk:** low (manual and scheduled workflows; check each still runs once by `workflow_dispatch`).
- **Config:** routine.
- **Collides:** none (#6437 edits `knowledge-gc.yml` and `open-bot-pr`, not these).

### 7. ci.yml: one "what changed" preamble

- **What / where:** the run_all / fail-safe preamble (the `CALLED`/`EVENT` case, `ci-pr-base.sh`, the `BEFORE` checks,
  `git cat-file -e`, `git diff --name-only`) is written **5 times** in ci.yml: `:1148`, `:2083` (geometry), `:2384`
  (ships), `:2513`, `:2563`. About 10–12 shared lines each (verifier). The bodies after it differ (ships adds a
  deployments lookup), so only the preamble is shared.
- **Hurts:** this is the fail-open logic (an unreadable diff must mean "run everything"). Five copies of a fail-safe
  is five chances for one to fail open.
- **Shape:** `tools/ci/diff-scope.sh` (or `.mjs`) that prints the changed files and sets `run_all=1` on any doubt;
  each step keeps only its own path regex and output.
- **PRs:** add the script with a unit test; then migrate the 5 sites in one PR (same preamble).
- **Pin first:** the helper's table: push with a zero `BEFORE`, a missing `BEFORE` object, `workflow_call`,
  `pull_request`, `merge_group` → `run_all` as today.
- **Frees:** ~50 lines of ci.yml.
- **Risk:** low-med (fail-open if wrong; the table is the guard).
- **Config:** routine (ci.yml and tools/ci are routine since D-034).
- **Collides:** #6437 adds env lines to ci.yml's tooling shards (~`:411`–`:694`), not these blocks. Text-only overlap:
  sync after it lands.

### 8. Setup and identity in composites: setup-node pin, bot git identity

- **What / where:**
  - `actions/setup-node` is pinned inline 6 times outside `setup-apex`: `desktop.yml:88-104`, `:171-187`, and
    `land.yml:460`, `:524`, `:1321`, `:1368`, with the same SHA `setup-apex` carries. Desktop turns off the npm
    cache on purpose (zizmor cache poisoning).
  - `git config user.name/email` in 6 workflows (`changelog-fold:87`, `import-models:181`, `knowledge-gc:88`,
    `ratchets-fold:110`, `spec-timings:192`, `process-dashboard:86`). **The email has drifted:** five use
    `noreply@anthropic.com`, `process-dashboard.yml:86` uses `noreply@users.noreply.github.com`.
- **Hurts:** a setup-node bump is three files; the bot identity is already inconsistent.
- **Shape:** `setup-apex` gains `cache: npm|false` and `ensure-built: true|false` inputs; a
  `.github/actions/bot-git-identity` composite (`name` input, one fixed email).
- **PRs:** bot identity (pick the email: that is a choice, record it); setup-apex inputs + desktop; land.yml's four
  sites **only with Bryce's `config-ok`**, after #6436.
- **Pin first:** a workflow-lint row: the setup-node SHA appears once; no `git config user.` in workflows.
- **Frees:** ~40 YAML lines.
- **Risk:** low.
- **Config:** routine, except the land.yml rows (**protected**).
- **Collides:** #6436 (land.yml); #6437 (`knowledge-gc.yml`, a different step).

### 9. Inline YAML scripts that are not text-parsed move to tools/ci

- **What / where:** `run:` blocks over 30 lines outside land.yml: `gpu-census.yml:212` (36), `:271` (32), `:305` (69,
  a `python3 - <<'PY'` heredoc that builds the split output from `EVENT` and `req`): 137 lines of logic in a
  708-line file, plus one `node -e`. In ci.yml: `:1146` (31), `:2190` (42), `:2511` (43). **Leave `ci.yml:945`** (the
  133-line "Pure-node unit suites" block): `deploy.mjs` and `twinned-specs.mjs` read it as text, one script per line.
- **Hurts:** logic in YAML is tested only by extracting step text, and the Python heredoc is the only Python in the
  CI logic.
- **Shape:** `tools/ci/gpu-census-split.mjs` (Node, so no Python) and one `tools/ci/*.mjs` per ci.yml block, each
  with a unit test; the step becomes one line.
- **PRs:** gpu-census split first (the ACTIONS-AUDIT item 11 that never landed), then the three ci.yml blocks.
- **Pin first:** the split function's table (push vs dispatch inputs) recorded from the current heredoc.
- **Frees:** ~250 YAML lines.
- **Risk:** low-med.
- **Config:** routine.
- **Collides:** none for gpu-census; ci.yml as in item 7.

### 10. land.yml: inline bash out, one merge_paused (protected)

- **What / where:** four `run:` blocks of 163, 242, 210 and 86 lines (`land.yml:273`, `:609`, `:884`, `:1191`): 701
  of 1,395 lines. `merge_paused()` (the `dispatch:merge-pause` label plus the owner-click check) is defined **3
  times** (`:281`, `:890`, `:1198`; verifier) and mirrors `dispatch.mjs` (comment at `:140`). #6436 adds ~70 more
  inline lines (`read_5xx`, `on_read_fail`, the GraphQL queue read).
- **Hurts:** the land path is the most safety-critical code in the repo and the least modular; `merge-gate.test.mjs`
  tests it by running extracted step text under a fake `gh`.
- **Shape:** `tools/ci/land-arm.mjs`, `land-retry.mjs`, `land-sweep.mjs`, sharing a `tools/ci/lib/merge-paused.mjs`
  that `dispatch.mjs` also uses. The YAML keeps permissions, `needs:` and one `run:` line per step.
- **PRs:** `merge-paused.mjs` + a parity test (3 bash copies vs `dispatch.mjs`) first; then one block per PR, smallest
  (`:1191` sweep) first.
- **Pin first:** the existing `merge-gate.test.mjs` `runStep` cases pass unchanged against the new script (run the
  same fixtures through both); the parity test.
- **Frees:** ~600 YAML lines become tested modules.
- **Risk:** med-high (the land path). One block per PR, each after a quiet train.
- **Config:** **protected** (`land.yml`; the new modules join the gate's closure if `merge-gate` imports them, which
  it should not need to). Every PR needs Bryce's own `config-ok`. This is Bryce's call: `decision:` needed.
- **Collides:** #6436 (all four blocks). Start only after it lands.

### 11. One browser-and-server launch path for tools

- **What / where:** `tools/lib/harness.mjs` owns the static server, `MIME` (`lsp_outline`: `:74`), `pickChromium`
  (`:94`) and `launchServer` (`:438`); 39 slice scripts import it. Still outside it: 7 direct `chromium.launch`
  calls (`check/offline-precache-check.cjs`, `check/audio-test.cjs` twice with the same swiftshader args,
  `shot/flyby.mjs:211`, `shot/wx-grid.mjs:141`, `shot/loading-probe.mjs:45`, …); one more `http.createServer` with
  its own MIME table (`offline-precache-check.cjs:88-95`); 5 files read `APEX_CHROMIUM` by hand instead of
  `pickChromium()`.
- **Hurts:** a browser-flag change (the WebGPU/lavapipe args) reaches the harness callers and misses these.
- **Shape:** `harness.launchBrowser({backend, args})`; `chromiumPath` honours `APEX_CHROMIUM` itself;
  `startStaticServer({root, host})` covers the stamped-dir case; swiftshader args join `webgpu-chrome-args.cjs`.
- **PRs:** `launchBrowser`; then one script per PR (all browser tools: CI proves them, rule 5).
- **Pin first:** a unit test of the resolved launch options (path, args) per backend, without launching.
- **Frees:** ~80 lines.
- **Risk:** low-med (browser tools cannot be run locally: their CI jobs are the proof).
- **Config:** none.
- **Collides:** #6438 (`perf/idle-pipeline-census.mjs`) is not in this list.

### 12. Prune and rename: dead tools, a name clash, local `api`s

- **What / where:**
  - **No code caller** (verifier): `tools/shot/webgpu-urban-gallery.mjs` (66 lines; only `tools/README.md:353` and
    `docs/agent-output/policies.json`, both generated) and `tools/track/official-corners.cjs` (147 lines; only
    comments, prose and generated docs). Skill-doc-only, weaker: `check/brake-cue-calibrate.mjs`
    (tune-physics), `check/garage-census.mjs` (mcp-probe).
  - **Same basename, different jobs:** `tools/track/build-gallery.cjs` (574 lines, the circuit gallery) and
    `tools/shot/build-gallery.cjs` (65, survey HTML).
  - The four local `api` functions of item 2.
- **Hurts:** a reader (or an agent's grep) cannot tell which `build-gallery` a test means; dead tools appear in the
  generated tools/README as if they worked.
- **Shape:** delete the two orphans or wire each into a skill with a header naming its caller; rename the shot one
  `survey-gallery.cjs`.
- **PRs:** one per orphan (Bryce or the skill owner keeps or drops it); one rename.
- **Pin first:** `npm run gen` (tools/README) clean; the gallery tests import by path.
- **Frees:** ~210 lines.
- **Risk:** low.
- **Config:** none.
- **Collides:** none.

### Next tier (measured, not ranked)

- **File walks, AST, ROOT:** 5 copies of `function* walk(dir)` (`check/html-sink-lint:124`, `reject-lint:124`
  identical; `wait-polling-lint:123`, `vm-filename-lint:98`, `cross-file-paths:55`) plus 4 variants; 28 tools files
  `import espree` with the same options and 2 identical AST walkers (`check-gctx:136`, `destructure-usage:32`);
  `const ROOT =` hand-written in 116 slice files in 8+ spellings. → `tools/lib/walk-files.mjs`, `tools/lib/ast.mjs`.
- **Census harness:** `perf/boost-press-census.mjs` vs `perf/idle-pipeline-census.mjs` share 48% of the smaller file
  (enter race, sample, write JSON) → `perf/census-run.mjs`. After #6438.
- **tests/helpers layout:** 99 files with no boundary between VM boots, Playwright rigs, seeds and tool fixtures;
  `i18n-stub` (12 importers) and `i18n-ctx` (13) overlap. `tests/helpers/css-source.mjs` is a one-line re-export of
  `tools/lib/css-source.mjs`. → `helpers/vm/`, `helpers/pw/`, `helpers/tool/` once item 1 has settled.
- **groups.json vm sub-groups:** `test:game-vm`, `-a`, `-b`, `-b1`, `-b2` are listed separately; if they are a
  partition of one list, express them as a split in the generator. Not diffed.
- **sleep/backoff:** ~5 tools/ci files define their own `sleep`; `harness.mjs:143` has one. → `tools/lib/sleep.mjs`.
- **upload-artifact:** `retention-days: 7` repeated 14 times in ci.yml. A composite buys little; leave it.
- **ci.yml size:** 3,272 lines. Job groups that share a matrix could become `workflow_call` workflows the way
  `browser-group.yml` already is. Long-term; not a carve.

## apex-lsp on tools/ (measured)

Bryce asked (via the orchestrator, ~02:29Z) for apex-lsp to carry the measurements. On this scope it reaches only
part of the way, and that is itself a finding:
- `lsp_outline` works per file on `tools/*.mjs`, `tools/lib/*.cjs` and `tests/helpers/*.mjs`. It gave the module
  shapes cited above (`github-api.mjs`, `cli-args.mjs`, `harness.mjs`, `game-vm.cjs`, `mini-dom.mjs`).
- `lsp_symbols` indexes `js/` only: `parseArgs`, `DEPLOY_BRANCH`, `walk`, `flag` and `readJson` returned `js/` rows
  or nothing, never the tools copies.
- `lsp_references` does not follow ESM imports across `tools/`: `parseFlags` gives 1 reference (its declaration)
  where grep finds 70 importing files; `github-api.mjs DEPLOY` gives 1; `api` gives 0 semantic uses and 23 text
  matches, all in `js/`.

So every tools/tests count in this note is grep, cited with its pattern or file list. **Proposal** (for the role, not
this plan): add `tools/**/*.{mjs,cjs}` and `tests/helpers/**` to the apex-lsp project (`tools/mcp/`, a routine config
path), so the next tooling survey can count fan-in by `lsp_references --files` the way survey 1 did for `js/`.

## Collision map used (the four PRs named in the brief)

| PR | files in this scope | items that wait |
|---|---|---|
| #6436 | `land.yml`, `tools/ci/merge-train.mjs`, `tests/unit/merge-gate.test.mjs`, `merge-train.test.mjs` | 8 (land rows), 10 |
| #6437 | `ci.yml` (shard env), `open-bot-pr`, `knowledge-gc.yml`, new `pages-red-tip.yml`, `pages-rearm.mjs`, `tools/docs/knowledge-gc.mjs`, 3 tests | 2 (pages-rearm last), 7/9 (text sync) |
| #6412 | `tools/ci/tooling-fast.mjs`, `tests/unit/prepush-floor.test.mjs` | none (item 4 skips `tooling-fast`) |
| #6438 | `tools/perf/idle-pipeline-census.mjs`, one spec | next-tier census harness |

Items 1, 3, 4, 5, 6, 11 and 12 are free to start today. 1 and 5 touch no config path at all.

Tools used: 15 `lsp_*` calls by the parent (5 `lsp_outline`, 7 `lsp_symbols`, 3 `lsp_references --files`) vs 11
grep/shell measurement runs by the parent; the four hunters, the scout and the verifier measured with grep, `wc` and
file reads (apex-lsp does not resolve cross-file `tools/` references, above).
