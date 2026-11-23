#!/usr/bin/env node
// reach-score.mjs — offline thumb-reach and dead-space score per menu screen, for a landscape phone held in two hands.
// @doc Offline two-thumb reach + dead-space score per menu screen from layout-audit DOM dumps or explorer inspections.
// @skill survey-ui-matrix
//
// No browser: it reads artifacts other tools already wrote (UI layout program gap G5,
// docs/notes/UI-LAYOUT-PROGRAM-2026-10-30.md).
//
//   node tools/ui/reach-score.mjs --help
//   node tools/ui/reach-score.mjs --in artifacts/layout-audit                 # audit.json + dom/*.dom.json
//   node tools/ui/reach-score.mjs --in artifacts/layout-audit/gallery         # manifest.json + dom/
//   node tools/ui/reach-score.mjs --in artifacts/explorer/inspection.json     # explorer inspection (or a replay's records[])
//   node tools/ui/reach-score.mjs --in X --out artifacts/ui-reach --viewport 844x390 --svg --json
//   node tools/ui/reach-score.mjs --in X --primary settings=#pm-done        # per-run primary override
//
// Output (default artifacts/ui-reach/): reach.json, reach.md (one row per screen×viewport) and, with --svg,
// svg/<screen>__<viewport>.svg overlaying ZONES on the control rects (for the design gallery).
//
// THE MODEL (ZONES below; fractions of the viewport, so it holds at any landscape phone size).
// A landscape phone held in two hands is gripped at the short edges; each thumb pivots from a bottom side corner.
// - Roblox Creator Hub, "Position and size UI objects" §Cross-platform factors (read 2026-10-30,
//   https://create.roblox.com/docs/ui/position-and-size): "most mobile players use two thumbs"; reaching far from
//   the bottom corners "becomes uncomfortable or impossible"; frequently used buttons belong near them.
// - Steven Hoober, "How Do Users Really Hold Mobile Devices?", UXmatters 2013-02-18
//   (https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php): 1,333 observations;
//   15 % used two thumbs; the thumb sweeps an arc from its grip point, so the far side of the screen is a stretch.
// - Hoober, "Design for Fingers, Touch, and People" Parts 1-3, UXmatters 2017 (index:
//   https://www.4ourthmobile.com/publications/articles-and-reports): touch is most accurate toward the centre and
//   edge targets need more room — so the centre is OK (accurate, but a reach), not HARD.
// Translated: EASY = the two side bands (0-28 % and 72-100 % of width) over the lower 75 % of height, plus the bottom
// 25 % band; HARD = top centre (the far point of both thumb arcs, and where the hands would cover the screen);
// OK = everything else. These are design priors, not measurements on Bryce's hands: tune the table, not the code.
//
// PRIMARY CONTROL (pickPrimary, first rule that matches wins; `primaryBy` in the output names it):
//   1. --primary screen=selector, then PRIMARY_OVERRIDES[screen]   2. [data-menu-default] / a tap with primary:true
//   3. visible text is an action word (ACTION_WORDS: GO, START, RACE, APPLY, DONE, ...), lowest on screen first
//   4. autofocus   5. the focused control   6. a .bigbtn that is not .alt, lowest first.
// autofocus ranks below the action word on purpose: index.html autofocuses BACK buttons (#bench-back, #co-back ...).
//
// SCORES per screen: primary zone; share of tappables per zone (by rect centre); dead space = 1 - (union of visible
// content boxes / sheet-root area ∩ viewport) on a GRID_PX grid; taps under the input's tap floor when it has one.
//
// INPUT FIELDS. layout-audit `--dom` / `--gallery` write css-play.mjs collectDomInfo(): root.box + root.kids[] boxes,
// tokens.tap — but NO list of tappables inside the root and no primary marker. Until it gains the fields below
// (PROPOSED_DOM_FIELDS), a dom dump is scored from root.kids only and marked `partial` with the missing fields named.
// The explorer inspection (inspector.mjs) has controls[].box + focus + layoutContexts (root box) but no content boxes
// and no data-menu-default/autofocus flags; it is scored with controls as content and marked partial too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_OUT = "artifacts/ui-reach";
export const DEFAULT_VIEWPORT = { w: 844, h: 390 };
export const GRID_PX = 4;

