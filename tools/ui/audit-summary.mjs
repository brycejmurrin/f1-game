#!/usr/bin/env node
// audit-summary.mjs — a bounded summary of a layout-audit run (audit.json): worst cells first, never the whole grid.
// @doc Bounded summary of a layout-audit audit.json: totals, worst cells, per-screen rollup, one cell expanded on request.
// @skill survey-ui-matrix
//
// Why: a survey agent that wanted the worst cells of a 240-cell grid wrote its own `node -e` over audit.json and printed
// 64,000 characters, after piping the runner's one-line-per-cell log (42,000 characters) through `tee` into its context
// (measured 2026-10-20 on nine live Cursor runs). Run the audit with its output redirected, then read THIS:
//
//   node tools/ui/layout-audit.mjs --screens=… --viewports=… --out=artifacts/x > artifacts/x/run.log 2>&1; tail -n 3 artifacts/x/run.log
//   node tools/ui/audit-summary.mjs artifacts/x                    # totals, top 12 cells, per-screen rollup
//   node tools/ui/audit-summary.mjs artifacts/x --top 30 --screen settings --viewport iphone
//   node tools/ui/audit-summary.mjs artifacts/x --cell title@ios-iphone-portrait    # that one cell's findings, capped
//   node tools/ui/audit-summary.mjs artifacts/x --json             # the same summary as one JSON object
//
// It uses layout-audit's own definitions: "bad" = clipped, offscreen, document x-overflow, errors, tiny taps, under the
// hardware inset or starved; a SKIPPED cell is counted apart (nothing was measured, so it is neither a pass nor a finding);
// deepScroll is amber and tallied apart from the red count. Exit 0 always for a readable file (the verdict is in the
// text), 2 for a bad argument or a missing file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HARD = ["clipped", "offscreen", "tinyTaps", "underHardware", "starved", "errors"];
const SOFT = ["smallTaps", "truncated", "deepScroll"];
const LABEL = { clipped: "clipped", offscreen: "offscreen", tinyTaps: "tapUnder24", underHardware: "underHW", starved: "starved", errors: "err", smallTaps: "tapSoft", truncated: "trunc", deepScroll: "deepScroll" };
const n = (a) => (Array.isArray(a) ? a.length : 0);

/** Red-count of one cell by layout-audit's definition (skipped cells are not scored). */
export function isBad(cell) {
  return !cell.skipped && (HARD.some((k) => n(cell[k])) || !!cell.docOverflowX);
}

/** A weight for ordering only: hard findings count 10 each, document overflow 15, soft findings 1. */
export function severity(cell) {
  if (cell.skipped) return 0;
  return HARD.reduce((s, k) => s + 10 * n(cell[k]), 0) + (cell.docOverflowX ? 15 : 0) + SOFT.reduce((s, k) => s + n(cell[k]), 0);
}

const squash = (s, w) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > w ? `${t.slice(0, w - 1)}…` : t;
};

/** One finding as a short string: `el` and the thing it collided with, or its text, whatever the entry carries. */
export function findingHead(f, w = 90) {
  if (typeof f === "string") return squash(f, w);
  if (!f || typeof f !== "object") return squash(f, w);
  const parts = [f.el, f.by && `by ${f.by}`, f.text && `"${f.text}"`, f.message, f.reason].filter(Boolean);
  return squash(parts.length ? parts.join(" ") : JSON.stringify(f), w);
}

function cellLine(c) {
  const bits = [...HARD, ...SOFT].filter((k) => n(c[k])).map((k) => `${LABEL[k]} ${n(c[k])}`);
  if (c.docOverflowX) bits.push("xOverflow");
  return `${c.screen} @ ${c.viewport}: ${bits.join(" ") || "clean"}`;
}

/**
 * Summarize a parsed audit.json. opts: top (default 12), screen / viewport (substring filters), cell ("screen@viewport").
 * Returns { lines, data }. `lines` is bounded: about 12 + 3 per listed cell + one per screen with a finding.
 */
