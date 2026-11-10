# The pre-push gate is a ladder — moved

Summary: The pre-push ladder: `test:guards` ⊂ `test:tooling-fast` ⊂ `deploy.mjs --gate-only`, with the measured sizes (`gen-ladder-figures.mjs` regenerates it). Read before judging a green rung as proof of the one above.

> **Historical record** (superseded): neither AGENTS.md rule 3 nor `tests/unit/docs-integrity.test.mjs` names this path any more, so the condition below for keeping this pointer has lapsed; the ladder lives in docs/VERIFICATION.md §4.

Kind: how-to

> This note's content is §4 of [VERIFICATION.md](../VERIFICATION.md) since
> 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001): the
> three rungs, why each is a subset of the next, the three incidents and what
> exists because of them. This pointer stays only while `AGENTS.md` rule 3 and
> `tests/unit/docs-integrity.test.mjs` name this path; delete it with those two
> edits.
