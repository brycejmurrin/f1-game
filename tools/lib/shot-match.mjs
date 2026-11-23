// @doc Pure matcher: where and at what SCALE a live element's pixels appear in a phone screenshot (zero-mean NCC).
// shot-match.mjs — the arithmetic behind tools/ui/phone-shot-diff.mjs. No browser, no image library: callers hand in
// grayscale planes `{ w, h, data: Float32Array }` already resized to the same CSS-pixel grid.
//
// For one element: cut its rectangle out of the LIVE plane, then look for it in the PHONE plane over a geometric
// ladder of scales and a window of positions around where it sits live, coarse (half resolution) then fine. The
// answer is the scale with the best zero-mean normalised cross-correlation, plus that score. A flat template (a
// plain panel) has no texture to match and is reported as such instead of being guessed at.

/** Bilinear resample of `src` to w x h. Pure. */
export function resample(src, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const out = new Float32Array(w * h), sx = src.w / w, sy = src.h / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), tx = fx - x0;
      const a = src.data[y0 * src.w + x0], b = src.data[y0 * src.w + x1], c = src.data[y1 * src.w + x0], d = src.data[y1 * src.w + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { w, h, data: out };
}

/** `src` at half resolution: compute once per screenshot and pass as `opts.phoneHalf`. Pure. */
export function halve(src) { return resample(src, src.w / 2, src.h / 2); }

/** The sub-plane at integer rect (clamped to the plane). Pure. */
export function crop(src, x, y, w, h) {
  x = Math.max(0, Math.min(src.w - 1, Math.round(x))); y = Math.max(0, Math.min(src.h - 1, Math.round(y)));
  w = Math.max(1, Math.min(src.w - x, Math.round(w))); h = Math.max(1, Math.min(src.h - y, Math.round(h)));
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) out.set(src.data.subarray((y + j) * src.w + x, (y + j) * src.w + x + w), j * w);
  return { w, h, data: out };
}

/** Standard deviation of a plane: its texture. Pure. */
export function contrast(p) {
  let s = 0, s2 = 0;
  for (let i = 0; i < p.data.length; i++) { s += p.data[i]; s2 += p.data[i] * p.data[i]; }
  const n = p.data.length, m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

/** Zero-mean NCC of template `t` against `img` at (x, y); -1 when it does not fit or the patch is flat. */
function nccAt(img, t, tMean, tNorm, x, y) {
  if (x < 0 || y < 0 || x + t.w > img.w || y + t.h > img.h) return -1;
  let s = 0, s2 = 0, st = 0;
  for (let j = 0; j < t.h; j++) {
    const row = (y + j) * img.w + x, trow = j * t.w;
    for (let i = 0; i < t.w; i++) { const v = img.data[row + i]; s += v; s2 += v * v; st += v * t.data[trow + i]; }
  }
  const n = t.w * t.h, varI = s2 - (s * s) / n;
  if (varI <= 1e-6 || tNorm <= 1e-6) return -1;
  return (st - tMean * s) / Math.sqrt(varI * tNorm);
}

function prep(t) {
  let s = 0, s2 = 0;
  for (let i = 0; i < t.data.length; i++) { s += t.data[i]; s2 += t.data[i] * t.data[i]; }
  return { mean: s / t.data.length, norm: s2 - (s * s) / t.data.length };
}

/** Best (x, y, score) of `t` in `img` over x in [x0, x1], y in [y0, y1], every `step` px. */
function bestIn(img, t, x0, x1, y0, y1, step) {
  const { mean, norm } = prep(t);
  let best = { x: x0, y: y0, score: -1 };
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const sc = nccAt(img, t, mean, norm, x, y);
    if (sc > best.score) best = { x, y, score: sc };
  }
  return best;
}

export const MATCH_DEFAULTS = Object.freeze({ minScale: 0.4, maxScale: 2.5, coarseStep: 1.07, fineStep: 1.015, window: 0.15, minContrast: 6, minSide: 10 });

/**
 * Where does the live element at `rect` (in plane px) appear in `phone`, and how much bigger or smaller?
 * @param {{w:number,h:number,data:Float32Array}} live  @param {typeof live} phone  same grid
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{ ok: true, scale: number, x: number, y: number, w: number, h: number, score: number }|{ ok: false, why: string }}
 *   `scale` = phone size / live size; x, y, w, h are the matched rect in the phone plane.
 */
