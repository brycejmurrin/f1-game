VERDICT: FIX — the loop and tool are accurate, but "who owns a row" sends a pause-chip edit to the wrong sheet, and the Sonnet pass's main gap points at the wrong rule.
METRICS: SKILL.md 95 lines / 5042 B (~1.3k tok); description ~270 chars; 3 references: loop.md 146/5997, restructure.md 62/3197, restructure-screens-css-rules.md 195/10582
PATHS: OK. Every cited path exists: css-play.mjs, playwright-mcp.sh, menu-screens.mjs, review-captures.mjs, gen-shell.mjs (`--check` at :341), select-specs.mjs, menu-baseline.spec.js, `test:baseline` (package.json:31), groups ui/gallery/baseline, DESIGN-TOOLS.md (both relative depths resolve), check-changes/references/bump.md, mcp-probe/references/traps-chrome.md, skill playwright-probe, css/{tuner,settings,settings-controls,tokens,carsetup,dialogs}.css.
COMMANDS: OK. Every flag cited (--list/--screen/--sel/--css/--inject/--click/--root/--viewport/--scale/--tokens/--desktop/--no-shot) is in parseCssPlayArgs (css-play.mjs:129-150). `--list` run: UNREAD. bash-guard refuses css-play.mjs in a subagent even for --list, although the source exits before launch (:461-470). Catalog read from source (:46-74).
WALKTHROUGH ("the pause menu chips need more padding on a phone in landscape (844x390)"):
- Routing is ambiguous. "padding/chip" matches css-play (SKILL.md:3), but "short landscape phone"/"touch layout" matches ui-menu-a11y (its SKILL.md:3), and SKILL.md:20 says "a short landscape phone → ui-menu-a11y". Either route ends up in the same loop.
- `css-play.mjs --screen pause --viewport 844x390` is correct (pause boots Monza, :55).
- FIRST WRONG STEP: loop.md:65-67 says "The pause menu … is `#pausemenu` in `css/dialogs.css`, compact-density rules included". The pause "chips" are the RACE TOOLS tray (`#pm-quick-doors button`, `#pm-checkpoint summary`; experience.css:18 calls them "chip-height tiles"). At 844x390 their padding is `padding-block: 2px` in css/experience.css:39-41 (landscape ≤500px), and their floor is `min-height: var(--tap)` in css/overlays.css:1062-1072 (≤400px). dialogs.css only owns the doors (RESUME/RESTART/SETTINGS/QUIT). An agent that edits dialogs.css and hot-swaps `--css css/dialogs.css` sees the chips unchanged.
- Nothing names the cheap node pin `tests/unit/pause-hud-layout.test.mjs`, which asserts the overlays.css tray rule (:87-89) and the dialogs.css floors. "Ship" (loop.md:121-123) jumps to "the ui / gallery group", which skips AGENTS.md's table: one spec first, and a whole group goes through `remote-group.mjs`.
STRUCTURE:
- Sizes are fine; no line over 400 chars.
- loop.md:33-48 copies the catalog. It is already stale (no `hud`/`hudpause`; aliases `main`, `paused`, `pausemenu`, `surveyhud` missing) and contradicts SKILL.md:43-44 ("read them from `--list` … not from this file").
- loop.md:50-51 "`--click` replaces the catalog path" is unqualified and conflicts with SKILL.md:39-41 and loop.md:138-140 (it replaces the path only with `--root`).
- loop.md:121 cites the bump.md link twice in one sentence (also at :104).
- SKILL.md:47 "`--help`/`--list` need none" is true for the code, but the guard still refuses both in a subagent.
- Hard don't 5 (SKILL.md:58-72) is ~15 lines of golden procedure. It is the right home, so keep it.
ENFORCEMENT:
- Hard don'ts 3 and "browser in subagent" are hook-enforced (bash-guard, mcp-browser-guard); the pointers are fine.
- Hard don't 5 (re-bless in the same commit) is prose only. The cited deploy-branch red shows it matters every time. Candidate: a pick-tests rule mapping type-metric edits in css/ to `baseline`, which needs a check that it is not already there.
- pause-hud-layout.test.mjs already pins the pause floors, so the skill should point at it rather than restate floors.
SONNET PASS — confirm/refute:
- REFUTED: its verdict says "dead sibling name (playwright-probe)". The skill exists, and its own PATHS line says so.
- REFUTED in substance: gap 1 (add `data-pause-layout="compact"` / `--look-pause-btn`). Those are opt-in player settings that land on <html> "only when it differs from the shipped look" (dialogs.css:310; js/ui/pause-opts.js:16). At 844x390 the shipped card uses the @media rules in experience.css/overlays.css, which it missed.
- CONFIRMED: gap 2 (a11y routing split) and gap 3 (Ship step thin).
- Gap 4 (restructure.md duplicate link) is trivial.
GAPS (ranked):
1. loop.md:65-67. Rewrite: "The pause card is `#pausemenu`. Doors (RESUME/RESTART/SETTINGS/QUIT): `css/dialogs.css` (short-landscape @media at :246 and :268). RACE TOOLS tray chips (`#pm-quick-doors button`, `#pm-checkpoint summary`): base and ≤500px-landscape padding in `css/experience.css:18-42`, ≤400px floors and 2-col grid in `css/overlays.css:1057-1073`. Pins: `node --test tests/unit/pause-hud-layout.test.mjs`. Player PAUSE MENU looks (`data-pause-layout`, `data-look-pause-*`) are opt-in overrides at dialogs.css:377-452."
2. loop.md:119-123 Ship. Rewrite: "Run the node pin for the sheet (pause: pause-hud-layout.test.mjs), then `node tools/ci/pick-tests.mjs` / `select-specs.mjs` and run the ONE spec they name. A whole group goes through `node tools/ci/remote-group.mjs` (AGENTS.md §Verification). Type-metric edits: hard don't 5." Drop the duplicate bump.md link.
3. loop.md:33-51. Replace the catalog table with "`--list` prints the catalog (ids, roots, door clicks; source `SCREENS` in css-play.mjs:46)". Fix :50-51 to "with `--root`, `--click` replaces the catalog path".
4. SKILL.md:20-21. Rewrite: "A named-screen tweak (padding, gap, chip size) stays here at any viewport, phone included; a screen that clips or overflows → ui-menu-a11y." Mirror it in ui-menu-a11y's description so "short landscape phone" stops competing.
5. SKILL.md:47. Rewrite: "`--help`/`--list` launch no browser (the subagent guard still refuses them; the catalog is `SCREENS` in css-play.mjs)."
OUT OF SCOPE: .claude/hooks/bash-guard.sh — refuses `css-play.mjs --list`/`--help` in subagents although css-play.mjs:461-470 exits before launchChromium (could allow-list help/list).
