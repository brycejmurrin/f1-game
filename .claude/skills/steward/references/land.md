# Trusted merge path

`/apex merge` on a PR requests merge of the current head; it grants no exception to validation, pause, approval
or branch protection. In shadow mode the reset runtime cannot merge. See `docs/ACTIONS.md` for rollout state.

Only a trusted finalizer may publish success for the required `gate` status, after verifying complete affected
validation for the exact expected head/base and independent approval where required. Test workers cannot write
that status. Missing evidence, changed head/base, API errors or cancelled tasks cannot become success.

Only the trusted merge path may merge a currently gated head, using a merge commit. Recheck pause, head, base,
intent and authoritative state immediately before merge. A race requeues the current request within its bounded
budget. Sessions never arm or disarm auto-merge, bypass a ruleset or use an alternate merge route.

Owner approval uses `/apex approve <sha>` for that exact head. Owner-established pauses remain sticky until the
owner resumes. A green PR is not proof that the release path successfully published it.
