#!/usr/bin/env node
/**
 * @doc What do I have to run for THIS change? Maps changed files to `test:<group>` scripts and prints the command (`--staged`).
 * @section runner
 * pick-tests.mjs — "what do I actually have to run for THIS change?"
 *
 * Running the whole suite is ~40 minutes of SwiftShader; running nothing is how
 * a regression ships. The honest answer is in between and it is mechanical: a
 * changed file maps to the groups that exercise it. This prints those groups,
 * as commands you can paste.
 *
 *   node tools/pick-tests.mjs                 # vs the merge-base with main
 *   node tools/pick-tests.mjs --staged        # only what is staged
 *   node tools/pick-tests.mjs --since HEAD~3
 *   node tools/pick-tests.mjs js/car/parts.js js/game/hud.js   # explicit paths
 *   node tools/pick-tests.mjs --bg            # print the background-run command
 *   node tools/pick-tests.mjs --json         # machine-readable, for CI
 *
 * `--json` exists because the human output is PROSE and a CI selector reading
 * it becomes a silent consumer of an unversioned format. Two of its lines are
 * live traps for an unanchored `test:<group>` grep: the zero-match message
 * names `test:tiny`, and the batching lines name `tools/test-bg.mjs <groups>`.
 * The JSON shape is asserted by tests/unit/pick-tests.test.mjs, so it cannot drift
 * out from under a consumer the way the prose can.
 *
 * The rules below are deliberately COARSE and biased toward running too much.
 * A rule that is too narrow is a missed regression; a rule that is too wide
 * costs 10-40 MINUTES of serialized SwiftShader per extra browser group —
 * groups run one at a time on a four-core box, so "too wide" is measured in
 * wall-clock hours, not minutes. Resolve the tension at the RUN, not the
 * rule: when in doubt widen the rule, but cap what you actually execute
 * (AGENTS.md's verification policy: two browser groups per change, the rest
 * named as not-run) and prefer tools/select-specs.mjs for a finer per-spec
 * cut when the group is much bigger than the change.
 *
 * `tests/unit/test-groups.test.mjs` asserts every group named here exists in
 * package.json, so a renamed script cannot leave a rule pointing at nothing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The branch `.github/workflows/pages.yml` deploys from — the repo's real trunk.
// tests/unit/pick-tests.test.mjs asserts this against pages.yml, so the two cannot
// drift apart silently the way a comment naming a branch would.
export const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
// Kept in step with tools/test-bg.mjs, which enforces the same arithmetic.
const WORKERS = +process.env.WORKERS || 2;
const CORES = os.availableParallelism ? os.availableParallelism() : (os.cpus().length || 4);
const MAX_GROUPS = Math.max(1, Math.floor(CORES / WORKERS));

/* [matcher, groups, why] — matcher is a RegExp over the repo-relative path.
   Every rule that matches contributes its groups; the union is what runs. */
