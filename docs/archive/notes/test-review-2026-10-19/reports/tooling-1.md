<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT tooling-1 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260959859
- Posted: 2026-10-19T06:16:12Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT tooling-1

Batch tooling-1: 46 files, all `tests/unit/*.test.mjs` (0 specs, ~15.6k lines). Reviewed on the session tip. Two read-only Sonnet subagents read every test plus its module under test (they skimmed the five largest files: bash-guard-hardening, capture-tools-regressions, async-lifecycle, appearance-opts, appearance-studio); I ran every file and did the debugger checks myself.

**Run:** 46/46 files pass with `node --test <file>` (exit 0, 0 fail). Skips/todo: `announcer` 111 pass + **2 `todo`** (non-gating, see finding 4). Walls below are from the inspector run (slower than plain); slow ones: adapted-specs 852 s (its own timeout is 880 s), barrier-runoff-jumps 631 s, apex-tools-mcp 242 s, agent-view-vm 160 s, agent-hooks-vm 115 s, bash-guard-hardening 110 s; the rest under 60 s. One run each, no retries, no flake seen. **catalog-discovery** passes plain (7/7, 38 s) but its test 7 (`sweepParallel`, spawns workers, 60 s timeout) **hangs under `--inspect-brk`** and is `cancelled` under `NODE_V8_COVERAGE` (6 pass, 1 cancelled): it times out under any instrumentation.

**Debugger method (said once):** the js-debugger MCP lists Chrome pages only and cannot attach to node. I drove the Node inspector over CDP myself (`artifacts/test-review/tooling-1/cdp.mjs`): `node --inspect-brk --experimental-test-isolation=none --test <file>`, `Debugger.setBreakpointByUrl` on a line in the code under test (picked by the reviewers, sed-verified), count breakpoint pauses and resume. For code run through anonymous `vm.runInContext` scripts (no URL) it matches the real file's line text in each `evalmachine.<anonymous>` script via a `beforeScriptExecution` instrumentation breakpoint. (A `console.log` condition does not work inside vm contexts: no `console` there; counting pauses does.) `hit (cdp)` = breakpoint fired N times. Code that runs in a **child process** the test spawns (CLIs, MCP server, shell/python hooks) is unreachable by this harness: reported `child`, with `hit (cov)` from `Profiler` precise coverage where the parent process also ran it. `n.a.` = no code under test (text scan), flagged as a finding.

