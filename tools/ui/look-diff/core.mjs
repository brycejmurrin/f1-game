// look-diff/core.mjs — the browser-free half of tools/ui/look-diff.mjs.
// @doc Library for look-diff: knob catalog read in a vm, args, pixel/geometry diff, DEAD/SUBTLE/VISIBLE classes.
// @skill css-play
//
// Everything here is pure (or reads source files only) so tests/unit/ui-look-diff.test.mjs
// can pin it without a browser. The CLI owns Chromium, sharp and the file writes.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { CliArgError, makeFlags } from "../../lib/cli-args.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** ScreenLooks id (or `title`) -> the menu-screens.mjs SCREENS id whose open()
 *  reaches it through the app's own route. `title` carries only TitleLayout. */
export const ROUTES = Object.freeze({
  pause: "pause", datahub: "datahub", select: "select", race: "racesettings",
  career: "career", garage: "garage", designer: "trackdesigner", popups: "standings", title: "title",
});

/** Diff % at or above this is VISIBLE; below it (and over --threshold, or moved) SUBTLE. */
export const VISIBLE_PCT = 3;
/** A channel delta at or under this is antialiasing/dither noise, not a change. */
export const CHANNEL_TOL = 16;
/** A box edge that moved less than this (CSS px) did not move. */
export const GEOM_TOL = 1;

const LOOK_SOURCES = ["js/ui/screen-looks.js", "js/ui/pause-opts.js", "js/ui/title-layout.js"];

/** Read the three modules' registries in a node vm (no DOM: every one of them
 *  guards `document`), so --list and the tests see the SHIPPED knob tables,
 *  not a copy that can drift. */
export function loadLookModules(root = ROOT) {
  const store = { get: (_k, d) => d, set() {} };
  const ctx = vm.createContext({ GameStore: { store }, Log: { warn() {}, info() {}, error() {} } });
  for (const f of LOOK_SOURCES) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: path.join(root, f) });
  return vm.runInContext("({ ScreenLooks, PauseOpts, TitleLayout })", ctx);
}

const plainKnob = (n) => n.kind === "range"
  ? { k: n.k, label: n.label, kind: "range", min: n.min, max: n.max, step: n.step, def: n.def }
  : { k: n.k, label: n.label, kind: "cycle", values: n.values.map(([id]) => id), def: n.def };

/** The catalog: one entry per screen, each knob tagged with its `src` setter family.
 *  look   -> ScreenLooks.set(screen, k, v) / ScreenLooks.reset(screen)
 *  pause  -> PauseOpts.set<Layout|Side|Dim>(v)
 *  title  -> TitleLayout.set({...current, [k]: v}) / TitleLayout.reset() */
export function buildCatalog(mods = loadLookModules()) {
  const { ScreenLooks, PauseOpts, TitleLayout } = mods;
  const out = [];
  for (const s of ScreenLooks.SCREENS) {
    const knobs = s.knobs.map((n) => ({ ...plainKnob(n), src: "look" }));
    if (s.id === "pause") {
      knobs.push({ k: "layout", label: "PAUSE LAYOUT", kind: "cycle", values: PauseOpts.LAYOUTS.map(([id]) => id), def: "grid", src: "pause" });
      knobs.push({ k: "side", label: "PAUSE SIDE", kind: "cycle", values: PauseOpts.SIDES.map(([id]) => id), def: "centre", src: "pause" });
      knobs.push({ k: "dim", label: "PAUSE DIM", kind: "cycle", values: PauseOpts.DIMS.map(([id]) => id), def: "full", src: "pause" });
    }
    out.push({ id: s.id, title: s.title, route: ROUTES[s.id] || null, knobs });
  }
  out.push({ id: "title", title: "TITLE SCREEN", route: ROUTES.title, knobs: [
    { k: "layout", label: "TITLE LAYOUT", kind: "cycle", values: TitleLayout.LAYOUTS.map(([id]) => id), def: TitleLayout.DEFAULT.layout, src: "title" },
    { k: "side", label: "TITLE SIDE", kind: "cycle", values: TitleLayout.SIDES.map(([id]) => id), def: TitleLayout.DEFAULT.side, src: "title" },
  ] });
  // A knob id can repeat across families on one screen (pause: look `w` vs pause `layout`
  // never collide today, but `dim` could): key = src-prefixed when not `look`.
  for (const s of out) for (const n of s.knobs) n.key = n.src === "look" ? n.k : `${n.src}.${n.k}`;
  // Arrays built from the vm's registries belong to the vm realm; hand back plain data.
  return JSON.parse(JSON.stringify(out));
}

