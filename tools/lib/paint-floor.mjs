// @doc PAINTED size of every on-screen control and text node (own px × zoom × transform): what a thumb and an eye get.
// paint-floor.mjs — the measure the fit tools did not have (issues #5234, #5262; docs/notes/TOOLING-HUNT-2026-11-09.md).
//
// WHY. tools/ui/tap-floor.mjs divides every rect by `currentCSSZoom` on purpose (it compares with `--tap`, which is
// declared inside the zoom) and fit-audit reads `getComputedStyle().fontSize` (own px). Both answer "does the layout
// fit"; neither answers "can it be read or hit". A sheet at UI SIZE 51 % reports a 102x48 chip and 14 px type while
// the screen shows 52x24 and 7 px. This file measures the SCREEN: `getBoundingClientRect()` (post-zoom, post-transform)
// for a control, computed font size × `currentCSSZoom` × the accumulated transform scale for text.
//
// FLOORS. 44 CSS px is Apple's HIG / WCAG 2.5.5 (AAA) target and this game's own touch comfort floor; 12 px is the
// type floor the owner's-phone acceptance brief set (#5262). House choices, not standards: change them here. They are
// painted CSS px: the device pixel ratio does not enter (a CSS px is the same physical size at DPR 1 and 3).
//
// WHAT COUNTS. Inside a root, visible (checkVisibility), with a box of at least 1x1 whose VISIBLE part (the box
// clipped by every scrolling or clipping ancestor and the viewport) is more than a sliver at a scroll edge.
//   taps     a control, HIT-TESTED at the centre of its visible part. A checkbox or radio is its <label> union.
//   blocked  a control whose centre another element takes (elementFromPoint names something outside it): the player
//            cannot press it there. A blocked control is not sized.
//   text     every text node with a non-space character. Text inside a `pointer-events: none` layer (most of the race
//            HUD) cannot be hit-tested, so it counts when visible; other text must own its centre.
//   outside  a tap or text whose visible part crosses the SAFE BOX (the viewport minus the env() insets).
//   scroll   the page itself scrolls (the document is larger than the window, or is scrolled).

export const TAP_PAINT_MIN = 44;
export const TEXT_PAINT_MIN = 12;
export const PAINT_SLACK = 0.5;
/** The violation kinds a ceiling records, in report order. */
export const PAINT_KINDS = Object.freeze(["taps", "text", "outside", "blocked", "scroll"]);

/**
 * In-page (page.evaluate): the raw painted boxes under `roots` (a selector, or a list of them). No floors here;
 * `summarisePaint` judges. `insets` is { top, left, bottom, right } in CSS px (the safe-area the cell emulates).
 */
