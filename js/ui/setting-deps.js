const SettingDeps = (function () {
  "use strict";

  const doc = () => (typeof document !== "undefined" ? document : null);
  const byId = (id) => (doc() ? doc().getElementById(id) : null);

  function val(id) {
    let el = byId(id);
    if (el && el.tagName !== "SELECT" && el.tagName !== "INPUT") el = byId(id + "-sel") || el;
    if (!el) return null;
    if (el.type === "checkbox") return el.checked ? "on" : "off";
    return el.value === undefined || el.value === "" ? null : String(el.value);
  }
  function on(id) {
    const el = byId(id);
    if (!el) return null;
    if (el.type === "checkbox") return !!el.checked;
    const p = el.getAttribute && el.getAttribute("aria-pressed");
    if (p === "true" || p === "false") return p === "true";
    const v = val(id);
    return v === null ? null : v !== "off";
  }
  function is(id, ...values) { const v = val(id); return v === null ? null : values.includes(v); }
  function data(id, key) { const el = byId(id); return el && el.dataset ? el.dataset[key] || "" : null; }
  function off(id) { const el = byId(id); return el ? !!el.disabled : null; }
  const S = Object.freeze({ val, on, is, data, off });

  const layer = (slider, toggle, name) => ({ key: "layer-" + toggle, ids: [slider], parent: toggle, reason: name + " layer is off" });
  const RULES = Object.freeze([
    { key: "sound-engine", ids: ["as-engine-details"], parent: ["as-sound", "soundbtn"], reason: "Applies when SOUND is on" },
    { key: "sound-radio", ids: ["as-spot", "as-focus", "as-rpack", "as-rpreset"], parent: "soundbtn", reason: "SOUND is muted" },
    { key: "steer-tilt", ids: ["pm-tiltsimple", "pm-smooth", "pm-tiltcurve"],
      parent: "pm-steer", values: ["tilt"], reason: "TILT steering only" },
    { key: "steer-touch", ids: ["pm-touchrange", "pm-dragsmooth", "pm-touchcurve"],
      parent: "pm-steer", values: ["touch"], reason: "TOUCH steering only" },
    { key: "steer-touch-speed", ids: ["pm-touchdragspeed"], runtime: true,
      parent: "pm-steer", values: ["touch"], reason: "TOUCH steering only" },
    { key: "throttle-touch", ids: ["pm-throttlemode"], parent: "pm-steer", except: ["touch"], reason: "TOUCH uses AUTO gas" },
    { key: "cue-line", ids: ["pm-linebrakecue"], parent: "pm-brakecue", values: ["1"], reason: "PREDICTIVE CUE is on" },
    { key: "cue-condition", ids: ["pm-condition-cues"], runtime: true,
      parent: "pm-brakecue", except: ["1"], reason: "PREDICTIVE CUE is OFF" },
    { key: "touch-dock", ids: ["pm-btnscale", "pm-btnopacity", "pm-mirror"], reason: "Touch controls only",
      when: () => (typeof Input !== "undefined" && Input.touchControlsNeeded ? !!Input.touchControlsNeeded() : null) },
    { key: "hud-off", ids: ["pm-hudprofile", "pm-hudmetrics", "pm-hudmap", "pm-hudgaps", "pm-hudmirror", "pm-panelopacity"],
      parent: "pm-hidehud", values: ["on"], reason: "HUD is OFF" },
    { key: "upscale-full", ids: ["pm-upscale"], parent: "pm-res", except: ["high"], reason: "Needs RESOLUTION below HIGH" },
    { key: "titleart-off", ids: ["pm-tl-art-size", "pm-tl-art-x", "pm-tl-art-y"], runtime: true,
      parent: "pm-titleart", except: ["off"], reason: "TITLE ART is OFF" },
    { key: "panel-contrast", ids: ["pm-panelopacity"], reason: "Solid under HIGH CONTRAST",
      when: () => (doc() ? doc().documentElement.getAttribute("data-ui-contrast") !== "high" : null) },
    { key: "metrics-off", ids: ["pm-metrics-page", "pm-metrics-pos", "pm-metrics-size"], runtime: true,
      parent: "pm-metrics", reason: "OVERLAY is OFF" },
    { key: "xr-off", ids: ["pm-xr-backend", "pm-xr-input"], runtime: true, parent: "pm-xr-mode", reason: "VR MODE is OFF" },
    { key: "vignette-motion", ids: ["pm-speedvig"], runtime: true, reason: "Off under REDUCE MOTION",
      when: () => (typeof TitleFx !== "undefined" && TitleFx.mode ? TitleFx.mode() !== "reduce" : null) },
    { key: "intro-motion", ids: ["pm-titleintro", "pm-replay-intro"], reason: "Off under REDUCE MOTION",
      when: () => (typeof TitleFx !== "undefined" && TitleFx.mode ? TitleFx.mode() !== "reduce" : null) },
    layer("as-t-whine", "as-l-whine", "TURBO"),
    layer("as-t-harvest", "as-l-harvest", "HARVEST"),
    layer("as-t-boost", "as-l-ers", "ERS"),
    layer("as-t-wind", "as-l-wind", "WIND"),
    layer("as-t-tyres", "as-l-screech", "TYRES"),
    layer("as-t-brakes", "as-l-brakes", "BRAKES"),
    layer("as-t-rivals", "as-l-rivals", "RIVALS"),
    layer("as-t-rev", "as-l-reverb", "SPACE"),
    layer("as-t-ovr", "as-l-overrun", "OVERRUN"),
    layer("as-t-sub", "as-l-sub", "SUB"),
    layer("as-t-gravel", "as-l-gravel", "GRAVEL"),
    { key: "layer-as-l-limiter", ids: ["as-t-lim", "as-t-limrate", "as-t-limsag"], parent: "as-l-limiter", reason: "LIMITER layer is off" },
    { key: "line-off", ids: ["pm-linecolor", "pm-lineopacity"], reason: "OFF in Race settings",
      when: () => (typeof DrivingLine !== "undefined" && DrivingLine.mode ? DrivingLine.mode() !== "off" : null) },
    { key: "turnchase-cam", ids: ["pm-turnchase"], runtime: true, reason: "Cockpit views only",
      when: () => {
        if (typeof GameStore === "undefined" || !GameStore.store || typeof CamModes === "undefined") return null;
        const idx = GameStore.store.get("camMode", 19);
        const id = CamModes.CAM_MODES && CamModes.CAM_MODES[idx | 0] && CamModes.CAM_MODES[idx | 0].id;
        return id ? (id === "cockpit" || id === "visor" || id === "helmet") : null;
      } },
    { key: "photo-scene", ids: ["ps-background"], runtime: true, reason: "Needs My photo scene",
      when: () => {
        if (typeof GameStore === "undefined" || !GameStore.store) return null;
        if (GameStore.store.get("homeScene", "photo") === "photo") return true;
        const prev = byId("ps-preview");
        if (prev && prev.hidden) return null;
        return false;
      } },
  ]);

  const PASTE = "Paste a CLIENT ID first", CONNECT = "CONNECT Spotify first";
  const soundOff = (s) => s.on("soundbtn") === false;
  const EXPLAIN = Object.freeze([
    { key: "why-gears", ids: ["pm-gears"], why: "MANUAL needs TILT or a pad" },
    { key: "why-padreset", ids: ["pm-pad-profile-reset"], why: "Connect a controller first" },
    { key: "why-race-only", ids: ["pm-hidehud", "pm-lighting", "pm-camtune", "pm-flyby"], why: "Only during a race" },
    { key: "why-rec-share", ids: ["pm-phonerec-share", "pm-phonerec-copy"], why: "RECORD a run first" },
    { key: "why-rec", ids: ["pm-phonerec-rec"], why: "Stop AUTO SOAK first" },
    { key: "why-rec-quick", ids: ["pm-phonerec-quick"], why: "Already recording" },
    { key: "why-trace", ids: ["pm-driving-trace"], why: "Drive with COACH on first" },
    { key: "why-practice", ids: ["pm-practice-set", "pm-practice-retry", "pm-practice-rewind", "pm-drill"], why: null, link: "pm-practice-state" },
    { key: "why-restart", ids: ["pm-restart"], why: "Off in online sessions" },
    { key: "why-battle", ids: ["as-battle-ahead-closing", "as-battle-ahead-opening", "as-battle-behind-closing", "as-battle-behind-opening"],
      why: (s) => (soundOff(s) ? "Turn SOUND on" : "Turn BATTLE TONES on"), link: "as-battle-status" },
    { key: "why-voice", ids: ["as-v-control-pitch", "as-v-control-rate", "as-v-coach-pitch", "as-v-coach-rate", "as-v-radio-pitch", "as-v-radio-rate"],
      why: (s) => (soundOff(s) ? "Turn SOUND on" : null), link: "as-voices-note" },
    { key: "why-ann-voice", ids: ["as-v-announcer-pitch", "as-v-announcer-rate"], why: (s) => (soundOff(s) ? "Turn SOUND on" : null), link: "as-ann-note" },
    { key: "why-mix-test", ids: ["as-mix-test"], why: (s) => (soundOff(s) ? "Turn SOUND on" : "Test already playing") },
    { key: "why-mix-stop", ids: ["as-mix-stop"], why: "No test playing" },
    { key: "why-sp-connect", ids: ["as-sp-connect"],
      why: (s) => (s.val("as-sp-id") === null ? PASTE : s.data("as-sp-wrap", "spState") === "connecting" ? "Connecting…" : "Already connected") },
    { key: "why-sp-disconnect", ids: ["as-sp-disconnect"], why: (s) => (s.val("as-sp-id") === null ? PASTE : "Not connected") },
    { key: "why-sp", ids: ["as-sp-play", "as-sp-pause", "as-sp-next", "as-sp-check", "as-sp-open"],
      why: (s) => (s.val("as-sp-id") === null ? PASTE : s.data("as-sp-wrap", "spState") === "connected" ? null : CONNECT), link: "as-sp-status" },
    { key: "why-sp-sheet", ids: ["sp-toggle", "sp-prev", "sp-fwd", "sp-playlist2"], why: CONNECT, link: "sp-status2" },
    { key: "why-sp-device", ids: ["sp-refresh2", "sp-device2"],
      why: (s) => (s.data("as-sp-wrap", "spState") === "connected" ? "Only in REMOTE mode" : CONNECT), link: "sp-status2" },
    { key: "why-daily", ids: ["rs-laps", "rs-weather", "rs-time"], why: "Set by DAILY CHALLENGE" },
    { key: "why-season-quali", ids: ["rs-quali"], why: "Set by SEASON SETUP" },
    { key: "why-photo", ids: ["ps-save", "ps-export", "ps-background"], why: "CAPTURE a photo first", link: "ps-message" },
    { key: "why-photo-lib-bg", sel: "button.ps-use-bg", why: "Needs My photo scene" },
    { key: "why-ap-profile", ids: ["ap-profile-apply", "ap-profile-delete"], why: "Pick a saved PROFILE first" },
    { key: "why-ap-photo", ids: ["ap-photo-select", "ap-photo-choose"],
      why: (s) => (s.off("ap-photo-select") ? "No saved photos yet" : "Select a saved photo first") },
    { key: "why-garage-team", ids: ["cs-team-card"],
      why: () => (/race/i.test((byId("cs-team-card") || {}).title || "") ? "Fixed while in a race" : "Fixed by your career") },
    { key: "why-garage-edit", ids: ["cs-customize"], why: "Fixed while in a race" },
    { key: "why-garage-driver", sel: "#cs-driver button",
      why: () => {
        const row = byId("cs-driver");
        if (!row) return "Taken by the other player";
        for (const b of row.querySelectorAll("button")) {
          if (!b.disabled) continue;
          const t = b.title || "";
          if (/Taken/i.test(t)) return "Taken by the other player";
          if (/race/i.test(t)) return "Fixed while in a race";
          if (t) return "Fixed by your career";
        }
        return "Taken by the other player";
      } },
    { key: "why-title-only", ids: ["pm-tl-edit"], sel: 'button[data-peek="title"]', why: "Open from the TITLE screen" },
    { key: "why-tl-width", ids: ["tl-width-dn", "tl-width-up"], why: "Select the BUTTONS piece" },
    { key: "why-td-point", why: "Select a point first",
      sel: 'button[aria-label="Clear point selection"], button[aria-label="Focus selected points on the map and profile"], button[aria-label="Test here: test drive from the selected point"]' },
    { key: "why-td-span", ids: ["td-spanw-dn", "td-spanw-up"], why: "Select a RANGE of points" },
    { key: "why-td-chip", sel: ".td-chips button", text: ["START HERE", "DELETE POINT"], why: "Select a point first" },
    { key: "why-dh-download", sel: ".dh-export-row button", text: ["Download"], why: "Press GATHER first" },
  ]);

  const CONTROLS = "input, select, button, textarea";
  const isControl = (el) => el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "BUTTON" || el.tagName === "TEXTAREA");
  const isRow = (el) => el && el.classList && el.classList.contains("set-row");
  const isContainer = (el) => el && !isControl(el) && !isRow(el);

  function controlsOf(el) {
    if (isControl(el)) return [el];
    return Array.from(el.querySelectorAll(CONTROLS));
  }
  function rowOf(el) {
    if (isRow(el) || isContainer(el)) return el;
    return (el.closest && el.closest(".set-row, .tune-row, .adv-item, .player-tool-row")) || el;
  }
  function labelOf(el, row) {
    if (el.tagName === "BUTTON") return el;
    return row.querySelector(".tune-label") || null;
  }

  function reasonEl(id, el, row, text) {
    const rid = id + "-dep";
    let r = byId(rid);
    if (!r) {
      const d = doc();
      if (isContainer(el)) {
        r = d.createElement("p");
        r.setAttribute("data-dep-reason", "line");
        const sum = el.querySelector("summary");
        el.insertBefore(r, sum ? sum.nextSibling || null : el.children[0] || null);
      } else if (el.tagName === "BUTTON") {
        r = d.createElement("p");
        r.setAttribute("data-dep-reason", "line");
        const g = groupOf(el);
        if (g.parentNode) g.parentNode.insertBefore(r, g.nextSibling || null);
        else if (row.parentNode) row.parentNode.insertBefore(r, row.nextSibling || null);
      } else {
        r = d.createElement("span");
        r.setAttribute("data-dep-reason", "label");
        r.setAttribute("aria-hidden", "true");
        const host = labelOf(el, row);
        if (host) host.appendChild(r);
        else if (row.parentNode) row.parentNode.insertBefore(r, row.nextSibling || null);
      }
      r.setAttribute("id", rid);
    }
    if (r.textContent !== text) r.textContent = text;
    return r;
  }

  function describe(ctrl, rid, add) {
    const before = ctrl.getAttribute("aria-describedby");
    const cur = (before || "").split(/\s+/).filter(Boolean);
    const next = add ? (cur.includes(rid) ? cur : cur.concat(rid)) : cur.filter((x) => x !== rid);
    const joined = next.join(" ");
    if (!next.length) ctrl.removeAttribute("aria-describedby");
    else if (ctrl.getAttribute("aria-describedby") !== joined) ctrl.setAttribute("aria-describedby", joined);
  }

  function apply(id, rule, off) {
    const el = byId(id);
    if (!el) return;
    const row = rowOf(el);
    const mine = row.getAttribute("data-dep-off");
    if (mine && mine !== rule.key) return;
    if (!off && !mine) return;
    const ctrls = controlsOf(el);
    const rid = id + "-dep";
    if (off) {
      const r = reasonEl(id, el, row, rule.reason);
      if (r.hidden) r.hidden = false;
      if (mine !== rule.key) row.setAttribute("data-dep-off", rule.key);
      for (const c of ctrls) {
        if (!c.disabled) { c.setAttribute("data-dep-disabled", ""); c.disabled = true; }
        if (c.getAttribute("aria-disabled") !== "true") c.setAttribute("aria-disabled", "true");
        describe(c, rid, true);
      }
      return;
    }
    row.removeAttribute("data-dep-off");
    const r = byId(rid);
    if (r) { if (!r.hidden) r.hidden = true; if (r.textContent) r.textContent = ""; }
    for (const c of ctrls) {
      if (c.hasAttribute("data-dep-disabled")) { c.disabled = false; c.removeAttribute("data-dep-disabled"); }
      if (c.hasAttribute("aria-disabled")) c.removeAttribute("aria-disabled");
      describe(c, rid, false);
    }
    if (isRow(el) && typeof SettingRow !== "undefined" && SettingRow.parts && !ctrls.some((c) => c.disabled)) {
      const p = SettingRow.parts(el);
      if (p && p.sel) SettingRow.disable(el, false);
    }
  }

  function state(rule) {
    try {
      const v = rule.when ? rule.when(S)
        : rule.values ? S.is(rule.parent, ...rule.values)
        : rule.except ? S.is(rule.parent, ...rule.except) === null ? null : !S.is(rule.parent, ...rule.except)
        : [].concat(rule.parent).map(S.on).reduce((a, v) => (a === false || v === false ? false : a === null ? v : a), null);
      return v === null || v === undefined ? null : !!v;
    }
    catch (e) { Log.warn("game", "SettingDeps rule " + rule.key + " failed: " + (e && e.message)); return null; }
  }

  function targets(rule) {
    const out = (rule.ids || []).map(byId).filter(Boolean);
    if (rule.sel && doc()) {
      for (const el of doc().querySelectorAll(rule.sel)) {
        const t = (el.textContent || "").trim();
        if (!rule.text || rule.text.some((x) => t.startsWith(x))) if (!out.includes(el)) out.push(el);
      }
    }
    return out;
  }
  const keyControl = (el) => (isRow(el) ? el.querySelector("select") : isControl(el) ? el : null);
  const groupOf = (el) => (el.closest && el.closest(".opt-row, .balanced-row, .player-tool-row, .as-profile-row, .td-chips, .td-row, .dh-export-row")) || el;

  function whyEl(rule, el, n) {
    const labelled = isRow(el) || (el.tagName !== "BUTTON" && rowOf(el) !== el && rowOf(el).querySelector(".tune-label"));
    if (labelled) {
      const base = el.id || rule.key + "-" + n;
      const rid = base + "-why";
      let r = byId(rid);
      if (!r) {
        r = doc().createElement("span");
        r.setAttribute("data-dep-reason", "label");
        r.setAttribute("aria-hidden", "true");
        r.setAttribute("id", rid);
        (rowOf(el).querySelector(".tune-label") || rowOf(el)).appendChild(r);
      }
      return r;
    }
    const g = groupOf(el);
    const attr = "data-why-" + rule.key;
    let rid = g.getAttribute(attr);
    let r = rid ? byId(rid) : null;
    if (!r) {
      rid = rule.key + "-why-" + n;
      r = doc().createElement("p");
      r.setAttribute("data-dep-reason", "line");
      r.setAttribute("id", rid);
      if (g.parentNode) g.parentNode.insertBefore(r, g.nextSibling || null);
      g.setAttribute(attr, rid);
    }
    return r;
  }

  function explain(rule) {
    let why = null;
    const list = targets(rule);
    if (!list.length) return;
    try { why = typeof rule.why === "function" ? rule.why(S) : rule.why; }
    catch (e) { Log.warn("game", "SettingDeps explain " + rule.key + " failed: " + (e && e.message)); }
    const shown = new Set();
    list.forEach((el, n) => {
      const c = keyControl(el);
      if (!c) return;
      const row = rowOf(el);
      const greyed = !row.hasAttribute("data-dep-off")
        && ((c.disabled && !c.hasAttribute("data-dep-disabled")) || c.getAttribute("aria-disabled") === "true");
      const ctrls = isRow(el) ? controlsOf(el) : [c];
      const r = why || greyed ? whyEl(rule, el, n) : null;
      if (greyed && why) {
        if (r.textContent !== why) r.textContent = why;
        if (r.hidden) r.hidden = false;
        shown.add(r);
      } else if (r && !shown.has(r)) { if (!r.hidden) r.hidden = true; if (r.textContent) r.textContent = ""; }
      for (const x of ctrls) {
        if (r) describe(x, r.id, greyed && !!why);
        if (rule.link && byId(rule.link)) describe(x, rule.link, greyed);
      }
    });
  }

  function refresh() {
    for (const rule of RULES) {
      const s = state(rule);
      for (const id of rule.ids) apply(id, rule, s === false);
    }
    for (const rule of EXPLAIN) explain(rule);
  }

  let pending = false;
  function soon() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; refresh(); }, 48);
  }
  function init() {
    const d = doc();
    if (!d) return;
    for (const t of ["change", "input", "click"]) d.addEventListener(t, soon, true);
    if (typeof SettingsNav !== "undefined" && SettingsNav.onEnter) SettingsNav.onEnter(soon);
    if (typeof MutationObserver !== "undefined" && d.documentElement) {
      new MutationObserver(soon).observe(d.documentElement, { subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
    }
    refresh();
  }
  if (doc()) {
    if (doc().readyState !== "complete") doc().addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(init) : init()), { once: true });
    else init();
  }

  return { RULES, EXPLAIN, refresh, state };
})();
Object.freeze(SettingDeps);
