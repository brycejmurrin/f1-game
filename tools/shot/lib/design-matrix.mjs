// Pure parts of design-matrix.mjs: matrix expansion, part framing math, diff labelling,
// batch split and manifest resume. No browser, no fs beyond the manifest helpers.
// @doc Design-review matrix core: PART_BOXES, ANGLES, COLOURS, LIGHTS, expandMatrix, frameForPart, labelDiff, manifest.
// @skill garage-parts-livery
import { STATIONS } from "./garage-camera-catalog.mjs";

const D = Math.PI / 180;

/** Car-space bounding boxes (m; +x right, +y up, +z nose) of the parts a design lane reviews.
 *  `face` = azimuth (deg) a camera sits at to look at the part head-on (0 nose, 90 side, 180 rear);
 *  `field` = the Liveries field that tints the part (for --variants recipes). Override with --bounds=@file.json. */
export const PART_BOXES = {
  frontWing: { c: [0, 0.05, 2.1],   size: [1.9, 0.35, 0.7], face: 0,   field: "wing" },
  nose:      { c: [0, 0.3, 2.0],    size: [0.5, 0.4, 1.0],  face: 15,  field: "nose" },
  mirror:    { c: [0.55, 0.78, 0.45], size: [0.3, 0.15, 0.2], face: 30, field: "mirrorTint" },
  sidepod:   { c: [0.7, 0.45, 0.1], size: [0.5, 0.5, 1.4],  face: 90,  field: "pod" },
  cover:     { c: [0, 0.88, -0.8],  size: [0.5, 0.5, 1.5],  face: 140, field: "cover" },
  halo:      { c: [0, 0.95, -0.15], size: [0.5, 0.3, 0.8],  face: 180, field: "halo" },
  fin:       { c: [0, 1.05, -1.5],  size: [0.1, 0.5, 0.8],  face: 90,  field: "fin" },
  rearWing:  { c: [0, 1.0, -2.4],   size: [1.0, 0.7, 0.5],  face: 180, field: "wing" },
  exhaust:   { c: [0, 0.6, -2.0],   size: [0.3, 0.3, 0.4],  face: 180, field: "exhaustTint" },
  floor:     { c: [0.75, 0.1, 0],   size: [0.6, 0.1, 3.0],  face: 90,  field: "floorTint" },
  susp:      { c: [0.6, 0.25, 1.4], size: [0.8, 0.2, 0.4],  face: 30,  field: "suspTint" },
  duct:      { c: [0.8, 0.3, 1.1],  size: [0.3, 0.3, 0.4],  face: 60,  field: "ductTint" },
  wheel:     { c: [0.9, 0.32, 1.15], size: [0.4, 0.7, 0.7], face: 90,  field: "rimTint" },
};

/** Angle presets, relative to the part's own `face`. `st` = a catalog station used verbatim. */
export const ANGLES = {
  headOn:    { rel: 0,   el: 0.06 },
  grazing:   { rel: 45,  el: 0.10 },
  specular:  { rel: 28,  el: 0.55 },
  low34:     { rel: 35,  el: 0.03 },
  haloBehind: { st: "haloBehind" },
  topFront:  { rel: 30,  el: 1.15 },
};

/** Base colours = catalog livery ids (c1 body): dark / saturated mid / light. Any other livery id is accepted too.
 *  (A part tint field alone barely moves the picture: measured 0.19 % dark-vs-light on a sidepod.) */
export const COLOURS = { dark: "stealth", mid: "splitshot", light: "ice" };

/** Light presets: `lamp` "part" = the lamp the part's own station would use. `knobs` = lightTune knobs. */
export const LIGHTS = {
  lamp:   { lamp: "part", knobs: {} },
  off:    { lamp: "off",  knobs: {} },
  keyHi:  { lamp: "part", knobs: { keyMul: 1.5 } },
  keyLo:  { lamp: "part", knobs: { keyMul: 0.5 } },
};

export const SAME_PCT = 0.5;

const csv = (v, d) => (v == null || v === "" ? d : String(v).split(",").map((s) => s.trim()).filter(Boolean));

