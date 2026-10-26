# Apex steward card — 2026-10-05 (trimmed to pointers 2026-10-26)

Superseded by: [Rulebook rewrite 2026-10-26](RULEBOOK-REWRITE-2026-10-26.md)

Always-on card for cloud / Grok sessions. Do not re-read
`.claude/skills/steward/SKILL.md`, `.claude/skills/check-changes/SKILL.md` or
`.github/pull_request_template.md` unless a HASH below changes (or you are
editing that file). Refresh HASHES with the first 8 hex of `sha256sum` on those
three files. Since 2026-10-26 the card restates no rule: each line points at the
rule's one home (`docs/notes/RULEBOOK-REWRITE-2026-10-26.md`).

```text
APEX STEWARD CARD (do not re-read steward / check-changes / PR template unless HASH changes)
- PR body = session log, opened at the first commit: AGENTS.md rule 12.
- Pre-push → check-changes (spawns verify-agent). Red ci/pages → ci-red-triage, then the steward overrides.
- Review / hunt findings on a PR → finding-verifier before any fix.
- After every push: subscribe + one timer, ci-watch --once per wake: AGENTS.md rule 13.
- Merge, hold, ready, sync, authority: .claude/rules/fleet-core.md. Claims: AGENTS.md §Git branch & deploy.
- Branch: cursor/<topic>-<hash> → DRAFT PR into claude/f1-game-project-26h3ng.
HASHES: steward=d65a027e check-changes=7d6a30a9 pr-template=58bfba2b
```

Lane mutexes, the merge-train exclusion and the merge role moved to
`.claude/skills/agent-fleet/references/launch-policy.md` and `.claude/rules/fleet-core.md`;
the card's 2026-10-05 "only Merge Desk arms auto-merge" line is retired (the fleet's
orchestrator merges by `merge-gate`).
