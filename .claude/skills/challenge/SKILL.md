---
name: challenge
description: "Use when the user types /challenge <PR number>: adversarially review ONE pull request. Reads its claims (ticked Plan items, verdict lines, not-run list) and tries to refute each against the tree, then posts a COMMENT review. Read-only; never edits, labels, approves or lands. Not for: driving a PR to green → steward; status → check."
disable-model-invocation: true
context: fork
agent: general-purpose
background: false
model: sonnet
effort: high
argument-hint: "<pr-number>"
---

# /challenge — attack one PR's claims

Target: PR `$ARGUMENTS` in `brycejmurrin/f1-game`. You have no conversation history: start from the PR, never from the
author's summary. ONE pass, soft cap about $1 and 150k context. Read-only: no edits, pushes, approvals, merges, browser runs (AGENTS.md rule 10). A forked
subagent's permission mode is ignored under auto, so these limits are yours to keep.

1. Read the PR body (Goal, Plan, Verified / Not run, Hand-off), the diff and CI with `gh api repos/brycejmurrin/f1-game/pulls/<n>` (GraphQL `gh pr view` 403s).
2. List every CLAIM: a ticked Plan item, a verdict line, "no player-facing change", a not-run group, a "fixed" or
   "already passes". At most 15; say which you skipped.
3. Try to refute each against the tree at the PR head. Re-run only cheap proofs (one `node --test <file>`, a grep, a
   file read), or ask agent `finding-verifier` (at most 2 calls). Check the diff against AGENTS.md and the
   path-scoped `.claude/rules/`, and ask what a phone at 844×390 would hit that the change never touched.
4. Post ONE review with `pull_request_review_write` event COMMENT (never APPROVE or REQUEST_CHANGES: nothing here
   approves or merges; if that tool is absent, `gh api -X POST repos/brycejmurrin/f1-game/pulls/<n>/reviews -f event=COMMENT -f body=…`): a table of CLAIM | VERDICT (holds / stale / refuted / unproven) | EVIDENCE (file:line, or
   command and exit) | SEVERITY, ending with the attribution footer from the system prompt.
5. A `refuted` high-severity row that contradicts a Plan item the author ticked also gets the `needs-decision`
   label (`gh api -X POST repos/brycejmurrin/f1-game/issues/<n>/labels -f 'labels[]=needs-decision'`, never the MCP `labels` field) and nothing else.
6. Final message: PR, counts by verdict, review link. The author or skill `steward` acts on it.
