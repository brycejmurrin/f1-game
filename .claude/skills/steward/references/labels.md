# Labels — the state machine

Source of truth: `.github/labels.json` (name, colour, description); this table adds where each goes and what a
session does with it. No MCP tool creates or recolours a label: the first `issue_write` that names a new one creates
it in GitHub's default grey; its colour and description come from `.github/labels.json` when Bryce dispatches
`labels-sync.yml` (its `dry_run` input reports the difference without writing).

**Adding or removing a label** (owner decision 2026-11-11: agents never write with `gh`, whose writes GitHub records
as Bryce's own click; `bash-guard.sh` refuses them). Use the GitHub MCP `issue_write` (method `update`; a PR is an
issue), ONE label per call:
1. Read the live names: `issue_read` method `get_labels` (or `gh api repos/<o>/<r>/issues/<n> --jq '[.labels[].name]'`).
2. Send that list plus, or minus, the ONE name. The `labels` field REPLACES the whole list, so `github-mcp-guard.sh`
   reads the live labels itself and refuses any list that differs from them by more or less than one name (a partial
   list, or a stale one after an Action or Bryce labelled in between: re-read and send again). Two labels are two calls.
3. Never yours: removing `config-ok`, adding it where the diff touches a PROTECTED path, and removing a `hold` Bryce
   set (the guard refuses all three; an agent's own `hold` may be removed). A worker never approves its own PR: the
   orchestrator adds `config-ok` (routine paths) and `ratchet-raise` (D-042), one comment per add naming the files or
   metrics and why. Where the guard cannot read the live labels (no `gh` token) the call is an "ask".

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
| `needs-owner` | PR | no live owner (silent past its window, or the cap); the orchestrator launches a takeover |
| `lane:claude` / `lane:cursor` / `lane:codex` | PR | which host owns it (`references/vendors.md`) |
| `config-ok` | PR | Bryce's own click on a PR that edits a config path (`CONFIG_PATH` in merge-gate.mjs: hooks, settings, workflows, actions, `tools/ci/**`, MCP and agent config, templates); on a diff of ROUTINE config paths only, the orchestrator's (Claude app) label counts too, added after it has read the config diff and never by the PR's own worker; a diff touching a PROTECTED path (`PROTECTED_CONFIG_PATH`: the gate and its import closure, `land.yml`, every host's hooks and settings; `ci.yml`, `pick-tests` and `preflip-probe` are routine since D-034) needs his own click, and his own removal voids agent re-adds until he adds it again (#5455); it covers a later push only when every config-path row of the three-dot `compare/<deploy>...<head>` is identical to the head's at label time: the same names, status, blob sha, file mode and patch text WITH its context lines and `@@` line numbers (`configPushState` and `ownConfigDiff` in merge-gate.mjs, #5432); so a sync keeps it only when the merged tip touched none of the PR's config files, and a sync whose tip edited the same file or whose conflict resolution touched one voids it even when the PR's own +/- lines are identical, as does a config commit (a compare of 300+ files, or a config row with no patch, waits as `unknown` until a fresh click); after a sync, run `node tools/ci/merge-gate.mjs --pr <n> --trusted` and read the `config` row before telling Bryce it carried; a voided label needs it removed and re-added (on a phone: untick it, close the label menu, then tick it again, or the click does not register; on a `land` PR the click re-runs `gate`; say which head it is for); a `package.json` diff that is only the generated `test:*` lines needs none (a new unit test edits `tests/groups.json` alone since #5427) |
| `ratchet-raise` | PR | Bryce's own click, or the orchestrator's (Claude app, D-042; his own removal voids agent re-adds until he adds it again), on a PR whose diff raises a tree-wide ceiling (`tests/data/ratchets.json` `tree` plus the `ratchets.d` deltas, head vs merge base; a lower or per-file ceiling needs none); merge-gate's `raise` row, bound to the PR's own raise: a later push that raises a tree ceiling further (or removes one) needs it removed and re-added, a sync that only brings other PRs' fragments does not; push the fragment AND its `docs/notes/CEILING-HISTORY.md` entry (`--update --fragment` prints it) together, then the click |
| `dispatch:pause` | Dispatch issue | retired with the dispatch Action (2026-11-25, #6536): nothing reads it; the orchestrator launches by hand |
| `dispatch:merge-pause` | Dispatch issue | `land.yml` arms nothing; removing the label takes effect on each PR's next event |
| `deploy:red` | Board issue, PR | Board issue: the latest Pages train failed; one fixer is launched. PR: the fixer's claim. While the tip is red on code, merge-gate's `base` row holds every merge except the fixer's: `deploy:red` (anyone's) on a head that contains the red commit (`sync-pr --onto-red-tip`), whose green CI is the proof, or Bryce's own click of `deploy:red` / `priority` after the red started (#5425) |
| `fleet-board` | Board issue | the Board issue itself (#1780); the orchestrator posts its `tip-red:` bulletins there, tip-alarm.yml its red/green notes |
| `bug` / `enhancement` / `perf` / `refactor` / `flaky` / `tracking` / `epic` / `documentation` | issue | the TYPE, exactly one (§Issue scheme) |
| `base-red` | issue | a red on the base (advisory; the auto issue is typed `tracking`) |
| `area:*` | issue | the subsystem, one or more; `area:input` is controls (phone pad, gamepad, keyboard, touch, tilt) |
| `source:hunt` / `source:gardener` / `source:review` / `source:orchestrator` | issue | where it came from: a hunt, audit or survey; a Gardener survey; a review; the orchestrator (stalls, land/CI bugs, follow-ups) |
| `phone` / `needs-device` | issue | shows on Bryce's iPhone or the phone controller; only a real device can verify it |

## Issue scheme

Bryce's scheme (2026-11-25 ~02:44Z, relayed by the orchestrator). Every issue, when it is filed, carries:
- **one type:** `bug` (broken), `enhancement` (new), `perf` (frame, load, memory or CI time), `refactor`
  (behaviour-neutral cleanup, a Gardener carve), `flaky` (a test, AGENTS.md rule 9), `tracking` (a checklist of
  findings or checks), `epic` (the work is in sub-issues) or `documentation`;
- **one or more `area:*`;**
- **`source:*`** when it came from a hunt, a Gardener survey, a review or the orchestrator; `phone` / `needs-device` where they apply.

Ownership is not a label of this scheme: `lane:*` on the PR and `claimed` on the issue (§Lane). `node
tools/ci/issue-labels.mjs` lists open issues with no type, two types or no area (GETs only; exit 2 when any).
Fix a row with the one-label recipe above, after reading the issue.

**Families** (colours are meaning-coded in `.github/labels.json`, Bryce's pick 2026-11-25: red stop/veto, amber
attention, green merge flow, pastel areas, grey `source:*`, purple dispatch; `.github/workflows/labels-sync.yml`, dispatched by Bryce,
applies the file: create or update, never delete): type, `area:*`, `source:*`, `lane:*`, status (`ready`, `claimed`,
`blocked`, `needs-*`, `hold`), device (`phone`), process (`land`, `train`, `config-ok`, `ratchet-raise`, `deploy:red`,
`memory-change`, `dispatch:*`, `fleet-board`, `batch`, `batched`, `base-red`), priority. Overlaps, one meaning each:
`perf` is the TYPE (the work is a speed, load, memory or CI-time win), `area:perf` the AREA (the frame budget, load
time and download weight as a whole: profilers, budgets, census); a perf fix inside one subsystem takes that
subsystem's area. `area:input` is controls (pad, gamepad, keyboard, touch, tilt); `area:ui` is menus, HUD and layout.
`batch` is the batch issue, `batched` each member. `phone` is a device tag beside the area.

**Retired** (grey, description says what replaces it): `run-ci` (retired 2026-11-03; off-repo Cursor/Codex briefs
still add it, so the row stays). Retire candidate: `wontfix` (unused GitHub default; close as not planned instead).
Deleted by Bryce 2026-11-25 (rows gone, so the labels sync never re-creates them): `ui`, `area:data`, `urgent`,
`test-review`, `question`, `lane:claude-cloud`, `lane:claude-code`, `lane:claude-code-web`, `lane:platform`,
`lane:visuals`, `duplicate`, `invalid`, `good first issue`, `help wanted`. Never put a retired label on an issue.

## Hunt and survey output

A hunt, audit or survey (`code-hunter` slices, a runtime or UI matrix run, a Gardener survey) reports as ISSUES,
never as a docs PR (Bryce, 2026-11-25): one `tracking` issue with `source:hunt` (a Gardener: `source:gardener`) and
its areas, whose body is a checklist with one line per verified finding (`file:line`, mechanism in one clause, and
the issue or PR that owns it, or "not filed yet"). The detailed note may live on the hunt's branch, unmerged, linked
from the issue by branch and head sha. Findings worth fixing now are filed as their own typed issues and linked from
the checklist; the rest are filed by whoever picks them.

Retired 2026-11-03: `run-ci` (every draft push starts the fast tier automatically). The Board is issue
#1780; the Dispatch issue (Bryce's switches) is #3899.
