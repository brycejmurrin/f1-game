#!/usr/bin/env node
/**
 * @doc Which Pure-node CI matrix slices a diff needs (fail-safe → all).
 * @section runner
 *
 * pick-unit-slices.mjs — path → {guards, vm-a, vm-b, page-slow, driving-model}
 * for the packed ci.yml node matrix (3 slices since 2026-09-29) + driving-model.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Ordered slice ids — match ci.yml matrix.slice + driving-model job. */
export const SLICES = ["guards", "vm-a", "vm-b", "page-slow", "driving-model"];

/** Node matrix ids only (ci.yml strategy.matrix.slice). */
export const NODE_SLICES = ["vm-a", "vm-b", "page-slow"];

/**
 * Measured p50 job durations on the last 50 completed PR CI runs
 * (2026-09-29 sample), packed to the three-slice matrix. Seconds.
 * Used only for --costs / savings estimates — never for selection.
 */
export const SLICE_COST_P50_SEC = {
  guards: 279,
  "vm-a": 346,
  // Former vm-b (257) + fast (112), packed 2026-09-29.
  "vm-b": 369,
  // Former vm-page (168) + slow (146), packed 2026-09-29.
  "page-slow": 314,
  "driving-model": 100,
};

/** Which npm scripts / groups.json keys feed each slice. */
export const SLICE_SCRIPTS = {
  guards: ["test:guards"],
  "vm-a": ["test:game-vm-a"],
  "vm-b": [
    "test:game-vm-b",
    "test:net-unit", "test:service-worker", "test:lifecycle-unit",
    "test:state-unit", "test:agent-contract", "test:audio-unit",
    "test:garage-unit", "test:steering-unit", "test:mcp",
  ],
  "page-slow": ["test:vm-page", "test:node-slow"],
  "driving-model": [], // browser job: tests/specs/physics-characterization.spec.js
};

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

  [/^js\/circuits\//, ["guards", "vm-a"], "circuit/scenery data: structural + elevation twin"],
  [/^js\/track\//, ["guards", "vm-a"], "track engine: structural + elevation twin"],
  [/^tools\/track\/.*\.json$/, ["guards", "vm-a"], "sweep baselines: structural + elevation twin"],
  [/^tools\/track\/.*\.(mjs|cjs|js|sh)$/, ["guards", "vm-a", "vm-b"], "track CLI / builders: both VM slices"],
  [/^tools\/track\//, ["guards", "vm-a"], "other tools/track/ paths: structural + elevation"],
  [/^tools\/lib\//, ["guards", "vm-a", "vm-b"], "build/harness: both VM slices"],
  [/^tools\/manifest\.cjs$/, ["guards", "vm-a", "vm-b"], "TRACK_VM load list"],

  [/^js\/game\.js$/, ["guards", "vm-b", "page-slow", "driving-model"], "the loop"],
  [/^js\/physics\//, ["guards", "vm-b", "driving-model"], "driving model numbers"],
  [/^js\/race\//, ["guards", "vm-b"], "session / pit / race-control"],

  [/^js\/car\//, ["guards", "page-slow", "vm-b"], "car mesh + garage-unit rasters"],
  [/^js\/garage\//, ["guards", "vm-b", "vm-a"], "garage unit + pit complex in fleet"],
  [/^js\/audio\//, ["guards", "vm-b"], "audio-unit"],
  [/^js\/input\//, ["guards", "vm-b"], "steering-unit + phone-pad twin"],
  [/^js\/net\//, ["guards", "vm-b"], "net-unit + netplay twin"],
  [/^sw\.js$|^manifest\.json$/, ["guards", "vm-b"], "service-worker"],
  [/^worker\//, ["guards", "vm-b"], "rendezvous Durable Object"],

  [/^js\/render\//, ["guards"], "renderer: node gate is structural; gfx is macos"],
  [/^js\/lighting\//, ["guards"], "lighting: structural + targeted sweeps (elsewhere)"],
  [/^js\/ui\//, ["guards", "vm-b"], "state-unit / steering opts live in vm-b"],
  [/^js\/camera\//, ["guards", "page-slow", "vm-b"], "flyby fleet in node-slow"],
  [/^js\/agent\//, ["guards", "vm-b"], "agent-contract + agent-view-vm"],
  [/^js\/core\//, ["guards", "vm-a", "vm-b"], "shared floor every VM boots"],
  [/^js\/data\//, ["guards", "vm-b"], "hub / legends / settings-defaults"],
  [/^js\/perf\//, ["guards", "vm-b"], "quality / overlays"],
  [/^js\/fx\//, ["guards"], "visual-only"],
  [/^js\/career\//, ["guards", "vm-b"], "career state + session twins"],
  [/^js\/xr\//, ["guards", "vm-b"], "xr-phase0 in steering-unit"],

  [/^css\//, ["guards"], "layout lint lives in guards/tooling-fast"],
  [/^index\.html$/, ["guards"], "shell ids / load order"],
  [/^assets\//, ["guards"], "pack licence / load"],
  [/^types\//, ["guards"], "game-ctx surface"],

  [/^tools\/ci\//, ["guards"], "CI tools: structural contracts"],
  [/^tools\/check\//, ["guards"], "lint / ratchet tools"],
  [/^tools\/gen\//, ["guards"], "generators"],
  [/^tools\//, ["guards"], "other tools: structural"],
  [/^docs\/|^\.claude\/|^\.cursor\/|^\.codex\/|\.md$/, ["guards"], "prose: docs-guards / structural"],
  [/^tests\/helpers\//, ["guards", "vm-a", "vm-b", "page-slow"], "helpers feed many twins"],
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
  const out = execFileSync("git", ["diff", "--name-only", ref],
    { cwd: ROOT, encoding: "utf8" }).trim();
  return out ? out.split("\n").filter(Boolean) : [];
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

    if (GEOMETRY_PATHS.test(f)) {
      hit = true;
      add("guards", "geometry-paths fleet input");
      add("vm-a", "geometry-paths fleet input");
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

/** Matrix rows + flags for ci.yml GITHUB_OUTPUT. */
export function ciOutputs(result) {
  const selected = [...result.slices.keys()];
  const node = NODE_SLICES.filter((s) => result.slices.has(s));
  return {
    reason: result.reason,
    any_node: node.length > 0 ? "true" : "false",
    driving: result.slices.has("driving-model") ? "true" : "false",
    slices: node.map((slice) => ({ slice })),
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
