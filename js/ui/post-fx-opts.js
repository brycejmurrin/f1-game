"use strict";
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
  function gate(po) {
    if (!state.ssao) { po.ssao = 0; po.contact = 0; }
    if (!state.godrays) { po.godray = 0; po.lampVol = 0; }
    return po;
  }
  const DEBRIS_KEY = "debris";
  function debrisOn() {
    return store.raw(`apex26.${DEBRIS_KEY}`) === "1";
  }
  function setDebris(want) {
    const v = !!want;
    store.rawSet(`apex26.${DEBRIS_KEY}`, v ? "1" : "0");
    try {
      if (typeof DebrisWorld !== "undefined" && DebrisWorld.setEnabled) DebrisWorld.setEnabled(v);
    } catch (_) {  }
    return v;
  }
  const debris = Object.freeze({ KEY: DEBRIS_KEY, on: debrisOn, set: setDebris });

  function lookPostOff() {
    return PerfGov.lookPostShed ? PerfGov.lookPostShed() : PerfGov.autoTier() >= 4;
  }
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
      if (typeof SettingsNav !== "undefined" && SettingsNav.lazy) SettingsNav.lazy(initUI); else initUI();
    }, { once: true });
    else initUI();
  }

  return { KEYS, set, ssaoOn, godraysOn, gate, lookPostOff, applyLookShed, initUI, debris };
})();
Object.freeze(PostFxOpts);
