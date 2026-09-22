/** @doc Single source for "which sweeps does this diff need?" — the fleet trigger (derived from the track VM's own module list) and the per-suite targeted table.
 *
 * ONE pattern, two consumers, written once in a syntax both speak:
 *   - .github/workflows/ci.yml reads GEOMETRY_ERE through `node -e` and hands
 *     it to `grep -qE` (its sweeps filter), and asks `--targeted` which cheap
 *     suites a non-fleet diff still needs,
 *   - tools/ci/deploy.mjs imports GEOMETRY_PATHS and targetedSuites() for the
 *     same two decisions locally.
 *
 * TWO TIERS (2026-09-22). `test:sweeps` is fourteen suites, ten of which
 * rebuild EVERY circuit (52 today) from tools/lib/track-build-vm.cjs or the
 * audit CLIs under tools/track/ — about ten fleet rebuilds, 700 s locally and
 * the last 8-9 minutes of every Pages gate that runs them. Before this file
 * had tiers, the trigger also named js/game.js, js/car/ and debris-world,
 * "because four sweep suites load them" — but no FLEET suite executes any of
 * those: the fleet build's inputs are exactly tools/manifest.cjs's TRACK_VM
 * list plus the circuit and scenery files it reads from disk. Since nearly
 * every session edits game.js, the fleet rebuilt on diffs that could not have
 * moved a vertex (Pages run 2526: 67 files since live, one geometry match, a
 * 28-line start-race latch in game.js, 14 minutes of gate).
 *
 *   FLEET    — GEOMETRY_ERE. A match runs `npm run test:sweeps`, everything.
 *              DERIVED from TRACK_VM: the directories the build reads whole
 *              (js/track/, js/circuits/, tools/track|lib/) plus every TRACK_VM
 *              module outside them (js/core/log.js, js/core/mat4.js,
 *              js/data/teams.js, the js/garage/scene*.js the pit complex
 *              builds with). The old hand list MISSED those last four: an
 *              edit to js/garage/scene.js re-shapes every pit garage and ran
 *              no sweep at all. A list read from the manifest cannot drift
 *              from what the VM loads; deploy-tool.test.mjs pins that every
 *              TRACK_VM entry matches this pattern.
 *   TARGETED — the suites in test:sweeps whose inputs are NOT the fleet build:
 *              each names the source it actually reads, and only that suite
 *              runs (no fleet rebuild: the whole tier is under a minute). A
 *              suite that reads a js/ path no tier names fails
 *              deploy-tool.test.mjs, so a suite cannot quietly start reading
 *              a file the trigger does not watch.
 *
 * The alternation is deliberately NARROWER than pick-tests.mjs's sweeps rules:
 * this answers "can the FLEET REBUILD change?", not "which groups does this
 * touch?". Widening it costs every deploy 10 minutes.
 *
 * FAIL SAFE, NEVER FAIL OPEN, in both consumers: a diff they cannot resolve
 * runs the fleet; a sweep suite's OWN file changing runs the fleet (a moved
 * baseline changes what the sweep measures); a manifest that names nothing
 * throws rather than matching nothing.
 *
 * Syntax note: every construct here is valid in BOTH POSIX ERE and JS RegExp
 * (no `(?:`, no `\d`, no lookaround). That is what lets one string serve both.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs"));

/** The directories the fleet build reads whole: the track engine, the circuit
 *  defs and their scenery callbacks (LAZY_SCENERY lives under js/circuits/),
 *  and the harnesses that do the building. The `tools/(track|lib)/` form is
 *  what namedPaths() below knows how to expand. */
const FLEET_DIRS = ["js/track/", "js/circuits/", "tools/track/", "tools/lib/"];
const FLEET_DIR_ALTS = ["js/track/", "js/circuits/", "tools/(track|lib)/"];

const ere = (p) => p.replace(/\./g, "\\.");

/** Every TRACK_VM module that is not already under a fleet directory — the
 *  four the hand-written list used to miss. Throws on a manifest that names
 *  nothing: a trigger derived from an empty list would match nothing, silently. */
export function fleetFiles() {
  const vm = Array.isArray(MANIFEST.TRACK_VM) ? MANIFEST.TRACK_VM : [];
  const mods = vm.filter((e) => typeof e === "string" && !e.startsWith("@"));
  if (!mods.length) throw new Error("geometry-paths: tools/manifest.cjs TRACK_VM names no modules — refusing to derive a fleet trigger from nothing");
  return mods.filter((m) => !FLEET_DIRS.some((d) => m.startsWith(d)));
}

/** The manifest is a fleet input too: it IS the load list (TRACK_VM, the
 *  circuits dir, LAZY_SCENERY), so adding or reordering a module there changes
 *  every build without touching a file the list names. */
const FLEET_EXTRA = ["tools/manifest.cjs"];

export const GEOMETRY_ERE =
  "^(" + [...FLEET_DIR_ALTS, ...[...FLEET_EXTRA, ...fleetFiles()].map((f) => ere(f) + "$")].join("|") + ")";

export const GEOMETRY_PATHS = new RegExp(GEOMETRY_ERE);

