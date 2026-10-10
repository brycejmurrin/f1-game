#!/usr/bin/env node
/**
 * @doc Which Pure-node CI matrix slices a diff needs (fail-safe → all).
 * @section runner
 *
 * pick-unit-slices.mjs — path → {guards, vm-a1, vm-a2, vm-b1, vm-b2, page, slow,
 * driving-model} for the ci.yml node matrix (six slices since 2026-09-30) +
 * driving-model. Complements tools/ci/node-plan.mjs: this tool picks WHICH
 * runners to spin; node-plan skips scripts inside a spun runner.
 *
 * FAIL SAFE, NEVER FAIL OPEN: a path no rule claims selects EVERY slice.
 * A test-file edit selects the slice that owns that file (from groups.json).
 * Error / unknown / ambiguity → all slices.
 *
 *   node tools/ci/pick-unit-slices.mjs                 # vs deploy merge-base
 *   node tools/ci/pick-unit-slices.mjs --since HEAD~3
 *   node tools/ci/pick-unit-slices.mjs js/circuits/scenery/monaco.js
 *   node tools/ci/pick-unit-slices.mjs --json
 *   node tools/ci/pick-unit-slices.mjs --all --github-output
 *   node tools/ci/pick-unit-slices.mjs --costs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GEOMETRY_PATHS } from "./geometry-paths.mjs";
import { DEPLOY_BRANCH } from "./pick-tests.mjs";
import { circuitsOf } from "./select-specs.mjs";
import { ADAPTED, ADAPTED_RUNNER } from "./twinned-specs.mjs";
import { changedPaths } from "../lib/changed-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Ordered slice ids — match ci.yml matrix.slice + driving-model job. */
export const SLICES = [
  "guards",
  "vm-a1", "vm-a2",
  "vm-b1", "vm-b2",
  "page", "slow",
  "driving-model",
];

/** Node matrix ids only (ci.yml strategy.matrix via unit-plan). */
export const NODE_SLICES = ["vm-a1", "vm-a2", "vm-b1", "vm-b2", "page", "slow"];

/**
 * Measured / expected p50 job durations (seconds). Used only for --costs /
 * savings estimates — never for selection. Six-slice split from #508
 * (2026-09-30); times are half of the prior packed three-slice p50s where
 * a shard replaced a packed row.
 */
export const SLICE_COST_P50_SEC = {
  guards: 279,
  "vm-a1": 168,
  "vm-a2": 168,
  "vm-b1": 185,
  "vm-b2": 185,
  page: 168,
  slow: 146,
  "driving-model": 100,
};

/** Which npm scripts / groups.json keys feed each slice. */
export const SLICE_SCRIPTS = {
  guards: ["test:guards"],
  // Both shards run the same script with APEX_CIRCUIT_SHARD=i/2.
  "vm-a1": ["test:game-vm-a"],
  "vm-a2": ["test:game-vm-a"],
  "vm-b1": ["test:game-vm-b1"],
  "vm-b2": [
    "test:game-vm-b2",
    "test:net-unit", "test:service-worker", "test:lifecycle-unit",
    "test:state-unit", "test:agent-contract", "test:audio-unit",
    "test:garage-unit", "test:steering-unit", "test:desktop-unit", "test:mcp",
  ],
  page: ["test:vm-page"],
  slow: ["test:node-slow"],
  "driving-model": [], // browser job: tests/specs/physics-characterization.spec.js
};

/** Elevation twin → both circuit shards. */
const VM_A = ["vm-a1", "vm-a2"];
/** game-vm-b partitions + fast riders. */
const VM_B = ["vm-b1", "vm-b2"];
/** Former page-slow packed pair. */
const PAGE_SLOW = ["page", "slow"];

/** Build test-file → slice ownership from groups.json (source of truth). */
export function testFileOwners(groupsJson = null) {
  const g = groupsJson || JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const owners = new Map();
  for (const [slice, scripts] of Object.entries(SLICE_SCRIPTS)) {
    for (const script of scripts) {
      const entry = g.groups?.[script];
      const files = entry?.files || [];
      for (const f of files) {
        if (!owners.has(f)) owners.set(f, new Set());
        owners.get(f).add(slice);
      }
    }
  }
  return owners;
}

/**
 * [matcher, slices, why] — first-match does NOT stop; every matching rule
 * contributes (union), same as pick-tests.mjs. Order is documentation only.
 */
