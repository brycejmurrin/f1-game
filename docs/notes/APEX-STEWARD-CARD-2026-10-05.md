# Apex steward card — 2026-10-05

Always-on card for cloud / Grok sessions. Source: agent-efficiency audit
2026-10-05 ranked fixes 1, 3, 6, 12. AGENTS.md holds the enforceable one-liners;
this note is the card text + hashes. Do not re-read
`.claude/skills/steward/SKILL.md`, `.claude/skills/check-changes/SKILL.md`, or
`.github/pull_request_template.md` unless a HASH below changes (or you are
editing that file). Refresh HASHES with the first 8 hex of `sha256sum` on those
three files.

```text
APEX STEWARD CARD (do not re-read steward / check-changes / PR template unless HASH changes)
- PR body = session log: refresh from .github/pull_request_template.md fields
  (Goal, session-status, Verified/Not run, Next). No committed per-session doc.
- Pre-push → check-changes (spawns verify-agent). Red ci/pages → ci-red-triage
  then steward overrides only (draft/ready dedupe; sync-pr.mjs not hand merge;
  who-is-on-it before shared red; live = Pages + version.json).
- After every push: subscribe on the PR (Claude Code subscribe_pr_activity;
  Cursor subscribe_github_ci + subscribe_github_pr); at most one
  ci-watch --once (no shell-poll loops while subscribed).
- Sync only CONFLICTING/DIRTY or required tip red. Claim via who-is-on-it --claim.
- Branch: cursor/<topic>-<hash> → ship claude/f1-game-project-26h3ng.
HASHES: steward=0df3229a check-changes=a5e8d0b5 pr-template=b3157d7c
```

MCP: call `get_mcp_tools` / schema discovery once per session (or once per
server id). Cache schemas; do not re-fetch. Harness / platform knob — docs can
only state the rule.

## Lane mutex (cloud)

| Surface | Owner lane | Edit rule |
|---|---|---|
| Garage / title CSS (`css/*` garage chrome, title, menus that the UI Survey wave owns) | UI Survey | Other lanes stand down |
| `js/car/*` | Cars | Other lanes stand down |
| `js/circuits/scenery/*` (and that circuit's scenery dress) | Tracks | Other lanes stand down |
| `js/game.js` | whoever holds `who-is-on-it --claim` | Explicit claim before edit |

Resolve swarm: red/dirty PRs with no specialist owner. One `--claim` per PR;
stand down if a specialist already owns the paths. Cap concurrent resolve
agents; do not pile onto a specialist's PR.

## Branch naming

New topic work: `cursor/<topic>-<hash>` → DRAFT PR into ship
`claude/f1-game-project-26h3ng`. No new `claude/<topic>` feature branches.
Legacy `claude/<topic>` PR heads stay; do not rename mid-flight unless
CONFLICTING. Ship / deploy branch name is unchanged.

Apex cloud: using-superpowers / brainstorming hard-gates are optional
references, not blockers. Prefer Apex skills (check-changes, steward, css-play,
survey-*).

## Merge-train exclusion — tooling/docs class

#979 / #981 / #969-class (tooling, MCP glue, prompt/AGENTS cleanup, plugin
install-only) stay off merge-train lists and per-PR resolve swarms. Batch small
tooling/doc fixes into one PR. CI red on that class: one optional sync+re-run,
no swarm. A docs change that ships with player-facing `js/`/`css/` stays on
the normal train once green.

Only CI Watch arms auto-merge (SQUASH only) on ready PRs; agents/sessions/tools
never arm or merge — mark ready at tip-green. Disable any foreign MERGE/REBASE
arm and tell CI Watch + Grok Bot. Sync by merging
origin/ship; never rebase or force-push. Launch prompts carry
`Do not enable auto-merge or merge.`