export function measurePaintInPage({ roots = "body", insets = null } = {}) {
  const selectors = Array.isArray(roots) ? roots : [roots];
  const rootEls = selectors.flatMap((s) => [...document.querySelectorAll(s)]);
  const vw = innerWidth, vh = innerHeight;
  const ins = { top: 0, left: 0, bottom: 0, right: 0, ...(insets || {}) };
  const safe = { left: ins.left, top: ins.top, right: vw - ins.right, bottom: vh - ins.bottom };
  const name = (el) => {
    const id = el.id ? "#" + el.id : "";
    const cls = !id && el.classList && el.classList.length ? "." + [...el.classList].slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + id + cls;
  };
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true);
  // Painted px per own px: CSS zoom, times every ancestor's transform scale (vertical: it is type height we judge).
  const scaleCache = new Map();
  const transformScale = (el) => {
    if (!el || el === document.documentElement) return 1;
    if (scaleCache.has(el)) return scaleCache.get(el);
    let own = 1;
    const t = getComputedStyle(el).transform;
    if (t && t !== "none") { try { const m = new DOMMatrixReadOnly(t); own = Math.hypot(m.c, m.d) || 1; } catch (_) { own = 1; } }
    const s = own * transformScale(el.parentElement);
    scaleCache.set(el, s);
    return s;
  };
  const zoomOf = (el) => (el.currentCSSZoom > 0 ? el.currentCSSZoom : 1);
  const paintScale = (el) => zoomOf(el) * transformScale(el);
  // The part of `r` a player can see: clipped by each ancestor that scrolls or clips, then by the viewport.
  const clipCache = new Map();
  const clips = (el) => {
    if (clipCache.has(el)) return clipCache.get(el);
    const cs = getComputedStyle(el);
    const v = /(auto|scroll|hidden|clip)/.test(cs.overflowX + cs.overflowY);
    clipCache.set(el, v);
    return v;
  };
  const visiblePart = (el, r) => {
    let left = Math.max(r.left, 0), top = Math.max(r.top, 0), right = Math.min(r.right, vw), bottom = Math.min(r.bottom, vh);
    const fixed = getComputedStyle(el).position === "fixed";
    for (let a = fixed ? null : el.parentElement; a && a !== document.documentElement && a !== document.body; a = a.parentElement) {
      if (clips(a)) {
        const c = a.getBoundingClientRect();
        left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
      }
      if (getComputedStyle(a).position === "fixed") break;
    }
    return right - left >= 1 && bottom - top >= 1 ? { left, top, right, bottom } : null;
  };
  const outsideSafe = (v) => v.left < safe.left - 0.5 || v.top < safe.top - 0.5 || v.right > safe.right + 0.5 || v.bottom > safe.bottom + 0.5;
  const union = (a, b) => {
    const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top), right = Math.max(a.right, b.right), bottom = Math.max(a.bottom, b.bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  const box = (v) => `${Math.round(v.left)},${Math.round(v.top)} ${Math.round(v.right - v.left)}x${Math.round(v.bottom - v.top)}`;
  const TAP = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=slider], [role=option], [role=menuitem], [tabindex]:not([tabindex='-1'])";
  const taps = [], blocked = [], texts = [], outside = [];
  const seen = new Set();
  for (const root of rootEls) {
    for (const el of root.querySelectorAll(TAP)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.disabled || el.closest("[inert]") || !visible(el)) continue;
      let r = el.getBoundingClientRect();
      let target = el;
      if (/^(checkbox|radio)$/.test(el.type || "")) {
        const lab = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
        if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width >= 1 && lr.height >= 1) { r = union(r, lr); target = lab; } }
      }
      if (r.width < 1 || r.height < 1) continue;
      const v = visiblePart(target, r);
      // A sliver left at a scroll edge (under 8 px of a control showing) is on its way out, not a control to press.
      if (!v || Math.min(v.right - v.left, v.bottom - v.top) < Math.min(8, r.width, r.height)) continue;
      const top = document.elementFromPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2);
      if (!top || !(top === target || target.contains(top) || top === el)) {
        // A pointer-events:none control is display, not a control (a HUD readout with role=button semantics).
        if (getComputedStyle(target).pointerEvents === "none") continue;
        blocked.push({ el: name(el), by: top ? name(top) : "nothing", at: box(v) });
        continue;
      }
      taps.push({ el: name(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), scale: +paintScale(el).toFixed(3) });
      if (outsideSafe(v)) outside.push({ el: name(el), kind: "tap", at: box(v) });
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (seen.has(n)) continue;
      seen.add(n);
      const s = n.nodeValue.trim();
      const el = n.parentElement;
      if (!s || !el || /^(script|style|noscript|template|option)$/i.test(el.tagName) || el.closest("[aria-hidden='true'], [inert]") || !visible(el)) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const v = visiblePart(el, r);
      // Text more than half cut off by a scroll edge is not being read there.
      if (!v || v.bottom - v.top < r.height / 2) continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents !== "none") {
        const top = document.elementFromPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2);
        if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
      }
      const own = parseFloat(cs.fontSize);
      if (!(own > 0)) continue;
      const scale = paintScale(el);
      texts.push({ el: name(el), text: s.slice(0, 24), px: +(own * scale).toFixed(2), own: +own.toFixed(2), scale: +scale.toFixed(3) });
      if (outsideSafe(v)) outside.push({ el: name(el), kind: "text", at: box(v), text: s.slice(0, 24) });
    }
  }
  const se = document.scrollingElement || document.documentElement;
  const scroll = { x: Math.max(0, se.scrollWidth - vw), y: Math.max(0, se.scrollHeight - vh), left: Math.round(scrollX), top: Math.round(scrollY) };
  return { roots: selectors, rootsFound: rootEls.length, rootsVisible: rootEls.filter(visible).length, viewport: { width: vw, height: vh }, safe, taps, blocked, texts, outside, scroll };
}

