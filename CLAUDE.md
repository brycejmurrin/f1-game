# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks. Pure IIFE modules
loaded via `<script>` tags. Static files — runs on GitHub Pages.

---

## Key commands

```sh
npx serve -l 3456 .               # run locally (or: python3 -m http.server 3456)
node tools/assets.mjs bake-synthetic  # rebuild assets/pack (no network, no deps)
node tools/assets.mjs verify          # licence allow-list + md5 + size budget
node tools/verify-track.cjs <id>  # headless build check (no browser) — catches a
                                  #   scenery/buildRoad/buildProps THROW that would
                                  #   strand the game on the menu (e.g. a bad ref).
                                  #   Fast pre-push guard for track scenery edits.
```

---

## Testing workflow

**The reference is `docs/TESTING.md`** — every group, every spec, the fixtures,
the philosophy. `tests/test-groups.test.mjs` fails if it and `package.json`
disagree. Do not copy its tables here; this section is the three rules only.
> ### AGENTS: NEVER BLOCK ON A TEST RUN. NEVER POLL ONE EITHER.
>
> A single SwiftShader spec is 40-90 s on a small box and a group is tens of
> minutes. Blocking wastes all of it; `tail`-ing in a loop wastes it *and* fills
> the transcript.
>
> **Start it and walk away:** `node tools/test-bg.mjs <groups>`, or a Bash call
> with `run_in_background`, or arm a `Monitor` with an until-loop and be woken:
> ```sh
> until ! pgrep -f "[p]laywright test" >/dev/null; do sleep 10; done; echo done
> ```
> One check to confirm it started is fine. After that, go and do real work.
>
> **The wait is working time.** In rough order of value: re-read the diff you
> just wrote; verify a factual claim you put in a code comment; research the
> platform behaviour behind the bug (TinyFish `search` / `fetch_content`); draft
> the docs the change needs; plan the follow-up. Two real returns from doing
> this in one session: a comment blaming WebKit for a spec-mandated
> `setPointerCapture` throw got corrected before it could mislead anyone, and an
> iOS report of interactive controls sitting in an invisible top-edge dead zone
> turned up **five** of ours sitting exactly there.
>
> **The one thing that is NOT safe mid-run:** editing `js/` or `css/`. The test
> server serves the working tree, so later specs would load a mixed build.
> Editing docs, reading, researching and planning are all fine.
>
> Durable findings go in `docs/research/` —
> **`docs/research/PLATFORM-INPUT-NOTES.md`** is the standing collection.

Three rules, in order. The reference — every group, every spec, the fixtures and
the philosophy — is **`docs/TESTING.md`**, and `tests/test-groups.test.mjs`
fails if it and `package.json` disagree. Do not maintain a second copy of that
table here.

**1. Run tests in the BACKGROUND and tail the log. NEVER BLOCK ON A TEST RUN.**
A foreground run blocks for minutes and prints nothing you can act on. Start it,
go do something else, come back to it.

```sh
node tools/test-bg.mjs smoke api collision   # start; returns immediately
tail -f artifacts/logs/smoke.log             # watch one
node tools/test-bg.mjs --status --wait --stop
```

**Four ways an agent wastes an hour here.** Every one of these was hit in a
single session; they are cheap to avoid and expensive to diagnose, because each
one looks exactly like "the tests are slow".

| Trap | What happens | Do instead |
|---|---|---|
| `cmd \| tail -N` in the background | `tail` buffers to EOF, so the output file stays **empty** for the whole run and there is nothing to poll. It looks hung | Let it write in full, or `\| tee`; read the file at the end |
| `until ps aux \| grep -q "[f]oo"; do sleep …` | The wait loop's OWN command line contains `foo`, so `ps` matches **itself** and it never exits | Match a PID, or check the output file for a completion marker |
| `pkill -f <pattern>` to clean up | Kills the run you just started as well as the strays. Exit 143/144 with no result | Kill the specific PID you captured |
| Several heavy runs at once | SwiftShader is CPU-bound; they starve each other and all die to their own timeouts. Not a failure — a false one | One run at a time; more workers is not more throughput |

#### CHECK THE BOX IS QUIET BEFORE YOU START, AND CLEAN UP AFTER

**This is the single easiest way to get fake results, and it does not look like
one.** The box has **4 cores**. Every Playwright worker drives a SwiftShader
Chromium; a group at `--workers=2` is already half the machine.

```sh
pgrep -cf pw-browsers      # Chromium processes. Expect 0 before a run
cat /proc/loadavg          # expect < 3 before a run, on 4 cores
node tools/test-bg.mjs --status
```

**`test-bg.mjs` now ENFORCES this** — it refuses to start more groups than
`cores / WORKERS` (counting anything already running) and prints the batches to
run instead; `--force` overrides. `pick-tests.mjs` prints its suggestion
pre-batched for the same reason. The rule was in this file and in
`docs/TESTING.md` for some time and was still broken, by an agent reading both,
because `pick-tests --bg` handed out a nine-group command — so it lives in the
tool now. Run **at most two groups at once**, and never a group alongside another heavy
suite (`test:baseline`, anything `--project=render`, a `tools/*-audit.mjs`
sweep). Groups are separate processes, which is why parallelism helps at all —
but only up to the core count.

**The signature of an oversubscribed box is a TIMEOUT, never an assertion.** If
every failure reads `Test timeout of 120000ms exceeded` and none of them is an
expectation that did not hold, you are almost certainly measuring the machine
and not the code. Re-run the group ALONE before believing any of it. Measured
this way once: 117 Chromium processes on 4 cores, load average **50.7**, and
nine "failures" in `elevation-tracks.spec.js` that were all the same 120 s
timeout — zero real defects.

**Orphans are the usual cause, and they are invisible.** `--stop` used to signal
only the `npm run test:<group>` shim, and npm does not forward signals, so
`run-playwright`, the Playwright runner and its browsers survived. An orphan
does not appear in `--status`, keeps its workers on the CPU, and **keeps writing
to the log file the next run truncates under it** — the tell is two independent
progress counters interleaved in one log (`19/105 done, 0 failed` next to
`39/105 done, 10 failed`). `--stop` now signals the process GROUP
(`kill(-pid)`; the children are spawned `detached`, so pgid === pid) and
escalates to SIGKILL after 4 s. Starting a batch also no longer clobbers the
record of one already running.

If anything is ever left behind:

```sh
node tools/test-bg.mjs --stop
pkill -9 -f 'tools/run-playwright'; pkill -9 -f pw-browsers
```

Then wait for `/proc/loadavg` to fall back under ~3 before starting anything —
the load average lags the kill by a minute or two, and starting into a decaying
load reproduces the same fake timeouts.

#### Parallelise the THINKING, serialise the BROWSER

Full reference: **`docs/PARALLEL-WORK.md`**. The one-line version, because it is
counter-intuitive and it has already cost a morning:

**Worktrees isolate files. They do not isolate CPU.** Fanning agents out across
worktrees to run tests faster does the opposite — they thrash the same four
cores and every one of them reports timeouts.

- **Parallel is free for READS**: exploration, contract audits across a domain,
  reviewing a diff from several angles, checking prose against code, per-file
  analysis ahead of a mechanical migration. Token-bound, not CPU-bound.
- **Parallel is harmful for BROWSERS**: test groups (max two), anything
  `--project=render`, `test:baseline`, `tools/*-audit.mjs`.
- **Worktrees earn their keep** for "was this failing before my change?" (the
  tests serve `js/`/`css/` off disk, so the working tree cannot answer it), for
  baseline-vs-worktree diffs (`tools/graph-parity.cjs` already works this way),
  and for edits that would otherwise silently overwrite each other. The `Agent`
  tool takes `isolation: "worktree"`. Symlink `node_modules` in (safe only while
  `package-lock.json` matches) and `git worktree remove --force` when done.
- **A plan's fan-out should reduce the NUMBER of verification rounds**, not run
  more of them at once — verification is serial here and is the bottleneck.

**Research the mechanism, not just the fix.** The TinyFish MCP tools
(`search`, `fetch_content`) are the fastest way to check a platform claim, and
this codebase has repeatedly been bitten by defects whose *cause* was guessed
correctly-ish and written down wrongly. Doing this during a test run costs
nothing. Two concrete returns from one such session:

- a code comment blamed WebKit for a `setPointerCapture` throw that is in fact
  spec-mandated in every engine — the comment would have sent the next reader
  hunting a Safari bug that does not exist;
- the Escape-vs-`<dialog>` fix was confirmed portable to Safari *for a different
  reason* than it works in Chrome, which is the difference between "it passed"
  and "it will keep passing".

