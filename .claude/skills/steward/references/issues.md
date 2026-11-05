# Issues and implementation context

Issues describe user work and native dependencies; the Actions coordinator does not intake issues, dispatch
coding agents, group implementation batches or assign coding-session leases. Work only on the user's request or
an explicitly authorized parent brief. File findings as unqueued issues with scope and observable acceptance.

Native `blocked_by` relationships can record actual implementation prerequisites. Read their real states; the
POST `issue_id` is the blocking issue's numeric id, not its issue number. Ordinary body references do not create
prerequisites. This context guides the implementation owner and does not turn an issue into an Actions task.

Ready PRs automatically enter the test queue; explicit `/apex merge` requests landing after complete validation.
See `docs/ACTIONS.md` for PR controls. Legacy claims/batch history is retained for audit, not converted to work.
Migration provenance: `docs/notes/AGENT-WORK-TRACKING-2026-10-14.md` records the original native-dependency rollout.
