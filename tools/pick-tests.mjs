#!/usr/bin/env node
/**
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
 *
 * The rules below are deliberately COARSE and biased toward running too much.
 * A rule that is too narrow is a missed regression; a rule that is too wide
 * costs minutes. When in doubt, widen.
 *
 * `tests/test-groups.test.mjs` asserts every group named here exists in
 * package.json, so a renamed script cannot leave a rule pointing at nothing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* [matcher, groups, why] — matcher is a RegExp over the repo-relative path.
   Every rule that matches contributes its groups; the union is what runs. */
export const RULES = [
  // ── always ──────────────────────────────────────────────────────────────
  [/^(js|css)\//, ["tiny"], "any source edit: does the page still boot"],
  [/^(js|css|index\.html|version\.json)/, ["tooling-fast"],
   "load order, docs integrity, api contracts — 4 s, catches the structural slips"],

  // ── renderer ────────────────────────────────────────────────────────────
  [/^js\/render\/(glx|gfx)/, ["webgl", "visual"], "the shipped WebGL2 path"],
  [/^js\/render\/shaders\//, ["webgl", "ab"], "GLSL leaves feed every lit surface"],
  [/^js\/render\/webgpu\//, ["webgl"], "WGX is feature-detected; GLX must still boot"],
  [/^js\/render\/three\//, ["tlx"], "the three.js backend has its own probe spec"],
  [/^js\/render\/assets\.js/, ["api"], "assets-api.spec.js lives in test:api"],

  // ── track engine + circuit data ─────────────────────────────────────────
  [/^js\/track\/scenery/, ["scenery", "sweeps"], "prop placement and the full-fleet clip audits"],
  [/^js\/track\/(tracks|mesh|spline|surface|geom|graph)\.js/,
   ["circuit", "physics", "sweeps"], "road geometry reaches walls, elevation and physics"],
  [/^js\/track\/space\.js/, ["physics"], "world<->track projection"],
  [/^js\/track\/(markings|maps|geo-paths)\.js/, ["map", "circuit"], "layout metadata"],
  [/^js\/circuits\//, ["circuit", "scenery"], "a circuit def: walls + its scenery callback"],

  // ── car ─────────────────────────────────────────────────────────────────
  [/^js\/car\/parts\.js/, ["parts"], "the catalog, budgets, recipes and their physics"],
  [/^js\/car\/(car3d|liveries|liverytex)\.js/, ["parts"], "car mesh + livery specs"],
  [/^js\/car\/teams\.js/, ["parts", "modes"], "the grid feeds season and career"],
  [/^js\/car\/ghost\.js/, ["modes"], "time-trial ghost"],

  // ── game ────────────────────────────────────────────────────────────────
  // js/game.js IS the physics — the bicycle model, the friction ellipse, the
  // aero trade and the longitudinal integrator all live in it — so `physics`
  // belongs here and was simply missing. js/track/space.js and js/track/tracks.js
  // routed to it while the file that contains the model did not, which is how a
  // change to the FX block's pace normalisation came back "no physics group
  // needed". Four groups for a game.js edit is a lot; running the wrong three is
  // worse, and these RULES are deliberately biased toward running too much.
  [/^js\/game\.js/, ["behaviour", "api", "circuit", "physics"], "the loop: physics, AI, race logic"],
  [/^js\/game\/(cameras|cam-tune|cam-tuner)\.js/, ["camera"], ""],
  [/^js\/game\/(input|steer-tuning|uilayers)\.js/, ["steering"], ""],
  [/^js\/game\/(hud|results|menus|setup-ui|scrollfade|menunav|ariastate|topmodal|uilayers)\.js/, ["ui"], "DOM screens"],
  [/^js\/game\/(lighting|light-presets|atmosphere|tuner)\.js/, ["webgl", "ab"], ""],
  [/^js\/game\/(career|career-ui|reliability|quali)\.js/, ["career"], ""],
  [/^js\/game\/(audio|music-lib|spotify)\.js/, ["audio"], ""],
  [/^js\/game\/(agentview|agentview-raster)\.js/, ["agent", "agent-contract"], ""],
  [/^js\/game\/apex\.js/, ["api", "hooks", "agent-contract"], "the __apex contract"],
  [/^js\/game\/(debrisworld|incidentsim)\.js/, ["debris", "collision"], ""],
  [/^js\/game\/(particles|carmesh|bodyattitude|photomode)\.js/, ["ui"], "visual-only layers"],
  [/^js\/game\/(store|perf|tables)\.js/, ["api", "modes"], ""],
  [/^js\/log\.js/, ["api", "tooling-fast"], "every module logs through it"],

  // ── the rest ────────────────────────────────────────────────────────────
  [/^js\/net\//, ["net-unit", "net"], "wire logic first (1 s), then the browser session"],
  [/^js\/data\//, ["api"], "data hub lifecycle + telemetry compare"],
  [/^sw\.js|^manifest\.json/, ["service-worker"], ""],
  [/^worker\//, ["net-unit"], "the rendezvous Durable Object"],
  [/^css\//, ["ui"], "layout regressions are screenshot-visible only"],
  [/^index\.html/, ["tiny", "ui"], "script tags + DOM shell"],
  [/^tools\/manifest\.cjs/, ["tooling-fast"], "load order is asserted against index.html"],
  [/^tools\//, ["tooling-fast"], "the tools index and every tool contract live in the tooling suite"],
  [/^assets\//, ["api"], "the baked pack loader"],
  [/^tests\//, ["audit"], "every test file must belong to a topical group"],
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
  const explicit = argv.filter((a) => !a.startsWith("--"));
  if (explicit.length) return explicit;
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  if (argv.includes("--staged")) return git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  const i = argv.indexOf("--since");
  if (i >= 0 && argv[i + 1]) return git(["diff", "--name-only", argv[i + 1]]).split("\n").filter(Boolean);
  // Default: everything not yet on the branch point, plus the working tree.
  let base = "";
  for (const ref of ["origin/main", "main", "HEAD~1"]) {
    try { base = git(["merge-base", "HEAD", ref]); break; } catch (_) { /* try the next */ }
  }
  const out = new Set(git(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean));
  if (base) for (const f of git(["diff", "--name-only", base]).split("\n")) if (f) out.add(f);
  for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) if (f) out.add(f);
  return [...out];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = changedFiles(argv);
  if (!files.length) {
    console.log("no changed files — nothing to run");
    process.exit(0);
  }
  const groups = pick(files);
  console.log(`${files.length} changed file(s):`);
  for (const f of files.slice(0, 20)) console.log(`    ${f}`);
  if (files.length > 20) console.log(`    … and ${files.length - 20} more`);

  if (!groups.size) {
    console.log("\nno rule matched — run `npm run test:fast` and use your judgement");
    process.exit(0);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const names = [...groups.keys()].filter((g) => pkg.scripts[`test:${g}`]).sort();

  console.log(`\n${names.length} group(s) to run:`);
  for (const g of names) console.log(`    test:${g.padEnd(14)} ${[...groups.get(g)][0]}`);

  if (argv.includes("--bg")) {
    console.log(`\nnode tools/test-bg.mjs ${names.join(" ")}`);
  } else {
    console.log(`\nrun them in the background, with logs:\n    node tools/test-bg.mjs ${names.join(" ")}`);
  }
}