export function matchElement(live, phone, rect, opts = {}) {
  const o = { ...MATCH_DEFAULTS, ...opts };
  if (rect.w < o.minSide || rect.h < o.minSide) return { ok: false, why: "too small to match" };
  const tpl = crop(live, rect.x, rect.y, rect.w, rect.h);
  if (contrast(tpl) < o.minContrast) return { ok: false, why: "flat (no texture to match)" };
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // Coarse: half resolution, every scale on the ladder, a window around the live position.
  const half = { live: resample(tpl, tpl.w / 2, tpl.h / 2), phone: o.phoneHalf || halve(phone) };
  const winX = (o.window * phone.w) / 2, winY = (o.window * phone.h) / 2;
  let coarse = null;
  for (let s = o.minScale; s <= o.maxScale * 1.0001; s *= o.coarseStep) {
    const t = resample(half.live, half.live.w * s, half.live.h * s);
    if (t.w < 4 || t.h < 4 || t.w > half.phone.w || t.h > half.phone.h) continue;
    // A scaled layout moves an element about as far as it resizes it: widen the window with |s - 1|.
    const grow = 1 + 2 * Math.abs(s - 1);
    const x0 = Math.max(0, Math.round(cx / 2 - t.w / 2 - winX * grow)), x1 = Math.min(half.phone.w - t.w, Math.round(cx / 2 - t.w / 2 + winX * grow));
    const y0 = Math.max(0, Math.round(cy / 2 - t.h / 2 - winY * grow)), y1 = Math.min(half.phone.h - t.h, Math.round(cy / 2 - t.h / 2 + winY * grow));
    if (x1 < x0 || y1 < y0) continue;
    const b = bestIn(half.phone, t, x0, x1, y0, y1, 1);
    if (!coarse || b.score > coarse.score) coarse = { ...b, s, w: t.w, h: t.h };
  }
  if (!coarse || coarse.score <= 0) return { ok: false, why: "not found" };
  // Fine: full resolution, scales around the coarse winner, a few px around its position.
  let fine = null;
  for (let s = coarse.s / o.coarseStep; s <= coarse.s * o.coarseStep * 1.0001; s *= o.fineStep) {
    const t = resample(tpl, tpl.w * s, tpl.h * s);
    if (t.w > phone.w || t.h > phone.h) continue;
    const px = Math.round((coarse.x + coarse.w / 2) * 2 - t.w / 2), py = Math.round((coarse.y + coarse.h / 2) * 2 - t.h / 2);
    const b = bestIn(phone, t, Math.max(0, px - 3), Math.min(phone.w - t.w, px + 3), Math.max(0, py - 3), Math.min(phone.h - t.h, py + 3), 1);
    if (!fine || b.score > fine.score) fine = { ...b, s, w: t.w, h: t.h };
  }
  if (!fine || fine.score <= 0) return { ok: false, why: "not found" };
  return { ok: true, scale: +fine.s.toFixed(3), x: fine.x, y: fine.y, w: fine.w, h: fine.h, score: +fine.score.toFixed(3) };
}

/** Median of numbers; null when empty. Pure. */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Turn per-element matches into the report: the screen-wide factor (median over confident matches), the elements
 * whose own factor departs from it, and what could not be matched. Pure.
 * @param {{ label: string, rect: object, match: ReturnType<typeof matchElement> }[]} rows  rects in CSS px
 */
export function summarize(rows, { minScore = 0.6, outlier = 0.07 } = {}) {
  const sure = rows.filter((r) => r.match.ok && r.match.score >= minScore);
  const global = median(sure.map((r) => r.match.scale));
  const out = { matched: sure.length, of: rows.length, globalScale: global === null ? null : +global.toFixed(3), sameSize: [], different: [], unmatched: [] };
  for (const r of rows) {
    if (!r.match.ok) { out.unmatched.push({ label: r.label, why: r.match.why }); continue; }
    if (r.match.score < minScore) { out.unmatched.push({ label: r.label, why: `weak match (score ${r.match.score})` }); continue; }
    const row = { label: r.label, live: `${Math.round(r.rect.w)}x${Math.round(r.rect.h)}`, phone: `${Math.round(r.rect.w * r.match.scale)}x${Math.round(r.rect.h * r.match.scale)}`,
      scale: r.match.scale, vsScreen: +(r.match.scale / global).toFixed(3), score: r.match.score };
    (Math.abs(row.vsScreen - 1) > outlier ? out.different : out.sameSize).push(row);
  }
  out.different.sort((a, b) => Math.abs(b.vsScreen - 1) - Math.abs(a.vsScreen - 1));
  return out;
}
