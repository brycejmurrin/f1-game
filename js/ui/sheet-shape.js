"use strict";
window.SheetShape = (function () {
  const TALL_FALLBACK = 1.05;
  const TALL_HYST = 0.10;
  function tallOn() {
    const b = document.body;
    const raw = b ? getComputedStyle(b).getPropertyValue("--tall-at") : "";
    const v = parseFloat(raw);
    return v > 0 ? v : TALL_FALLBACK;
  }

  const PAIR_HYST = 8;
  const RAIL_HYST = 12;
  const WIDE_HYST = 16;
  const PAGE_HYST = 12;

  function classifyFlag(el, w, cssVar, attr, hyst, onVal = "on", offVal = "off") {
    const raw = getComputedStyle(el).getPropertyValue(cssVar);
    const at = parseFloat(raw);
    if (!at) { if (el.dataset[attr]) delete el.dataset[attr]; return; }
    const was = el.dataset[attr] === onVal;
    const now = was ? w >= at - hyst : w >= at;
    const next = now ? onVal : offVal;
    if (el.dataset[attr] !== next) el.dataset[attr] = next;
  }

  function classifyPair(el, w) {
    const mode = getComputedStyle(el).getPropertyValue("--pair-compact").trim();
    if (el.dataset.density === "compact" && mode === "off") {
      if (el.dataset.pair !== "off") el.dataset.pair = "off";
      return;
    }
    if (el.dataset.density === "compact" && mode === "wide") {
      const next = el.dataset.shape === "tall" ? "off" : "on";
      if (el.dataset.pair !== next) el.dataset.pair = next;
      return;
    }
    classifyFlag(el, w, "--pair-at", "pair", PAIR_HYST);
  }
  function classifyRail(el, w, h) {
    const raw = getComputedStyle(el).getPropertyValue("--rail-at");
    const at = parseFloat(raw);
    if (!at) { if (el.dataset.rail) delete el.dataset.rail; return; }
    const was = el.dataset.rail === "on";
    let now = was ? w >= at - RAIL_HYST : w >= at;
    if ((el.id === "lighting-inner" || el.id === "camtune-inner")
        && el.dataset.density === "compact") {
      const row = el.querySelector(".adv-item");
      const rowH = (row && row.offsetHeight) || 42;
      const foot = el.querySelector(":scope > .sheet-foot");
      const footH = foot ? foot.offsetHeight : 0;
      const rowsAvail = (h - footH) / Math.max(24, rowH);
      now = now && (was ? rowsAvail >= 2.5 : rowsAvail >= 3);
    }
    const next = now ? "on" : "off";
    if (el.dataset.rail !== next) el.dataset.rail = next;
  }

  const SHORT_DEFAULT = 380;
  const SHORT_HYST = 40;
  const FIT_HYST = 0.03;

  function viewportPx() {
    const r = document.documentElement;
    const w = r ? r.clientWidth : 0, h = r ? r.clientHeight : 0;
    return (w > 0 && h > 0) ? [w, h] : [window.innerWidth, window.innerHeight];
  }

  function classifyFit(el) {
    const cs = getComputedStyle(el);
    const at = parseFloat(cs.getPropertyValue("--fit-at"));
    if (!at) {
      if (el.style.getPropertyValue("--sheet-scale")) el.style.removeProperty("--sheet-scale");
      if (el.parentElement && el.parentElement.style.getPropertyValue("--sheet-eff-scale")) {
        el.parentElement.style.removeProperty("--sheet-eff-scale");
      }
      if (el.dataset.fit) delete el.dataset.fit;
      return;
    }
    const host = el.parentElement;
    if (!host) return;
    const hs = getComputedStyle(host);
    const available = host.clientHeight
      - (parseFloat(hs.paddingTop) || 0) - (parseFloat(hs.paddingBottom) || 0);
    if (!available) return;
    const desired = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-scale")) || 1;
    const floor = Math.min(1, desired);
    let fitted = Math.max(floor, Math.min(desired, available / at));
    const prev = parseFloat(el.style.getPropertyValue("--sheet-scale"));
    if (prev >= floor && fitted < desired - 0.001 && Math.abs(fitted - prev) <= FIT_HYST) fitted = prev;
    const capped = fitted < desired - 0.001;
    const next = capped ? String(Math.round(fitted * 1000) / 1000) : "";
    if (el.style.getPropertyValue("--sheet-scale") !== next) {
      if (next) el.style.setProperty("--sheet-scale", next);
      else el.style.removeProperty("--sheet-scale");
      if (next) host.style.setProperty("--sheet-eff-scale", next);
      else host.style.removeProperty("--sheet-eff-scale");
    }
    const state = capped ? "on" : "off";
    if (el.dataset.fit !== state) el.dataset.fit = state;
  }

  function roomOwn(el, hOwn) {
    if (el === document.body) return hOwn;
    const host = el.parentElement;
    if (!host) return hOwn;
    const hs = getComputedStyle(host);
    const avail = host.clientHeight
      - (parseFloat(hs.paddingTop) || 0) - (parseFloat(hs.paddingBottom) || 0);
    if (!(avail > 0)) return hOwn;
    const sheetScale = parseFloat(getComputedStyle(el).getPropertyValue("--sheet-scale"));
    const uiScale = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--ui-scale"));
    let z = sheetScale > 0 ? sheetScale : (uiScale > 0 ? uiScale : 0);
    if (!(z > 0)) {
      z = (window.CssZoom ? CssZoom.of(el) / CssZoom.of(host) : 1) || 1;
    } else {
      const hostZ = (window.CssZoom ? CssZoom.of(host) : 1) || 1;
      z = z / (hostZ || 1);
    }
    return Math.max(hOwn, avail / z);
  }

  function classifyDensity(el, hOwn) {
    const raw = getComputedStyle(el).getPropertyValue("--compact-at");
    const at = parseFloat(raw) || SHORT_DEFAULT;
    const was = el.dataset.density === "compact";
    const h = roomOwn(el, hOwn);
    const now = was ? h < at + SHORT_HYST : h < at;
    const next = now ? "compact" : "normal";
    if (el.dataset.density !== next) el.dataset.density = next;
    if (next === "compact" && el.classList.contains("lt-show-help")) {
      el.classList.remove("lt-show-help");
      const help = el.querySelector("#lt-help-on, #ct-help-on");
      if (help) help.checked = false;
    }
  }

  function classifyPage(el, hOwn) {
    const at = parseFloat(getComputedStyle(el).getPropertyValue("--page-at"));
    if (!at) { if (el.dataset.page) delete el.dataset.page; return; }
    const was = el.dataset.page === "on";
    const h = roomOwn(el, hOwn);
    const now = was ? h < at + PAGE_HYST : h < at;
    const next = now ? "on" : "off";
    if (el.dataset.page !== next) el.dataset.page = next;
  }

  function measureAll(els) {
    const out = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const r = el.getBoundingClientRect();
      out.push({ el: el, w: r.width, h: r.height });
    }
    return out;
  }
  function classifyAll(measured) {
    for (let i = 0; i < measured.length; i++) {
      const m = measured[i];
      classify(m.el, m.w, m.h);
    }
  }

  function classify(el, w, h) {
    if (!w || !h) return;
    classifyFit(el);
    const ratio = h / w;
    const was = el.dataset.shape;
    const on = tallOn(), off = on - TALL_HYST;
    const now = was === "tall" ? (ratio <= off ? "wide" : "tall")
      : (ratio >= on ? "tall" : "wide");
    if (now !== was) el.dataset.shape = now;
    const box = (window.CssZoom && CssZoom.localBox(el)) || { w: 0, h: 0 };
    const wOwn = box.w || w;
    const hOwn = box.h || h;
    classifyDensity(el, hOwn);
    classifyPage(el, hOwn);
    classifyRail(el, wOwn, hOwn);
    classifyPair(el, wOwn);
  }

  let ro = null;
  const seen = new Set();
  const wasLive = new WeakSet();

  function observe(el) {
    if (!el || seen.has(el)) return;
    seen.add(el);
    if (el.isConnected) wasLive.add(el);
    const r = el.getBoundingClientRect();
    classify(el, r.width, r.height);
    if (ro) ro.observe(el);
  }

  const MANAGED = ".sheet, .fit-managed";
  function scan(root) {
    (root || document).querySelectorAll(MANAGED).forEach(observe);
  }

  function watchVisibility() {
    if (typeof MutationObserver !== "function") return;
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName !== "hidden" || m.target.hidden) continue;
        const nodes = m.target.querySelectorAll(MANAGED);
        const els = [];
        for (let i = 0; i < nodes.length; i++) els.push(nodes[i]);
        classifyAll(measureAll(els));
      }
    }).observe(document.documentElement,
      { attributes: true, attributeFilter: ["hidden"], subtree: true });
  }

  function classifyBody() {
    const b = document.body;
    if (!b) return;
    const scale = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    const [vw, vh] = viewportPx();
    const wOwn = vw / scale;
    const hOwn = vh / scale;
    classifyDensity(b, hOwn);
    classifyFlag(b, wOwn, "--wide-at", "width", WIDE_HYST, "wide", "narrow");
    const ratio = hOwn / wOwn;
    const wasShape = b.dataset.shape;
    const onB = tallOn(), offB = onB - TALL_HYST;
    const nowShape = wasShape === "tall" ? (ratio <= offB ? "wide" : "tall")
      : (ratio >= onB ? "tall" : "wide");
    if (nowShape !== wasShape) {
      b.dataset.shape = nowShape;
      const ov = document.getElementById("overlay");
      const mb = document.getElementById("menu-buttons");
      if (ov) ov.scrollTop = 0;
      if (mb) mb.scrollTop = 0;
    }
  }

  function drop(el) {
    seen.delete(el);
    if (ro) { try { ro.unobserve(el); } catch (_) {  } }
  }

  function pruneSeen() {
    seen.forEach((el) => {
      if (el.isConnected) { wasLive.add(el); return; }
      if (wasLive.has(el)) drop(el);
    });
  }

  function reclassify() {
    const els = [];
    seen.forEach((el) => {
      if (!el.isConnected) {
        if (wasLive.has(el)) { drop(el); return; }
      } else wasLive.add(el);
      els.push(el);
    });
    classifyAll(measureAll(els));
    classifyBody();
  }

  function watchScale() {
    if (typeof MutationObserver !== "function") return;
    let lastScale = document.documentElement.style.getPropertyValue("--ui-scale");
    let raf = 0, generation = 0;
    new MutationObserver(() => {
      const s = document.documentElement.style.getPropertyValue("--ui-scale");
      if (s === lastScale) return;
      lastScale = s;
      const revision = ++generation;
      if (raf) cancelAnimationFrame(raf);
      const settle = (again) => {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (revision !== generation) return;
          reclassify();
          if (again) settle(false);
        });
      };
      settle(true);
    }).observe(document.documentElement,
      { attributes: true, attributeFilter: ["style"] });
  }

  let applyKeyboard = () => {};

  function watchKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    let last = -1;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const lh = viewportPx()[1];
      let kb = Math.max(0, lh - vv.height - vv.offsetTop);
      if (vv.scale > 1.01 || kb < lh * 0.15) kb = 0;
      kb = Math.round(kb);
      if (kb === last) return;
      last = kb;
      const st = document.documentElement.style;
      if (kb) st.setProperty("--kb", `${kb}px`);
      else st.removeProperty("--kb");
      void document.documentElement.offsetHeight;
      reclassify();
      const ae = document.activeElement;
      if (kb && ae && ae.matches && ae.matches("input,textarea,[contenteditable]")) {
        ae.scrollIntoView({ block: "nearest" });
      }
    };
    applyKeyboard = apply;
    const onvv = () => { if (!raf) raf = requestAnimationFrame(apply); };
    vv.addEventListener("resize", onvv, { passive: true });
    vv.addEventListener("scroll", onvv, { passive: true });
    addEventListener("resize", onvv, { passive: true });
    addEventListener("orientationchange", onvv, { passive: true });
  }

  const SETTLE_MS = [250, 700, 1500];
  let settleTimers = [];
  let focusKeptAt = "";
  function keepFocusVisible() {
    const size = viewportPx().join("x");
    if (size === focusKeptAt) return;
    focusKeptAt = size;
    const el = document.activeElement, UL = window.UiLayers;
    const layer = el && el.scrollIntoView && UL && UL.top && UL.top();
    if (!layer || el === layer || !layer.contains(el)) return;
    const sc = (v) => v === "auto" || v === "scroll";
    for (let p = el.parentElement; p; p = p === layer ? null : p.parentElement) {
      const h = p.scrollHeight - p.clientHeight > 1, w = p.scrollWidth - p.clientWidth > 1;
      const cs = (h || w) && getComputedStyle(p);
      if (!cs || !((h && sc(cs.overflowY)) || (w && sc(cs.overflowX)))) continue;
      const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
      if (a.top < b.top - 1 || a.bottom > b.bottom + 1 || a.left < b.left - 1 || a.right > b.right + 1) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
  }
  function settleViewport() {
    reclassify();
    applyKeyboard();
    keepFocusVisible();
    if (window.ScrollFade && typeof window.ScrollFade.refresh === "function") {
      window.ScrollFade.refresh();
    }
  }
  function onViewport() {
    settleViewport();
    settleTimers.forEach(clearTimeout);
    settleTimers = SETTLE_MS.map((ms) => setTimeout(settleViewport, ms));
  }

  function init() {
    Log.info("ui", "SheetShape.init");
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver((entries) => {
        const measured = [];
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const r = e.target.getBoundingClientRect();
          const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
          if (e.target._apexBox === key) continue;
          e.target._apexBox = key;
          measured.push({ el: e.target, w: r.width, h: r.height });
        }
        if (measured.length) classifyAll(measured);
      });
    }
    scan();
    classifyBody();
    addEventListener("resize", onViewport, { passive: true });
    addEventListener("orientationchange", onViewport, { passive: true });
    addEventListener("pageshow", onViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewport, { passive: true });
    }
    try {
      const mql = typeof matchMedia === "function" ? matchMedia("(orientation: portrait)") : null;
      if (mql && typeof mql.addEventListener === "function") mql.addEventListener("change", onViewport);
      else if (mql && typeof mql.addListener === "function") mql.addListener(onViewport);
    } catch (_) {  }
    try {
      const so = window.screen && window.screen.orientation;
      if (so && typeof so.addEventListener === "function") so.addEventListener("change", onViewport, { passive: true });
    } catch (_) {  }
    if (typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "hidden") onViewport(); }, { passive: true });
    }
    watchVisibility();
    watchScale();
    watchKeyboard();
    onViewport();
    if (typeof MutationObserver === "function") {
      new MutationObserver((muts) => {
        let removedManaged = false;
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.classList && (n.classList.contains("sheet") || n.classList.contains("fit-managed"))) observe(n);
            if (n.querySelectorAll) scan(n);
          }
          if (removedManaged) continue;
          for (const n of m.removedNodes) {
            if (n.nodeType !== 1) continue;
            if ((n.matches && n.matches(MANAGED)) ||
                (n.querySelector && n.querySelector(MANAGED))) { removedManaged = true; break; }
          }
        }
        if (removedManaged) pruneSeen();
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  classifyBody();
  if (document.readyState !== "complete")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  function layoutProbe(sheet) {
    if (!sheet || !sheet.getBoundingClientRect) return null;
    const cs = getComputedStyle(sheet), host = sheet.parentElement;
    const hs = host ? getComputedStyle(host) : null;
    const r = sheet.getBoundingClientRect();
    const zoom = parseFloat(sheet.style.getPropertyValue("--sheet-scale"))
      || parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
    const b = document.body.dataset;
    return {
      id: sheet.id, density: sheet.dataset.density || null, shape: sheet.dataset.shape || null,
      pair: sheet.dataset.pair || null, fit: sheet.dataset.fit || null, page: sheet.dataset.page || null,
      sheetScale: sheet.style.getPropertyValue("--sheet-scale") || null, zoom,
      own: { w: sheet.clientWidth, h: sheet.clientHeight },
      painted: { x: r.left, y: r.top, w: r.width, h: r.height },
      host: host ? { h: host.clientHeight, padTop: parseFloat(hs.paddingTop) || 0, padBottom: parseFloat(hs.paddingBottom) || 0 } : null,
      kb: document.documentElement.style.getPropertyValue("--kb") || null,
      container: cs.containerType || null,
      viewport: viewportPx(), inner: [window.innerWidth, window.innerHeight],
      body: { density: b.density || null, shape: b.shape || null, width: b.width || null },
    };
  }

  return { scan, observe, reclassify, layoutProbe };
})();
