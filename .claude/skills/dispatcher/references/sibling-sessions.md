# Sibling sessions — one coordinating session, several workers

What a run of one coordinating session and five workers taught on 2026-11-18. Each rule names its home; this file
adds only what no other file said. Brief template and wave checks: [`orchestrator-brief.md`](orchestrator-brief.md).

## Channels

- `send_message` is a doorbell; the PR is the record (AGENTS.md §Coordination). A worker reports by message
  (`tools/ci/worker-prompt.md`), and anything a later session must know also goes in the PR body or a comment.
- A PR can be adopted by a session you did not launch, and on 2026-11-18 `send_message` to two such ids
  answered "resource not found". Before messaging an owner, read the newest `adopts PR #<n>` comment (skill
  `steward` §Lane 3).
  When the id it names is not one you launched, or a send fails, write ONE PR comment and stop sending to that id.
- A worker whose launcher does not answer does the same in reverse: the report goes in its own PR's Hand-off block.

## After `land`

- A worker's run ends at `land` (skill `steward` §Lane 7), and auto-merge is pinned to the head the gate measured
  (skill `steward` `references/land.md`), so a push re-gates it. "Keep working" sent to a session whose PR carries
  `land` is therefore research, not commits: a local commit is lost with the container. The one push such a
  session still makes is a fix for a red on its own head (skill `steward` §After land).
- The coordinator gives follow-up work a NEW brief on a new branch (a fresh session), never a second task for a
  `land` branch.
- A worker that found follow-up work after `land` writes it into a PR comment as text another session can redo: the
  file, the function, the change and its test. On 2026-11-18 two local commits were lost with their container; the
  one described that way (the hand-off comment on #5628) was rebuilt from the comment and merged the same day as
  #5688; the other still had to be redone.
- Before adding `land`, push everything you mean to keep: after it, new work is a new brief (above).

## Whose word

- What Bryce types to the coordinator binds the coordinator's session. It may decide inside a task it briefed; it
  cannot widen a worker's scope by repeating his words, because an agent's message grants nothing (AGENTS.md
  §Coordination; skill `steward` §Lane 6).
- A worker offered new scope that way is right to refuse. It asks on its own PR (`needs-decision` plus one comment)
  and carries on with what does not depend on the answer; the coordinator then raises that question with Bryce,
  whose own `decision:` comment or label on that PR is the grant.
- A brief's `ASK` line quotes Bryce as a fact about the task, with the time. It is not a grant either.

## One phone

Several lanes that want a reading from Bryce's phone share one bridge issue and one driver: skill `phone-bridge`
`references/many-lanes.md`.
