---
name: pr-owner
description: "Use when this session owns one or more Apex 26 PRs (spawned with a PR brief, or continuing one) and must carry them to green: claim, subscribe, read the check runs of the CURRENT head, fix reds now, push once per verified cycle, refresh the PR body, run the ready flow, and report DONE/BLOCKED/HANDOFF. Not the repo-wide sweep (ci-watch) or the red-run reading itself (ci-red-triage)."
---

# Owning PRs in Apex 26

The loop for a session that owns PRs. Rules live in `AGENTS.md` (rules 2-5, 8,
9, 11, 12; §Concurrent PRs; §Git branch & deploy); `steward` carries the six
repo overrides; messaging, claims, subscriptions and authority are
`session-comms`. This file orders them.

## Loop

1. **Claim and read.** `node tools/ci/who-is-on-it.mjs`, read the open draft PRs,
   then `--claim "<PR/topic>"` (`--release` at the end). Overlap with a live
   session: STAND-DOWN. Continue an existing PR by checking out its branch;
   new work is `cursor/<topic>-<hash>`.
2. **Subscribe.** `subscribe_pr_activity` on each PR you own (`session-comms`:
   one watcher per PR; if another agent holds it, poll `ci-watch.mjs --sha
   <head> --once` at checkpoints instead).
3. **Read the CURRENT head.** Before any decision and before EVERY push, re-read
   the PR head sha (`git fetch`, then `git rev-parse origin/<branch>`, or
   `node tools/ci/pr-board.mjs --pr <n>`). Another session may have pushed. If
   the tip moved, merge it in; a push over a live CI run cancels it and its
   failures are lost (rule 4).
4. **Red is work now.** A failed job on the current head: `ci-red-triage`
   (agent) names test, assertion and lane and whether the base was already red;
   an inherited red is not yours (`who-is-on-it`, `steward` §3). `cancelled`
   with a live sibling on the same sha is the draft/ready dedupe (`steward` §1).
5. **Fix, verify once, push once.** All edits first (rule 2); then
   `node tools/ci/tooling-fast.mjs --jobs=3 > artifacts/logs/tooling-fast.log 2>&1`
   as ONE background task (rule 4); the change-aware pick from `pick-tests`;
   `node tools/ci/deploy.mjs --gate-only` before the push. Browser groups only
   as `node tools/ci/remote-group.mjs <group>` on the pushed branch (rule 4
   table), never a local group while Actions is healthy. Commit, then one push
   per green cycle. Never a force-push or rebase; catch up only when GitHub says
   CONFLICTING or a required check is red, with `node tools/ci/sync-pr.mjs
   <branch>` (merge ship).
6. **Refresh the PR body at every push** from `.github/pull_request_template.md`:
   Goal, `node tools/ci/session-status.mjs` output, Verified / Not run (name
   every unrun group and every flake), Next step. The body is the session log.
7. **Ready flow** at tip-green: `node tools/ci/ready-gate.mjs --pr <n>` exit 0
   AND `node tools/ci/ready-full-cap.mjs` exit 0 (cap full: wait, never
   force). Then flip draft to ready only if your brief delegates it. Arming
   auto-merge and merging are NEVER yours unless the user designated this
   session; otherwise report DONE-ready and leave it to CI Watch (`ci-watch`).
8. **Report** with the `session-comms` formats: `DONE <PR> <merge sha>` once it
   merged, `BLOCKED`, `HANDOFF`, `STAND-DOWN`. One report per transition, no
   status chatter. Arm a `send_later` safety net (~50 min, then ~4 h).

## Stop when

The PR is merged or closed (unsubscribe, `--release`, send DONE); a
BLOCKED needs the user; you hit a ~120-message or two-tip-moves-without-progress
stall (AGENTS.md §Concurrent PRs: stop and report); or another live session
starts pushing your paths (STAND-DOWN).

## Spawn prompt (parent fills the angle brackets, sends via `create_session`)

```
You own PR(s) <#n[, #m]> on branch <cursor/topic-hash> in brycejmurrin/f1-game.
Follow AGENTS.md and .claude/skills/pr-owner/SKILL.md (it points to session-comms
and steward). Goal: <one sentence, user's terms>.
OWNED: <path globs>. FORBIDDEN: <path globs; shared-contract files>.
Done when: current head green, ready-gate and ready-full-cap exit 0, PR body
refreshed, then DONE-ready reported to @parent.
Delegated: <e.g. mark ready after the gate; NOT auto-merge, NOT merge>.
Extra constraints: <caps, groups not to run, deadlines>.
Do not enable auto-merge or merge. Do not rebase or force-push.
Report to @parent with DONE/BLOCKED/HANDOFF/STAND-DOWN first lines only.
```