export const RULES = [
  // ── always ──────────────────────────────────────────────────────────────
  [/^(js|css)\//, ["tiny"], "any source edit: does the page still boot"],
  [/^(js|css|index\.html|version\.json)/, ["tooling-fast"],
   "load order, docs integrity, api contracts — 4 s, catches the structural slips"],

  // ── renderer ────────────────────────────────────────────────────────────
  // NOT "visual" — tests/manual/tracks-visual.spec.js is PARKED. It has no
  // committed golden baselines and self-skips all 40 circuits, so the group
  // reports `= run passed (40/40 done, 0 failed)` at 0.0 s per test while
  // asserting nothing. Recommending it here made that vacuous green look like
  // renderer verification: measured 2026-08-14, a chunked-draw change was very
  // nearly signed off on it. The spec's own header states the principle — "a
  // gate that cannot pass is worse than no gate: it trains everyone to ignore
  // the group" — and being RECOMMENDED as a gate is how it kept getting run.
  // tests/unit/pick-tests.test.mjs holds this to the baselines actually being
  // absent, so generating them re-opens the question instead of leaving a
  // stale exclusion behind.
  [/^js\/render\/(glx|gfx)/, ["gfx"], "the shipped WebGL2 path"],
  [/^js\/render\/shaders\//, ["gfx"], "GLSL leaves feed every lit surface"],
  [/^js\/render\/webgpu\//, ["gfx"], "WGX is feature-detected; GLX must still boot"],
  [/^js\/render\/three\//, ["gfx"], "the three.js backend has its own probe spec"],
  [/^js\/render\/assets\.js/, ["hooks"], "assets-api.spec.js rides in test:hooks"],

  // ── track engine + circuit data ─────────────────────────────────────────
  [/^js\/track\/scenery/, ["circuits", "sweeps"], "prop placement and the full-fleet clip audits"],
  // `scenery` belongs here and was MISSING, found by tools/select-recall.mjs
  // replaying real regressions: js/track/tracks.js holds buildProps (street
  // barriers, treelines, the instance() emitters), and BOTH scenery defects
  // fixed on 2026-08-08 — the vegas barrier over the racing line and the
  // buenos_aires cross-segment tree — were changes to THIS file caught by
  // props-over-road/terrain-over-road, which lived only in `test:scenery` (now `test:circuits`).
  // Routing it to circuit+physics+sweeps+foundation ran everything except the
  // two specs that actually report the class of bug the file produces.
  [/^js\/track\/(tracks|mesh|spline|surface|geom|graph)\.js/,
   ["circuits", "driving", "sweeps"],
   "road geometry reaches walls, elevation, physics, every circuit's foundation — and buildProps lives here"],
  [/^js\/track\/space\.js/, ["driving"], "world<->track projection"],
  [/^js\/track\/maps\.js/, ["hooks", "circuits"], "layout metadata"],
  [/^js\/circuits\/.*\.js$/, ["circuits"], "a circuit def: walls, its scenery callback, and its own foundation spec (not the dir's CLAUDE.md)"],

  // ── spec-backed js/game files that used to reach only tiny + tooling-fast ──
  [/^js\/game\/ui-scale\.js/, ["ui"], "ui-scale.spec.js"],
  [/^(js\/game\/racecontrol|js\/race\/race-control)\.js/, ["driving"], "race-control.spec.js rides in test:driving"],
  [/^(js\/game\/aerozones|js\/physics\/aero-zones)\.js/, ["driving"], "aero-zones.spec.js rides in test:driving"],
  [/^js\/game\/garage-scene\.js/, ["car"], "garage-aero.spec.js rides in test:car"],

  // ── car ─────────────────────────────────────────────────────────────────
  [/^tools\/game-vm\.cjs/, ["game-vm"], "the Node VM game harness and its parity test"],
  [/^js\/car\/parts\.js/, ["car", "sweeps-parts"], "the catalog, budgets, recipes and their physics; sweeps-parts is the 559 s option-resolution census"],
  [/^js\/car\/(car3d|liveries|liverytex|crest-paths)\.js/, ["car", "node-slow"], "car mesh + livery specs; node-slow rasterises every livery and crest"],
  [/^tools\/slider-effect\.mjs/, ["node-slow"], "slider-effect.test.mjs spawns this tool per test"],
  [/^js\/car\/teams\.js/, ["car", "modes"], "the grid feeds season and career"],
  [/^js\/car\/ghost\.js/, ["modes"], "time-trial ghost"],

  // ── game ────────────────────────────────────────────────────────────────
  // js/game.js IS the physics — the bicycle model, the friction ellipse, the
  // aero trade and the longitudinal integrator all live in it — so `physics`
  // belongs here and was simply missing. js/track/space.js and js/track/tracks.js
  // routed to it while the file that contains the model did not, which is how a
  // change to the FX block's pace normalisation came back "no physics group
  // needed". Since the 2026-09 regroup the blast radius is three browser groups
  // (driving, hooks, circuits) instead of six: each is the union of the old
  // physics/collision/behaviour/debris, api/hooks/agent/map, and
  // circuit/foundation/scenery sets, so the SPEC union is unchanged.
  [/^js\/game\.js/, ["driving", "hooks", "circuits"], "the loop: physics, AI, race logic"],
  [/^(js\/game\/physics-consts|js\/physics\/consts)\.js/, ["driving", "hooks", "circuits"], "the driving model's immutable numbers — same blast radius as game.js"],
  [/^js\/game\/(cameras|cam-tune|cam-tuner|cam-modes)\.js/, ["input"], ""],
  [/^js\/game\/(input|steer-tuning|uilayers)\.js/, ["input"], ""],
  [/^(js\/game|js\/physics)\/brake-cue\.js/, ["input", "steering-unit"], "pulse-rate CUE math + the steering sheet that hosts it"],
  [/^js\/game\/(hud|results|menus|setup-ui|scrollfade|menunav|ariastate|topmodal|uilayers|cam-modes|gfx-quality|renderer-picker|metrics|cockpit-opts|sheetshape|quali-sheet)\.js/, ["ui"], "DOM screens"],
  [/^js\/game\/(lighting|lighting-knobs|track-lights|frame-lights|light-presets|atmosphere|tuner)\.js/, ["gfx"], ""],
  [/^js\/game\/(career|career-ui|reliability|quali)\.js|^js\/career\/(career|career-ui)\.js|^js\/race\/(reliability|quali-model)\.js/, ["modes", "state-unit"], ""],
  // The season calendar/format. `modes` is season+career+TT+quali (career is a
  // championship too, and the endRace award path is shared); `ui` because the
  // SETUP screen is DOM the menu specs click through.
  [/^js\/game\/season-(cal|ui)\.js|^js\/career\/season-(cal|ui)\.js/, ["modes", "ui", "state-unit"], "calendar + weekend format"],
  [/^js\/game\/(audio|music-lib)\.js/, ["ui", "lifecycle-unit"], ""],
  [/^js\/game\/spotify\.js/, ["ui", "audio-unit", "lifecycle-unit"], "token refresh races + browser integration"],
  // The MUSIC & SOUND panel is DOM the menu specs click through, not just audio
  // plumbing — menu-survey/ui-scale/ui-button-touch/menu-keyboard all open it.
  [/^js\/game\/audio-panel\.js/, ["ui"], "mixer panel: audio behaviour + menu DOM"],
  [/^js\/game\/(agentview|agentview-raster)\.js/, ["hooks", "agent-contract"], ""],
  [/^js\/game\/apex\.js/, ["hooks", "agent-contract"], "the __apex contract"],
  // `sweeps` because debrisworld's hazard query projects bodies back onto the
  // centreline, and debris-hazard-hint.test.mjs is the circuit-rebuilding sweep
  // that checks that projection — it lives with the other track-build-vm suites,
  // so a debrisworld edit would otherwise never run its own Node gate.
  [/^js\/game\/(debrisworld|incidentsim)\.js|^js\/physics\/(debris-world|incident-sim)\.js/, ["driving", "sweeps"], ""],
  [/^js\/game\/(particles|carmesh|bodyattitude|photomode)\.js|^js\/physics\/body-attitude\.js/, ["ui"], "visual-only layers"],
  [/^js\/game\/(store|perf|tables)\.js|^js\/core\/store\.js/, ["hooks", "modes", "state-unit"], ""],
  [/^js\/log\.js|^js\/core\/log\.js/, ["hooks", "tooling-fast"], "every module logs through it"],

  // ── the rest ────────────────────────────────────────────────────────────
  [/^js\/net\/scan\.js/, ["lifecycle-unit"], "camera cancellation is an async ownership boundary"],
  [/^js\/net\//, ["net-unit", "net"], "wire logic first (1 s), then the browser session"],
  [/^js\/data\//, ["hooks", "lifecycle-unit"], "data hub lifecycle + telemetry compare + the hook contracts"],
  [/^sw\.js|^manifest\.json/, ["service-worker"], ""],
  [/^worker\//, ["net-unit"], "the rendezvous Durable Object"],
  [/^css\//, ["ui"], "layout regressions are screenshot-visible only"],
  [/^index\.html/, ["tiny", "ui"], "script tags + DOM shell"],
  [/^tools\/manifest\.cjs/, ["tooling-fast"], "load order is asserted against index.html"],
  [/^tools\//, ["tooling-fast"], "the tools index and every tool contract live in the tooling suite"],
  [/^assets\//, ["hooks"], "the baked pack loader"],
  [/^tests\//, ["audit"], "every test file must belong to a topical group"],
  [/^types\//, ["tooling-fast"], "the authored .d.ts contracts are checked by game-ctx-surface"],
  [/^(CLAUDE|README)\.md|^docs\//, ["tooling-fast"], "docs integrity is a real test"],
];

export function pick(files) {
  const groups = new Map();   // group -> reasons
  for (const f of files) {
    for (const [re, gs, why] of RULES) {
      if (!re.test(f)) continue;
      for (const g of gs) {
        if (!groups.has(g)) groups.set(g, new Set());
        groups.get(g).add(why || f);
      }
    }
  }
  return groups;
}

function changedFiles(argv) {
  const since = argv.indexOf("--since");
  // `--since <ref>` TAKES A VALUE, and that value is not a path. Filtering on
  // `!a.startsWith("--")` alone swallowed the ref as an explicit file, so
  // `--since HEAD~3` reported the literal string "HEAD~3" as the only changed
  // file, matched no rule, and printed "nothing to run" — the one answer a test
  // selector must never give wrongly. It had never worked, and the change-aware
  // CI design in docs/archive/research/TEST-AUDIT-2026-08.md §3 is built entirely on it.
  //
  // The `since >= 0` guard is not decoration: `indexOf` returns -1 when --since
  // is ABSENT, so a bare `n !== since + 1` excludes index 0 unconditionally and
  // the documented `pick-tests.mjs <paths>` form silently lost its first path
  // (one path lost ALL of them and fell through to the git-diff default, which
  // answers a different question and looks like a real answer).
  const explicit = argv.filter((a, n) => !a.startsWith("--") && !(since >= 0 && n === since + 1));
  if (explicit.length) return explicit;
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  if (argv.includes("--staged")) return git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  if (since >= 0 && argv[since + 1]) return git(["diff", "--name-only", argv[since + 1]]).split("\n").filter(Boolean);
  // Default: everything not yet on the branch point, plus the working tree.
  //
  // THE DEPLOY BRANCH IS THE BASE, not `main`. main is a stale diverged fork
  // (AGENTS.md says so and nothing merges into it), so merge-basing against it
  // returns an ancient commit and the "changed files" set balloons to most of
  // the repo — which reads as "run everything", i.e. the tool silently gives up
  // exactly when it is asked the real question. It is kept as a fallback only
  // for a clone that has no deploy branch.
  let base = "";
  for (const ref of [`origin/${DEPLOY_BRANCH}`, DEPLOY_BRANCH, "origin/main", "main", "HEAD~1"]) {
    try { base = git(["merge-base", "HEAD", ref]); break; } catch (_) { /* try the next */ }
  }
  const out = new Set(git(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean));
  if (base) for (const f of git(["diff", "--name-only", base]).split("\n")) if (f) out.add(f);
  for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) if (f) out.add(f);
  return [...out];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);

  // --help must answer without consulting git. On a clean deploy tip,
  // changedFiles() is empty and the default prose is "no changed files" —
  // which does not contain `group`/`test:`, so the MCP smoke in
  // tools-runnable.test.mjs fails even though the selector itself is fine.
  // That smoke used to pass accidentally whenever the working tree had diffs.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: node tools/pick-tests.mjs [options] [paths…]
  (no args)     groups for files not yet on ${DEPLOY_BRANCH}, plus the working tree
  --staged      only staged files
  --since <ref> files changed since <ref>
  --bg          print tools/test-bg.mjs batch commands only
  --json        machine-readable {reason,files,groups} (asserted by pick-tests.test.mjs)
  --help        this message

Each matched path maps to one or more test:<group> scripts (see RULES).`);
    process.exit(0);
  }

  const files = changedFiles(argv);

  // --json short-circuits BEFORE any prose path, deliberately. The two early
  // exits below ("no changed files", "no rule matched") are the cases a
  // consumer most needs to distinguish — one means run nothing, the other means
  // run everything — and the prose renders them as sentences that happen to
  // contain a `test:` token. Emitting the same three fields for all outcomes is
  // what lets CI branch on `reason` instead of grepping English.
  if (argv.includes("--json")) {
    const g = pick(files);
    const pkgJ = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const named = [...g.keys()].filter((n) => pkgJ.scripts[`test:${n}`]).sort();
    console.log(JSON.stringify({
      // "none" — nothing changed, run nothing. "unmatched" — files changed but
      // no rule claimed them, so the selection is NOT trustworthy and the
      // caller must fall back to a full run. "matched" — groups is the answer.
      reason: !files.length ? "none" : (named.length ? "matched" : "unmatched"),
      files,
      groups: named.map((n) => ({ group: n, script: `test:${n}`, because: [...g.get(n)][0] })),
    }));
    process.exit(0);
  }

  if (!files.length) {
    console.log("no changed files — nothing to run");
    process.exit(0);
  }
  const groups = pick(files);
  console.log(`${files.length} changed file(s):`);
  for (const f of files.slice(0, 20)) console.log(`    ${f}`);
  if (files.length > 20) console.log(`    … and ${files.length - 20} more`);

  if (!groups.size) {
    console.log("\nno rule matched — run `npm run test:tiny` and use your judgement");
    process.exit(0);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const names = [...groups.keys()].filter((g) => pkg.scripts[`test:${g}`]).sort();

  console.log(`\n${names.length} group(s) to run:`);
  for (const g of names) console.log(`    test:${g.padEnd(14)} ${[...groups.get(g)][0]}`);

  // BATCHED, because this is deliberately biased toward running too much and a
  // wide selection pasted as one command oversubscribes the box. Every worker
  // drives a SwiftShader Chromium, and past the core count they fail on their
  // own timeouts — which read as a broken change rather than a busy machine.
  // test-bg.mjs enforces the same cap, so an unbatched paste is now refused
  // rather than silently producing fake failures; this just prints the shape it
  // will accept. (Doing this in the suggester alone would not have been enough:
  // the rule was in AGENTS.md and docs/TESTING.md the whole time, and this tool
  // still handed out a nine-group command.)
  const batches = [];
  for (let i = 0; i < names.length; i += MAX_GROUPS) batches.push(names.slice(i, i + MAX_GROUPS));
  const cmds = batches.map((b) => `node tools/test-bg.mjs ${b.join(" ")}`);
  if (argv.includes("--bg")) {
    console.log("\n" + cmds.join("\n"));
  } else {
    console.log(`\nrun them in the background, with logs — ONE BATCH AT A TIME` +
      ` (${CORES} cores, ${WORKERS} workers per group):`);
    for (const c of cmds) console.log(`    ${c}`);
  }
  if (batches.length > 1) {
    console.log(`\nwait for each batch before starting the next:  node tools/test-bg.mjs --wait`);
  }
}
