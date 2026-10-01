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
