CHANGELOG: add a player-facing entry under the current `build` in CHANGELOG.md, or write `no player-facing change`.

## Goal
<!-- Written when the PR opens, before the work is done; edit only if the ask changes.
     What the user asked for, in their words, and the change this branch makes to
     deliver it — enough for an agent arriving cold to continue without the chat.
     Picked from the backlog? Add `Closes #<n>` (AGENTS.md §Backlog). -->

## Plan
<!-- The LIVING checklist — the first thing a pickup agent reads. Write it when the
     PR opens; edit the body (GitHub MCP update_pull_request — no push needed) the
     moment an item changes, not only at a push:
       - [x] done — append the evidence: commit sha, verdict line, file
       - [ ] todo — one verifiable step each; add work you discover as you go
       - [ ] **now:** the step in progress (exactly one), so a pickup knows where you stopped
       - [ ] ~~dropped~~ — strike it and say why; never delete an item
     Tick an item only with its evidence; "should work" is a [ ]. Marking ready and
     merging are not Plan items: `ready-gate.mjs --pr <n>` refuses while one stays open. -->
- [ ] **now:**
- [ ]

<!-- Merge hold: to block merging AND arming, add a line that STARTS with
     `MERGE-HOLD: <reason>` right here, outside this comment; delete that line as
     soon as the hold is over. It is the ONLY veto. "do not merge", "do not enable
     auto-merge" or any other wording is NOT a veto: never paste such lines here.
     Every merge is a merge commit (AGENTS.md §Cursor Cloud specific instructions). -->

## Status
<!-- Paste `node tools/ci/session-status.mjs --pr` output here and refresh it at every push.
     It is generated from git, the test logs and the PR; do not hand-edit it. -->

## Verified / Not run
<!-- Each check you ran and its verdict line, e.g. `test:tooling-fast = run passed`.
     Every group the change needs that did NOT run, named, with why (AGENTS.md rule 9). -->

## Next step / handoff
<!-- What the next agent (or you, after a restart) should do first; blockers and open
     questions for the user; anything half-done in the tree or uncommitted.
     "Done — ready for review" when every Plan item is ticked or struck. -->