export function summarize(audit, { top = 12, screen, viewport, cell } = {}) {
  const all = Array.isArray(audit.rows) ? audit.rows : [];
  if (cell) {
    const [s, v] = String(cell).split("@");
    const c = all.find((r) => r.screen === s && r.viewport === v);
    if (!c) return { lines: [`NOCELL ${cell} (not in this audit; ${all.length} cells)`], data: null };
    const lines = [`CELL ${cellLine(c)}${c.skipped ? ` SKIPPED: ${squash(c.skipped, 120)}` : ""}`];
    for (const k of [...HARD, ...SOFT]) {
      const a = c[k];
      if (!n(a)) continue;
      lines.push(`  ${LABEL[k]} (${a.length})`);
      // Identical heads collapse to a count: a real clipped list read `g by #title-car` five times over.
      const groups = [];
      for (const f of a) {
        const h = findingHead(f);
        const g = groups.find((x) => x.h === h);
        if (g) g.n++;
        else groups.push({ h, n: 1 });
      }
      for (const g of groups.slice(0, 8)) lines.push(`    ${g.h}${g.n > 1 ? ` ×${g.n}` : ""}`);
      if (groups.length > 8) lines.push(`    … ${groups.length - 8} more kinds (${a.length - groups.slice(0, 8).reduce((t, g) => t + g.n, 0)} findings)`);
    }
    if (c.docOverflowX) lines.push("  document overflows horizontally");
    return { lines, data: c };
  }
  const rows = all.filter((r) => (!screen || String(r.screen).includes(screen)) && (!viewport || String(r.viewport).includes(viewport)));
  const skipped = rows.filter((r) => r.skipped);
  const bad = rows.filter(isBad);
  const deep = rows.filter((r) => !r.skipped && n(r.deepScroll));
  const lines = [
    `AUDIT cells=${rows.length}${rows.length !== all.length ? ` (of ${all.length})` : ""} bad=${bad.length} skipped=${skipped.length} deepScroll=${deep.length}${audit.build ? ` build=${audit.build}` : ""}`,
  ];
  if (!rows.length) lines.push("NOCELLS the filters matched nothing");
  const totals = [...HARD, ...SOFT].map((k) => [k, rows.reduce((s, r) => s + (r.skipped ? 0 : n(r[k])), 0)]).filter(([, v]) => v);
  const xo = rows.filter((r) => !r.skipped && r.docOverflowX).length;
  if (totals.length || xo) lines.push(`TOTALS ${totals.map(([k, v]) => `${LABEL[k]} ${v}`).join(" ")}${xo ? ` xOverflowCells ${xo}` : ""}`);
  if (skipped.length) {
    lines.push(`SKIPPED ${skipped.length} (nothing measured: re-run each alone, not a finding)`);
    for (const r of skipped.slice(0, 3)) lines.push(`  ${r.screen} @ ${r.viewport}: ${squash(r.skipped, 100)}`);
    if (skipped.length > 3) lines.push(`  … ${skipped.length - 3} more`);
  }
  const worst = rows.filter((r) => severity(r) > 0).sort((a, b) => severity(b) - severity(a) || String(a.screen).localeCompare(String(b.screen))).slice(0, top);
  for (const r of worst) {
    lines.push(`CELL ${cellLine(r)}`);
    const first = [...HARD, ...SOFT].flatMap((k) => (r[k] || []).slice(0, 1).map((f) => `${LABEL[k]}: ${findingHead(f, 80)}`)).slice(0, 2);
    for (const f of first) lines.push(`    ${f}`);
  }
  const listed = rows.filter((r) => severity(r) > 0).length;
  if (listed > worst.length) lines.push(`… ${listed - worst.length} more cells with findings (--top N, or --screen / --viewport to narrow)`);
  const per = {};
  for (const r of bad) per[r.screen] = (per[r.screen] || 0) + 1;
  const roll = Object.entries(per).sort((a, b) => b[1] - a[1]);
  if (roll.length) lines.push(`BYSCREEN ${roll.slice(0, 12).map(([s, c]) => `${s} ${c}`).join(", ")}${roll.length > 12 ? `, … ${roll.length - 12} more` : ""}`);
  if (!bad.length && rows.length && !skipped.length) lines.push("CLEAN no cell has a red finding");
  return { lines, data: { cells: rows.length, bad: bad.length, skipped: skipped.length, deepScroll: deep.length, totals: Object.fromEntries(totals), worst: worst.map((r) => ({ screen: r.screen, viewport: r.viewport, severity: severity(r) })) } };
}

/** audit.json from a file, or a directory that holds one. */
export function readAudit(p) {
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "audit.json") : p;
  if (!fs.existsSync(file)) throw new Error(`no audit.json at ${p}`);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
  if (!Array.isArray(j.rows)) throw new Error(`${file} has no rows array (not a layout-audit audit.json)`);
  return j;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name, d) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : d;
  };
  const target = argv.find((a, i) => !a.startsWith("--") && !["--top", "--screen", "--viewport", "--cell"].includes(argv[i - 1]));
  if (!target) throw new Error("usage: audit-summary.mjs <audit dir | audit.json> [--top N] [--screen S] [--viewport V] [--cell screen@viewport] [--json]");
  const top = Number(flag("--top", 12));
  if (!Number.isInteger(top) || top < 1 || top > 200) throw new Error("--top must be 1..200");
  const r = summarize(readAudit(target), { top, screen: flag("--screen"), viewport: flag("--viewport"), cell: flag("--cell") });
  console.log(argv.includes("--json") ? JSON.stringify({ lines: r.lines, ...(r.data ? { data: r.data } : {}) }) : r.lines.join("\n"));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.log(`ERROR ${e.message}`);
    process.exit(2);
  }
}
