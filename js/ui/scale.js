"use strict";
const UiScale = (() => {
  const coarseUi = () => { try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (_) { return false; } };
  function syncLayout() {
    try {
      const root = document.documentElement;
      if (!root || !root.dataset || !window.matchMedia) return;
      let fold = "";
      if (window.matchMedia("(horizontal-viewport-segments: 2)").matches) fold = "horizontal";
      else if (window.matchMedia("(vertical-viewport-segments: 2)").matches) fold = "vertical";
      if (fold) root.dataset.fold = fold;
      else delete root.dataset.fold;
    } catch (_) {  }
  }
  const PHONE_AUTO_CEIL = 0.75;
  const defaultResMode = () => "auto";
  const RES_SCHEMA = 2;
  function migrateResMode(store, coarse) {
    if (store.get("resSchema", 1) >= RES_SCHEMA) return false;
    const reset = !!coarse && store.get("resMode", defaultResMode()) === "low";
    if (reset) store.set("resMode", undefined);
    store.set("resSchema", RES_SCHEMA);
    if (reset) Log.info("ui", "resMode: implicit phone LOW -> default " + defaultResMode());
    return reset;
  }
  function create(G) {
    Log.info("ui", "UiScale.create");
    const { $, els, store } = G;

    const SCALE_MIN = 40;
    const SCALE_MAX = 200;
    const BTN_MAX = 300;
    const maxFor = (k) => (k === "hudBtnScale" ? BTN_MAX : SCALE_MAX);
    const HUD_MIN = 70;
    const minFor = (k) => (k === "hudScale" ? HUD_MIN : SCALE_MIN);
    const SCALE_STEP = 0.25;
    const BTN_DEFAULT = 1.25;
    const PHONE_UI_DEFAULT = 70;
    const phoneUi = () => coarseUi() && Math.min(window.innerWidth, window.innerHeight) <= 500;
    const scaleDefault = (k) => (coarseUi() ? (k === "hudScale" ? 100 : (phoneUi() ? PHONE_UI_DEFAULT : 109)) : 100);
    const scaleSnap = (v, k) => {
      const n = Math.max(minFor(k), Math.min(maxFor(k), +v));
      return Math.round(n / SCALE_STEP) * SCALE_STEP;
    };
    const scaleDefaultFor = (k) => (k === "hudBtnScale"
      ? 100 * (coarseUi() ? BTN_DEFAULT : 1)
      : scaleDefault(k));
    const scalePct = (k) => {
      const v = store.get(k, null);
      return typeof v === "number" ? scaleSnap(v, k) : scaleDefaultFor(k);
    };
    const scaleLabel = (pct, k) => {
      const t = scaleSnap(pct, k);
      return `${Math.abs(t % 1) < 1e-9 ? String(Math.round(t)) : t.toFixed(1)}%`;
    };
    const uiSheet = () => $("pm-uiscale")?.closest?.(".sheet") || null;
    const sheetCap = () => { const sh = uiSheet(); return (sh?.getClientRects?.().length && parseFloat(getComputedStyle(sh).zoom)) || 0; };
    const fitCaps = () => (document.body?.classList?.contains("in-race") ? parseCaps(document.documentElement.style.getPropertyValue("--hud-cap")) : null);
    const cssWas = {};
    const rowFor = (key) => sizeRow(key, scalePct(key), { min: minFor(key), max: maxFor(key), step: SCALE_STEP }, fitCaps(), sheetCap(), phoneUi());
    const pinPainted = (key) => { const r = rowFor(key); if (typeof store.get(key, null) === "number" && r.value < scalePct(key)) store.set(key, r.value); };
    const fromSlider = (key, v) => { const r = rowFor(key); return Math.max(r.min, Math.min(r.max, scaleSnap(+v || scaleDefaultFor(key), key))); };
    let uiRowAgain = 0;
    const applyUiRow = () => applyScale("uiScale", "--ui-scale", "pm-uiscale");
    function applyScale(key, prop, inputId) {
      const stored = store.get(key, null);
      let r = rowFor(key);
      const root = document.documentElement, want = typeof stored === "number" ? String((key === "hudScale" ? scalePct(key) : r.value) / 100) : "";
      const wrote = cssWas[prop] !== want;
      if (wrote) { cssWas[prop] = want; if (want) root.style.setProperty(prop, want); else root.style.removeProperty(prop); }
      if (key === "uiScale") r = rowFor(key);
      if (key === "uiScale" && wrote && typeof requestAnimationFrame === "function" && typeof setTimeout === "function") {
        const g = ++uiRowAgain, again = () => { if (g === uiRowAgain) applyUiRow(); };
        requestAnimationFrame(() => { again(); requestAnimationFrame(() => { again(); requestAnimationFrame(again); }); });
        for (const ms of [250, 1000, 3000]) setTimeout(again, ms);
      }
      const input = $(inputId);
      if (input) { input.min = String(r.min); input.max = String(r.max); input.value = String(r.value); }
      const out = $(`${inputId}-v`); if (out && out.textContent !== r.label) out.textContent = r.label;
      const row = input && input.closest && input.closest(".tune-row, .pm-group");
      if (row) row.classList.toggle("tune-over", typeof stored === "number");
      const rev = $(`${inputId}-r`); if (rev) rev.hidden = typeof stored !== "number";
    }
    let uiScalePreviewRaf = 0;
    function applyUiScale()  {
      applyScale("uiScale",  "--ui-scale",  "pm-uiscale");
      if (uiScalePreviewRaf) return;
      uiScalePreviewRaf = requestAnimationFrame(() => {
        uiScalePreviewRaf = 0;
        try { if (els.select && !els.select.hidden) G.updateTrackPreview(); } catch {  }
      });
    }
    function applyHudScale() { applyScale("hudScale", "--hud-scale", "pm-hudscale"); }
    function applyBtnScale() { applyScale("hudBtnScale", "--hud-btn-scale", "pm-btnscale"); }
    function refreshFit() { applyHudScale(); applyBtnScale(); }
    const OPACITY_MIN = 20, OPACITY_MAX = 100;
    const opacityPct = (key) => {
      const v = store.get(key, null);
      return typeof v === "number" ? Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Math.round(v))) : 100;
    };
    const opacityIn = (n) => Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Math.round(isFinite(n) ? n : 100)));
    function paintOpacity(key, prop, input, out, rev) {
      const stored = store.get(key, null);
      const pct = opacityPct(key);
      if (typeof stored === "number") document.documentElement.style.setProperty(prop, pct / 100);
      else document.documentElement.style.removeProperty(prop);
      if (input) input.value = String(pct);
      if (out) out.textContent = pct + "%";
      const row = input && input.closest && input.closest(".tune-row, .pm-group");
      if (row) row.classList.toggle("tune-over", typeof stored === "number");
      if (rev) rev.hidden = typeof stored !== "number";
    }
    function applyBtnOpacity() {
      paintOpacity("hudBtnOpacity", "--hud-btn-opacity", $("pm-btnopacity"), $("pm-btnopacity-v"), $("pm-btnopacity-r"));
    }
    function applyPanelOpacity() {
      paintOpacity("hudPanelOpacity", "--hud-panel-a", $("pm-panelopacity"), $("pm-panelopacity-v"), $("pm-panelopacity-r"));
    }
    {
      const el = $("pm-btnopacity");
      if (el) el.oninput = (e) => { store.set("hudBtnOpacity", opacityIn(+e.target.value)); applyBtnOpacity(); };
      const rev = $("pm-btnopacity-r");
      if (rev) rev.onclick = () => { store.set("hudBtnOpacity", null); applyBtnOpacity(); };
      const pel = $("pm-panelopacity");
      if (pel) pel.oninput = (e) => { store.set("hudPanelOpacity", opacityIn(+e.target.value)); applyPanelOpacity(); };
      const prev = $("pm-panelopacity-r");
      if (prev) prev.onclick = () => { store.set("hudPanelOpacity", null); applyPanelOpacity(); };
    }
    const uiEl = $("pm-uiscale");
    if (uiEl) {
      uiEl.oninput = (e) => { const out = $("pm-uiscale-v"); if (out) out.textContent = fromSlider("uiScale", e.target.value) + "%"; };
      uiEl.onchange = (e) => { store.set("uiScale", fromSlider("uiScale", e.target.value)); applyUiScale(); };
    }
    const hudEl = $("pm-hudscale");
    if (hudEl) hudEl.oninput = (e) => {
      pinPainted("hudBtnScale");
      store.set("hudScale", fromSlider("hudScale", e.target.value));
      refreshFit();
    };
    applyBtnOpacity();
    applyPanelOpacity();
    const btnEl = $("pm-btnscale");
    if (btnEl) btnEl.oninput = (e) => {
      pinPainted("hudScale");
      store.set("hudBtnScale", fromSlider("hudBtnScale", e.target.value));
      refreshFit();
    };
    const revert = (key, apply) => (e) => {
      e.preventDefault(); e.stopPropagation();
      store.set(key, null);
      apply();
    };
    const uiRev = $("pm-uiscale-r"); if (uiRev) uiRev.onclick = revert("uiScale", applyUiScale);
    const hudRev = $("pm-hudscale-r"); if (hudRev) hudRev.onclick = revert("hudScale", applyHudScale);
    const btnRev = $("pm-btnscale-r"); if (btnRev) btnRev.onclick = revert("hudBtnScale", applyBtnScale);

    if (phoneUi() && typeof store.get("uiScale", null) === "number" && store.get("uiScale", null) < UI_PHONE_MIN) store.set("uiScale", UI_PHONE_MIN);
    applyUiScale();
    applyHudScale();
    applyBtnScale();
    syncLayout();
    let layoutRaf = 0;
    const syncLayoutSoon = () => {
      if (layoutRaf) return;
      if (typeof requestAnimationFrame !== "function") { syncLayout(); return; }
      layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; syncLayout(); });
    };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", syncLayoutSoon, { passive: true });
      if (window.visualViewport && window.visualViewport.addEventListener)
        window.visualViewport.addEventListener("resize", syncLayoutSoon, { passive: true });
    }
    if (typeof MutationObserver === "function" && document.documentElement) {
      let fitRaf = 0;
      new MutationObserver(() => {
        if (fitRaf || typeof requestAnimationFrame !== "function") return;
        fitRaf = requestAnimationFrame(() => { fitRaf = 0; refreshFit(); });
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    }
    if (typeof MutationObserver === "function" && uiSheet()) {
      const mo = new MutationObserver(applyUiRow);
      mo.observe(uiSheet(), { attributes: true });
      if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["data-density"] });
    }
    function setScale(key, prop, v) {
      if (v !== undefined) {
        if (v === null) store.set(key, null);
        else store.set(key, scaleSnap(+v || scaleDefaultFor(key), key));
        if (key === "uiScale") applyUiScale();
        else if (key === "hudBtnScale") applyBtnScale();
        else applyHudScale();
      }
      return { pct: scalePct(key), stored: store.get(key, null), min: minFor(key), max: maxFor(key), step: SCALE_STEP };
    }

    const RES_MODES = [
      { id: "auto", label: "AUTO" },
      { id: "low",  label: "LOW",  v: 0.5  },
      { id: "med",  label: "MED",  v: 0.75 },
      { id: "high", label: "HIGH", v: 1.0  },
    ];
    migrateResMode(store, coarseUi());
    let resMode = store.get("resMode", defaultResMode());
    function applyResMode() {
      const m = RES_MODES.find((r) => r.id === resMode) || RES_MODES[0];
      SettingRow.paint($("pm-res"), m.id);
      const gfx = G.gfx;
      if (m.v != null) { PerfGov.setAutoRes(false); if (gfx.setRenderScale) gfx.setRenderScale(m.v); return; }
      const ceil = coarseUi() ? PHONE_AUTO_CEIL : 1;
      if (PerfGov.setResCeil) PerfGov.setResCeil(ceil);
      if (ceil < 1 && gfx.setRenderScale && (!gfx.getRenderScale || gfx.getRenderScale() > ceil)) gfx.setRenderScale(ceil);
      PerfGov.setAutoRes(true);
    }
    SettingRow.wire("pm-res", { values: RES_MODES.map((r) => [r.id, r.label]), read: () => resMode, write: (v) => {
      resMode = (RES_MODES.find((r) => r.id === v) || RES_MODES[0]).id;
      store.set("resMode", resMode);
      applyResMode();
      if (G.soundOn) GameAudio.uiSelect();
    } });
    applyResMode();

    function upscaleOn() {
      const gfx = G.gfx;
      if (gfx && typeof gfx.getSpatialUpscale === "function") return !!gfx.getSpatialUpscale();
      try { return store.raw("spatialUpscale") === "1"; } catch (_) { return false; }
    }
    function applyUpscale(on) {
      const gfx = G.gfx;
      store.rawSet("spatialUpscale", on ? "1" : "0");
      if (gfx && typeof gfx.setSpatialUpscale === "function") gfx.setSpatialUpscale(!!on);
    }
    function occlusionSupported() {
      const gfx = G.gfx;
      if (!gfx || typeof gfx.occlusionStats !== "function") return false;
      try { return gfx.occlusionStats().supported !== false; } catch (_) { return false; }
    }
    function occlusionOn() {
      const gfx = G.gfx;
      if (gfx && typeof gfx.occlusionStats === "function") {
        try { return !!gfx.occlusionStats().on; } catch (_) {  }
      }
      try { return store.raw("occlusionCull") === "1"; } catch (_) { return false; }
    }
    function applyOcclusion(on) {
      const gfx = G.gfx;
      try { store.rawSet("occlusionCull", on ? "1" : "0"); } catch (_) {  }
      if (gfx && typeof gfx.occlusionCull === "function") gfx.occlusionCull(!!on);
      const row = $("pm-occlusion"), note = $("pm-occlusion-note");
      const show = occlusionSupported();
      if (row) row.hidden = !show;
      if (note) note.hidden = !show;
    }
    SettingRow.wire("pm-occlusion", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (occlusionOn() ? "on" : "off"),
      write: (v) => {
        applyOcclusion(v === "on");
        if (G.soundOn) GameAudio.uiSelect();
      },
    });
    applyOcclusion(occlusionOn());

    SettingRow.wire("pm-upscale", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (upscaleOn() ? "on" : "off"),
      write: (v) => {
        applyUpscale(v === "on");
        if (G.soundOn) GameAudio.uiSelect();
      },
    });

    return { setScale, applyResMode, applyUiScale, applyHudScale, applyBtnScale, applyBtnOpacity, applyPanelOpacity, applyUpscale, upscaleOn,
             applyOcclusion, occlusionOn, occlusionSupported };
  }
  function parseCaps(str) {
    const a = String(str || "").trim().split(/\s+/).map(Number);
    if (a.length < 6 || a.some((n) => !(n > 0))) return null;
    return { top: a[0], bot: a[1], dock: a[2], steer: a[3], keep: a[4], floor: a[5] };
  }
  function sizeRow(key, wish, lim, caps, sheetCap, phone) {
    const st = lim.step || 0.25, down = (p) => Math.floor(p / st + 1e-6) * st, up = (p) => Math.ceil(p / st - 1e-6) * st;
    let min = lim.min, max = lim.max, part = "";
    if (key === "uiScale" && phone) min = Math.max(min, UI_PHONE_MIN);
    const txt = (p) => `${Math.abs(p % 1) < 1e-9 ? String(Math.round(p)) : p.toFixed(1)}%`;
    const band = (z) => (z < 9 ? Math.ceil(z * 100 - 1e-6) : Infinity);
    if (key === "hudScale" && caps) max = Math.max(min, Math.min(max, Math.max(band(caps.top), band(caps.bot))));
    if (key === "hudBtnScale" && caps && caps.dock < 9) {
      min = Math.max(min, up(caps.floor * 100));
      max = Math.max(min, Math.min(max, down(Math.max(caps.dock, caps.keep, Math.min(wish / 100, caps.steer)) * 100)));
    }
    const value = Math.max(min, Math.min(max, wish));
    if (key === "hudScale" && caps) {
      const t = Math.min(value, band(caps.top)), b = Math.min(value, band(caps.bot));
      if (t < value - 0.5) part = ` · top row ${txt(t)}`; else if (b < value - 0.5) part = ` · bottom row ${txt(b)}`;
    }
    if (key === "hudBtnScale" && caps && caps.dock < 9) {
      const ped = Math.round(Math.max(caps.floor, Math.min(value / 100, caps.dock)) * 100);
      if (ped < value - 0.5) part = ` · pedals ${ped}%`;
    }
    if (key === "uiScale" && sheetCap > 0 && sheetCap * 100 < value - 0.5) part = ` · this menu ${Math.round(sheetCap * 100)}%`;
    return { min, max, value, label: txt(value) + part + (max < lim.max && value >= max ? " · max" : "") };
  }
  const UI_PHONE_MIN = 50;
  return { create, defaultResMode, migrateResMode, RES_SCHEMA, sizeRow, parseCaps };
})();
