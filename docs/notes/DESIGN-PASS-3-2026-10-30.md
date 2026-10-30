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
| A | #4258 | **priority: POS ink under HIGH CONTRAST** (below); contrast tokens: `--dim`, red text ink, 11 px floor, lane 2a's HUD tokens; `--upgrade` and the rawColor swaps after #4257 | session_01BEw9UK2vGqGU75NMHYfS8K (Opus) | #4300 | launched 17:05–17:08Z |
| B | #4263 | RACE A FRIEND / career subtitle truncation; delete `.dh-developer-tools` | session_01BEw9UHQdfwniLm5HtYjdCi (Sonnet) | #4303 | launched 17:05–17:08Z |
| C | #4257 | ratchet tooling: a topic branch can lower a slack-0 tree metric | Bryce's own session (claimed 17:00Z, first claimant) | #4305 | not launched here |
| D | #4281 | career header red ink, disclaimer border, garage tab strip | session_01BEw9UHhUxAcQ1XuHhx3LaL (Sonnet) | — | launched 17:05–17:08Z |
| D2 | #4282 | layout-audit: the 8 harness-timeout cells | waits for #4225 (owns `tools/ui/layout-audit.mjs`) | — | blocked |
| E | #4284 | motion and feel: transitions, press feedback, results reveal, tabular numerals; one living gallery | session_01BEw9UGgCHVAFkn5Wwj63iT (Opus) | #4299 | launched 17:05–17:08Z |

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
- **The Codex race-interface lane** (`cursor/race-interface-7c6d11`, Bryce's own tool, 17:09Z) owns HUD layout
  and placement, `css/touch-controls.css` and the input logic. Lane A keeps only the colour tokens and the HUD
  ink/panel-colour values. Lane E keeps the motion block. The split is posted on PR #4286.

## Findings and overlaps after launch
- **POS unreadable under HIGH CONTRAST (deploy tip `7c6d11c6`, primary race info):** `css/hud.css:2101`
  `:root[data-ui-contrast="high"] :is(.hud-box, #announce)` takes `#announce`'s id specificity (1,2,0) and
  beats `body:not(.hud-prof-broadcast) #hud-box-pos` (1,1,1) at `:158`. The light POS plate goes dark and the
  dark ink from `:162` stays, so POS reads near-black on black. Bryce's own settings export
  (`tests/data/settings-defaults-export.json`) has `uiContrast: "high"`, so every race on his phone shows it.
  Traced by the Codex race-interface lane (#4295). It goes to lane A as its first fix, with a regression test.
- **Blocking-CSS headroom:** lane E measured the six title-critical sheets at 216,248 B on the tip, about
  22.7 KB under the ceiling. The "~50 B" in the briefs came from pass #1's note and is stale.
- **Lane E vs #4283:** #4283 ("Design pass #3: motion & first 30 s, round 3", another session, #4275) already
  builds the touch screen-enter fade. Lane E leaves that rule to it and keeps the exit easing token,
  press feedback, the results reveal and the tabular numerals.
- **Lane B vs #4297** (Home destination redesign, Closes #4291): both edit `.mb-sub` in
  `css/menu-destinations.css`. #4303 is 9 lines and lands first; #4297 syncs after it and re-blesses its
  Home baselines on the merged tree.
- **#4257:** the fix is draft PR #4305 by the claimant session, which will report when it merges. Lane A then
  does `--upgrade` and the rawColor-lowering swaps.