export const RULES = [
  [/^\.github\/workflows\//, SLICES, "workflow edit: run the whole node gate"],
  [/^\.github\/actions\//, SLICES, "reusable action edit: run the whole node gate"],

  [/^js\/circuits\//, ["guards", ...VM_A], "circuit/scenery data: structural + elevation twin"],
  [/^js\/track\//, ["guards", ...VM_A], "track engine: structural + elevation twin"],
  [/^tools\/track\/.*\.json$/, ["guards", ...VM_A], "sweep baselines: structural + elevation twin"],
  [/^tools\/track\/.*\.(mjs|cjs|js|sh)$/, ["guards", ...VM_A, ...VM_B], "track CLI / builders: both VM slices"],
  [/^tools\/track\//, ["guards", ...VM_A], "other tools/track/ paths: structural + elevation"],
  [/^tools\/lib\//, ["guards", ...VM_A, ...VM_B], "build/harness: both VM slices"],
  [/^tools\/manifest\.cjs$/, ["guards", ...VM_A, ...VM_B], "TRACK_VM load list"],

  [/^js\/game\.js$/, ["guards", ...VM_B, ...PAGE_SLOW, "driving-model"], "the loop"],
  [/^js\/physics\//, ["guards", ...VM_B, "driving-model"], "driving model numbers"],
  [/^js\/race\//, ["guards", ...VM_B], "session / pit / race-control"],

  [/^js\/car\//, ["guards", ...PAGE_SLOW, ...VM_B], "car mesh + garage-unit rasters"],
  [/^js\/garage\//, ["guards", ...VM_B, ...VM_A], "garage unit + pit complex in fleet"],
  [/^js\/audio\//, ["guards", ...VM_B], "audio-unit"],
  [/^js\/input\//, ["guards", ...VM_B], "steering-unit + phone-pad twin"],
  [/^js\/net\//, ["guards", ...VM_B], "net-unit + netplay twin"],
  [/^sw\.js$|^manifest\.json$/, ["guards", ...VM_B], "service-worker"],
  [/^worker\//, ["guards", ...VM_B], "rendezvous Durable Object"],

  [/^js\/render\//, ["guards"], "renderer: node gate is structural; gfx is macos"],
  [/^js\/lighting\//, ["guards"], "lighting: structural + targeted sweeps (elsewhere)"],
  [/^js\/ui\//, ["guards", ...VM_B], "state-unit / steering opts live in vm-b"],
  [/^js\/camera\//, ["guards", ...PAGE_SLOW, ...VM_B], "flyby fleet in node-slow"],
  [/^js\/agent\//, ["guards", ...VM_B], "agent-contract + agent-view-vm"],
  [/^js\/core\//, ["guards", ...VM_A, ...VM_B], "shared floor every VM boots"],
  [/^js\/data\//, ["guards", ...VM_B], "hub / legends / settings-defaults"],
  [/^js\/perf\//, ["guards", ...VM_B], "quality / overlays"],
  [/^js\/fx\//, ["guards"], "visual-only"],
  [/^js\/career\//, ["guards", ...VM_B], "career state + session twins"],
  [/^js\/xr\//, ["guards", ...VM_B], "xr-phase0 in steering-unit"],

  [/^css\//, ["guards"], "layout lint lives in guards/tooling-fast"],
  [/^index\.html$/, ["guards"], "shell ids / load order"],
  [/^assets\//, ["guards"], "pack licence / load"],
  [/^types\//, ["guards"], "game-ctx surface"],

  [/^tools\/ci\//, ["guards"], "CI tools: structural contracts"],
  [/^tools\/check\//, ["guards"], "lint / ratchet tools"],
  [/^tools\/gen\//, ["guards"], "generators"],
  [/^tools\//, ["guards"], "other tools: structural"],
  [/^docs\/|^\.claude\/|^\.cursor\/|^\.codex\/|\.md$/, ["guards"], "prose: docs-guards / structural"],
  [/^tests\/helpers\//, ["guards", ...VM_A, ...VM_B, ...PAGE_SLOW], "helpers feed many twins"],
  [/^tests\/specs\/physics-characterization\.spec\.js$/, ["driving-model"], "the characterization job"],
  [/^tests\/specs\//, ["guards"], "browser specs: selected job covers them; guards for taxonomy"],
  [/^tests\/data\//, ["guards"], "ratchets / timings / baselines"],
  [/^tests\/groups\.json$/, ["guards"], "group membership is a structural contract"],
  [/^tests\/unit\//, [], "handled in pick()"],
];

function changedFiles(argv) {
  const since = argv.indexOf("--since");
  const explicit = argv.filter((a, n) => !a.startsWith("--") && !(since >= 0 && n === since + 1));
  if (explicit.length) return explicit;
  let ref;
  if (since >= 0 && argv[since + 1]) ref = argv[since + 1];
  else {
    try {
      ref = execFileSync("git", ["merge-base", "HEAD", `origin/${DEPLOY_BRANCH}`],
        { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      ref = "HEAD";
    }
  }
  return changedPaths([ref]);   // rename SOURCES too (ledger M36)
}

/** Unit files that live only in tooling-fast / sweeps — not a CI node slice. */
export function classifyUnitFile(f, owners, groupsJson = null) {
  if (owners.has(f)) return { kind: "slice", slices: [...owners.get(f)] };
  const g = groupsJson || JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const sweepsFiles = new Set(g.groups?.["test:sweeps"]?.files || []);
  const sweepsParts = new Set(g.groups?.["test:sweeps-parts"]?.files || []);
  if (sweepsFiles.has(f) || sweepsParts.has(f)) {
    return { kind: "sweeps", slices: ["guards"] };
  }
  const tf = new Set(g.toolingFast?.filter((x) => typeof x === "string" && !x.startsWith("//")) || []);
  if (tf.has(f)) return { kind: "tooling-fast", slices: ["guards"] };
  return { kind: "unit-new", slices: ["guards"] };
}

/** The SOURCE an ADAPTED spec asserts (ledger L9, 2026-10-09). select-specs
 *  drops an ADAPTED spec's browser copy as VM-covered, and vm-page is the only
 *  place it runs, so an edit to what it reads must spin `page` too or the spec
 *  runs nowhere on the PR (the Pages train then goes red). Circuit data: any
 *  circuit an ADAPTED spec builds (circuitsOf the runner); circuit SCENERY:
 *  only the circuits whose *-foundation spec is ADAPTED (a scenery edit cannot
 *  move a lap-distance or wall-scrub read). Unknown .js under js/circuits ->
 *  page (fail safe). Returns the reason, or "" when no rule applies. */
const PAGE_SOURCES = [
  /^js\/race\/pit-lane\.js$/, /^js\/race\/race-control\.js$/,
  // 15-F1 (2026-10-10): the other files the ADAPTED specs assert. The VM boots the
  // whole manifest, so these are the ones a spec reads by name: logging.spec ->
  // core/log.js; projection.spec -> spline.js; pit-lane.spec -> pit.js / line.js /
  // space.js; physics-fixes + autopilot -> js/physics/**; agent-drive-bench -> js/agent/**.
  /^js\/core\/log\.js$/, /^js\/track\/core\/(space|spline|pit|line)\.js$/,
  /^js\/physics\//, /^js\/agent\//,
];
export function adaptedSourceWhy(f) {
  if (PAGE_SOURCES.some((re) => re.test(f))) return `source of an ADAPTED spec (vm-page runs it): ${f}`;
  if (!/^js\/circuits\/.+\.js$/.test(f)) return "";
  const m = /^js\/circuits\/(scenery\/)?([^/]+)\.js$/.exec(f);
  if (!m) return `unclassified circuits path, fail safe: ${f}`;
  const id = m[2];
  if (m[1]) {
    const foundation = Object.keys(ADAPTED).map((s) => /^tests\/specs\/(.+)-foundation\.spec\.js$/.exec(s)?.[1]?.replace(/-/g, "_"));
    return foundation.includes(id) ? `scenery of ${id}, whose foundation spec is ADAPTED (vm-page runs it)` : "";
  }
  const built = circuitsOf(ADAPTED_RUNNER);
  return built === null || built.has(id) ? `circuit ${id} is built by an ADAPTED spec (vm-page runs it)` : "";
}

export function pickAll(why = "--all") {
  const slices = new Map();
  for (const s of SLICES) slices.set(s, new Set([why]));
  return { slices, unmatched: [], reason: "all" };
}

export function pick(files, opts = {}) {
  const owners = opts.owners || testFileOwners();
  const groupsJson = opts.groupsJson || null;
  const slices = new Map();
  const add = (slice, why) => {
    if (!slices.has(slice)) slices.set(slice, new Set());
    slices.get(slice).add(why);
  };
  const unmatched = [];

  for (const f of files) {
    let hit = false;

    if (/^tests\/unit\//.test(f)) {
      const c = classifyUnitFile(f, owners, groupsJson);
      hit = true;
      for (const s of c.slices) add(s, `${c.kind}: ${f}`);
      continue;
    }

    for (const [re, gs, why] of RULES) {
      if (gs.length === 0) continue;
      if (!re.test(f)) continue;
      hit = true;
      for (const g of gs) add(g, why || f);
    }
    // An ADAPTED spec runs as itself on the vm-page slice, and select-specs
    // counts it as VM-covered, so its edit must schedule `page` or it runs
    // nowhere on the pull request (2026-10-05; node-plan forces the script).
    if (Object.hasOwn(ADAPTED, f)) { hit = true; add("page", `ADAPTED spec, vm-page runs it as itself: ${f}`); }

    const sourceWhy = adaptedSourceWhy(f);
    if (sourceWhy) { hit = true; add("page", sourceWhy); }

    if (GEOMETRY_PATHS.test(f)) {
      hit = true;
      add("guards", "geometry-paths fleet input");
      for (const s of VM_A) add(s, "geometry-paths fleet input");
    }

    if (!hit) unmatched.push(f);
  }

  if (unmatched.length) {
    for (const s of SLICES) add(s, `unmatched: ${unmatched.join(", ")}`);
  }

  if (!files.length) return { slices, unmatched, reason: "empty" };
  if (unmatched.length && slices.size === SLICES.length)
    return { slices, unmatched, reason: "fail-safe" };
  return { slices, unmatched, reason: "matched" };
}

export function costs(selected) {
  let sec = 0;
  const rows = [];
  for (const s of SLICES) {
    const on = selected.has(s);
    const c = SLICE_COST_P50_SEC[s] || 0;
    if (on) sec += c;
    rows.push({ slice: s, selected: on, p50_sec: c });
  }
  const all = SLICES.reduce((a, s) => a + (SLICE_COST_P50_SEC[s] || 0), 0);
  return {
    selected_sec: sec,
    all_sec: all,
    saved_sec: all - sec,
    saved_min: Math.round(((all - sec) / 60) * 10) / 10,
    rows,
  };
}

/** Matrix rows + flags for ci.yml GITHUB_OUTPUT.
 *
 * The matrix ALWAYS lists every NODE_SLICE. Branch protection requires the
 * fixed check names `Pure-node unit suites (<slice>)` (ci.yml comment on the
 * matrix); emitting a subset leaves those names unreported and every such PR
 * stays BLOCKED even when the aggregator `CI` is green (measured on #454
 * 35e66e231: vm-b1/b2/page/slow ran, vm-a1/a2 never appeared). Unneeded rows
 * carry `needed:"false"` so the job exits 0 without work.
 */
export function ciOutputs(result) {
  const selected = [...result.slices.keys()];
  const nodeNeeded = NODE_SLICES.filter((s) => result.slices.has(s));
  return {
    reason: result.reason,
    any_node: nodeNeeded.length > 0 ? "true" : "false",
    driving: result.slices.has("driving-model") ? "true" : "false",
    slices: NODE_SLICES.map((slice) => ({
      slice,
      needed: result.slices.has(slice) ? "true" : "false",
    })),
    selected,
    skipped: SLICES.filter((s) => !result.slices.has(s)),
  };
}

function main(argv = process.argv.slice(2)) {
  let result;
  try {
    if (argv.includes("--all")) {
      result = pickAll();
    } else {
      const files = changedFiles(argv);
      result = pick(files);
    }
  } catch (e) {
    console.error(`pick-unit-slices: fail-safe all (${e.message})`);
    result = pickAll(`error: ${e.message}`);
    result.reason = "fail-safe";
  }

  const out = ciOutputs(result);
  const c = costs(result.slices);

  if (argv.includes("--github-output")) {
    const gh = process.env.GITHUB_OUTPUT;
    const lines = [
      `any_node=${out.any_node}`,
      `driving=${out.driving}`,
      `reason=${out.reason}`,
      `slices=${JSON.stringify(out.slices)}`,
    ];
    if (gh) fs.appendFileSync(gh, lines.join("\n") + "\n");
    else console.log(lines.join("\n"));
    return;
  }

  if (argv.includes("--json")) {
    const files = argv.includes("--all")
      ? ["--all"]
      : changedFiles(argv.filter((a) => a !== "--json" && a !== "--costs" && a !== "--github-output"));
    console.log(JSON.stringify({
      reason: result.reason,
      files,
      unmatched: result.unmatched,
      slices: out.selected.map((s) => ({
        slice: s,
        because: [...(result.slices.get(s) || [])].join("; "),
      })),
      skipped: out.skipped,
      any_node: out.any_node,
      driving: out.driving,
      matrix: out.slices,
      costs: c,
    }, null, 2));
    return;
  }

  if (result.reason === "empty") {
    console.log("nothing changed — no node slices selected");
    return;
  }
  console.log(`reason: ${result.reason}`);
  console.log(`\nrun:  ${out.selected.join(", ") || "(none)"}`);
  console.log(`skip: ${out.skipped.join(", ") || "(none)"}`);
  console.log(`any_node=${out.any_node} driving=${out.driving}`);
  console.log(`\nestimated runner-min (p50): selected ${(c.selected_sec / 60).toFixed(1)} / all ${(c.all_sec / 60).toFixed(1)}  (save ~${c.saved_min} min)`);
  if (result.unmatched.length) {
    console.log(`\nfail-safe unmatched: ${result.unmatched.join(", ")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
