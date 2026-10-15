## Launch policy (moved from AGENTS.md §Concurrent PRs)

Binding on every orchestrator, desk or person writing a cloud launch prompt.

- Cloud launch prompts must include `OWNED:` / `FORBIDDEN:` path globs, done-when, shot/test caps, and the exact line `Do not enable auto-merge or merge.` (it limits that worker's own actions; it is not a veto and never goes into a PR body — a hold is `MERGE-HOLD:`),
  mark ready only after `ready-gate.mjs` exits 0, and respect `ready-full-cap.mjs`; stand down on overlap. The template in `references/orchestrator.md` carries every field.
- Model id `default` only for a cloud launch; never invent another. Own notes go to `docs/notes/<topic>.md`.
- Lane mutex: garage CSS → UI Survey; `js/car/*` → Cars; scenery (`js/circuits/scenery/*`) → Tracks; `js/game.js` needs `who-is-on-it --claim` before an edit. Lighting: ≤ 1 concurrent lighting agent, OWNED=`js/lighting/**` only, no scenery PRs from that lane.
- Review farm: ≤ 2 concurrent review agents unless the user overrides. ≤ 2 parallel nested subagents inside one cloud agent; more → separate agents with disjoint OWNED.
- Resolve swarm: only red/dirty PRs with no specialist owner (capped); one `--claim` per PR; stand down if a specialist already owns the paths.
- Refuse a launch whose sole goal is "read/understand the project" or "investigate all", and a bare "continue working" without a new delta or a narrower scope.
- Feature / Survey / Chromium-play budgets: abort at > ~400 messages or > ~90 min with no OWNED push; ≤ 25 apex-eval/shot/Playwright captures unless the user raises the cap (sample the matrix over menus/teams/tracks). 
  Never fork or relaunch an errored or > 400-message agent on the same prompt: a new launch needs new evidence or a narrower OWNED.
- Twin guard: `who-is-on-it.mjs` plus a title/PR scan; stand down when the same title, the same PR feature or an overlapping OWNED is already running.
- Pin long Chromium/visual smoke to `apex-sha` or the PR's Pages preview; never bind a loop to the moving production github.io (tip-vs-Pages is Monitor-only).
- Sync agents: sync with `sync-pr.mjs` only when GitHub reports CONFLICTING/DIRTY or a required tip check is red; a Finish/Update run syncs only if CONFLICTING; one Sync agent per PR (refuse duplicates);
  never Sync and merge in one run (`behind-ship.mjs` warns over 10 behind, never fails). No auto-update-branch bots.
  Abort or stop and report a Finish/Update run past ~120 messages or > 2 tip moves with no progress while clean-behind.
  Normalize a messy merge with `node tools/check/merge-hygiene.mjs --fix`, then `gen-test-groups.mjs`.
- Every worker hand-back reports its head SHA; on a token failure it stops and reports. Batch small tooling/doc fixes into ONE PR; tooling/docs/MCP/prompt-only PRs stay off merge-train auto-launch and per-PR resolve swarms.
