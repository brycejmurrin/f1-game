CHANGELOG: add a fragment `docs/changelog.d/<slug>.md` (lines `Fixed: …`; never edit CHANGELOG.md), or write `no player-facing change`.
A PR that changes `.claude/memory/` adds, under this line, `memory-change: <reason>` (ready-gate refuses it otherwise).

## Goal
<!-- Written when the PR opens, before the work is done; edit only if the ask changes.
     What the user asked for, in their words, and the change this branch makes to
     deliver it — enough for an agent arriving cold to continue without the chat.
     Picked from the backlog? Add `Closes #<n>` (AGENTS.md §Coordination). -->

## Plan
<!-- The LIVING checklist — the first thing a pickup agent reads. Write it when the
     PR opens; edit the body (GitHub MCP update_pull_request — no push needed) the
     moment an item changes, not only at a push:
       - [x] done — append the evidence: commit sha, verdict line, file
       - [ ] todo — one verifiable step each; add work you discover as you go
       - [ ] **now:** the step in progress (exactly one), so a pickup knows where you stopped
       - [ ] ~~dropped~~ — strike it and say why; never delete an item
       - [~] deferred — work moved to a follow-up issue (or start the text with `Deferred:`); counts as closed
     Tick an item only with its evidence; "should work" is a [ ]. Never add a "merge"
     item: `ready-gate.mjs --pr <n>` refuses while one stays open. -->
- [ ] **now:**
- [ ]

Request merge with `/apex merge` after the implementation Plan is complete. This is intent, not proof of validation
or permission to bypass a pause. The reset runtime starts in shadow mode; see `docs/ACTIONS.md`.

## Verified / Not run
<!-- Each check you ran and its verdict line, e.g. `tooling-fast --changed = tooling-fast passed`.
     Every group the change needs that did NOT run, named, with why (AGENTS.md rule 9).
     Draft feedback is bounded; comprehensive affected validation is required before merge. A queue entry is not a pass. -->

## Hand-off
<!-- The dispatch Action and a takeover read this block (skill `steward`): refresh it at every push and
     when requesting merge or recovery. One value per line, no prose outside the fence.
     Ownership comes from the coordinator reservation, not this descriptive block; pause with queue:paused. -->
```handoff
head: <sha>
owner: <host>:<session or agent id>
next: <the one next step>
```

## Locale checklist
<!-- Fill when this PR adds or edits `locales/<lang>.json` (non-en) or migrates a
     screen to I18n.t / data-i18n. Skip with "n/a" otherwise.
     Lint: `node tools/check/i18n-lint.mjs` and `node tools/check/i18n-lint.mjs --guard`. -->
- [ ] `node tools/check/i18n-lint.mjs` is green (unknown keys, placeholders, CLDR plurals)
- [ ] Placeholder sets match English; every CLDR plural category for the language is present
- [ ] `locales/manifest.json` row: `status` is `beta` until a native speaker reviews, then `reviewed`
- [ ] If this PR migrates a screen: path(s) appended to `tests/data/i18n-migrated.json` in the same commit
- [ ] No new hard-coded user-facing literals in migrated files (`i18n-lint --guard`)
