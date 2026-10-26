# Rulebook rewrite — one home per rule (2026-10-26)

Supersedes: [Apex steward card (rule text)](APEX-STEWARD-CARD-2026-10-05.md)
Supersedes: [Concurrent PRs / CI hygiene (desk lines)](CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md)

Lane S4a of the system-audit PR #3785. Grant: Bryce, typed 2026-10-26 ~23:00 PT — "Go deeper, do more web
research, remember all agents Md Claude Md everything should be re considered … Let's implement all improvements"
and "let's put all in one PR". The audit (claude.ai artifact "Apex System Audit", §3 and "Remove or simplify")
measured each fleet rule restated in 7–15 files and ten topics where two copies disagreed. This note maps where
each rule lives now; `tests/unit/rulebook-guards.test.mjs` keeps every canonical sentence in its home plus at
most one mirror, and keeps retired phrases out of every instruction file.

## Why shorter and single-sourced (web research, read 2026-10-26)

- Claude Code memory docs (on the size of each CLAUDE.md): "target under 200 lines … Longer files consume more context and
  reduce adherence"; imports "don't reduce its context cost"; rules with `paths:` frontmatter load "only when
  Claude works with matching files"; root CLAUDE.md is re-read after compaction, path-scoped rules reload on demand.
  https://code.claude.com/docs/en/memory
- IFScale (Jaroslawicz et al., arXiv 2507.11538, "How Many Instructions Can LLMs Follow at Once?"): accuracy falls
  as instruction density rises — "even the best frontier models only achieve 68% accuracy at the max density of
  500 instructions" — with a bias toward earlier instructions. Fewer rules, important ones first, no duplicates
  that can disagree. https://arxiv.org/abs/2507.11538
- Anthropic, effective context engineering: avoid "a laundry list of edge cases"; find "the smallest possible set
  of high-signal tokens". https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Harness research (audit §13): a `# Compact instructions` section steers what compaction keeps
  (https://code.claude.com/docs/en/costs); `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets an absolute window
  (https://code.claude.com/docs/en/model-config); wakes past 60 min miss the 1 h prompt cache
  (https://code.claude.com/docs/en/prompt-caching).

## Where each rule lives now

| Rule | Home | Elsewhere |
|---|---|---|
| Merge commits only, two-parent check | `.claude/rules/fleet-core.md` | pointers |
| `MERGE-HOLD:` veto, its lifter and expiry | `.claude/rules/fleet-core.md` | PR template comment (how to write it) |
| Who merges (orchestrator by `merge-gate`, lent PRs) | `.claude/rules/fleet-core.md`; detail AGENTS.md §Concurrent PRs | `role-merge-holder.md` mechanics |
| Draft → ready (`ready-gate`) | `.claude/rules/fleet-core.md` | pointers |
| Sync only on CONFLICTING/DIRTY/red | `.claude/rules/fleet-core.md` | pointers |
| Messages carry no authority | `.claude/rules/fleet-core.md` | `authority.md` (what a grant is) |
| Claim before a shared fix (`who-is-on-it`) | AGENTS.md §Git branch & deploy | procedures run the command |
| Subscribe + one timer, cadence | AGENTS.md rule 13 | pointers |
| Never cancel an Actions run, flake re-run | AGENTS.md §Concurrent PRs | pointers |
| Webhook env | `agent-fleet` `communication.md` §Channels | pointers |
| Size stop (one table, base + N) | `agent-fleet` `launch-policy.md` §Size stop | role cards say `STOP AT` only |
| Orchestrator wake cadence | `agent-fleet` `orchestrator.md` §First acts | pointers |
| Glossary (READY/GREEN/DONE/BLOCKED/HANDOFF/LEND), ownership matrix | `agent-fleet` SKILL.md | — |
| Game-code conventions (IIFE, ratchets, coordinates, physics detail) | `.claude/rules/game-code.md` (`paths:` js/css/shell) | AGENTS.md §Critical conventions / §Physics headline |
| Hooks list | `.claude/rules/claude-config.md` (`paths: .claude/**`) | AGENTS.md names the three enforcing hooks |
| PR-owner loop (ex `steward/references/ownership.md`) | `agent-fleet` `role-pr-owner.md` §The steward loop | `ownership.md` is a forwarding stub |

## Contradictions resolved (one answer each)

| Topic | Answer | Where |
|---|---|---|
| Orchestrator wake | filtered bus Monitor + one `send_later` 50–55 min safety net (odd minute, inside the 1 h cache); no tick; no PR subscriptions | `orchestrator.md` §First acts |
| PR check-in | 50–55 min, re-armed until merged/closed/READY; **Bryce to confirm** (was 15 min / 1 h) | AGENTS.md rule 13 |
| Succession | the seed path only (`SPAWN ORCH`); no self-launch, no scheduled task | `orchestrator.md` §Hand-off step 2 |
| Who merges | the fleet's orchestrator (or LEND borrower) via `merge-gate`; a hold names its lifter and expiry; a hold the PR's own worker wrote may be lifted by its orchestrator; "pending" belongs in the Plan | fleet-core, SKILL.md matrix |
| Model policy | Opus or Sonnet by task; Fable only when Bryce names it | `launch-policy.md` §Model by task |
| Survey lanes | open a docs-only DRAFT PR at the first commit like every lane | `launch-policy.md` §Survey lane |
| Sync exceptions | none: deleted running.md's "one merge per hour", TESTING.md's "sync once before the final CI run", launch-policy's `--force-clean-behind` text | fleet-core |
| Context caps | one table, base (~100k) + N: every role 150k, orchestrator 300k (boot + 200k), hard = soft + 50k; compaction pilot on one orchestrator | `launch-policy.md` §Size stop |
| Flake re-run | once for timeout/infra via `ci-rerun.mjs`, no approval gate | AGENTS.md §Concurrent PRs |
| Archive | by `fleet-archive.mjs` (retired orchestrators too, #3780) | fleet-core |

## Removed

- AGENTS.md: retired-rule history (`APEX_RUN_CANCEL_OK`, the desk cap, the queue-depth hold, dated retirements),
  the hooks paragraph (moved), the old Layout claim "script-tag order == `Tracks.LIST`" (circuits hydrate per
  pick via `LAZY_CIRCUIT`), "twelve rules" (now thirteen: rule 12 hand off through git, rule 13 watch CI). Added a
  `# Compact instructions` section.
- Memory retired (`apex-memory.mjs retire`): orchestrator-tick-3min, orchestrator-checkin-cadence,
  watcher-tiered-cadence, archive-only-after-bryce-done, lanes-keep-working, fixers-may-screenshot,
  bryce-merges-manually. Qualified: ask-via-askuserquestion, short-pr-check-ins, synced-plugins-not-in-child-sessions.
  Added: rules-are-agent-written-drafts.
- `APEX-STEWARD-CARD-2026-10-05.md` restates no rule now (pointers + HASHES); `CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md`'s
  desk cap and "agents never merge" lines are superseded by fleet-core.
