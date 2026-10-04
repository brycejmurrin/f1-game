// hud-geometry.mjs — the HUD box probe and overlap rules, shared by
// tests/specs/hud-layout.spec.js and tools/shot/hud-survey.mjs.
// @doc In-page HUD box probe (rect, visibility, font px) + the pure overlap/safe-area rules of hud-layout.spec.
//
// TWO HALVES, on purpose. `probeHudElements` runs IN THE PAGE
// (`page.evaluate(probeHudElements, arg)`), so it must stay self-contained:
// Playwright serialises it with Function#toString, and a reference to anything
// outside its own body is a ReferenceError in the browser. It only READS the
// DOM. Every decision about what counts as a clash is `analyzeOverlap`, a pure
// Node function over the records — so the rules are unit-testable on synthetic
// rects, and the spec and the survey cannot drift apart.
//
// The rules are hud-layout.spec.js's, moved here verbatim (2026-10-03):
//   - visible = not [hidden], display != none, visibility != hidden,
//     opacity != 0, and a non-zero box (the element itself, as the spec had it);
//   - controls vs controls: round buttons (border-radius >= 45% of the width)
//     compare as CIRCLES, everything else as rects;
//   - readouts vs controls and readouts vs readouts: the conservative RECT
//     test (a number drawn across a circle's bounding corner is unreadable);
//   - unsafe: any visible box past the injected safe-area insets.
// One addition the spec never needed: a pair where one element CONTAINS the
// other (#hud-delta lives inside .hud-top) is not a clash.

/** In-page probe. arg = { targets: [{ key, sel, role }], fonts?: boolean }.
 *  role is "ctrl" or "hud". A bare id ("btn-ot") is treated as "#btn-ot". */
export function probeHudElements(arg) {
  const targets = (arg && arg.targets) || [];
  const wantFonts = !!(arg && arg.fonts);
  const resolve = (sel) => {
    try {
      return document.querySelector(sel.startsWith(".") || sel.startsWith("#") || sel.includes("[") ? sel : "#" + sel);
    } catch { return null; }
  };
  const scaleOf = (cs) => {
    let k = 1;
    const t = cs.transform;
    if (t && t !== "none") {
      const m = /matrix\(([^)]+)\)/.exec(t);
      if (m) { const v = m[1].split(",").map(Number); k *= Math.hypot(v[0], v[1]) || 1; }
      const m3 = /matrix3d\(([^)]+)\)/.exec(t);
      if (m3) { const v = m3[1].split(",").map(Number); k *= Math.hypot(v[0], v[1], v[2]) || 1; }
    }
    const s = cs.scale;
    if (s && s !== "none") { const n = parseFloat(s); if (Number.isFinite(n) && n > 0) k *= n; }
    return k;
  };
  // Rendered font px of a text-bearing element: computed font-size x the CSS
  // zoom chain (currentCSSZoom) x every transform / `scale` on the way up.
  const fontPx = (el) => {
    const cs = getComputedStyle(el);
    let k = el.currentCSSZoom || 1;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) k *= scaleOf(getComputedStyle(p));
    return parseFloat(cs.fontSize) * k;
  };
  const els = targets.map((t) => resolve(t.sel));
  const out = targets.map((t, i) => {
    const el = els[i];
    const rec = { key: t.key, sel: t.sel, role: t.role || "hud", exists: !!el, visible: false };
    if (!el) return rec;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const hiddenBy = el.hidden ? "hidden-attr" : cs.display === "none" ? "display"
      : cs.visibility === "hidden" ? "visibility" : parseFloat(cs.opacity) === 0 ? "opacity"
      : !(b.width && b.height) ? "zero-box" : null;
    rec.hiddenBy = hiddenBy;
    rec.visible = !hiddenBy;
    // An ancestor at opacity 0 hides it from the player without hiding it
    // from the rules above; reported separately so the spec keeps its rule.
    let faded = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (parseFloat(getComputedStyle(p).opacity) === 0) { faded = true; break; }
    }
    rec.fadedByAncestor = faded;
    const rad = parseFloat(cs.borderRadius) || 0;
    Object.assign(rec, {
      x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height,
      round: !!b.width && rad >= b.width * 0.45,
      cx: b.x + b.width / 2, cy: b.y + b.height / 2, rr: b.width / 2,
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    });
    // Keys of the OTHER targets this element contains (DOM containment).
    rec.contains = targets.filter((o, j) => j !== i && els[j] && el !== els[j] && el.contains(els[j])).map((o) => o.key);
    if (wantFonts && rec.visible) {
      let min = Infinity, at = null;
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n = 0;
      for (let tn = walk.nextNode(); tn && n < 200; tn = walk.nextNode()) {
        if (!tn.nodeValue || !tn.nodeValue.trim()) continue;
        const pe = tn.parentElement;
        if (!pe) continue;
        const pcs = getComputedStyle(pe);
        const pr = pe.getBoundingClientRect();
        if (pe.closest("[hidden]") || pcs.display === "none" || pcs.visibility === "hidden" || !(pr.width && pr.height)) continue;
        n++;
        const px = fontPx(pe);
        if (px < min) { min = px; at = tn.nodeValue.trim().slice(0, 24); }
      }
      rec.minFontPx = Number.isFinite(min) ? +min.toFixed(2) : null;
      rec.minFontText = at;
    }
    return rec;
  });
  return out;
}

