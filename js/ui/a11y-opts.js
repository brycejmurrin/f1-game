/* Apex 26 — A11yOpts: SETTINGS › ACCESSIBILITY.

   Three player preferences that are not "look" (Appearance) and not HUD:
     * REDUCE MOTION — Auto / On / Off (TitleFx owns storage + html[data-motion];
       this module builds the row and wires it).
     * KEYBOARD FOCUS — Standard / High (html[data-focus]); High thickens the
       :focus-visible ring on menus and settings.
     * COLOURBLIND CUES — Off / On (html[data-cb-cues]); adds S/M/H/I/W letters
       on Data Hub compound chips, ISO country codes beside circuit flags in
       menus, and matching letter/shape cues on the race HUD (tyres, flags,
       sector splits).

   Self-contained like AppearanceOpts: GameStore + SettingRow, no G façade.
   Panel body is runtime-built so shellNodes stays under its absorb. */
const A11yOpts = (function () {
  "use strict";

  const K_FOCUS = "focusRing";     // apex26.focusRing — "standard" | "high"
  const K_CB = "cbCues";           // apex26.cbCues — "off" | "on"

  const FOCUS = [["standard", "STANDARD"], ["high", "HIGH"]];
  const CB = [["off", "OFF"], ["on", "ON"]];
  // REDUCE MOTION labels (values are TitleFx's stored tokens).
  const MOTION = [["auto", "AUTO"], ["reduce", "ON"], ["off", "OFF"]];

  const store = GameStore.store;
  const root = () => (typeof document !== "undefined" ? document.documentElement : null);

  function oneOf(v, allowed, fallback) {
    const s = String(v == null ? "" : v);
    for (const [id] of allowed) if (id === s) return s;
    return fallback;
  }

  let focusRing = oneOf(store.get(K_FOCUS, "high"), FOCUS, "high");
  let cbCues = oneOf(store.get(K_CB, "off"), CB, "off");

  function applyFocus() {
    const el = root();
    if (!el || !el.dataset) return;
    if (focusRing === "high") el.dataset.focus = "high";
    else delete el.dataset.focus;
  }
  function applyCb() {
    const el = root();
    if (!el || !el.dataset) return;
    if (cbCues === "on") el.dataset.cbCues = "on";
    else delete el.dataset.cbCues;
  }
  function apply() { applyFocus(); applyCb(); }

  function setFocus(v) {
    focusRing = oneOf(v, FOCUS, "high");
    store.set(K_FOCUS, focusRing);
    applyFocus();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-focus", focusRing);
    return focusRing;
  }
  function setCb(v) {
    cbCues = oneOf(v, CB, "off");
    store.set(K_CB, cbCues);
    applyCb();
    if (typeof SettingRow !== "undefined" && SettingRow.paint) SettingRow.paint("pm-cbcues", cbCues);
    return cbCues;
  }

  /** Compound letter for Data Hub / menu chips (S/M/H/I/W). */
  function compoundLetter(name) {
    const n = String(name || "").toUpperCase();
    if (n.indexOf("SOFT") === 0 || n === "S") return "S";
    if (n.indexOf("MED") === 0 || n === "M") return "M";
    if (n.indexOf("HARD") === 0 || n === "H") return "H";
    if (n.indexOf("INTER") === 0 || n === "I" || n === "INT") return "I";
    if (n.indexOf("WET") === 0 || n === "W") return "W";
    return n ? n.charAt(0) : "";
  }

  function cuesOn() {
    return cbCues === "on";
  }

  function help(id, text) {
    const p = document.createElement("p");
    p.className = "adv-help";
    p.id = id;
    p.textContent = text;
    return p;
  }

  function mountPanel() {
    const panel = typeof document !== "undefined" ? document.getElementById("pm-panel-a11y") : null;
    if (!panel || typeof SettingRow === "undefined" || !SettingRow.build) return;
    if (document.getElementById("pm-motion")) return;   // already mounted (or shell still has a row)

    const h = document.createElement("h3");
    h.className = "adv-sec";
    h.textContent = "ACCESSIBILITY";
    panel.appendChild(h);

    const motion = SettingRow.build("pm-motion", "REDUCE MOTION", MOTION);
    const motionSel = motion.row.querySelector("select");
    if (motionSel) motionSel.setAttribute("aria-describedby", "pm-motion-help");
    panel.appendChild(motion.row);
    panel.appendChild(help("pm-motion-help",
      "AUTO follows your system preference. ON always reduces menu motion, camera shake and the pre-race flyby. OFF keeps motion even when the system asks to reduce it."));

    const focus = SettingRow.build("pm-focus", "KEYBOARD FOCUS", FOCUS);
    const focusSel = focus.row.querySelector("select");
    if (focusSel) focusSel.setAttribute("aria-describedby", "pm-focus-help");
    panel.appendChild(focus.row);
    panel.appendChild(help("pm-focus-help",
      "HIGH draws a thicker focus ring on every menu and settings control so Tab and arrow keys stay easy to see."));

    const cb = SettingRow.build("pm-cbcues", "COLOURBLIND CUES", CB);
    const cbSel = cb.row.querySelector("select");
    if (cbSel) cbSel.setAttribute("aria-describedby", "pm-cbcues-help");
    panel.appendChild(cb.row);
    panel.appendChild(help("pm-cbcues-help",
      "ON adds S/M/H/I/W letters on Data Hub tyre chips, country codes beside circuit flags, and the same compound letters plus flag and sector shape cues on the race HUD."));
  }

  function wireRows() {
    if (typeof SettingRow === "undefined") return;
    mountPanel();
    if (document.getElementById("pm-motion") && typeof TitleFx !== "undefined") {
      SettingRow.wire("pm-motion", {
        values: MOTION,
        read: () => (TitleFx.choice ? TitleFx.choice() : "auto"),
        write: (v) => {
          if (TitleFx.setChoice) TitleFx.setChoice(v);
          else if (TitleFx.set) TitleFx.set(v);
        },
      });
    }
    if (document.getElementById("pm-focus")) {
      SettingRow.wire("pm-focus", { values: FOCUS, read: () => focusRing, write: (v) => setFocus(v) });
    }
    if (document.getElementById("pm-cbcues")) {
      SettingRow.wire("pm-cbcues", { values: CB, read: () => cbCues, write: (v) => setCb(v) });
    }
  }

  function initUI() {
    wireRows();
  }

  apply();

  if (typeof document !== "undefined") {
    if (document.readyState === "complete") initUI();
    else document.addEventListener("DOMContentLoaded", initUI, { once: true });
  }

  return Object.freeze({
    K_FOCUS, K_CB, FOCUS, CB, MOTION,
    focusRing: () => focusRing,
    cbCues: () => cbCues,
    cuesOn, compoundLetter,
    setFocus, setCb, apply, applyFocus, applyCb,
    initUI, wireRows, mountPanel,
  });
})();
Object.freeze(A11yOpts);
