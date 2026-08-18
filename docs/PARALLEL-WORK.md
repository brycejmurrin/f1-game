# Parallel work — subagents, worktrees, and the one thing that does not parallelise

Where to spend concurrency in this repo, and where spending it makes things
*worse*. Written after a session in which parallelism produced ten confident,
entirely fake test failures.

---

## The governing fact: this box has 4 cores, and the suite drives a browser

Everything below follows from it.

A Playwright worker runs a SwiftShader Chromium. A test group at `--workers=2`
is already half the machine. **Worktrees isolate files; they do not isolate
CPU.** The literature is blunt about this — worktree isolation stops one task
trampling another's *files*, and does nothing about its ports, caches, or test
state — and Block built a whole agent task queue because agents on one machine
independently trigger expensive builds and thrash each other
([Augment](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)).

Measured here, the hard way: three test groups plus a concurrent baseline suite
reached **117 Chromium processes on 4 cores, load average 50.7**. Nine physics
failures and one tiny failure, every one of them `Test timeout of 120000ms
exceeded`, **not one an assertion**. Zero real defects. Re-run alone on a quiet
box, the same group went green.

So the rule is not "parallelise more". It is:

> **Parallelise the thinking. Serialise the browser.**

---

## What IS worth running in parallel

These are token-bound, not CPU-bound. Many at once costs nothing but tokens.

| Work | Why it parallelises |
|---|---|
| Exploration across many files (`Explore` agent) | pure reads; the answer is a conclusion, not a file dump |
| Auditing a contract across a domain — e.g. "every `Tracks.curvature` call site: AI-only, assist-gated, broadcast, or surface?" (see the sweep in AGENTS.md) | one agent per column of the question |
| Reviewing a diff from several angles at once (correctness / perf / a11y / docs-drift) | independent lenses, no shared state |
| Cross-checking prose against code — the repo's standing weakness, per `ARCHITECTURE-REVIEW.md` | one agent per doc |
| Per-file analysis ahead of a mechanical migration — e.g. B1's before/after font-size dumps for 11 CSS files | the *measurement* is parallel even when the commits are serial |

The last row is the honest shape of most "parallelise the refactor" ideas here:
the analysis fans out, the edits and commits come back to one branch in order.

## What is NOT worth running in parallel

- **More than two test groups.** `tools/test-bg.mjs` already gives each group a
  free port, its own report dir and its own log, so the port collision the
  worktree literature warns about is solved — but the cores are not.
- **Any group alongside `test:baseline`, a `--project=render` suite, or a
  `tools/*-audit.mjs` sweep.** All of them spawn browsers.
- **`test:sweeps` internally (and so `test:tooling`, whose body is now
  `npm run test:tooling-fast && npm run test:sweeps`).** The sweeps pass
  `--test-concurrency=1` deliberately: every sweep suite rebuilds all 40 circuits, and
  four at once reached 5.4 GB and was OOM-killed — which surfaces as a `SIGKILL`
  with no assertion, so it does not even read as a test failure.

**The diagnostic, worth memorising:** a failure list that is *all timeouts and
no assertions* means you are measuring the machine. Re-run the group alone
before believing any of it.

---

## Worktrees: when they earn their keep here

`git worktree add` is ~1 second and shares the object store, so history is never
duplicated — only the working files. The `Agent` tool takes
`isolation: "worktree"` and cleans up automatically if the tree is unchanged.

Three uses have already paid off in this repo:

1. **"Was this failing before my change?"** The three phone-landscape pixel
   baselines looked like a regression from in-flight work. A worktree at the
   deploy tip proved they failed there too, by the same margins
   (39687/3391/11174 vs 39663/3391/11177). That is the difference between
   re-blessing a baseline and hiding a regression — and it is not answerable
   from the working tree, because the tests serve `js/` and `css/` straight off
   disk.
2. **Baseline-vs-working-tree geometry diffs.** `tools/graph-parity.cjs --all`
   already does exactly this: builds every track from a baseline ref *and* the
   working tree and diffs prop geometry vertex for vertex.
3. **Edits that would collide.** Two agents editing `css/` at once in one tree
   silently overwrite each other; git only notices at merge, and there is no
   merge.

### The recipe for this repo

```sh
WT=/tmp/.../scratchpad/wt-$NAME              # scratchpad, never the repo root
git worktree add -q "$WT" <ref>
cp --reflink=auto -r node_modules "$WT/"      # see caveat below
# ... work / run ...
git worktree remove --force "$WT"
git worktree list                            # confirm it is gone
```

**Caveats that actually apply here:**

- **`node_modules` is not created in a new worktree.** Copy it in
  (`cp --reflink=auto` is nearly free on a CoW filesystem) rather than symlink —
  a shared directory corrupts under concurrent installs. After a dependency
  change, `npm ci --prefer-offline` instead.
- **No submodules to trip over.** Everything third-party is vendored
  (`vendor/three-0.185.1`, `vendor/jsqr-1.4.0`, `vendor/trystero-0.25.3`,
  `vendor/rapier-0.19.3`), which sidesteps the multiplying-submodule problem
  entirely.
- **No build step, so no build cache to corrupt** — the single biggest
  worktree hazard in a normal repo does not exist here. That is one more thing
  the no-bundler bet buys.
- **`artifacts/` and `scratch/` are gitignored and per-worktree**, so outputs
  cannot collide.
- **Remove it when done.** A stale worktree holds a branch checked out and blocks
  operations on it later.

### When a worktree is the wrong tool

If the agents are only *reading*, skip it — a worktree costs a checkout and buys
isolation nobody needed. Read-only fan-out should run in the main tree.

---

## Applying this to the component restructure (B0–B4)

| Stage | Parallel? | Shape |
|---|---|---|
| B0 harness | done | — |
| **B1 type scale** | **analysis yes, commits no** | one agent per CSS file to produce the before/after size dump and a proposed mapping onto `--fs-1..7`; apply and commit them **one file at a time** on one branch, as the plan requires, so each commit is provably a no-op or a deliberate change |
| **B2 primitives** | **yes, read-only** | one agent per component family (list rows / chips / option buttons) to inventory duplicates across `menus/career/carsetup/data` before anything is collapsed |
| B3 HUD grid | no | one coherent layout change to one file; splitting it invents conflicts |
| B4 retire compensations | no | a judgement call that needs the whole picture at once |

**Verification stays serial throughout**, and that is the real bottleneck: every
stage is gated on `layout-audit` / `menu-fit` / `fit-audit` across the scale axis
plus the six pixel baselines, all of which are browsers. Adding agents does not
move that. Plan the fan-out to *reduce the number of verification rounds*, not to
run more of them at once.

---

## Sources

- [Augment — Git worktrees for parallel AI agent execution](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)
- [Zylos — Git worktree isolation patterns](https://zylos.ai/research/2026-02-22-git-worktree-parallel-ai-development/)