/** Zone table: [x0,y0,x1,y1] fractions of the viewport. First matching zone in ZONE_ORDER wins; else "ok". */
export const ZONES = {
  easy: [
    { name: "left-thumb", rect: [0, 0.25, 0.28, 1] },
    { name: "right-thumb", rect: [0.72, 0.25, 1, 1] },
    { name: "bottom-band", rect: [0, 0.75, 1, 1] },
  ],
  hard: [{ name: "top-centre", rect: [0.28, 0, 0.72, 0.35] }],
};
export const ZONE_ORDER = ["easy", "hard"];
export const ZONE_FILL = { easy: "#2e9e5b", ok: "#c9a227", hard: "#c0392b" };

/** Verdict thresholds (fractions). */
export const VERDICT = { maxHardShare: 0.2, maxDead: 0.5, sparseDead: 0.65 };

/** Per-screen primary overrides: screen id (menu-screens.mjs) → selector or id. Empty until Bryce's picks land. */
export const PRIMARY_OVERRIDES = {
  // The heuristics picked RACE MESSAGES (pause) and SAVE CAREER FILE (career):
  // the screens' real first actions are RESUME and the first career slot.
  pause: "#pm-resume", hudpause: "#pm-resume", career: "button.cr-slot-main",
};
/* LIST screens have no single primary action — a menu of pages or a table.
   Judge them on where their taps sit and on dead space only. */
export const LIST_SCREENS = /^(settings|data|advanced|audioset|howtoplay|standings|careerhistory|careerguide)/;

export const ACTION_WORDS = /^(go|start|race|apply|done|continue|save|confirm|play|resume|ok|next)\b/i;

/** The smallest addition to collectDomInfo() (tools/ui/css-play.mjs) that makes a dom dump fully scorable. */
export const PROPOSED_DOM_FIELDS = {
  taps: "[{sel,tag,id,cls,text,x,y,w,h,disabled,autofocus,menuDefault,focused}] — every visible FOCUSABLE in root (layout-audit PROBE's list, its targetRect), CSS px",
  content: "[{x,y,w,h}] — visible leaf boxes in root with text, or img/canvas/svg/video, clipped to their clipper",
  tapFloor: "number — body --tap in px (PROBE already reads it)",
};

export function zoneOf(cx, cy, vp) {
  const fx = cx / vp.w, fy = cy / vp.h;
  for (const z of ZONE_ORDER) {
    for (const band of ZONES[z]) {
      const [x0, y0, x1, y1] = band.rect;
      if (fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1) return z;
    }
  }
  return "ok";
}

export function parseViewport(s) {
  const m = /^(\d+)x(\d+)$/.exec(String(s || "").trim());
  if (!m) throw new Error(`bad viewport "${s}" (want WxH, e.g. 844x390)`);
  return { w: +m[1], h: +m[2] };
}

const rectOf = (b) => b && { x: +b.x || 0, y: +b.y || 0, w: +(b.w ?? b.width) || 0, h: +(b.h ?? b.height) || 0 };
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

/** 1 - union(content ∩ root ∩ viewport) / area(root ∩ viewport), on a GRID_PX grid. null when the root has no area. */
export function deadSpace(root, boxes, vp, grid = GRID_PX) {
  const x0 = Math.max(0, root.x), y0 = Math.max(0, root.y);
  const x1 = Math.min(vp.w, root.x + root.w), y1 = Math.min(vp.h, root.y + root.h);
  const cols = Math.ceil((x1 - x0) / grid), rows = Math.ceil((y1 - y0) / grid);
  if (cols <= 0 || rows <= 0) return null;
  const cells = new Uint8Array(cols * rows);
  for (const b of boxes) {
    const c0 = Math.max(0, Math.floor((b.x - x0) / grid)), c1 = Math.min(cols, Math.ceil((b.x + b.w - x0) / grid));
    const r0 = Math.max(0, Math.floor((b.y - y0) / grid)), r1 = Math.min(rows, Math.ceil((b.y + b.h - y0) / grid));
    for (let r = r0; r < r1; r++) cells.fill(1, r * cols + c0, r * cols + Math.max(c0, c1));
  }
  let used = 0;
  for (const v of cells) used += v;
  return 1 - used / cells.length;
}

