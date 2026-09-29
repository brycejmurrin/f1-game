#!/usr/bin/env node
/**
 * @doc Prototype: which Pure-node CI matrix slices a diff needs (not wired into workflows).
 * NOT wired into ci.yml — for recall / savings analysis only until a follow-up
 * PR proves safety and adds a required-check aggregator for skipped slices.
 * @section runner
 *
 * pick-unit-slices.mjs — path → {guards, vm-a, vm-b, vm-page, slow, fast,
 * driving-model} for the ci.yml node matrix (+ the driving-model job).
 *
 * Today every PR run spends ~17 runner-minutes on the five node slices +
 * driving-model regardless of the diff (measured 2026-09-29, see
 * docs/notes/CI-ANALYSIS-2026-09-29.md). Browser selection is already
 * change-aware (`select-specs.mjs`); the node matrix is not.
 *
 * FAIL SAFE, NEVER FAIL OPEN: a path no rule claims selects EVERY slice.
 * A test-file edit selects the slice that owns that file (from groups.json).
 *
 *   node tools/ci/pick-unit-slices.mjs                 # vs deploy merge-base
 *   node tools/ci/pick-unit-slices.mjs --since HEAD~3
 *   node tools/ci/pick-unit-slices.mjs js/circuits/scenery/monaco.js
 *   node tools/ci/pick-unit-slices.mjs --json
 *   node tools/ci/pick-unit-slices.mjs --costs          # with measured p50 mins
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { GEOMETRY_PATHS } from "./geometry-paths.mjs";
import { DEPLOY_BRANCH } from "./pick-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

/** Ordered slice ids — match ci.yml matrix.slice + driving-model job. */
export const SLICES = ["guards", "vm-a", "vm-b", "vm-page", "slow", "fast", "driving-model"];

/**
 * Measured p50 job durations on the last 50 completed PR CI runs
 * (2026-09-29 sample, artifacts/ci-analysis/aggregate.json). Seconds.
 * Used only for --costs / savings estimates — never for selection.
 */
export const SLICE_COST_P50_SEC = {
  guards: 279,
  "vm-a": 346,
  "vm-b": 257,
  "vm-page": 168,
  slow: 146,
  fast: 112,
  "driving-model": 100,
};

/** Which npm scripts / groups.json keys feed each slice. */
export const SLICE_SCRIPTS = {
  guards: ["test:guards"],
  "vm-a": ["test:game-vm-a"],
  "vm-b": ["test:game-vm-b"],
  "vm-page": ["test:vm-page"],
  slow: ["test:node-slow"],
  fast: [
    "test:net-unit", "test:service-worker", "test:lifecycle-unit",
    "test:state-unit", "test:agent-contract", "test:audio-unit",
    "test:garage-unit", "test:steering-unit", "test:mcp",
  ],
  "driving-model": [], // browser job: tests/specs/physics-characterization.spec.js
};

/** Build test-file → slice ownership from groups.json (source of truth). */
export function testFileOwners(groupsJson = null) {
  const g = groupsJson || JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const owners = new Map(); // test path -> Set(slice)
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
  // tooling-fast files are what Structural guards runs via test:guards + more
  // in the local edit loop; a tooling-fast-only test still needs guards in CI
  // only when it is ALSO in test:guards. Edits to tooling-fast-only files that
  // are NOT in any slice still fail-safe to all (see RULES).
  return owners;
}

/**
 * [matcher, slices, why] — first-match does NOT stop; every matching rule
 * contributes (union), same as pick-tests.mjs. Order is documentation only.
 *
 * Geometry → vm-a (elevation-tracks-vm builds every circuit).
 * game.js / physics → vm-b + driving-model.
 * Car raster → slow. Net/SW/audio/garage/steer → fast.
 * Workflow / unknown → ALL (fail-safe via unmatchedPaths).
 */
