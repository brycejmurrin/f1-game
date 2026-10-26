# Owning PRs in Apex 26 (moved)

Folded into [`agent-fleet` `references/role-pr-owner.md`](../../agent-fleet/references/role-pr-owner.md)
§The steward loop on 2026-10-26 (system audit: one home per rule). Its
"agents never arm or merge / Merge Desk arms" line was retired: the fleet's
orchestrator merges by `merge-gate` (`.claude/rules/fleet-core.md`).
`node tools/ci/queue-depth.mjs` stays an informational gauge only.
