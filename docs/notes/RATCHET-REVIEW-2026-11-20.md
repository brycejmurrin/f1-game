# Ratchet review: why `eagerBytes` costs so much, and what it measures, 2026-11-20

Kind: investigation · Re-measure-by: 2026-12-20

Decision: **B + D**, Bryce via the orchestrator session (session_01BEw9UHmq8je5APtVk54ssF, AskUserQuestion
2026-11-20 07:49Z: "B+D: count shipped bytes, ask only above 5 KB (Recommended)"). The implementation is a separate PR
under his own `config-ok`.

Ask (Bryce, 2026-11-20 ~07:42Z, relayed by orchestrator session_01BEw9UHmq8je5APtVk54ssF): "Investigate the reason for
our rachet and consider removing or redesign or how to help by removing comments etc".

Summary: the boot-wall ratchet `tree.eagerBytes` counts **raw source bytes**, but Pages ships the eager scripts
**minified** (`tools/desktop/minify.mjs`). On tip d35f2e29 the eager wall is 7,972,011 B raw and 3,325,036 B minified.
Gzipped, it is 1,186,476 B. **35.7 % of the counted bytes are comments**, and no player ever downloads them. Tonight
the exact (slack 0) ceiling cost ten `ratchet-raise` PRs, at least nine comment-trim or lazy-move workarounds and two
tooling fixes. Tonight's six measured raises came to 10,393 raw B, which is 1,630 B gzipped (0.14 % of what the phone
downloads). Recommendation: **B + D**. Count shipped (minified) bytes, and only ask Bryce when one PR grows the wall by
more than a threshold. No tooling or ceiling changes in this PR.

## 1. Why the ratchet exists (history)