Anything durable that comes out of it goes in `docs/research/` — see
**`docs/research/PLATFORM-INPUT-NOTES.md`**, which collects the platform
behaviours that are invisible on the desktop this game is developed on
(pointer capture, the top layer, `zoom`, `(pointer: coarse)`, iOS context loss).
Read it BEFORE debugging anything that reproduces on one device and not another.

**A timeout kill (exit 143/144) is not a test result.** It says nothing about
the code — the run was killed, not answered. Re-run it serially before believing
anything about it, and never report it as a pass or a failure.

**The concrete `Monitor` pattern**, since "arm a Monitor" is the instruction and
all the traps are in the mechanics:

```
1. Start it backgrounded, redirected to a LOG FILE — never `| tail`, which
   buffers to EOF so the file stays empty and there is nothing to read.
   `mkdir -p` FIRST: artifacts/ is gitignored, so a fresh clone or worktree does
   not have it and the redirect fails before the command ever runs.
     mkdir -p artifacts/logs
     node tools/run-playwright.mjs tests/foo.spec.js --reporter=line \
       > artifacts/logs/foo.log 2>&1

2. Arm Monitor on the FILE with an until-loop that exits when the run ends, and
   print only the verdict — each stdout line becomes one notification.
     until grep -qE "[0-9]+ (passed|failed)|Error:" artifacts/logs/foo.log 2>/dev/null
     do sleep 15; done
     grep -E "[0-9]+ (passed|failed)|Error:" artifacts/logs/foo.log | head -3

3. Start the next piece of work IMMEDIATELY. The notification comes to you.
```

- **Match every terminal state, not just success.** A watcher grepping only for
  `passed` stays silent through a crash, a hang or a timeout kill — and silence
  is indistinguishable from "still running".
- **Watch the LOG, not the process table.** A watcher whose own command line
  contains the string it greps for in `ps` matches *itself* and never exits.

IMPORTANT: don't edit `js/` or `css/` while a run is in flight — the server
serves the working tree, so later specs load a mixed build (see the note at the
end of this section). Writing docs, reading, and researching are all safe.

**DO NOT SIT AND WAIT FOR A RUN.** A SwiftShader group is minutes to tens of
minutes; an agent that polls `--status` in a loop, or blocks on `--wait`, burns
the entire run doing nothing. Repeatedly checking progress is the same waste
spelled differently — the tally moving from 39/77 to 41/77 is not information.

**Arm a monitor, then go and work.** The `Monitor` tool turns the log into
events so the result comes to you:

```
Monitor({ command: 'tail -f artifacts/logs/<group>.log | grep -E --line-buffered "x FAIL|= run (passed|failed)"',
          description: 'failures or completion in <group>' })
```

Filter for **both** outcomes — a monitor that greps only for success is silent
through a crash, and silence looks exactly like "still running". A background
`Bash` command that exits on completion (`until … done`) works too, and gives
one notification instead of several. `--wait` is for CI and for the one case
where the next edit genuinely cannot be chosen until the result lands.

The one hard constraint while a run is in flight: **the test servers read `js/`
and `css/` straight from the working tree**, so editing those mid-run makes
later specs load a mix of versions. Everything else — `tools/`, `docs/`,
`tests/` (new files), commit messages, `CLAUDE.md` — is fair game.

#### What to actually DO with those minutes

Roughly in priority order. The first two are work on the run itself; the rest is
work you would otherwise do after it.

1. **Triage failures as they land, not at the end.** `live-reporter.js` writes a
   line per test the moment it finishes, so a failure is readable minutes before
   the run is. `grep -n "x FAIL" artifacts/logs/<group>.log` and start
   diagnosing immediately — by the time the run ends you can already have the
   fix written (staged, not applied, if the run is still going).
2. **Predict the blast radius and check the prediction.** Before the result
   arrives, write down which specs SHOULD fail given the diff and why. A spec
   that fails and is not on your list is the interesting one; a spec on your list
   that passes means you did not understand your own change. This turns a wait
   into a comprehension check.
3. **Reproduce a suspected failure in isolation** — a single spec on a free port
   is cheap and does not disturb the group (`npx playwright test <spec>
   -g "<name>" --reporter=line`). This is also how you tell a real failure from a
   contention timeout (see the ceiling note below).
4. **Write the NEXT spec.** `tests/` is safe to add to mid-run — Playwright
   globbed its list at start. New coverage for the change you just made is the
   single most useful thing to produce while its existing coverage runs.
