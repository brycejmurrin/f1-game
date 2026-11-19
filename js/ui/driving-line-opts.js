const DrivingLineOpts = (function () {
  "use strict";

  const K_PALETTE = "drivingLinePalette";
  const K_OPACITY = "drivingLineOpacity";
  const K_CUE = "lineBrakeCue";
  const K_CUE_LEGACY = "brakeCue";

  const store = GameStore.store;

  let cueOn = (() => {
    const v = store.get(K_CUE, null);
    if (v !== null) return v === "on";
    return store.get(K_CUE_LEGACY, null) === "on";
  })();

  DrivingLine.setPalette(store.get(K_PALETTE, "f1"));
  DrivingLine.setOpacity(store.get(K_OPACITY, "normal"));

  function brakeCue() { return cueOn; }
  function setBrakeCue(on) {
    cueOn = !!on;
    store.set(K_CUE, cueOn ? "on" : "off");
    return cueOn;
  }

  function initUI() {
    if (typeof SettingRow === "undefined") return;
    SettingRow.wire("pm-linecolor", {
      values: DrivingLine.PALETTES.map((p) => [p.id, p.label]),
      read: () => DrivingLine.palette(),
      write: (v) => { DrivingLine.setPalette(v); store.set(K_PALETTE, DrivingLine.palette()); },
    });
    SettingRow.wire("pm-lineopacity", {
      values: [["subtle", "SUBTLE"], ["normal", "NORMAL"], ["solid", "SOLID"]],
      read: () => DrivingLine.opacity(),
      write: (v) => { DrivingLine.setOpacity(v); store.set(K_OPACITY, DrivingLine.opacity()); },
    });
    SettingRow.wire("pm-linebrakecue", {
      values: SettingRow.labels(["off", "on"]),
      read: () => (cueOn ? "on" : "off"),
      write: (v) => setBrakeCue(v === "on"),
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => {
      if (typeof SettingsNav !== "undefined" && SettingsNav.lazy) SettingsNav.lazy(initUI); else initUI();
    }, { once: true });
    else initUI();
  }

  return { K_PALETTE, K_OPACITY, K_CUE, brakeCue, setBrakeCue, initUI };
})();
Object.freeze(DrivingLineOpts);