## Per-file table
file | purpose | run | debugger | quality | mock / wrong-target | verdict
---|---|---|---|---|---|---
adapted-specs | browser specs adapted to the vm-page node adapter still run green in node | pass 12, 852s | child (vm-page.js:239 runs in spawned `node --test`); hit (cov) twinned-specs.mjs parent only | strong (refuses zero-pass/unreadable TAP :58-61) | none; cost is the 12 child runs | keep; watch the 880 s guard vs 900 s test timeout
agent-anchors-vm | player render anchors not stale after act/rollout/aiPlace | pass 5, 19s | hit (cdp) agentview.js:98 x159, apex.js:1817 x5 | strong | real game VM, GLX stub | strengthen: jump()/reset()/step()/park() anchors (apex.js:270/2068/1237) untested despite header
agent-config | agent-host config, hooks (bash-guard, protect-files), rules mirrors, memory | pass 36, 21s | child/shell: hooks are sh/py, only `gen-cursor-rules` CLI (child). n.a. for most | mixed: strong where hooks are spawned (:168-201,:302-340), weak size/word budgets on prose (:55-61,:108-110,:634-700,:734) | :572-589 greps bash-guard text; :466 vacuous when no `source:` line | strengthen + split exec vs budgets
agent-determinism-vm | same seed replays the same episode | pass 4, 27s | hit (cdp) apex.js:2046 x9, :2039 x3 | strong | real VM; only monza | keep
agent-fleet | fleet skill/doc drift (tool names, launch fields, card hash) | pass 7, 0.6s | n.a. (prose scan) — finding | mixed: regex over prose; hash pin :56-69 is real; `!includes` inside a loop :90 | pure doc text | merge into agent-config
agent-hooks-vm | `__apex` hooks (rollout, gaps, scale, corners, flyingStart…) | pass 22, 115s | hit (cdp) agentview.js:314 x378, :1620 x2 | strong, a few weak (:132 if/else, :308 `!= null`, :369 notDeepEqual) | one test fakes GLX/UA | keep; strengthen :369
agent-indexes | committed agent index/hooks/coverage/impact-map equal generators | pass 7, 20s | hit (cdp) gen-agent-index.mjs:133 x3, :203 x1 | strong; one redundant check; impact-map only shape-checked (`>10`) | none | keep; trim duplicate :27 vs :43
agent-surface | AGENT-SURFACE wrap map/MCP catalog/configs/skill mirror in lockstep | pass 15, 1.3s | child (list-tools CLI; apex-tools-mcp.mjs:3236 not in-process) — mostly text scans | mixed; `tools.length === 40` :97 change detector | server names pinned 3 more times (dup of agent-config :65) | merge/strengthen
agent-view-vm | agent world view (world/field/describe/query/render/survey/rollout) | pass 119, 160s | hit (cdp) agentview.js:314 x1365, :1697 x1380 | mixed-strong; :121-132 if/else accepts both; :1309-1317 loop over maybe-empty `cs` | clone of a browser spec; GLX stub, 1280x720 vs spec 844x390 | keep; fix weak asserts; split 1500 lines
agentview-api-contract | AgentView surface/span/episode contract | pass 6, 0.6s | hit (cdp) agentview.js:1226 x3, :2313 x3 | mixed (:111-156, :192-212 strong; :59-103 typeof-only) | :158-190 regex-on-source stands in for containsEye behaviour | keep; replace scan with a frame() call
ambient-env-override | pack wildcard env must not override authored per-circuit ambient | pass 4, 0.6s | hit (cdp) atmosphere.js:366 x4, :368 x4 | strong | Assets.env stub re-implements the `<id>|<tod>`→`*|<tod>` lookup (:35) | keep; add exact-key zenith case
announcer | announcer script, voice ladder, budget fit, recorded intro | pass 111 + 2 todo, 6s | hit (cdp) announcer.js:505 x602, :53 x3 | strong; :624 condition-wrapped expect; 2 `todo` never gate | speechSynthesis stub + fake clock (fine) | keep; fix :624
apca-timing | sector colours legible (APCA) on HUD | pass 5, 0.6s | n.a. (CSS scan + copied APCA formula) — finding | mixed: arbitrary Lc thresholds; `token()` reads first declaration only (:43-47) | ground is `--bg` not the translucent plate; stale `#c084fc` comment :8 | keep, weaken claims
apex-arg-guards | `__apex` hooks reject NaN/Infinity | pass 8, 0.6s | hit (cdp) apex.js:21 x8, :244 x5 | strong | bare G object; refuse path only | keep; table-drive all numeric hooks
apex-server-fixes | MCP job registry races, runSpawn truncation, session abort/lock leak | pass 6, 4.6s | hit (cdp) apex-extras.mjs:765 x2, apex-tools-mcp.mjs:1994 x1 | strong (deterministic interleave :47-74) | lock fns faked (real ones elsewhere) | keep; merge candidate with apex-tools-mcp
apex-tools-mcp | apex_* MCP server contract (schemas, argv, refusals, locks, jobs) | pass 121, 242s | child (server runs as spawned `serve`/`call`); hit (cov) 40 in-process helper fns only | mixed-strong; `tools.length >= 28` :1670 floor, stale "38" comment :21, `{0,400}` source regexes :2289 | APEX_MCP_MOCK=1: canned `mockSuccess`, "every tool answers" proves schema acceptance only | regroup: split 2572 lines
appearance-opts | theme/accent/CVD/units + persisted keys | pass 32, 0.8s | hit (cdp) appearance-opts.js:147 x738, :345 x5 | strong | real VM | keep
appearance-studio | studio profiles/undo/scope/presets | pass 29, 1.1s | hit (cdp) appearance-studio.js:149 x26, :120 x7 | strong | real scale.js + attach block cut out of game.js | keep
assert-audit | vacuity ratchet (specs asserting nothing) | pass 15, 53s | hit (cdp) assert-audit.mjs:189 x18374, :110 x156 | mixed-strong; arbitrary floors (`>900`,`>800`,`>1200`), hard-coded `steer.length === 8` | none | strengthen
async-lifecycle | late/cancelled async completions (QR, music lib, API queue, voices, view transition) | pass 29, 1.1s | hit (cdp) scan.js:60 x2, music-lib.js:290 x5, api-transport.js:219 x18 | strong VM tests; 2 CSS regex scans :548,:556 | grab-bag of 6 modules | regroup by module
backend-surface-parity | WGX/TLX expose every GLX member | pass 2, 0.6s | n.a. (pure source scan) — finding | weak: arbitrary floors; stale header (install site is renderer-boot.js:250, not game.js) | source scan stands in for runtime parity | strengthen: run the descriptor-copy install in a VM
badges | licence badge unlocks, storage corruption | pass 7, 0.6s | hit (cdp) badges.js:86 x23, :66 x26 | strong | none | keep
baku-migration | Baku geometry/scenery regressions | pass 2, 22s | hit (cdp) baku.js:35 x2, tracks.js:116 x2 | mixed: deep-equals the circuit's own data tables (:47); undulation envelope recomputes the engine formula | copied constants | strengthen (assert measured outcomes)
barrier-runoff-jumps | run-off barrier cliffs (7.9 m steps) | pass 11, 631s | hit (cdp) barrier-jumps.cjs:23 x110, :127 x40 | strong | real track build | keep (631 s under inspector; plain much less)
base-green | deploy push gate must not narrow CI on red base | pass 4, 1.0s | n.a. (bash script `base-green.sh`, fake `gh`) ; last test is a ci.yml text scan | strong CLI tests | :60 slices ci.yml by step name + regex | strengthen: YAML-parse
bash-guard-hardening | commit/push/pkill/gh guards fail closed on compound shell | pass 44, 110s | n.a. (hooks are .py/.sh; shellparse.py:440, bash-guard.sh:511 get no CDP) | strong (real hooks) | `elapsed < 500` ms :137 is wall-clock | strengthen: drop the time bound, split file
battle-earcon | gap earcon motif/overlap/buffer leak | pass 6, 1.3s | hit (cdp) battle-earcon.js:36 x17 | strong | real VM, fake audio | keep
behind-ship | advisory "behind ship" step never fails a PR | pass 6, 0.8s | hit (cdp) behind-ship.mjs:40 x2, :70 x4 | mixed | pins constants; ci.yml text scan :67 | strengthen
bitmap-decode-worker | off-thread decode loses/leaks ImageBitmaps | pass 10, 0.6s | hit (cdp) bitmap-decode-worker.js:30 x7, :33 x4 | strong | fake worker/bitmap | keep
body-attitude | cosmetic pitch/roll/heave spring signs | pass 12, 0.6s | hit (cdp) body-attitude.js:116 x2726, :180 x2726 | strong, except last test | :270 regex over game.js/vantage.js stands in for "one pitch sign end to end" | strengthen: extract helper, run in VM
body-split | livery L/R / lower/upper colour splits | pass 17, 15s | hit (cdp) car3d.js:1009 x45, :1011 x28 | mixed (real mesh sampling) | also pins team data | strengthen
boot-idle-prefetch | no heavy prefetch on title/race entry | pass 6, 0.6s | hit (cdp) lazy-bundles.js:683 x2, build-client.js:103 x2, assets.js:100 x2 | mixed | :13,:154,:176 regex scans named as behaviour, pinned timeouts (`Math.min(ms,800)`, 4000) | strengthen: run scheduleIdle + adapter race in VM
bootstrap-doctor | cloud bootstrap diagnostics | pass 13, 2.4s | hit (cdp) doctor.mjs:55 x15, chromium-path.mjs:185 x35 | strong | fixtures | keep
branch-audit | prune-branches never deletes unmerged work | pass 9, 1.5s | hit (cdp) branch-audit.mjs:129 x17, :131 x16 | strong (real git) | none | keep
browser-http-mcp | phone-facing browser MCP HTTP auth/tool list | pass 1, 0.8s | hit (cdp) browser-http.mjs:58 x4, :168 x2 | mixed: `tools/call`, `ping`, wrong (vs missing) token untested | none | strengthen
browser-http-up | tunnel launcher reuse/start | pass 2, 0.6s | hit (cdp) browser-http-up.mjs:32 x3, :27 x2 | thin | none | merge into browser-http-mcp
captions | caption ring, speaker labels, persistence | pass 5, 0.6s | hit (cdp) captions.js:70 x3, :79 x16 | mixed | :107 "fits phone-landscape width budget" is `TEXT_CH_MAX === 38` + a CSS string match | rename/delete :107 or measure in browser
capture-tools-regressions | screenshot/capture CLIs time frames, leak browsers, write outside artifacts/ | pass 60, 15s | hit (cdp) capture-runtime.mjs:65 x23, probe-page.mjs:438 x4 | strong-mixed | agent.mjs imports regex-stripped + stubbed ROOT (:23) | regroup: 963 lines/~15 tools, split per tool
catalog-discovery | MCP catalog leaks/shell-injectable ids; garage camera metadata | pass 7, 38s plain; **hangs under inspector** | hit (cov, NODE_V8_COVERAGE) discoverCatalog, validateCarFilters, carFilterArgv, partRows, liveryRows; cdp not-run (test 7 times out under instrumentation) | mixed | :46 `git show HEAD:tools/shot/garage-angles.mjs` — meaning changes per commit, throws without history | rewrite :46; test 7 depends on worker spawn timing (60 s)
cdmcp-measure | chromium-MCP measure scripts keep log-marker/CLI contract | pass 19, 1.8s | n.a. (checks python script text, cdmcp-cli.py:647 has no CDP target) — finding | weak-mixed: string presence | :211 hard-codes 12 circuit ids copied from look-survey-n10.mjs | strengthen
change-kind | docs/css/code diff classification | pass 1, 0.6s | hit (cdp) change-kind.mjs:19 x6, :20 x4 | strong but thin | none | keep; add rename/delete cases
changed-files | renamed-out circuit files still fire slices | pass 2, 3.6s | hit (cdp) changed-files.mjs:24 x7, :40 x1 | strong | scratch git | keep
changelog-fragments | changelog fragments don't conflict; fold keeps CHANGELOG intact | pass 6, 1.1s | hit (cdp) gen-changelog.mjs:24 x3, :48 x3 | mixed: `A|B` alternation :37 cannot fail on its left half; :52 skipped without a local base ref | none | strengthen
check-js-types | `@ts-check` files stay type-clean | pass 2, 0.8s | child (tsc spawned; check-js-types.mjs:27 not in-process) | mixed, low value; hard-coded starter list | redundant with the gate | keep or merge
chrome-server-fixes | patched chrome-devtools-mcp runtime (dialog click, page close) | pass 7, 0.8s | hit (cdp) chrome-devtools-runtime.mjs:142 x13 | strong on the materializer | fixture fragments hand-copied from upstream | keep
chromium-shell | headless-shell discovery in fresh container | pass 2, 0.6s | hit (cdp) chromium-path.mjs:185 x13, :188 x6 | strong | fixtures | keep