/** Axis-aligned overlap with the spec's half-pixel tolerance. */
export function rectHit(a, d) {
  return !(a.r <= d.x + 0.5 || d.r <= a.x + 0.5 || a.b <= d.y + 0.5 || d.b <= a.y + 0.5);
}

/** Two controls clash: circles when both are round, else rects. */
export function controlClash(a, d) {
  return (a.round && d.round)
    ? Math.hypot(a.cx - d.cx, a.cy - d.cy) < a.rr + d.rr - 0.5
    : rectHit(a, d);
}

const nested = (a, d) => (a.contains || []).includes(d.key) || (d.contains || []).includes(a.key);

/** The spec's verdict over probe records. `ins` = {sal, sar, sat, sab}.
 *  Returns pair names as `${a.key}+${d.key}` in the spec's order. */
export function analyzeOverlap(records, W, H, ins = {}) {
  const i = { sal: 0, sar: 0, sat: 0, sab: 0, ...ins };
  // Round buttons sit on an ARC, diagonally offset, where two bounding rects
  // overlap while the circles are comfortably apart — so ctrl x ctrl is the
  // circle test. Any other role (an "overlay" such as #rotate-device) is
  // measured but never paired.
  const vis = records.filter((e) => e.visible && e.role === "ctrl");
  const hb = records.filter((e) => e.visible && e.role === "hud");
  const overlaps = [], hudClash = [];
  for (let x = 0; x < vis.length; x++)
    for (let y = x + 1; y < vis.length; y++)
      if (!nested(vis[x], vis[y]) && controlClash(vis[x], vis[y])) overlaps.push(`${vis[x].key}+${vis[y].key}`);
  for (const a of hb) for (const d of vis) if (!nested(a, d) && rectHit(a, d)) hudClash.push(`${a.key}+${d.key}`);
  for (let x = 0; x < hb.length; x++)
    for (let y = x + 1; y < hb.length; y++)
      if (!nested(hb[x], hb[y]) && rectHit(hb[x], hb[y])) hudClash.push(`${hb[x].key}+${hb[y].key}`);
  const unsafe = [...vis, ...hb].filter((e) => e.x < i.sal - 0.5 || e.r > W - i.sar + 0.5
                                || e.y < i.sat - 0.5 || e.b > H - i.sab + 0.5).map((e) => e.key);
  return { overlaps, hudClash, unsafe, count: vis.length };
}

/** Overlap area in px² (0 when apart) — the survey ranks overlaps by it. */
export function overlapArea(a, d) {
  const w = Math.min(a.r, d.r) - Math.max(a.x, d.x);
  const h = Math.min(a.b, d.b) - Math.max(a.y, d.y);
  return w > 0 && h > 0 ? w * h : 0;
}