/**
 * Pure: raw boxes → the cell's `paint` block. A tap is judged on min(w, h), like every tap rule in the tree.
 * `under` counts are what a ceiling records; `worst` lists name the first `keep` offenders, smallest first.
 */
export function summarisePaint(raw, { tapMin = TAP_PAINT_MIN, textMin = TEXT_PAINT_MIN, keep = 5 } = {}) {
  const side = (t) => Math.min(t.w, t.h);
  const taps = [...(raw.taps || [])].sort((a, b) => side(a) - side(b) || a.el.localeCompare(b.el));
  const texts = [...(raw.texts || [])].sort((a, b) => a.px - b.px || a.el.localeCompare(b.el));
  const underTaps = taps.filter((t) => side(t) < tapMin - PAINT_SLACK);
  const underText = texts.filter((t) => t.px < textMin - PAINT_SLACK);
  const outside = raw.outside || [], blocked = raw.blocked || [];
  const sc = raw.scroll || { x: 0, y: 0, left: 0, top: 0 };
  const scrolls = sc.x > 1 || sc.y > 1 || sc.left !== 0 || sc.top !== 0;
  return {
    floors: { tap: tapMin, text: textMin },
    taps: { n: taps.length, under: underTaps.length, smallest: taps[0] ? { el: taps[0].el, w: taps[0].w, h: taps[0].h } : null, worst: underTaps.slice(0, keep).map((t) => `${t.el} ${t.w}x${t.h}`) },
    text: { n: texts.length, under: underText.length, smallest: texts[0] ? { el: texts[0].el, px: texts[0].px, text: texts[0].text } : null, worst: underText.slice(0, keep).map((t) => `${t.el} ${t.px}px "${t.text}"`) },
    outside: { under: outside.length, worst: outside.slice(0, keep).map((o) => `${o.el} ${o.kind} at ${o.at}`) },
    blocked: { under: blocked.length, worst: blocked.slice(0, keep).map((b) => `${b.el} under ${b.by} at ${b.at}`) },
    scroll: { under: scrolls ? 1 : 0, worst: scrolls ? [`page scrolls: +${sc.x}x+${sc.y} px beyond the window, at ${sc.left},${sc.top}`] : [] },
  };
}

/** Pure: the violation counts of a `paint` block — the shape a ceiling has. */
export function paintCounts(p) {
  return Object.fromEntries(PAINT_KINDS.map((k) => [k, p[k].under]));
}

/** Pure: one log line for a `paint` block. */
export function paintLine(p) {
  const tap = p.taps.smallest ? `${Math.min(p.taps.smallest.w, p.taps.smallest.h)}px ${p.taps.smallest.el}` : "none";
  const txt = p.text.smallest ? `${p.text.smallest.px}px ${p.text.smallest.el}` : "none";
  return `taps under ${p.floors.tap}px ${p.taps.under}/${p.taps.n} (smallest ${tap}); text under ${p.floors.text}px ${p.text.under}/${p.text.n} (smallest ${txt}); outside safe box ${p.outside.under}; blocked ${p.blocked.under}; page scroll ${p.scroll.under ? "YES" : "no"}`;
}

const KIND_WORDS = { taps: (p) => `tap target(s) paint under ${p.floors.tap}px`, text: (p) => `text node(s) paint under ${p.floors.text}px`,
  outside: () => "item(s) cross the safe box", blocked: () => "control(s) covered at their centre", scroll: () => "page scroll" };

/**
 * Pure: a painted cell against a ceiling of known violations ({} = the hard floor, every kind 0). A count ABOVE the
 * ceiling is a regression; a count BELOW it is a stale ceiling, which is also a failure, so the number only ratchets
 * down and reaches 0 when the product is fixed.
 * @returns {string[]} failures; [] = holds.
 */
export function judgePaint(p, ceiling = {}, label = "cell") {
  const out = [];
  for (const k of PAINT_KINDS) {
    const got = p[k].under, cap = ceiling[k] ?? 0;
    if (got > cap) out.push(`${label}: ${got} ${KIND_WORDS[k](p)}, ceiling ${cap} — ${p[k].worst.join("; ")}`);
    else if (got < cap) out.push(`${label}: ${got} ${KIND_WORDS[k](p)}, below the recorded ceiling ${cap} — lower the ceiling to ${got} (it only ratchets down)`);
  }
  return out;
}
