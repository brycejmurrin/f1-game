# Agent work tracking — where the backlog lives (2026-10-14)

Research behind the AGENTS.md §Backlog rule: four parallel web-research passes (hosted trackers with MCP, git-native trackers, agent orchestrators, multi-agent coordination practice) compared every candidate against this repo's constraints — free, headless from a reclaimed cloud container, readable on a phone, tied to PRs and CI. Sources are cited inline; nothing below was measured on this box except the proxy facts already recorded in `tools/ci/who-is-on-it.mjs`.


For this repo, the answer is to **add GitHub Issues with sub-issues as the backlog and keep everything else you already run**. The draft-PR body stays the in-flight status log. `who-is-on-it.mjs` stays the claim lock. `.claude/memory/` plus `docs/notes/` stay the memory layer. GitHub Issues is the only tracker that passes all of your hard constraints at once. It costs nothing. Every agent can already reach it with zero auth friction, because this container's GitHub MCP already exposes `issue_write`, `sub_issue_write` and `search_issues`. It reads well in GitHub Mobile. It sits in the same system as the PRs and CI it has to track. And it is the one tracker that Copilot, Claude and Codex all write to natively through Agent HQ ([GitHub changelog](https://github.blog/changelog/2026-02-26-claude-and-codex-now-available-for-copilot-business-pro-users/)). The more agent-native tools fail on details specific to your setup:

