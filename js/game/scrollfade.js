"use strict";
// ScrollFade — the "there is more below" affordance for every menu scroll region.
//
// WHY THIS IS JS. Touch platforms hide scrollbars, so a list that is exactly
// full and a list that is cut off look identical — which is most of what "the
// menus feel crammed" means. The cure is to fade the edge that still has
// content behind it. CSS alone can do this with a scroll-driven animation
// (animation-timeline: scroll(self)), and that was the first implementation,
// but it does not survive this app: a scroll timeline resolves once, when the
// animation is CREATED, and these regions are created inside a [hidden] overlay
// and filled by JS afterwards — the timeline comes up inactive (currentTime
// null) and Chrome never revives it when the rows arrive, so the fade silently
// never ran. Measuring on scroll/resize/mutation is a few lines, needs no
// Safari 26, and cannot get stuck.
//
// The module owns no game state and self-initialises. CSS does all the
// painting: `.sf-t` / `.sf-b` in css/components.css.
window.ScrollFade = (function () {
  // Every menu scroll region — static in index.html, or filled later by
  // menus.js / setup-ui.js / tuner.js inside one of these containers.
  const SEL = [
    "#sel-body", "#sel-left", "#sel-tracks", "#sel-teams", "#cs-options", "#cs-tabs",
    ".pm-groups", ".panel-scroll", ".scroll-y",
    "#results-table", "#standings-body", "#howtoplay-inner dl",
    "#lt-rows", ".dh-content", "#track-detail-body",
  ].join(",");
  // Overlays whose [hidden] flip is what first gives their regions a box. The
  // data hub (#datahub) and track detail (#track-detail) are toggled by the
  // hidden attribute like the rest.
  const SCREENS = "#select,#teampicker,#carsetup,#howtoplay,#advanced,#pmsettings," +
    "#lighting,#results,#standings,#race-settings,#customize,#pausemenu," +
    "#datahub,#track-detail";

  const EDGE = 2;              // px of slack: sub-pixel layout must not flicker
  const watched = new WeakSet();
  let timer = 0;

  const MIN_THUMB = 24;        // px: a 2px sliver would be unreadable as a position

  function paint(el) {
    const max = el.scrollHeight - el.clientHeight;
    const scrollable = max > EDGE;
    el.classList.toggle("sf-t", scrollable && el.scrollTop > EDGE);
    el.classList.toggle("sf-b", scrollable && el.scrollTop < max - EDGE);
    // THE SCROLL POSITION INDICATOR. Touch platforms only show their own
    // scrollbar mid-gesture, so a panel gives no standing answer to "how much
    // is there, and where am I?" — the fade says there IS more, never how much.
    // These two custom properties are the whole geometry of a scrollbar thumb;
    // CSS draws it (see .sf-scroll in css/components.css).
    el.classList.toggle("sf-scroll", scrollable);
    if (scrollable) {
      const track = el.clientHeight;
      // proportional height, floored so a very long list still has a visible grip
      const thumb = Math.max(MIN_THUMB, Math.round(track * track / el.scrollHeight));
      const y = Math.round((el.scrollTop / max) * (track - thumb));
      el.style.setProperty("--sf-h", thumb + "px");
      el.style.setProperty("--sf-y", y + "px");
    } else {
      el.style.removeProperty("--sf-h");
      el.style.removeProperty("--sf-y");
    }
  }

  function paintAll() {
    timer = 0;
    document.querySelectorAll(SEL).forEach((el) => { watch(el); paint(el); });
  }

  // Coalesce with a TIMER, not requestAnimationFrame: menus.js swaps screens
  // inside document.startViewTransition, during which a queued frame callback
  // can be deferred past the next mutation — the "already queued" flag stays
  // set and the repaint never lands (that bug is why the first version of this
  // module appeared to do nothing). A timer is unaffected by rendering
  // suspension.
  function schedule() {
    if (timer) return;
    timer = setTimeout(paintAll, 0);
  }
  // Layout after a screen opens settles over several frames (web fonts, the
  // view transition, canvas sizing), so re-measure once things stop moving.
  function settle() { schedule(); setTimeout(paintAll, 120); setTimeout(paintAll, 400); }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  // Deliberately NOT one observer over document.body: the HUD rewrites classes
  // every frame during a race, and every callback would force a layout read.
  const contentMo = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  const screenMo = typeof MutationObserver === "function" ? new MutationObserver(settle) : null;

  function watch(el) {
    if (watched.has(el)) return;
    watched.add(el);
    if (ro) { ro.observe(el); for (const c of el.children) ro.observe(c); }
    if (contentMo) contentMo.observe(el, { childList: true, subtree: true });
  }

  function init() {
    // scroll does not bubble — capture catches every region with one listener
    document.addEventListener("scroll", (e) => {
      const t = e.target;
      if (t && t.nodeType === 1 && t.matches && t.matches(SEL)) paint(t);
    }, { capture: true, passive: true });
    window.addEventListener("resize", settle, { passive: true });
    window.addEventListener("orientationchange", settle, { passive: true });
    if (screenMo) {
      document.querySelectorAll(SCREENS).forEach((s) =>
        screenMo.observe(s, { attributes: true, attributeFilter: ["hidden"] }));
    }
    settle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { refresh: settle, paint };
})();
