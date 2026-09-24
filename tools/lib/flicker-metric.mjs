// flicker-metric.mjs — the pure half of the rendered flicker (z-fighting) gate.
// @doc Pure per-pixel temporal-instability metric for `shot/flicker-gate.mjs`: luma, flip masks, 8-connected clusters, verdict.
// @skill playwright-probe
//
// No browser, no I/O: frames in, numbers out, so tests/unit/flicker-metric.test.mjs
// can prove the metric on synthetic arrays before any rasteriser is involved.
//
// THE MEASUREMENT (docs/notes/SCENERY-QA-PLAN.md §2b G2). Two identical still
// frames cannot show z-fighting — a deterministic rasteriser resolves the fight
// the same way every frame — so a site is captured as:
//
//   A      the pose
//   A2     the same pose again → must equal A: proves every time source is frozen
//   J1..K  the eye (and target) moved a TINY distance d_i along the view ray
//          (default ±1, ±2 mm)
//
// Why a tiny move separates a fight from ordinary motion. A feature at depth z,
// r px from the image centre, shifts r·d/z px when the eye dollies d along the
// ray: 1 mm at z >= 5 m and r <= 500 px is <= 0.1 px, so no real edge changes
// by more than ~10 % of its contrast — far under the 48-luma step. The depth
// buffer's step at z is ~z²/(near·2^24): 2.4 µm at 6 m with the 0.9 m near
// plane, so the same 1 mm moves every surface's depth by hundreds of steps,
// and two coplanar surfaces re-roll which one wins at each pixel. A fighting
// pixel therefore flips in about half the jitter frames; nothing else flips.
//
// A pixel counts when it flips (|J_i - A| > thr) in at least `minFlips` of the
// K jitter frames (default 2 of 4: a fight pixel at p = 0.5 per frame clears it
// 69 % of the time; a one-off coincidence does not), and only inside an
// 8-connected cluster of >= `minCluster` such pixels (default 9), which drops
// isolated speckle and keeps the blotches and bands z-fighting draws. At a
// 69 % hit density a fight region is far above the 8-neighbour percolation
// threshold (~0.41), so it survives the cluster floor as one large component.
//
// An earlier draft used ONE symmetric pair (+d, -d, 1-2 cm) AND-ed together.
// It was rejected on paper before shipping: a fight pixel survives an AND of
// two independent re-rolls only 25 % of the time, and a 25 %-dense random
// mask sits below the percolation threshold, so the cluster floor erased the
// very pattern it was meant to find.
//
// score.fight.frac = pixels in qualifying clusters / all pixels.

/** Rec.601 integer luma of an RGBA byte buffer → Uint8Array(w*h). */
export function lumaFromRGBA(rgba, w, h) {
  const n = w * h;
  if (!rgba || rgba.length < n * 4) throw new Error(`lumaFromRGBA: need ${n * 4} bytes, got ${rgba ? rgba.length : 0}`);
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114 + 500) / 1000 | 0;
  }
  return out;
}

/** 1 where |a-b| > thr, else 0. */
export function flipMask(a, b, thr) {
  if (a.length !== b.length) throw new Error(`flipMask: frame sizes differ (${a.length} vs ${b.length})`);
  const m = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > thr) m[i] = 1;
  return m;
}

/** Largest absolute difference and count of differing pixels between two frames. */
export function frameDelta(a, b) {
  let max = 0, diff = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d) { diff++; if (d > max) max = d; }
  }
  return { maxDelta: max, diffPx: diff };
}

/**
 * 8-connected components of `mask`; only components of at least `minSize`
 * pixels count. Iterative (explicit stack) so a frame-sized blob cannot blow
 * the call stack. Returns { pixels, count, largest }.
 */
export function clusters(mask, w, h, minSize = 9) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let pixels = 0, count = 0, largest = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0, size = 0;
    stack[sp++] = start; seen[start] = 1;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
        }
      }
    }
    if (size >= minSize) { pixels += size; count++; if (size > largest) largest = size; }
  }
  return { pixels, count, largest };
}

export const DEFAULTS = Object.freeze({
  thr: 48,          // luma step that counts as a flip (plan G2: "> 48")
  minFlips: 2,      // flips needed across the jitter frames for a pixel to count
  minCluster: 9,    // 8-connected pixels per counted cluster (plan G2: ">= 9 px")
  maxFrac: 0.002,   // default per-site ceiling on fight.frac — see flicker-gate.mjs CALIBRATION
});

/**
 * Score one site from luma frames of equal size.
 * { a, a2, jit: [J1..JK], w, h, thr?, minFlips?, minCluster? } →
 *   { still: {maxDelta, diffPx, flipPx}, jitter: {frames, flipPx: [..]},
 *     fight: {px, frac, clusters, largest} }
 */
export function flickerScore({ a, a2, jit, w, h, thr = DEFAULTS.thr, minFlips = DEFAULTS.minFlips, minCluster = DEFAULTS.minCluster }) {
  const n = w * h;
  if (!Array.isArray(jit) || jit.length < minFlips) throw new Error(`flickerScore: need at least ${minFlips} jitter frames, got ${jit ? jit.length : 0}`);
  for (const [k, f] of [["a", a], ["a2", a2], ...jit.map((f, i) => [`jit[${i}]`, f])]) {
    if (!f || f.length !== n) throw new Error(`flickerScore: frame ${k} has ${f ? f.length : 0} px, expected ${n}`);
  }
  const still = frameDelta(a, a2);
  let stillFlip = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - a2[i]) > thr) stillFlip++;
  const count = new Uint8Array(n);
  const flipPx = jit.map((f) => {
    let s = 0;
    for (let i = 0; i < n; i++) if (Math.abs(a[i] - f[i]) > thr) { count[i]++; s++; }
    return s;
  });
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (count[i] >= minFlips) mask[i] = 1;
  const cl = clusters(mask, w, h, minCluster);
  return {
    still: { maxDelta: still.maxDelta, diffPx: still.diffPx, flipPx: stillFlip },
    jitter: { frames: jit.length, flipPx },
    fight: { px: cl.pixels, frac: cl.pixels / n, clusters: cl.count, largest: cl.largest },
    mask,
  };
}

/**
 * The verdict for one scored site. Two ways to fail, reported separately
 * because they mean different things:
 *   "still-frames-differ" — A and A2 disagree by more than `thr` somewhere, so a
 *     time source is not frozen and the fight number cannot be trusted;
 *   "fight"               — fight.frac is above the site's ceiling.
 */
export function judge(score, { maxFrac = DEFAULTS.maxFrac } = {}) {
  const reasons = [];
  if (score.still.flipPx > 0) reasons.push(`still-frames-differ: ${score.still.flipPx} px moved > thr between A and A2 (max delta ${score.still.maxDelta})`);
  if (score.fight.frac > maxFrac) reasons.push(`fight: ${(score.fight.frac * 100).toFixed(3)}% of the frame flips in both moves (ceiling ${(maxFrac * 100).toFixed(3)}%)`);
  return { ok: reasons.length === 0, reasons };
}