/** Values to test for one knob: every non-default cycle value; a range's min and max. */
export function knobValues(n) {
  if (n.kind === "cycle") return n.values.filter((v) => v !== n.def);
  return [...new Set([n.min, n.max])].filter((v) => v !== n.def);
}

export const USAGE = `look-diff — does every customization knob value change the picture?

  node tools/ui/look-diff.mjs [--screens=select,career,...] [--knobs=density,corners,...]
      [--viewport=844x390] [--touch] [--out=artifacts/look-diff] [--threshold=0.5] [--list] [--help]

  For each screen (ScreenLooks ids + title): open it through the app's own route
  (tools/ui/menu-screens.mjs), hide #game, screenshot the default, then every knob x value
  (cycle: each non-default value; range: min and max), pixel-diff against the default and
  record root + first-level-child box deltas. DEAD = diff < threshold % and nothing moved;
  SUBTLE = under ${VISIBLE_PCT} %; VISIBLE = ${VISIBLE_PCT} % or more.
  --knobs matches a knob id (density) or a family key (pause.layout, title.side).
  --touch uses the iPhone landscape profile (Bryce's setup); default is Desktop Chrome.
  Writes report.json, report.md and index.html (contact sheet, relative image paths).
  Exit 0 measured, 1 a capture failed, 2 usage, 75 load average >= 3 (try later).`;

const KNOWN = ["--screens", "--knobs", "--viewport", "--touch", "--out", "--threshold", "--list", "--help"];

/** argv -> options. Throws CliArgError on a bad value (the CLI turns it into exit 2). */
export function parseArgs(argv, catalog = null) {
  const f = makeFlags(argv, KNOWN);
  const vp = f.flag("--viewport", "844x390");
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(vp);
  if (!m) throw new CliArgError(`--viewport must be WxH (e.g. 844x390), got ${vp}`);
  const threshold = Number(f.flag("--threshold", "0.5"));
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new CliArgError("--threshold is a percent in 0..100");
  const out = f.flag("--out", "artifacts/look-diff");
  const abs = path.resolve(ROOT, out);
  const rel = path.relative(ROOT, abs);
  const inside = !(rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel));
  if (inside && !/^(artifacts|scratch)([\\/]|$)/.test(rel)) throw new CliArgError("--out inside the repo must be under artifacts/ or scratch/");
  const screens = f.list("--screens", "");
  const knobs = f.list("--knobs", "");
  if (catalog) {
    const ids = catalog.map((s) => s.id);
    const bad = screens.filter((s) => !ids.includes(s));
    if (bad.length) throw new CliArgError(`unknown screen ${bad.join(",")} — one of ${ids.join(",")}`);
    const allKeys = new Set(catalog.flatMap((s) => s.knobs.flatMap((n) => [n.k, n.key])));
    const badK = knobs.filter((k) => !allKeys.has(k));
    if (badK.length) throw new CliArgError(`unknown knob ${badK.join(",")} — see --list`);
  }
  return { screens, knobs, viewport: { width: +m[1], height: +m[2] }, touch: f.has("--touch"),
    outDir: abs, threshold, list: f.has("--list"), help: f.has("--help") || argv.includes("-h") };
}

/** The (screen, knob, value) plan the browser walks, after --screens / --knobs. */
export function planCells(catalog, { screens = [], knobs = [] } = {}) {
  const plan = [];
  for (const s of catalog) {
    if (screens.length && !screens.includes(s.id)) continue;
    const ks = s.knobs.filter((n) => !knobs.length || knobs.includes(n.k) || knobs.includes(n.key));
    if (!ks.length) continue;
    plan.push({ id: s.id, title: s.title, route: s.route, knobs: ks.map((n) => ({ ...n, test: knobValues(n) })) });
  }
  return plan;
}

