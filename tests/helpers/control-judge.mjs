// @ts-check
/**
 * control-judge.mjs — is a NAMED control on screen and tappable, measured the way a thumb meets it (#5242).
 *
 * A unit test that reads css/ as text cannot see a control vanish: four game-breaking overrides (RESUME hidden,
 * PAUSE 130x130, title doors 8 px tall, pedals off-screen) survived all 127 CSS-reading unit files
 * (issue #5242 §T1). A DOM `.click()` reaches a hidden, clipped or covered button
 * just as well. This judge asks the page what a player gets: the element exists, is rendered, paints at least
 * `min` px on its short side (and at most `max`, where the control has a fixed size), sits inside the window
 * (and the safe box, where asked), and owns the point at the centre of its own rect (`elementFromPoint`).
 *
 * `probeControls(page, ids, insets)` runs in the page and returns one raw probe per id; `judgeControl(probe,
 * rule)` is pure and returns the list of faults (empty = pass), so the verdict logic is unit-tested
 * without a browser (tests/unit/control-judge.test.mjs) and the spec only collects probes and asserts.
 */

/** @typedef {{ id: string, exists: boolean, rendered: boolean, w: number, h: number, left: number, top: number, right: number, bottom: number, vw: number, vh: number, insets: { top: number, left: number, bottom: number, right: number }, hit: boolean, hitBy: string }} ControlProbe */
/** @typedef {{ min?: number, max?: number, safe?: boolean }} ControlRule */
/** @typedef {{ id: string, code: "missing"|"hidden"|"small"|"oversize"|"offscreen"|"unsafe"|"covered", msg: string }} ControlFault */

/**
 * Pure verdict. Each fault is one broken promise: a stable `code` and a `msg` worded for the failure message.
 * @param {ControlProbe} p
 * @param {ControlRule} [rule]
 * @returns {ControlFault[]}
 */
export function judgeControl(p, rule = {}) {
  const min = rule.min ?? 44;
  const id = p ? p.id : "?";
  /** @type {ControlFault[]} */
  const bad = [];
  const f = (code, msg) => bad.push({ id, code, msg: `${id}: ${msg}` });
  if (!p || !p.exists) { f("missing", "not in the DOM"); return bad; }
  if (!p.rendered) { f("hidden", "not rendered (hidden, display:none, visibility:hidden or opacity 0)"); return bad; }
  const short = Math.min(p.w, p.h);
  if (short < min - 0.5) f("small", `paints ${fmt(p.w)}x${fmt(p.h)}, short side under ${min} px`);
  if (rule.max != null && Math.max(p.w, p.h) > rule.max + 0.5) f("oversize", `paints ${fmt(p.w)}x${fmt(p.h)}, over its fixed ${rule.max} px`);
  if (p.left < -0.5 || p.top < -0.5 || p.right > p.vw + 0.5 || p.bottom > p.vh + 0.5) {
    f("offscreen", `rect ${fmt(p.left)},${fmt(p.top)}..${fmt(p.right)},${fmt(p.bottom)} leaves the ${p.vw}x${p.vh} window`);
  } else if (rule.safe) {
    const i = p.insets;
    if (p.left < i.left - 0.5 || p.right > p.vw - i.right + 0.5 || p.top < i.top - 0.5 || p.bottom > p.vh - i.bottom + 0.5) {
      f("unsafe", `rect ${fmt(p.left)},${fmt(p.top)}..${fmt(p.right)},${fmt(p.bottom)} is under the notch or home bar (insets ${JSON.stringify(i)})`);
    }
  }
  if (!p.hit) f("covered", `a tap at its centre lands on ${p.hitBy}, not on the control`);
  return bad;
}

const fmt = (n) => String(Math.round(n * 10) / 10);

/**
 * In-page probe of each id. `insets` are the safe-area insets the cell set (CSS px).
 * @param {import("@playwright/test").Page} page
 * @param {string[]} ids
 * @param {{ top: number, left: number, bottom: number, right: number }} insets
 * @returns {Promise<ControlProbe[]>}
 */
export function probeControls(page, ids, insets) {
  return page.evaluate(({ ids, insets }) => ids.map((id) => {
    const el = document.getElementById(id);
    const vw = window.innerWidth, vh = window.innerHeight;
    const base = { id, exists: !!el, rendered: false, w: 0, h: 0, left: 0, top: 0, right: 0, bottom: 0, vw, vh, insets, hit: false, hitBy: "nothing" };
    if (!el) return base;
    const r = el.getBoundingClientRect();
    let shown = !el.closest("[hidden]") && r.width > 0 && r.height > 0;
    for (let n = el; shown && n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) shown = false;
    }
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const t = shown ? document.elementFromPoint(x, y) : null;
    return { ...base, rendered: shown, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      hit: !!t && (t === el || el.contains(t)), hitBy: t ? (t.id ? "#" + t.id : (t.tagName.toLowerCase() + (t.className && typeof t.className === "string" ? "." + t.className.trim().split(/\s+/).join(".") : ""))) : "nothing" };
  }), { ids, insets });
}

/**
 * Probe and judge a named set; returns every fault across it as its message (empty = all pass).
 * @param {import("@playwright/test").Page} page
 * @param {Record<string, ControlRule>} named
 * @param {{ top: number, left: number, bottom: number, right: number }} insets
 */
export async function judgeNamed(page, named, insets) {
  const probes = await probeControls(page, Object.keys(named), insets);
  return probes.flatMap((p) => judgeControl(p, named[p.id])).map((x) => x.msg);
}
