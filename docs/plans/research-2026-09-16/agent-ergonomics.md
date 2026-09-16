# Agent ergonomics — what Apex 26 should adopt next (2026-09-16)

Read-only pass. Base: `AGENTS.md` (200 lines), `.claude/settings.json` (3 hooks,
1 allow list, 3 MCP servers), 26 skills, 5 subagents, 2 path-scoped rules.
Goes **beyond** `docs/plans/2026-09-16-process-speedup-next.md` items 10–13.
Every capability checked against the live docs today. **[U] = unverified here.**

| # | Item | Effort | Saving (est.) | Risk |
|---|---|---|---|---|
| 1 | `if:` filters + `async` on the existing hooks | 30 min | ~90 % of hook spawns | low |
| 2 | SessionStart `additionalContext` = branch/CI/run state | 1 h | 3–6 calls/session | low |
| 3 | `Stop` hook: no turn ends over a live run | 2 h | 1 lost batch + 1 hidden red/wk | med |
| 4 | Cost ledger from PostToolUse/SubagentStop hooks | 3 h | makes §0 continuously measurable | low |
| 5 | `defaultMode: "auto"` + sandbox (supersedes plan 10) | 1 h | 10–30 prompts/session | med |
| 6 | AGENTS.md re-cut, 200 → ~120 lines | 3 h | ~1.2 k tokens/turn | med |
| 7 | Machine-first `docs/agent-index.json` | 4 h | 10–40 k tokens/session | low |
| 8 | `context: fork` on the four noisy skills | 1 h | 5–25 k tokens/invocation | low |
| 9 | `async` PostToolUse check after a source edit | 2 h | 1 red guard per 3 commits | med |
| 10 | Runner verification + webhook wake (extends plan 6) | 1 day | 25 min → 4 min per group | med |
| 11 | Subagent `memory: project` | 1 h | a `--base` worktree per re-diagnosis | low |
| 12 | `WorktreeCreate` hook + `worktree.baseRef: "head"` | 1 h | the stale-base incident class | low |
| 13 | `allowed-tools` + `` !`cmd` `` in SKILL.md | 2 h | prompts; 1 call/skill load | low |
| — | Agent teams | — | **do not adopt** | — |

---

### 1. `if:` filters and `async` on the three existing hooks
Handlers accept `"if": "Bash(git commit *)"` (permission-rule syntax, tool
events only) and `async`/`asyncRewake`. Doc: /docs/en/hooks.
**Fit.** `bash-guard.sh` spawns bash+python3 on **every** Bash call (30 ms
measured, plus spawn) for three questions that apply only to `git commit`,
`pkill`, `kill <pid>`; `protect-files.sh` runs a `ps -eo args` scan plus three
`git rev-parse` calls on every edit.
**Plan.** Split into `if:`-gated handlers, e.g. `{"type":"command","if":"Bash(git
commit *)","command":".../bash-guard.sh","args":["commit"],"timeout":180}` plus
`if:"Bash(pkill *)"` and `if:"Bash(kill *)"` at a 10 s timeout; `bash-guard.sh`
reads `$1` as the mode. `if:` is a prefix matcher, not a parser, so keep one
unconditional handler that only greps a compound (`foo && git commit`) and is
otherwise a no-op — the scripts' own regexes stay as defence in depth. Never put
`async` on a blocking hook: its block is advisory, its timeout unenforced.
**Verify.** `tests/unit/agent-config.test.mjs:99-117` already asserts each
event/matcher/command triple; extend it to check every `if:` parses and the
commit path stays reachable. Count `hook_started` stream events over 50 greps.
**Saving.** ~90 % of hook process spawns [U].
**Risk.** An `if:` narrower than the script's regex silently disables a guard —
the compound-catcher above is the mitigation.

