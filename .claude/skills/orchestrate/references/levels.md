# Orchestrate — per-level procedure

Contents: auto · ask · ask+. Use when: SKILL.md picked a level. Inputs: the task, issue or goal. Writes: PR bodies,
labels, launch comments only. Verification: every PR in scope shows `land` and a merged state.

## auto (cloud session, never asks)

1. From the attended chat: launch yourself with `create_session` (same launch gate), `append_system_prompt` naming
   level=auto, the task, the caps and the NEVER list; reply with the session link and stop. In the launched session,
   continue below.
2. Plan, fan out, answer children from repo > Plan > quoted relays > own judgement (record each pick in the PR body).
3. A reserved item (NEVER list 3–4) never blocks the rest: label the PR `needs-decision`, comment once with options
   and your pick, work the other PRs.
4. Finish when every PR is merged or parked; the final message lists PR links and parked items.

## ask (attended chat, default)

Same as auto, but a reserved item (a refusal, a settings change, a budget or ratchet question) goes to Bryce through
`AskUserQuestion` once, with `needs-decision` and one comment in the same turn. Everything else is yours to answer.

## ask+ (attended chat)

Before fanning out, put each plan and scope decision to Bryce, one `AskUserQuestion` per decision with your pick first;
then the `ask` rules during the run. Decide only mechanical steps yourself (which spec to run, commit wording).
