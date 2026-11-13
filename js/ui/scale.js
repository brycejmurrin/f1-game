"use strict";
/* Apex 26 — UI SIZE / HUD SIZE / BUTTON SIZE sliders + RESOLUTION pin.
   UiScale.create(G). Extracted from game.js: the zoom knobs and the
   render-scale cycle. G already owned setScale / applyResMode; this file
   is the implementation. Menus.updateTrackPreview is reached through G
   (one deferred arrow added beside buildSelect).

   Must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const UiScale = (() => {
  // The primary-pointer test every touch default below keys off. Module level so
  // defaultResMode() answers without a create(G) (SettingsExport's SPEC row).
  const coarseUi = () => { try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (_) { return false; } };
  // Foldable hinge stamp: html[data-fold="horizontal"|"vertical"] from the viewport-segments
  // queries. The width tier html[data-layout] that sat beside it until 2026-11-07 is gone (UI
  // contract 2026-11-06 gap 20): it called an 852/844 landscape phone "tablet" and nothing in
  // css/ read it. CSS media queries own the width tiers (--layout-active in css/tokens.css).
  function syncLayout() {
    try {
      const root = document.documentElement;
      if (!root || !root.dataset || !window.matchMedia) return;
      let fold = "";
      if (window.matchMedia("(horizontal-viewport-segments: 2)").matches) fold = "horizontal";
      else if (window.matchMedia("(vertical-viewport-segments: 2)").matches) fold = "vertical";
      if (fold) root.dataset.fold = fold;
      else delete root.dataset.fold;
    } catch (_) { /* progressive; a missing API leaves the CSS media queries in charge */ }
  }
  // RESOLUTION's shipped default is AUTO everywhere since #5227 (2026-11-10). On a phone AUTO is
  // CAPPED at MED's scale (PHONE_AUTO_CEIL): it boots at 0.75, which is what the MED pin drew since
  // #5166 (959×443 on an 852×393 DPR-3 iPhone under the 1.5 mobile DPR cap; LOW's 639×295 read as
  // "very pixelated"), and PerfGov's resolution stage may now step below it and back. A pinned MED
  // left the governor only the feature-shed ladder, and a phone too slow for MED sat at 30 fps for
  // the race where LOW would have held 60. Only an UNSET key follows this: a stored LOW/MED/HIGH/AUTO
  // wins, and HIGH is still the way to draw above MED on a phone.
  const PHONE_AUTO_CEIL = 0.75;
  const defaultResMode = () => "auto";
  // A stored LOW on a phone from before #5166 is not proof of a choice: LOW WAS the phone default
  // (2026-09-08..11-09) and a settings file saved then carried it as a value (perDevice null only from
  // 2026-10-04), so importing one pinned it; nothing ever recorded "picked". Bryce's export holds
  // resMode:"low" outside `changed`, and the 3D view stayed at LOW after #5193 (#5198). Run ONCE per
  // device (resSchema): a phone's stored LOW goes back to the default; a desktop's never was a default,
  // so it stays. A LOW picked after this runs is kept. Decision record: PR for #5198 part 3.
  const RES_SCHEMA = 2;
  function migrateResMode(store, coarse) {
    if (store.get("resSchema", 1) >= RES_SCHEMA) return false;
    const reset = !!coarse && store.get("resMode", defaultResMode()) === "low";
    if (reset) store.set("resMode", undefined);   // undefined REMOVES the key; null would store "null" and read as AUTO
    store.set("resSchema", RES_SCHEMA);
    if (reset) Log.info("ui", "resMode: implicit phone LOW -> default " + defaultResMode());
    return reset;
  }
  function create(G) {
    Log.info("ui", "UiScale.create");
    const { $, els, store } = G;

    // UI SIZE / HUD SIZE / BUTTON SIZE: how big the interface is, as a percentage,
    // on three independent sliders. Each writes a custom property the stylesheets
    // consume as a `zoom`:
    //   --ui-scale       the menus    — .sheet (components.css), #overlay (menus.css)
    //   --hud-scale      the readouts — the HUD clusters (hud.css)
    //   --hud-btn-scale  the dock     — the touch controls (overlays.css)
    //
    // TWO KNOBS BECAUSE THE TWO LAYERS ARE READ DIFFERENTLY. Menu type is read at
    // rest, with time to spare; the HUD is glanced at while driving, and the size
    // that works there depends on where the phone is mounted and whose eyes are
    // reading it. They also compete for the same screen, so trading one against the
    // other is a real choice rather than a compromise to be guessed at centrally.
    //
    // SLIDERS RATHER THAN CONSTANTS because this is the thing measurement could not
    // settle: what reads correctly at arm's length on a phone in motion is not a
    // question a screenshot answers, and three rounds of picking a number from one
    // ended with "still too small". The player has the device.
    //
    // Written INLINE ON documentElement (<html>), which is where css/tokens.css
    // declares both properties. That element matters: a custom property is
    // substituted where it is DECLARED, so a value set on <body> leaves :root's
    // rules reading :root's own value and the knob silently does nothing — measured
    // on build 997, where --tap sat at `calc(44px * 1)` at every setting until this
    // moved to documentElement.
    //
    // NOTHING STORED => NO INLINE STYLE, so the `@media (pointer: coarse)` default
    // in the stylesheet stands and a phone is correct on its FIRST paint rather
    // than from whenever this module runs.
    const SCALE_MIN = 40;
    const SCALE_MAX = 200;
    // BUTTON SIZE alone goes on to 300 %: at 200 % the dock was still small in the hand on a
    // tall landscape phone, and fitHud's --hud-z-dock cap already stops
    // the columns at whatever the screen has room for — the slider is a wish, the cap the fit.
    const BTN_MAX = 300;
    const maxFor = (k) => (k === "hudBtnScale" ? BTN_MAX : SCALE_MAX);
    // HUD SIZE has a TEXT floor: at 40 % the readouts painted ~5-6 px glyphs.
    // 70 keeps the smallest HUD ink legible; a stored value under it (an older
    // build's range) clamps up on boot through scalePct like any other.
    const HUD_MIN = 70;
    const minFor = (k) => (k === "hudScale" ? HUD_MIN : SCALE_MIN);
    const SCALE_STEP = 0.25;
    // Touch defaults live in the `(pointer: coarse)` block of css/tokens.css and
    // are mirrored here — CSS owns FIRST paint, this owns every write after it,
    // and the two must not disagree. BUTTON SIZE keeps its own fixed default.
    // History: 1.4536, then 1.25 (2026-09-14, when --hud-scale still carried a 1.24 bump and
    // nothing capped the dock; fitHud's caps do that now).
    // 1.4325 since #5358: the owner's 2026-11-10 phone profile stores BUTTON 143.25 %. fitHud's
    // height cap still stops the BOOST / OT / AERO and pedal columns where they stopped at 1.25
    // (85 px at 852x393); what grows is the steer pad, 90 -> 103 px.
    const BTN_DEFAULT = 1.4325;
    // A PHONE (touch, short side <= 500 px) ships UI SIZE 70 %, the owner's own setting (#5358):
    // 109 % painted every menu "way too big" there. A tablet keeps 109. Only an UNSET size reads
    // these; a stored one is never rewritten by a new default.
    const PHONE_UI_DEFAULT = 70;
    const phoneUi = () => coarseUi() && Math.min(window.innerWidth, window.innerHeight) <= 500;
    const scaleDefault = (k) => (coarseUi() ? (k === "hudScale" ? 100 : (phoneUi() ? PHONE_UI_DEFAULT : 109)) : 100);
    const scaleSnap = (v, k) => {
      const n = Math.max(minFor(k), Math.min(maxFor(k), +v));
      return Math.round(n / SCALE_STEP) * SCALE_STEP;
    };
    // Button size is an independent preference, including when unset.
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
    // UI SIZE: full top (the row names this sheet's zoom); a phone stops at 50 % (#5452; 70 under #5235).
    const uiSheet = () => $("pm-uiscale")?.closest?.(".sheet") || null;
    const sheetCap = () => { const sh = uiSheet(); return (sh?.getClientRects?.().length && parseFloat(getComputedStyle(sh).zoom)) || 0; };
    const fitCaps = () => (document.body?.classList?.contains("in-race") ? parseCaps(document.documentElement.style.getPropertyValue("--hud-cap")) : null);
    const cssWas = {};   // prop -> last value written here
    const rowFor = (key) => sizeRow(key, scalePct(key), { min: minFor(key), max: maxFor(key), step: SCALE_STEP }, fitCaps(), sheetCap(), phoneUi());
    // Moving one slider pins the OTHER's wish to what it paints: freed room never grows it.
    const pinPainted = (key) => { const r = rowFor(key); if (typeof store.get(key, null) === "number" && r.value < scalePct(key)) store.set(key, r.value); };
    const fromSlider = (key, v) => { const r = rowFor(key); return Math.max(r.min, Math.min(r.max, scaleSnap(+v || scaleDefaultFor(key), key))); };
    let uiRowAgain = 0;
    const applyUiRow = () => applyScale("uiScale", "--ui-scale", "pm-uiscale");
    function applyScale(key, prop, inputId) {
      const stored = store.get(key, null);
      // The property is always CLAMPED and step-snapped: an out-of-range value can reach storage from an older build
      // or a direct edit, and this runs on every boot. THE SLIDER IS WHAT PAINTS (#5206): its range is what this
      // window can paint, and the stored wish stays until the player moves it.
      let r = rowFor(key);
      // --hud-scale keeps the stored wish: a widget placed in ARRANGE paints it raw and must not follow the cap.
      const root = document.documentElement, want = typeof stored === "number" ? String((key === "hudScale" ? scalePct(key) : r.value) / 100) : "";
      const wrote = cssWas[prop] !== want;
      if (wrote) { cssWas[prop] = want; if (want) root.style.setProperty(prop, want); else root.style.removeProperty(prop); }
      if (key === "uiScale") r = rowFor(key);
      // The sheet's computed zoom can lag the --ui-scale write by more than a frame (sheet-shape.js roomOwn; CI runs
      // 42753025608 / 42790487904 kept "100% · this menu 70%"): read the row again on the next three frames and at
      // 250 ms, 1 s and 3 s after the LAST write. An unchanged row writes nothing.
      if (key === "uiScale" && wrote && typeof requestAnimationFrame === "function" && typeof setTimeout === "function") {
        const g = ++uiRowAgain, again = () => { if (g === uiRowAgain) applyUiRow(); };
        requestAnimationFrame(() => { again(); requestAnimationFrame(() => { again(); requestAnimationFrame(again); }); });
        for (const ms of [250, 1000, 3000]) setTimeout(again, ms);
      }
      const input = $(inputId);
      if (input) { input.min = String(r.min); input.max = String(r.max); input.value = String(r.value); }
      const out = $(`${inputId}-v`); if (out && out.textContent !== r.label) out.textContent = r.label;
      // IS THIS VALUE MINE OR INHERITED? `stored` has always known — null means
      // "following" — and nothing on screen said so, which is the whole bug class
      // behind BUTTON SIZE: unset it tracks HUD SIZE, and a player who had never
      // touched it could not tell that from a coincidence. Unity's editor, VS
      // Code's settings and Google Workspace's org units all converge on the same
      // two signifiers, so use theirs rather than invent one: an override bar and
      // a bolder label while the value is set, and an in-context revert ON THAT
      // CONTROL rather than a global Reset button (which NN/G argues against —
      // it sits next to the thing you meant to press and discards work).
      const row = input && input.closest && input.closest(".tune-row, .pm-group");
      if (row) row.classList.toggle("tune-over", typeof stored === "number");
      const rev = $(`${inputId}-r`); if (rev) rev.hidden = typeof stored !== "number";
    }
    let uiScalePreviewRaf = 0;
    function applyUiScale()  {
      applyScale("uiScale",  "--ui-scale",  "pm-uiscale");
      if (uiScalePreviewRaf) return; // coalesce slider input; hidden select refreshes on open
      uiScalePreviewRaf = requestAnimationFrame(() => {
        uiScalePreviewRaf = 0;
        try { if (els.select && !els.select.hidden) G.updateTrackPreview(); } catch { /* menus not ready */ }
      });
    }
    function applyHudScale() { applyScale("hudScale", "--hud-scale", "pm-hudscale"); }
    // The touch dock keeps its own fixed default and explicit override.
    function applyBtnScale() { applyScale("hudBtnScale", "--hud-btn-scale", "pm-btnscale"); }
    // fitHud publishes --hud-cap on its own schedule: both race rows follow <html>'s inline style.
    function refreshFit() { applyHudScale(); applyBtnScale(); }
    // BUTTON OPACITY has its OWN clamp and does not reuse applyScale: that
    // helper snaps to SCALE_MIN..SCALE_MAX (40..200), which is meaningless for a
    // 0-100 % control and would both forbid a faint dock and allow a 200 % one.
    // Reusing a helper whose bounds are wrong for the new use is how a control
    // ends up unable to reach one end of its own range.
    const OPACITY_MIN = 20, OPACITY_MAX = 100;   // floor: a dock you cannot see is a dock you cannot aim at
    const opacityPct = (key) => {
      const v = store.get(key, null);
      return typeof v === "number" ? Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Math.round(v))) : 100;
    };
    const opacityIn = (n) => Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Math.round(isFinite(n) ? n : 100)));
    // Both 20-100 % sliders share this body; the ids stay string literals at
    // each call site so tools/check/shell-ids.mjs can still see every read.
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
    // PANEL OPACITY: the dark plates behind the race readouts (.hud-box, the
    // gaps chip, gearbox, tach, minimap, sectors, limits, #announce). Written as
    // --hud-panel-a; css/tokens.css folds it into --hud-panel-a-eff, which HIGH
    // CONTRAST pins at 1 so its solid plates win whatever this slider says.
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
    // UI SIZE zooms the sheet that holds its own slider: applying on every `input` re-zoomed it under the thumb (#5256).
    // The number follows the drag; the zoom lands on release (`change`, which a key step also fires).
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
    // Revert restores this axis's independent default.
    const revert = (key, apply) => (e) => {
      e.preventDefault(); e.stopPropagation();   // the button sits inside a <label>
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
    // Resize events fire per frame during a drag/rotation: coalesce syncLayout to one run per animation frame.
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
      if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["data-density"] });   // the compact zoom rule keys on it
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
    // Every device ships at AUTO; a phone's AUTO is capped at MED's 0.75 buffer
    // (PHONE_AUTO_CEIL, above). "Phone" is the question Input.touchControlsNeeded()
    // asks, asked directly (coarseUi, above) so this module keeps no dependency
    // on the input stack.
    migrateResMode(store, coarseUi());
    let resMode = store.get("resMode", defaultResMode());
    function applyResMode() {
      const m = RES_MODES.find((r) => r.id === resMode) || RES_MODES[0];
      SettingRow.paint($("pm-res"), m.id);
      const gfx = G.gfx;
      if (m.v != null) { PerfGov.setAutoRes(false); if (gfx.setRenderScale) gfx.setRenderScale(m.v); return; }
      // AUTO: the governor takes over from wherever the scale sits now, under the device's ceiling.
      // A scale above a phone's ceiling (the boot's 1.0, or a HIGH pin just left) comes down to it.
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

    // UPSCALE — SGSR1 spatial reconstruct when RESOLUTION is below full
    // (docs/research/UPSCALING-2026-09.md §6–7). Same raw key GLX already
    // reads (apex26.spatialUpscale "1"/"0"); OFF by default. No effect at
    // scale≈1; HUD stays DOM-crisp either way.
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
    // OCCLUSION CULLING — hardware depth queries skip scenery chunks that
    // contribute no pixel (js/render/glx/chunked.js). Same raw key GLX reads at
    // boot (apex26.occlusionCull "1"/"0"); OFF by default, because the saving
    // is measured but the pass is young and a wrong answer is a hole in the
    // world rather than a slow frame.
    //
    // GLX ONLY, and the row HIDES rather than greys where it cannot work: WGX
    // and TLX answer supported:false by design (they declare the member so a
    // descriptor-copied backend cannot fall through to GLX's own function), and
    // a settings row that a player can move while nothing happens is a worse
    // bug than an absent one. `supported` is null before the program has been
    // built, which is not "no" — that case shows the row.
    function occlusionSupported() {
      const gfx = G.gfx;
      if (!gfx || typeof gfx.occlusionStats !== "function") return false;
      try { return gfx.occlusionStats().supported !== false; } catch (_) { return false; }
    }
    function occlusionOn() {
      const gfx = G.gfx;
      if (gfx && typeof gfx.occlusionStats === "function") {
        try { return !!gfx.occlusionStats().on; } catch (_) { /* fall through to the key */ }
      }
      try { return store.raw("occlusionCull") === "1"; } catch (_) { return false; }
    }
    function applyOcclusion(on) {
      const gfx = G.gfx;
      try { store.rawSet("occlusionCull", on ? "1" : "0"); } catch (_) { /* blocked storage */ }
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
  /** fitHud's --hud-cap ("top bot pedals steer steerKeep btnFloor" zooms; 9 = no limit) -> object or null. */
  function parseCaps(str) {
    const a = String(str || "").trim().split(/\s+/).map(Number);
    if (a.length < 6 || a.some((n) => !(n > 0))) return null;
    return { top: a[0], bot: a[1], dock: a[2], steer: a[3], keep: a[4], floor: a[5] };
  }
  /** One size slider's row on THIS window: { min, max, value, label }; the range and value are what paints.
   *  `caps` = parseCaps() in a race, `sheetCap` = the settings sheet's zoom (0 = hidden), `phone` = UI SIZE min 70. */
  function sizeRow(key, wish, lim, caps, sheetCap, phone) {
    const st = lim.step || 0.25, down = (p) => Math.floor(p / st + 1e-6) * st, up = (p) => Math.ceil(p / st - 1e-6) * st;
    let min = lim.min, max = lim.max, part = "";
    if (key === "uiScale" && phone) min = Math.max(min, UI_PHONE_MIN);
    const txt = (p) => `${Math.abs(p % 1) < 1e-9 ? String(Math.round(p)) : p.toFixed(1)}%`;
    // Bands paint min(slider, cap), the cap ceiled to 1 % (hud.js set()).
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
  // A phone's UI SIZE FLOOR (#5452, Bryce 2026-11-11: "Down to 50 %"; it was 70 under #5235, which left the slider
  // stuck at its left end). A stored value under it is raised to it on load; one above it (his 61) is kept.
  const UI_PHONE_MIN = 50;
  return { create, defaultResMode, migrateResMode, RES_SCHEMA, sizeRow, parseCaps };
})();
