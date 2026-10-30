#!/usr/bin/env node
// @doc UI interaction flows (844x390 touch): doors, double-tap, focus, Escape, Back, persist, search, rotate, D-pad; --diff.
// @skill ui-menu-a11y
// The 2026-10-29 hunt's probes (docs/notes/UI-HUNT-FLOWS-2026-10-29.md) as one repeatable matrix — gap G3 of
// docs/notes/UI-LAYOUT-PROGRAM-2026-10-30.md. Pure parts: ./flows/core.mjs; browser parts: ./flows/probes.mjs.
// Parent-only (a subagent's Chromium is refused): --help and --list never launch a browser.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CliArgError } from "../lib/cli-args.mjs";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { chromiumArgsForBackend } from "../shot/probe-page.mjs";
import {
  USAGE, parseOptions, listText, loadDeferral, deferral, classifyDoor, classifyFocus, classifyDoubletap, classifyEscape,
  classifyBack, classifyPersist, classifySearch, classifyRotate, classifyDpad, pageErrorRow, row, summarize, toMarkdown,
  diffRows, formatDiff, environmentMismatch, readReport, pacificStamp, ROTATE_SCREENS, DPAD_SCREENS,
} from "./flows/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Run the requested checks; doors and focus share one walk. Returns rows. */
async function runChecks(env, opts, log) {
  const P = await import("./flows/probes.mjs");
  const rows = [];
  const push = (check, res, classify) => {
    const evs = Array.isArray(res.evidence) ? res.evidence : [res.evidence];
    for (const ev of evs) rows.push(classify(ev));
    const pe = pageErrorRow(check, res.errors); if (pe) rows.push(pe);
  };
  const want = new Set(opts.checks);
  if (want.has("doors") || want.has("focus")) {
    log("doors/focus …");
    const res = await P.probeDoors(env, opts.doors);
    if (want.has("doors")) push("doors", res, classifyDoor);
    if (want.has("focus")) push("focus", { evidence: res.evidence, errors: want.has("doors") ? [] : res.errors }, classifyFocus);
  }
  if (want.has("doubletap")) { log("doubletap …"); push("doubletap", await P.probeDoubletap(env, opts.doors), classifyDoubletap); }
  if (want.has("escape")) { log("escape …"); push("escape", await P.probeEscape(env), classifyEscape); }
  if (want.has("back")) { log("back …"); push("back", await P.probeBack(env), classifyBack); }
  if (want.has("persist")) {
    log("persist …");
    const res = await P.probePersist(env);
    push("persist", { evidence: res.evidence.rows, errors: res.errors }, classifyPersist);
    for (const e of res.evidence.errors) rows.push(row("persist", "(probe)", "fail", e));
    if (!res.evidence.rows.length) rows.push(row("persist", "(probe)", "fail", "no Settings row changed: nothing was measured"));
  }
  if (want.has("search")) { log("search …"); push("search", await P.probeSearch(env), classifySearch); }
  if (want.has("rotate")) { log("rotate …"); push("rotate", await P.probeRotate(env, ROTATE_SCREENS), classifyRotate); }
  if (want.has("dpad")) { log("dpad …"); push("dpad", await P.probeDpad(env, DPAD_SCREENS), classifyDpad); }
  return rows;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseOptions(argv, { root: ROOT }); }
  catch (e) { if (e instanceof CliArgError) { console.error(`${e.message}\n\n${USAGE}`); return 2; } throw e; }
  if (opts.help) { console.log(USAGE); return 0; }
  if (opts.list) { console.log(listText()); return 0; }
  const old = opts.diff ? readReport(JSON.parse(fs.readFileSync(opts.diff, "utf8"))) : null;
  const busy = loadDeferral(os.loadavg()[0]); if (busy) throw busy;
  const { acquireLock, releaseLock } = await import("../mcp/apex-tools-mcp.mjs");
  const refused = acquireLock("ui-flows"); if (refused) throw deferral(`Browser occupied: ${JSON.stringify(refused)}`);
  const log = (m) => console.error(`[flows] ${m}`);
  let browser;
  try {
    const server = await startStaticServer(ROOT);
    browser = await launchChromium({ args: chromiumArgsForBackend("three") });
    let sha = "unknown"; try { sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { /* metadata only */ }
    let dirty = null; try { dirty = execFileSync("git", ["status", "--porcelain", "--", "js", "css", "index.html"], { cwd: ROOT, encoding: "utf8" }).trim() !== ""; } catch { /* metadata only */ }
    const env = { browser, url: server.url, touch: opts.touch, viewport: opts.viewport };
    const started = Date.now();
    const rows = await runChecks(env, opts, log);
    const report = {
      environment: { viewport: opts.viewport, touch: opts.touch, sha, dirtySource: dirty, date: pacificStamp(), checks: opts.checks, doors: opts.doors,
        browser: browser.version(), backend: "three", node: process.version, seconds: Math.round((Date.now() - started) / 1000) },
      summary: summarize(rows), rows,
    };
    fs.mkdirSync(opts.outDir, { recursive: true });
    fs.writeFileSync(path.join(opts.outDir, "flows.json"), JSON.stringify(report, null, 1));
    const md = toMarkdown(report);
    fs.writeFileSync(path.join(opts.outDir, "flows.md"), md);
    console.log(md);
    console.log(`wrote ${path.relative(ROOT, path.join(opts.outDir, "flows.json"))} and flows.md`);
    if (old) {
      const mismatch = environmentMismatch(old.environment, report.environment);
      if (mismatch.length) console.log(`diff WARNING: different rig (${mismatch.join("; ")})`);
      const d = diffRows(old.rows, rows);
      console.log(formatDiff(d));
      return d.regressions.length ? 1 : 0;
    }
    return report.summary.fail ? 1 : 0;
  } finally { if (browser) await browser.close().catch(() => {}); await shutdown(); releaseLock(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((e) => { console.error(e.message); process.exitCode = e.exitCode || 1; });
}
