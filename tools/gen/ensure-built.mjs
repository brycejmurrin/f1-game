#!/usr/bin/env node
// @doc Builds missing or stale gitignored site outputs (BUILT_PATHS) for serve, test and deploy entries.
// @skill check-changes
/**
 * ensure-built.mjs — the one command that makes a checkout servable.
 *
 * BUILT, NOT COMMITTED (2026-10-28; Bryce: "Build at deploy"; staged design in
 * docs/notes/DEPLOY-TIME-GEN-2026-10-28.md). A generated file the site serves used
 * to be committed, so two PRs that each passed alone could leave the deploy tip
 * with a stale copy and fail `gen:check` for every PR behind them (2026-10-27).
 * Each path in BUILT_PATHS (tools/lib/generated-paths.mjs) is gitignored instead
 * and built from source here. Idempotent and ~0.1 s: it writes only what is
 * missing or stale, through a rename, so a reader never sees half a file.
 *
 * Who runs it: package.json `prepare` (npm install / npm ci), the SessionStart
 * hook, .githooks/post-checkout and post-merge, .github/actions/setup-apex (every
 * CI job), tools/env/cloud-agent-install.sh (Cursor), Playwright's global setup,
 * tooling-fast, test:guards, the harness static server (tools/shot, apex-tools
 * MCP) and debug-chrome. tools/desktop/stage.mjs calls buildInto() to render the
 * files into the staged site from source, never from a local copy.
 *
 *   node tools/gen/ensure-built.mjs           # one line per built file: fresh | built (missing) | rebuilt (stale)
 *   node tools/gen/ensure-built.mjs --quiet   # silent unless a generator fails (the git hooks)
 *   node tools/gen/ensure-built.mjs --list    # the built paths, one per line (on-demand ones tagged)
 *   node tools/gen/ensure-built.mjs --with tools/shot/scenery-locations.json   # also one ON_DEMAND_PATHS file
 *   node tools/gen/ensure-built.mjs --all     # BUILT_PATHS and every ON_DEMAND_PATHS file
 * Exit 1 when a generator throws (a circuit def that no longer evaluates); exit 2 for an unknown --with path.
 *
 * ON_DEMAND_PATHS (2026-11-11, issue #5427) are tools-only outputs too slow for every checkout (the scenery
 * catalog rebuilds every circuit, ~47 s). The default run leaves them alone; each reader calls `ensureOnDemand`
 * before it reads, so a fresh clone, a CI job or a new agent container builds the file the first time a reader
 * needs it and answers from its receipt after that. They are never staged into the site.
 */
import path from "node:path";
import { ROOT, isMain, argGate, ensureFile } from "./gen-lib.mjs";
import { createRequire } from "node:module";
import { BUILT_PATHS, ON_DEMAND_PATHS } from "../lib/generated-paths.mjs";
import * as circuitMeta from "./gen-circuit-meta.mjs";

/** BUILT_PATHS entry → the generator that renders it (sync, reads this checkout's sources). */
const RENDER = new Map([
  [circuitMeta.TARGET, circuitMeta.generate],
]);
for (const p of BUILT_PATHS) {
  if (!RENDER.has(p)) throw new Error(`ensure-built: ${p} is in BUILT_PATHS but no generator here renders it`);
}
for (const p of RENDER.keys()) {
  if (!BUILT_PATHS.includes(p)) throw new Error(`ensure-built: ${p} has a generator here but is not in BUILT_PATHS`);
}

/** ON_DEMAND_PATHS entry → (root) => "fresh" | "missing" | "stale"; each owns its own staleness receipt. */
const ON_DEMAND = new Map([
  ["tools/shot/scenery-locations.json", (root) => createRequire(import.meta.url)(path.join(root, "tools/shot/gen-scenery-locations.cjs")).ensureCatalog()],
]);
for (const p of ON_DEMAND_PATHS) {
  if (!ON_DEMAND.has(p)) throw new Error(`ensure-built: ${p} is in ON_DEMAND_PATHS but no generator here builds it`);
}
for (const p of ON_DEMAND.keys()) {
  if (!ON_DEMAND_PATHS.includes(p)) throw new Error(`ensure-built: ${p} has an on-demand builder here but is not in ON_DEMAND_PATHS`);
}