/** The suites of test:sweeps that do NOT measure the fleet build, keyed by
 *  the sources they read (verified by reading each suite: the `path.join`
 *  and import lines, not the comments). A rule's `ere` is ERE-and-JS like
 *  GEOMETRY_ERE. Order is irrelevant; a diff runs the union of every rule
 *  it matches, deduplicated, in test:sweeps order.
 *
 *  Not here, on purpose: js/game.js. No sweep suite reads it — grid-boxes
 *  measures the boxes the TRACK build paints and only mentions gridUp() in a
 *  comment — so a game.js edit needs no sweep, and that is the diff class
 *  that was paying for ten fleet rebuilds. */
export const TARGETED = [
  { ere: "^(js/lighting/|js/render/shared/light-budget\\.js$)",
    suites: ["tests/unit/lamp-fixture-anchor.test.mjs"],
    why: "builds every circuit's lights from js/lighting/{frame-lights,knobs,lighting,track-lights}.js and light-budget.js" },
  { ere: "^js/garage/pit-signs\\.js$",
    suites: ["tests/unit/pit-signs.test.mjs"],
    why: "the pit bay signs' atlas + decal (pick-tests routes this file to sweeps; the fleet trigger never did)" },
  { ere: "^js/physics/debris-world\\.js$",
    suites: ["tests/unit/debris-hazard-hint.test.mjs"],
    why: "the hazard projection reads debris-world.js's source and builds the circuits it names" },
  { ere: "^(js/car/|tools/car/parts-sweep\\.mjs$)",
    suites: ["tests/unit/car-front-wing-width.test.mjs"],
    why: "builds the car through tools/car/parts-sweep.mjs (js/car/parts.js, car3d.js); no circuit" },
  { ere: "^js/render/shared/driving-line\\.js$",
    suites: ["tests/unit/driving-line.test.mjs"],
    why: "the ribbon's layout on a synthetic stadium; builds no circuit" },
  { ere: "^js/ui/driving-line-opts\\.js$",
    suites: ["tests/unit/driving-line-opts.test.mjs"],
    why: "the sheet's store round-trip; builds no circuit" },
];

/** The targeted suites a set of changed paths needs, in test:sweeps order,
 *  deduplicated. Empty when none of the rules match. The caller decides the
 *  fleet question first (GEOMETRY_PATHS, or a suite's own file changing):
 *  when the fleet runs, everything runs and this list is moot. */
export function targetedSuites(files, order = sweepOrder()) {
  const hit = new Set();
  for (const r of TARGETED) {
    const re = new RegExp(r.ere);
    if (files.some((f) => re.test(f))) for (const s of r.suites) hit.add(s);
  }
  const rank = new Map(order.map((s, i) => [s, i]));
  return [...hit].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || a.localeCompare(b));
}

/** package.json's test:sweeps file list — the one copy ci.yml and deploy.mjs
 *  both read. Empty (never a throw) here: ordering is cosmetic. */
export function sweepOrder() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return String((pkg.scripts && pkg.scripts["test:sweeps"]) || "").match(/tests\/unit\/[^\s]+/g) || [];
  } catch (_) { return []; }
}

/** The alternatives this pattern names, split by shape, for the existence test
 *  in deploy-tool.test.mjs. `files` are `$`-anchored literals (one exact
 *  path); `dirs` are prefixes ending in `/`. Anything else is a pattern the
 *  test cannot check, and it fails rather than passing it over. */
export function namedPaths(pattern = GEOMETRY_ERE) {
  const body = pattern.replace(/^\^\(/, "").replace(/\)$/, "");
  const files = [], dirs = [], other = [];
  for (const alt of splitTop(body)) {
    const lit = alt.replace(/\\\./g, ".");
    if (lit.endsWith("$")) files.push(lit.slice(0, -1));
    else if (lit.endsWith("/") && !/[()|]/.test(lit)) dirs.push(lit);
    else if (/^[a-z]+\/\([a-z|]+\)\/$/.test(lit)) {                 // tools/(track|lib)/
      const [, head, inner] = lit.match(/^([a-z]+)\/\(([a-z|]+)\)\/$/);
      for (const part of inner.split("|")) dirs.push(`${head}/${part}/`);
    } else other.push(alt);
  }
  return { files, dirs, other };
}

/** Split an alternation on its TOP-LEVEL `|` only, so `tools/(track|lib)/`
 *  stays one alternative instead of becoming two broken halves. */
function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { cur += c + (s[++i] || ""); continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// CLI, guarded on being the ENTRY module: an importer with its own flags
// (deploy.mjs --json writes a machine verdict to stdout) must not have this
// printed into its output.
//   node tools/ci/geometry-paths.mjs --ere               # the fleet pattern, for ci.yml's grep
//   node tools/ci/geometry-paths.mjs --targeted <file>   # changed paths, one per line -> the
//                                                        #   targeted suites, space-separated
//                                                        #   (empty output: none needed)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  if (a[0] === "--ere") process.stdout.write(GEOMETRY_ERE);
  else if (a[0] === "--targeted") {
    if (!a[1]) { console.error("usage: geometry-paths.mjs --targeted <changed-files-list>"); process.exit(2); }
    const files = fs.readFileSync(a[1], "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    process.stdout.write(targetedSuites(files).join(" "));
  }
}