### 2. SessionStart hook that prints the state sessions rediscover by hand
SessionStart supports `hookSpecificOutput.additionalContext`.
**Fit.** `session-start.sh` prints install status only. Every session then
spends 3–6 calls on `git branch`, `git log`, `git status -sb`, `ps`,
`/proc/loadavg`, and (per plan B7) a live-CI lookup.
**Plan.** Emit `{"hookSpecificOutput":{"hookEventName":"SessionStart",
"additionalContext":"…"}}` instead of the bare status line, ≤8 lines: branch;
ahead/behind `origin/claude/f1-game-project-26h3ng` (`git rev-list --count`,
cached ref, no blocking fetch); dirty count; `/proc/loadavg`; `pgrep -fc
'playwright test'`; the existing install status.
**Verify.** `/context` shows the block; a unit test asserts parseable JSON.
**Saving.** 3–6 tool calls (~1–2 k tokens)/session, and removes the "which
branch / is a run live" class of error at turn 1.
**Risk.** Goes stale in a long session — label it "at session start".

### 3. A `Stop` hook that will not end a turn over a live run
`Stop` fires when Claude finishes responding; exit 2 blocks and the stderr
reaches the model; `additionalContext` notes without blocking.
**Fit.** AGENTS.md rules 4/5/9 and plan item 15 are prose. The two measured
incident classes — a push over a live `ci.yml` run (9/59 cancelled, 2 of 3 hid
a real failure) and a turn ending mid-browser-group — are mechanical checks.
**Plan.** `.claude/hooks/stop-guard.sh` on `Stop` (no matcher):
- live `playwright test` / `run-playwright.mjs` in `ps` → **exit 2**: "anchor on
  `grep -E '= run (passed|failed|timedout|interrupted)'` in `artifacts/logs/`,
  or `test-bg.mjs --stop`".
- unpushed commits on `claude/*` **and** a green `verify-change` artifact →
  `additionalContext` only: "push once per verified batch".
- a live `ci.yml` run on the branch (reuse `verify-change`'s 3 s unauthenticated
  lookup, cached) → `additionalContext`.
Exactly one blocking condition. Escape hatch `touch .claude/allow-stop`
mirroring `allow-protected`; a stamp keyed on `session_id`+`prompt_id` so it
cannot block the same turn twice.
**Verify.** Synthetic JSON + a fake `ps`; assert exit 2 only in case 1.
`agent-config.test.mjs` gets a `Stop` row and its escape-hatch assertion.
**Saving.** One lost batch (10–40 min) and ~1 hidden-red per week [U].
**Risk.** A wrongly-blocking Stop hook is the worst failure mode available —
keep it to one `ps` grep.

### 4. A per-session cost ledger written by hooks
`PostToolUse`, `PostToolUseFailure`, `SubagentStop`, `SessionEnd` all carry
`session_id`, `tool_name`, `tool_input`, `tool_use_id`.
**Fit.** Every number in the research note's §0 table was measured by hand,
once. A ledger turns "is the process getting faster?" into a query.
**Plan.** `.claude/hooks/ledger.sh`, `async: true`, on `PostToolUse` (matcher
`Bash|Task|Edit|Write`), `PostToolUseFailure`, `SubagentStop`, `SessionEnd`: one
JSONL line to `artifacts/ledger/<session_id>.jsonl` —
`{ts,event,tool,agent_type,cmd_head,exit,ms}`, `cmd_head` capped at 60 chars,
never the full input; `ms` from a `PreToolUse` companion stamping
`artifacts/ledger/.t/<tool_use_id>`. `tools/ci/ledger-report.mjs` then prints
tool-call count, Bash seconds by command family, browser minutes (`test-bg`
spans), subagent count, permission denials.
**Verify.** Scripted turn → one row per tool call; `ledger-report --json`
matches a known transcript.
**Saving.** No minutes directly; it is the instrument that lets 1/5/9 be
measured rather than asserted — §0 becomes `npm run ledger`.
**Risk.** Async hooks have no enforced timeout: keep it to one `printf >>`.

