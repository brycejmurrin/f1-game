"use strict";
/* Apex 26 — PostFxOpts: AMBIENT OCCLUSION and GOD-RAYS as two independent
   player settings (GRAPHICS). Both ship ON, so nothing changes until a player
   turns one off. OFF zeroes the strengths game.js hands present() — ssao +
   contact for the AO pass, godray + lampVol for the god-ray march — and every
   backend (GLX glx/post.js, TLX tlx-post.js, WGX wgx.js) already skips a pass
   whose strengths are all 0: the GPU work goes, not just the picture (the
   autoTier 4 shed uses the same gate).

   Keys: `apex26.gfxSsao`, `apex26.gfxGodrays` — raw lane, "1"/"0", unset = ON.
   Read per frame, so the answer is held in a variable, not re-read from storage.

   PostFxOpts.debris (the former DebrisOpts module, folded in 2026-11-10): the DEBRIS switch. The Rapier
   side-world (js/physics/debris-world.js) is a perf lever — a WASM physics world every frame — so it gets a row,
   not only a console flag. Nothing here touches DebrisWorld at eval. The key is the one DebrisWorld reads,
   `apex26.debris`, raw lane, "1"/"0": its create() reads it once at boot to decide whether to start the 2.2 MB
   Rapier import, so the switch has two halves: setEnabled() now, the key at the next boot. */
const PostFxOpts = (function () {
  "use strict";

  const KEYS = { ssao: "gfxSsao", godrays: "gfxGodrays" };
  const store = GameStore.store;
  const state = { ssao: true, godrays: true };

  function read(which) {
    try { return store.raw(`apex26.${KEYS[which]}`) !== "0"; } catch (_) { return true; }
  }
  state.ssao = read("ssao");
  state.godrays = read("godrays");

  function set(which, want) {
    if (!(which in KEYS)) return false;
    const v = !!want;
    state[which] = v;
    if (which === "ssao") store.rawSet("apex26.gfxSsao", v ? "1" : "0");
    else store.rawSet("apex26.gfxGodrays", v ? "1" : "0");
    return v;
  }
  const ssaoOn = () => state.ssao;
  const godraysOn = () => state.godrays;
  // Applied to the present opts after the governor's own tier-4 shed: a pass is
  // skipped only when EVERY strength it is gated on is 0 — AO is
  // ssao || contact, the god-ray march is godray || lampVol.
  function gate(po) {
    if (!state.ssao) { po.ssao = 0; po.contact = 0; }
    if (!state.godrays) { po.godray = 0; po.lampVol = 0; }
    return po;
  }
  const DEBRIS_KEY = "debris";   // apex26.debris — raw lane, "1"/"0", default OFF
  // The stored value, else SettingsDefaults' shipped default — deliberately NOT
  // DebrisWorld.status().enabled: `_enabled` is false until game.js calls
  // create(), and this row wires on DOMContentLoaded, which can come first.
  // Matched to create() exactly: only the raw string "1" enables the side-world.
  function debrisOn() {
    return store.raw(`apex26.${DEBRIS_KEY}`) === "1";
  }
  function setDebris(want) {
    const v = !!want;
    // rawSet swallows a blocked write itself (and records store.broken), so a
    // failure here costs the next boot, never this session's live half.
    store.rawSet(`apex26.${DEBRIS_KEY}`, v ? "1" : "0");
    // Live half: setEnabled(false) destroys the world; setEnabled(true) starts
    // the lazy Rapier load if this boot never did.
    try {
      if (typeof DebrisWorld !== "undefined" && DebrisWorld.setEnabled) DebrisWorld.setEnabled(v);
    } catch (_) { /* the stored half still reaches the next boot */ }
    return v;
  }
  const debris = Object.freeze({ KEY: DEBRIS_KEY, on: debrisOn, set: setDebris });

  // lookPostShed (GRAPHICS: LOW or measured/crash tier 4): zero look-defining strengths
  // before present(). autoTier alone left LOW with full bloom/SSAO/god-rays on tile GPUs.
  function lookPostOff() {
    return PerfGov.lookPostShed ? PerfGov.lookPostShed() : PerfGov.autoTier() >= 4;
  }
  // flareMul rides along (phoneperf 2026-10-24): the flare's sun-occlusion tap was the one
  // reader that kept the full-res scene depth store on a shed LOW frame (tlx-post needsDepth).
  function applyLookShed(po, v) {
    const off = lookPostOff();
    po.flareMul = off ? 0 : v.flareMul;
    po.bloom = off ? 0 : v.bloom;
    po.ssao = off ? 0 : v.ssao;
    po.godray = off ? 0 : v.godray;
    po.contact = off ? 0 : v.contact;
    po.lampVol = off ? 0 : v.lampVol;
    return po;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    // Silent writes: uiSelect() blips unconditionally and every call site supplies
    // its own `if (G.soundOn)` gate; this module has no G (DrivingLineOpts is the same).
    // DEBRIS OFF is a frame budget the player gets back; the race is otherwise unchanged.
    SettingRow.wire("pm-debris", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (debrisOn() ? "on" : "off"),
      write: (v) => setDebris(v === "on"),
    });
    SettingRow.wire("pm-ssao", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (state.ssao ? "on" : "off"),
      write: (v) => set("ssao", v === "on"),
    });
    SettingRow.wire("pm-godrays", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (state.godrays ? "on" : "off"),
      write: (v) => set("godrays", v === "on"),
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => {
      // #4798: wired at the first Settings enter / tap / idle, not in the DCL task.
      if (typeof SettingsNav !== "undefined" && SettingsNav.lazy) SettingsNav.lazy(initUI); else initUI();
    }, { once: true });
    else initUI();
  }

  return { KEYS, set, ssaoOn, godraysOn, gate, lookPostOff, applyLookShed, initUI, debris };
})();
Object.freeze(PostFxOpts);