/** Distance (m) that makes `box` fill `fill` (0..1) of the frame at az (deg, 0 = nose-on). */
export function frameForPart(box, { az = box.face, fov = 45, aspect = 16 / 9, fill = 0.7 } = {}) {
  const a = az * D, [w, h, d] = box.size;
  const horiz = w * Math.abs(Math.cos(a)) + d * Math.abs(Math.sin(a));
  const need = Math.max(h, horiz / aspect) / Math.max(0.05, Math.min(fill, 0.98));
  return +(need / (2 * Math.tan(fov * D / 2))).toFixed(2);
}

/** Camera for one (part, angle): az/el rad, dist m, target xyz. */
export function cameraFor(partId, angleId, o = {}, boxes = PART_BOXES) {
  const box = boxes[partId], ang = ANGLES[angleId];
  if (!box) throw new Error(`no part "${partId}" — ${Object.keys(boxes).join(", ")}`);
  if (!ang) throw new Error(`no angle "${angleId}" — ${Object.keys(ANGLES).join(", ")}`);
  if (ang.st) {
    const s = STATIONS[ang.st];
    return { az: s.az, el: s.el, dist: s.dist, target: s.target, view: s.view, lamp: s.lamp };
  }
  const azDeg = box.face + ang.rel;
  return { az: azDeg * D, el: ang.el, dist: frameForPart(box, { ...o, az: azDeg }), target: box.c, view: "free", lamp: null };
}

/** Variant "field=value" -> {field:value}; "factory" -> {}. */
export function parseVariant(s) {
  if (s === "factory" || s === "") return {};
  const i = s.indexOf("=");
  if (i < 1) throw new Error(`variant "${s}" is not field=value or "factory"`);
  return { [s.slice(0, i)]: s.slice(i + 1) };
}

const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * Expand the matrix. Each group = (part, angle, colour, light); its cells are every variant plus the
 * baseline (shot first), so a batch/resume unit never splits a diff from its baseline.
 */
export function expandMatrix({ parts, angles, colours, lights, variants, baseline = "factory" }, boxes = PART_BOXES) {
  const groups = [];
  const vs = [baseline, ...variants.filter((v) => v !== baseline)];
  for (const part of parts) {
    const box = boxes[part];
    if (!box) throw new Error(`no part "${part}" — ${Object.keys(boxes).join(", ")}`);
    for (const angle of angles) for (const colour of colours) for (const light of lights) {
      if (!ANGLES[angle]) throw new Error(`no angle "${angle}" — ${Object.keys(ANGLES).join(", ")}`);
      if (!LIGHTS[light]) throw new Error(`no light "${light}" — ${Object.keys(LIGHTS).join(", ")}`);
      const base = COLOURS[colour] || colour;
      const gid = [part, angle, colour, light].map(slug).join("__");
      groups.push({
        id: gid, part, angle, colour, light,
        cells: vs.map((v) => ({
          key: `${gid}__${slug(v)}`, variant: v, isBaseline: v === baseline, baselineKey: `${gid}__${slug(baseline)}`,
          base,
          design: { ...parseVariant(v),
            ...Object.fromEntries(Object.entries(LIGHTS[light].knobs).map(([k, x]) => [`light.${k}`, x])) },
        })),
      });
    }
  }
  return groups;
}

/** Batch k of n (1-based): whole groups, round-robin, so each batch holds complete baselines. */
export function batchSlice(groups, k, n) {
  if (!(n >= 1) || !(k >= 1 && k <= n)) throw new Error(`--batch k/n needs 1 <= k <= n, got ${k}/${n}`);
  return groups.filter((_, i) => i % n === k - 1);
}

/** diff fraction (0..1) -> label. Baseline cells are "baseline"; < SAME_PCT % = "same". */
export function labelDiff(frac, isBaseline = false) {
  if (isBaseline) return { text: "baseline", same: false };
  if (frac == null || Number.isNaN(frac)) return { text: "diff n/a", same: false };
  const pct = frac * 100;
  return pct < SAME_PCT ? { text: `${pct.toFixed(2)}% looks the same`, same: true } : { text: `${pct.toFixed(1)}%`, same: false };
}