### 5. Permissions: `auto` mode + sandbox, not a longer allowlist
`permissions.defaultMode: "auto"` runs a classifier instead of prompting;
`autoMode.allow/deny` tunes it. `sandbox.enabled` (Linux/bwrap) with
`sandbox.autoAllowBashIfSandboxed` runs Bash unprompted inside a filesystem +
network jail. Docs: /docs/en/settings-reference, /permission-modes, /sandboxing.
**Fit.** Plan item 10 is a 40-entry allowlist someone must paste and maintain.
`auto` + sandbox gets the same effect without enumerating.
```json
"permissions": { "defaultMode": "auto", "deny": [
  "Bash(git push --force*)", "Bash(git push -f *)",
  "Bash(node tools/ci/bump-cache.mjs --apply*)", "Bash(node tools/gen/assets.mjs bake*)",
  "Bash(node tools/track/rotate-markings.cjs --write*)" ] },
"sandbox": { "enabled": true, "autoAllowBashIfSandboxed": true,
  "network": { "allowedDomains": ["registry.npmjs.org","api.github.com","github.com","127.0.0.1"], "strictAllowlist": true },
  "excludedCommands": ["npx playwright install", "npm install"] },
"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "0" }
```
Keep plan 10's `allow` list too — an allow rule short-circuits the classifier
and is cheaper. Keep plain `git push` prompting (the deploy rule depends on it).
**Verify.** `agent-config.test.mjs` already requires a `test:*` allow entry; add
that `deny` holds the five destructive rules and `defaultMode` is not
`bypassPermissions`. Then one `verify-change --wait` under the sandbox.
**Saving.** 10–30 prompts/session (the note's own figure).
**Risk.** Playwright binds localhost and writes `artifacts/`, so the sandbox
needs `allowLocalBinding` and a writable path — land `auto` first, sandbox only
behind a measured browser run. The last session's settings write was refused as
self-modification, so this may need a person.

### 6. Re-cut AGENTS.md: 200 lines / 12,530 chars / ~3.1 k tokens → ~120 lines / ~7.4 kB / ~1.9 k
Measured today (chars): Key commands 555 · **Verification 3,834** · Seeing the
game 1,092 · Layout 1,290 · Conventions 1,380 · Physics 709 · Asset pack 383 ·
`__apex` 338 · Agent extensions 947 · Cursor Cloud 459 · Git 1,036. (The note's
"2.2 k tokens" looks low; 12.5 kB of prose is ~3.1 k. [U])

**Keep always-loaded (~7.4 kB):** Key commands; the Verification table's first
three rows plus the eleven session rules trimmed to imperatives; Layout;
Conventions; Physics' two binding rules; Git & deploy.
**Move to `.claude/rules/` (`paths:` frontmatter, loads on a matching read):**
`render-backends.md` ← the webgpu/three row + §Seeing the game's boot-evidence
and `#game-soft` paragraph, `paths: ["js/render/**"]`; `circuits.md` ← the
one-circuit row, `_sceneryShift`, coordinates, `paths: ["js/circuits/**","js/track/**"]`;
`assets.md` ← §Baked asset pack; `generated.md` ← rule 11's list,
`paths: ["index.html","sw.js","package.json","tools/manifest.cjs"]`.
**Move to skills/docs:** §Seeing the game's remainder → `agent-view` SKILL.md;
§`__apex` → one line pointing at `agentHelp()`; §Cursor Cloud →
`docs/AGENT-SURFACE.md` §Bootstrap (which already says all of it).
**Constraints.** `agent-config.test.mjs:36` caps AGENTS.md at 200 lines
(tighten to 130), `:42` caps bold spans at 3, `:84-90` requires every
`.claude/rules/*.md` to have a `.cursor/rules/*.mdc` twin with matching globs
and `alwaysApply: false`. Each new rule needs both sides plus a test row.
**Saving.** ~1.2 k tokens per turn, every turn.
**Risk.** A path-scoped rule fires when Claude *reads a matching file* — a
session that edits `js/circuits/monza.js` without reading it first misses it.
Keep anything unsafe by absence (the curvature-sign rule) always-loaded; move
only the procedural half. Confirm each rule fires once with the
`InstructionsLoaded` hook.

### 7. Machine-first manifests: one `jq` instead of a 4.7 k-line read
Just-in-time retrieval over pre-loading; lightweight identifiers the agent
expands on demand. Doc: anthropic.com/engineering/effective-context-engineering-for-ai-agents.
**Fit.** `docs/DEBUG-HOOKS.md` is 4,719 lines and `docs/TESTING.md` 1,407, both
named "the reference" in AGENTS.md. Plan 12 splits them; an index removes the
need to read either in the common case.
**Plan.** `tools/gen/gen-agent-index.mjs` → `docs/agent-index.json` (generated,
so `protect-files.sh`'s GENERATED map and `generated-docs --check` gain a row),
four tables from existing sources: `hooks[]` from `__apex.agentHelp()`;
`groups[]` from `tests/groups.json` (files, declared tests, twinned?);
`circuits[]` from `tools/manifest.cjs` + `Tracks.LIST`; `modules[]` from the
manifest (path, global, load order, ratchet). `tools/shot/agent.mjs help <hook>`
and `pick-tests --index` read it; AGENTS.md points at the *query*:
`jq '.hooks[]|select(.name=="physState")' docs/agent-index.json`. Fold the
generator into the landed `npm run gen` / `gen:check`.
**Verify.** `generated-docs --check`; a test that `agentHelp()` names and index
rows are a bijection.
**Saving.** 10–40 k tokens on any session that follows a doc pointer.
**Risk.** A fifth generated artifact to keep green.

### 8. `context: fork` on the four noisy skills
SKILL.md frontmatter `context: fork`, `agent: <type>`, `background: false`
(wait for the result). Doc: /docs/en/skills.
**Fit.** `survey-ui-matrix` (screen × orientation × scale DOM snapshots),
`playwright-probe` (raster dumps), `survey-track` and `slim-bloat` (whole-file
reads) each pour thousands of lines of intermediate output into the main context
— the isolation `.claude/workflows/` scripts get, declaratively.
**Plan.** `survey-track` → `agent: track-surveyor`; `slim-bloat` → `agent:
bloat-auditor` (both exist; drop the duplicated prohibition prose from the
bodies); the other two → `general-purpose`. Leave `check-changes`, `agent-view`,
`tune-physics` unforked — their output *is* what the parent acts on.
**Verify.** `skill-progressive.test.mjs` gets `context`/`agent` in the allowed
keys and asserts `agent:` names a file in `.claude/agents/`; `/context` before
and after one `survey-ui-matrix`.
**Saving.** 5–25 k tokens per invocation [U].
**Risk.** A forked skill cannot edit the parent's tree mid-flow — check each
body for "then edit X" steps before forking it.

### 9. `async` PostToolUse check after a source edit
`PostToolUse` with `if: "Edit(js/**)"`, `async: true`, `asyncRewake: true`
(wakes Claude on exit 2).
**Fit.** The guard suite runs at `git commit`, minutes after the edit. The cheap
per-file checks cost well under a second.
**Plan.** `.claude/hooks/post-edit-check.sh`: `Edit(js/**)`/`Write(js/**)` →
`node --check`, then `vstd-lint` and `ratchets --check` scoped to the file;
`Edit(js/circuits/**)` → `verify-track.cjs <id>` (2 s, the documented circuit
gate). Report **failures only** (exit 2 so `asyncRewake` returns immediately);
silent on pass. Skip entirely while a `playwright test` is live.
**Verify.** Edit in a syntax error; the next turn must carry it. Time 20 edits
with the ledger (#4) to confirm sub-second added latency.
**Saving.** Catches ~1 red guard per 3 commits at edit time; for circuits, a 2 s
check instead of a foundation spec.
**Risk.** Latency and noise. `--file` flags may not exist on
`vstd-lint`/`ratchets` [U] — check first; otherwise apply to `js/circuits` only.

### 10. Verify on a runner, stream the result back (extends plan 6)
Plan 6 proposes `tools/ci/ci-dispatch`; the missing half is the wait. This
session type has `subscribe_pr_activity` (GitHub events arrive as
`<wake reason="external-event">`), `watch_url` (an inbound webhook that wakes an
idle session), `send_later`, and `Monitor`'s until-loop.
**Fit.** A local browser group is 10–40 min of SwiftShader during which source
edits are hook-blocked; the same group is 1.1–1.7 min a shard on the llvmpipe
runners that landed today. Polling was the blocker.
**Plan.** `ci-dispatch <group> --gl llvmpipe` as planned, plus `--notify pr`
(subscribe to the PR's check-suite rollups), `--notify webhook` (pass the
`watch_url` as a `workflow_dispatch` input that a final `ci.yml` step `curl`s),
fallback `--notify poke` (`send_later --delay 4`). AGENTS.md §Verification gains
one row: *a browser group this box cannot time under 10 min → `ci-dispatch
<group> --notify pr`, then keep editing.*
**Verify.** Unit-test the request builder and run matcher against a fake fetch;
one real dispatch that wakes the session.
**Saving.** The largest change to session *shape*: a 25-minute blocking wait
becomes ~4 minutes that leave the box and the edit hook free.
**Risk.** Needs `actions:write`; the tool must name the credential it used and
exit 3 with the exact `gh` command otherwise. The PR path is inert if a PR
Steward already watches the PR (the tool result says so).

### 11. Subagent `memory: project`
`memory: user|project|local`; the first 200 lines of
`.claude/agent-memory/<name>/MEMORY.md` load into that agent's system prompt
(part of auto memory — inert if `autoMemoryEnabled: false`).
Doc: /docs/en/sub-agents#enable-persistent-memory.
**Fit.** `verify-agent`'s `--base` mode answers "was this already red?" — a
project memory of known-red specs answers it in zero runs. `track-surveyor`
re-derives each circuit's baseline every time; `bloat-auditor` re-reads findings
it already rejected. **Plan.** `memory: project` on those three
(version-controlled, shared); one line per entry, each carrying a SHA
("spec → last known-red SHA + reason"; per-circuit baseline deltas declined).
Add `!.claude/agent-memory/` to `.gitignore`'s allowlist.
**Verify.** `agent-config.test.mjs` asserts the field and the tracked directory;
run `verify-agent` twice on the same red tree — the second must cite memory
rather than build a worktree. **Saving.** One `--base` worktree (~2–3 min) per
repeat diagnosis. **Risk.** Stale memory; require re-verification of any entry
older than the merge-base.

### 12. `WorktreeCreate` hook + `worktree.baseRef: "head"`
`worktree.baseRef` is confirmed real (`"fresh"` default / `"head"`), and subagent
worktrees use the same base — the whole cause of AGENTS.md rule 10
(/docs/en/worktrees#choose-the-base-branch). Beyond plan 10: a `WorktreeCreate`
hook that symlinks `node_modules` (98 MB — the reason `.worktreeinclude` is the
wrong shape) and prints the path. The doc warns `${CLAUDE_PROJECT_DIR}` stays at
the main checkout; read `cwd` from the hook JSON for the worktree path.
Verify: a `track-surveyor` fork lands on the session SHA with a working
`node --test`. Risk: a shared `node_modules` is fine read-only, unsafe if a
worktree runs `npm install` — forbid that in the agent bodies.

### 13. Skill-level `allowed-tools` and `` !`cmd` `` injection
`allowed-tools: Read Grep Bash(node tools/ci/*)` pre-approves a skill's commands
*for that turn only* — safer than widening the global allowlist for
`check-changes`, `agent-view`, `new-track`. `` !`cmd` `` (v2.1.228+) runs a
command before the body reaches context: `check-changes` injects
`verify-change --plan --json`, `agent-view` an `agentHelp()` index line,
`new-track` the `Tracks.LIST` order — each removes a guaranteed first tool call.
Verify via `skill-progressive.test.mjs` + one invocation each. Risk: a failing
injected command puts its error in the body, and `disableSkillShellExecution`
can be set org-side — use fast, always-present CLIs and keep the body valid when
the block is empty.

---

## Do NOT adopt
- **Agent teams.** Experimental, "significantly more tokens", no session
  resumption with in-process teammates, no nested teams, teammate prompts bubble
  to the lead. The parallelism ceiling here is a 4-core box where browser runs
  are serialized by policy (rule 5): teammates would queue on one resource at N×
  the tokens. Five read-only subagents + `context: fork` cover it. **Do** set
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "0"` (item 5) so a named subagent is
  never silently promoted to a teammate.
- **`disableAllHooks` / `bypassPermissions`** — the hooks *are* the enforcement
  layer AGENTS.md relies on.
- **Auto memory as a substitute for AGENTS.md** — machine-local, not shared
  across cloud environments, not reviewable in git. Subagent scope only (#11).
- **`claude -p --bare` self-fixing CI** — plan C6 deferred it; llvmpipe shortens
  the loop but fix-then-verify is still a dispatch round trip. Revisit after #10.

## Order
One sitting: **1, 2, 5** (settings + hooks, no browser run). Then **6, 8**
(context cut), then **4** to measure 1/5/9. Then **7, 9, 11, 12, 13**. **10**
last — it is a day, and plan item 6 is its first half.
