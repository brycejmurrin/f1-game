# Workers

The implementation contract is `.claude/skills/steward/SKILL.md` §Lane. Queue labels, reservations, command
provenance, validation capacity and shadow/cutover behavior are defined in `docs/ACTIONS.md`. The PR Hand-off
format is `.github/pull_request_template.md`; host notes are in steward's `references/vendors.md`.

A worker cannot self-claim through labels/comments, publish required gate success, merge or publish a release.
Use the trusted reservation identity and preserve the head, evidence and next step for a successor.

Implementation dispatch stays disabled until a trusted host adapter can authenticate startup and observe the exact
session lifecycle. Pending startup waits for native resume after trusted binding; never fire another worker to
resolve an in-flight response. See `docs/ACTIONS.md` and the saved `tools/ci/worker-prompt.md`.
