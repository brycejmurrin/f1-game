---
name: Apex cloud-agent launch
description: >-
  Use when launching a Cursor Auto cloud agent for Apex (f1-game): ship branch,
  prompt template, attachments, no twin agents.
---
# Apex cloud-agent launch

Use when launching a Cursor cloud agent for the Apex (f1-game) repo.

## Defaults
- Repo: `https://github.com/brycejmurrin/f1-game`
- Ship branch / `starting_ref`: `claude/f1-game-project-26h3ng`
- Topic heads: `cursor/<topic>-<hash>` (Cursor often supplies the suffix). No new `claude/<topic>` feature branches; legacy `claude/<topic>` PRs stay mid-flight.
- Model: `default` (Auto) **only**. Never invent other model ids. Do **not** fall back to an alternate model if Auto is blocked — tell the user and stop.
- Never clone the repo onto the box; cloud agent does coding.
- Cap: max **6 launches / 10 min**. If `/workspace/apex-status/queue-depth.json` says `hold`, or >15 runs queued, do not launch (and launched agents commit locally only).
- Ship-checkpoint freeze: no sync **pushes** or **merges** while freeze is on.

## Existing PR (steward attach)
When the job is an **open PR**, do not start from ship and fork a new topic head.
**Never** launch a PR steward as Task `environment: cloud` (source=internal,
often `branchName:null`, cannot receive `subscribe_github_pr` /
`subscribe_github_ci`). Launch a **full** Cursor Cloud Agent:

    node tools/ci/launch-steward.mjs --pr N --prompt-file body.txt

That POSTs `https://api.cursor.com/v1/agents` with `repos[0].prUrl`,
`workOnCurrentBranch: true`, `autoCreatePR: false`, `model.id: default`.
Needs `CURSOR_API_KEY` (Dashboard → Cloud Agents → API Keys). `--dry-run`
prints the payload.

The launched agent:
- stays on that PR's existing head; does **not** create a new
  `cursor/<topic>-<hash>`; does **not** open a second PR
- arms `subscribe_github_pr` + `subscribe_github_ci` **itself**
- prompt must include `Do not merge.` and `Do not disable squash auto-merge if it is already armed.`

Stall abort: 0 tools after 5–10 min **and** no push to that PR SHA. A cloud
listing with `branchName: null` is **not** stalled if the PR got a
`synchronize` or the agent reported the PR head SHA — that listing shape is
typical of Task children, not full agents.

## Prompt template (fill gaps)
1. **Goal** — outcome, not line edits.
2. **Context** — symptoms, PR number/URL, attached files/images.
3. **Constraints** — include `OWNED:` / `FORBIDDEN:` globs, done-when, shot/test caps, and the exact lines `Do not merge.` `Do not disable squash auto-merge if it is already armed.` Draft PR unless asked. Stay in lane (UI/cars/tracks/perf/audio/net). Sync = merge `origin/claude/f1-game-project-26h3ng`; never rebase or force-push. Pre-push = `npm run test:tooling-fast` plus pick-tests Structural guards. Push once per green local cycle. No CI poll loops (`ci-watch.mjs` / CI Watch, not `sleep` / `gh run view`).
4. **Success** — PR link or clear “no PR”; tests run / named not-run. Mark ready **within 15 min of tip-green** (CI Watch flips otherwise). Close-out must pass the stall/handoff gate in `docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md`.
5. Invite the agent to verify its own diagnosis.

## Attachments
- Screenshots → `images: [{url: file:///…}]`
- Exports/JSON/logs → `files: [{url: file:///…}]`

## After launch
- Tell the user with agent URL + cursor-agent card.
- FYI the owning specialty bot (priority false) with bc id + title.
- Do not launch a twin for the same PR/task; `reply` to the existing agent instead.
- Stall abort: 0 tools after 5–10 min, or <15 tools and no OWNED-path push past 10 min → cancel, alert owning lane + orchestrator.
