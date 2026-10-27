---
name: f1-dev-tools
description: "Use for brycejmurrin/f1-game (Apex 26) UI inspection and diffs, CPU profiling, heap/memory/leak diagnosis, GPU/graphics diagnostics, garage angles and car parts, JS navigation/debugging, scene reproduction, camera comparison, WATCH replay checks, or preset preview/export. Uses the connected F1 Cloud MCP workspace or an attached executor; rendered workflows need a browser in that environment; exclude generic F1 questions and other games."
---

# F1 Dev Tools

## Choose the host and execution route first

Use the existing F1 Cloud MCP app connection first. This account package declares no local stdio servers and does not require a desktop process launcher. Retained bridge scripts are optional executor helpers, not startup requirements.

1. Discover actual exposed tools; names can carry the host prefix `mcp__codex_apps__f1_cloud_mcp_`. Match the suffix and inspect its input schema. A configured server, installed skill or example tool name does not prove attachment.
2. **Working hosted route:** call the exposed `apex_status` before workspace/browser work. Use bounded `apex_help` schema lookups, relevant `apex_catalog` IDs and `apex_doctor` prerequisites as needed. A successful hosted read does not require a local executor, dependency install, local MCP launch or tunnel restart. The status returned by a current call is evidence only for the capability it checked.
3. **Attached executor or local fallback:** read Cloud Environment runtime guidance and check the attached environment before local work. Resolve the intended checkout; `/workspace/f1-game` is the prepared cloud checkout, not a universal path. Verify its identity and read its AGENTS.md before edits. Use one owner's reusable preflight receipt as described in [readiness](references/readiness.md). Browser localhost refers to the environment hosting that browser, not the user's desktop.
4. Prefer the connected gateway over duplicate MCP/tunnel processes. Use documented checkout CLI fallbacks for a missing capability with an explicit workdir. For stale-session recovery, retain the lifecycle route in [environment.md](references/environment.md); startup is not an instruction to install dependencies, replace credentials or recreate app/tunnel identities.
5. Browser work belongs to one parent/owner and follows the checkout's occupancy/lock rules. Close/release the owned gateway browser before switching modes; do not give browser startup to parallel children. Save evidence under that checkout's artifacts/ or scratch/.
6. If tools are absent, unauthorized or fail, report the observed missing capability and supported fallback. Installing skills cannot authorize or create a tunnel. A saved package, local readiness, successful hosted calls and rendered behavior are separate checks; package text alone establishes no current Cloud state.

Use the game's existing Apex tools and camera tuner. This plugin supplies a workflow and executable helpers, not a hosted game or a new renderer. The camera/replay helpers remain in [workflows.md](references/workflows.md). Focused routes are in [UI inspection](references/ui-inspection.md), [profiling, memory, graphics and debugging](references/profiling.md), and [garage angles and parts](references/garage-parts.md). The connected gateway supplies its available tools; the checkout's server declarations are configuration, not evidence of host attachment.

## Start

1. For work that needs a checkout, locate the requested `brycejmurrin/f1-game` worktree. Read `AGENTS.md` and the applicable local skill; reuse an unchanged read receipt only for the same resolved worktree, source/revision and range, preserving required instruction reads. Use the relevant routing/boot section of `docs/AGENT-SURFACE.md`; read only the hook section needed from `docs/DEBUG-HOOKS.md`, whose generated index is a lookup resource. For symbol navigation, start with `code-nav`; use bounded definitions/search pages and retrieve omitted saved ranges instead of repeating a whole read. Do not concatenate entire manuals, modules and test files into one response. Check overlapping work before editing game source. Use the existing animation/camera skill for an implementation change.
2. **Local probes only:** have one owner perform the required preflight, keyed by resolved cwd/worktree, checkout HEAD and relevant dirty-source state, dependency fingerprint and non-secret endpoint/service identities. Artifact-only workers reuse the matching parent receipt; invalidate it after a relevant revision/dependency/endpoint change or an observed capability failure. For prepared cloud recovery use [environment.md](references/environment.md); for a checkout CLI route use its documented `bash tools/env/ensure-mcp-ready.sh` check once, with `--strict` when missing prerequisites must fail. Inspect failures before the documented repair/install path; do not install as routine startup. A receipt cannot attach host MCPs or change trust/global settings. Details: [readiness.md](references/readiness.md).
3. Use the selected route's status/schema/catalog answers; do not repeat a successful hosted status merely because a local owner starts work. For a local fallback, run from the resolved checkout: `bash tools/mcp/apex-tools-mcp.sh call apex_status '{}'` (and catalog/doctor only when needed). A missing attached MCP is not a reason to rebuild it: preserve the configured server catalog and use documented CLI fallbacks.
Inspect MCP `tools/list` and returned input schemas before newer routes: the package version does not upgrade the checkout. Distinguish attached host tools from CLI fallbacks in evidence.
4. **Rendered workflows only:** the parent/browser owner serves the working checkout at localhost. Use `playwright-official` for navigation, DOM checks and screenshots, or `chrome-devtools` for live console, network, heap and performance inspection. Use one authorized browser route/profile/process at a time; keep an existing managed page when supplied, or use the documented disposable local profile. Read `.claude/skills/mcp-probe/SKILL.md` for live browser work or `playwright-probe` for batch capture. Prefer available browser tools; use the repo harness when absent. Children may inspect source/artifacts without starting another browser. Do not start a browser alongside a running Playwright suite.
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

For finite tools/jobs, preserve their native job ID, status and source identity. Pending work, expected no-match, monitor deadline, interrupted work and terminal failure are different outcomes. A wait deadline or wrapper exit alone does not prove the underlying run failed or ended; inspect the owned runner and its supported terminal verdict before restarting. Verify the expected artifact and acceptance evidence before reporting completion. Keep the original status/error visible and do not invent unsupported server fields. See [readiness.md](references/readiness.md#jobs-waits-and-completion) and, for Codex child/host boundaries, [Codex workflows](../f1-agent-coordination/references/codex-workflows.md).

Read the linked workflow before running the helper. Never infer a successful restore from a screenshot, or smooth motion from physics stepping, a VM, or one still frame. Preserve camera ownership and driving preferences. `camTune()` persists immediately: the preview helper instead uses the current raw `CamTune` pack, mutates it synchronously in memory, and restores it in `finally` without a storage write.

## Finish

Report the artifact locations and checks that actually ran, with source/worktree and terminal verdict where relevant. Separate a package update, local/helper validation, hosted calls, rendered browser evidence, PR CI, and deployment. A current successful status read does not establish all tools, real-device behavior or a release. Do not claim that creating this plugin fixes an unspecified game bug. A source change follows the checkout's test and PR rules; this package does not authorize merging or installing unrelated plugins.



## Prepared executor recovery

Read [prepared environment recovery](references/environment.md) for the prepared
cloud checkout, lifecycle commands, runtime bindings and stale-session recovery.
Use [readiness receipts](references/readiness.md) to select the route and reuse
valid local checks; a working hosted read is not blocked on local installation.