/** Manifest: { run, cells: { key: { status, png, diff, ... } } }. Resume = groups with an unfinished cell. */
export function pendingGroups(groups, manifest, exists = () => true) {
  const done = (c) => manifest?.cells?.[c.key]?.status === "done" && exists(manifest.cells[c.key].png);
  return groups.filter((g) => !g.cells.every(done));
}

export function parseBatch(s) {
  if (!s) return null;
  const m = /^(\d+)\/(\d+)$/.exec(s);
  if (!m) throw new Error(`--batch wants k/n, got "${s}"`);
  return [Number(m[1]), Number(m[2])];
}

/** Guards from the launch contract: dpr 1, <= 1600x900, loadavg < 3. */
export function checkLimits({ viewport, dpr = 1, load }) {
  const [w, h] = viewport;
  if (dpr !== 1) throw new Error("dpr must be 1 (dpr > 1 starves SwiftShader)");
  if (w > 1600 || h > 900) throw new Error(`viewport ${w}x${h} exceeds 1600x900`);
  if (load != null && load >= 3) throw new Error(`loadavg ${load.toFixed(2)} >= 3; wait for the box to settle`);
}

export function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const m = /^--([\w.-]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return {
    team: o.team || "mercedes", parts: csv(o.part, ["sidepod"]), angles: csv(o.angles, ["headOn", "grazing", "specular"]),
    colours: csv(o.colours, ["dark", "light"]), lights: csv(o.lights, ["lamp"]),
    variants: csv(o.variants, ["factory"]), baseline: o.baseline || "factory",
    fill: Number(o.fill || 0.7), fov: Number(o.fov || 45),
    viewport: String(o.viewport || (o.phone ? "844x390" : "1280x720")).split("x").map(Number),
    batch: parseBatch(o.batch), run: o.run || null, out: o.out || null, bounds: o.bounds || null,
    resume: !!o.resume, plan: !!o.plan, dpr: Number(o.dpr || 1), phone: !!o.phone, help: !!(o.help || o.h),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Gallery HTML: one section per light; rows = part·angle, columns = colour × variant. */
export function sheetHtml(groups, manifest, { title = "design matrix", phone = false } = {}) {
  const lights = [...new Set(groups.map((g) => g.light))];
  const fr = phone ? "aspect-ratio:844/390" : "aspect-ratio:16/9";
  let h = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(title)}</title>`
    + `<style>:root{color-scheme:dark light}body{font:13px system-ui;margin:16px;background:#111;color:#ddd}`
    + `table{border-collapse:collapse}td,th{padding:4px;vertical-align:top}.c{width:300px}img{width:100%;${fr};object-fit:cover;background:#222;display:block}`
    + `.same{color:#f90;font-weight:600}.b{color:#8c8}</style><h1>${esc(title)}</h1>`;
  for (const light of lights) {
    const gs = groups.filter((g) => g.light === light);
    const colsKey = [...new Set(gs.flatMap((g) => g.cells.map((c) => `${g.colour}|${c.variant}`)))];
    const rowKey = [...new Set(gs.map((g) => `${g.part}|${g.angle}`))];
    h += `<h2>light: ${esc(light)}</h2><table><tr><th></th>${colsKey.map((k) => `<th>${esc(k.replace("|", " · "))}</th>`).join("")}</tr>`;
    for (const rk of rowKey) {
      const [part, angle] = rk.split("|");
      h += `<tr><th>${esc(part)}<br>${esc(angle)}</th>`;
      for (const ck of colsKey) {
        const [colour, variant] = ck.split("|");
        const g = gs.find((x) => x.part === part && x.angle === angle && x.colour === colour);
        const cell = g?.cells.find((c) => c.variant === variant), m = cell && manifest.cells[cell.key];
        if (!m || m.status !== "done") { h += "<td class=c>—</td>"; continue; }
        const lab = labelDiff(m.diff, cell.isBaseline);
        h += `<td class=c><img loading=lazy src="${esc(m.png)}" alt="${esc(cell.key)}"><span class="${lab.same ? "same" : cell.isBaseline ? "b" : ""}">${esc(lab.text)}</span></td>`;
      }
      h += "</tr>";
    }
    h += "</table>";
  }
  return h;
}
