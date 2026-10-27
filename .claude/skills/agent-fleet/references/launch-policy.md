## Contents

- Launch policy (moved from AGENTS.md §Concurrent PRs)

## Launch policy (moved from AGENTS.md §Concurrent PRs)

Binding on every orchestrator or person writing a cloud launch prompt. The template
and its hard lines are `orchestrator.md` §Launch template / §Hard lines (their one
home); this file holds the policy numbers.

- Cloud launch prompts carry `OWNED:` / `FORBIDDEN:` globs, done-when, caps, and
  the exact line `Do not enable auto-merge or merge.` (it limits that worker's own
  actions; it is not a veto and never goes into a PR body).
- **Launch pins:** `source_revision` is a branch name or a full 40-hex sha, never a
  sha7 (a short sha returned a session id, then died `ref_not_found`, 2026-10-26);
  check with `git rev-parse --verify origin/<rev>` first.
- **Quota gate:** `get_session` on yourself → `rate_limit_info` before each `create_session`
  and each Agent wave > 5 (`launch-gate.py` / `launch-lane.mjs` enforce it). At
  `allowed_warning` launch only owners/sync for PRs already READY (no hunters; an
  orchestrator only if none is live); at `rejected` / `usage_limit_reached` launch
  nothing and post `fleet-bus.mjs send INCIDENT --to '*' "open quota-<date> …"`;
  the seed answers `SEED <letter> QUOTA <reset>` (DECISIONS 2026-10-26 #1). Stagger ≥ 30 s;
  confirm each child from `create_session`'s result.
- **Model by task** (Bryce 2026-10-19, "decide which workers should be opus or [sonnet] based on the issue. Make this standard.").
  Every `create_session` passes an explicit model and the brief carries `MODEL: <id> — <reason>`:
  - `claude-opus-5-5`: a design or look call, a rework of a rejected approach, a red with no known cause, or a
    change in physics, a renderer backend or `js/game.js`.
  - `claude-sonnet-5-5`: everything else (port a known fix, sync, one screen's CSS, tests, docs, PR babysitting, surveys).
  - Fable only when Bryce names it for that task, his words quoted in `MODEL:` (2026-10-22 visor lane).
  - A Sonnet worker that finds the task Opus-shaped sets `needs-decision`; an Opus lane keeps the Sonnet cost cap.
- **Session titles and tags** (FLEET-ROLES-2026-10-19.md §4-5). Every `create_session` sets `title` and `tags`;
  the same ids go in the fleet block (`fleet:`, `slot:`), claims (`[<Fleet>·<Slot>]` prefix) and bus lines.
  - Title: `[<Role>] <Fleet>·<Slot> · <scope> · <Model> — <task, ≤ 60 chars>`. Role ∈ Orchestrator | Seed | Watch |
    Worker | Hunter | Owner | Sync | Review | Coordinator. Slot: Orchestrator `O<gen>`, Seed `S0`, Watch `FW<n>`,
    Worker `W<wave>·L<lane>`, Hunter `H<n>·<lane>`, Owner/Sync `#<PR>`, Review `R<n>·#<PR>`. Scope ∈ game | tests |
    tools | docs | track | ui | ci | fleet (game = js/, css/, assets/, index.html, sw.js: paced). Model = Opus | Sonnet.
  - Tags: `fleet:<a|b>`, `role:<orchestrator|watch|worker|hunter|owner|sync|review>`, `wave:<n>`, `lane:<Lnn|sync|…>`,
    `scope:<…>`, `pr:<n>` (owner, sync, review), `variant:<medic|survey|synth>`; plus `f1-game-fleet`.
    No `orchestrator:<session id>` tag: ids die at rotation; the brief names the fleet letter.
  - Examples: `[Orchestrator] B·O1 · fleet · Opus — backlog waves, own-fleet gated merges` ·
    `[Worker] B·W1·L3 · tests · Sonnet — L25 agent-config budgets` · `[Owner] A·#3020 · game · Sonnet — drive #3020 to merged`.
- Lane mutex: garage CSS → UI Survey; `js/car/*` → Cars; scenery (`js/circuits/scenery/*`) → Tracks; `js/game.js`
  needs `who-is-on-it --claim` before an edit. ≤ 1 lighting agent, OWNED=`js/lighting/**` only.
- Review farm: ≤ 2 concurrent review agents unless the user overrides; ≤ 2 nested subagents per cloud agent.
  Research, audit and verify lanes run as in-session Agent subagents, not `create_session` (each sibling pays a
  ~98k boot; harness research 2026-10-26).
- Refuse a launch whose sole goal is "read/understand the project" or "investigate all", and a bare "continue
  working" without a new delta or a narrower scope.
- **Survey lane:** findings first (measurements, captures, a report), and like every lane it opens a docs-only
  DRAFT PR at its first commit (AGENTS.md rule 12) holding the report; a fix under ~20 lines in its OWNED pair may
  ride it, larger fixes become one tracking issue. Images stay out of the PR (`docs/EVIDENCE-STORAGE.md`).
- **Follow-up cap:** at most two orchestrator follow-up rounds after the first hand-back; round 3 needs a new
  launch with new evidence or a narrower OWNED.
- **Closeout:** fold findings into one tracking issue or the survey doc; list superseded draft PRs (closing them is
  the orchestrator's); `--release` the claim; fleet `state: done`.
- Budgets: abort at > ~400 messages or > ~90 min with no OWNED push; ≤ 25 captures unless the user raises it. Never
  relaunch an errored or > 400-message agent on the same prompt.
- **Pre-launch claim and twin guard:** `who-is-on-it.mjs` plus a `pr:<n>` / title scan of a saved `list_sessions`
  page; refuse the launch when an active claim, the same PR or an overlapping OWNED is already running.
- Pin long Chromium/visual smoke to `apex-sha` or the PR's Pages preview, never the moving github.io.
- Sync lanes follow `.claude/rules/fleet-core.md` (CONFLICTING/DIRTY/red only); one Sync agent per PR; never sync
  and merge in one run; no auto-update-branch bots. Normalize a messy merge with
  `node tools/check/merge-hygiene.mjs --fix`, then `gen-test-groups.mjs`.
- Every hand-back reports its head SHA; a worker reports to its orchestrator only. Batch small tooling/doc fixes
  into ONE PR.
- **Size stop (one table; Bryce 2026-10-19: "both soft and hard caps as well as test auto compact").**
  Every launch prompt ends `STOP AT: <soft> context or $<cap>`. Base = a fresh session's boot, ~100k (98k
  measured 2026-10-26, `docs/notes/BASE-CONTEXT-2026-10-26.md`); `get_session` shows `max_tokens` 1,000,000, so
  every cap is a cost budget (each wake re-reads the whole context), not the window.

| Role | Soft cap (context) |
|---|---|
| reviewer | 150k (base + 50k; size batches to about 25 files) |
| worker | 200k (base + 100k), at a verified checkpoint; a 150k cap left ~50k of work after the ~100k boot (all three A·W9 lanes stopped within ~10 min, Bryce 2026-10-26) |
| PR owner | 150k (base + 50k), docs-only too |
| hunter | 150k (base + 50k) |
| synth | 150k (base + 50k) |
| sync | 150k (base + 50k) |
| fleet watcher | 150k (base + 50k) |
| seed | 150k (base + 50k) |
| orchestrator | 300k (boot + 200k) |

  Hard cap = soft + 50k.
  - **Measure** live context (`/context` or the statusline), not `get_session` `used_tokens` (turn-end only).
  - **At the soft cap** finish the current unit, push everything (no container-only state), post a WIP note, send
    HANDOFF with a ≤ 40-line brief (`tools/ci/fleet-brief.mjs`). **At the hard cap** hand off now. A session with
    fewer than ~30 calls of work left finishes instead.
  - **Compaction pilot** (harness research 2026-10-26): one orchestrator runs with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=250000`
    set on its environment (Bryce sets environment variables) and AGENTS.md `# Compact instructions`; it compacts in
    place instead of rotating. Until the pilot reports, the table above stands.
- **Cost.** Per-call cost is about context × cache-read price; a wake inside the 1 h cache costs ~$0.04 at 200k on
  Opus 5.5, an expired one ~$1.60 (`docs/notes/FLEET-COST-2026-10-19.md`). Keep tool results small (comms.md §Output
  budget) and route verbose reads through a subagent.
- **Status words:** a brief asks for READY / BLOCKED / DONE (SKILL.md §Glossary), never "post a HANDOFF". Suites over
  ~2 min run in the background (AGENTS.md rule 4). Gates run unpiped.
- **Monitoring and reporting:** every hunter and PR-owner prompt carries `role-pr-owner.md` §Monitoring and reporting.
- **No desk field.** READY goes to the lane's own fleet (`ORCHESTRATOR: fleet <X>`). No Merge Desk exists unless
  Bryce designates one; a lane never runs `list_sessions` to look for one.
- **Before launching an owner:** skip a PR that is armed and green or pushed in the last ~10 min.
- **Hunters and perf lanes:** stop after the first zero-finding round; cap at ~3 rounds or 25 min, then FINAL.
- **A lane that edits `.claude/**`** needs Bryce's quoted grant in its own launch prompt.
- **Stand-down** is a message with a 2-minute window to push a WIP findings note before any interrupt.
- **Unattended sessions never call AskUserQuestion** (it parks the session until answered; OrchA sat 15.5 h):
  they post BLOCKED with an expiry; the orchestrator decides or asks Bryce in a normal reply.
