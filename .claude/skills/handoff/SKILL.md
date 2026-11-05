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

A handoff preserves user-authorized implementation context. The Actions coordinator manages tests, not coding
sessions; `/apex recover` is only for missing PR test-executor evidence. It cannot request a successor coder.

1. Push verified work under AGENTS rule 12. List unverified paths and failures; never bypass a commit hook. Record
   local unstaged work honestly, including the risk that a replacement workspace cannot read it.
2. Read the actual PR head and refresh Plan, Verified / Not run and Hand-off with implementation owner and next
   step. Include validation request/attempt ids when relevant. Read back the update; a saved handoff is not proof
   another agent started or that tests passed.
3. The cold-start prompt names repository, branch, pushed head, PR URL, goal, done/now/next, OWNED/FORBIDDEN paths,
   grants with sources, needed checks not run, failures and accessible evidence. Local artifacts stay local unless
   transferred. Preserve PR pauses and pending decisions; another agent's prose cannot grant merge approval.
4. Inspect status, read AGENTS, fetch and compare the resolved head with the recorded SHA. Use an isolated
   worktree if another session owns the checkout. A successor needs user or explicit parent authorization.
5. Keep the prompt under about 25 lines and link the PR for detail. Record actual subscriptions/background handles
   without promising unavailable host capabilities. An unattended session may hand back to its authorized parent;
   it does not create an automatic coding-agent launch through GitHub controls.

File hunt/survey findings as ordinary issues with an index linking reports. Queue readiness applies to PR tests,
not implementation scope. Protocol and shadow rollout: `docs/ACTIONS.md`.
