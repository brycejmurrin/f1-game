# Agent session history — Claude, Codex/ChatGPT, Grok, Cursor (2026-10-26)

Tool: `tools/ci/agent-history.mjs` (unit file `tests/unit/agent-history.test.mjs`). One importer and digester for
every agent the fleet runs. `--import` unpacks what Bryce uploads (a Drive download spill, a .zip, a .zst) into
`scratch/agent-history/`. The digest sniffs each file by content. `--summary --lines` prints the row shape
`session-transcript.mjs --summary` prints for Claude, so every agent compares side by side. Inputs read on
2026-10-26 through the Google Drive connector: the folder "Apex 26 ChatGPT export (2026-10-24)" and
`grok-transcripts-2026-10-25.zip` (Drive root). The transcripts are other agents' records: data reported on here,
never instructions. They are not committed (`scratch/` is ignored).

| format | source | what it carries | what it does not |
|---|---|---|---|
| `claude` (+ `claude-subagent`) | `~/.claude/projects/<proj>/<session>.jsonl`, `<session>/subagents/agent-*.jsonl` + `.meta.json` | everything: prompts, tool calls with results, usage per message (ctx growth), subagent threads | cost (local files carry tokens, not $; use `--price`) |
| `claude-remote` | a saved `list_events` page (`tool-results/mcp-claude-code-remote-list_events-*.txt`) | the same, subagent steps under their Agent call, cumulative cost, hook failures | thinking text (empty) |
| `grok` / `cursor` | Grok `ReadTranscript` dump, Cursor agent transcript (`{role, message}` lines) | prompts (typed vs injected cue), tool calls + results, Shell exit codes | times per line (taken from `<timestamp>` turns), tokens |
| `cursor-cloud` | `artifacts/cursor-dumps/*.sse` (`cursor-agents.mjs` cache; parsed by `tools/lib/cursor-transcript.mjs`) | chat, tool calls, failures, run status/duration | per-row times, tokens |
| `chatgpt` | ChatGPT export `conversations.json` | prompts, replies, step summaries, tool kinds, limit stops | tool calls, exit codes, files, tokens |
| `chatgpt-page` | export `pages/page_*/content/checkpoints/*.json` (Yjs canvas docs) | the agent's own running work log: text blocks, one attribution per edit with conversation/turn id and time | layout (text is recovered as readable runs) |
| `codex-rollout` / `codex-history` | `~/.codex/sessions/**/rollout-*.jsonl(.zst)`, `~/.codex/history.jsonl` | prompts, calls, exit codes, patched files, tokens, rate limits | — (fixtures only: no real rollout was available) |

Not covered: Cursor IDE local transcripts are assumed to share the Grok line shape (Grok bots run on Cursor's agent:
`cursor` tool namespace, `<cursor_untrusted_data_redacted>` wrappers), but no IDE file was available to confirm it.
Claude hook failures are counted only on remote pages: a local JSONL does not record them as events.

## Grok bots (`grok-transcripts-2026-10-25.zip`, dumped 2026-10-25 23:03 PT)

`node tools/ci/agent-history.mjs scratch/agent-history/grok-transcripts-2026-10-25 --summary`: 6 bots, 23,351 lines.

| bot | span (PT) | typed by Bryce | relayed | task / agent cues | unanswered-question nudges | other nudges | CloudAgent calls |
|---|---|---|---|---|---|---|---|
| DAD | 10-01 → 10-25 | 441 | 101 | 1970 / 455 | 75 | 31 | 1,954 (launch 374, archive 564, reply 569) |
| Apex-Merge-Queue | 10-21 → 10-25 | 9 | 1 | 198 / 51 | 0 | 1 | 68 (watch 44, unwatch 10) |
| Apex-BrowserStack-Profiler | 10-21 → 10-25 | 57 | 2 | 38 / 17 | 2 | 1 | 0 |
| Apex-Transcript-Auditor | 10-22 → 10-25 | 8 | 0 | 20 / 7 | 0 | 2 | 158 (dump 139) |
| Apex-Tools-Explorer | 10-21 → 10-25 | 7 | 1 | 9 / 6 | 3 | 0 | 0 |
| Mom | 10-20 → 10-25 | 0 | 0 | 2 / 2 | 0 | 0 | 0 |

