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
  // Every menu scroll region. `.pane` FIRST and by class, because that is the
  // design system's own name for "a scroll region that says so" (see the header
  // of css/components.css) — enumerating them by id instead meant the list
  // silently drifted from the markup: #rs-body (RACE SETTINGS), #cz-body
  // (CUSTOMIZE), the STEERING & ASSISTS body and the pause menu are all panes
  // that were never selected, so they scrolled with no fade and no indicator at
  // all. Matching the class covers those and anything added later for free.
  // The rest are the scroll regions that are NOT panes.
  const SEL = [
    ".pane", ".panel-scroll", ".scroll-y",
    ".dh-content", "#track-detail-body",
    "#overlay",
  ].join(",");
  const SCREENS = "#select,#season-setup,#career,#career-offers,#career-history,#career-guide,#teampicker,#carsetup,#howtoplay,#advanced,#pmsettings," +
    "#lighting,#camtune,#audioset,#results,#quali,#standings,#race-settings,#customize,#pausemenu," +
    "#datahub,#track-detail,#vsfriend,#spotifypanel";

  const EDGE = 2;              // px of slack: sub-pixel layout must not flicker
  const watched = new WeakSet();
  let timer = 0;

  const MIN_THUMB = 24;        // px: a 2px sliver would be unreadable as a position
  const last = new WeakMap();  // last thumb written per element — see write()

  // READ ONLY. Never touch the DOM from here: measure() runs over every region
  // in one batch so the reads share a single layout, and write() applies the
  // results afterwards. Interleaved, each write invalidates layout and the next
  // scrollHeight read forces a fresh reflow — one per region rather than one for
  // the batch, and this now runs over every .pane on every menu mutation.
  function measure(el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") {
      return { el, max: 0, scrollable: false, top: 0, thumb: 0, track: el.clientHeight };
    }
    const scrollH = el.scrollHeight, track = el.clientHeight;
    const max = scrollH - track;
    const scrollable = max > EDGE;
    return {
      el, max, scrollable, top: el.scrollTop,
      // proportional height, floored so a very long list still has a visible grip
      thumb: scrollable ? Math.max(MIN_THUMB, Math.round(track * track / scrollH)) : 0,
      track,
    };
  }

  // WRITE ONLY, from values measure() already read.
  function write(m) {
    const el = m.el;
    el.classList.toggle("sf-t", m.scrollable && m.top > EDGE);
    el.classList.toggle("sf-b", m.scrollable && m.top < m.max - EDGE);
    // THE SCROLL POSITION INDICATOR. Touch platforms only show their own
    // scrollbar mid-gesture, so a panel gives no standing answer to "how much
    // is there, and where am I?" — the fade says there IS more, never how much.
    // These two custom properties are the whole geometry of a scrollbar thumb;
    // CSS draws it (see .sf-scroll in css/components.css).
    el.classList.toggle("sf-scroll", m.scrollable);
    if (!m.scrollable) {
      if (last.has(el)) {
        el.style.removeProperty("--sf-h");
        el.style.removeProperty("--sf-y");
        last.delete(el);
      }
      return;
    }
    const y = Math.round((m.top / m.max) * (m.track - m.thumb));
    const prev = last.get(el);
    if (prev && prev.h === m.thumb && prev.y === y) return;
    el.style.setProperty("--sf-h", m.thumb + "px");
    el.style.setProperty("--sf-y", y + "px");
    last.set(el, { h: m.thumb, y });
  }

  function paint(el) { write(measure(el)); }

  function paintAll() {
    timer = 0;
    const els = document.querySelectorAll(SEL);
    const measured = [];
    els.forEach((el) => {
      if (el.closest && el.closest("[hidden]")) return;
      watch(el);
      measured.push(measure(el));
    });
    for (const m of measured) write(m);
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
  let settleSoon = 0, settleLate = 0;
  function settle() {
    schedule();
    if (settleSoon) clearTimeout(settleSoon);
    if (settleLate) clearTimeout(settleLate);
    settleSoon = setTimeout(function () { settleSoon = 0; paintAll(); }, 120);
    settleLate = setTimeout(function () { settleLate = 0; paintAll(); }, 400);
  }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  const contentMo = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  const screenMo = typeof MutationObserver === "function" ? new MutationObserver(settle) : null;

  function watch(el) {
    if (watched.has(el)) return;
    watched.add(el);
    if (ro) ro.observe(el);
    if (contentMo) contentMo.observe(el, { childList: true, subtree: true });
  }

  function init() {
    Log.info("ui", "ScrollFade.init");
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

  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { refresh: settle, paint };
})();
