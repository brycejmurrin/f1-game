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
    store.rawSet(`apex26.${KEYS[which]}`, v ? "1" : "0");
    return v;
  }
  const ssaoOn = () => state.ssao;
  const godraysOn = () => state.godrays;

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

  return { KEYS, set, ssaoOn, godraysOn, initUI };
})();
Object.freeze(PostFxOpts);
