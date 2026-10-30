# Design pass #3 — 2026-10-30

Goal: take Apex 26 from "clean" to "premium F1 game" on Bryce's cell (iPhone landscape 844x390, touch,
TLX/WebGPU), closing what passes #1 and #2 left open. Method, scorecard and research are reused from
`DESIGN-PASS-1-2026-10-30.md` and `UI-DESIGN-RESEARCH-2026-10-30.md`; pass #2's lane notes are
`DESIGN-PASS-2A-HUD`, `-2B-MENUS`, `-2C-MOTION` and `-2D-DATA-TOKENS` (same date). This file is the
coordinator's index: each lane records its own decisions in `DESIGN-PASS-3<letter>-<topic>-<date>.md` on its
branch, and this table links them.

## Lanes

| lane | issue | scope | owner | PR | status |
|---|---|---|---|---|---|
| A | #4258 | contrast tokens: `--dim`, red text ink, 11 px floor, lane 2a's HUD tokens; `--upgrade` and the rawColor swaps after #4257 | launched by this session | — | launched |
| B | #4263 | RACE A FRIEND / career subtitle truncation; delete `.dh-developer-tools` | launched by this session | — | launched |
| C | #4257 | ratchet tooling: a topic branch can lower a slack-0 tree metric | Bryce's own session (claimed 17:00Z, first claimant) | — | not launched here |
| D | #4281 | career header red ink, disclaimer border, garage tab strip | launched by this session | — | launched |
| D2 | #4282 | layout-audit: the 8 harness-timeout cells | waits for #4225 (owns `tools/ui/layout-audit.mjs`) | — | blocked |
| E | #4284 | motion and feel: transitions, press feedback, results reveal, tabular numerals; one living gallery | launched by this session | — | launched |

## Coordination decisions
- **#4257 is not relaunched.** A session Bryce started from his phone claimed it at 17:00Z; the first claimant
  fixes (AGENTS.md §Git branch & deploy). It was told which lanes this pass owns, and asked to signal when
  its PR opens and merges so lane A can do `--upgrade` and the rawColor-lowering HUD swaps.
- **D2 waits.** `tools/ui/layout-audit.mjs` and `tools/ui/menu-screens.mjs` are in open PR #4225's diff
  (labelled `land`); a path in an open PR belongs to that PR. #4282 is `blocked` and launches after it merges.
- **Lane B and `index.html`.** Open draft #4227 touches `index.html`; B fixes the subtitle in CSS first and
  changes copy in `index.html` only once #4227 has merged or closed.
- **Shared budgets.** The blocking CSS has ~50 B under its 239,000 B ceiling: B's dead-rule deletion frees
  bytes; A changes values in place; D drops a border; E puts new motion rules in non-blocking sheets.
- **Goldens.** A, B, D and E each re-bless `menu-baseline` goldens in their own commit. After a sync that
  conflicts on a golden PNG, take the deploy tip's file and re-bless on the merged tree.
- **Models.** A and E (design judgment, a living gallery) run on the session's default model; B and D on
  Sonnet (`tools/ci/dispatch.json` `model`), per the dispatcher's efficiency rule.
