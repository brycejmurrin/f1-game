/* Apex 26 — per-element HUD visibility toggles (SETTINGS › DISPLAY › HUD).
   Extends MAP/GAPS with independent on/off for the other chrome pieces.
   Store key `hudElements` is a JSON object of id → "on"|"off". Missing keys
   default ON. Applies as space-separated body[data-hud-hide~="…"] so CSS can
   hide without new class tokens (cssClasses ratchet is tight).
   Checklist UI is injected at runtime into #pm-hud-details — zero shellNodes. */
const HudElements = (function () {
  "use strict";

  const K = "hudElements";
  // MAP / GAPS / MIRROR keep their own SettingRows (auto/on/off). These are
  // the binary pieces a player often wants to clear one at a time (EA F1 25
  // per-element HUD toggles).
  const ELEMENTS = [
    ["pos", "POSITION"],
    ["lap", "LAP"],
    ["time", "LAP TIME"],
    ["best", "BEST"],
    ["delta", "DELTA"],
    ["sectors", "SECTORS"],
    ["speed", "SPEED"],
    ["gear", "GEARBOX"],
    ["energy", "ENERGY"],
    ["tyre", "TYRES"],
    ["ot", "OVERTAKE"],
    ["aero", "AERO"],
    ["bb", "BRAKE BIAS"],
    ["limits", "TRACK LIMITS"],
  ];

  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  let state = readState();

  function readState() {
    const raw = store ? store.get(K, null) : null;
    const out = {};
    for (let i = 0; i < ELEMENTS.length; i++) out[ELEMENTS[i][0]] = "on";
    if (!raw || typeof raw !== "object") return out;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const id = ELEMENTS[i][0];
      if (raw[id] === "off") out[id] = "off";
    }
    return out;
  }

  function persist() {
    if (!store) return;
    // Store only the offs — compact, defaults stay on for new keys.
    const slim = {};
    let any = false;
    for (const id of Object.keys(state)) {
      if (state[id] === "off") { slim[id] = "off"; any = true; }
    }
    store.set(K, any ? slim : {});
  }

  function hiddenList() {
    const list = [];
    for (let i = 0; i < ELEMENTS.length; i++) {
      const id = ELEMENTS[i][0];
      if (state[id] === "off") list.push(id);
    }
    return list;
  }

  function apply() {
    if (typeof document === "undefined" || !document.body) return;
    const list = hiddenList();
    if (list.length) document.body.dataset.hudHide = list.join(" ");
    else delete document.body.dataset.hudHide;
    if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();   // an attribute the fit key cannot see
  }

  function isOn(id) { return state[id] !== "off"; }

  function set(id, on) {
    if (!(id in state)) return isOn(id);
    state[id] = on ? "on" : "off";
    persist();
    apply();
    syncChecks();
    return isOn(id);
  }

  function syncChecks() {
    if (typeof document === "undefined") return;
    const root = document.getElementById("pm-hud-elements");
    if (!root) return;
    const boxes = root.querySelectorAll("input[data-hud-el]");
    for (let i = 0; i < boxes.length; i++) {
      const id = boxes[i].getAttribute("data-hud-el");
      boxes[i].checked = isOn(id);
    }
  }

  function ensureUI() {
    if (typeof document === "undefined") return;
    const fold = document.getElementById("pm-hud-details");
    if (!fold || document.getElementById("pm-hud-elements")) return;
    const group = fold.querySelector('[role="group"][aria-label="HUD layout"]') || fold;
    const wrap = document.createElement("div");
    wrap.id = "pm-hud-elements";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "HUD elements");
    const help = document.createElement("p");
    help.className = "adv-help";
    help.textContent = "Show or hide individual race HUD pieces. MAP, GAPS and MIRROR stay on their own rows above.";
    wrap.appendChild(help);
    const list = document.createElement("div");
    list.id = "pm-hud-elements-list";
    for (let i = 0; i < ELEMENTS.length; i++) {
      const [id, label] = ELEMENTS[i];
      const row = document.createElement("label");
      row.setAttribute("data-hud-el-row", id);
      const box = document.createElement("input");
      box.type = "checkbox";
      box.setAttribute("data-hud-el", id);
      box.checked = isOn(id);
      box.addEventListener("change", function () {
        set(id, !!box.checked);
      });
      const span = document.createElement("span");
      span.textContent = label;
      row.appendChild(box);
      row.appendChild(span);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    // After the MAP/GAPS help paragraph when present.
    const mirror = document.getElementById("pm-hudmirror");
    if (mirror && mirror.parentNode === group) {
      let insertAt = mirror.nextSibling;
      while (insertAt && insertAt.nodeType === 1 && insertAt.tagName === "P") {
        insertAt = insertAt.nextSibling;
      }
      // Prefer after the mirror help <p>.
      const mirrorHelp = mirror.nextElementSibling;
      if (mirrorHelp && mirrorHelp.tagName === "P") {
        group.insertBefore(wrap, mirrorHelp.nextSibling);
      } else {
        group.insertBefore(wrap, insertAt);
      }
    } else {
      group.appendChild(wrap);
    }
  }

  function initUI() {
    ensureUI();
    apply();
  }

  // Eval-time apply so the first race frame respects the store.
  apply();

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return {
    K, ELEMENTS, isOn, set, apply, hiddenList, initUI,
    state: () => Object.assign({}, state),
  };
})();
Object.freeze(HudElements);
