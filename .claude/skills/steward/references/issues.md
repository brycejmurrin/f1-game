# Finding work and dependencies

Search open issues with `label:queue:ready` to find requested work, then consult the coordinator's ledger for
actual eligibility and ownership. A label search alone does not authorize a launch or takeover.

Native `blocked_by` issue relationships express prerequisites. Read the actual blocking issue states; unreadable
relationships remain pending. Record real dependencies using GitHub's dependencies API: the POST `issue_id` is the
blocking issue's numeric id, not its issue number. Do not infer prerequisites from arbitrary body references.

Use `/apex batch #123 #456` on a parent to request explicit ledger membership. Implementation and merge ordering
are separate decisions. A parent and members cannot dispatch duplicate scopes. Legacy body Members sections need
an explicit migration mapping; a tracking issue is not automatically an implementation task.

File findings without queue labels, with scope and an observable acceptance check. Enqueue executable work
explicitly after checking overlap, dependencies and batching. `docs/ACTIONS.md` owns rollout and command authority.

Migration provenance: `docs/notes/AGENT-WORK-TRACKING-2026-10-14.md` records the original native-dependency
rollout and API evidence. Preserve that history when importing relationships; its old label procedures are retired.
