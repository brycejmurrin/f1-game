# Process speed-up plan — session 2026-09-16 addendum

Continues `PROCESS-SPEEDUP-2026-09.md` (2026-09-01) rather than repeating it.
That plan's Tier A items (BOOT_MS everywhere, `test-bg` load refusal, groups
30→12) and Tier C (`game-vm.cjs`, 13 specs ported) have LANDED — this session
felt both, directly: `test-bg` refused to start at loadavg 3.18, and the
`hooks` group still cost ~70 minutes wall-clock for one push because the
specs it bundles (`dev-tools.spec.js` above all) were never ported. Below is
what THIS session — fixing 8 pre-existing test failures end to end, from
diagnosis through a green CI run — actually cost in minutes, and what would
have prevented each cost.

## 0. Where today's time went

| Step | Measured | Cost driver |
|---|---|---|
| `hooks` group, one push | ~70 min (4143.7s) | 327 tests, 1 worker, `dev-tools.spec.js` alone ~32 min per the 2026-09-01 measurement (still unported) |
| Re-verifying 8 fixed tests solo | ~2×8 tests, ~4 min each pass | Necessary — but paid twice: once on the changed tree, once on the same tree with the fix stashed out, to prove the failures were pre-existing |
| A missed guard round-trip | 1 extra push + ~11 min of CI | `npm run test:guards` (178 tests) passed locally; CI's "Structural guards" job runs `test:tooling-fast` (194 tests) and failed on a check `test:guards` doesn't cover — see §1.1 |
| Ratchet churn | 2 separate `--update` rounds, 2 commits | Every comment edit to `apex.js`/`agentview.js` changed its line count, and the ceiling is exact — see §1.2 |
| Diagnosing "reset() leaks state" | ~15 min of code reading + one live repro | Would have been instant with a guard — see §1.3 |
| Diagnosing the wake-lock click timeout | ~10 min, two tools (chrome-devtools MCP + Playwright), one quiet-box control run to rule out load | Root cause (actionability polling never resolves against a live render loop) is now documented but not yet load-bearing anywhere reusable — see §1.4 |

## 1. Findings

### 1.1 `test:guards` is not a subset check of what CI actually gates — LAND THIS FIRST

`npm run test:guards` (178 tests) and `npm run test:tooling-fast` (194 tests)
overlap heavily but are not the same suite, and nothing said so at the point
of use. I ran `test:guards` after a source edit, saw 178/178, pushed, and CI's
"Structural guards" job — which runs `test:tooling-fast` — failed on
`comment-citations.test.mjs`, a check `test:guards` never ran. That is a full
push-and-wait cycle (~11 min of CI time, plus the context-switch of coming
back to a red check) for a check that exists locally, just under the wrong
name.

