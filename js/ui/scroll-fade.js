"use strict";
window.ScrollFade = (function () {
  const SEL = [
    ".pane", ".panel-scroll", ".scroll-y",
    ".dh-content",
    "#track-detail-panel", "#track-detail",
    "#overlay", "#menu-buttons",
    "#sel-tracks", "#sel-track-filter", "#htp-contents", "#cg-contents", "#ch-contents",
    ".dh-tabs", ".dh-pick-years", "#pm-settings-index", ".lt-tabs", ".cs-tab-row",
    "#cs-tabs",
    "#cr-body", ".td-rail",
  ].join(",");
  const SCREENS = "#select,#season-setup,#career,#career-offers,#career-history,#career-guide,#teampicker,#carsetup,#howtoplay,#pmsettings,#bench," +
    "#lighting,#camtune,#flyby,#freecam,#garrival,#tl-editor,#results,#quali,#standings,#race-settings,#duel-picker,#customize,#pausemenu," +
    "#datahub,#track-detail,#vsfriend,#spotifypanel,#trackdesigner," +
    "#overlay,#photo-studio";

  const EDGE = 2;
  const watched = new Set();
  let timer = 0;

  const MIN_THUMB = 24;
  const last = new WeakMap();

  function axisOk(v) { return v === "auto" || v === "scroll" || v === "overlay"; }

  function measure(el) {
    const track = el.clientHeight, trackW = el.clientWidth;
    if (!track && !trackW) {
      return {
        el, max: 0, scrollable: false, top: 0, thumb: 0, track: 0, pr: 0,
        maxX: 0, xScrollable: false, left: 0,
      };
    }
    const cs = getComputedStyle(el);
    const yOk = axisOk(cs.overflowY);
    const xOk = axisOk(cs.overflowX);
    const scrollH = el.scrollHeight;
    const scrollW = el.scrollWidth;
    const max = yOk ? scrollH - track : 0;
    const maxX = xOk ? scrollW - trackW : 0;
    const scrollable = max > EDGE;
    const xScrollable = maxX > EDGE;
    return {
      el, max, scrollable, top: el.scrollTop,
      thumb: scrollable ? Math.max(MIN_THUMB, Math.round(track * track / scrollH)) : 0,
      track,
      pr: Math.max(0, Math.floor(parseFloat(cs.paddingRight) || 0)),
      maxX, xScrollable, left: el.scrollLeft,
    };
  }

  function write(m) {
    const el = m.el;
    el.classList.toggle("sf-t", m.scrollable && m.top > EDGE);
    el.classList.toggle("sf-b", m.scrollable && m.top < m.max - EDGE);
    el.classList.toggle("sf-l", m.xScrollable && m.left > EDGE);
    el.classList.toggle("sf-r", m.xScrollable && m.left < m.maxX - EDGE);
    el.classList.toggle("sf-scroll", m.scrollable);
    if (!m.scrollable) {
      if (last.has(el)) {
        el.style.removeProperty("--sf-h");
        el.style.removeProperty("--sf-y");
        el.style.removeProperty("--sf-pr");
        last.delete(el);
      }
      return;
    }
    const y = Math.round((m.top / m.max) * (m.track - m.thumb));
    const prev = last.get(el);
    if (prev && prev.h === m.thumb && prev.y === y && prev.pr === m.pr) return;
    el.style.setProperty("--sf-h", `${m.thumb}px`);
    el.style.setProperty("--sf-y", `${y}px`);
    el.style.setProperty("--sf-pr", `${m.pr}px`);
    last.set(el, { h: m.thumb, y, pr: m.pr });
  }

  function paint(el) { write(measure(el)); }

  function skipUnderOpenSettings(el) {
    if (!document.getElementById) return false;
    const pm = document.getElementById("pmsettings");
    if (!pm || pm.hidden) return false;
    if (el.closest && el.closest("#pmsettings")) return false;
    const id = el.id;
    return id === "overlay" || id === "menu-buttons" || !!(el.closest && el.closest("#overlay"));
  }

  function paintAll() {
    timer = 0;
    pruneWatched();
    const els = document.querySelectorAll(SEL);
    const measured = [];
    els.forEach((el) => {
      if (el.closest && el.closest("[hidden]")) return;
      if (skipUnderOpenSettings(el)) return;
      watch(el);
      measured.push(measure(el));
    });
    for (const m of measured) write(m);
  }

  const SCHEDULE_MS = 48;
  function schedule() {
    if (timer) return;
    timer = setTimeout(paintAll, SCHEDULE_MS);
  }
  const scheduleFrame = typeof requestAnimationFrame === "function"
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(fn, 0);
  let viewportRaf = 0;
  function scheduleViewport() {
    if (viewportRaf) return;
    viewportRaf = scheduleFrame(() => {
      viewportRaf = 0;
      if (timer) { clearTimeout(timer); timer = 0; }
      paintAll();
    });
  }
  function pruneWatched() {
    let dropped = false;
    for (const el of watched) {
      if (el.isConnected) continue;
      watched.delete(el); last.delete(el);
      if (ro) ro.unobserve(el);
      dropped = true;
    }
    if (dropped && contentMo) {
      contentMo.disconnect();
      for (const el of watched) contentMo.observe(el, { childList: true, subtree: true });
    }
  }
  let settleSoon = 0;
  let settleLate = 0;
  function settle(immediate) {
    pruneWatched();
    if (immediate) {
      if (timer) { clearTimeout(timer); timer = 0; }
      paintAll();
    } else {
      schedule();
    }
    if (settleSoon) clearTimeout(settleSoon);
    if (settleLate) clearTimeout(settleLate);
    settleSoon = setTimeout(() => { settleSoon = 0; paintAll(); }, 120);
    settleLate = setTimeout(() => { settleLate = 0; paintAll(); }, 400);
  }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleViewport) : null;
  const contentMo = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  const screenMo = typeof MutationObserver === "function" ? new MutationObserver(() => settle(false)) : null;

  function watch(el) {
    if (watched.has(el)) return;
    watched.add(el);
    if (ro) ro.observe(el);
    if (contentMo) contentMo.observe(el, { childList: true, subtree: true });
  }

  function init() {
    Log.info("ui", "ScrollFade.init");
    document.addEventListener("scroll", (e) => {
      const t = e.target;
      if (t && t.nodeType === 1 && t.matches && t.matches(SEL)) paint(t);
    }, { capture: true, passive: true });
    document.addEventListener("toggle", (e) => {
      const t = e.target;
      if (t && t.tagName === "DETAILS") schedule();
    }, true);
    window.addEventListener("resize", () => settle(true), { passive: true });
    window.addEventListener("orientationchange", () => settle(true), { passive: true });
    if (screenMo) {
      document.querySelectorAll(SCREENS).forEach((s) =>
        screenMo.observe(s, { attributes: true, attributeFilter: ["hidden"] }));
    }
    settle();
  }

  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  return { refresh: () => settle(true), paint };
})();
