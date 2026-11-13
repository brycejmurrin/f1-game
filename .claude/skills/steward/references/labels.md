# Labels — the state machine

Source of truth: `.github/labels.json` (name, colour, description); this table adds where each goes and what a
session does with it. Applying a new row to GitHub is `gh label create` by hand. Add and remove labels with
`gh api -X POST …/issues/<n>/labels -f 'labels[]=<name>'` / `gh api -X DELETE …/issues/<n>/labels/<name>`, never the MCP `labels`
field (it replaces the whole list).

| label | on | meaning |
|---|---|---|
| `ready` | issue | backlog, unclaimed |
| `claimed` | issue | a worker owns it; the claim comment names the session |
| `blocked` | issue | projection of an open native dependency, or a documented non-issue gate (`references/issues.md`) |
| `epic` | issue | a parent; the work is in its sub-issues, so never take the epic itself |
| `needs-decision` | issue, PR | waits on Bryce; the options are in a comment; his own label click or `decision:` comment answers |
| `priority` | issue, PR | Bryce's one steering word: launched or landed first |
| `land` | PR | the owner asks GitHub to land it: `land.yml` posts the `gate` status, then arms auto-merge (`references/land.md`) |
| `hold` | PR | the only veto: do not land; once Bryce has set it, only a later click of his own lifts it, whatever anyone does in between (merge-gate's hold row walks the label events in order); a hold only an agent set is lifted by any removal; adding it turns an existing `gate` red and disables auto-merge |
| `needs-owner` | PR | no live owner (silent past its window, or the cap); the dispatch Action launches a takeover |
| `lane:claude` / `lane:cursor` / `lane:codex` | PR | which host owns it (`references/vendors.md`) |
| `config-ok` | PR | Bryce's own click on a PR that edits a config path (`CONFIG_PATH` in merge-gate.mjs: hooks, settings, workflows, actions, `tools/ci/**`, MCP and agent config, templates); on a diff of ROUTINE config paths only, the orchestrator's (Claude app) label counts too, added after it has read the config diff and never by the PR's own worker; a diff touching a PROTECTED path (`PROTECTED_CONFIG_PATH`: the gate and its modules, `land.yml`, `ci.yml`, every host's hooks and settings) needs his own click, and his own removal voids agent re-adds until he adds it again (#5455); it must be newer than the last push touching one, so such a push needs it removed and re-added (on a phone: untick it, close the label menu, then tick it again, or the click does not register; a click alone does not re-run `gate`, so say which head it is for); a `package.json` diff that is only the generated `test:*` file lists (a new unit test) needs none |
| `ratchet-raise` | PR | Bryce's own click on a PR whose diff raises a tree-wide ceiling (`tests/data/ratchets.json` `tree` plus the `ratchets.d` deltas, head vs merge base; a lower or per-file ceiling needs none); merge-gate's `raise` row, bound to the PR's own raise: a later push that raises a tree ceiling further (or removes one) needs it removed and re-added, a sync that only brings other PRs' fragments does not; an agent's label never counts |
| `dispatch:pause` | Dispatch issue | the Action launches nothing; running owners carry on to `land` or their cap |
| `dispatch:merge-pause` | Dispatch issue | `land.yml` arms nothing; removing the label takes effect on each PR's next event |
| `deploy:red` | Board issue | the latest Pages train failed; one fixer is launched |
| `fleet-board` | Board issue | the Board issue itself (#1780); the Action rewrites its Board comment |
| `bug` | issue | something is broken (GitHub's default label) |
| `flaky` / `base-red` | issue | a test that passed on retry or fails across branches (AGENTS.md rule 9); a red on the base (advisory) |
| `area:*` | issue | the subsystem |

Retired 2026-11-03: `run-ci` (every draft push gets the fast tier plus a selected browser shard). The Board is issue
#1780; the Dispatch issue (Bryce's switches) is #3899.