export const RULES = [
  // ── CI / infra: do not guess ───────────────────────────────────────────
  [/^\.github\/workflows\//, SLICES, "workflow edit: run the whole node gate"],
  [/^\.github\/actions\//, SLICES, "reusable action edit: run the whole node gate"],

  // ── geometry fleet (same notion as geometry-paths.mjs) ─────────────────
  [/^js\/circuits\//, ["guards", "vm-a"], "circuit/scenery data: structural + elevation twin"],
  [/^js\/track\//, ["guards", "vm-a"], "track engine: structural + elevation twin"],
  // Baselines under tools/track/ are JSON ratchets the SWEEPS job reads — not
  // the game-vm harness. Routing them to vm-b paid ~4 min for no signal on
  // every scenery PR in the 2026-09-29 sample.
  [/^tools\/track\/.*\.json$/, ["guards", "vm-a"], "sweep baselines: structural + elevation twin"],
  [/^tools\/track\/.*\.(mjs|cjs|js|sh)$/, ["guards", "vm-a", "vm-b"], "track CLI / builders: both VM slices"],
  [/^tools\/track\//, ["guards", "vm-a"], "other tools/track/ paths: structural + elevation"],
  [/^tools\/lib\//, ["guards", "vm-a", "vm-b"], "build/harness: both VM slices"],
  [/^tools\/manifest\.cjs$/, ["guards", "vm-a", "vm-b"], "TRACK_VM load list"],

  // ── driving model ──────────────────────────────────────────────────────
  [/^js\/game\.js$/, ["guards", "vm-b", "vm-page", "driving-model"], "the loop"],
  [/^js\/physics\//, ["guards", "vm-b", "driving-model"], "driving model numbers"],
  [/^js\/race\//, ["guards", "vm-b", "fast"], "session / pit / race-control"],

  // ── car / garage / audio / input / net ─────────────────────────────────
  [/^js\/car\//, ["guards", "slow", "fast"], "car mesh + garage-unit rasters"],
  [/^js\/garage\//, ["guards", "fast", "vm-a"], "garage unit + pit complex in fleet"],
  [/^js\/audio\//, ["guards", "fast"], "audio-unit"],
  [/^js\/input\//, ["guards", "fast", "vm-b"], "steering-unit + phone-pad twin"],
  [/^js\/net\//, ["guards", "fast", "vm-b"], "net-unit + netplay twin"],
  [/^sw\.js$|^manifest\.json$/, ["guards", "fast"], "service-worker"],
  [/^worker\//, ["guards", "fast"], "rendezvous Durable Object"],

  // ── render / lighting / ui / agent / core ──────────────────────────────
  [/^js\/render\//, ["guards"], "renderer: node gate is structural; gfx is macos"],
  [/^js\/lighting\//, ["guards"], "lighting: structural + targeted sweeps (elsewhere)"],
  [/^js\/ui\//, ["guards", "fast"], "state-unit / steering opts live in fast"],
  [/^js\/camera\//, ["guards", "slow", "fast"], "flyby fleet in node-slow"],
  [/^js\/agent\//, ["guards", "vm-b", "fast"], "agent-contract + agent-view-vm"],
  [/^js\/core\//, ["guards", "vm-a", "vm-b"], "shared floor every VM boots"],
  [/^js\/data\//, ["guards", "fast", "vm-b"], "hub / legends / settings-defaults"],
  [/^js\/perf\//, ["guards", "fast"], "quality / overlays"],
  [/^js\/fx\//, ["guards"], "visual-only"],
  [/^js\/career\//, ["guards", "fast", "vm-b"], "career state + session twins"],

  // ── shell / css / assets ───────────────────────────────────────────────
  [/^css\//, ["guards"], "layout lint lives in guards/tooling-fast"],
  [/^index\.html$/, ["guards"], "shell ids / load order"],
  [/^assets\//, ["guards"], "pack licence / load"],
  [/^types\//, ["guards"], "game-ctx surface"],

  // ── tools / tests / docs ───────────────────────────────────────────────
  [/^tools\/ci\//, ["guards"], "CI tools: structural contracts"],
  [/^tools\/check\//, ["guards"], "lint / ratchet tools"],
  [/^tools\/gen\//, ["guards"], "generators"],
  [/^tools\//, ["guards"], "other tools: structural"],
  [/^docs\/|^\.claude\/|^\.cursor\/|^\.codex\/|\.md$/, ["guards"], "prose: docs-guards / structural"],
  [/^tests\/helpers\//, ["guards", "vm-a", "vm-b", "vm-page"], "helpers feed many twins"],
  [/^tests\/specs\/physics-characterization\.spec\.js$/, ["driving-model"], "the characterization job"],
  [/^tests\/specs\//, ["guards"], "browser specs: selected job covers them; guards for taxonomy"],
  [/^tests\/data\//, ["guards"], "ratchets / timings / baselines"],
  [/^tests\/groups\.json$/, ["guards"], "group membership is a structural contract"],
  // Unit files: owned by testFileOwners when in a CI slice; otherwise classified
  // in pick() as tooling-fast / sweeps / unmatched (fail-safe).
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

/**
 * @param {string[]} files
 * @param {{ owners?: Map<string, Set<string>> }} [opts]
 * @returns {{ slices: Map<string, Set<string>>, unmatched: string[], reason: string }}
 */
/** Unit files that live only in tooling-fast / sweeps — not a CI node slice. */
export function classifyUnitFile(f, owners, groupsJson = null) {
  if (owners.has(f)) return { kind: "slice", slices: [...owners.get(f)] };
  const g = groupsJson || JSON.parse(fs.readFileSync(path.join(ROOT, "tests/groups.json"), "utf8"));
  const sweepsFiles = new Set(g.groups?.["test:sweeps"]?.files || []);
  const sweepsParts = new Set(g.groups?.["test:sweeps-parts"]?.files || []);
  if (sweepsFiles.has(f) || sweepsParts.has(f)) {
    return { kind: "sweeps", slices: ["guards"] }; // sweeps job is separate; guards for taxonomy
  }
  const tf = new Set(g.toolingFast?.filter((x) => typeof x === "string" && !x.startsWith("//")) || []);
  // tooling-fast.mjs regenerates from groups.json — also accept TOOLING_FAST_FILES via import if needed
  if (tf.has(f)) return { kind: "tooling-fast", slices: ["guards"] };
  // A brand-new tests/unit file is not yet in any slice — the slices cannot
  // catch what they do not run. Guards (taxonomy / coverage audit) own it;
  // fail-safing to vm-a..driving-model was the bug that zeroed scenery savings
  // in the 2026-09-29 replay (bahrain-grandstand-rake.test.mjs on PRs that
  // had just added it to groups.json).
  return { kind: "unit-new", slices: ["guards"] };
}

export function pick(files, opts = {}) {
  const owners = opts.owners || testFileOwners();
  const groupsJson = opts.groupsJson || null;
  const slices = new Map(); // slice -> reasons
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
      if (gs.length === 0) continue; // placeholder
      if (!re.test(f)) continue;
      hit = true;
      for (const g of gs) add(g, why || f);
    }

    // Fleet geometry ERE catch-all (TRACK_VM extras outside js/track|circuits)
    if (GEOMETRY_PATHS.test(f)) {
      hit = true;
      add("guards", "geometry-paths fleet input");
      add("vm-a", "geometry-paths fleet input");
    }

    if (!hit) unmatched.push(f);
  }

  // Fail-safe: any unmatched path → every slice
  if (unmatched.length) {
    for (const s of SLICES) add(s, `unmatched: ${unmatched.join(", ")}`);
  }

  // Empty diff → nothing (caller may still run guards on push; we report empty)
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

function main(argv = process.argv.slice(2)) {
  const files = changedFiles(argv);
  const result = pick(files);
  const selected = [...result.slices.keys()].sort(
    (a, b) => SLICES.indexOf(a) - SLICES.indexOf(b));
  const skipped = SLICES.filter((s) => !result.slices.has(s));
  const c = costs(result.slices);

  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      reason: result.reason,
      files,
      unmatched: result.unmatched,
      slices: selected.map((s) => ({
        slice: s,
        because: [...(result.slices.get(s) || [])].join("; "),
      })),
      skipped,
      costs: c,
    }, null, 2));
    return;
  }

  if (!files.length) {
    console.log("nothing changed — no node slices selected");
    return;
  }
  console.log(`reason: ${result.reason}`);
  console.log(`files (${files.length}): ${files.slice(0, 8).join(", ")}${files.length > 8 ? "…" : ""}`);
  console.log(`\nrun:  ${selected.join(", ") || "(none)"}`);
  console.log(`skip: ${skipped.join(", ") || "(none)"}`);
  if (argv.includes("--costs") || true) {
    console.log(`\nestimated runner-min (p50): selected ${(c.selected_sec / 60).toFixed(1)} / all ${(c.all_sec / 60).toFixed(1)}  (save ~${c.saved_min} min)`);
  }
  if (result.unmatched.length) {
    console.log(`\nfail-safe unmatched: ${result.unmatched.join(", ")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
