---
name: runtime-hunt
description: "Use when a session hunts bugs by RUNNING the game: leaks or hitches across race restarts, slow race entry, scripted menu play that ends black or throws, needs-browser rows. Not for: one breakpoint → js-debugger; a static slice hunt → code-hunter."
---

# Runtime hunt — find bugs by running the game

A SESSION playbook, never a subagent: a subagent never starts a browser (AGENTS.md rule 10; hooks `bash-guard.sh`,
`mcp-browser-guard.sh`). The static half is agent `code-hunter` (read-only, no browser); its rows tagged
`runtime: needs-browser`, and `finding-verifier`'s NEEDS-BROWSER verdicts (the `needsBrowser` list of the
`code-survey` / `total-audit` workflows), are this skill's input queue. Findings only: each fix comes later in its own PR, which takes D-047's
`pr-reviewer` step before ready.

## Order — both modes

1. **Prior art.** Agent `prior-art-scout` on the topic (perf/leak or the flows you will drive): its KNOWN rows are
   the do-not-re-report list.
2. **One browser.** `apex_status` first; one browser at a time (AGENTS.md rule 5): no `browser_*` tab beside a
   chrome-devtools page, never beside a Playwright run. js-debugger attaches to the shared debug Chromium
   (`apex_debug_chrome`, CLI `node tools/mcp/debug-chrome.mjs start --headless-game`); it never launches one, and
   it never runs beside chrome-devtools (skill `js-debugger`), and `apex_track` holds the browser lock while open
   (docs/AGENT-SURFACE.md): a mode that needs two runs them as separate PASSES (detach, stop that Chrome, then open
   the next).
   Long runs go through `apex_job_start` / `apex_job_status {wait}` (rule 4), not a foreground wait.
3. **Hunt** in one mode (below); each suspect gets a repro you ran, its numbers and the file:line you traced with
   `apex-lsp` (skill `code-nav`).
4. **Verify.** Agent `finding-verifier` on every claim (≤ 15 per call). Only CONFIRMED rows rank; NEEDS-BROWSER
   rows you could not settle stay in the note, named.
5. **Write** `docs/notes/RUNTIME-HUNT-<MODE>-<YYYY-MM-DD>.md` (Pacific date) with the ranked table below and the
   build sha you ran; ship it as a draft PR (skill `steward` §Open). Detach js-debugger, close the page.

| # | Repro (exact calls) | file:line | Mechanism (trigger → effect) | Player impact | Fix sketch | Test that would catch it |
|---|---|---|---|---|---|---|

Rank by player impact (crash/black > freeze/hitch > leak growth > log noise); a number without the command that
produced it is `est.`

## Mode A — perf / leak

Pass 1, js-debugger attached: `debugger_profile` cpu / heap / hitch, `debugger_listeners`, `debugger_instances`.
Pass 2, chrome-devtools: `take_heapsnapshot` → `compare_heapsnapshots` → `get_heapsnapshot_retainers`. Also `apex_profile`
(frame budget, CPU/copy spans), `apex_job_start` kinds `memory_census` / `gpu_memory_census` / `vm_lifecycle`,
`apex-lsp`. Repeat-loop design, the hooks to read and the leak bar: [references/perf-leak.md](references/perf-leak.md).

## Mode B — scripted play

Tools, one browser per pass: js-debugger attached (`debugger_evaluate` for `__apex` calls and `.click()` on the
real `index.html` menu ids, `debugger_exception_log` / `debugger_exceptions` for throws), OR a chrome-devtools page
(`click`, `evaluate_script`, `list_console_messages`), OR `apex_track` (a persistent headless `__apex` session); `apex-lsp`.
The flow list, the per-transition read-out and the black-garage calibration case:
[references/scripted-play.md](references/scripted-play.md).

## GPU — what this box can say

This container has no real GPU: Chromium runs SwiftShader and renderers blit onto `#game-soft` (AGENTS.md §Seeing
the game). GPU times and fps here are RELATIVE only (A vs B on the same box, same run). Real-GPU evidence comes
from two places the hunter does not drive itself:
- `gpu-census.yml` on `macos-latest` (the one real GPU image): a dispatch is the orchestrator's act (skill
  `steward` §CI). Write the exact inputs (`track`, `images`, and for mode A `entry` and `mem_cycles`, the RACE > QUIT memory
  cycles) in the note's **Hand-off** section.
- Bryce's iPhone through skill `phone-bridge` (the orchestrator sends): emit the exact ` ```apex-cmd ` bodies, e.g.
  `{"cmd":"frames","args":{"seconds":20}}`, `{"cmd":"path"}`, `{"cmd":"call","args":{"method":"raceEntryStages","args":[]}}`
  (only methods in the bridge's `CALL_OK`; heap and long tasks read 0 or null on iOS: phone-bridge §Cannot measure).

## Worked examples

The first runs, 2026-11-24: the `RUNTIME-HUNT-PERF-2026-11-24` (mode A) and `RUNTIME-HUNT-PLAY-2026-11-24`
(mode B) notes under `docs/notes/`, once their PRs land.
