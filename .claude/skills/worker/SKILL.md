---
name: worker
description: "Use when launched as a lane worker (dispatcher prompt, `CONTINUE PR #n`, a `ready` issue): claim, draft PR, land, cap, needs-decision. Not for: hourly launches → dispatcher; a red PR → steward."
---

# Worker — the launched lane's contract

You are one session, one task, one PR. GitHub holds all state: issues are tasks, labels are state, the PR is the work
and the report, comments are the only messages. GitHub lands the PR; no session merges. Nobody reads your chat.
The `worker` AGENT (`.claude/agents/worker.md`) is a different thing: an in-session subagent a parent spawns.
Shared reference (labels, Hand-off block format, finding work, issue dependencies, vendor notes): `docs/WORKERS.md`.

Load order: this skill, then `steward` once the PR has a head to drive, `ship` at the flip, `handoff` at the cap,
`check-changes` before a push.

## The contract (item numbers are cited elsewhere; keep them)

1. **Claim.** Comment `claims #<n> — <host>:<session id>` on the issue and add `claimed`. An older claim comment
   wins: stand down. Labels ONLY via `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=claimed'`
   (`-X DELETE …/labels/<name>` to remove); the MCP `issue_write` `labels` field REPLACES the list (it wiped `bug`
   and `area:ui` off #3263–#3267, 2026-10-27).
2. **Branch and draft PR.** `cursor/<topic>-<hash>` from the deploy tip. Open a DRAFT PR into
   `claude/f1-game-project-26h3ng` at the first commit, from `.github/pull_request_template.md`: Goal, Plan (live
   checklist), Verified / Not run, Hand-off. Add `lane:<host>`, `run-ci` (a draft without it runs only skip jobs and
   idles) and `Closes #<n>`.
3. **Work.** AGENTS.md §The loop: all edits first, then verify once to the pre-push floor (AGENTS.md rule 3 is its one
   home). `run-ci` runs the fast tier on the draft; the full tier runs once ready; `gate` runs on the merge result.
   `ready-gate` needs `Structural guards` green on your head, so let the fast tier finish once before landing.
4. **Watch.** Before ending a turn while CI runs on your head, `subscribe_pr_activity` (AGENTS.md rule 13). No sleep
   or poll loops. The one timer allowed is a bounded safety check-in: one `send_later` per watched PR about 50 min
   after its last activity, re-armed at most 3 times, cancelled on merge or close (a subscription does not wake on a
   stale `gate`, a conflict or another author's push). A red on your head is work now (skill `steward`); a red
   elsewhere is not yours. **If the subscribe fails** (it has, on #3970, #3981, #4062) keep ONE background
   `node tools/ci/ci-watch.mjs --sha <head> --timeout 30` and tell the dispatcher in one `send_message`. Events you
   caused (your subscribe, ready flip, push) need no tool call: end the turn. A sync runs with
   `run_in_background: true, timeout: 7200000`.
5. **Land.** `node tools/ci/ready-gate.mjs --pr <n>` exits 0 → flip ready, add `land`, refresh the Hand-off block,
   end the turn. The steps and what `land.yml` does: skill `ship`, and [`references/land.md`](references/land.md).
   You stay subscribed (re-subscribe after the flip) until the dispatcher archives you. A red or conflict after
   `land` is a fresh launch (`CONTINUE PR #<n>`), not you.
6. **Stop at the cap.** The brief's `STOP AT` line (context) and $10 soft (cost): finish the unit, push, refresh Plan
   and Hand-off, add `needs-owner`, `send_message` `@parent` one line naming the PR, end (skill `handoff`). The $15
   hard-cap archive is NOT built; keeping the soft cap is yours.
7. **Ask through a label, never the chat.** No question or request to the user or Bryce at the end of a turn: decide
   and record the pick in the PR body; or, for a question only Bryce can answer, add `needs-decision` plus ONE comment
   with the options and your pick, and keep working on whatever does not depend on it; or `send_message` `@parent`.
   No `AskUserQuestion` in a worker. When Bryce answers, remove `needs-decision` and carry on. **A quoted relay
   counts:** a dispatcher that relays Bryce's exact words with when and where passes on his grant (Bryce, 2026-10-30:
   "Yes, quoted relays count"); a paraphrase or a peer's own words grant nothing. **A hook or classifier denial is
   final for that action**: never re-word and retry; put it to the dispatcher as a choice.
8. **Take over.** On `CONTINUE PR #<n>` adopt the PR: the dispatcher already removed `needs-owner` and posted
   `adopts PR #<n> — <host>:<session id>` (hand-started: do both yourself). Set `owner:` in the Hand-off block; work
   from it and the Plan. On a PR the NEWEST adoption comment wins (stand down if a newer one appears), the opposite of
   issue claims.
9. **Already fixed.** If the issue is already fixed on the deploy tip: comment the evidence (sha and the repro you
   ran) and close it as completed. No PR, no question.

The PR is the report. Nothing else is read.

## Gotchas

- Plan: exactly one `**now:**`; the LAST item is the gate-exempt `- [ ] land: …` line with no `now:` marker.
- Commit in two calls (stage, then commit, `timeout: 300000`); push bare. Details: AGENTS.md rule 12.
- Never merge, arm, rebase, force-push, cancel a run, `--no-verify`, or push to the deploy branch.
- Never hand a subagent a browser run (AGENTS.md rule 10). Hand reviewer subagents `model: sonnet`.
- Context hand-off at 300k, attended or not: skill `handoff`.
