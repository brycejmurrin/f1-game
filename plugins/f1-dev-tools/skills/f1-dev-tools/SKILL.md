---
name: f1-dev-tools
description: "Use for brycejmurrin/f1-game (Apex 26) scene reproduction, camera diagnostics, before/after visual comparison, WATCH replay transition checks, or camera preset preview and export. Requires a game checkout and local browser execution; exclude generic F1 questions and other games."
---

# F1 Dev Tools

Use the game's existing Apex tools and camera tuner. This plugin supplies a workflow and executable helpers, not a hosted game or a new renderer. All five workflows are described in [workflows.md](references/workflows.md).

## Start

1. Locate the requested `brycejmurrin/f1-game` checkout. Read its `AGENTS.md`, `docs/AGENT-SURFACE.md`, `docs/DEBUG-HOOKS.md` and applicable local skills. Check overlapping work before editing game source. Use the existing animation/camera skill for an implementation change.
2. Query the existing `apex_status`, `apex_catalog` and `apex_doctor` tools, or from the checkout run `bash tools/mcp/apex-tools-mcp.sh call apex_status '{}'` (and likewise for catalog/doctor). A missing attached MCP is not a reason to rebuild it: preserve the repo's three-server catalog and use its documented CLI fallbacks.
3. Serve the working checkout at localhost. Use one disposable browser profile and one browser process at a time. Read `.claude/skills/mcp-probe/SKILL.md` for live browser work or `playwright-probe` for batch capture. Prefer the available browser tools; use the repo harness when they are absent. Do not start a browser alongside a running Playwright suite.
4. On the actual game page call `__apex.agentHelp()` once and establish page/build identity. Read `scripts/browser.js` from this skill and evaluate its source on that page. The helper creates `globalThis.F1Dev`; it does not modify game source. Keep the same page for multi-step probes.
5. Save JSON and screenshots under the checkout's `artifacts/` or `scratch/`. Record commit, renderer, viewport, real versus synthetic replay data, and reduced-motion setting with each run. Do not store credentials or career saves in reports.

## Choose a workflow

| Request | Helper / route |
|---|---|
| Reproduce a scene | `F1Dev.capture()` and `await F1Dev.restore(scene)`; team/halo require the documented boot setup |
| Inspect game state | `F1Dev.inspect()` and `await F1Dev.trace({frames:12})` |
| Compare a change | Matching traces and opening/middle/end PNGs; `scripts/compare.mjs` produces metrics and an HTML comparison |
| Check WATCH transitions | Start the real Data Hub WATCH flow, then `await F1Dev.replayCheck(actions)`; also exercise a real user control and exit/re-entry |
| Tune/export presets | Existing game Camera Tuner UI; `F1Dev.previewPreset(mode, values)` returns a native preset pack without persisting it |

Read the linked workflow before running the helper. Never infer a successful restore from a screenshot, or smooth motion from physics stepping, a VM, or one still frame. Preserve camera ownership and driving preferences. `camTune()` persists immediately: the preview helper instead uses the current raw `CamTune` pack, mutates it synchronously in memory, and restores it in `finally` without a storage write.

## Finish

Report the artifact locations and checks that actually ran. Separate helper/VM validation, rendered browser evidence, PR CI, and deployment. Do not claim that creating this plugin fixes an unspecified game bug. A source change must follow the checkout's test and PR rules; this package does not authorize merging or installing unrelated plugins.
