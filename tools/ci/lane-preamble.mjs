#!/usr/bin/env node
// lane-preamble.mjs — the TOOLING block for a UI-survey launch prompt: exact commands, names checked, no exploring.
// @doc Prints the TOOLING block for a UI-survey launch prompt: exact audit commands with names checked against the catalog.
// @skill agent-fleet
//
// Why: measured 2026-10-20 on nine live Cursor runs, survey agents spent their first minutes reading code and the 39,000-
// character survey SKILL.md (one agent read it five times) to find which script to run, then wrote throwaway `node -e`
// summarizers that printed 64,000 characters. Reads were 57% of stored result characters; `lsp_outline` (a module's shape
// without reading it) was called 3 times against 148 `read_file` calls. This prints a short block to paste into the launch
// prompt so the agent starts at the command, with the screens and viewports already validated against layout-audit's own
// catalog (a typo here costs a second; in a run it costs the whole grid).
//
//   node tools/ci/lane-preamble.mjs --screens=title,settings --viewports=ios-iphone-portrait,desktop-1440x900
//   node tools/ci/lane-preamble.mjs --screens=garage --viewports=ios-* --scale=100,200   # wildcards like layout-audit
//   node tools/ci/lane-preamble.mjs --list                         # the catalog it validates against
//
// Prints the block on stdout; a bad name prints `ERROR …` with the nearest valid one and exits 2.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Parse `layout-audit --list`: `screens: a, b, …` and one `  viewport  description` line per viewport. */
export function parseCatalog(text) {
  const lines = text.split("\n");
  const screensLine = lines.find((l) => l.startsWith("screens:"));
  const screens = screensLine ? screensLine.slice(8).split(",").map((s) => s.trim()).filter(Boolean) : [];
  const at = lines.findIndex((l) => l.startsWith("viewports:"));
  const viewports = [];
  for (const l of at >= 0 ? lines.slice(at + 1) : []) {
    const m = /^ {2}(\S+)\s+\S/.exec(l);
    if (m) viewports.push(m[1]);
    else if (l.trim() && !l.startsWith(" ")) break;
  }
  return { screens, viewports };
}

function catalog() {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ui/layout-audit.mjs"), "--list"], { encoding: "utf8", cwd: ROOT, timeout: 30000 });
  if (r.status !== 0) throw new Error(`layout-audit --list failed (exit ${r.status})`);
  const c = parseCatalog(r.stdout);
  if (!c.screens.length || !c.viewports.length) throw new Error("could not read the screen / viewport catalog from layout-audit --list");
  return c;
}

const near = (name, list) => {
  const lo = String(name).toLowerCase();
  return list.find((x) => x.toLowerCase().startsWith(lo.slice(0, 4))) || list.find((x) => x.toLowerCase().includes(lo.slice(0, 3)));
};

/** Names must each match a catalog entry, exactly or by a `prefix*` wildcard (as layout-audit does); returns the list as given. */
export function checkNames(kind, csv, list) {
  const names = String(csv || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length) throw new Error(`--${kind}s is required (comma list; wildcards like ios-* are allowed)`);
  for (const n of names) {
    const ok = n.endsWith("*") ? list.some((x) => x.startsWith(n.slice(0, -1))) : list.includes(n);
    if (!ok) {
      const hint = near(n.replace(/\*$/, ""), list);
      throw new Error(`unknown ${kind} ${JSON.stringify(n)}${hint ? `; did you mean ${hint}?` : ""} (--list shows all ${list.length})`);
    }
  }
  return names;
}

/** The block. `scale` is layout-audit's UI-scale axis (default 100). */
export function buildPreamble({ screens, viewports, scale = "100" }) {
  const sc = String(scale).split(",").map((s) => s.trim());
  if (!sc.every((s) => /^\d{2,3}$/.test(s))) throw new Error(`--scale must be a comma list of percentages like 100,200 (got ${JSON.stringify(scale)})`);
  const cells = "the cells you run";
  return [
    "TOOLING (pre-written: start here; do not read the survey SKILL.md or write your own audit scripts)",
    `1. Audit ${cells}: node tools/ui/layout-audit.mjs --screens=${screens.join(",")} --viewports=${viewports.join(",")} --scale=${sc.join(",")} > artifacts/layout-audit/run.log 2>&1; tail -n 3 artifacts/layout-audit/run.log`,
    "   Never pipe the full run into your context (no `| tee`, no `cat`): it prints one line per cell.",
    "2. Read the result, bounded: node tools/ui/audit-summary.mjs --top 12 ; one cell in full: node tools/ui/audit-summary.mjs --cell <screen>@<viewport>",
    "   The geometry run merges into artifacts/layout-audit/audit.json, so add --screen / --viewport to look only at what you ran. SKIPPED cells measured nothing: re-run each alone, do not count them as findings.",
    "3. Code: before reading a js/ file, call lsp_outline {file} for its shape and lsp_symbols {query} to find a symbol (there is no lsp_workspace_symbols); then read_file with offset and limit, not the whole file.",
    "4. Output you must read goes to a file first and is summarized (head, tail, a summary mode); a result over a few thousand characters belongs in a file, not in the conversation.",
  ].join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  const cat = catalog();
  if (argv.includes("--list")) {
    console.log(`screens: ${cat.screens.join(", ")}\nviewports: ${cat.viewports.join(", ")}`);
    return;
  }
  const screens = checkNames("screen", arg("--screens"), cat.screens);
  const viewports = checkNames("viewport", arg("--viewports"), cat.viewports);
  console.log(buildPreamble({ screens, viewports, scale: arg("--scale") || "100" }));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.log(`ERROR ${e.message}`);
    process.exit(2);
  }
}