/** Two equal-sized RGBA/RGB rasters -> changed pixels, % and the changed bounding box.
 *  Different sizes compare over the larger box; the non-overlap counts as changed. */
export function diffRaw(a, b, { tol = CHANNEL_TOL } = {}) {
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  let changed = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let diff;
      if (x >= a.width || y >= a.height || x >= b.width || y >= b.height) diff = true;
      else {
        const ia = (y * a.width + x) * a.channels, ib = (y * b.width + x) * b.channels;
        diff = false;
        for (let c = 0; c < 3; c++) if (Math.abs(a.data[ia + c] - b.data[ib + c]) > tol) { diff = true; break; }
      }
      if (diff) {
        changed++;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
  }
  const total = w * h;
  return { changed, total, pct: total ? Math.round((changed / total) * 1e4) / 100 : 0,
    box: changed ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

/** Boxes keyed by `key` (root first, then first-level children) -> what moved. */
export function geometryDelta(before = [], after = [], tol = GEOM_TOL) {
  const byKey = new Map(after.map((b) => [b.key, b]));
  const moved = [];
  for (const a of before) {
    const b = byKey.get(a.key);
    if (!b) { moved.push({ key: a.key, gone: true }); continue; }
    byKey.delete(a.key);
    const d = { dx: b.x - a.x, dy: b.y - a.y, dw: b.w - a.w, dh: b.h - a.h };
    if (Object.values(d).some((v) => Math.abs(v) >= tol)) moved.push({ key: a.key, ...d });
  }
  for (const b of byKey.values()) moved.push({ key: b.key, appeared: true });
  return { changed: moved.length > 0, moved };
}

/** DEAD / SUBTLE / VISIBLE (see USAGE). `noisePct` is the default-vs-default floor:
 *  a diff inside it is not evidence of a change. */
export function classify({ pct, geometryChanged, threshold = 0.5, noisePct = 0 }) {
  const signal = Math.max(0, pct - noisePct);
  if (signal < threshold && !geometryChanged) return "DEAD";
  if (signal < VISIBLE_PCT) return "SUBTLE";
  return "VISIBLE";
}

/** Union of boxes padded by `pad`, clamped to the frame — the close-up crop for one knob row. */
export function cropBox(boxes, frame, pad = 24) {
  const live = boxes.filter(Boolean);
  if (!live.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of live) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(frame.width, x1 + pad); y1 = Math.min(frame.height, y1 + pad);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** A file-name-safe slug for a knob value (range numbers, cycle ids). */
export const slug = (s) => String(s).replace(/[^a-z0-9.-]+/gi, "_");

/** report rows -> per-class counts. */
export function tally(rows) {
  const t = { DEAD: 0, SUBTLE: 0, VISIBLE: 0, ERROR: 0 };
  for (const r of rows) t[r.class] = (t[r.class] || 0) + 1;
  return t;
}

/** report.md: one table per screen. */
export function renderMarkdown(report) {
  const lines = [`# look-diff — ${report.viewport.width}x${report.viewport.height}${report.touch ? " touch" : ""}`, "",
    `Generated ${report.generated}. Threshold ${report.threshold} %; VISIBLE at ${VISIBLE_PCT} %. Diff % is of the whole viewport; noise = default captured twice.`, ""];
  const t = tally(report.rows);
  lines.push(`Totals: ${t.VISIBLE} VISIBLE · ${t.SUBTLE} SUBTLE · ${t.DEAD} DEAD · ${t.ERROR} ERROR`, "");
  for (const s of report.screens) {
    lines.push(`## ${s.id} — ${s.title}`, "");
    if (s.error) { lines.push(`Screen not reached: ${s.error}`, ""); continue; }
    lines.push(`Noise floor ${s.noisePct} %.`, "", "| knob | value | diff % | moved | class |", "|---|---|---|---|---|");
    for (const r of report.rows.filter((x) => x.screen === s.id)) {
      const moved = r.geometry && r.geometry.changed ? r.geometry.moved.length + " box" + (r.geometry.moved.length > 1 ? "es" : "") : "—";
      lines.push(`| ${r.key} | ${r.value} | ${r.pct ?? "—"} | ${moved} | ${r.class}${r.error ? ` (${r.error})` : ""} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