/** Pick the primary tap. Returns { tap, by } or { tap: null, by: null }. */
export function pickPrimary(screen, taps, overrides = {}) {
  const live = taps.filter((t) => !t.disabled);
  const lowest = (list) => list.slice().sort((a, b) => (b.y + b.h) - (a.y + a.h) || (b.x - a.x))[0];
  const match = (t, sel) => sel && (t.sel === sel || (t.id && "#" + t.id === sel) || t.id === sel);
  const base = String(screen || "").split("#")[0];
  const ov = overrides[screen] ?? overrides[base] ?? PRIMARY_OVERRIDES[screen] ?? PRIMARY_OVERRIDES[base];
  if (ov) { const t = live.find((x) => match(x, ov)); if (t) return { tap: t, by: "override" }; }
  const rules = [
    ["data-menu-default", (t) => t.menuDefault || t.primary === true],
    ["action-word", (t) => ACTION_WORDS.test(String(t.text || "").trim())],
    ["autofocus", (t) => t.autofocus],
    ["focus", (t) => t.focused],
    ["bigbtn", (t) => /(^|\s)bigbtn(\s|$)/.test(t.cls || "") && !/(^|\s)alt(\s|$)/.test(t.cls || "")],
  ];
  for (const [by, ok] of rules) { const hit = lowest(live.filter(ok)); if (hit) return { tap: hit, by }; }
  return { tap: null, by: null };
}

const TAP_TAGS = /^(button|a|input|select|textarea|summary)$/;

/** Normalise a collectDomInfo() dump (+ optional audit row) to the scoring shape. */
export function fromDomDump(dom, meta = {}) {
  const vp = typeof dom.viewport === "string" ? parseViewport(dom.viewport) : null;
  const root = rectOf(dom.root?.box);
  const missing = [];
  let taps, content;
  if (Array.isArray(dom.taps)) {
    // collectDomInfo() has no `sel`: name each tap by id, else tag.class, and
    // flatten multi-line labels so they do not break the markdown table.
    taps = dom.taps.map((t) => ({ ...t, ...rectOf(t),
      sel: t.sel || (t.id ? "#" + t.id : (t.tag || "?") + (t.cls ? "." + String(t.cls).split(/\s+/)[0] : "")),
      text: String(t.text || "").replace(/\s+/g, " ").trim() }));
  } else {
    missing.push("taps");
    taps = (dom.root?.kids || []).filter((k) => TAP_TAGS.test(k.tag) && !k.hidden && k.box?.w > 0 && k.box?.h > 0)
      .map((k) => ({ sel: k.id ? "#" + k.id : k.tag, id: k.id, tag: k.tag, cls: k.className, text: k.text, ...rectOf(k.box) }));
  }
  if (Array.isArray(dom.content)) content = dom.content.map(rectOf);
  else { missing.push("content"); content = (dom.root?.kids || []).filter((k) => !k.hidden && k.box?.w > 0).map((k) => rectOf(k.box)); }
  const floor = dom.tapFloor ?? meta.tapFloor ?? (parseFloat(dom.tokens?.tap) || null);
  if (dom.tapFloor == null && meta.tapFloor == null) missing.push("tapFloor");
  return { screen: meta.screen, viewportName: meta.viewport || null, vp, root, taps, content: [...content, ...taps],
    tapFloor: floor, smallTapsFromAudit: meta.smallTaps ?? null, source: "dom", missing };
}

