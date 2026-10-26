CHANGELOG: add a fragment `docs/changelog.d/<slug>.md` (lines `Fixed: …`; never edit CHANGELOG.md), or write `no player-facing change`.
A PR that changes `.claude/memory/` adds, under this line, `memory-change: <reason>` (ready-gate refuses it otherwise).

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
       - [~] deferred — work moved to a follow-up issue (or start the text with `Deferred:`); counts as closed
     Tick an item only with its evidence; "should work" is a [ ]. Never add a "mark
     ready" or "merge" item: `ready-gate.mjs --pr <n>` refuses while one stays open. -->
- [ ] **now:**
- [ ]
- [ ] READY to ORCH <L> via agent-msg (the orchestrator's merge-gate and merge follow)

The last Plan item keeps that shape: ready-gate ignores an item that starts `READY to`, so it stays open until the READY is sent.

<!-- Merge hold (the rule: .claude/rules/fleet-core.md): add, outside this comment,
     `MERGE-HOLD: <reason> | lift: <who> | until: <time or event>` and delete it when
     the hold is over. A wait on something ("deploy gate pending") is a Plan item,
     not a hold. Never paste "do not merge" wording here. -->

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

## Locale checklist
<!-- Fill when this PR adds or edits `locales/<lang>.json` (non-en) or migrates a
     screen to I18n.t / data-i18n. Skip with "n/a" otherwise.
     Lint: `node tools/check/i18n-lint.mjs` and `node tools/check/i18n-lint.mjs --guard`. -->
- [ ] `node tools/check/i18n-lint.mjs` is green (unknown keys, placeholders, CLDR plurals)
- [ ] Placeholder sets match English; every CLDR plural category for the language is present
- [ ] `locales/manifest.json` row: `status` is `beta` until a native speaker reviews, then `reviewed`
- [ ] If this PR migrates a screen: path(s) appended to `tests/data/i18n-migrated.json` in the same commit
- [ ] No new hard-coded user-facing literals in migrated files (`i18n-lint --guard`)
