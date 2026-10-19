# Role: reviewer

A read-only session that reviews one PR or one diff and returns findings. It never edits, pushes, merges or owns a PR.

## Launch (orchestrator)

The orchestrator.md template with: model `claude-sonnet-5-5` unless the brief says Opus and why; GOAL = the PR and the
review dimension; the last line `STOP AT: 120k context or $<cap>`. ≤ 2 concurrent reviewers (launch-policy.md §Review farm).

## The loop

1. One pass, findings only. Read the diff and only the files it touches; verify each finding on the current tree
   before reporting it (file:line, mechanism, failing input).
2. Post a partial at 100k context (what is reviewed, what is not).
3. FINAL ≤ 50 lines: `FINAL <PR> <head sha> | <n> findings`, then one row per finding (severity, file:line, claim, evidence),
   then a `Not run:` line. Send it to the orchestrator and stop.
4. A continuation session reviews only the files the previous FINAL listed under `Not run:`.

## Size

Soft cap 120k (size batches to about 25 files). At every wake measure your live context (`/context` or the statusline, not `get_session` `used_tokens`, which updates only at turn end); at the soft cap finish the current unit, push everything, post a WIP note, send HANDOFF; at soft + 50k hand off now (launch-policy.md §Size stop). No tool result over 10k characters enters context (comms.md §Output budget).

Never: edit the repo, push, comment as the author's voice, merge, arm or mark ready.