/** Normalise an inspector.mjs inspection. */
export function fromInspection(ins, meta = {}) {
  const vp = ins.viewport ? { w: ins.viewport.width, h: ins.viewport.height } : null;
  const ctx = (ins.layoutContexts || []).find((c) => c.selector === ins.root);
  const root = ctx ? rectOf(ctx.box) : vp ? { x: 0, y: 0, w: vp.w, h: vp.h } : null;
  const focus = ins.focus?.selector;
  const taps = (ins.controls || []).filter((c) => c.box && c.box.width > 0 && c.box.height > 0).map((c) => ({
    sel: c.selector, id: /^#([\w-]+)$/.test(c.selector) ? c.selector.slice(1) : "", text: c.name, disabled: !!c.disabled,
    cls: c.className || "", focused: c.selector === focus, autofocus: !!c.autofocus, menuDefault: !!c.menuDefault, ...rectOf(c.box),
  }));
  const missing = ["content", "menuDefault/autofocus", "tapFloor"];
  if (!ctx) missing.push("root box (layoutContexts has no entry for root)");
  return { screen: meta.screen || ins.provenance?.screen || ins.root || "inspection", viewportName: meta.viewport || null,
    vp, root, taps, content: taps, tapFloor: null, smallTapsFromAudit: null, source: "inspection", missing };
}

/** Score one normalised screen. */
export function scoreScreen(s, { viewport = DEFAULT_VIEWPORT, overrides = {} } = {}) {
  const vp = s.vp || viewport;
  const counts = { easy: 0, ok: 0, hard: 0 };
  const taps = s.taps.map((t) => { const z = zoneOf(...centre(t), vp); counts[z]++; return { ...t, zone: z }; });
  const n = taps.length || 1;
  const share = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, taps.length ? +(v / n).toFixed(3) : null]));
  const isList = LIST_SCREENS.test(String(s.screen || "")) && !(overrides[s.screen] || PRIMARY_OVERRIDES[s.screen]);
  const { tap: primary, by } = isList ? { tap: null, by: "list" } : pickPrimary(s.screen, taps, overrides);
  const dead = s.root ? deadSpace(s.root, s.content, vp) : null;
  const under = s.tapFloor ? taps.filter((t) => !t.disabled && Math.min(t.w, t.h) < s.tapFloor - 0.5).length
    : s.smallTapsFromAudit != null ? s.smallTapsFromAudit : null;
  const notes = [];
  let verdict = "good";
  if (isList) { /* judged on tap spread and dead space below */ }
  else if (!primary) { verdict = "no-primary"; notes.push("no primary control found: add a PRIMARY_OVERRIDES entry"); }
  else if (primary.zone === "hard") { verdict = "move-primary"; notes.push("primary sits top-centre"); }
  else if (primary.zone === "ok") { verdict = "fair"; notes.push("primary in the middle, not under a thumb"); }
  if (share.hard != null && share.hard > VERDICT.maxHardShare) { notes.push(`${Math.round(share.hard * 100)}% of taps top-centre`); if (verdict === "good") verdict = "fair"; }
  if (dead != null && dead > VERDICT.sparseDead) notes.push("sparse: most of the sheet is empty");
  else if (dead != null && dead > VERDICT.maxDead && verdict === "good") verdict = "fair";
  if (under) notes.push(`${under} taps under floor`);
  const mismatch = s.vp && (s.vp.w !== viewport.w || s.vp.h !== viewport.h);
  return {
    screen: s.screen, viewport: s.viewportName || `${vp.w}x${vp.h}`, size: `${vp.w}x${vp.h}`, viewportMismatch: !!mismatch,
    source: s.source, partial: s.missing.length > 0, missing: s.missing,
    list: isList,
    primary: primary ? { sel: primary.sel, text: String(primary.text || "").slice(0, 40), zone: primary.zone, by } : null,
    taps: taps.length, share, deadSpace: dead == null ? null : +dead.toFixed(3), tapFloor: s.tapFloor, underFloor: under,
    verdict, notes,
    rects: { root: s.root, taps: taps.map(({ sel, x, y, w, h, zone }) => ({ sel, x, y, w, h, zone })) },
  };
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const screenFromFile = (f) => { const m = /^(.+?)__(.+?)\.dom\.json$/.exec(path.basename(f)); return m ? { screen: m[1], viewport: m[2] } : { screen: path.basename(f, ".json") }; };

