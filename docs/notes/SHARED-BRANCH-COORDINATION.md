# Five sessions, one shipping branch: fixing a red you did not cause

Evidence behind the one clause in AGENTS.md §Git branch & deploy. Written
2026-09-18, the morning three sessions fixed one bug.

## What happened

`99ef563a` added five RAF Type T2 hangars to Silverstone and took
`coplanar-faces` from 15 spots to 20. Every train after it failed on one job —
"Per-circuit geometry sweeps" — so pages runs 2424 through 2428 published
nothing for about an hour.

Then this, inside twenty minutes:

| time (UTC) | commit | session |
|---|---|---|
| 05:09 | `871c0e9d24` fix(silverstone): overhang T2 hangar roofs | (no trailer — Cursor) |
| 05:13 | `6476cf366f` Silverstone's T2 roofs oversail their gables | open-prs-deploy-diffs |
| 05:17 | `6bd83938d3` fix(silverstone): the hangar barrels' end caps sat on their own gables | agent-dev-process |
| 05:29 | `1e39e436a3` Revert "fix(silverstone): overhang T2 hangar roofs" | (no trailer) |

Three sessions independently bisected the same defect to the same root cause —
`addCyl` closes its prism at both ends, so a barrel started flush at `-LEN/2`
with length `LEN` lands its end caps on the shed's own gable planes, facing the
same way. Two of the three fixes were geometrically sound and mutually
exclusive: one oversails the gable by 0.3 m, the other insets 0.1 m on this
file's start-gantry precedent. One got reverted.

**The waste was not the fix.** The fix is three lines either way. The waste was
three separate diagnoses of a bug whose cause only needed finding once, and a
revert to untangle two correct answers landing on one file.

## Why it is structural, not carelessness

`AGENTS.md` says it plainly: other sessions develop directly on the deploy
branch. So when the branch goes red, EVERY session sees the same red at the
same time, each one correctly concludes the train is blocked, and each one is
right to act. Nothing in the protocol says who owns it. `deploy.mjs` now prints
the branch's last ci/pages conclusions, which tells you the train is red — not
that someone is already on it.

## The check, before you start

Three cheap reads. Do them when you are about to fix a red you did not cause;
skip them for your own breakage, where you are the owner by construction.

1. **Is a fix already pushed?** The branch moves fast, and a fix can land
   between the failing run and your reading of it.
   ```sh
   git fetch -q origin claude/f1-game-project-26h3ng
   git log --oneline -15 origin/claude/f1-game-project-26h3ng
   git log --all --since="6 hours ago" --oneline --grep=<failing spec or circuit> -i
   ```
2. **Is a session already on it?** Every session carries a live
   `post_turn_summary.status_detail` — the agent-dev session's read
   *"12 gate suites running; sweeps leg queued"* while this one was starting the
   same work. List the sessions and read them before committing to a diagnosis.
3. **Say so.** Sessions have `cross_session_inbound: available`; nothing in this
   repo used it. One line naming the failing job and that you are on it costs
   nothing and is the whole fix for this class.

Commits carry `Claude-Session:` trailers, so `git log --format='%h %s%n%(trailers:key=Claude-Session,valueonly)'`
attributes any commit to the session that made it — which is how the table above
was reconstructed after the fact. Use it for the same purpose before the fact.

## What this does NOT ask for

Not a lock, not a claim file, not a queue. Those all need a write to the shared
branch to announce a write to the shared branch, which races exactly as badly.
The branch's speed is the thing this repo has optimised hardest for, and the
answer to one collision is not to serialise every push.

What it does ask for, since 2026-09-22, is a CLAIM that touches no working
branch: `node tools/ci/who-is-on-it.mjs --claim "<what you are on>"` pushes one
empty-tree commit to `claude/claims/<slug of your branch>`, every run of the
tool lists the live claims with their age, and `--release` overwrites yours
with a `released` tombstone. It is advisory — a stale claim (> 2 h) prints as
stale and blocks nobody — and it costs one tiny push, not a commit on the
deploy branch. A tombstone rather than a delete because the containers' git
proxy refuses ref deletion over git and the API alike (measured); delete
tombstoned claim branches by hand from a machine that may.

If collisions recur after this, the structural option is the one worth paying
for: a PR per session into the deploy branch with required checks, which removes
the shared-red scenario entirely at the cost of train latency. One incident does
not justify it. Three would.