5. **Hunt for bugs in the code you have just been reading.** You are never
   better placed to find one than immediately after loading a module into
   context for another reason. Look for the shapes this codebase actually
   produces: a helper with **no consumer** (`Input.throttleLevel()` sat dead for
   months — analog trigger travel computed and thrown away), a comment that no
   longer matches its code, duplicated logic that can drift (`simTilt` restates
   `tiltSteering`'s body), a constant compared against a raw speed where
   `vStd()` was meant. `grep` for the invariant, not for the symptom.
6. **Plan the next phase concretely** — compute the actual numbers, not the
   intent. Tabulating what a slider currently does is what turned "feels wrong"
   into "the step below the default is 25 % and above it is 5 %", which is a
   different and far more fixable statement.
7. **Read the code you are about to touch next**, and draft the commit message
   for the change in flight while the reasoning is still fresh.
8. **Research.** See below.
9. **Docs** — `docs/`, `CLAUDE.md`, `tools/README.md`. Note that
   `tests/docs-integrity.test.mjs` gates several of these (spec counts, the tools
   index, `docs/README.md` links), so doc work often has to happen anyway.

#### Research tools, and which to reach for

**TinyFish** (`mcp__tinyfish__*`) is the default web toolkit — prefer it over
`WebFetch`/`curl`:

| Tool | Use it for |
|---|---|
| `search` | find pages. `domain_type: "research_paper"` for academic sources, `"news"` for current events; `include_domains` to pin to a known-good site; `after_date`/`before_date` or `recency_minutes` for freshness |
| `fetch_content` | read up to 10 URLs in parallel, rendered in a real browser, returned as clean markdown. `include_selectors`/`exclude_selectors` to cut boilerplate on a noisy page |
| `run_web_automation` | when reading is not enough — clicking, forms, login, anything behind interaction. Slow (minutes) and credit-metered; needs a fresh `session_id` UUID per call. If it times out the run may still be live: use `list_runs`/`get_run`, never a blind retry |
| `create_browser_session` | a remote CDP endpoint for direct Playwright/Puppeteer control. Close it when done |

**Context7** (`mcp__Context7__*`) for library documentation, and it is two calls,
always in this order: `resolve-library-id` (name → `/org/project`) then
`query-docs` (one concept per call, specific). Use it for anything versioned —
three.js, Rapier, Playwright APIs — rather than trusting recall.

What is worth researching here, from experience: how shipped racing games name
and scope a feature before we invent our own vocabulary; accessibility
documentation, which is unusually specific about mechanics because it has to be;
and the physical meaning of anything we are about to map onto a physics
constant, so the sign is right the first time. Findings that outlive the task go
in `docs/research/` — including the NEGATIVE ones, because a decision not to
build something gets re-litigated every few months unless it is written down.
See `docs/research/DRIVING-CONTROLS-RESEARCH.md` for the shape.

#### Worktrees: the way to keep editing while a run is in flight

**Use a worktree whenever a test run is in flight and you have `js/` or `css/`
work to do.** This is a standing project instruction, so `EnterWorktree` is
sanctioned here without asking — that tool is otherwise gated on the user or
this file saying so.

The "don't edit `js/` or `css/`" constraint is a property of the DIRECTORY the
test server was started in, not of the repo. A `git worktree` is a second
working directory on the same object store, so an edit there cannot disturb a
run in this one. **Measured:** changing a constant in a worktree's
`js/game/input.js` left the main tree's copy untouched, and the in-flight run
kept serving the original.

`.claude/settings.json` sets `worktree.baseRef: "head"`. **Do not remove it** —
the default is `fresh`, which branches from `origin/<default-branch>` and would
silently strand a worktree on a base with none of the current branch's work.

Either the tool or the raw commands work:

```sh
git worktree add .worktrees/<task> -b <branch>        # .worktrees/ is gitignored
cp --reflink=auto -r node_modules .worktrees/<task>/  # REQUIRED — see below
git worktree remove --force .worktrees/<task>         # and `git branch -D` if throwaway
```

Two measured costs, both easy to trip over:

- **A worktree has no `node_modules`** — it is gitignored, so it is not checked
  out, and `require.resolve("@playwright/test")` fails outright. Nothing can run
  tests there until you copy it (19 MB here; `--reflink=auto` makes it nearly
  free on a CoW filesystem). Do NOT symlink it — concurrent installs corrupt a
  shared directory.
- **~35 MB of checkout per worktree**, plus that `node_modules`.

**A worktree buys EDITING freedom, not free test parallelism.** Two agents in
two worktrees each running a test group is exactly the CPU oversubscription
described below — the group ceiling is a property of the box, not of the
directory. Parallelise the *writing*; serialise the *running*.

#### Deciding what a plan can fan out

Worth asking of every plan, not just large ones. The decomposition question is
always the same: **which files does each task own?** Two tasks that touch the
same file must be sequential; the planning cost of getting this wrong is paid
back at merge time with interest.

In THIS repo the answer is usually dictated by one file. `js/game.js` is ~8 000
lines and holds the loop, the physics, the AI and the race logic, so most
gameplay work touches it and most gameplay work is therefore *serial*. What
does fan out cleanly:

| Fan out | Because |
|---|---|
| Read-only investigation (`Explore` agents, 2-3 at once) | no writes at all; this is the plan-mode default for a reason |
| Research + docs alongside implementation | `docs/`, `tools/README.md` and `js/` never collide |
| A `tools/` script beside a `js/` change | different trees entirely |
| Per-circuit work (`js/circuits/<id>.js`) | one file per circuit, 40 of them, genuinely independent |
| A new spec beside the change it covers | `tests/` is additive |
| Independent `js/game/*` modules | each is its own `Module.create(G)` file — but check whether both also need a `G` façade entry in `js/game.js`, which serialises them |

The `Agent` tool takes `isolation: "worktree"` to do the setup itself. Use it
when subagents genuinely write in parallel; skip it when they only read, since
it costs setup time and disk for nothing.

Two conventions that make a fan-out reviewable: give each agent a **non-
overlapping file list in its prompt**, and have it report **what it changed and
why** rather than leaving you to diff. If two agents must touch `js/game.js`,
that is the signal to sequence them instead.

**Parallelism has a real ceiling, and exceeding it manufactures failures.**
Count **WORKERS against CORES, not groups against cores** — each group is a
server plus `WORKERS=2` Chromium+SwiftShader processes, so N groups is 2N
browsers. But a SwiftShader browser does not take *a* core, it takes several:
**measured, ONE group at the default `WORKERS=2` holds this 4-core box at load
8.9-11.0**, with every chrome tree traced back to that single `test-bg` pid and
no orphans. `LOCAL_WORKERS` floors at 2, so the default group is *already*
~2.5x cores and there is no lighter setting short of `--workers=1`.

Which means the practical rule is stronger than "don't run two groups": **one
heavy group is the box's full capacity**, and a second one is not a 2x slowdown
but the difference between passing and timing out. `physics`, `behaviour`,
`circuit` and anything rebuilding circuits want the machine alone — and a
subagent told to "just run `test:tiny` to check" is a third and fourth worker,
so give it `--workers=1` or have it verify without a browser.

**Give subagents a flat prohibition, not a load threshold.** "Check
`/proc/loadavg` first and skip the run if it is above 6" reads as careful and
is not: an agent checks once, spends ten minutes editing, and starts the run
against a number that has since moved. Measured in exactly that way here — a
`test:tiny` in a worktree took the box from ~9 to **18.9** and cost the group
running in the main tree a 209 s timeout on a spec that is fine alone. Say
**"do not run Playwright at all; report it unverified and I will run it"** and
run it yourself afterwards. A verification you have to redo is not a saving.

When it happens anyway, **write down the contaminated WINDOW** before doing
anything else — the log is timestamped, so `awk -F'[][]' '$2 >= "HH:MM:SS" &&
$2 <= "HH:MM:SS"'` over it gives you the exact list. A pass inside the window is
still a pass (contention makes tests slower, not wrong); it is only the
FAILURES in it that have to be re-run alone before they mean anything.

Past the ceiling, tests fail on the CLOCK rather than on an assertion. The
signature is `Tearing down "context" exceeded the test timeout`, a bare
`Test timeout of 120000ms exceeded`, or a spec whose duration is several times
its usual. Measured here, same commit each time:

| Spec | Under load | Alone |
|---|---|---|
| `elevation-tracks › albert_park` | 219 s, **FAILED** (3 groups) | 30 s, passed |
| `aero-zones › a bigger wing trades HARDER` | 133 s, **FAILED** (2 groups) | passed, 10/10 file |
| `aero-zones › a bigger wing trades HARDER` | 133 s, **FAILED** (1 group!) | — |

That last row is the one that taught the lesson. The same spec failed a third
time with **nothing else running**, which is what forced the reading above and
then the real diagnosis: it does three localStorage writes, three page reloads
and three full Monza builds, where every other test in its file does one. Its
own logs show the single-build tests at 30-64 s and this one at 133 s. It is
not a flaky test and it was never a physics regression — it is **3x the work
against a shared 120 s default**, and it now carries `test.slow()` and a comment
saying so.

The general lesson: a timing-shaped failure that survives the load check is
usually a spec whose COST nobody costed. Before reaching for a retry or a
bigger box, compare that test's duration against its siblings in the same file
— an outlier of 2-4x is a structural difference you can name.

**Before believing a timing-shaped failure:**

1. `cat /proc/loadavg` — anything past ~2x cores means the result is suspect.
2. **Check for ORPHANED workers.** `test-bg --stop` and killing the run's pid do
   NOT reap worker trees whose ancestor has already reparented to init, and a
   stale tree will quietly eat the box under every later run:
   `ps -eo pid,ppid,comm | awk '$3=="chrome"{print $2}' | sort -u` and trace each
   parent back — anything whose chain hits `1` before it hits a live `test-bg`
   pid is a leak. Kill those first.
3. Re-run that ONE spec alone: `npx playwright test <spec> -g "<name>"`.

**Never amputate one group to rescue another mid-run.** Killing a group takes
its server down, so every remaining test in it fails in ~1 s against a dead
port, and the final tally ("31 failed") is almost entirely artifact. If the box
is oversubscribed, stop EVERYTHING and restart serially — the results you keep
are worth more than the minutes you save.

### 2. Run the groups the change needs — not all of them

**Start the run, ARM THE `Monitor` TOOL, and go do the next piece of work.**
Waiting is the mistake — polling in a loop, `sleep`ing, or narrating progress
are all the same mistake wearing different clothes. `Monitor` exists so you do
not have to wait: it watches in the background and *notifies* you, and the
notification arrives on its own. Arming it and then sitting there defeats the
entire point.

The pattern, in three steps:

```
1. Start the run in the background, redirected to a LOG FILE.
   Never `| tail` — tail buffers to EOF, so the file stays empty and there is
   nothing for the watcher (or you) to read.

   Bash(run_in_background: true):
     node tools/run-playwright.mjs tests/foo.spec.js --reporter=line \
       > artifacts/logs/foo.log 2>&1

2. Arm Monitor on that file, with an until-loop that EXITS when the run ends.
   Each stdout line becomes one notification, so print only the verdict.

   Monitor(description: "foo specs verdict", timeout_ms: 900000):
     until grep -qE "[0-9]+ (passed|failed)|Error:" artifacts/logs/foo.log 2>/dev/null
     do sleep 15; done
     grep -E "[0-9]+ (passed|failed)|Error:" artifacts/logs/foo.log | head -3

3. IMMEDIATELY start the next piece of work. Do not poll the log, do not sleep,
   do not report "still running". The notification will come to you.
```

Two rules that make step 2 work:

- **Match every terminal state, not just success.** A watcher grepping only for
  `passed` stays silent through a crash, a hang or a timeout kill — and silence
  is indistinguishable from "still running". Include the failure signatures.
- **Never let the loop's own command line match its own grep.** `ps aux | grep
  -q "verify-track"` inside a watcher whose command *contains* the string
  "verify-track" matches itself and never exits. Watch the LOG, not the process
  table.

**While the run is in flight, do not edit `js/` or `css/`** (tests serve them
from the working tree). Edit `tests/`, `docs/`, `tools/` — or write the commit
message. There is always non-conflicting work.

**AND ABOVE ALL DO NOT BUMP `version.json` MID-RUN.** This is the sharp edge,
because it does not look like editing source at all — it is one integer in a
one-line file. But `index.html`'s shell version guard fetches `version.json`
(`no-store`) and **force-reloads the page** when the deployed build is newer than
the cached shell. Every page a running spec has already opened is on the old
build, so bumping the number reloads them ALL, mid-test. What you get back is a
test that hung and then died on its own timeout — the machine-oversubscription
signature, on a quiet box, for a reason that has nothing to do with the machine.

Measured here: `smoke.spec.js › HUD › speed readout updates after jump()` had
passed at 121 s (limit 120 s) on the run before. `css/` and `version.json` were
edited under it; it came back at 125.8 s with `Test timeout of 120000ms
exceeded`. Nothing about the code had changed, and the failure was indexed to
the one test that needs the page to survive after `jump()`.

The rule that actually holds: **bump `?v=N` and `version.json` as the LAST edit
before you commit, never while anything is running.** "It's only a version bump"
is exactly how this one gets rationalised — it was, and it cost a whole group.

**2. Run the groups the change needs, not all of them.** The whole suite is ~40
minutes of SwiftShader, and which groups a change needs is mechanical — so ask:

```sh
node tools/pick-tests.mjs [--staged|--bg|<paths>]
```

Escalate: `npm run test:tiny` after any edit (if this is red nothing else is
worth running) → `npm run test:tooling-fast` in the edit loop → the groups
`pick-tests` named → `npm run test:sweeps` if geometry moved. For a track or
scenery edit run `node tools/verify-track.cjs <id>` FIRST — 2 s, no browser, and
it catches a build THROW that would strand the game on the menu.

**A new source directory or a new group means a new rule** in `RULES` at the top
of `tools/pick-tests.mjs`; the test fails if a rule names a group that does not
exist, or if a source directory routes to nothing.

**3. Make failures explain themselves.** Specs that import `tests/fixtures.js`
attach `apex-state` (physState + probe + timing + lightState), `apex-logs` (the
`Log` ring buffer, including entries that never printed) and `page-console` on
failure, and `live-reporter.js` echoes the tail of each into the log. Turn
diagnostics up for a run without editing the spec:

```sh
APEX_LOG=scenery:debug npm test -- tests/props-over-road.spec.js
```

Read `__apex.logs({ns})` rather than scraping console text — a scraped message
ties the spec to its exact wording and misses anything below the print threshold.

**Two projects, not one.** `playwright.config.js` splits the suite into
`headless` (physics/geometry/hook specs, no GPU) and `render` (screenshot/pixel/GL
specs, listed in `RENDER_SPECS`). Target `--project=headless` or
`--project=render`, never `--project=chromium` (gone). `RENDER_SPECS` IS the
partition — headless is "everything NOT in it" — so a name there matching no file
silently drops a GL spec into the wide pool, and a spec named by a group whose
`--project` excludes it never runs at all. Both directions are now asserted.

IMPORTANT: tests serve `js/`/`css/` straight from the working tree — don't edit
source files while a run is in flight, or its later specs load mixed versions.

`tests/manual/` is excluded from discovery and is run by path (see
`tests/manual/README.md`).

## Logging (`js/log.js`, global `Log`)

Every diagnostic goes through `Log`, never a bare `console.*`. Loads FIRST, so
any module can call it at evaluation time.

```js
Log.warn("scenery", `pine SUPPRESSED at k=${k}: dist=${dist}`);
Log.info("track", `built ${id} in ${ms}ms`);
if (Log.enabled("gfx", Log.DEBUG)) Log.debug("gfx", expensiveDump());
```

First argument is always a NAMESPACE (`Log.NAMESPACES`: scenery, track, gfx,
game, data, net, audio, assets, apex). It is prefixed automatically — do not
repeat it in the message.

**Two independent thresholds**, which is the whole point:

- the **console** level decides what a human sees (default `warn`)
- the **buffer** level decides what is RETAINED in a 500-entry ring (default
  `info`), readable afterwards via `__apex.logs()`. A failure that has already
  happened still has a record.

```js
__apex.logLevel()                  // resolved thresholds
__apex.logLevel("scenery:debug")   // one namespace up
__apex.logLevel("buffer:debug")    // retain more without printing more
__apex.logLevel("debug", true)     // …and remember it across reloads
__apex.logs({ ns: "scenery", limit: 40 })
```

Also settable by `?log=scenery:debug` on the URL and by `apex26.logLevel` in
localStorage; `APEX_LOG=<spec>` does it for a whole test run.

**HOT PATHS**: arguments are evaluated whether or not they print, so guard a
per-frame or per-primitive debug line with `Log.enabled(ns, level)`.

Two things stay bare `console` on purpose: `__apex.diag()`'s object dump (DevTools
renders an inspectable tree, which `Log` flattens to text), and anything in a
tool that is not part of the game.

---

## Output dirs (standard)

All regenerable output lives in **two** top-level gitignored dirs — never `/tmp`,
never scattered at the repo root:

- **`artifacts/test-results-<port>/`** — test failures, traces, attachments, JUnit
- **`artifacts/report-<port>/`** — HTML report
- **`artifacts/logs/`** — background-run (`test-bg.mjs`) and shard logs
- **`artifacts/galleries-<port>/`** — test-emitted screenshots/reports
- **`artifacts/tmp/`** — one-off batch probes
- **`scratch/captures/`** — interactive tool captures
- **`scratch/renders/`** — car/parts/aero review sheets
- **`scratch/profiles/`** — CPU/GPU profiles

Both roots are created on demand. `assets/` and committed generated sources stay
outside them.

**Golden baselines exist for the MENUS only.** `tests/menu-baseline.spec.js-snapshots/`
holds six tracked PNGs (title/select/garage × desktop/phone-landscape), and
`npm run test:baseline` is a real regression gate against them. `npm run test:visual`
(`tests/tracks-visual.spec.js`) is **not** — it screenshots all 40 circuits and no
baselines were ever committed for it, so it is skipped unless
`tests/tracks-visual.spec.js-snapshots/` exists. Generating those on
Linux/SwiftShader is a separate, still-outstanding operation.

---

## File layout

Modules are grouped by domain. **`js/track/` is the ENGINE** (spline, mesh,
scenery placement — shared code); **`js/circuits/` is the DATA** (one def file
per circuit). Don't mix them up: a circuit edit goes in `js/circuits/<id>.js`,
an engine/placement change goes in `js/track/`. `tools/manifest.cjs` is the
single source of truth for load order (see Critical conventions).

```
js/log.js        Log            levelled, namespaced logging + a retained ring
                                  buffer (see Logging). Loads FIRST — everything
                                  below may log at evaluation time
js/mat4.js       M4, V3         matrix math
js/game.js       (main)         entry — game loop, physics, AI, race logic; owns the
                                  closure state and hands the G ctx façade to js/game/*

js/render/       — renderers —
  gfx.js         Gfx            renderer façade — selects GLX (WebGL2) or WGX (WebGPU),
                                  both expose the same surface to game.js
  glx.js         GLX            WebGL2 renderer core
  glx/           GLXPost, GLXShadow, GLXChunked   post chain (post.js) / shadow
                                  passes (shadow.js) / chunked-mesh path
                                  (chunked.js), wired via the GLXCore ctx
  shaders/       GLXChunks, GLXShaders   chunks.js = shared GLSL leaves;
                                  lit.js / sky.js / fx.js / post.js assemble GLXShaders
                                  (pure data; loads before glx.js)
  gltf.js        GLTF           binary .glb loader → plain {pos,nrm,col,idx}
  assets.js      Assets         baked asset-pack loader (assets/pack) — PBR material
                                  ARRAYS indexed by MAT id, baked models, HDRI ambient.
                                  Every failure (no pack, bad pack, backend without
                                  createTextureArray) falls back to the procedural look
  webgpu/        WGX            WebGPU backend (wgx.js) + WGSL sources
                                  (wgsl-chunks/-post/-fx.js); feature-detected, GLX fallback
  three/         TLX            three.js r184 / TSL backend — the THIRD renderer behind
                                  the Gfx seam (tlx.js core, tlx-chunked/-post/-shadow.js;
                                  tsl-lit/-sky/-fx/-post/-chunks.js are the TSL shader
                                  graphs). Opt-in via localStorage apex26.gfxBackend =
                                  "three"; installed by descriptor-copy onto GLX so every
                                  GLX.* call site keeps working. Vendored three lives in
                                  vendor/three-0.184.0 (the only ES-module island)

js/track/        — track ENGINE (shared code) —
  tracks.js      Tracks         engine shell: spline resolve, build orchestration
  spline.js      TrackSpline    Catmull-Rom sampling / curvature
  mesh.js        TrackMesh      road/terrain mesh extrusion
  geom.js        TrackGeom      pure geometry emitters (addBox/emit/addCyl/…) + MAT ids
  graph.js       TrackGraph     scenery MODEL LIBRARY + NODE GRAPH. A model is a list
                                  of primitive OPS in canonical space (origin, identity
                                  basis); each placement is a node {model, o, r,u,t, s?}.
                                  Migrated emitters call ctx.instance(key, place, build,
                                  meta) instead of emitting inline — replay runs through
                                  the same GUARDED emitters, so geometry and on-track
                                  suppression are unchanged. Gate any migration with
                                  `node tools/graph-parity.cjs --all` (builds each track
                                  from a baseline ref AND the working tree and diffs the
                                  prop geometry vertex for vertex). `graph.stats().byKind`
                                  reports per-emitter instancing reuse;
                                  `graph.batches()` is the backend-neutral
                                  instanced-draw handoff (canonical mesh +
                                  column-major mat4 per instance + optional
                                  per-instance colour), returning the nodes that
                                  CANNOT be instanced as `bakeOnly`.
                                  See docs/research/SCENE-GRAPH-PLAN.md.
  space.js       TrackSpace     world↔track (Frenet) projection
  surface.js     TrackSurface   road surface build / tarmac-verge tinting
  markings.js    CircuitMarkings  curated FIA sector splits + turn apexes
  models.js      TrackModels    composite prop models
  themes.js      SceneryThemes  theme tables for the city generator
  landmark-kit.js, circuit-kit.js   landmark/circuit composite kits
  geo-paths.js   CircuitPaths   OSM circuit centrelines (was circuits.js)
  maps.js        TrackMaps      offline 2D picker outlines (was trackmaps.js)
  scenery-data.js  TrackSceneryData  static buildProps tables (BARRIER, FURN,
                                  city palettes/styles) — data only, no placement logic
  scenery-nature.js / scenery-city.js / scenery-structures.js / scenery-identity.js
                 Scenery*.create(ctx)   the buildProps split; together they serve the
                                  107-member scenery(api) contract frozen by
                                  tests/scenery-api-contract.test.mjs

js/circuits/     — circuit DATA —
  <id>.js        TrackDefs      40 circuits (one file each, registers on Tracks.LIST):
                                  24 season rounds then 16 retired `classic: true`;
                                  script-tag order == Tracks.LIST == picker/season order

js/car/          — car —
  car3d.js       Car3D          procedural F1 car geometry
  liveries.js    Liveries       custom paint jobs — colours plus an optional
                                  `finish` ("gloss" default | "satin" | "chrome"),
                                  applied by remapping the body-paint surface id
                                  (Car3D.FINISH_SURFACE); no shader change.
                                  The SHARK FIN is its own two paint slots:
                                  `fin` (the plate, defaults to c2) and `finArt`
                                  (the tail graphic on it, defaults to a colour
                                  picked to contrast the fin) — the fin is one
                                  flat colour, so art equal to it is invisible
  liverytex.js   LiveryTex      canvas-2D livery texture atlas (crests/sponsors/number)
  parts.js       Parts          upgrade catalog (12 categories, getMods, getCost, statMult)
  ghost.js       Ghost          time-trial ghost record/replay data layer
  teams.js       Teams          2026 grid (11 teams, 22 drivers, engine supplier per team)
  driver-ratings.js  DriverRatings  the five-axis skill table (pace/craft/awareness/
                                  consistency/experience), keyed by driver CODE.
                                  Deliberately NOT in teams.js: that file is the
                                  verified real-world grid, these are balance
                                  values that get tuned. Career layers its
                                  per-driver development deltas on top

js/data/         — data hub —
  api.js         F1API          Jolpica + OpenF1 clients, localStorage cache
  hub.js         DataHub        data hub DOM overlay shell + shared session plumbing
                                  (was data.js)
  telemetry.js   DataTelemetry  TELEMETRY tab (trace viewer/map/playback), created by
                                  hub.js via DataTelemetry.create(ctx). N-lane
                                  compare (up to 4) via a module-scoped tray that
                                  survives a SESSION switch → same driver's race
                                  vs quali lap side by side; laps[0] is the delta
                                  reference. Pure playback/GPS-sanity helpers are
                                  exported (_locAt/_dropStrays/…) for the tests.
  export.js      DataExport     EXPORT dev tool (GPS traces → ZIP)
  schedule.js / standings.js / lastrace.js / live.js   the other tabs, same
                                  Data*.create(ctx) pattern

js/net/          — multiplayer wire (2-4 players, WebRTC, NO backend) —
                 Full reference: docs/MULTIPLAYER.md. The short version:
  transport.js   NetTransport   two channels — "state" (unreliable/unordered,
                                  for snapshots) and "event" (reliable/ordered,
                                  for lobby/results). loopback() runs both ends
                                  IN ONE PAGE with injectable latency/loss
  sdp.js         NetSdp         packs the invite SDP to ~90 B so the code is
                                  SCANNABLE, not merely pasteable
  nostr.js       NetNostr       room-code rendezvous over public Nostr relays
                                  (vendored Trystero). SIGNALLING ONLY
  rendezvous.js  NetRendezvous  room codes — the backup way in; typed errors,
                                  never throws, so the lobby can fall back
  qr.js / scan.js  NetQr, NetScan   invite QR (encoder only) + camera decode
  handshake.js   NetHandshake   vanilla ICE -> slimmed SDP -> deflate ->
                                  base64url invite code. REFUSES a peer on a
                                  different build
  snapshot.js    NetSnapshot    13 B/car wire format + interpolation. A late
                                  packet extrapolates ALONG s, so dead
                                  reckoning cannot put a rival into a barrier
  session.js     NetSession     clock sync, packet routing, heartbeat
  netplay.js     NetPlay        the game side. AUTHORITY: each peer fully owns
                                  its own car, so your car is NEVER corrected.
                                  Host also owns AI + race control and RELAYS
                                  between guests. Rivals keyed by G.wireId(c),
                                  never cars[] index
  lobby.js       NetLobby       the VS FRIEND screen. Invites are SEQUENTIAL.
                                  A guest's profile is filed under the
                                  CONNECTION it arrived on, never a `from`


js/game/         — game modules (each created with the G ctx façade from game.js) —
  tables.js      GameTables     static game data (CAM_MODES, DIFF, gears, paints)
  lighting.js    LightTune      TUNE_DEFS registry, live LT values, floodColor,
                                  LAMP_KINDS, buildTrackLights, setFrameLights,
                                  appendCarTailLights
  light-store.js LightStore     the PROFILE STORE — which layer wins for the
                                  conditions on screen, and persisting a player's
                                  edits. Per (track, time-of-day, weather); the
                                  five-layer resolution is documented in its header
                                  and under Lighting & sky below
  light-presets.js  LightPresets  shipped lighting-tuner values, keyed "track|tod|weather"
                                  (baked from the LIGHTING TUNER panel's COPY VALUES export)
  carmesh.js     CarMesh        car decal/effect/cockpit-instrument geometry
                                  (renderer handle injected via CarMesh.init(gfx))
  particles.js   Particles      transient particle pool (smoke/sparks/spray) + the
                                  rain overlay (Particles.rain*)
  bodyattitude.js  BodyAttitude the chassis pitch/squat/roll/bob read — visual only,
                                  never feeds the driving model
  debrisworld.js   DebrisWorld  Rapier side-world (vendor/rapier-0.19.3): debris and
                                  kinematic car mirrors. NEVER moves a game car
  incidentsim.js   IncidentSim  bounded incident window that MAY move a car — the
                                  high-risk layer; safety contract in its header
  agentview-raster.js  AgentRaster  the character-grid rasters behind
                                  __apex.render({what}) (view/map/circuit/car)
  ariastate.js   AriaState      mirrors each option group's visual selection onto
                                  aria-pressed for screen readers
  sheetshape.js  SheetShape     self-initialising: measures every `.sheet` with a
                                  ResizeObserver and writes data-shape="tall|wide"
                                  / data-pair="on|off". Its CONSUMER IS CSS
                                  (css/components.css, css/career.css) — no JS
                                  reads it, which is why a JS-only reference scan
                                  reports it as orphaned. It is not
  topmodal.js    TopModal       self-initialising: owns the top-layer/z-index
                                  ladder over the 16 `<dialog class="screen">`
                                  elements, reading data-esc-close / data-esc.
                                  Same CSS/DOM-contract shape as sheetshape.js
  music-lib.js   MusicLib       bring-your-own-music library (IndexedDB), fed to GameAudio
  spotify.js     SpotifyMusic   optional personal-use Spotify Premium soundtrack
  input.js       Input          keyboard / gamepad / touch / tilt
  audio.js       GameAudio      WebAudio synth: engine, sfx, music
  store.js       GameStore      localStorage persistence
  perf.js        PerfGov        adaptive performance governor
  cameras.js     GameCams       the 13 player camera modes + debug free-cam
  cam-tune.js    CamTune        CAMERA TUNER data: per-mode framing offsets
                                  (height/dist/side/pitch/yaw/fov), store + apply();
                                  plus cornerLead (chase/far-only knob read by
                                  cameras.js to swing the chase INTO corners)
  hud.js         GameHud        in-race DOM HUD
  results.js     GameResults    results / season-end screens
  apex.js        ApexApi        the whole window.__apex dev API
  agentview.js   AgentView      the agent-facing JSON world view — world()/
                                  field()/trackInfo()/scene()/describe()/query()/
                                  atmosphere()/objective()/carView()/render()/
                                  survey()/rollout()/terminal()/corners()/
                                  agentHelp(); composes the __apex hooks
                                  into one egocentric snapshot with typed errors.
                                  render({what}) is the ONE raster (view|map|
                                  circuit|car); visible()/worldModel()/frame()/
                                  plan() still exist as DEPRECATED aliases —
                                  prefer render({what}) and scene({visible})
                                  (docs/AGENT-WORLD-API.md)
  atmosphere.js  Atmosphere     applyRaceSettings — time-of-day/weather scene state
  setup-ui.js    SetupUI        GARAGE screen (#carsetup) — WHO you are and WHAT
                                  you drive: TEAM & DRIVER, the 12 part categories
                                  + budget, LIVERY. The select screen owns WHERE
                                  you race and links here; race settings own HOW
  career.js      Career         CAREER core: the apex26.career.<flavour>.0..2
                                  saves (THREE DRIVER SLOTS + THREE MY TEAM,
                                  one live) + migration, sponsors (MY TEAM's
                                  multi-round briefs), the research FACILITY
                                  (the late-game money sink), the hire's
                                  contract, EXTRA FUNDS,
                                  the credits economy, contracts, driver/team
                                  development, R&D ownership, round settlement.
                                  Pure rules — no DOM. A plain global (like
                                  CamTune), because game.js calls it from
                                  makeCars()/recomputePlayerMods()/endRace().
                                  Every GAMEPLAY accessor is gated on
                                  inCareer(), NOT on "a save exists" — the save
                                  is read at boot so the title button can offer
                                  CONTINUE, but its rules must not reach a
                                  Grand Prix
  career-ui.js   CareerUI       the CAREER screen (#career): new-career setup
                                  and the season hub. Replaces #select in
                                  career — the calendar owns WHERE you race
  quali.js       Quali          ONE-LAP QUALIFYING (#quali). A `session`, not a
                                  game state: the player's flying lap reuses the
                                  time-trial path, and the rest of the field is
                                  MODELLED — a quasi-steady forward/backward lap
                                  simulation off the same LAT_MAX/ACCEL/BRAKE the
                                  driving model uses, so a simulated time and a
                                  driven one are on one scale. Feeds gridUp()
  reliability.js Reliability    RELIABILITY / DNFs: whether a car reaches the
                                  flag. Risk is DERIVED (team tier, relieved by
                                  career team development and by what the player
                                  spent on the ENGINE + GEARBOX), never a table.
                                  The whole field's retirements are drawn ONCE at
                                  the green light from a stateless hash of (seed,
                                  round, driver) via Career.hash — makeCars()'s
                                  simRnd() budget is a hard contract, so this
                                  consumes NOTHING from the sim stream. Ships OFF
                                  behind the RELIABILITY race setting
  menus.js       Menus          menu/select/pause DOM flows
  scrollfade.js  ScrollFade     "there is more below" edge fade + position indicator
                                  for every menu scroll region (self-initialising)
  menunav.js     MenuNav        desktop menu input (self-initialising): redirects a
                                  wheel/trackpad gesture that lands outside a pane
                                  into the open menu's nearest pane, and moves focus
                                  with the arrow keys / Home / End / PageUp / PageDown
  uilayers.js    UiLayers       THE LAYER STACK — the one answer to "which screen
                                  is on top", asked by menunav.js (which pane do
                                  the arrows move), input.js (may a key drive the
                                  car) and topmodal.js (what does Escape close).
                                  Was three hand-maintained lists that drifted by
                                  five screens. top() ranks a showModal() dialog
                                  ABOVE every z-index, because the top layer is
                                  not orderable by z-index and parseInt("auto")
                                  is NaN — that bug handed the arrow keys to
                                  whatever screen sat behind the open modal.
                                  ESCAPE IS "BACK": every layer names the control
                                  Escape should press with data-esc-close in
                                  index.html (data-esc="none" refuses), and it
                                  only means PAUSE when a race is running with
                                  nothing on top of it — inRace() comes from
                                  game.js via setRaceGetter, never re-derived
  photomode.js   Photomode      photo mode — the LIGHTING/CAMERA TUNER's FREE
                                  CAMERA, not a separate screen. #photo-controls
                                  is a layer above the panel, so Escape steps out
                                  of the fly-cam and leaves the panel open
  aerozones.js   AeroZones      ACTIVE AERO activation zones — pure circuit
                                  GEOMETRY (curvature in, arc-metre spans out).
                                  Knows nothing about a car: xStraightAhead()
                                  and aeroDfMult() stay in game.js because they
                                  read car state
  racecontrol.js RaceControl    the CAUTION flag machine — green / local yellow /
                                  VSC / safety car, off DebrisWorld.hazards() at
                                  ~4 Hz. READ-ONLY w.r.t. the cars: it never
                                  writes speed/px/pz/head/(s,x) — incidentsim.js
                                  is the layer that may move one. Raises fast,
                                  lowers only after a hold (debris despawns, and
                                  a flag tracking the raw count would flicker).
                                  The HOST owns it: debris is local and not
                                  replicated, so a guest adopts apply() and
                                  computes nothing. otEnabled() — the OVERTAKE
                                  gate — reads off it
  skidmarks.js   SkidMarks      the 120-entry tyre-mark ring buffer, its batched
                                  vertex build (one draw, not 120) and the per-mark
                                  fallback. Owns all of its own state — game.js only
                                  calls reset()/stamp()/draw()
  photomode.js   Photomode      photo mode
  tuner.js       TunerPanel     LIGHTING TUNER pause-menu panel
  cam-tuner.js   CamTunerPanel  CAMERA TUNER pause-menu panel
  steer-tuning.js  SteerTuning  ADVANCED STEERING panel

css/                            tokens.css (design tokens) + components/menus/hud/
                                  overlays/carsetup/data/tuner/track-detail/responsive
index.html                      shell — script tags, DOM structure, cache-bust version
tools/manifest.cjs              load-order single source of truth (script tags must match)
tests/*.spec.js                 Playwright specs (111) + tests/*.test.mjs unit suites (48)
docs/            developer docs (ARCHITECTURE.md, DEBUG-HOOKS.md, SCENERY-API.md, …)
                 ARCHITECTURE-REVIEW.md is the standing assessment + defect
                   register: what the no-build-step bet costs, why asserted
                   invariants hold and prose ones drift, and what is deferred
                 PARALLEL-WORK.md is where to spend concurrency — read-only
                   fan-out vs worktrees vs the browser suite, which is serial
                   on 4 cores and is the bottleneck every plan has to respect

                 research/PLATFORM-INPUT-NOTES.md is the one to read before
                   debugging anything that reproduces on ONE device: pointer
                   capture and the four-way release net, the top layer vs
                   z-index, `zoom` and --ui-scale (1.0 on a mouse, 1.15 on
                   touch — which is what makes a whole class of bug
                   desktop-invisible), Escape vs <dialog> close watchers,
                   `(pointer: coarse)` being the PRIMARY pointer only, and iOS
                   WebGL context loss
```

---

## Critical conventions

- **Cache busting**: `index.html` uses `?v=N` on every asset URL (check `index.html` for the current N).
  **Always increment N when changing any JS or CSS file** — search `?v=` and replace
  all instances (`sed -i -E 's/\?v=[0-9]+/?v=N/g' index.html`). **Also bump
  `version.json` `{ "build": N }` to the SAME N** — the shell version guard in
  `index.html` fetches it (no-store) and force-reloads a stale installed PWA when
  the deployed build is newer than the cached shell (index.html itself has no
  `?v=`, so this is the only thing that refreshes the HTML markup — e.g. a new
  pause-menu button).
- **No ES modules** — everything is `"use strict"` IIFE, assigns one global. No
  `import`/`export`.
- **Load order lives in `tools/manifest.cjs`** — the single source of truth,
  asserted against `index.html` by `tests/load-order.test.mjs` (run via
  `npm run test:tooling`). **New-file checklist:** (1) create the IIFE file in the
  right `js/<domain>/` dir; (2) add its `<script>` tag to `index.html` at the
  correct position; (3) add the matching entry to `tools/manifest.cjs` — the test
  catches any divergence; (4) bump `?v=N` + `version.json`. `HARD_EDGES` in the
  manifest records eval-time load dependencies (A must load before B because B
  reads A's global at eval time). `tools/verify-track.cjs` and the VM-based tests
  read the manifest's `TRACK_VM` list instead of hardcoding paths.
  `tools/extract-module.mjs` assists further game.js extractions.
- **DEFERRED modules have no `<script>` tag.** `js/render/three/*` (TLX) and
  `js/render/webgpu/*` (WGX) are the two opt-in renderer backends — ~550 KB that
  every visitor used to parse for something almost nobody runs — so they are
  listed in the manifest's `DEFERRED` map instead of `FULL`, and `js/game.js`
  injects them at boot only when `apex26.gfxBackend` selects one. Three things
  must agree and `tests/load-order.test.mjs` asserts all three: `DEFERRED`,
  `BACKEND_FILES` in game.js, and the OPTIONAL precache seed in `sw.js` (the
  service worker finds every other asset by parsing the shell's own tags, so a
  tagless file is invisible to it). A failed injection is not an error path —
  `Gfx.create` already reads a missing `TLX`/`WGX` global as "unavailable" and
  falls back to GLX.
- **`js/track/` = engine, `js/circuits/` = data.** Circuit defs (one per track)
  live in `js/circuits/<id>.js`; all shared spline/mesh/scenery code lives in
  `js/track/`. Circuit script-tag order == `Tracks.LIST` == picker/season order.
- **The `G` ctx façade**: extracted `js/game/*` modules never reach into game.js —
  game.js builds one `G` object of live getters/setters over its closure state
  plus stable helpers, and instantiates each module via `Module.create(G)`.
- **localStorage keys** are all prefixed `apex26.` (e.g. `apex26.team`,
  `apex26.parts.mercedes`).
- **Coordinates**: +Y up, distances in metres, angles in radians, arc position `s`
  in metres (0 → track.total), lateral `x` in metres (+right of centreline).

---

## Parts system (`js/car/parts.js`)

**Full reference: `docs/PARTS.md`** — the catalog shape, the measured ERS and
aero tables, SIGNATURE options, the visual recipe registry.

What binds code outside `parts.js`:

- `Parts.CATALOG` is an **array** of 12 category objects (ordered, not keyed).
  Budget 600 cr. `Parts.getMods(setup, teamEngine)` returns `{speed, accel,
  cornering, braking}` multipliers.
- **THE ERS PART RUNS THE BATTERY.** `Parts.ersProfile(setup, team)` derives two
  0..1 axes from the bias the catalog already encodes, and they drive
  `drainFor`/`regenFor`/`otTimeFor`/`otCoolFor` in game.js. Deriving rather than
  authoring new fields keeps the SIGNATURE clones consistent for free.
- **`Parts.aeroLoad(setup, team)` sizes the active-aero trade** — each of the
  three X-mode constants is a `_LO`/`_HI` pair interpolated by it. A car with no
  parts (every AI) sits at the midpoint, so the grid is one defined thing.
- **SIGNATURE options are cost- and physics-identical clones** of the universal
  option named in `equivalent`. They buy a mesh, never an advantage, and the
  suite enforces that. `FACTORY_PRESETS` drives AI car MESHES only.
- Prefer knobs that change WHAT EXISTS over knobs that scale what is there. A
  recipe of all scalars gives every team the same part at a different size.
- `tests/parts-physics.spec.js` fails on an unregistered or stale `visual`
  recipe field, a duplicate recipe within a category, or an engine repeating
  another's bodywork shape.

## Physics

**Full reference: `docs/PHYSICS.md`** — the bicycle model and its tuning
variables, combined slip, active aero / X-mode, the overtake gate, and the
world-space rigid-body authority.

Two rules bind code all over the repo, so they stay here.

**`PACE` is a ground-speed scale, not a speed cap.** Everything measured in
speed is pace-normalised through two helpers next to `VMAX`: `vTop()` (where the
envelope tops out in m/s — divide by it to normalise) and `vStd(v)` (that speed
on the standard pace-5 scale — compare hard-coded thresholds against it). So
`VMAX`, `GEAR_TOP`, `TAPER_LO/HI`, `GRASS_V` and `STEER_SPEED_REF` keep their
literal values while the gearbox still sweeps 1→8 and the dial still reads
0 → ~259 km/h at *every* setting. Only lap times move.

**Anything that divides a speed by `VMAX`, or compares one against a literal,
must pick `vTop()` or `vStd()`.** A bare `VMAX` there silently makes the OVERALL
SPEED slider shrink the player's envelope again. True force constants
(`LAT_MAX`, `BRAKE`, `LONG_GRIP`, `ACCEL`) are deliberately absolute — that is
what makes low pace more forgiving.

**Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`.** The switch is not the
wing. And do not cross the active-aero and OVERTAKE rule sets: overtake inherits
DRS's proximity/opening-lap/caution restrictions, active aero inherits none of
them but only works inside a zone (Monaco has none).

**Road-follow assist is OPT-IN and ships at 0.** Nothing steers the car by
default except the driver. Changing an assist DEFAULT does not reach existing
players — `store.get(k, d)` returns the stored value whenever the key exists, so
bump `STEER_SCHEMA` in `js/game/steer-tuning.js` when a slider's *meaning*
changes.


### The arc must not reach the driver

With the assists off, **nothing derived from the track's curvature or its racing
line may affect the player** — not just the forces. Auditing forces alone missed
several channels, each of which read as "the car is being pulled":

| channel | must come from |
|---|---|
| steering | driver input + tyre forces (assist only when opted in) |
| lap progress | the car's own world motion, via `trackFrom()` |
| rendered position | `px`/`pz` interpolated in **world** space, never lerped/damped `(s, x)` |
| drawn nose angle | the real heading `psi`, unclamped and unlagged |
| tyre squeal / marks / smoke | body **slip angle**, never `|k| * speed` |
| barrier alignment | the **barrier's** tangent (`wallAt` slope), not the centreline's |
| chase / cockpit / hood cameras | the car's world pose + heading |

Legitimate track reads are *surface* properties — grip, kerbs, banking, slope
gravity, crest/dip vertical load, road width, barrier position — plus AI-only
logic (racing line, corner braking, ERS) and the broadcast cameras.

When adding anything that reads `Tracks.curvature()`, ask which column it belongs
in. `grep -rn "Tracks.curvature\|kCur" js/game.js js/game/*.js` is the sweep;
every hit should be AI-only, assist-gated, broadcast-only, or surface.

---

## Lighting & sky

**Reference: `docs/LIGHTING-REF.md`** (light-record layout, shader uniforms,
time-of-day branches, masts), **`docs/LIGHTING-KNOBS.md`** (every constant),
**`docs/LIGHTING-PRESETS.md`** (how a preset resolves).

Lit shader = directional sun (shadow map) + hemisphere ambient + up to 32 point
lights. Composite: ACES tone-map + `colourGrade` + bloom + lens flare + vignette.
`buildTrackLights()` (in `js/game/lighting.js`) places floodlights;
`setFrameLights()` culls to the nearest CAP per frame.

The **LIGHTING TUNER** exposes every hand-tuned value as a live slider.
`TUNE_DEFS` is the registry and `LT` the live values; the driver reads `LT.<id>`
each frame instead of a literal. Values are stored per (track, time-of-day,
weather) profile, resolving lowest→highest: `TUNE_DEFS.def` → `LightPresets["*"]`
→ `LightPresets["track|tod|wx"]` → localStorage `"*"` → localStorage
`"track|tod|wx"`. So `js/game/light-presets.js` is the shipped baseline and a
player's live edits always win. That resolution and its persistence live in
`js/game/light-store.js`; `js/game/tuner.js` is only the panel.

Adding a knob: append to `TUNE_DEFS` (+ a shader uniform and `frame.tune` upload
if it is not a driver literal), and point `tools/ab-lighting.mjs`'s catalog at it.

```js
__apex.lightState()  __apex.setTimeOfDay('night')  __apex.lightTune(obj?)
```

## City & scenery dressing (`buildProps` / `buildRoad` in the `js/track/` engine)

Procedural per-circuit dressing on top of each track's `scenery(api)` callback.
Session-time-aware (rebuilt on day↔night flip). Street/modern themes get the city
generator (`STYLES[def.id]`): building silhouettes, neon palettes, reflective glass
mesh (`track.meshes.glass`). All 40 circuits get furniture (`FURN`): trees and street
lamps (glow HDR at night). Street circuits get armco barrier liveries (`BARRIER`).
`buildRoad` tints tarmac/verge via a stable per-track hash.

See `docs/SCENERY-API.md` for the `scenery(api)` reference, building kinds, tables.

---

## Baked asset pack (`assets/pack/` + `js/render/assets.js` + `tools/assets.mjs`)

Optional PBR **material arrays**: one `TEXTURE_2D_ARRAY` whose **layer index is
the `MAT` id**, so any surface can be textured from the per-vertex material id it
already carries — **no UV channel** (the sample reuses the procedural materials'
own triplanar convention in `lit.js`) and no new vertex attribute.

- **Blended, not replaced.** `albedo * tex.rgb * 2.0`, so per-track tarmac tint,
  racing-line wear and per-vertex grain all survive.
- **Ships ON.** `matTexMix` is a `TUNE_DEFS` knob and its `def` is `1.0`, so the
  pack is fetched at boot and blended by default; `__apex.matTex(0)` is the A/B
  knob that turns it back off. (It shipped at 0 once, behind a lazy "only fetch
  when matTexMix > 0" load — that guard was removed because with the knob on by
  default nobody can turn it off BEFORE their first load, so it saved nobody
  anything. See the comment at the Assets.load() call in js/game.js.)
- **Every failure degrades to procedural** — no pack, malformed pack, or a
  backend with no `createTextureArray` (WGX/WebGPU, which has not ported the
  procedural material system either). Boot never awaits or fails on assets.
- **GLX and TLX implement it; WGX does not.** Feature-detected, never assumed.
- The committed pack is generated by our own tool from our own noise
  (`Apex26-Procedural`) — no third-party licence obligation. Real CC0 scans drop
  in through the same manifest. `tools/assets.mjs verify` enforces a licence
  allow-list, per-asset source traceability and an 8 MB budget.

See `docs/research/ASSET-API-RESEARCH.md`.

## `window.__apex` dev API  — see `docs/DEBUG-HOOKS.md` for the full reference.

~180 hooks. `docs/DEBUG-HOOKS.md` documents them all; this is the short list you
actually reach for. `__apex.agentHelp()` is the machine-readable manifest of the
agent surface — read it ONCE per session, never per tick.

```js
// ── staging ──
__apex.race("monza"); __apex.go(); __apex.jump(0.5, 60, 0)
__apex.park(0.1); __apex.snapCam()   // snapCam is REQUIRED after park()/jump()
                                     //   before a shot — the camera eases toward
                                     //   its rig target, so without it you
                                     //   photograph a camera still in flight
__apex.freeze(bool?); __apex.finishRace(); __apex.resetPlayer()
__apex.weather("wet"); __apex.setTimeOfDay("night")

// ── reading state ──
__apex.info(); __apex.timing(); __apex.probe(); __apex.physState()
__apex.cars(); __apex.fieldState(); __apex.carAt(i); __apex.lightState()
__apex.corners(); __apex.scan([10,30,60]); __apex.groundY(0.11, 12)
__apex.logs({ns:"scenery"}); __apex.logLevel("scenery:debug")

// ── driving it ──
__apex.setInput({steer:1,throttle:true}); __apex.step(1/60, 10)
__apex.headless(true); __apex.obs(); __apex.act({steer,throttle}, dt, n)
__apex.reset(frac, speed, x); __apex.seed(42)   // same seed + inputs => same result

// ── agent world view (js/game/agentview.js, docs/AGENT-WORLD-API.md) ──
__apex.agentHelp(); __apex.objective(); __apex.world({detail:"brief"})
__apex.field(); __apex.scene({radius:120}); __apex.trackInfo({what:"corners"})
__apex.describe("prop:12"); __apex.query({kind:"pine", near:150})
__apex.render({what:"view"})   // the ONE raster: view|map|circuit|car. APPROXIMATE
__apex.survey(); __apex.rollout({seconds:5, policy}); __apex.terminal()

// ── cameras ──
__apex.camera("cockpit"); __apex.camState(); __apex.view({s:0.3, side:"L"})
__apex.eyeAt(f, lat, h); __apex.orbit(f, az, el, dist); __apex.carOrbit(i, az, el, d)
__apex.camTune("chase", {height:0.6}); __apex.studio({intensity:3})

// ── the systems with their own rules ──
__apex.aero(true); __apex.aeroZones(); __apex.aeroMode("auto")  // use zone midFrac,
                                     //   NOT the average of start/endFrac — a
                                     //   zone may WRAP the start line
__apex.caution(); __apex.reliability("real"); __apex.retirements()
__apex.career(); __apex.careerState(); __apex.careerSim(n); __apex.ratings(code?)
__apex.qualiSim(); __apex.matTex(0..1); __apex.assets(); __apex.trackGraph()
__apex.setPhysics({pace:0.8}); __apex.gpuTimer(on?)
```

Three things that are not obvious and cost time when missed:

- **`obs()` / `physState()` need `player.px` initialised.** After `race()` +
  `go()`, call `jump(frac, speed)` or `step(1/60, 1)` first.
- **agentview never returns null** — failures are
  `{ok:false, error, message, fix}`. Two exceptions: `scene()` on a street
  circuit whose props are still building returns a SUCCESSFUL empty list, and
  `render({what:"view"})` reuses the last RENDERED frame, so let frames draw
  before trusting it.
- `visible()`/`worldModel()`/`frame()`/`plan()` are DEPRECATED aliases — prefer
  `render({what})` and `scene({visible})`. They are still live and still called
  by `tools/agent.mjs` and the test suite, so they are not removable yet.

`node tools/agent.mjs <track> <world|track|scene|visible|rollout|help> [flags]`
is the same surface from a shell, with the staging done correctly.

## Writing tests

111 Playwright specs + 48 `node --test` unit suites. **How to RUN them is under
Testing workflow above; `docs/TESTING.md` is the full reference.** This is what
to do when writing one.

Assert behaviour and geometry via `__apex` hooks — not brittle rendering
magnitudes. A threshold like "speed > 10 after 2 s" goes stale the moment
physics is retuned; prefer relative checks ("faster on tarmac than on grass").
Use `obs()`/`act()`/`reset()` for physics, `seed()` for reproducibility,
`groundY()` for terrain geometry, `eyeAt()`/`orbit()` for camera framing, and
`__apex.logs({ns})` rather than scraping console text.

Viewport: `hasTouch: true` for `#pm-steer`/`#pm-calib` tests; landscape
`{width:844, height:390}` for in-race.

**New test checklist:** (1) put it in `tests/` — `tests/manual/` is only for
suites a human runs on purpose; (2) import `test`/`expect` from
`tests/fixtures.js` unless you have a reason not to; (3) name it in a topical
`test:<group>` script — `npm run test:audit` fails on an orphan; (4) give it a
row in the `docs/TESTING.md` coverage table — `tests/test-groups.test.mjs` fails
without one; (5) if it renders or pixel-diffs, add it to `RENDER_SPECS` in
`playwright.config.js`.

---

## Steering modes

`steerMode`: `"tilt"` | `"buttons"` | `"touch"`. Set via `#pm-steer` in pause
menu. `autoThrottle()` returns true **only** in `"touch"` mode (hides the gas
pedal); `"buttons"` mode gets an explicit GAS control. Calibrate button
(`#pm-calib`) and the GEARS toggle (`#pm-gears`) are **disabled, not hidden**,
when unavailable — hiding them reflowed the settings grid so the next tap hit
the wrong button.

---

## Git branch

Work happens on a `claude/<topic>` feature branch — whichever one the current
task names. Never push to main without review.

This used to name one specific branch, which was wrong within days of being
written and stayed wrong: a branch name is a fact about *this week*, and prose
has no way to notice it changed. `git branch --show-current` is the answer, and
it cannot drift.

**The deploy branch is a DIFFERENT branch.** `.github/workflows/pages.yml` fires
only on a push to `claude/f1-game-project-26h3ng`, so work on any other branch
builds and tests but does not reach https://brycejmurrin.github.io/f1-game/
until it is merged there.
