---
name: who-is-on-it
description: "Use when a harness lane starts: claim OWNED globs, refuse overlap. Deploy red → steward."
---

# Who is on it (lane claim)

Mechanical de-dupe before two sessions land the same fix or collide on OWNED
globs. The claims board and recent pushes are authoritative; draft-PR `owned:`
lines are the lane mutex for harness workers.

## Before you edit (every lane start)

1. Name your OWNED globs exactly as the launch prompt lists them (space-separated).
2. Run the lane wrapper (draft PR scan + overlap refusal + board claim):

```sh
node .claude/skills/who-is-on-it/lane.mjs --claim <owned-glob> [<owned-glob> ...]
```

Use `--session <id>` when the host does not set `APEX_SESSION_ID` / Cursor run id;
reuse the same id for `--release`.

3. On **exit 0**, paste the printed `claim:` line into your PR body under the
   `fleet` block (refresh at every push). On **exit 1**, stand down or escalate
   to the orchestrator — do not edit FORBIDDEN paths hoping to “win” the race.

Read-only recon (no claim):

```sh
node .claude/skills/who-is-on-it/lane.mjs                    # drafts + claims + recent branches
node .claude/skills/who-is-on-it/lane.mjs --json             # machine-readable
node .claude/skills/who-is-on-it/lane.mjs js/game.js         # commits that touched paths (6 h window)
```

The underlying board push and branch listing live in
`tools/ci/who-is-on-it.mjs` (documented in `docs/notes/SHARED-BRANCH-COORDINATION.md`).

## What the lane wrapper checks

| Source | What it shows |
|---|---|
| Open **draft** PRs into `claude/f1-game-project-26h3ng` | `#`, branch, title, `owned:` globs from the `fleet` block (or a top-level `owned:` line) |
| **Claims board** (`claude/claims-board`) | Live claims with age; stale after 120 min informs only |
| **Overlap** | Any non-stale claim or draft `owned:` glob that intersects your globs → refuse |

Overlap uses conservative glob rules (`**`, `*`, directory prefixes). When in
doubt the tool refuses; narrow OWNED or coordinate.

## Recording the claim

- **Board:** `--claim` pushes to `claude/claims-board` via `tools/ci/who-is-on-it.mjs`
  (message includes your branch and session id).
- **PR body:** add the one-line snippet the tool prints, for example:

```text
claim: <branch> @ <session-short> | owned: js/lighting/** .claude/skills/foo/**
```

## Release

When the lane finishes or hands off:

```sh
node .claude/skills/who-is-on-it/lane.mjs --release --session <same-id>
```

Remove or strike the `claim:` line on the next PR body refresh.

## Twin guard (launch policy)

Also scan PR titles and branches for the same feature (`agent-fleet`
`references/launch-policy.md` §Twin guard). A duplicate title or overlapping
OWNED on another **live** branch (push in the last ~15 min) is a stand-down even
when the claim board is empty.

## Traps

- Claim/release needs a real branch (`cursor/<topic>-<hash>`); not `HEAD`.
- Fetch failure: the CI tool prints **UNTRUSTWORTHY** — do not treat an empty
  claim list as “nobody is on it”.
- Fixing a deploy-branch red you did not cause still needs a claim; driving your
  own PR green does not (`steward`).