## Top findings (ranked)
# | file:line | defect | why it matters | proposed fix | confidence
---|---|---|---|---|---
1 | bash-guard-hardening.test.mjs:137 | asserts wall-clock `elapsed < 500` ms around a bash spawn | flaky on the loaded box the repo documents (AGENTS rule 8); fails the safety-hook suite for infra reasons | delete the bound, keep the trigger-list assertion | high
2 | boot-idle-prefetch.test.mjs:13,:154,:176 | three tests named for behaviour ("caps requestAdapter", "schedules scenery on microtask") are regex scans with pinned timeouts (`Math.min(ms,800)`, 4000); breakpoints do reach lazy-bundles.js:683 etc. only via other tests | pass if the code is dead; break on harmless refactors; renderer-boot adapter race never runs | VM-run `scheduleIdle` and the adapter race with a never-resolving fake adapter | high
3 | catalog-discovery.test.mjs:46 and :83 | :46 uses `git show HEAD:...`; test 7 (`sweepParallel` workers, 60 s) hangs under inspector and is cancelled under NODE_V8_COVERAGE | :46 changes meaning every commit and throws without history; test 7 can't be debugged/covered and is timing-sensitive | assert TARGETS/STATIONS shape directly; give test 7 an injectable worker count/timeout | high
4 | announcer.test.mjs:603-613,:624 | two `todo` tests never fail the run (known Baku/Istanbul gaps); budget sweep wraps its expect in `if (/7\.004 kilometres/.test(kept))` | sweep can pass with zero assertions; the gaps are non-gating | count qualifying budgets and assert >= 1; track gaps as issues | med
5 | agent-view-vm.test.mjs:121-132, :1309-1317 | if/else accepts either answer; loop over a possibly-empty `cs` asserts only Array | passes with no assertion on real data | pin one branch for fresh boot; assert `cs.length > 0` | high (if/else) / med (cs)
6 | agent-surface.test.mjs:97 | `catalog.tools.length === 40` with a ~2 KB history string; tool list duplicated at apex-tools-mcp.test.mjs:160 | change detector, forces a doc edit per new tool | keep catalog==wrap-map check (:40), delete count | high
7 | agent-config.test.mjs:55-61,:108-110,:634-700,:734 | arbitrary size/word/"rule-line" budgets on prose; :572-589 greps bash-guard.sh text; :466 vacuous when no memory has `source:` | fails on innocuous edits, proves no behaviour; behaviour already tested at :288 | move budgets to one data-backed file; delete :572; require >= 1 `source:` | high / med
8 | body-attitude.test.mjs:270 and boot/captions/base-green/behind-ship scans | tests named for end-to-end behaviour are regexes over game.js/vantage.js/ci.yml (`tmpF[i] = f * cp - u * sp;`, step-name slices) | pass if code is dead; fail on harmless refactors | extract helpers and VM-run; YAML-parse ci.yml in one workflow-lint test | med
9 | captions.test.mjs:107 | "fits phone-landscape width budget" checks only `TEXT_CH_MAX === 38` + a CSS string | promises a layout guarantee it does not check | rename/delete or measure width in a browser spec | high
10 | capture-tools-regressions.test.mjs:23 | 963 lines/60 tests over ~15 tools; agent.mjs run after regex-stripping imports and stubbing ROOT | too big to review; passes while real imports break | split per tool, import the real entry | med
11 | agentview-api-contract.test.mjs:158-190 | regex-on-source stands in for the containsEye guard (guard count === 2) | passes if the guard text exists but is wrong | render a frame with the eye inside a box using the existing stubs | high (nature) / med (impact)
12 | agent-anchors-vm.test.mjs (header vs body) | jump()/reset()/step()/park() anchors (apex.js:270,:2068,:1237) and pair/jam/park `lightsLit` resets (apex.js:816/834/891) have no assertion | the stale-pose bug class could regress there | three short cases | high
13 | apca-timing.test.mjs:43-47,:18 | `token()` reads the first declaration only; ground is `--bg` not the translucent plate; stale `#c084fc` header | cvd/light overrides (tokens.css:1073-1076) never graded; numbers aren't what the player sees | resolve per theme/cvd block; composite the plate as at :142 | med
14 | browser-http-mcp.test.mjs:26 | `tools/call`, `ping` and a wrong token untested (browser-http.mjs:168,:58) | the authenticated endpoint's main path is unasserted | add unknown-tool, wrong-token, ping cases | med
15 | adapted-specs.test.mjs (runtime) | 12 child specs take ~14 min under the inspector against an 880 s guard / 900 s test timeout | a slower runner turns it into a timeout, not a verdict | measure plain wall time on CI; raise per-spec parallelism or split the group | low-med (only measured under inspector)

