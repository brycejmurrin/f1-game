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
 *   node tools/gen/ensure-built.mjs --list    # the built paths, one per line
 * Exit 1 when a generator throws (a circuit def that no longer evaluates).
 */
import path from "node:path";
import { ROOT, isMain, argGate, ensureFile } from "./gen-lib.mjs";
import { BUILT_PATHS } from "../lib/generated-paths.mjs";
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
  const gated = argGate(argv, { allowed: ["--quiet", "--list"] });
  if (gated !== null) process.exit(gated);
  if (argv.includes("--list")) {
    for (const p of BUILT_PATHS) console.log(p);
    process.exit(0);
  }
  let rows;
  try {
    rows = ensureBuilt();
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
