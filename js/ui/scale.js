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
    const SCALE_MIN = 40;
    const SCALE_MAX = 200;
    const SCALE_STEP = 0.25;
    // Touch defaults live in the `(pointer: coarse)` block of css/tokens.css and
    // are mirrored here — CSS owns FIRST paint, this owns every write after it,
    // and the two must not disagree. BUTTON SIZE stays a ratio of HUD SIZE so it
    // keeps following that slider while unset.
    // 1.25, corrected 2026-09-14 from 1.4536. See the long note on the
    // `(pointer: coarse)` block in css/tokens.css: 1.24 x 1.4536 put ~34mm
    // pedals on a phone and the column covered the minimap and the sector strip.
    // Target size and readout size are separate floors; this ratio carries the
    // buttons' physical floor, --hud-scale no longer carries a blanket bump.
    const BTN_OVER_HUD = 1.25;
    const coarseUi = () => { try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (_) { return false; } };
    const scaleDefault = (k) => (coarseUi() ? (k === "hudScale" ? 100 : 109) : 100);
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
    const scaleDefaultFor = (k) => (k === "hudBtnScale"
      ? scalePct("hudScale") * (coarseUi() ? BTN_OVER_HUD : 1)
      : scaleDefault(k));
    const scalePct = (k) => {
      const v = store.get(k, null);
      return typeof v === "number" ? scaleSnap(v) : scaleDefaultFor(k);
    };
    const scaleLabel = (pct) => {
      const t = scaleSnap(pct);
      return `${Math.abs(t % 1) < 1e-9 ? String(Math.round(t)) : t.toFixed(1)}%`;
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
      const out = $(`${inputId}-v`); if (out) out.textContent = scaleLabel(pct);
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
    const uiEl = $("pm-uiscale");
    if (uiEl) uiEl.oninput = (e) => {
      store.set("uiScale", scaleSnap(+e.target.value || scaleDefaultFor("uiScale")));
      applyUiScale();
    };
    const hudEl = $("pm-hudscale");
    if (hudEl) hudEl.oninput = (e) => {
      store.set("hudScale", scaleSnap(+e.target.value || scaleDefaultFor("hudScale")));
      applyHudScale();
    };
    const btnEl = $("pm-btnscale");
    if (btnEl) btnEl.oninput = (e) => {
      store.set("hudBtnScale", scaleSnap(+e.target.value || scaleDefaultFor("hudBtnScale")));
      applyBtnScale();
    };
    // REVERT IS PER-SETTING, and it is the same `store.set(key, null)` that
    // setScale already exposes: clearing the key drops the inline custom property,
    // so :root's own declaration takes back over — UI/HUD SIZE return to the
    // stylesheet default and BUTTON SIZE returns to FOLLOWING HUD SIZE. That is
    // why its button reads "follow HUD size" and the other two read "reset": they
    // are the same action but not the same promise, and labelling both "reset"
    // would have said the button snaps to a number when it snaps to a link.
    const revert = (key, apply) => (e) => {
      e.preventDefault(); e.stopPropagation();   // the button sits inside a <label>
      store.set(key, null);
      apply();
    };
    const uiRev = $("pm-uiscale-r"); if (uiRev) uiRev.onclick = revert("uiScale", applyUiScale);
    const hudRev = $("pm-hudscale-r"); if (hudRev) hudRev.onclick = revert("hudScale", applyHudScale);
    const btnRev = $("pm-btnscale-r"); if (btnRev) btnRev.onclick = revert("hudBtnScale", applyBtnScale);

    applyUiScale();
    applyHudScale();   // calls applyBtnScale — an unset button slider follows it
    function setScale(key, prop, v) {
      if (v !== undefined) {
        if (v === null) store.set(key, null);
        else store.set(key, scaleSnap(+v || scaleDefaultFor(key)));
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
    // A phone ships at LOW (half-res buffer) and a pointer device at AUTO — the
    // other half of the HIGH graphics preset above. Same question
    // Input.touchControlsNeeded() asks, asked directly (coarseUi, above) so
    // this module keeps no dependency on the input stack.
    let resMode = store.get("resMode", coarseUi() ? "low" : "auto");
    function applyResMode() {
      const m = RES_MODES.find((r) => r.id === resMode) || RES_MODES[0];
      SettingRow.paint($("pm-res"), m.id);
      const gfx = G.gfx;
      if (m.v != null) { PerfGov.setAutoRes(false); if (gfx.setRenderScale) gfx.setRenderScale(m.v); }
      else PerfGov.setAutoRes(true);   // governor takes over from wherever the scale sits now
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
      if (gfx && typeof gfx.setSpatialUpscale === "function") gfx.setSpatialUpscale(!!on);
      else {
        try { store.rawSet("spatialUpscale", on ? "1" : "0"); } catch (_) { /* blocked */ }
      }
    }
    SettingRow.wire("pm-upscale", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (upscaleOn() ? "on" : "off"),
      write: (v) => {
        applyUpscale(v === "on");
        if (G.soundOn) GameAudio.uiSelect();
      },
    });

    return { setScale, applyResMode, applyUiScale, applyHudScale, applyBtnScale, applyUpscale, upscaleOn };
  }
  return { create };
})();
