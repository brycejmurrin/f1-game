# Hosts and protected deployment

All hosts follow the same queue contract in `docs/ACTIONS.md`. Native coding-agent identity belongs to the user-authorized brief, never coordinator ownership or a label. Claude Code, Cursor and Codex load `AGENTS.md`; `.agents/skills` mirrors canonical `.claude/skills`.
Use the host's actual subscription and background-task capabilities; absent tools remain absent.

A user-authorized implementation agent reads its task and PR, maintains the PR Hand-off, and has no authority to approve
its own changes, publish gate success or merge. A host with limited GitHub permissions reports the intended action
and missing capability rather than using prose or labels as an alternate grant. The coordinator does not launch, take over or recover coding sessions; `/apex recover` applies only to PR test infrastructure.

The protected deploy branch is `claude/f1-game-project-26h3ng`; the required commit status is `gate`, with
administrators bound and merge commits only. Check actual protection at cutover rather than inferring live
configuration from repository prose. Sessions never change protection or push directly to the deploy branch.

Trusted merge/release credentials stay outside untrusted test execution. The existing `LAND_TOKEN` is confined
to its trusted merge path; a fallback token that does not trigger downstream workflows does not prove publication.
Confirm the Pages run and live commit ancestry. Changing these files does not install credentials or alter rulesets.
