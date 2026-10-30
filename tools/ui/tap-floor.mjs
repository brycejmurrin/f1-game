// tap-floor — ONE tap-target floor and ONE measuring rule for the layout tools.
// @doc Shared tap floors (WCAG 24 + body `--tap`) and in-page measure (label union, ÷ zoom) for the layout tools.
// @skill survey-ui-matrix
//
// WHY ONE FILE. layout-audit judged taps against body `--tap` + 24, menu-mock
// against a hard 44 (touch) / 24 (pointer), fit-audit against 44 / 24 — and
// none of them measured the same box: only layout-audit took the <label> of a
// checkbox, and none divided out the `.sheet` zoom (`zoom: var(--ui-scale)`),
// so a 52 CSS-px row painted at 1.09 read as 57 and passed a floor it was
// never compared against in the right unit. Three tools, three answers for the
// same button. Here: the floors, and the rule, once.
//
// THE FLOORS.
//   wcag  — 24 CSS px, WCAG 2.2 SC 2.5.8 (AA): a CONFORMANCE floor; under it is
//           a defect (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
//   comfy — the game's own `--tap` token READ OFF <body> (css/tokens.css raises
//           it on `body:not(.desktop)`, so :root answers the desktop 44 on a
//           phone); 44 when unreadable. A house comfort target, not conformance.
// THE MEASURE (.claude/skills/survey-ui-matrix/references/probes.md §1):
//   - a checkbox/radio is activated by its whole <label>: measure the union;
//   - `--tap` is declared INSIDE the zoom, so compare in CSS px: divide the
//     painted box by `el.currentCSSZoom` (https://developer.mozilla.org/en-US/docs/Web/API/Element/currentCSSZoom).
//   - judge on min(width, height), as every tool did before this file, with
//     0.5 px of slack for the zoom division's rounding (52 × 1.15 ÷ 1.15).
//
// PAGE SIDE. A page.evaluate() function cannot import, so the same functions
// below are stringified into TAP_FLOOR_SRC, which installs `window.__apexTap`.
// Call `ensureTapFloor(page)` before a probe that uses it (idempotent; a
// navigation drops it, so call it per cell, not once per context).

export const WCAG_MIN = 24;
export const COMFY_FALLBACK = 44;
export const TAP_SLACK = 0.5;
// Bump when the rule changes, so cached cells (menu-mock's cellCache) re-measure.
export const TAP_RULE_VERSION = 1;

/** The two floors, from the body's computed `--tap` string ("52px", "" when unset). */
export function readFloors(tapVar) {
  const comfy = parseFloat(tapVar);
  return { wcag: WCAG_MIN, comfy: comfy > 0 ? comfy : COMFY_FALLBACK };
}

/** Union of two DOMRect-likes. */
export function unionRect(a, b) {
  const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right), bottom = Math.max(a.bottom, b.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Painted box → CSS px (the unit `--tap` is written in). */
export function toCssPx(rect, zoom) {
  const z = zoom > 0 ? zoom : 1;
  return { w: rect.width / z, h: rect.height / z };
}

/** {tiny: under WCAG 24, small: under the comfort floor}, on min(w, h). */
export function judgeTap(size, floors) {
  const m = Math.min(size.w, size.h);
  return { tiny: m < floors.wcag - TAP_SLACK, small: m < floors.comfy - TAP_SLACK };
}

/** In-page: the activation target of `el` — painted box (label union) plus its CSS-px size. */
export function measureTapTarget(el, root) {
  const r = el.getBoundingClientRect();
  let box = r;
  if (/^(checkbox|radio)$/.test(el.type || "")) {
    const scope = () => root || document;
    const lab = (el.closest && el.closest("label"))
      || (el.id && scope().querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (lab) {
      const lr = lab.getBoundingClientRect();
      if (lr.width >= 1 && lr.height >= 1) box = unionRect(r, lr);
    }
  }
  const zoom = el.currentCSSZoom > 0 ? el.currentCSSZoom : 1;
  const css = toCssPx(box, zoom);
  return { box, w: css.w, h: css.h, zoom };
}

export const TAP_FLOOR_SRC = `(() => {
  if (window.__apexTap && window.__apexTap.v === ${TAP_RULE_VERSION}) return true;
  const WCAG_MIN = ${WCAG_MIN}, COMFY_FALLBACK = ${COMFY_FALLBACK}, TAP_SLACK = ${TAP_SLACK};
  ${readFloors.toString()}
  ${unionRect.toString()}
  ${toCssPx.toString()}
  ${judgeTap.toString()}
  ${measureTapTarget.toString()}
  window.__apexTap = {
    v: ${TAP_RULE_VERSION}, WCAG_MIN, TAP_SLACK,
    floors: () => readFloors(getComputedStyle(document.body).getPropertyValue("--tap")),
    measure: measureTapTarget,
    judge: judgeTap,
  };
  return true;
})()`;

/** Install `window.__apexTap` in the page's current document. */
export async function ensureTapFloor(page) {
  await page.evaluate(TAP_FLOOR_SRC);
}
