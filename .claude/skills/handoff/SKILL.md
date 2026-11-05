---
name: handoff
description: "Use when the user asks for a handoff or a prompt to continue in a new session, the session is long or near its context limit, or a worker hits its cap. Not for: editing skills or AGENTS.md → agent-config; driving a PR → steward."
user-invocable: true
---

# /handoff — a paste-ready cold-start prompt

A new session starts with no memory and an unfetched branch, so the hand-off
carries everything it needs. Never write a `HANDOFF` file to the repo root: a
cold clone cannot see it.

The cap is the brief's `STOP AT` line; `.claude/hooks/context-cap.py` advises on live context against it and refuses
spawns over the hard cap; a session without a brief has no cap and hands off when the user asks or the context is
long. Before idling, write the follow-up prompts into the PR's Hand-off block. Model names and messaging routes are
host-specific; use only exposed host capabilities.

An attended handoff returns a prompt in chat after updating the PR. An unattended owner at its cap refreshes the
PR and requests `/apex recover`; a successor is not launched until trusted recovery confirms no live owner remains.
Neither a comment nor a changed Hand-off owner field transfers a lease.

1. Push verified work under AGENTS rule 12. List unverified paths and failed checks honestly; never bypass a commit
   hook to preserve a checkpoint. Record any unstaged work that remains local to this workspace.
2. Read the actual branch/PR head and refresh the living Plan, Verified / Not run and Hand-off fence with head,
   descriptive owner and next step. Include coordinator request/attempt identities where available. Read back the
   update; success proves the report was saved, not that a successor started.
3. The cold-start prompt names repository, branch, pushed head, PR URL, goal, done/now/next, OWNED/FORBIDDEN paths,
   grants with their source, needed checks not run, failures and accessible evidence. Local artifacts remain local
   unless transferred. Preserve queue pauses and pending decisions; an app-mediated removal cannot lift an owner's
   pause. Do not claim merge approval or ownership based on the previous agent's prose.
4. First commands: inspect status, read AGENTS, fetch the branch and compare the resolved head with the recorded
   SHA. Use an isolated worktree if another session owns the checkout. Verify coordinator ownership before edits;
   `/apex recover` is a request, never permission to displace a live owner.
5. Keep the prompt under about 25 lines and link the PR for detail. Record armed subscriptions/background handles
   and exact run/log identities without promising capabilities the new host does not expose.

A hunt/survey files scoped findings as unqueued issues or a tracking issue with an index entry linking its reports.
Queue only executable scope after dependency, batch and overlap checks. Protocol and shadow rollout: `docs/ACTIONS.md`.