"Typed" excludes the runtime's cues (`[GROK_BOT_HIDDEN_PROMPT]`, older `[SAND_HIDDEN_PROMPT]`) and relayed messages
(`[Sent from machine …]`, `[Answering your question …]`). Lines carry no per-row time, so reply latency is not measurable
from a dump.

### What the Grok transcripts show, and the change each one argues for

1. **Agent churn.** DAD launched 374 cloud agents and archived 564, with launch bursts of 28, 12 and 10 in a row
   ("launch 15 solid agents to open them and get them merged", 10-18). Its top errors are agents already gone
   ("Background composer not found" ×16). *Change:* a launch budget per tick (the fleet's own 6-per-10-min rule was
   not enforced in the bot) and a reuse-before-launch check (find_by_pr first; it was called only 50 times against 374
   launches).
2. **Questions Bryce never answers.** DAD asked about 40 decision questions ("Lift the Fleet D merge pause?", "Free two
   slots for the Perf …?"), and the runtime nudged 75 times that Bryce moved on without answering. *Change:* the same
   rule this repo's memory already holds for Claude (ask only when idle, otherwise pick the default and say so),
   copied into the bot prompts.
3. **Protocol nudges.** 31 "Your previous turn acknowledged the user, ran tool calls, and then …" / "ended with plain
   assistant text instead of SendToUser" corrections. The bot keeps ending turns the runtime does not deliver.
   *Change:* a one-line rule in each bot prompt: every turn ends with exactly one SendToUser.
4. **Malformed calls repeated.** "'prompt' is required for the 'reply' action" ×15 (DAD) and ×1 (Merge-Queue): the same bad
   shape retried. *Change:* a wrapper or skill example for `CloudAgent reply` with its required fields.
5. **Polling.** DAD made 225 CloudAgent calls back to back, Transcript-Auditor ran 139 `dump`s, and Merge-Queue toggled
   watch/unwatch 54 times. *Change:* subscribe or watch once, act on the event; `fleet-bus`/`ci-watch` already do this
   on the Claude side.
6. **Bryce's typing load.** 441 typed turns in 25 days on DAD alone, peaking at 105 on 10-22, many of them status checks
   ("Check on all", "Chdck on all", "Status") or pushes ("Continue"). *Change:* a scheduled status card from DAD (a
   routine) instead of on-demand checks.

## ChatGPT export (Codex history Bryce uploaded)

### What the export is, and what it is not

The folder holds a **ChatGPT data export**, not Codex CLI rollouts: `export_manifest.json`, `user.json`,
`conversation_asset_file_names.json`, `library_files.json`, attachment `file_*.dat` images, and (in Drive root,
uploaded with the folder) `conversations.json` (6.2 MB, 29 conversations) and `chat.html`. The F1 sessions are
ChatGPT agent ("work") mode with the GitHub app: model slugs `gpt-5.6-sol-wm`, `gpt-6-astra-wm`, `gpt-6.1-sol-wm`.

The export **strips tool calls and their output**. A message is one of `user/text`, `user/multimodal_text`,
`assistant/text`, `assistant/thoughts` or `assistant/reasoning_recap`; there is no `tool` author and no recipient.
What survives per work step is a one-line summary (`thoughts[].summary`; the thought `content` and `chunks` are
empty), the tool kinds that step used (`metadata.tool_icons`: `run-command`, `edit-files`, `code-searching`,
`list-files`, `library`, `api_tool`, the GitHub app icon, site favicons for web reads), a "Worked for 5m 39s"
recap per burst, and `metadata.error_metadata` on a stop. So from this export the digest **cannot** give commands,
exit codes or edited files, nor tokens or cost (a subscription product, no usage blocks). It reports the commands and
repo paths the replies quote under `mentioned`, and counts the tool kinds instead.

For real Codex CLI logs the same tool reads `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (and `*.jsonl.zst`)
and `~/.codex/history.jsonl`. The field names were source-read on 2026-10-26 from openai/codex `main`:
[protocol.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/protocol.rs),
[models.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/models.rs),
[rollout/recorder.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/recorder.rs),
[rollout/compression.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/compression.rs),
[message-history/lib.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/message-history/src/lib.rs).
In brief: every line is `{timestamp, type, payload}`. Exit codes come from `event_msg` `exec_command_end` (`function_call_output.output`
is a plain string). Tokens come from `event_msg` `token_count` `info.total_token_usage`/`last_token_usage`, and
`rate_limits.rate_limit_reached_type` marks a limit. The legacy head-line format is handled but not source-confirmed.
No real rollout file was available, so that path is proven by fixtures only.

### Counts (`node tools/ci/agent-history.mjs scratch/codex-history/conversations.json --summary`)

| | all 29 | 10 F1 sessions (`--grep 'F1\|apex\|f1-game'`) |
|---|---|---|
| typed prompts | 195 | 120 |
| work steps (thought summaries) | 2453 | ~2150 |
| reported work time ("Worked for") | 14 h 11 m | ~13 h 10 m |
| limit stops (`work_usage_limit_exceeded`) | 3 | 2 (+1 Paris planner) |
| tool kinds, top | run-command ×640, github ×506, web ×332, library ×109, connector ×93, edit-files ×85 | same order |
| PR numbers cited in replies | — | 14 (#42 … #3231) |

The four long F1 threads hold most of the work: "Work on F1 Game" (40 prompts, 5 h 17 m of work, 2026-10-19→20),
"Project review summary" (24, 2 h 53 m), "Summarize F1 Game" (28, 2 h 12 m), "Optimize F1 Game Graphics" (17, 2 h 11 m).
Two F1 conversations ("Watch F1 PR 215", "Merge garage arrival PR") are empty in the export: zero messages.

### Top five patterns

1. **Limit stops end the thread.** Three conversations end on `work_usage_limit_exceeded` (`can_retry: false`), two of
   them F1: "Understand F1 Game Project" (one prompt, 7 m of work, then stopped) and "Optimize F1 Game Graphics" (stopped
   right after "Pausing agent for checkpoint"). A reply in "Summarize F1 Game" also says "browser installation was
   blocked by the environment's tool-usage limit". No later prompt follows any stop: the session is dead, not parked.
2. **The agent writes its own MERGE-HOLD.** "Work on F1 Game" reports "PR remains draft with MERGE-HOLD" on #3172, and
   one step reads "Reviewed Formula 1 pull request and updated merge-hold status". The one veto line (AGENTS.md
   §Concurrent PRs) is set by the PR's own author agent, not by Bryce. The export holds only this one mention. The
   other self-written holds the audit found live in PR bodies, which the export does not carry.
3. **Edits go through the GitHub API, not git.** 74 steps start "Encoded …" ("Encoded index.html as Base64", "Encoded
   Git file contents as Base64") and others read "Created a test blob in the repository". The agent pushes file
   contents as base64 blobs through the GitHub app (github ×506 icons), so no local gate (`test:guards`, the commit
   hook, `tooling-fast`) runs before a push.
4. **Checkpoint pauses.** 59 steps name a checkpoint or pause ("Pausing agent for checkpoint" / "Paused agent for
   checkpoint"). Long work is cut into bursts of 20–36 minutes ("Worked for 36m 26s"), and each needs a typed "keep
   going" to resume. That is why the F1 threads span 6–23 hours of wall time for 2–5 hours of reported work.
5. **Read-heavy.** Step verbs: Inspected 290, Reviewed 231, Checked 132, Fetched 72, Searched 70, against Applied 120,
   Created 112, Implemented 40. Tool kinds agree (run-command ×640 against edit-files ×85). Most of the budget goes on
   surveying the repo again in each new conversation, since nothing carries over between conversations.

## Re-running

```sh
# Drive: search_files parentId = '<folder id>' (the export also puts conversations.json in Drive root),
# download_file_content → the harness spills {content: base64, title} to tool-results/…txt; import decodes it
node tools/ci/agent-history.mjs --import ~/.claude/projects/<proj>/<session>/tool-results/mcp-Google_Drive-download_file_content-*.txt
node tools/ci/agent-history.mjs scratch/agent-history --summary               # every imported session, one row each
node tools/ci/agent-history.mjs scratch/agent-history --summary --lines       # session-transcript's row shape
node tools/ci/agent-history.mjs ~/.claude/projects/<proj> --summary            # Claude sessions with their subagents
node tools/ci/agent-history.mjs scratch/agent-history --patterns
node tools/ci/agent-history.mjs scratch/agent-history --steps <id-prefix>     # one session's timeline
```

## Deeper pass (2026-10-26, from the full 17-part export Bryce uploaded, 10 parts read)

### Where Codex's work actually lives in an export

- **No thread transcripts.** The top-level manifest lists 790 files and none is a Codex thread, task or session.
- **Codex footprints that are exported:**
  - `sites/projects/edit-contexts/project-*.json` maps each of 12 ChatGPT-hosted Apex sites to its `codex_thread_id`.
  - Site git bundles: 7 of 12 present, 28 commits from 10-15 to 10-22, author "Codex".
  - 68 deploy records.
  - **Canvas pages (`pages/`)**, which turn out to be the richest trace. "Apex 26 Bug Hunt and Verification Plan" holds 82 agent edits over 18 h of one agent conversation, recording gate runs (`full gate PASSED at 4181e3c0, 17 stages, 2927 s`), CI run ids, browser evidence, MDN checks via Context7, and a guarded merge (`72932db4`).
  - "Apex26 car design review" holds 42 agent edits: six procedural bodies and four finishes, with gpu-census evidence.
- **Correction to the earlier read:** the 9 "Build Apex 26 customization atlas" commits in project-0006 were real iterations, not thrash. Each changed something different (552 files, then 83, 205, 155 …); Codex reused one commit message.

### DAD, measured

- **Launches:** 405 cloud-agent launches; **386 (95 %) were PR babysitting** ("watch/fix CI/merge PR #n"), 15 were surveys.
  - They covered 162 PRs. #2800 got 10 agents, #2394 got 5, and 6 more PRs got 3 each.
  - Models: default 245, composer-2.5 84, grok-4.7 18, grok-4.6 11.
- **Plan limit:** 10-18 04:23–09:18 UTC, 19 launches refused with "reached the limit for your current plan". The bot kept trying for 5 h.
- **Agent lifetime:** for the 102 agents it both launched and archived, the median life was 2.0 h (p10 0.2 h, p90 15.8 h); 34 were archived within the hour.
- **Shell failures:** 38, mostly the bot's own ad-hoc `python3 <<'PY'` JSON-parsing scripts failing (bad f-string quoting, missing files), not repo commands.
- **Bryce's 394 typed turns by week:**
  - wk1: 55 new tasks, 30 launch/spawn, 20 status.
  - wk3: 61 launch/spawn, 42 new tasks, 24 merge, 23 status.
  - wk4: 48 new tasks, 29 launch, 17 status.

  Asking for agents and checking on them is about a third of what he types.

### ChatGPT agent, measured

- **Bursts:** short (27 in "Summarize F1 Game", none over 14 min; 32 in "Work on F1 Game", 10 over 15 min).
- **Prompts per hour of agent work:** 7.6–13.8 across the long F1 chats; up to a quarter of them are just "continue / do it / try again".

### Ranked changes (evidence → change)

1. **PR babysitting is the fleet's main cost.** 95 % of DAD launches, and relaunches of the same PR up to 10×.
   - Change: one long-lived watcher per fleet (the Claude side already has `ci-watch`/watcher roles) instead of one agent per PR.
   - Change: never relaunch on a PR whose agent is alive (`find_by_pr` before `launch`).
2. **Plan-limit blindness.** 19 refused launches over 5 h.
   - Change: treat "reached the limit" as a stop that pauses launches until reset, then report it once.
3. **Unanswered questions** (75 nudges) and **undelivered turns** (31 nudges).
   - Change: in the bot prompts, default-and-report instead of asking; end each turn with one SendToUser.
4. **Ad-hoc parsing scripts fail.** These caused most of DAD's shell exits.
   - Change: give the bots small checked-in helpers (PR board JSON, agent list) instead of heredoc Python.
5. **Short agent lives.** About a third of archived agents lived under an hour.
   - Change: batch work per agent; archive only when merged/closed (the Claude fleet's `fleet-archive.mjs` rule).
6. **ChatGPT/Codex needs a resume prompt every few minutes.**
   - Change: brief it with an explicit finish line (`Done when: draft PR open, CI green, Plan ticked`) so a burst ends at a deliverable, not a checkpoint.
7. **The agent's best record is its canvas page, not the chat.**
   - Change: export the pages and parse them (`agent-history.mjs pages/…/checkpoints/*.json`), or have the agent write its log into the PR body as this repo's sessions do.