| When | What | Source |
| --- | --- | --- |
| 2026-08 | The first ratchets: per-file `lines` for files that only grow (game.js went from 8,955 to ~4,700 lines in the July reorg, then back past 8,000). "A number nobody can raise gets deleted the first time it is inconvenient; a number you must look at gets thought about." | [CEILING-HISTORY.md](CEILING-HISTORY.md) §Why a ratchet |
| 2026-10-15 | `ratchets.d/` per-branch delta fragments, so two PRs growing one file stop conflicting on one JSON line. | [RATCHET-FRAGMENTS-2026-10-15.md](RATCHET-FRAGMENTS-2026-10-15.md) |
| 2026-10-24 | The boot-wall budget `MAX_EAGER_SCRIPTS` / `MAX_EAGER_BYTES`, hand constants in `tests/unit/boot-load-budget.test.mjs` (A·H15 load hunt). It protects the lazy groups won by earlier hunts: three island ~1.1 MB, track build ~535 KB, scenery 1,083 KB. | test header |
| 2026-10-29 / 10-30 | Bryce's raises: "Raise to 326" (D-024), "Raise budget +50 KB" (8.20 → 8.25 MB). | [CEILING-HISTORY.md](CEILING-HISTORY.md) §Boot wall |
| 2026-11-11 | Bryce's `decision: 8150000` (#5523): 101,087 B of room, a deliberate exception to "freed bytes are not headroom". Later lazy moves lowered the cap and handed none of the freed bytes out. | same |
| 2026-11-18/19 | Two PRs that were green alone (#5714, #5634) crossed the hand constant together. The tip went red, and three fixers each edited the same constant. | [BUDGET-RATCHETS-2026-11-19.md](BUDGET-RATCHETS-2026-11-19.md) |
| 2026-11-19 | Commit 68dd2e70 moved the constants into `tests/data/ratchets.json` `tree` as `eagerScripts` / `eagerBytes`, **slack 0**, measured by `tools/check/boot-wall.mjs`. | same |

**Why slack is 0 (exact).** It was seeded at the tip's measurement because #5815 had left zero room ("growth spent the
owner's room"). It keeps the constant's old rule: each lowering kept only the room Bryce's last decision left, and freed
bytes are never banked as headroom. The other four slack-0 entries (rawColor, rawColorDistinct, rawSpacing,
subFloorFontSize) are exact because they always asserted equality (ratchets.json `_doc`). A loosened slack is itself a
raise (`diffRatchets`), so room can only come from Bryce.

**What each ratchet guards** (`tests/data/ratchets.json`, measured by `tools/check/ratchets.mjs` and `tools/check/tree-counts.mjs`):

| Ratchet | Guards | Slack |
| --- | --- | --- |
| `files.*.lines` / `codeLines` / `gMembers` / `topLets` | Monolith growth in game.js, hud.js, hud.css, apex.js, car3d.js, glx.js, lobby.js, tracks.js, agentview.js. `codeLines` already skips comments. | default max(60, 4 %) |
| `eagerBytes` | Raw bytes of the 309 `<script src>` files every visit parses before the title | 0 |
| `eagerScripts` | The count of those tags | 0 |
| `rawColor` / `rawColorDistinct` / `rawSpacing` / `subFloorFontSize` | CSS design-token migration: shrink-only | 0 |
| `zeroRefModules` / `implicitAsserts` / `twinDebt` | Test coverage debt: shrink-only | 0 |
| `assertPins` / `assertPinsAll` / `vmSrcLoads` / `rawGameReads` | Test pin counters, diff-relative (`pinVerdict`) | 200 / default |
| `cssClasses` / `shellNodes` / `bareCatches` / `dynamicIdReads` / `waitNoPolling` / `waitForTimeout` | Tree hygiene counts | 5–39 / default |

**What the player gets from `eagerBytes`.** Every visit parses and evaluates the eager wall before the title screen.
Bryce plays on an iPhone over the TLX WebGPU path (D-013), so boot time there is the cost. A file that slips back
onto a `<script>` tag from a lazy group costs tens to hundreds of KB, and no functional test notices. That is the real
catch, and it is a step change, not a few hundred bytes. The sister test "no lazy or deferred group is back on the
boot wall" (same file) catches the most common version of it directly. After the first visit, the service worker
serves the files from cache, so the download cost is paid on a first visit or a changed file. The parse cost is
paid on every boot, and it is paid on the **minified** text.

## 2. Cost tonight (2026-11-19 20:00Z → 2026-11-20 ~08:00Z)

Sources: GitHub search (`ratchet-raise`, `eagerBytes`, `CEILING-HISTORY` over PRs updated since 20:00Z), commit
bodies on the branches, PR comments, and the orchestrator's worker messages. The GitHub MCP exposes no label
timeline, so **re-click counts come from the orchestrator's worker messages** and are not independently re-read here.

| Kind | Count | Evidence |
| --- | --- | --- |
| PRs carrying Bryce's `ratchet-raise` | 10 | #5686, #5721, #5782, #5786, #5296, #5679, #5738, #5747, #5778, #5793 |
| Pending raise asks | 1 | #5953 (+2,194 B, commit 7d7d879c "needs Bryce's ratchet-raise") |
| Re-clicks after a push staled the label (the merge-gate `raise` row wants a label newer than the last ratchet push) | ≥ 6 | #5686 ×3, #5782, #5721, #5953 (orchestrator) |
| `decision:` comments on a raise | 3 | #5686 (+6,151 B, 15:09Z), #5679 (18:29Z), #5576 (15:08Z) |
| Comment trims to fit the ceiling | ≥ 9 | #5726 acebd4b1 (+1,022 → −8 B), #5949 878d2d0e ("comments … trimmed (meaning kept, orchestrator decision B)"), #5952 4c581922 ("comments tightened"), #5948 3abc083a ("comment trims"), #5747 (−142 B: "the comments that explained them were the bytes over the tip, so they were cut"), #5679 (−675 B own comments), #5793 (−242 B), #5576 ("trimmed the PR's own comments to one line each"), #5778 (1,379 B of the raise is the comments that carry fix 6's corrected facts) |
| Code moved lazy to pay for a fix | 2 | #5960 e3050407 (−3,846 B into LAZY_AGENT), #5957 b46c6bfa (share-card trio into LAZY_RESULTS_SHEET, to re-land #5818 / #5821) |
| Union conflicts on CEILING-HISTORY.md | 4 | #5778 twice (d7f46976, 19ba8f02), #5679, #5721; tooling fix #5926 |
| sync-pr fragment bug | 1 | #5873 (sync-pr judged the cure on raw ceilings and dropped fragments) |
| Fragments open in `tests/data/ratchets.d/` | 23 | **all 23 carry `eagerBytes`**; 4 also carry a file `lines`/`codeLines` delta; no other tree metric appears |
| Extra CI runs | not counted exactly | each re-sync after a staled label or a union conflict is one push and one full PR tier (#5686, #5721, #5778 ×2, #5679, #5782) |

`eagerBytes` is the only ratchet that showed up in tonight's friction, and it is the only one that every ordinary
feature or fix PR moves.

## 3. Does `eagerBytes` measure what ships? No.

`boot-wall.mjs` `wallNow` / `wallAt` sum `fs.statSync(f).size` / the git blob size: raw source. Pages runs
`tools/desktop/stage.mjs`, which minifies every staged `js/**/*.js` with terser (`MINIFY_OPTIONS`: comments
dropped, whitespace dropped, local names mangled, no compress). ci.yml's "Staged build boots (minified _site, as
Pages ships it)" proves that the minified build boots.

Measured on tip **d35f2e29** (the 309 eager scripts, the stage's own `minifySource`, Node zlib; scripts in this
session's scratchpad, numbers reproducible):

| Measure | Bytes | % of raw |
| --- | ---: | ---: |
| raw source: what `eagerBytes` counts | 7,972,011 | 100 % |
| comments alone (acorn `onComment`) | 2,847,130 | 35.7 % |
| terser-minified: the files Pages ships | 3,325,036 | 41.7 % |
| raw + gzip -9 | 2,782,797 | 34.9 % |
| **minified + gzip -9: what the phone downloads (GitHub Pages gzips)** | **1,186,476** | 14.9 % |
| minified + brotli 11 (for reference) | 1,054,828 | 13.2 % |

Biggest comment holders: js/game.js 343 KB of its 666 KB, liverytex.js 86 KB, hud.js 70 KB, input.js 63 KB,
car-draw.js 59 KB, ai-drive.js 57 KB.

**Tonight's measured raises in shipped bytes** (each merge commit against its first parent):

| PR | raw (counted) | minified | min+gzip | min+brotli |
| --- | ---: | ---: | ---: | ---: |
| #5738 | +2,875 | +1,576 | +460 | +359 |
| #5778 | +2,376 | +658 | +221 | +180 |
| #5576 | +1,631 | +998 | +314 | +279 |
| #5679 | +1,382 | +938 | +337 | +277 |
| #5793 | +1,060 | +681 | +152 | +126 |
| #5706 | +1,069 | +390 | +146 | +116 |
| **sum** | **+10,393** | **+5,241** | **+1,630** | **+1,337** |

All six raises together add 1.6 KB to a 1.19 MB download (0.14 %). Every comment trim tonight saved the player
**0 bytes**, because terser drops the comments anyway, and it took the explanation out of the source. #5778's raise
is 2,376 raw B but only 658 shipped B, because most of it was the corrected comments.

## 4. Options

| | What | Cost | Risk |
| --- | --- | --- | --- |
| **A** | Keep it as is | Every feature or fix in an eager file needs a click, often more than one. Agents keep deleting comments that ship as 0 B. | Comments rot. The raise signal gets clicked through by habit. |
| **B** | Measure the shipped bytes: minified with the stage's own terser options, gzip shown beside them | Comments become free, and the number tracks what the iPhone downloads and parses. terser takes about 8 s per measured ref, and the gate measures head, merge-base and tip. That needs a per-blob cache. `boot-load-budget.test.mjs` is in `TIP_GATE_TESTS`, whose closure must be node built-ins plus repo files (land.yml `trusted-rows` installs nothing). So B needs either an `npm ci` there or a small repo-local comment stripper. That is protected config, under Bryce's `config-ok`. | Low. A one-time re-seed of the ceiling (3,325,036). |
| **C** | Give the exact ceiling a slack, per PR or per week | Routine growth needs no click. | Without B, comments still count. A per-week budget needs a clock and a ledger, which is more moving parts. A plain slack lets many small PRs drift up unseen. |
| **D** | Keep the ceiling, drop the exactness: a lowering stays automatic, growth under a per-PR threshold is auto-written as a fragment with its reason, and only growth above the threshold needs `ratchet-raise` | Same idea as Chromium's android-binary-size trybot, which asks for a `Binary-Size:` justification only above 16 KiB per commit. | Slow drift. A weekly line in the fold job's summary keeps it visible. |
| **E** | Remove `eagerBytes` and keep only a boot-time perf test | CI has no real GPU, and timings there measure the box (AGENTS.md rule 7). | A noisy signal. Loses the cheap and deterministic guard against a lazy group creeping back. |

Prior art: `size-limit` (ai/size-limit) checks the size the user downloads (brotli by default since v11, gzip as an
option) against a per-entry limit, and comments on the PR with the delta. `bundlesize` checks gzip size per file.
Neither counts raw source. Chromium's binary-size bot uses a per-commit threshold with a written justification
above it.

**Recommendation: B + D.**
1. `eagerBytes` counts minified bytes: the stage's `MINIFY_OPTIONS`, cached per blob sha. gzip goes in the message
   as information. Minified is deterministic under the pinned terser, while gzip output can vary between zlib builds.
2. A PR whose own growth is at most **5,000 minified B** (about 1.5 KB gzipped) is auto-recorded as a fragment, and
   the commit message carries its reason. Above that, `ratchet-raise` as today. Every measured raise tonight was under
   1,600 minified B, and a lazy group put back on the wall is tens of KB or more, so the guard still catches that.
3. Lowerings stay automatic. `eagerScripts` stays exact (it rarely moves). The sister "no lazy group back on the
   boot wall" test stays.
4. The fold job posts the week's net eager growth, so drift stays in view.

**Other ratchets.** Keep them all. None of them showed up in tonight's friction. The CSS-token and coverage ones are
shrink-only and move only with CSS or test work. The per-file `lines` ratchets also count comments, but their default
slack of max(60, 4 %) absorbs routine growth, and `codeLines` already skips comments. A later tidy-up could drop
`lines` where `codeLines` exists, but nothing was blocked by it tonight.

## 5. Candidate "free bytes" (not removed; listed only)

The eager wall carries almost no dead code. A scan of line comments shaped like code found 7 (566 B), and most of
those are prose that happens to end in `;`. One real example: the commented-out `Log.time` usage line in
`js/core/log.js`. There is no TODO / FIXME / XXX / HACK in any eager file.

The larger pool is **provenance comments**: 634 comment lines that cite a PR or issue number (52,253 raw B; game.js
4.4 KB, hud.js 2.4 KB, car-draw.js 1.6 KB, settings-export.js 1.6 KB, renderer-boot.js 1.5 KB, lazy-bundles.js 1.5 KB).
Some of them are history that git already records. Under option B they cost players nothing, so they should be
trimmed only where they are stale, never to pay the ratchet. Under option A they are the cheapest "free bytes" a
lowering could take, but each line needs reading first. Many explain why a seam exists.
