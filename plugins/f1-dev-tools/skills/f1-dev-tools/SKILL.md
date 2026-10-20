---
name: f1-dev-tools
description: "Use for brycejmurrin/f1-game (Apex 26) UI inspection and diffs, CPU profiling, heap/memory/leak diagnosis, GPU/graphics diagnostics, garage angles and car parts, JS navigation/debugging, scene reproduction, camera comparison, WATCH replay checks, or preset preview/export. Requires a game checkout; rendered workflows need local browser execution; exclude generic F1 questions and other games."
---

# F1 Dev Tools

Use the game's existing Apex tools and camera tuner. This plugin supplies a workflow and executable helpers, not a hosted game or a new renderer. The camera/replay helpers remain in [workflows.md](references/workflows.md). Focused routes are in [UI inspection](references/ui-inspection.md), [profiling, memory, graphics and debugging](references/profiling.md), and [garage angles and parts](references/garage-parts.md). The plugin advertises the checkout's five configured MCP servers; their names and commands remain owned by `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml`.

## Start

1. Locate the requested `brycejmurrin/f1-game` checkout. Read `AGENTS.md` once and the applicable local skill. Use the relevant routing/boot section of `docs/AGENT-SURFACE.md`; read only the hook section needed from `docs/DEBUG-HOOKS.md`, whose generated index is a lookup resource. For symbol navigation, start with `code-nav`; do not concatenate entire manuals, modules and test files into one response. Check overlapping work before editing game source. Use the existing animation/camera skill for an implementation change.
2. Before the first local tool probe, have one owner run `bash tools/env/ensure-mcp-ready.sh` once per source/dependency revision. Artifact-only workers may reuse the parent capability receipt when its checkout head, dependencies and endpoints match; recheck after a failure or capability change. This is idempotent and verifies the wrappers, MCP smoke path and Chromium discovery; add `--strict` when missing local dependencies should fail the workflow. It cannot attach host MCPs or change trust/global settings.
3. Have that owner query the existing `apex-tools` MCP (`apex_status`, `apex_catalog` and `apex_doctor`), or from the checkout run `bash tools/mcp/apex-tools-mcp.sh call apex_status '{}'` (and likewise for catalog/doctor). A missing attached MCP is not a reason to rebuild it: preserve the repo's configured server catalog and use its documented CLI fallbacks.
Inspect MCP `tools/list` and returned input schemas before newer routes: the package version does not upgrade the checkout. Distinguish attached host tools from CLI fallbacks in evidence.
4. **Rendered workflows only:** serve the working checkout at localhost. Use `playwright-official` for navigation, DOM checks and screenshots, or `chrome-devtools` for live console, network, heap and performance inspection. Use one browser MCP, one disposable browser profile and one browser process at a time. Read `.claude/skills/mcp-probe/SKILL.md` for live browser work or `playwright-probe` for batch capture. Prefer the available browser tools; use the repo harness when they are absent. Do not start a browser alongside a running Playwright suite.
5. **Rendered workflows only:** on the actual game page call `__apex.agentHelp()` once and establish page/build identity. Read `scripts/browser.js` from this skill and evaluate its source on that page. Call `F1Dev.diagnose()` first; it records the exact URL, page lifecycle/visibility, service-worker controller, API manifest, build and renderer identity in one read-only document. The helper creates `globalThis.F1Dev`; it does not modify game source. Keep the same page for multi-step probes.
6. Save JSON and screenshots under the checkout's `artifacts/` or `scratch/`. Record commit, renderer, viewport, real versus synthetic replay data, and reduced-motion setting with each run. Do not store credentials or career saves in reports. If a browser MCP is unavailable, use the documented local Playwright/Chrome harness; do not start a duplicate MCP server.

For source-level inspection, use the existing `js-debugger` MCP on the parent's
same authorized local Chrome page, following `docs/research/AGENT-JS-DEBUGGER-MCP.md`.
The shell fallback is its persistent `js-debugger-mcp.sh serve-http` daemon with
separate `call debugger_*` clients. Do not launch another browser. Read the fresh
pause token after each step, resume before dependent browser actions, and detach
when finished. This route inspects JavaScript; it is not GPU profiling.

To find where a symbol is defined or used, ask the `apex-lsp` MCP (`lsp_definition`,
`lsp_references`, `lsp_callers`, `lsp_outline` with `Name` or `Head.member`) before
grepping, and `lsp_diagnostics` after an edit; the shell fallback is
`tools/mcp/lsp-mcp.sh def|refs|callers|outline|diag <name>`.

## Choose a workflow

| Request | Helper / route |
|---|---|
| Inspect UI / compare snapshots | [UI workflow](references/ui-inspection.md); capability-detected `apex_ui_inspect` / `apex_ui_diff` |
| Profile CPU / frames / heap / leaks / graphics | [Profiling workflow](references/profiling.md); `apex_profile`, `apex_profile_query`, capability-detected `apex_diagnostics` |
| Inspect garage angles / car parts | [Garage workflow](references/garage-parts.md); `apex_garage`, `apex_car_audit`, catalog discovery and bounded jobs |
| Reproduce a scene | `F1Dev.capture()` and `await F1Dev.restore(scene)`; team/halo require the documented boot setup |
| Identify the page and release | `F1Dev.diagnose()` before `F1Dev.inspect()` and `await F1Dev.trace({frames:12})` |
| Verify published assets | `await F1Dev.checkAssets(["/version.json", "/js/game.js?v=..."])` and compare returned byte hashes with the claimed manifest |
| Check storage pressure | `await F1Dev.storageReport()`; record the estimate and key sizes, never saved values |
| Inspect game state | `F1Dev.inspect()` and `await F1Dev.trace({frames:12})` |
| Compare a change | Matching traces and opening/middle/end PNGs; `scripts/compare.mjs` produces metrics and an HTML comparison |
| Check WATCH transitions | Start the real Data Hub WATCH flow, then `await F1Dev.replayCheck(actions)`; also exercise a real user control and exit/re-entry |
| Tune/export presets | Existing game Camera Tuner UI; `F1Dev.previewPreset(mode, values)` returns a native preset pack without persisting it |

Browser-owning tools share the repository lock. Close persistent garage/track sessions or cancel and wait for background jobs to exit before another browser workflow. Do not nest them inside an existing debugger/browser session. Use local targets; arbitrary shell/eval and unbounded suites stay out of typed MCP routes.

Read the linked workflow before running the helper. Never infer a successful restore from a screenshot, or smooth motion from physics stepping, a VM, or one still frame. Preserve camera ownership and driving preferences. `camTune()` persists immediately: the preview helper instead uses the current raw `CamTune` pack, mutates it synchronously in memory, and restores it in `finally` without a storage write.

## Finish

Report the artifact locations and checks that actually ran. Separate helper/VM validation, rendered browser evidence, PR CI, and deployment. Do not claim that creating this plugin fixes an unspecified game bug. A source change must follow the checkout's test and PR rules; this package does not authorize merging or installing unrelated plugins.