**Fix, DONE (2026-09-16):** `test:guards` turns out to be a deliberately
small, hand-curated 14-file subset (`package.json`'s own script literal),
kept fast on purpose because the commit hook runs it on every commit —
aliasing it to `test:tooling-fast` (194 files, ~5 min) would tax every single
commit, not just pushes. The real gap was that nothing said "green
`test:guards` does not mean CI's structural gate will be green" out loud.
`AGENTS.md` rule 3 now says so explicitly and names the actual pre-push
command (`test:tooling-fast` / `verify-change.mjs --fast`, which already
calls it — this was already the documented pre-push tool; the miss was
reaching for `test:guards` instead of it).

### 1.2 Ratchets fight small, correct source edits — RETRACTED on closer reading

Both fixes to `apex.js`/`agentview.js` in this session (a 16-item array
addition, then a comment reword of that same addition) individually pushed
the file over its line-count ceiling. My first-pass read of that as "the
ceiling has no slack" was wrong, and the proposed fix below (give `lines`/
`codeLines` a fixed +10 slack) would have been a real mistake — reading
`tools/check/ratchets.mjs` in full on 2026-09-16 shows the ratchet already
has a slack mechanism, and it runs the OTHER direction: `slackMax` catches a
ceiling sitting too far *above* its current value (a stale, over-generous
number nobody has lowered), never a reason to tolerate growth *above* the
ceiling. The `OVER` case I hit (value > ceiling) is supposed to fire on any
growth at all, by the tool's own design doc: "a raise is a deliberate edit
with its reason in the commit." Loosening it there would remove exactly the
property it exists for — silent, unreviewed growth going unnoticed — which
its own comment already warns against ("must not quietly widen any of
them").

**What the friction actually was**: not a design flaw, but a workflow gap —
`ratchets.mjs --update` is a step I ran only after being told to by a failing
`test:guards`, rather than as a routine last step of any edit to a ratcheted
file, before verifying. No mechanism change needed; ~~the original "Fix"
below~~ is retracted.

~~**Fix**: give `lines`/`codeLines` ceilings a small fixed slack (e.g. +10) the
way `tests/data/ratchets.json`'s own doc string already allows for the four
CSS token-adoption counts (`slack: 0` there is a *tightening*, proving the
mechanism exists) — a deliberate LOOSENING for line-count metrics specifically,
where the failure mode this ratchet defends against (silent, unreviewed
growth) is not meaningfully worse at +10 lines than at +0. Keeps the "a raise
is a deliberate, explained edit" property for anything bigger, while not
taxing single-digit comment edits.~~

### 1.3 `EPISODE_TRANSIENTS` drifts by construction, and only `agent-determinism.spec.js` notices

The bug this session spent the most diagnosis time on (`reset()` leaves 16
fields' worth of stale state on the cars) was not a logic error — it was a
list (`EPISODE_TRANSIENTS` in `js/agent/apex.js`) falling out of sync with
`c.<field> =` assignments added elsewhere (`js/physics/tyre-model.js`, the
smoothed control-demand block in `game.js`) after the list was last extended.
The list's own header comment already says as much: "every key that differed
between consecutive post-reset snapshots at the same seed" — i.e. it is
already defined AS a diff against actual behaviour, just computed by hand,
after the fact, only when someone happens to run the determinism spec.

**Fix, DONE (2026-09-16)**: the original idea here (a regex/AST scan
collecting every `c.<identifier> =` target across `js/game.js` and
`js/physics/*.js`, diffed against `EPISODE_TRANSIENTS`) turned out to be the
wrong shape once tried — `makeCars()`, `gridUp()` and `clearRacingScratch()`
in `js/game.js` already reset most of those fields through mechanisms
entirely separate from `EPISODE_TRANSIENTS`'s delete-on-reset list, so a
naive "written somewhere, not in the list" scan flags mostly false positives.
Modelling all three coverage mechanisms statically would have been a second,
parallel re-implementation of what `reset()` already does at runtime.

`tools/check/episode-diff.mjs` already does the real check, empirically: it
replays one seed for a few episodes in the no-browser VM
(`tools/lib/game-vm.cjs`) and diffs the post-reset snapshot of episode 0
against episode 1, field by field — the exact "every key that differed
between consecutive post-reset snapshots" the `EPISODE_TRANSIENTS` header
comment already describes, just run by hand before today. It was refactored
to export `episodeLeaks()` (the CLI at the bottom is now a thin wrapper), and
`tests/unit/episode-transients.test.mjs` calls it for two tracks (monza,
singapore) and fails on any non-empty leak list. Running it once, before the
test existed, immediately found a live, previously-unknown instance: `game.js`'s
lazy `c.passPlan || (c.passPlan = {})` overtake-lane cache survived `reset()`
untouched, and a later line reads `.side` off it directly whenever the
overtake-attempt gate is closed that tick — a cold car has no `passPlan` so
that read is always true, a warm one carries last episode's `.side`, which can
be a stale `0`. Added to `EPISODE_TRANSIENTS`; the new test is green on both
tracks and confirmed red (reverted the one-line fix, reran, got the exact
failure) before being restored. ~15 s, two VM boots, in `test:game-vm`.

### 1.4 Live-render actionability timeouts are a known trap in docs, not yet a shared helper

`.claude/skills/mcp-probe/references/traps-chrome.md` now documents (from
this session and the prior one) that `chrome_click` / `locator.click()` can
hang for the full timeout against any Apex 26 page with an active render
loop, regardless of system load — confirmed on both the Garage screen and
the in-race HUD, on an otherwise idle box. The fix each time was a raw
`document.getElementById(id).click()` dispatched via `page.evaluate()`,
written inline at the call site. `wake-lock.spec.js` needed it this session;
nothing stops the NEXT spec that clicks a HUD button while a race is running
from re-discovering the same timeout the same way.

**Fix**: `tests/helpers/fixtures.js` (already the home of `BOOT_MS` and the
shared `load()` pattern per-spec files reimplement) gains one export —
`clickLive(page, selector)` — that does exactly the dispatch above, with the
trap's explanation in its own comment. Grep for `locator(` in spec files that
also call `race()`/`go()` without a `headless(true)` first turns up the
candidates to migrate; it is a mechanical, low-risk swap per site, not a
rewrite.

### 1.5 Re-verifying "was this already red" costs a full second browser run today

Confirming today's 8 failures were pre-existing (not caused by the `hooks`
group's neighbor commit) meant: stash the change, re-run the same 8 tests,
un-stash. That is a real, correct protocol — `verify-agent --base <ref>`
exists for exactly this and is read-only, but it runs `verify-change.mjs
--fast`, not an arbitrary named subset of tests, so it could not target just
the 8 tests already known to be failing. For a SMALL, KNOWN failing set (as
opposed to "is the whole tree red"), the stash-and-rerun this session did by
hand is the right shape of check but the wrong tool to reach for it with.

**Fix**: give `verify-agent` (or a sibling) a `--tests <spec>[:<grep>]`
mode: run exactly the named tests against the current tree AND against
`--base <ref>` in an ephemeral worktree, report both, and let the caller
diff them itself rather than re-deriving the stash dance per incident. Lower
priority than §1.1–1.4 — it is a nice-to-have for an already-uncommon
situation, not a recurring tax.

## 2. Order of work

| tier | items | effort | saves |
|---|---|---|---|
| A (today, no browser, do first) | §1.1 (name the real pre-push gate) — **DONE**, `AGENTS.md` rule 3. §1.2 — **retracted**, not a real gap | ~30 min | one push-and-wait cycle avoided per small source edit from here on |
| B (one sitting, no browser) | §1.3 (EPISODE_TRANSIENTS static guard) — **DONE**, `tests/unit/episode-transients.test.mjs`. §1.4 (`clickLive` helper + one migration pass over existing `locator(...).click()` sites on live-render pages) | ~2-3 h | turns a class of bug that takes a live repro + code reading to find into a guard that fails at edit time; removes a recurring rediscovery cost from every spec that clicks a HUD button mid-race |
| C (as it comes up) | §1.5 (`verify-agent --tests`) | ~1 h | only pays off the next time a small known-failing set needs a base-comparison, which is not every session |

## 3. What this addendum does NOT re-litigate

The 2026-09-01 plan's still-open items (`dev-tools.spec.js` port — the
single largest remaining `hooks`-group cost at ~32 min per full run — docs
generation, skill merges, the `deploy.mjs` CI-derived build number) are
unchanged by anything measured today and are not repeated here. §1.1 of that
plan (porting `dev-tools.spec.js`) is still the highest-leverage remaining
item in the whole document, old or new: it alone is close to half the
`hooks` group's wall time, and today's 70-minute run paid it in full because
nothing here touches it.
