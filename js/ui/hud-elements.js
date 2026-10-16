/* Apex 26 — per-element HUD visibility toggles (SETTINGS › DISPLAY › HUD).
   Extends MAP/GAPS with independent on/off for the other chrome pieces.
   Store key `hudElements` is a JSON object of id → "on"|"off". Missing keys
   default ON (the opt-in readouts default OFF). Applies as space-separated
   body[data-hud-hide~="…"] so CSS can hide without new class tokens (cssClasses ratchet is tight).
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
    ["damage", "DAMAGE"],
    // OPT-IN readouts (third field "off" = shipped hidden): js/ui/hud-relative.js,
    // js/ui/hud-strategy.js, js/ui/hud-inputs.js. Stored only when it differs.
    // REL is the one exception: BROADCAST style ships it ON (timing-board
    // neighbour list). STANDARD / MINIMAL stay off. Fuel / tyre-temp readouts
    // are out of scope.
    ["rel", "RELATIVE", "off"],
    ["strat", "STRATEGY", "off"],
    ["inputs", "INPUTS", "off"],
  ];
  const dflt = (e) => e[2] || "on";
  const PROFS = { standard: 1, minimal: 1, broadcast: 1 };

  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  let state = readState();

  /** HUD style that decides REL's shipped default. Prefers HudLayout.profile()
   *  (live body class while racing, else the store); falls back when layout
   *  has not loaded yet (this file is earlier in the roster). */
  function profileOf() {
    try {
      // typeof on a const still in TDZ throws (HudLayout.apply at eval).
      if (typeof HudLayout !== "undefined" && HudLayout && typeof HudLayout.profile === "function") {
        const p = HudLayout.profile();
        if (PROFS[p]) return p;
      }
    } catch (_) { /* mini-dom / eval order / TDZ during hud-layout.js init */ }
    if (typeof document !== "undefined" && document.body && document.body.classList
        && typeof document.body.classList.contains === "function") {
      const c = document.body.classList;
      if (c.contains("hud-prof-broadcast")) return "broadcast";
      if (c.contains("hud-prof-minimal")) return "minimal";
    }
    if (store) {
      const v = store.get("hudProfile", null);
      if (PROFS[v]) return v;
    }
    return "standard";
  }

  /** Shipped on/off for `id` in the current (or given) style. Only `rel` cares. */
  function shippedOf(id, prof) {
    if (id === "rel" && (prof || profileOf()) === "broadcast") return "on";
    for (let i = 0; i < ELEMENTS.length; i++) {
      if (ELEMENTS[i][0] === id) return dflt(ELEMENTS[i]);
    }
    return "on";
  }

  function readState() {
    const raw = store ? store.get(K, null) : null;
    const out = {};
    for (let i = 0; i < ELEMENTS.length; i++) out[ELEMENTS[i][0]] = shippedOf(ELEMENTS[i][0]);
    if (!raw || typeof raw !== "object") return out;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const id = ELEMENTS[i][0];
      if (raw[id] === "off" || raw[id] === "on") out[id] = raw[id];
    }
    return out;
  }

  function persist() {
    if (!store) return;
    // Store only what differs from the shipped default — compact, and a new
    // key keeps its own default (on, or off for the opt-in readouts). REL's
    // default follows the current HUD style.
    const slim = {};
    let any = false;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const id = ELEMENTS[i][0];
      if (state[id] !== shippedOf(id)) { slim[id] = state[id]; any = true; }
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
    state = readState();
    if (typeof document === "undefined" || !document.body) return;
    const list = hiddenList();
    if (list.length) document.body.dataset.hudHide = list.join(" ");
    else delete document.body.dataset.hudHide;
    if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();   // an attribute the fit key cannot see
    syncChecks();
  }

  function isOn(id) { return state[id] !== "off"; }

  function set(id, on) {
    if (!(id in state)) return isOn(id);
    state[id] = on ? "on" : "off";
    persist();
    apply();
    return isOn(id);
  }

  let contextOf = () => ({}), navigate = null;
  const MINIMAL_HIDDEN = new Set(["best", "energy", "ot", "aero", "bb", "sectors", "damage", "rel", "strat", "inputs"]);
  const CAMERA_HIDDEN = new Set(["gear", "ot", "aero", "energy", "bb", "limits", "damage", "rel", "strat", "inputs"]);
  /** Read-only availability. Enabled is a preference, not a promise that this
   *  session/camera currently has a readout to paint. Never changes a toggle. */
  function effective(id, supplied) {
    const c = supplied || contextOf() || {}, body = typeof document !== "undefined" && document.body;
    const has = (name) => !!(body && body.classList && body.classList.contains(name));
    const profile = c.profile || profileOf();
    const result = (status, text, page, target) => ({ status, text, page: page || null, target: target || null });
    if (!isOn(id)) return result("off", "Off in your HUD preferences");
    if (c.hudHidden || has("hud-hidden")) return result("hidden", "Hidden by Hide HUD");
    if (c.watching || has("bc-on")) return result("hidden", "Hidden by the replay broadcast overlay");
    if (profile === "minimal" && MINIMAL_HIDDEN.has(id)) return result("hidden", "Hidden by Minimal HUD style", "display", "pm-hudprofile-sel");
    if ((c.broadcastCamera || has("hud-bcam")) && (CAMERA_HIDDEN.has(id) || (id === "sectors" && profile !== "broadcast"))) return result("hidden", "Hidden by the current broadcast camera");
    if (id === "strat" && (c.timeTrial || c.practice || c.session === "quali")) return result("unavailable", "Strategy is available in races, not this session");
    if ((id === "tyre" || id === "strat") && (c.tyreWear === false || (c.tyreWear == null && store && store.get("tyreWear", "real") === "off"))) return result("unavailable", "Requires tyre wear in Race Settings", "race-settings", "rs-tyres-sel");
    if (c.hasPlayer === false || (c.state && c.state !== "race" && c.state !== "count")) return result("waiting", "Available during a live session");
    if (id === "rel" && (c.timeTrial || c.carCount === 1)) return result("unavailable", "Relative needs other cars on track");
    if (id === "damage" && c.damageVisible === false) return result("waiting", "Waiting for damage above the display threshold");
    if (id === "limits" && c.limitsVisible === false) return result("waiting", "Waiting for a track-limits warning");
    if (id === "delta" && c.deltaReady === false) return result("waiting", "Waiting for a reference lap");
    return result("enabled", "Enabled when live data is available");
  }
  function configure(options) {
    if (options && typeof options.context === "function") contextOf = options.context;
    if (options && typeof options.navigate === "function") navigate = options.navigate;
    syncChecks();
  }

  function syncChecks() {
    if (typeof document === "undefined") return;
    const root = document.getElementById("pm-hud-elements");
    if (!root) return;
    const boxes = root.querySelectorAll("input[data-hud-el]");
    for (let i = 0; i < boxes.length; i++) {
      const id = boxes[i].getAttribute("data-hud-el");
      boxes[i].checked = isOn(id);
      const row = boxes[i].closest && boxes[i].closest("[data-hud-el-row]");
      if (!row) continue;
      const reason = effective(id), text = row.querySelector("[data-hud-reason]");
      if (text && text.textContent !== reason.text) text.textContent = reason.text;
      const link = row.querySelector("[data-hud-reason-link]");
      if (link) { link.hidden = !(navigate && reason.page); link.onclick = () => { const live = effective(id); if (navigate && live.page) navigate(live.page, live.target); }; }
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
      const id = ELEMENTS[i][0], label = ELEMENTS[i][1];
      const row = document.createElement("div"), labelRow = document.createElement("label");
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
      const reason = document.createElement("small"); reason.setAttribute("data-hud-reason", ""); reason.id = "hud-reason-" + id;
      box.setAttribute("aria-describedby", reason.id);
      const link = document.createElement("button"); link.type = "button"; link.className = "sel-chip";
      link.setAttribute("data-hud-reason-link", ""); link.textContent = "VIEW REQUIREMENT"; link.hidden = true;
      link.setAttribute("aria-label", "View requirement for " + label);
      labelRow.appendChild(box); labelRow.appendChild(span); row.appendChild(labelRow);
      row.appendChild(reason); row.appendChild(link);
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

  // REL's shipped default follows hudProfile: re-hide / re-show when the style
  // changes (SETTINGS › DISPLAY › HUD › STYLE, or a studio preset).
  if (store && store.subscribe) {
    store.subscribe((c) => {
      if (c && (c.clear || ["hudProfile", "hudElements", "tyreWear"].includes(c.key) || (Array.isArray(c.keys) && c.keys.some((k) => ["hudProfile", "hudElements", "tyreWear"].includes(k))))) apply();
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }

  return {
    K, ELEMENTS, isOn, set, apply, hiddenList, initUI, shippedOf, profileOf,
    effective, configure, refreshVisibility: syncChecks,
    state: () => Object.assign({}, state),
  };
})();
Object.freeze(HudElements);