Also: apex-tools-mcp.test.mjs:21 says "38 tool schemas" (catalog has 40), :1670 `>= 28` floor; "13 camera modes" (agentview-api-contract.test.mjs:172) vs "15" (agent-view-vm.test.mjs:803); changelog-fragments.test.mjs:37 alternation; assert-audit arbitrary floors; backend-surface-parity header names game.js, real install site is renderer-boot.js:250.

## Gaps
- `jump()`, `reset()`, `step()`, `park()` anchors and `pair()/jam()/park()` `lightsLit` resets (apex.js:270/2068/1237/816/834/891); `setLap` positive path, `camTune`, `weather`, `relDeg` (apex.js:879) numeric-arg sweeps.
- `describe()/query()/survey()/terminal()` of AgentView only typeof-checked in the contract test; `corners()` absent there.
- Hooks with no behavioural test in this batch: `github-mcp-guard.sh`, `post-edit.sh`, `stop-guard.sh`, `subagent-contract.py`, `skill-hint.py` (only registration checked; reviewer note, grep other batches before acting).
- `gen-agent-index.mjs` evalNode branches (TemplateLiteral with expressions, UnaryExpression, array holes); impact-map content correctness (only shape).
- Real CLI execution of apex_agent/apex_eval/apex_shot behind `APEX_MCP_MOCK=1`; HTTP auth/origin beyond loopback bind.
- `announcer`: Baku/Istanbul budgets (todo), `wrapUp` edge cases. `ambient-env-override`: night/`isNightSession` branch and rain overlays.
- Tooling with CLI bodies that no CDP reaches (shell/python): bash-guard/protect-files hooks run for real, but nothing asserts their branch coverage.

## Not run
- Debugger (CDP) not possible, reported as `child`/`n.a.`: adapted-specs, agent-config (shell hooks), agent-fleet, agent-surface, apex-tools-mcp (server is a child), apca-timing, backend-surface-parity, base-green, bash-guard-hardening, catalog-discovery (test 7 hangs under inspector), cdmcp-measure, check-js-types. Each ran and passed plain; 5 of them are pure text/shell/python scans (agent-fleet, apca-timing, backend-surface-parity, cdmcp-measure, parts of agent-config/agent-surface): findings above.
- No file was skipped; nothing in the repo was edited.
- Reviewers skimmed (not line-read) bash-guard-hardening, capture-tools-regressions, async-lifecycle, appearance-opts, appearance-studio; their quality column is lower confidence.


---
_Generated by [Claude Code](https://claude.ai/code)_
