# Anthropic plugins, skills, MCP servers and built-in features worth using here — 2026-10-16

Searched for Bryce ("search for anthropic plugins or skills that could be helpful for development, skills, mcps, Claude
Md, insights"): the claude.ai plugin catalog (Anthropic Directory + Knowledge Work marketplaces), the MCP connector
registry, the `anthropics` GitHub org, and the web (official docs first). Each row maps to a pain point in
[`docs/plans/2026-10-16-agent-friction-fix-plan.md`](../plans/2026-10-16-agent-friction-fix-plan.md). "UNVERIFIED"
means only a listing or third-party page was seen.

## Built-in Claude Code features we under-use (highest payoff, no install)

| feature | what it gives us | plan theme | source |
|---|---|---|---|
| Subagent frontmatter `model`, `maxTurns`, `omitClaudeMd`, `isolation: worktree`, `skills` | read-only agents (finding-verifier, prior-art-scout, ci-watcher…) stop loading all of AGENTS.md and can run on a smaller model | B (context cost) | https://code.claude.com/docs/en/sub-agents |
| Skill frontmatter `context: fork`, `allowed-tools`, `model`, `paths`, `disable-model-invocation`, `user-invocable`; SKILL.md < 500 lines | the `/check` `/ship` `/handoff` skills (#2398) as user-invocable forks; heavy skills stop inflating the main context | B, C | https://code.claude.com/docs/en/skills |
| `/usage` (attribution to skills, subagents, plugins, MCP servers; prompt-cache misses with cause) and `/context` | measures theme B per session instead of inferring it from transcripts | B | https://code.claude.com/docs/en/costs |
| `/insights` — HTML friction report over recent local sessions, with suggested CLAUDE.md rules | a cheap recurring version of this transcript mining, per container | all | https://code.claude.com/docs/en/costs ; third-party guides e.g. https://blog.vincentqiao.com/en/posts/claude-code-insights/ |
| Statusline JSON `rate_limits.five_hour` / `seven_day` `used_percentage` + reset time, `context_window.used_percentage` (Pro/Max, after the first response) | a visible usage meter and context meter — the inputs the quota gate (#2380) and the ~300 k hand-off rule need | A, B | https://code.claude.com/docs/en/statusline ; https://skoula.cz/blog/2026/6/how-to-display-context-and-5h-7d-limits-in-the-claude-code-status-bar/ |
| `/rate-limit-options` and the managed setting `autoContinueAtUsageLimit` (waits for the reset and continues; cloud-session reach UNVERIFIED) | replaces "limit has reset, try again" typed by hand | A | https://code.claude.com/docs/en/interactive-mode |
| Monitor tool (each output line wakes the session; exits on the command's exit) | the sanctioned waiter for #2383 / #2384 / #2386 | D | https://code.claude.com/docs/en/tools-reference |
| Hook `if` field (one permission rule; Pre/PostToolUse, PermissionRequest/Denied), Stop `decision:block`, PostToolUse `updatedToolOutput`, async hooks | #1711 (in flight); trimming huge tool output before it lands in context; a PostToolUse(Read) image counter (#2399) | D, H, J | https://code.claude.com/docs/en/hooks |
| MCP tool search (deferred tool definitions, on by default), `MAX_MCP_OUTPUT_TOKENS` (default 25 k), large text results saved to a file | already why `list_events` spills; lowering the cap or keeping it explains the 58–410 k-char `actions_list` spills | D, I | https://code.claude.com/docs/en/mcp |
| Auto-mode denial thresholds (3 in a row / 20 total, then a prompt), `/permissions` "Recently denied" with retry, `autoMode.allow` config | the classifier false positives on read-only calls (plan WS7) | H | https://code.claude.com/docs/en/permission-modes |
| Image limits: 32 MB request, 10 MB per image, 2000 px cap once a request holds > 20 images; Files API `file_id` | the two sessions that died on `Request too large (max 32MB)` (#2399) | J | https://platform.claude.com/docs/en/build-with-claude/vision |
| OpenTelemetry metrics (`claude_code.cost.usage`, token usage, by skill / agent / plugin / MCP server) | a fleet cost ledger without scraping transcripts (#1714) | B | https://code.claude.com/docs/en/monitoring-usage |

## Plugins (claude.ai catalog and `claude-plugins-official`)

| plugin | publisher | what | fit here | install |
|---|---|---|---|---|
| **hookify** | Anthropic | `/hookify <instruction>` writes warn/block rules (bash, file, stop, prompt) without hand-editing hook scripts | med — turns repeated corrections into rules; our bash-guard already covers the big ones | `/plugin install hookify@claude-plugins-official` |
| **plugin-dev** | Anthropic | skill / agent / hook development skills plus `skill-reviewer` and `plugin-validator` agents | med — reviewing our 30+ skills against current frontmatter rules | catalog, or `/plugin install plugin-dev@claude-plugins-official` |
| **code-review** | Anthropic | `/code-review` — 4 parallel reviewers, confidence-scored, posts to the PR | med-low — overlaps the built-in code-review skill and Claude Code Review | catalog card shown 2026-10-16 |
| security-guidance | Anthropic | pattern checks on edits + Stop-hook review | low — adds Stop-hook noise (theme H) | `/plugin install security-guidance@claude-plugins-official` |
| skill-creator, claude-md-management, claude-code-setup, commit-commands, feature-dev, pr-review-toolkit | Anthropic | names verified in the official listing; contents UNVERIFIED | check before adopting | `/plugin install <name>@claude-plugins-official` |
| **CI Optimizer** | community (directory-reviewed) | finds missing caches, wasted runs, missing timeouts, flaky tests from real run times | med — epic #1949 | catalog card shown 2026-10-16 |
| **parallax-threejs** | community | Three.js/GLSL debugging: scene graph + console + GL state + pixels, Spector, `threejs-devtools-mcp`, SHA-indexed visual regression | med-high for renderer work (TLX is three.js); needs a live browser tab, so test it in a session with the harness Chromium before adopting | catalog |
| Responsive Check | community | phone/tablet/desktop screenshots, overflow finder | low — `survey-ui-matrix` already does this | catalog |

`/plugin` caveat: the plugins page says a claude.ai/code cloud session does not load plugins from LOCAL settings;
whether a committed project `.claude/settings.json` plugin entry reaches cloud sessions is UNVERIFIED — test one plugin
in one cloud session before relying on it (https://code.claude.com/docs/en/plugins).

## MCP servers

| server | fit here | note |
|---|---|---|
| GitHub MCP (in use) | tighten | `--toolsets` allow-list / `--read-only` for reviewer agents shrink tool context (https://github.com/github/github-mcp-server) |
| `threejs-devtools-mcp` | try for TLX | `claude mcp add threejs-devtools-mcp -- npx threejs-devtools-mcp`; ~59 tools; bridges via the page's `__THREE_DEVTOOLS__` hook over WebSocket (https://socket.dev/npm/package/threejs-devtools-mcp) |
| Playwright MCP (in use as playwright-official) | tighten | `--image-responses omit` keeps screenshots out of context (theme J) (https://github.com/microsoft/playwright-mcp) |
| Sentry | later | only if the game reports runtime errors somewhere; nothing to read today |
| Context7 (in use) | keep | low value for a no-build game; cheap when deferred |

## GitHub

- `anthropics/skills` (Agent Skills repo; doc skills are source-available, not all Apache), `anthropics/claude-plugins-official`, `anthropics/claude-plugins-community`, `anthropics/claude-code-action` (Claude on PRs from Actions), `anthropics/claude-code-security-review` (security-review Action), `anthropics/defending-code-reference-harness`. Reading them needs `add_repo` in a session (this one is scoped to the game repo).

## Recommended next steps (folded into the plan as WS10)

1. Subagent frontmatter pass: `omitClaudeMd` + a smaller `model` + `maxTurns` on every read-only agent in `.claude/agents/` (S, theme B).
2. A committed statusline script showing context % and the 5 h / 7 d usage % (S, themes A, B), and a line in the quota gate to read it.
3. Playwright MCP `--image-responses omit` by default, screenshots only on request (S, theme J).
4. Run `/insights` and `/usage` in one long session and compare with this mining (S, all).
5. Trial `threejs-devtools-mcp` (or the parallax-threejs plugin) on one TLX bug in one session; adopt only with a measured win (M, renderer).
6. Install hookify + plugin-dev in one session to review skills and turn the top three repeated corrections into rules (S).