/** Load every screen an input path carries. Throws on an unrecognised input. */
export function loadInput(inPath) {
  const st = fs.statSync(inPath);
  if (st.isDirectory()) {
    for (const f of ["audit.json", "manifest.json", "gallery/manifest.json", "inspection.json"]) {
      const p = path.join(inPath, f);
      if (fs.existsSync(p)) return loadInput(p);
    }
    const domDir = fs.existsSync(path.join(inPath, "dom")) ? path.join(inPath, "dom") : inPath;
    const files = fs.readdirSync(domDir).filter((f) => f.endsWith(".dom.json")).sort();
    if (!files.length) throw new Error(`no audit.json, manifest.json, inspection.json or *.dom.json under ${inPath}`);
    return files.map((f) => fromDomDump(readJson(path.join(domDir, f)), screenFromFile(f)));
  }
  const data = readJson(inPath), dir = path.dirname(inPath);
  const cells = data.rows || data.cells;
  if (Array.isArray(cells)) {
    return cells.filter((r) => r.dom && !r.skipped && fs.existsSync(path.join(dir, r.dom)))
      .map((r) => fromDomDump(readJson(path.join(dir, r.dom)),
        { screen: r.screen, viewport: r.viewport, tapFloor: r.tapFloor, smallTaps: r.smallTaps ? r.smallTaps.length : null }));
  }
  if (Array.isArray(data.controls)) return [fromInspection(data)];
  if (Array.isArray(data.records)) {
    return data.records.filter((r) => r.inspection?.controls).map((r, i) => fromInspection(r.inspection,
      { screen: r.screen || r.inspection.provenance?.screen || data.provenance?.screen || `record${i}`,
        viewport: r.requestedViewport ? `${r.requestedViewport.width}x${r.requestedViewport.height}` : null }));
  }
  if (data.root && data.viewport) return [fromDomDump(data, screenFromFile(inPath))];
  throw new Error(`unrecognised input ${inPath}: want audit.json rows, a gallery manifest, a *.dom.json or an inspection`);
}

