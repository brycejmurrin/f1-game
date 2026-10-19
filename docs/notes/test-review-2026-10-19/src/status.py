UPDATED = "2026-10-19 ~05:25Z (22:25 Pacific, 10-18)"
FINAL = {"render-1", "render-2"}
PARTIAL = {"render-3": "1/2"}
ALL = ["audio-1","physics-1","physics-2","race-1","race-2","render-1","render-2","render-3","tracks-1","tracks-2","car-1","car-2","modes-1","ui-1","ui-2","tooling-1","tooling-2","tooling-3","tooling-4","tooling-5","net","platform"]
k_final = len(FINAL); k_partial = len(PARTIAL); k_in = k_final + k_partial
PENDING = [b for b in ALL if b not in FINAL and b not in PARTIAL]
REP = {"render-1": "[render-1](reports/render-1.md)", "render-2": "[render-2](reports/render-2.md)", "render-3": "[part 1/2](reports/render-3.part-1of2.md)"}
TABLE = [(b, "final" if b in FINAL else (f"partial {PARTIAL[b]}" if b in PARTIAL else "pending"), REP.get(b, "—")) for b in ALL]
PATTERNS = [
 ("source-scan", "Source-text scans standing in for behaviour", "regex / indexOf / slice over js, css or md source; nothing under test executes (debugger n.a. or not-hit)"),
 ("condition-wrapped", "Condition-wrapped or early-return asserts", "`if (x) assert…`, `if (!gc) return`; the guard turns the test off in the very case it should catch"),
 ("tautology", "Tautologies", "asserts a stub's own return, a constant against its copy, `>= 0`, or a disjunction any outcome satisfies"),
 ("stub-copy", "Stub copies of real modules", "a hand copy of the code or data under test (resolver, damper, shader maths, field list, track stub) that cannot drift with it"),
 ("vm-no-filename", "vm code without a filename", "vm.runInContext / eval with no filename: no breakpoint by URL, coverage without lines"),
 ("slow-in-fast", "Slow files in fast groups", "a file over ~20 s in toolingFast, the pre-push floor"),
]
PATTERN_NOTES = [
 "- **Source-text scans** dominate the three render reports: gfx-backend-canary alone has ~160 (884 `assert.match`), webgpu-lifecycle ~306 asserts. The cheapest structural fix is a lint over `tests/` for fixed-width `slice(x, x+N)` windows and asserts after `//` on one line (R2-01, R2-02), then one lane per subsystem converting the highest-risk scans to behaviour.",
 "- **vm code without a filename** is counted once (DBG-02) but touches every vm-loaded module in these batches: governor.js, lamp-bake, chunked.js, lighting/*, spans.js, renderer-boot.js, and every `evalmachine.<anonymous>` render-1 met.",
 "- **Slow in fast:** `flyby-shots` (138 s) is a `toolingFast` member, `perf-try` 25 s and `lamp-bake` 14 s too (checked in `tests/groups.json` on cd907d4c). `lamp-fixture-anchor` (109 s) is already in `test:sweeps`, `flyby-fleet` (53 s) in `test:node-slow`, `cam-avoid-vm` (31 s) in the game-vm groups.",
]
GAP_NOTES = [
 "Reviewer gap lists not carried as rows (low impact or unverified): render-1 lamp caps `MAST_LAMP_CAP`/`PIT_LAMP_CAP`/`CUSTOM_LAMP_MAX` and `selectCustomLamps` ties, `frame-math.mjs` `cullBoxes`/`marchGround`/flag thresholds, `elev-presets.js` loop closure; render-2 GLX partial-failure paths (`createTextureArray`/`createMesh`/`createChunkedMesh`), occlusion with mixed chunks, multi-draw UNSIGNED_INT, governor `cleanRace`, `PerfSpans.loaf()`, `renderer-picker.js` with no test file of its own; render-3 TLX WebGPU path and picker-driven backend switch, lit/sky WGSL compile.",
]
DEBUGGER = [
 "- **#2957 (open, claimed):** the js-debugger MCP filters to Chrome page targets, so `debugger_targets` returns `[]` for `node --inspect-brk` and attach fails \"Unknown page targetId\". Measured by tracks-1, render-2, race-2, render-3 and car-2 (render-1 too). Fix proposed in the issue: accept `type: \"node\"` targets, skip Page/DOM calls, a unit test that attaches to a child and reads a local, and the Node path in the js-debugger skill. Row DBG-01, lane L0.",
 "- **Reviewer workarounds** (three different ones in three batches, which is itself the finding): render-1 used `NODE_V8_COVERAGE` function counts only; render-2 a hand CDP client with `setBreakpointByUrl` and a logging condition; render-3 `setInstrumentationBreakpoint beforeScriptExecution` plus breakpoints matched by source-line text, which reaches vm scripts without a filename (`artifacts/test-review/render-3/cdpbp2.mjs`, uncommitted). L0 should take render-3's method as the reference.",
 "- **vm without filename (DBG-02):** the root cause of most `hit (coverage)` rows. A `filename:` on the test-helper loaders is the prerequisite for line breakpoints in pass 2.",
 "- **Node 22 flag (DBG-03):** `--experimental-test-isolation=none`, not `--test-isolation=none`.",
 "- **DEBUGGER-A** (`JS-DEBUGGER-IMPROVEMENTS-2026-10-19.md` in docs/notes on its own PR) and **DEBUGGER-B** (`NODE-DEBUGGING-2026-10-19.md` in docs/notes on its own PR, plus sub-issues of #2952): no PR open yet at this update; folded in when they land. Sub-issues of #2952 today: #2957 only.",
]
VERIFY = [
 "Synthesis spot checks (`git show origin/claude/f1-game-project-26h3ng:<file>`, tip cd907d4c unless noted):",
 "- Confirmed: R1-03 `insides >= 0`; R1-04 no `--expose-gc` in package.json or groups.json; R2-01 assert after `//` on perf-try:337 (e90ae858); R2-05 render-rate test asserts only `drawn === ticks`; R2-07 the `>= 52` wrapper and `return 0`; R3-01 `run(seed)` calls `A.reset(…, seed)`; R3-02 `__apexGlErrors` only on assets-api.spec:153; R3-03 `APEX_PERF_FRAMETIME_STRICT` set nowhere; R3-12 four modes in the loop; R1-10 flyby-shots in toolingFast.",
 "- Partly: R1-09 the `MAT_LAYERS = 17` / `[17]` literal is in 2 test files, not 5. R1-11 both limits exist (45 deg/s in `tests/helpers/flyby-audit-rules.mjs:19`, PAN_MAX 25 deg), but whether they measure the same thing is unproven, so it is ranked low.",
 "- Line drift: reported lines for render-rate (252 → 99) and lamp-fixture-anchor (302 → 330) differ on the tip; rows carry both. Reviewers worked on the 2026-10-19 tip; a pass-2 lane re-locates by the quoted code, not the line.",
 "- Not checked by the synthesis: rows marked `subagent-unverified` without a `synth_check` (R1-12…R1-15, R1-17, R3-07, R3-09, R3-14). They rank one point lower until a lane re-reads them.",
]
HIDDEN_BUG = {"R1-01": "tuner-panel.js scope buttons never set aria-pressed (shipped a11y bug)"}
