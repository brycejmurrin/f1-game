---
name: apex-merge-hard-gate
description: "Use when asked to merge or arm auto-merge: Merge Desk arms, Grok merges. Sweeps → ci-watch."
---

# Apex merge hard gate

**Authority:** Only a session or Routine the user designated as **Merge Desk**
may `enable_pr_auto_merge` with `mergeMethod: "MERGE"`. Only **Grok Bot** may
merge a green non-draft PR (merge commit). Every other session, worker, or tool
must refuse merge, arm, and draft→ready unless the user explicitly delegates
that role in the **current** chat (`agent-fleet` `references/comms.md`).

Workers carry `Do not enable auto-merge or merge.` in the launch prompt — that
limits **their** actions; it is not a PR veto. The only body veto is a line
starting `MERGE-HOLD:`.

## Required before merge or MERGE arm

Every item must hold. One miss → **WAIT** (name which).

| # | Gate | How to verify |
|---|---|---|
| 1 | **CI green** | Newest `ci.yml` on the PR head is `success` (not `in_progress`, not `failure`). A `cancelled` run with zero failures is a timeout/red until triaged (`steward` §1, `ci-red-triage`). |
| 2 | **Structural guards** | `node tools/ci/ready-gate.mjs --pr <n>` exits 0 on the head (includes tooling-fast on the tip). |
| 3 | **Merge commit only** | Arm with `mergeMethod: "MERGE"` only — never SQUASH or REBASE. A foreign arm → disable, notify Merge Desk (`ci-watch`). |
| 4 | **No force-push** | Branch history is preserved; sync via `sync-pr.mjs`, never rebase or force-push (`AGENTS.md` §Git branch & deploy). |
| 5 | **Out of draft** | `draft: false` only after gates 1–2 and Plan closed (`ready-gate` refuses open Plan items). |
| 6 | **No overlapping claims** | No live, non-stale `who-is-on-it` claim on the same paths; no conflicting draft `owned:` (`.claude/skills/who-is-on-it/lane.mjs`). |
| 7 | **Mergeable** | `mergeable_state` not `dirty` / CONFLICTING — SYNC first, never arm DIRTY. |
| 8 | **Arm cap** | Fewer than **2** PRs armed repo-wide (`pr-board.mjs` / `ci-watch`). |
| 9 | **Full-tier cap** | Marking ready respects `node tools/ci/ready-full-cap.mjs` (default **3** concurrent full-tier runs). |
| 10 | **No spurious cancel** | Do not treat draft→ready dedupe `cancelled` as green or red without reading jobs (`steward` §1). |
| 11 | **Pages / manual dispatch** | Do not merge to “fix” a red **Pages** train or a **manually dispatched** workflow another session started; triage the workflow that failed. Merge Desk does not hand-dispatch Pages to skip the train (`AGENTS.md` §Watching CI and Pages). |

Optional pacing (Merge Desk, not a worker): keep **~6 or fewer** ready PRs
(`ci-watch` §Merge pacing).

## Merge Desk sweep (summary)

Full procedure: `.claude/skills/ci-watch/SKILL.md`.

```sh
node tools/ci/pr-board.mjs --json    # SUGGESTION per row
node tools/ci/ready-gate.mjs --pr <n>
node tools/ci/ready-full-cap.mjs
node .claude/skills/who-is-on-it/lane.mjs   # stand down if a live owner is pushing
```

| suggest | Merge Desk may |
|---|---|
| READY | Flip draft→ready when gate + cap allow (≤ 3 per sweep, ≤ `cap.room`). |
| ARM | Enable auto-merge **MERGE** only when every row in the table above holds. |
| FOREIGN-ARM | Disable SQUASH/REBASE arm; re-arm MERGE only if the hard gate holds. |
| SYNC / FIX / WAIT | Route to owner or `steward`; never arm. |

## What workers do instead

- Push on `cursor/<topic>-<hash>`, keep the PR **draft** until `ready-gate` is green.
- Subscribe to CI on the PR; fix reds (`steward`); **never** arm or merge.
- Escalate merge requests to Merge Desk with PR number and head SHA.

## Related rules

- `MERGE-HOLD:` — only veto token in the PR body.
- Concurrent PRs — merge commits only; no squash-merge (`AGENTS.md` §Concurrent PRs).
- Hooks — `github-mcp-guard.sh` blocks undesignated merge/arm/draft→ready MCP calls.