- **Beads** has the best claim and ready-queue semantics. But it syncs through a non-branch git ref, and your containers' proxy refuses those pushes.
- **Linear** has the best PR automation. But its free tier stops at 250 issues ([Linear pricing](https://linear.app/pricing)).
- **Orchestrators** either need a desktop running or have folded. Vibe Kanban's company shut down in April 2026 ([Vibe Kanban](https://vibekanban.com/blog/shutdown)).

No tool on the list gives you an atomic cross-container claim. Your existing git-push race on `claude/claims-board` is already the right primitive. Adoption is mostly conventions: labels, an issue template, a ready query, and one rule linking each PR's Goal to an issue. You don't need a new service.

## Your three hard constraints eliminate most of the field

Three requirements are binary for this repo: an agent in a throwaway container must authenticate without a human, the developer must be able to read status on a phone, and work status must connect to PRs and CI. Most options fail at least one.

### Headless authentication

Headless auth splits the hosted trackers cleanly:

- **Linear** accepts an API key as a bearer token on its MCP endpoint ([Linear MCP docs](https://linear.app/docs/mcp)).
- **Plane** has a dedicated API-key endpoint for "automations, CI, headless agents" ([Plane MCP docs](https://developers.plane.so/dev-tools/mcp-server)).
- **Jira's** Rovo MCP needs an org admin to enable scoped API tokens first ([Atlassian support](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/)).
- **Notion's** hosted MCP is OAuth-only. Its FAQ answers "Not yet" to non-interactive auth, and the token-based community server is unmaintained ([Notion](https://developers.notion.com/docs/get-started-with-mcp)).
- **Asana and ClickUp** are OAuth-only remote servers ([mcpservers.org](https://mcpservers.org/remote-mcp-servers/asana); [Codegen](https://codegen.com/mcp/clickup/)).
- **Huly** is out entirely. Its hosted service required export by July 20, 2026 and now survives only as self-hosting, according to secondary mirrors ([dev.co](https://dev.co/crm/open-source/platform)).

GitHub beats all of them. The harness already authenticates the GitHub MCP for every Claude Code cloud session, so the agent does no auth work at all.

### Phone visibility

The phone requirement rules out most local and git-native tools:

- **Backlog.md's** kanban binds to `127.0.0.1` and is "not reachable from other devices" ([Backlog.md](https://github.com/MrLesk/Backlog.md)).
- **git-bug's** web UI is a local, work-in-progress server ([git-bug](https://github.com/git-bug/git-bug)).
- **Beads** has no built-in UI. Its data lives in a ref that github.com does not render.
- **Desktop orchestrators** need your Mac awake: Conductor is a Mac app ([conductor.build](https://www.conductor.build)), Claude Squad is a tmux TUI, and Vibe Kanban OSS is now local-only.

Your phone can always render two things: GitHub (issues, PR bodies with tickable checklists, checks) and the vendor session lists (claude.ai/code, cursor.com/agents). GitHub Mobile lists agent tasks under My Work → Agents ([GitHub changelog](https://github.blog/changelog/2025-09-24-start-and-track-copilot-coding-agent-tasks-in-github-mobile/)).

### PR and CI tie-in

On PR and CI tie-in, GitHub is native and Linear is the best third party. Linear moves an issue to In Progress on push and to Done on merge, and the automation can be scoped per target branch ([Linear docs](https://linear.app/docs/github)). It is the strongest argument for Linear, but it does not outweigh the 250-issue free cap plus a second system for a solo developer.

| Option | Free fit | Headless from container | Phone | PR/CI tie-in | Atomic claim | Verdict |
|---|---|---|---|---|---|---|
| GitHub Issues + sub-issues | Unlimited; 100 subs/parent, 8 levels ([Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)) | Already wired | GitHub Mobile | Native | No (assignee is last-writer-wins) | **Adopt as backlog** |
| PR-body checklist (current) | Free | Already wired | Renders checkboxes | Is the PR | n/a (one PR per session) | **Keep as in-flight log** |
| `who-is-on-it.mjs` claims board | Free | Works through the proxy | Branch view only | Indirect | Yes (fast-forward push race) | **Keep as lock** |
| Linear | 250 issues, 2 teams ([pricing](https://linear.app/pricing)) | Bearer key | Strong (unverified) | Best automation | No | Runner-up if you outgrow GitHub |
| Plane | Not verified | Bearer key endpoint | Weaker (unverified) | Not researched | No | Runner-up for open-source/self-host |
| Jira / Rovo MCP | Free plan, ~500 calls/h reported ([Community](https://community.atlassian.com/forums/Rovo-questions/Clarification-on-Atlassian-Rovo-MCP-Server-Rate-Limits-10-000/qaa-p/3264375)) | Admin-enabled tokens | Strong | Separate app | No | Avoid (overhead, 429 bursts) |
| Notion / Asana / ClickUp | Varies | OAuth-only | Strong | Weak | No | Avoid for agents |
| Beads | MIT | Needs `bd bootstrap` + push to `refs/dolt/data` | None | None | Yes, within one database | Blocked here (see below) |
| Backlog.md | MIT | Plain files | Rendered markdown only | Files in PR diff | No (one task per session by design) | Viable fallback |
| Taskmaster | MIT + Commons Clause | Files | Raw JSON | None | No | Avoid |
| Claude Code Tasks / agent teams | Built in | Home dir, not synced | None | None | Yes, one session's team only | Use inside one session only |
| Agent Mail | OSS | Needs a shared server | Static Pages export | None | Advisory leases | Overkill at this scale |
| Agent HQ / vendor clouds | Paid Copilot | Native | Native | Native | Assignment | Execution surfaces, not trackers |

## No tracker gives you an atomic cross-container claim

Every serious multi-agent writeup arrives at the same requirement: once several agents run at once, you need an atomic claim. The mechanisms in use differ:

- **Lock file pushed through git.** Anthropic's C compiler project had agents write a lock file such as `current_tasks/parse_if_statement.txt` and let git sync reject the loser ([Anthropic](https://www.anthropic.com/engineering/building-c-compiler)).
- **File-locked task list.** Claude Code agent teams use "file locking to prevent race conditions," but only inside one session's team, stored under `~/.claude/tasks/` and never uploaded ([agent teams](https://code.claude.com/docs/en/agent-teams)).
- **Database transaction.** Beads offers `bd update <id> --claim`, which atomically sets the assignee and in_progress ([beads](https://github.com/steveyegge/beads)).

Hosted trackers offer nothing equivalent. Assignee and status writes are last-writer-wins, and no vendor documents ETag-style optimistic concurrency on MCP writes.

There is a further problem specific to you. Every Claude Code cloud session acts as your own GitHub account. "Assign to self" therefore names the same person for every agent, so it marks an issue as taken but cannot say which session took it. This is an inference from the single-account setup, not a documented limitation.

Your `who-is-on-it.mjs` is already the Carlini pattern, adapted to your proxy. It writes one file per claim on `claude/claims-board`, pushes as a plain fast-forward, refetches and retries on a race, and records release as a removal commit. Release has to be a commit because the proxy refuses ref deletion. It is the only cross-container lock in this comparison that works from your containers today.

The recommendation keeps it as the lock and makes the issue the place where the claim shows up. On claiming, the agent adds a `claimed` label and posts a comment with its session link and branch. On release, it removes the label.

### Beads is the strongest tool, but your network blocks it

Beads deserves direct treatment because it is the strongest agent-native design: `bd ready` for unblocked work, atomic claims, hash IDs that avoid merge collisions, and roughly 27.9k stars ([beads](https://github.com/steveyegge/beads)). Three facts rule it out here.

First, its source of truth moved in 2026 to a Dolt database synced under `refs/dolt/data`, a ref "separate from branches" ([Beads sync](https://beads.gascity.com/core-concepts/sync-concepts)). The header of `tools/ci/who-is-on-it.mjs` records a measurement from 2026-09-22: your container proxy accepts pushes only to `refs/heads/claude/*`. A push to another namespace (`refs/claims/*`) returned 403. Beads sync would almost certainly hit the same wall. This was not tested against `refs/dolt/data` specifically.

Second, its claim is atomic only within one database. Two containers with separate clones can both claim the same issue until they pull, so it would not replace your claims board anyway.

Third, it churns. Its storage moved from JSONL to a Dolt server, then to embedded Dolt, then to a proxied-server default in 1.3.0. Version 1.3.1 shipped breaking changes visible to scripts ([releases](https://github.com/gastownhall/beads/releases)). That is a poor fit for a repo whose hooks and gates assume stable CLIs.

## Git-native trackers trade phone visibility for zero dependencies

Backlog.md is the best git-native fallback:

- It stores one markdown file per task under `backlog/` and has a CLI and MCP with `--json` output ([Backlog.md](https://github.com/MrLesk/Backlog.md)).
- It ships steadily; version 1.53.0 was published in September 2026.
- It returns with `git clone`, so container reclaim costs nothing.
- Its files render on github.com mobile.

Its limits matter here. It explicitly recommends one task per agent session and does no claiming. Its sequential IDs have raced across branches, which it patched with a remote snapshot before allocating an ID ([v1.50.1](https://newreleases.io/project/github/MrLesk/Backlog.md/release/v1.50.1)). Task state also lands in PR diffs. With your ratchets, generated-file checks and many concurrent PRs, that adds conflict surface to every branch. It would duplicate what issues give you without the phone board, the search, or Agent HQ assignment.

Taskmaster is weaker. Its docs admit merge conflicts in `tasks.json` and tell you to renumber rather than hand-merge ([Task Master docs](https://docs.task-master.dev/best-practices/advanced-tasks.md)). Its full MCP surface costs about 21k tokens of context. Its npm package has not published since March 2026. Its Commons Clause license is restrictive ([README](https://github.com/eyaltoledano/claude-task-master)).

Claude Code Tasks persist in `~/.claude/tasks/` ([Claude Code docs](https://code.claude.com/docs/en/interactive-mode)), which a reclaimed container loses unless `memory-sync.sh` is extended to carry them. Treat them as scratch space inside one session.

Obsidian is a notes system. Most of its MCP servers assume the desktop app is running, and a filesystem-mode server pointed at an in-repo vault is just markdown in the repo ([Morph](https://www.morphllm.com/obsidian-mcp-server)).

The evidence on plan staleness argues for keeping structure plus enforcement, which you already have. Anthropic moved its feature lists to JSON because the model is "less likely to inappropriately change or overwrite JSON files compared to Markdown files" ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)). Its own structured agent-team task lists still "lag" ([agent teams](https://code.claude.com/docs/en/agent-teams)). OpenAI keeps markdown ExecPlans but requires timestamped progress entries and a decision log ([OpenAI Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans)).

Your PR-body Plan is markdown, but `ready-gate.mjs` refuses to mark a PR ready while any item is open. That is the hook-enforced gate Claude Code's best practices prefer over advisory text ([best practices](https://code.claude.com/docs/en/best-practices)). It is no reason to migrate away. What it lacks is a home for work that no session has started yet, and that gap is exactly what issues fill.

## Orchestrators are execution surfaces, not systems of record

GitHub Agent HQ / Mission Control is the most relevant orchestrator. It puts Copilot, Claude and Codex in one Agents tab across web, VS Code and mobile. It can assign an issue to one or more agents, each producing a draft PR. Each session costs one premium request on paid Copilot plans ([changelog](https://github.blog/changelog/2026-02-26-claude-and-codex-now-available-for-copilot-business-pro-users/)).

Cursor is not listed in Agent HQ. Cursor's own cloud agents launch from GitHub or Linear mentions instead, according to secondary sources ([morphllm](https://www.morphllm.com/cursor-background-agents)). Because Agent HQ starts from issues, a GitHub-Issues backlog is the cheapest way to keep a future option of dispatching work straight from the phone.

The rest of the category is either local-only or fragile:

- Conductor, Sculptor and Claude Squad isolate agents by worktree or container on your machine.
- Terragon shut down around January 2026 ([terragon-oss](https://github.com/terragon-labs/terragon-oss)).
- Vibe Kanban's hosted issue tracker was deleted at its April 2026 shutdown ([shutdown](https://vibekanban.com/blog/shutdown)).

Two vendors folding within about three months is the clearest lock-in lesson in this research. MCP Agent Mail is the one serious cross-vendor coordination layer, with advisory TTL file leases, threaded inboxes, and a static GitHub Pages export ([mcp_agent_mail](https://github.com/Dicklesworthstone/mcp_agent_mail)). It needs a shared server that your ephemeral containers do not have, and your claims board plus `send_message` already cover its role at your scale.

## Recommended setup: four layers, one new convention

| Layer | Tool | What lives there | Phone view |
|---|---|---|---|
| Backlog and dependencies | GitHub Issues + sub-issues (MCP `issues` toolset) | Not-yet-started work; epics as parents; `ready` / `blocked` / `claimed` labels; area labels | GitHub Mobile issues list, or a pinned "Fleet board" issue |
| Claims | `who-is-on-it.mjs --claim "#<n> <text>"` on `claude/claims-board` | The atomic lock; mirrored onto the issue as a `claimed` label plus a comment with the session link and branch | Issue label and comment |
| In-flight status | Draft PR body (Goal / Plan / Status / Next step), gated by `ready-gate.mjs` | One session's live plan; Goal line cites `Closes #<n>` | PR checklist + checks |
| Memory | `.claude/memory/` (preferences), `docs/notes/` (measured lessons), hooks/tests (rules) | Durable facts, never task status | Rendered markdown |

This matches the separation that Beads and Claude Code both prescribe: durable facts and preferences in memory, current work in the tracker ([beads](https://github.com/steveyegge/beads); [best practices](https://code.claude.com/docs/en/best-practices)).

### Adoption plan

**Step 1: create labels and an issue template.** Create the labels `ready`, `blocked`, `claimed` and the area labels. Add an issue template whose body is self-contained for a cold agent (objective, files in scope, verify command, "Blocked by #n"). Anthropic found that vague task specs caused duplicate work across parallel agents ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)).

**Step 2: add a short AGENTS.md rule for picking up work.** At session start, the agent runs the ready query `is:open label:ready -label:claimed -label:blocked` through `list_issues` (`labels: ["ready"]`; the MCP `search_issues` is semantic, not GitHub search syntax). Before branching, it claims through `who-is-on-it.mjs`, then labels and comments on the issue. Its draft PR's Goal cites `Closes #n`. When it discovers new work, it files a sub-issue rather than adding scope to the current PR.

**Step 3: let the merge close it.** Checked while landing this note: the deploy branch `claude/f1-game-project-26h3ng` IS the repository's default branch (`git ls-remote --symref origin HEAD`), so a `Closes #n` line in the PR closes the issue on merge ([closing keywords](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)). The research pass assumed a non-default branch and proposed `Refs #n` plus a Merge Desk close; neither is needed.

**Step 4: record dependencies.** Express dependencies with sub-issues, which the MCP supports. Use the `blocked` label for "blocked by". GitHub's native blocked-by relations went GA with `is:blocked` search ([changelog](https://github.blog/changelog/2025-08-21-dependencies-on-issues/)), but the MCP has no dependency-write tools ([awesome-copilot reference](https://git.cynarski.dev/Awesome/awesome-copilot/src/branch/main/skills/github-issues/references/dependencies.md)). Native relations would need REST calls, which may not pass your proxy. Test one `gh api` dependency write before standardizing on it.

**Step 5: build a phone dashboard last, and only if needed.** Have a script or Routine regenerate a pinned issue body listing the ready, claimed and blocked issues and the open drafts. Do this only if GitHub Mobile's filtered lists prove too thin.

Enable the opt-in `projects` toolset ([github-mcp-server](https://github.com/github/github-mcp-server/blob/main/README.md)) only if you later want a Projects v2 board. Phone rendering of Projects views was not verified.

### Runner-ups and what to avoid

**Linear** is the runner-up if the backlog outgrows labels. It has headless bearer keys, per-target-branch PR automation, and native triggers for Codex, Cursor, Devin and Factory ([OpenAI docs](https://developers.openai.com/codex/integrations/linear)). Budget for the paid tier once you pass 250 issues.

**Plane** is the runner-up if open-source licensing and self-hosting matter. Its MIT MCP server has 30 tools covering 207 actions, and it has a headless key endpoint ([Plane MCP docs](https://developers.plane.so/dev-tools/mcp-server)). Its free-tier limits and mobile app were not verified.

**Backlog.md** is the fallback if GitHub ever becomes unreachable from the agents.

Avoid these:

- **Notion, Asana and ClickUp** as an agent backlog, because they are OAuth-only.
- **Jira**, because of admin-gated tokens, credit-metered search, and reported 429s at about 20 parallel calls ([issue #171](https://github.com/atlassian/atlassian-mcp-server/issues/171)).
- **Beads**, because the proxy blocks its sync ref.
- **Taskmaster**, because of the issues above.
- **Huly**, because its hosted service is gone.
- **Any desktop orchestrator as the source of truth.**
- **Claude Code agent-team task lists for anything that must survive a container.**

## Conclusion

The real gap in this repo is not the tracker. It is the backlog. Your existing claim script, PR-body log and memory split already solve the problems that drove Beads, Agent Mail and agent teams into existence, and they solve them in a way that survives your proxy and container reclaim. What is missing is a queue of not-yet-started work that a phone can read and a cold agent can query. Issues are that queue, and they also connect the repo to Agent HQ dispatch if that becomes useful later.

Two uncertainties remain. The first is whether `gh api` dependency writes pass your proxy. The second is how many issues the fleet actually generates, which is what would push you toward Linear. Measure both during the first two weeks rather than deciding them now. Every tool in this field that pushed state outside GitHub either churned or died in 2026. The one durable bet for a solo developer is to keep state where the code, PRs and CI already live.
