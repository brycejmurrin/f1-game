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
     Tick an item only with its evidence; "should work" is a [ ]. Never add a "merge"
     item: `ready-gate.mjs --pr <n>` refuses while one stays open. -->
- [ ] **now:**
- [ ]
- [ ] land: add the `land` label once ready-gate exits 0

The last Plan item keeps that shape: ready-gate ignores an item that starts `land:`, so it stays open until the label is on and GitHub lands the PR (docs/WORKERS.md).

## Verified / Not run
<!-- Each check you ran and its verdict line, e.g. `tooling-fast --changed = run passed`.
     Every group the change needs that did NOT run, named, with why (AGENTS.md rule 9).
     The full tiers run on the PR (`run-ci` on a draft; the full tier once ready). -->

## Hand-off
<!-- The dispatcher parses this block (docs/WORKERS.md): refresh it at every push and
     when you add `land`, `needs-owner` or `needs-decision`. One value per line, no prose
     outside the fence. A hold is the `hold` label on the PR, not a line here. -->
```handoff
branch: <branch>
head: <sha>
owner: <host>:<session or agent id>
lane: claude | cursor | codex
verified: <what ran, verdict lines>
not-run: <groups the change needs that did not run, and why>
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
