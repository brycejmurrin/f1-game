// Shared finite-transition readiness; decorative infinite animations do not block capture.
// @doc Serializable menu readiness predicate, used with bounded Playwright polling.
export function menuReady(sel) {
  const el = document.querySelector(sel);
  if (!el) return true; // audit records missing roots as findings
  const animations = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
  const pending = animations.some((a) => {
    if (a.playState !== "running" && a.playState !== "pending") return false;
    const timing = a.effect?.getComputedTiming?.();
    return !timing || (timing.iterations !== Infinity && timing.endTime !== Infinity);
  });
  const style = getComputedStyle(el);
  return !pending && Number(style.opacity) > 0 && style.visibility !== "hidden" && style.display !== "none";
}

// THE CIRCUIT PREVIEW HAS SETTLED: js/ui/select-screen.js has fitted and drawn
// #sel-preview-map, or the bounded wait gives up and the probe measures what is
// there. Serializable (page.waitForFunction ships its source), so no closures.
// A draw stamps `data-drawn`; before it the canvas holds the shell's 520x300
// attribute default and nothing else, which an aspect-only check accepted at
// once wherever the box still matched that buffer (both iPad cells read
// `map 520x300 BLANK` on 2026-10-05 while the real draw was seconds away). So:
// drawn, or — for a build without the stamp — off the default buffer or inked,
// and in every case a real buffer whose aspect matches its box.
export function previewMapSettled() {
  const cv = document.getElementById("sel-preview-map");
  if (!cv || typeof cv.getContext !== "function") return true; // nothing to wait for
  if (cv.width <= 8 || cv.height <= 8) return false;
  if (!cv.hasAttribute("data-drawn") && cv.width === 520 && cv.height === 300) {
    let inked = false;
    try {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { inked = true; break; }
    } catch (_) { inked = false; }
    if (!inked) return false;
  }
  const r = cv.getBoundingClientRect();
  const z = cv.currentCSSZoom || 1;
  const bufferAspect = cv.width / cv.height;
  const boxAspect = (r.width / z) / Math.max(1, r.height / z);
  return Math.abs(bufferAspect - boxAspect) / Math.max(bufferAspect, boxAspect, 0.001) < 0.03;
}
