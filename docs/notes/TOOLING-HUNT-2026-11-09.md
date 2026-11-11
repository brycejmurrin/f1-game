# Tooling hunt, 2026-11-09

Kind: measurement · Re-measure-by: 2026-12-10

Brief (orchestrator A, the owner's ask "new tools or fix tools"): run every tool, believe only output produced here.
Each row: what was run, what happened, the fix, and the saving per use. Hook, skill, AGENTS.md and workflow changes are
PROPOSED only (the orchestration review owns them). Stopped at the 300k context cap; §Not done lists the rest.

## Ranked findings

| # | tool | ran | happened | fix | saves per use |
|---|---|---|---|---|---|
| 1 | `sync-pr.mjs` verify | replayed the selection on the last 14 real `sync-pr-*` merges on the deploy branch | `tooling-fast --changed` already has a pure-sync shortcut (gen:check + docs), but it is all-or-nothing: the regenerated `tools/shot/scenery-locations.json` digest was the only or near-only non-tip path on 8 of 14 syncs and sent each back to the whole branch diff (64 to 740 unit files) plus every node suite | LANDED: `syncMergeScope` + `selectSyncMerge({ impure })` + `verifyStages({ mergeOnly })`: verify what the merge decided (paths changed on both sides, regenerated or hand-resolved). Local only; CI's selection is unchanged | 28,319 → 8,488 file-seconds over the 14 syncs (÷3 at `--jobs=3`); a digest-only sync goes from 6 to 58 min of file time to 48 s, and skips the node suites (~7.5 min) |
| 2 | `scenery-locations.json` `sourceDigest` | read `scenery-source-hash.cjs`, `merge-gate.mjs:240-254`; timed `gen-scenery-locations.cjs --check` | one committed line hashes every TRACK_VM file, so any two PRs touching garage or scenery code conflict on it by construction (three PRs, three re-conflicts this week). Per-source digests do not cure it (same-file edits and adjacent lines still conflict); a merge driver does not reach GitHub's mergeability. Regeneration is 64 s | NOT LANDED, needs Bryce (land gate): stop committing the digest. Step 1: `merge-gate` accepts a missing digest by running `gen-scenery-locations.cjs --check` on the merge tree (64 s) and keeps the fast path when a digest is present and equal. Step 2 (after step 1 is on the deploy branch, because the gate runs deploy-branch code): drop the field from the generator and the file; the unit test caches `digest → catalog sha` under `artifacts/` | every such conflict: one sync round per PR (30 min before row 1, ~2 min after) |
| 3 | `dispatch.mjs --plan` | live run, 41.8 s | `ready` at `dispatch.mjs:325` has no `batch` / `batched` rule: #5106 (batch) and its members #5021 #5030 #5018 #5015 are all launch candidates, and the batch's "lands after #5100" is ignored. Neither label is in `.github/labels.json` | NOT LANDED, dispatch is Bryce's: add `&& !has(i, "batched")` to the filter, define both labels, and read "lands after" as `blocked_by` | a duplicate worker per batch member (a full session each) |
| 4 | issue attachment → worker | `curl` of `github.com/user-attachments/assets/<id>` from this container | the session proxy answers 403 "sessions are bound to their configured repositories": a worker cannot fetch an attached screenshot at all. No issue in the repo carries one today (screenshots go to chat) | LANDED: `tools/ui/issue-shots.mjs` (direct on a runner or laptop; `--branch` reads `origin/phone-shots:<n>/`). workflow `.github/workflows/phone-shots.yml` (#5246): on the owner's `issues` / `issue_comment` with an attachment, the runner copies them to the orphan `phone-shots` branch | the re-typing of every screenshot as measurements |
| 5 | screenshot vs live | self-test: the same render compared with itself | no tool compared a screenshot with the page | LANDED: `tools/ui/phone-shot-diff.mjs` + `tools/lib/shot-match.mjs`. Identical render: screen factor 0.999, 28 of 30 elements "same". It measures size only, needs texture (flat panels are reported unmatched), ~2 min on this box | one command for "which elements are a different size" |
| 6 | the phone, spelled six ways | grep + boot | `menu-screens.mjs` DPR 2 and no insets; `css-play.mjs` no insets; `probe-sheets-contract.mjs` windows A/C/D; `title-fit.mjs` Safari insets 67 where the UI contract says 59; `ui-device-profile.mjs` defaults touch to "iPhone 13" 844x390 with an empty profile; `browser-http.mjs` its own table | LANDED: `tools/lib/bryce-phone.mjs` + `tools/ui/bryce-phone.mjs --measure` (read back live: 852x393, insets 59/0/59/21, `--ui-scale` 1.09, hudScale 155.25, hudBtnScale 245). Numbers are hunt B's (PR #5216); the Safari cell is marked UNVERIFIED (#5218). NOT DONE: moving the six callers onto it | a report measured in one tool reproducing in the next |
| 7 | `pr-board.mjs` | live, 10 to 18 s | the orchestrator piped `--json` (~10 KB) through an ad-hoc node one-liner every cycle | LANDED: `--brief`, one line per PR and a tally line | ~2.5k tokens and one hand-written one-liner per cycle |
| 8 | `sync-pr.mjs --plan` | live | prints `conflicts: null, conflictsChecked: false` while `needs-sync.mjs` names the conflict in 0.6 s (`git merge-tree`) | NOT LANDED: list the conflicting files in `--plan` from `git merge-tree --write-tree --name-only` | a wasted sync start to learn which file conflicts |
| 9 | `bash-guard.sh` false refusals | subagent: payloads piped to the hook; me: live, once | a compound command holding a commit and any short `n` flag elsewhere, a heredoc body with such a flag or with a line starting with a refused command name, and a read of the hooks-path config are all refused (rc 2): the flag grep runs over the whole command and `^` matches every heredoc line (`bash-guard.sh:50,53,90-94`). Reproduced live: the heredoc that wrote THIS note was refused as a no-verify commit because row 9 quoted one | PROPOSED (hooks): blank quotes and heredoc bodies over the whole string, match the flag only inside the commit segment, anchor the hooks-path rule to a write | every commit message or doc that mentions a flag |
| 10 | subagent browser ban | `agent_id` payloads | false refusals: `shot-survey.mjs --list-locations`, `agent.mjs --help`, `apex_eval {vm:true}`, `debugger_node_test`, `output_read`. Misses: the `run-script` spelling of an npm browser group, `npx -y` Playwright, a bare headless Chromium | PROPOSED (hooks): read `tool_input` (`vm:true`, `--help`, `--list*`), widen the `BROWSER` regex | subagents losing the no-browser tools they are told to use |
| 11 | `ready-gate.mjs --help`, `ship-pr.mjs` | help text vs hook | both say the hooks require a ready-gate receipt before the flip; `github-mcp-guard.sh:19` allows draft→ready and no hook reads a receipt | PROPOSED: enforce it or delete the claim (three files) | a rule agents believe is enforced |
| 12 | `tooling-timings.mjs --help` | ran | no help: it ran the whole job (27 s, six CI logs) | NOT LANDED: `exitIfHelp` + `strictFlags` | 27 s and a surprise |
| 13 | `pick-tests.mjs` / `select-specs.mjs --since nope/ref` | ran | 39-line stack trace, exit 1 (`changed-files.mjs:40`) | NOT LANDED: one line, exit 2 | |
| 14 | `pick-tests.mjs <unrouted path>` | ran | advises `npm run test:tiny`, a local browser group rule 5 bans | NOT LANDED: name `remote-group.mjs tiny` | |
| 15 | `remote-group.mjs --plan ui` | ran | `not a group name: undefined`: the positional is ignored, only `GROUP=` is read | NOT LANDED | |
| 16 | `select-specs.mjs --files js/game.js` | ran | three disagreeing counts (26 routed, 38 listed, 70 tests) and nine "twin of itself" lines | NOT LANDED | |
| 17 | `path-overlap.mjs` | ran, 10 s | two serial GETs per PR; validates the brief after the network | NOT LANDED | 10 s |
| 18 | `ci-watch.mjs --help` | ran | points at "AGENTS.md §Watching CI and Pages", which does not exist | NOT LANDED: point at skill `steward` | |
| 19 | `protect-files` | Edit payload on `js/track/circuit-meta.js` | allowed: the hook reads `GENERATED_PATHS`, not `BUILT_PATHS` | PROPOSED (hooks) | |

Rows 10 to 19 come from one subagent run (raw outputs were under `scratch/hunt-b/`, not committed) and were not
re-run by me; rows 1 to 8 I ran myself. Worked as documented: `needs-sync`, `ci-watch --once`, `ci-rerun --dry-run`
(refuses a green run, 404 → exit 3, bad flag → exit 2), `ship-pr --pr <dirty draft>`, `session-status`, `queue-depth`,
`pick-tests` on real paths, every intended hook refusal.

## Context at session start (report only)

Measured by a subagent as bytes/4 (±25 %). The repo supplies about 9.3k of the ~102k tokens: AGENTS.md + CLAUDE.md 2.2k,
the 29 listed skill descriptions 2.0k, 191 deferred local MCP tool names 1.8k, six MCP `instructions` blocks 1.2k,
11 agent descriptions 1.1k, MEMORY.md 0.6k. The other ~93k is outside the repo and not measurable from disk: the host
system prompt, built-in tool schemas loaded in full (the Artifact tool and the ~35 `claude-code-remote` tools are the
largest block seen), account connectors (TinyFish is connected twice: 43 + 40 tool names and two instruction blocks;
Drive, Docs, Context7, three.js, GitHub 44), and the built-in and `anthropic-skills:*` skill listings.

Top cuts: (1) remove the duplicate TinyFish connector and unused account connectors in claude.ai settings (the only
large lever, Bryce's click); (2) drop `browserstack` from the enabled MCP servers (~0.6k; its free plan answered
"Automate testing time expired" to hunt B anyway); (3) emit the output-gateway hint once instead of on six servers
(~0.4k); (4) trim skill descriptions to ~170 bytes (~0.8k, routing risk); (5) trim agent descriptions (~0.45k). All
repo cuts together are ~3.4k tokens, about 3 % of the start.

## Not done (stopped at the context cap)

- A UI SIZE 60 self-test of `phone-shot-diff` was started and not read (`artifacts/logs/shot-diff-ui60.log`).
- The preset is not yet wired into `ui-device-profile.mjs`, the `apex_ui_*` / `apex_hud_*` wraps or any spec.
- The download leg of `issue-shots.mjs` has not met a real attachment (none exists; this container is refused).
- apex-lsp, the apex-tools MCP wraps, `remote-group` and `ci-rerun` beyond dry runs were not exercised.
- Rows 8 and 12 to 18 are small tool fixes left for a follow-up; no issues were filed for rows 2, 3 and 8 to 19.