export function renderMarkdown(results, viewport) {
  const pct = (v) => (v == null ? "—" : Math.round(v * 100) + "%");
  const lines = [
    `# Thumb reach — two-thumb landscape grip (${viewport.w}x${viewport.h} default)`, "",
    "Zones and sources: `tools/ui/reach-score.mjs` header (ZONES). Primary = `by` rule. Partial = input lacked fields.", "",
    "| screen | viewport | primary | zone | by | easy | ok | hard | dead | under floor | verdict | notes |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    const p = r.primary;
    lines.push(`| ${r.screen} | ${r.viewport}${r.viewportMismatch ? " (≠)" : ""} | ${p ? (p.sel + (p.text ? ` "${p.text}"` : "")).replace(/\|/g, "\\|") : r.list ? "(list screen)" : "—"} | ${p ? p.zone : "—"} | ${p ? p.by : "—"} | ${pct(r.share.easy)} | ${pct(r.share.ok)} | ${pct(r.share.hard)} | ${pct(r.deadSpace)} | ${r.underFloor ?? "—"} | ${r.verdict}${r.partial ? " (partial)" : ""} | ${r.notes.join("; ").replace(/\|/g, "\\|")} |`);
  }
  const partial = results.filter((r) => r.partial);
  if (partial.length) lines.push("", `Partial rows (${partial.length}) lack: ${[...new Set(partial.flatMap((r) => r.missing))].join(", ")}.`);
  return lines.join("\n") + "\n";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderSvg(r) {
  const [w, h] = r.size.split("x").map(Number);
  const zoneRects = ZONE_ORDER.slice().reverse().flatMap((z) => ZONES[z].map((b) =>
    `<rect x="${b.rect[0] * w}" y="${b.rect[1] * h}" width="${(b.rect[2] - b.rect[0]) * w}" height="${(b.rect[3] - b.rect[1]) * h}" fill="${ZONE_FILL[z]}" fill-opacity="0.22"><title>${z}: ${b.name}</title></rect>`));
  const root = r.rects.root ? `<rect x="${r.rects.root.x}" y="${r.rects.root.y}" width="${r.rects.root.w}" height="${r.rects.root.h}" fill="none" stroke="#888" stroke-dasharray="6 4"/>` : "";
  const taps = r.rects.taps.map((t) => {
    const prim = r.primary && t.sel === r.primary.sel;
    return `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="none" stroke="${ZONE_FILL[t.zone]}" stroke-width="${prim ? 4 : 1.5}"><title>${esc(t.sel)} (${t.zone})${prim ? " PRIMARY" : ""}</title></rect>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="${ZONE_FILL.ok}" fill-opacity="0.12"/>${zoneRects.join("")}${root}${taps.join("")}` +
    `<text x="8" y="${h - 8}" font-family="sans-serif" font-size="12" fill="#333">${esc(r.screen)} · ${esc(r.verdict)} · dead ${r.deadSpace == null ? "—" : Math.round(r.deadSpace * 100) + "%"}</text></svg>\n`;
}

export function parseArgs(argv) {
  const o = { in: null, out: DEFAULT_OUT, viewport: DEFAULT_VIEWPORT, json: false, svg: false, help: false, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].split(/=(.*)/s, 2);
    const val = () => (inline !== undefined ? inline : argv[++i]);
    if (k === "--help" || k === "-h") o.help = true;
    else if (k === "--json") o.json = true;
    else if (k === "--svg") o.svg = true;
    else if (k === "--in") o.in = val();
    else if (k === "--out") o.out = val();
    else if (k === "--viewport") o.viewport = parseViewport(val());
    else if (k === "--primary") { const v = val() || ""; const j = v.indexOf("="); if (j < 1) throw new Error(`--primary wants screen=selector, got "${v}"`); o.overrides[v.slice(0, j)] = v.slice(j + 1); }
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!o.help && !o.in) throw new Error("--in <audit dir or file> is required");
  return o;
}

const HELP = `reach-score — offline two-thumb reach + dead-space score per menu screen (no browser)

  --in PATH          layout-audit dir (audit.json + dom/), gallery dir/manifest.json, a *.dom.json,
                     or an explorer inspection.json / replay with records[].inspection
  --out DIR          output dir (default ${DEFAULT_OUT}): reach.json, reach.md [, svg/]
  --viewport WxH     zone viewport when the input has none, and the size rows are compared to (default 844x390)
  --primary S=SEL    override the primary control for screen S (repeatable)
  --svg              also write svg/<screen>__<viewport>.svg zone overlays
  --json             print reach.json to stdout
  --help

Make the input first (parent-only, browser): node tools/ui/layout-audit.mjs --screens=... --viewports=ios-iphone-landscape --dom
Exit 0 when scored (verdicts are in the report), 2 for a bad argument or unreadable input.`;

export function run(argv, log = console.log) {
  const o = parseArgs(argv);
  if (o.help) { log(HELP); return null; }
  const results = loadInput(path.resolve(o.in)).map((s) => scoreScreen(s, { viewport: o.viewport, overrides: o.overrides }));
  const out = path.resolve(ROOT, o.out);
  fs.mkdirSync(out, { recursive: true });
  const report = { tool: "reach-score", version: 1, input: o.in, viewport: `${o.viewport.w}x${o.viewport.h}`,
    model: { zones: ZONES, verdict: VERDICT, grid: GRID_PX, proposedDomFields: PROPOSED_DOM_FIELDS }, screens: results };
  fs.writeFileSync(path.join(out, "reach.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, "reach.md"), renderMarkdown(results, o.viewport));
  if (o.svg) {
    fs.mkdirSync(path.join(out, "svg"), { recursive: true });
    for (const r of results) fs.writeFileSync(path.join(out, "svg", `${r.screen.replace(/[^\w.-]/g, "_")}__${r.viewport.replace(/[^\w.@-]/g, "_")}.svg`), renderSvg(r));
  }
  if (o.json) log(JSON.stringify(report));
  else log(`${results.length} screens scored, ${results.filter((r) => r.verdict !== "good").length} not good, ` +
    `${results.filter((r) => r.partial).length} partial -> ${path.relative(ROOT, out) || out}/reach.md`);
  return report;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv.slice(2)); } catch (e) { console.error(`reach-score: ${e.message}`); process.exit(2); }
}
