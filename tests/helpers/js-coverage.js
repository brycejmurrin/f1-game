// @ts-check
/* js-coverage.js — opt-in V8 JS coverage for the browser half of the suite.
 *
 *   APEX_JS_COVERAGE=1 node tools/ci/test-bg.mjs tiny
 *
 * OFF BY DEFAULT and inert when off: `COVERAGE` is false, both functions
 * return at once, and nothing under artifacts/coverage* is created. An
 * ordinary run must not pay the CDP round-trips or grow the working tree, and
 * a coverage failure must never turn a green test red — every write here is
 * try/caught and reported through the returned string, not thrown.
 *
 * WHAT IS WRITTEN. One raw V8 script-coverage list per (worker, test) — the
 * exact array Playwright's `page.coverage.stopJSCoverage()` returns, source
 * included — to artifacts/coverage-<port>/<file>.json. The node half of the
 * suite writes the same format through NODE_V8_COVERAGE (tools/lib/game-vm.cjs
 * names its scripts by absolute path so they count). tools/ci/coverage-merge.mjs
 * folds both halves into one lcov + html report; tests/helpers/live-reporter.js
 * calls it at the end of a flagged run.
 *
 * `resetOnNavigation: false` because a spec that `goto("/")`s twice (reload
 * tests) would otherwise hand back only the second page's execution.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COVERAGE = process.env.APEX_JS_COVERAGE === "1";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = String(Number(process.env.APEX_PORT || 3456));
/** Where a flagged run writes its raw V8 lists. Port-suffixed, like every
 *  other per-run output, so two runs never clobber each other. */
export const COVERAGE_DIR = path.join(ROOT, "artifacts", `coverage-${PORT}`);

/** Start collecting on `page`. No-op unless APEX_JS_COVERAGE=1. */
export async function startCoverage(page) {
  if (!COVERAGE) return false;
  try {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    return true;
  } catch (_) {
    return false; // not Chromium, or the page is already collecting
  }
}

/** Stop collecting on `page` and write the raw list under `label`. Returns the
 *  written path, or a one-line reason when nothing was written. */
export async function stopCoverage(page, label) {
  if (!COVERAGE) return "coverage off";
  let list;
  try {
    list = await page.coverage.stopJSCoverage();
  } catch (e) {
    return `coverage not collected (${(e && e.message) || e})`;
  }
  const kept = list.filter((e) => /\/(js|css)\//.test(e.url) && !/\/tests\//.test(e.url));
  if (!kept.length) return "coverage empty (no game script executed)";
  try {
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    const name = `${String(label).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120)}.json`;
    const file = path.join(COVERAGE_DIR, name);
    fs.writeFileSync(file, JSON.stringify(kept));
    return file;
  } catch (e) {
    return `coverage not written (${(e && e.message) || e})`;
  }
}
