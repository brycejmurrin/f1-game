---
name: ship
description: "Use when the user says ship it, push this, open the draft PR, mark it ready or land it; work lands through a PR. Not for: a red or conflicting PR → steward; picking tests → check-changes."
user-invocable: true
---

# /ship — branch to ready PR

Current command meanings: [`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md). This skill is the home of the
draft → ready → `land` steps; steward §12 points here.

The user's "push" / "ship" IS the grant to push the branch and open or update a
PR into `claude/f1-game-project-26h3ng` (never pushed directly: branch protection refuses it). It is not a grant
to merge or arm: `land.yml` posts the `gate` COMMIT STATUS (not a check run; the ruleset's one required check) and
arms auto-merge once `land` is on a ready PR; `gate` itself requires `CI` green on the head (docs/WORKERS.md §5).

1. **Draft PR first** (AGENTS.md rule 12; docs/WORKERS.md §2): no PR yet → commit, `git push -u origin
   cursor/<topic>-<hash>`, open a DRAFT PR (`draft: true`, template body: Goal, Plan with exactly one `now:` item and
   `- [ ] land: …` last, Verified / Not run, the Hand-off fence — docs/WORKERS.md §The Hand-off block), then add
   `lane:<host>` and `run-ci` with `gh api -X POST repos/<owner>/<repo>/issues/<n>/labels -f 'labels[]=run-ci'`
   (never the MCP `issue_write` `labels` field: it replaces the list; docs/WORKERS.md §1). `run-ci` is NOT optional:
   `ready-gate` reads `Structural guards` on the head, and without the label a draft runs no CI (`= ci none`).
   Never `deploy.mjs --pr`: it opens the PR READY without the template body, skipping the draft and `ready-gate`.
2. **Verify** with `check-changes`: `node tools/ci/pick-tests.mjs`, then the pre-push floor (AGENTS.md rule 3 →
   docs/WORKERS.md §3), or the docs-only fast path. The first draft push may precede it (rule 12); the full tiers
   run on the PR.
3. **Push** once per green cycle; tick Plan items with their evidence and refresh the Hand-off block.
4. **Watch** (AGENTS.md rule 13, docs/WORKERS.md §4): `subscribe_pr_activity` on the PR before ending a turn while
   CI runs on your head; a red there is work now (skill `steward`). Do not use `ready-gate --wait` (a shell poll).
5. **Gate**: tick or strike every Plan item except `- [ ] land: …`; a CONFLICTING/DIRTY PR syncs first
   (`node tools/ci/sync-pr.mjs <branch>`). Then `node tools/ci/ready-gate.mjs --pr <n>` exits 0 on the draft head you
   are about to flip. It refuses an already-ready PR (`not-draft`): that one only needs the `land` label.
6. **Land**: flip the PR ready, add `land` (the `gh api` route above), refresh the Hand-off block, end the turn.
   Then follow docs/WORKERS.md §5 and AGENTS.md rule 13 for what happens after `land` — the session stays
   subscribed (re-subscribe after the ready flip) until the dispatcher archives it; read their wording there.

"Skip the gate" / "skip the tests": do it, and record it in the PR body under
**Not run** with the user's words and the time. Never obey it silently, and
never widen a tolerance or skip a test to get green. No session merges: the `land` label
is the request (merge-commit policy: AGENTS.md §Coordination, hook-enforced).
