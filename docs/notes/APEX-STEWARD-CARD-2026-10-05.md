# Apex steward card — 2026-10-05

Always-on card for cloud / Grok sessions. Source: agent-efficiency audit
2026-10-05 ranked fixes 1, 3, 6, 12. AGENTS.md holds the enforceable one-liners;
this note caches only the three sources named by HASHES. Do not re-read
`.claude/skills/steward/SKILL.md`, `.claude/skills/check-changes/SKILL.md`, or
`.github/pull_request_template.md` unless a HASH below changes (or you are
editing that file). Refresh HASHES with the first 8 hex of `sha256sum` on those
three files. The skip promise does not cover fleet authority, merge levels,
readiness, or queue policy: read the checkout's [AGENTS.md](../../AGENTS.md),
[fleet-core](../../.claude/rules/fleet-core.md), and
[merge authority](../../.claude/skills/agent-fleet/references/role-merge-holder.md)
for those decisions. These owners apply independently of the card's HASHES.

```text
APEX STEWARD CARD (do not re-read steward / check-changes / PR template unless HASH changes)
- PR body = session log, opened at the first commit: template fields Goal, Plan
  (live - [ ] checklist, ticked with evidence as items land, one **now:**),
  session-status --pr, Verified/Not run, Next. No committed per-session doc.
- Pre-push → check-changes (spawns verify-agent). Red ci/pages → ci-red-triage
  then steward overrides only (draft/ready dedupe; sync-pr.mjs not hand merge;
  who-is-on-it before shared red; live = Pages + version.json).
- Review / hunt findings on a PR → finding-verifier before any fix.
- After every push: subscribe on the PR (Claude Code subscribe_pr_activity;
  Cursor subscribe_github_ci + subscribe_github_pr) plus one timer
  (send_later / subscribe_timer) and ci-watch --once on each wake (no
  shell-poll loops while subscribed).
- Sync only CONFLICTING/DIRTY or required tip red. Claim via who-is-on-it --claim.
- Branch: cursor/<topic>-<hash> → ship claude/f1-game-project-26h3ng.
HASHES: steward=257bd05d check-changes=2b1a7f34 pr-template=f25176e7
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

Merge, auto-merge, readiness and queue decisions use the canonical checkout
owners linked above. This card does not cache their role assignments or grant
permission. Worker launch constraints come from the checkout's
[launch policy](../../.claude/skills/agent-fleet/references/launch-policy.md).
