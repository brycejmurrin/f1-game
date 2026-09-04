"use strict";
/* Apex 26 — UI SIZE / HUD SIZE / BUTTON SIZE sliders + RESOLUTION pin.
   UiScale.create(G). Extracted from game.js: the zoom knobs and the
   render-scale cycle. G already owned setScale / applyResMode; this file
   is the implementation. Menus.updateTrackPreview is reached through G
   (one deferred arrow added beside buildSelect).

   Must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const UiScale = (() => {
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
    const SCALE_MIN = 40, SCALE_MAX = 200, SCALE_STEP = 0.25;
    const scaleDefault = () => 100;
    const scaleSnap = (v) => {
      const n = Math.max(SCALE_MIN, Math.min(SCALE_MAX, +v));
      return Math.round(n / SCALE_STEP) * SCALE_STEP;
    };
    // BUTTON SIZE's default is not a number, it is ANOTHER SLIDER: unset, the
    // dock follows HUD SIZE (css/tokens.css declares --hud-btn-scale as
    // var(--hud-scale)). Resolving that here rather than only in the widget
    // keeps one answer — the range input, its % readout and __apex.btnScale()
    // all report the axis actually in force, instead of the widget saying 130
    // while the hook said 100. `stored` still separates "following" from "set".
    const scaleDefaultFor = (k) => (k === "hudBtnScale" ? scalePct("hudScale") : scaleDefault());
    const scalePct = (k) => {
      const v = store.get(k, null);
      return typeof v === "number" ? scaleSnap(v) : scaleDefaultFor(k);
    };
    const scaleLabel = (pct) => {
      const t = scaleSnap(pct);
      return (Math.abs(t % 1) < 1e-9 ? String(Math.round(t)) : t.toFixed(1)) + "%";
    };
    function applyScale(key, prop, inputId) {
      const stored = store.get(key, null);
      // The CSS custom property drives the ACTUAL on-screen size — it must read the
      // CLAMPED (and step-snapped) pct, not the raw stored number. A value outside
      // [SCALE_MIN, SCALE_MAX] can reach storage from outside this slider (an older
      // build's range, a direct localStorage edit) and this function runs on every
      // boot, so an unclamped read here silently applied an out-of-range scale while
      // the slider's own displayed number — always clamped — showed something else.
      const pct = scalePct(key);
      if (typeof stored === "number") document.documentElement.style.setProperty(prop, pct / 100);
      else document.documentElement.style.removeProperty(prop);
      const input = $(inputId); if (input) input.value = String(pct);
      const out = $(inputId + "-v"); if (out) out.textContent = scaleLabel(pct);
    }
    let uiScalePreviewRaf = 0;
    function applyUiScale()  {
      applyScale("uiScale",  "--ui-scale",  "pm-uiscale");
      if (uiScalePreviewRaf) return; // coalesce slider input; hidden select refreshes on open
      uiScalePreviewRaf = requestAnimationFrame(function () { uiScalePreviewRaf = 0;
        try { if (els.select && !els.select.hidden) G.updateTrackPreview(); } catch (e) { /* menus not ready */ }
      });
    }
    // Moving HUD SIZE moves the dock too while BUTTON SIZE is unset, so its
    // widget has to be repainted or it reads a number the screen contradicts.
    function applyHudScale() { applyScale("hudScale", "--hud-scale", "pm-hudscale"); applyBtnScale(); }
    // BUTTON SIZE: the touch dock's own axis (--hud-btn-scale, css/tokens.css),
    // which DEFAULTS to --hud-scale rather than to 1 — the dock and the readouts
    // fight over the same edges, and shrinking the buttons is how a player buys
    // the readouts room back. Unset it must therefore behave exactly as before,
    // so applyScale's "nothing stored => no inline style" rule is what makes
    // this safe: the :root declaration keeps the two locked together until the
    // player moves this slider, and only then do they part.
    function applyBtnScale() { applyScale("hudBtnScale", "--hud-btn-scale", "pm-btnscale"); }
    $("pm-uiscale").oninput = (e) => {
      store.set("uiScale", scaleSnap(+e.target.value || scaleDefault()));
      applyUiScale();
    };
    $("pm-hudscale").oninput = (e) => {
      store.set("hudScale", scaleSnap(+e.target.value || scaleDefault()));
      applyHudScale();
    };
    $("pm-btnscale").oninput = (e) => {
      store.set("hudBtnScale", scaleSnap(+e.target.value || scaleDefault()));
      applyBtnScale();
    };
    applyUiScale();
    applyHudScale();   // calls applyBtnScale — an unset button slider follows it
    function setScale(key, prop, v) {
      if (v !== undefined) {
        if (v === null) store.set(key, null);
        else store.set(key, scaleSnap(+v || scaleDefault()));
        if (key === "uiScale") applyUiScale();
        else if (key === "hudBtnScale") applyBtnScale();
        else applyHudScale();
      }
      return { pct: scalePct(key), stored: store.get(key, null), min: SCALE_MIN, max: SCALE_MAX, step: SCALE_STEP };
    }

    const RES_MODES = [
      { id: "auto", label: "AUTO" },
      { id: "low",  label: "LOW",  v: 0.5  },
      { id: "med",  label: "MED",  v: 0.75 },
      { id: "high", label: "HIGH", v: 1.0  },
    ];
    let resMode = store.get("resMode", "auto");
    function applyResMode() {
      const m = RES_MODES.find((r) => r.id === resMode) || RES_MODES[0];
      const btn = $("pm-res"); if (btn) btn.textContent = "RESOLUTION: " + m.label;
      const gfx = G.gfx;
      if (m.v != null) { PerfGov.setAutoRes(false); if (gfx.setRenderScale) gfx.setRenderScale(m.v); }
      else PerfGov.setAutoRes(true);   // governor takes over from wherever the scale sits now
    }
    $("pm-res").onclick = () => {
      resMode = RES_MODES[(RES_MODES.findIndex((r) => r.id === resMode) + 1) % RES_MODES.length].id;
      store.set("resMode", resMode);
      applyResMode();
      if (G.soundOn) GameAudio.uiSelect();
    };
    applyResMode();

    return { setScale, applyResMode, applyUiScale, applyHudScale, applyBtnScale };
  }
  return { create };
})();
