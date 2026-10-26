VERDICT: FIX — the profiling pointer teaches the wrapped tool, not the canonical profiler; camera ownership is split four ways; otherwise sound.
METRICS: SKILL.md 122 lines / 7259 B (~1.8k tokens) / description 296 chars / 7 references (656 lines, 35 KB; recipes.md 194 lines is the largest)
PATHS: OK (profile-gameloop, profile, flicker-gate, backend-compare, motion-capture, coplanar-audit.cjs, css-play, carshot, quick-validate, SCREENSHOT-TOOL-SPEED note all exist). Not checked: the `apex_*` MCP names and the tools named only in references.
COMMANDS: UNREAD (no tool run; the tools boot Chromium). Flags for shot.mjs, apex-eval and backend-compare not diffed against source.

WALKTHROUGH (task: profile a frame hog, then check camera lag)
- Profiling: SKILL.md:92 and references/perf-profile.md:7-9,67 send the agent to `tools/shot/profile-gameloop.mjs` ("Prefer"). They never name `tools/perf/profile.mjs` (modes spans|cpu|hitch|trace|step, --repeat, --base A/B). Its header has `@skill playwright-probe` (profile.mjs:4), and its `cpu` mode only wraps profile-gameloop (profile.mjs:12). Grep of the skill dir for `profile\.mjs` finds nothing. An agent follows the skill into the weaker tool and gets no noise floor or A/B. [NEW; confirms pass3 S8]
- Camera lag: cameras.md covers modes and orbit-vs-snapCam, but "lag measurement" is claimed by f1-animation-cameras (below) and no recipe here measures lag. The agent has to guess which skill to load.
- Launch: recipes.md §Backends points to the tools, which pin flags themselves. No hand-launch advice here.

SwiftShader flags (web-hosts-gpu W4)
- Matches in practice. The harness tools pass `--enable-unsafe-swiftshader`: probe-page.mjs:26-32 (comment on Chromium blocking automatic SwiftShader fallback), browser-workers.mjs:23.
- playwright.config.js:136-139 is the XR project only. The shared LAUNCH (config:24-47) has `--use-angle=swiftshader` WITHOUT `--enable-unsafe-swiftshader`. The repo does not rely on it config-wide, so W4's "config:136-139" cite covers only the XR leg.
- The skill never advises hand-rolled launch flags, so no contradiction. recipes.md:131-160 (custom-harness skeleton): it did not show flags in my grep. Check whether it launches via `chromium.launch()` with no args (a Chromium that blocks automatic fallback would fail). UNREAD past line 140.
- SKILL.md:62 says llvmpipe is CI-only and "fails fast"; config:64-70 and 335-338 agree.

Camera ownership (quoted from the descriptions)
1. playwright-probe: "...camera modes (cockpit/chase), or lag/framing. Not garage catalog, UI matrix, live canvas (mcp-probe)."
2. f1-animation-cameras: "Use when animation or camera motion needs work: garage pit-work arrivals, Flyby, broadcast cameras, follow-target blends, chase rigs, camera tuners, cuts that jump, WATCH/HIGHLIGHTS replay camera snaps... Lag measurement, stills, camera modes → playwright-probe."
3. tune-physics: "...Shake/juice → game-feel; camera lag → playwright-probe; steer sliders → input-controls; AI → ai-racecraft."
4. game-feel: "...Car behaviour wrong → tune-physics; camera lag → playwright-probe."
- Reading: playwright-probe is the sink for lag, modes and stills. f1-animation-cameras owns camera code and behaviour, and gives lag and modes back to playwright-probe. tune-physics and game-feel only redirect. This is consistent, not a fight. The collision is a single noun, "camera": playwright-probe's `cameras.md` describes the 20 modes (a reference doc) while f1-animation-cameras owns the code. A "chase camera too laggy" ask can route to any of the four. Suggest one sentence in each of the three redirectors saying "lag is MEASURED in playwright-probe, FIXED in f1-animation-cameras". [pass3 S10, STILL OPEN]
- The skills README row for playwright-probe (README:55) lists "camera modes, orbit() vs snapCam()", so the router and the description agree.

STRUCTURE
- Body is 122 lines, under the 500-line limit. References are one level deep, and every one is linked from the "Load on demand" list. car-viewer-presets.md is reached only via the car-studio bullet (SKILL.md:117). Fine.
- Description is a keyword list: "Use when batch headless screenshots/evals (...)". It lacks the user-typed words "screenshot of", "flicker", "FPS" and "profile" as a verb. Only "CPU profiles" and "lag/framing" appear. The `Not ...` tail is correct.
- Inconsistency: recipes.md:27 says "apex-capture cameras - 12 modes" and cameras.md:13 lists 20 modes. Probably the tool's subset, but unexplained. [NEW, low]
- SKILL.md:20-23 restates the playwright-official / css-play routing already in the description and in the README.
- Line-anchor / `~NNN` scan of recipes.md: no `file:NNN` refs found.

ENFORCEMENT
- SKILL.md:8-9 restates AGENTS.md rule 10 ("they never launch a browser (AGENTS.md rule 10, hook-enforced)"). It is already a pointer, so OK.
- The "never `pop`; the stack is shared" stash rule (SKILL.md:81) has no hook. It is prose only, and a fleet-shared stack makes a `git stash pop` a real risk. Candidate for a bash-guard rule, but that needs a Bryce grant (hooks).

GAPS (ranked)
1. SKILL.md:92 and references/perf-profile.md:7-9,67 — make `node tools/perf/profile.mjs <track> --mode spans|cpu|step --repeat 3 [--base <ref>]` the primary perf command; keep profile-gameloop as the raw `.cpuprofile` option. Add `profile.mjs` to the "Frame-budget hog" bullet at SKILL.md:111.
2. Camera lag routing — add "measured here, fixed in f1-animation-cameras" to the descriptions of f1-animation-cameras, tune-physics and game-feel, and give cameras.md a "Measuring lag" recipe (a lag recipe is missing from the reference).
3. recipes.md:27 vs cameras.md:13 — explain 12 vs 20 modes (one line).
4. Description (SKILL.md:3) — add "profile", "flicker", "frame time" so skill-hint matches.
5. recipes.md:131-160 — confirm the custom-harness skeleton passes `--enable-unsafe-swiftshader`, as probe-page.mjs does. UNREAD past line 140.

OUT OF SCOPE
- docs web-hosts-gpu W4 — cites playwright.config.js:136-139, which is only the XR project (config:132-139). The default LAUNCH (config:24-47) has no `--enable-unsafe-swiftshader`; the flag lives in tools/lib/browser-workers.mjs:23 and tools/shot/probe-page.mjs:26-32. Re-word the cite.
- .claude/skills/mcp-probe/SKILL.md — pass 3 S8 says it is the only skill naming profile.mjs; I did not re-read that file, so the claim is unconfirmed on the mcp-probe side.
