"use strict";
/* Apex 26 — PostFxOpts: AMBIENT OCCLUSION and GOD-RAYS as two independent
   player settings (GRAPHICS). Both ship ON, so nothing changes until a player
   turns one off. OFF zeroes the strengths game.js hands present() — ssao +
   contact for the AO pass, godray + lampVol for the god-ray march — and every
   backend (GLX glx/post.js, TLX tlx-post.js, WGX wgx.js) already skips a pass
   whose strengths are all 0: the GPU work goes, not just the picture (the
   autoTier 4 shed uses the same gate).

   Keys: `apex26.gfxSsao`, `apex26.gfxGodrays` — raw lane, "1"/"0", unset = ON.
   Read per frame, so the answer is held in a variable, not re-read from storage. */
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
  // lookPostShed (GRAPHICS: LOW or measured/crash tier 4): zero look-defining strengths
  // before present(). autoTier alone left LOW with full bloom/SSAO/god-rays on tile GPUs.
  function lookPostOff() {
    return PerfGov.lookPostShed ? PerfGov.lookPostShed() : PerfGov.autoTier() >= 4;
  }
  function applyLookShed(po, v) {
    const off = lookPostOff();
    po.bloom = off ? 0 : v.bloom;
    po.ssao = off ? 0 : v.ssao;
    po.godray = off ? 0 : v.godray;
    po.contact = off ? 0 : v.contact;
    po.lampVol = off ? 0 : v.lampVol;
    return po;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    // Silent writes for the same reason as DebrisOpts: no G here to gate the UI blip.
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
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return { KEYS, set, ssaoOn, godraysOn, gate, lookPostOff, applyLookShed, initUI };
})();
Object.freeze(PostFxOpts);
