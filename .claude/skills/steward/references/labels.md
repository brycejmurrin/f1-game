# Labels — the state machine

Source of truth: `.github/labels.json` (name, colour, description); this table adds where each goes and what a
session does with it. A new row reaches GitHub through Bryce (no MCP tool creates a label).

**Adding or removing a label** (owner decision 2026-11-11: agents never write with `gh`, whose writes GitHub records
as Bryce's own click; `bash-guard.sh` refuses them). Use the GitHub MCP `issue_write` (method `update`; a PR is an
issue), ONE label per call:
1. Read the live names: `issue_read` method `get_labels` (or `gh api repos/<o>/<r>/issues/<n> --jq '[.labels[].name]'`).
2. Send that list plus, or minus, the ONE name. The `labels` field REPLACES the whole list, so `github-mcp-guard.sh`
   reads the live labels itself and refuses any list that differs from them by more or less than one name (a partial
   list, or a stale one after an Action or Bryce labelled in between: re-read and send again). Two labels are two calls.
3. Never yours: adding or removing `config-ok`, and removing a `hold` Bryce set (the guard refuses both; an agent's
   own `hold` may be removed). Where the guard cannot read the live labels (no `gh` token) the call is an "ask".

| label | on | meaning |
|---|---|---|
| `ready` | issue | backlog, unclaimed |
| `claimed` | issue | a worker owns it; the claim comment names the session |
| `blocked` | issue | projection of an open native dependency, or a documented non-issue gate (`references/issues.md`) |
| `epic` | issue | a parent; the work is in its sub-issues, so never take the epic itself |
| `needs-decision` | issue, PR | waits on Bryce; the options are in a comment; his own label click or `decision:` comment answers |
| `priority` | issue, PR | Bryce's one steering word: launched or landed first; his own click, newer than the red run, also lets a PR land over a red deploy tip (`base` row, #5425) |
| `land` | PR | the owner asks GitHub to land it: `land.yml` posts the `gate` status, then arms auto-merge (`references/land.md`) |
| `train` | PR | a merge train (`tools/ci/merge-train.mjs`, docs/notes/MERGE-TRAIN-2026-11-18.md): land.yml's `train` job folds up to 10 green `land` PRs onto the tip and opens this PR with `land`; nobody pushes to it or adopts it; it closes itself red or stale and the cars stay at `land` |
| `hold` | PR | the only veto: do not land; once Bryce has set it, only a later click of his own lifts it, whatever anyone does in between (merge-gate's hold row walks the label events in order); a hold only an agent set is lifted by any removal; adding it turns an existing `gate` red and disables auto-merge |
| `needs-owner` | PR | no live owner (silent past its window, or the cap); the dispatch Action launches a takeover |
| `lane:claude` / `lane:cursor` / `lane:codex` | PR | which host owns it (`references/vendors.md`) |
| `config-ok` | PR | Bryce's own click on a PR that edits a config path (`CONFIG_PATH` in merge-gate.mjs: hooks, settings, workflows, actions, `tools/ci/**`, MCP and agent config, templates); on a diff of ROUTINE config paths only, the orchestrator's (Claude app) label counts too, added after it has read the config diff and never by the PR's own worker; a diff touching a PROTECTED path (`PROTECTED_CONFIG_PATH`: the gate and its import closure, `land.yml`, every host's hooks and settings; `ci.yml`, `pick-tests` and `preflip-probe` are routine since D-034) needs his own click, and his own removal voids agent re-adds until he adds it again (#5455); it covers a later push only when every config-path row of the three-dot `compare/<deploy>...<head>` is identical to the head's at label time: the same names, status, blob sha, file mode and patch text WITH its context lines and `@@` line numbers (`configPushState` and `ownConfigDiff` in merge-gate.mjs, #5432); so a sync keeps it only when the merged tip touched none of the PR's config files, and a sync whose tip edited the same file or whose conflict resolution touched one voids it even when the PR's own +/- lines are identical, as does a config commit (a compare of 300+ files, or a config row with no patch, waits as `unknown` until a fresh click); after a sync, run `node tools/ci/merge-gate.mjs --pr <n>` and read the `config` row before telling Bryce it carried; a voided label needs it removed and re-added (on a phone: untick it, close the label menu, then tick it again, or the click does not register; on a `land` PR the click re-runs `gate`; say which head it is for); a `package.json` diff that is only the generated `test:*` lines needs none (a new unit test edits `tests/groups.json` alone since #5427) |
| `ratchet-raise` | PR | Bryce's own click on a PR whose diff raises a tree-wide ceiling (`tests/data/ratchets.json` `tree` plus the `ratchets.d` deltas, head vs merge base; a lower or per-file ceiling needs none); merge-gate's `raise` row, bound to the PR's own raise: a later push that raises a tree ceiling further (or removes one) needs it removed and re-added, a sync that only brings other PRs' fragments does not; push the fragment AND its `docs/notes/CEILING-HISTORY.md` entry (`--update --fragment` prints it) together, then the click; an agent's label never counts |
| `dispatch:pause` | Dispatch issue | the Action launches nothing; running owners carry on to `land` or their cap |
| `dispatch:merge-pause` | Dispatch issue | `land.yml` arms nothing; removing the label takes effect on each PR's next event |
| `deploy:red` | Board issue, PR | Board issue: the latest Pages train failed; one fixer is launched. PR: the fixer's claim. While the tip is red on code, merge-gate's `base` row holds every merge except the fixer's: `deploy:red` (anyone's) on a head that contains the red commit (`sync-pr --onto-red-tip`), whose green CI is the proof, or Bryce's own click of `deploy:red` / `priority` after the red started (#5425) |
| `fleet-board` | Board issue | the Board issue itself (#1780); the Action rewrites its Board comment |
| `bug` | issue | something is broken (GitHub's default label) |
| `flaky` / `base-red` | issue | a test that passed on retry or fails across branches (AGENTS.md rule 9); a red on the base (advisory) |
| `area:*` | issue | the subsystem |

Retired 2026-11-03: `run-ci` (every draft push gets the fast tier plus a selected browser shard). The Board is issue
#1780; the Dispatch issue (Bryce's switches) is #3899.