/**
 * Build one ON_DEMAND_PATHS file if it is missing, stale or hand-edited. A reader calls this right before it
 * reads the file; a generator that throws propagates (the reader fails loudly, it never reads an old copy).
 * @param {string} target repo-relative ON_DEMAND_PATHS entry
 * @param {{ root?: string }} [opts]
 * @returns {{ target: string, was: "fresh" | "missing" | "stale" }}
 */
export function ensureOnDemand(target, { root = ROOT } = {}) {
  const build = ON_DEMAND.get(target);
  if (!build) throw new Error(`ensure-built: ${target} is not in ON_DEMAND_PATHS (${ON_DEMAND_PATHS.join(", ")})`);
  return { target, was: build(path.resolve(root)) };
}

/**
 * Build every BUILT_PATHS file of the selected source checkout that is missing or stale.
 * @param {{ root?: string }} [opts] source and output checkout
 * @returns {{ target: string, was: "fresh" | "missing" | "stale" }[]}
 */
export function ensureBuilt({ root = ROOT } = {}) {
  root = path.resolve(root);
  return BUILT_PATHS.map((target) => ({ target, was: ensureFile(path.join(root, target), RENDER.get(target)({ root })) }));
}

/**
 * Render every BUILT_PATHS file from the selected checkout's sources into `dir` (a staged
 * site): the deploy ships what the commit's sources produce, whatever stale copy
 * the working tree may hold.
 * @param {string} dir absolute staged root
 * @param {{ root?: string }} [opts] source checkout (defaults to this module's checkout)
 * @returns {string[]} the targets written
 */
export function buildInto(dir, { root = ROOT } = {}) {
  for (const target of BUILT_PATHS) ensureFile(path.join(dir, target), RENDER.get(target)({ root }));
  return [...BUILT_PATHS];
}

/** One line naming what a call wrote, or "" when everything was fresh (runners print only real work). */
export function builtLine(rows) {
  const wrote = rows.filter((r) => r.was !== "fresh");
  if (!wrote.length) return "";
  return "ensure-built: " + wrote.map((r) => `${r.was === "missing" ? "built" : "rebuilt"} ${r.target} (${r.was})`).join("; ");
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const withPaths = argv.flatMap((a, i) => (a === "--with" ? [argv[i + 1]] : a.startsWith("--with=") ? [a.slice(7)] : []));
  const gated = argGate(argv.filter((a, i) => !(a === "--with" || argv[i - 1] === "--with" || a.startsWith("--with="))), { allowed: ["--quiet", "--list", "--all"] });
  if (gated !== null) process.exit(gated);
  if (argv.includes("--list")) {
    for (const p of BUILT_PATHS) console.log(p);
    for (const p of ON_DEMAND_PATHS) console.log(`${p} (on demand)`);
    process.exit(0);
  }
  for (const p of withPaths) {
    if (!ON_DEMAND_PATHS.includes(p)) {
      console.error(`ensure-built: --with ${p || "(nothing)"}: not an ON_DEMAND_PATHS file (${ON_DEMAND_PATHS.join(", ")})`);
      process.exit(2);
    }
  }
  const extra = argv.includes("--all") ? [...ON_DEMAND_PATHS] : withPaths;
  let rows;
  try {
    rows = [...ensureBuilt(), ...extra.map((t) => ensureOnDemand(t))];
  } catch (e) {
    console.error(`ensure-built: FAILED — ${e && e.message || e}`);
    process.exit(1);
  }
  if (!argv.includes("--quiet")) {
    for (const r of rows) {
      console.log(`ensure-built: ${r.target} ${r.was === "fresh" ? "fresh" : r.was === "missing" ? "built (missing)" : "rebuilt (stale)"}`);
    }
  }
}
