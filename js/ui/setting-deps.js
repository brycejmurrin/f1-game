/* SettingDeps — the ONE place a setting greys out because another setting
   makes it do nothing (tilt sliders under TOUCH steering, engine-layer levels
   with the layer muted, line colour with the driving line OFF).

   RULES is declarative: a rule names the controls it governs, a predicate over
   the PARENT controls' live DOM state (a select's value, a toggle's
   aria-pressed) or a module's state, and the reason a player reads. Reading the
   parent's DOM keeps this module free of game state: the owner already paints
   its control, so the dependency follows whatever the owner shows.

   An inactive control is DISABLED, never hidden (hiding reflows the sheet under
   a finger: setting-row.js), keeps its value, and carries a reason: a short
   aria-hidden suffix in its own one-line label (no reflow) that the control's
   aria-describedby points at. A container target (a whole <details> section)
   disables every control inside it but its summary, and its reason is a line
   at the top of the section.

   Only what this module disabled is re-enabled here (data-dep-off marks it):
   an owner's own disable (a DAILY race locking LAPS) is never undone.

   EXPLAIN is the second table: controls their OWNER greys (LAPS in a DAILY
   race, Spotify before CONNECT, SAVE PHOTO before a capture). SettingDeps never
   changes those; while the owner has one disabled it shows WHY, in the same
   reason slot, and drops it the moment the owner enables it again.
   Findings, plan and the rule table's sources: docs/notes/UI-FIX-GREYOUT-2026-10-18.md. */
const SettingDeps = (function () {
  "use strict";

  const doc = () => (typeof document !== "undefined" ? document : null);
  const byId = (id) => (doc() ? doc().getElementById(id) : null);

  /* The parent readers handed to every predicate. val() reads a SettingRow's
     select (pass the row id or the select id), a range or a checkbox; on()
     reads an aria-pressed toggle or a checkbox. A parent missing from the DOM
     reads null, and every rule treats null as "do not grey" (a lazy panel that
     has not built yet must not lock anything). */
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
  // is(id, ...values): the parent's value is one of these; null-tolerant.
  function is(id, ...values) { const v = val(id); return v === null ? null : values.includes(v); }
  // data(id, key): a dataset field an owner paints (Spotify's spState).
  function data(id, key) { const el = byId(id); return el && el.dataset ? el.dataset[key] || "" : null; }
  function off(id) { const el = byId(id); return el ? !!el.disabled : null; }
  const S = Object.freeze({ val, on, is, data, off });

  /* A rule: { key, ids: [control or container id…], parent, values? | except?,
     reason, runtime? }. With `values` the rule is live while the parent's value
     is one of them, with `except` while it is none of them; with neither, while
     the parent is ON (aria-pressed, a checkbox, or any value but "off"); a
     list of parents must ALL be on. A rule
     whose parent is module state, not a control, gives `when(S)` instead.
     `runtime` marks targets a module builds (not in index.html). Every predicate answers true (live), false (grey) or
     null (parent unknown: leave the control alone). `reason` stays short: it
     sits inside a one-line label. */
  const layer = (slider, toggle, name) => ({ key: "layer-" + toggle, ids: [slider], parent: toggle, reason: name + " layer is off" });
  const RULES = Object.freeze([
    // A container rule first: its re-enable runs before a narrower rule re-greys a control inside it.
    // SOUND EFFECTS row AND the master speaker button (engine.js sfxOk).
    { key: "sound-engine", ids: ["as-engine-details"], parent: ["as-sound", "soundbtn"], reason: "Applies when SOUND is on" },
    // Radio voices play through the master bus (radio-voice.js).
    { key: "sound-radio", ids: ["as-spot", "as-focus", "as-rpack", "as-rpreset"], parent: "soundbtn", reason: "SOUND is muted" },
    { key: "steer-tilt", ids: ["pm-tiltsimple", "pm-smooth", "pm-tiltcurve"],
      parent: "pm-steer", values: ["tilt"], reason: "TILT steering only" },
    { key: "steer-touch", ids: ["pm-touchrange", "pm-dragsmooth", "pm-touchcurve"],
      parent: "pm-steer", values: ["touch"], reason: "TOUCH steering only" },
    { key: "steer-touch-speed", ids: ["pm-touchdragspeed"], runtime: true,
      parent: "pm-steer", values: ["touch"], reason: "TOUCH steering only" },
    // TOUCH always drives the throttle for you (game.js throttleMode()).
    { key: "throttle-touch", ids: ["pm-throttlemode"], parent: "pm-steer", except: ["touch"], reason: "TOUCH uses AUTO gas" },
    // PREDICTIVE CUE (1 = OFF) outranks the line-speed cue and is what condition-aware timing adjusts.
    { key: "cue-line", ids: ["pm-linebrakecue"], parent: "pm-brakecue", values: ["1"], reason: "PREDICTIVE CUE is on" },
    { key: "cue-condition", ids: ["pm-condition-cues"], runtime: true,
      parent: "pm-brakecue", except: ["1"], reason: "PREDICTIVE CUE is OFF" },
    // Button size, opacity and handedness style the on-screen touch dock only.
    { key: "touch-dock", ids: ["pm-btnscale", "pm-btnopacity", "pm-mirror"], reason: "Touch controls only",
      when: () => (typeof Input !== "undefined" && Input.touchControlsNeeded ? !!Input.touchControlsNeeded() : null) },
    { key: "hud-off", ids: ["pm-hudprofile", "pm-hudmetrics", "pm-hudmap", "pm-hudgaps", "pm-hudmirror", "pm-panelopacity"],
      parent: "pm-hidehud", values: ["on"], reason: "HUD is OFF" },
    // SGSR reconstructs a below-full buffer; at HIGH there is nothing to upscale.
    { key: "upscale-full", ids: ["pm-upscale"], parent: "pm-res", except: ["high"], reason: "Needs RESOLUTION below HIGH" },
    { key: "titleart-off", ids: ["pm-tl-art-size", "pm-tl-art-x", "pm-tl-art-y"], runtime: true,
      parent: "pm-titleart", except: ["off"], reason: "TITLE ART is OFF" },
    // HIGH CONTRAST keeps every plate solid (tokens.css --hud-panel-a-eff).
    { key: "panel-contrast", ids: ["pm-panelopacity"], reason: "Solid under HIGH CONTRAST",
      when: () => (doc() ? doc().documentElement.getAttribute("data-ui-contrast") !== "high" : null) },
    { key: "metrics-off", ids: ["pm-metrics-page", "pm-metrics-pos", "pm-metrics-size"], runtime: true,
      parent: "pm-metrics", reason: "OVERLAY is OFF" },
    { key: "xr-off", ids: ["pm-xr-backend", "pm-xr-input"], runtime: true, parent: "pm-xr-mode", reason: "VR MODE is OFF" },
    { key: "vignette-motion", ids: ["pm-speedvig"], runtime: true, reason: "Off under REDUCE MOTION",
      when: () => (typeof TitleFx !== "undefined" && TitleFx.mode ? TitleFx.mode() !== "reduce" : null) },
    // The intro never plays under REDUCE MOTION (title-fx.js); the effective mode folds in the OS setting.
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
    // The DRIVING LINE mode is a RACE SETTINGS row (another screen), so read the module.
    { key: "line-off", ids: ["pm-linecolor", "pm-lineopacity"], reason: "OFF in Race settings",
      when: () => (typeof DrivingLine !== "undefined" && DrivingLine.mode ? DrivingLine.mode() !== "off" : null) },
    // TURN CHASING only aims the cockpit / visor / helmet look (vantage.js).
    { key: "turnchase-cam", ids: ["pm-turnchase"], runtime: true, reason: "Cockpit views only",
      when: () => {
        if (typeof GameStore === "undefined" || !GameStore.store || typeof CamModes === "undefined") return null;
        // Default 19 matches game.js's shipped camMode read (store-registry).
        const idx = GameStore.store.get("camMode", 19);
        const id = CamModes.CAM_MODES && CamModes.CAM_MODES[idx | 0] && CamModes.CAM_MODES[idx | 0].id;
        return id ? (id === "cockpit" || id === "visor" || id === "helmet") : null;
      } },
    // USE AS MENU BACKGROUND only paints when Appearance Scene is My photo.
    // No capture yet → leave alone so EXPLAIN can say "CAPTURE a photo first".
    { key: "photo-scene", ids: ["ps-background"], runtime: true, reason: "Needs My photo scene",
      when: () => {
        if (typeof GameStore === "undefined" || !GameStore.store) return null;
        if (GameStore.store.get("homeScene", "photo") === "photo") return true;
        const prev = byId("ps-preview");
        if (prev && prev.hidden) return null;
        return false;
      } },
  ]);

  /* EXPLAIN: { key, ids?, sel?, text?, why, link? }. `ids` and/or `sel` (a CSS
     selector for runtime DOM with no ids; `text` keeps only matches whose
     label starts with one of these) name the controls; `why` is the reason, or
     why(S) picks it from what the screen shows (null: no own text); `link` is
     an existing status line the control is also described by. Evidence per
     row: docs/notes/UI-FIX-GREYOUT-2026-10-18.md. */
  const PASTE = "Paste a CLIENT ID first", CONNECT = "CONNECT Spotify first";
  const soundOff = (s) => s.on("soundbtn") === false;
  const EXPLAIN = Object.freeze([
    // SETTINGS › CONTROLS
    { key: "why-gears", ids: ["pm-gears"], why: "MANUAL needs TILT or a pad" },
    { key: "why-padreset", ids: ["pm-pad-profile-reset"], why: "Connect a controller first" },
    // SETTINGS › HUD & CAMERA, SESSION REVIEW
    { key: "why-race-only", ids: ["pm-hidehud", "pm-lighting", "pm-camtune", "pm-flyby"], why: "Only during a race" },
    { key: "why-rec-share", ids: ["pm-phonerec-share", "pm-phonerec-copy"], why: "RECORD a run first" },
    { key: "why-rec", ids: ["pm-phonerec-rec"], why: "Stop AUTO SOAK first" },
    { key: "why-rec-quick", ids: ["pm-phonerec-quick"], why: "Already recording" },
    { key: "why-trace", ids: ["pm-driving-trace"], why: "Drive with COACH on first" },
    // PAUSE: the practice state line already says why (driving-coach.js).
    { key: "why-practice", ids: ["pm-practice-set", "pm-practice-retry", "pm-practice-rewind", "pm-drill"], why: null, link: "pm-practice-state" },
    { key: "why-restart", ids: ["pm-restart"], why: "Off in online sessions" },
    // MUSIC & SOUND
    { key: "why-battle", ids: ["as-battle-ahead-closing", "as-battle-ahead-opening", "as-battle-behind-closing", "as-battle-behind-opening"],
      why: (s) => (soundOff(s) ? "Turn SOUND on" : "Turn BATTLE TONES on"), link: "as-battle-status" },
    { key: "why-voice", ids: ["as-v-control-pitch", "as-v-control-rate", "as-v-coach-pitch", "as-v-coach-rate", "as-v-radio-pitch", "as-v-radio-rate"],
      why: (s) => (soundOff(s) ? "Turn SOUND on" : null), link: "as-voices-note" },
    { key: "why-ann-voice", ids: ["as-v-announcer-pitch", "as-v-announcer-rate"], why: (s) => (soundOff(s) ? "Turn SOUND on" : null), link: "as-ann-note" },
    { key: "why-mix-test", ids: ["as-mix-test"], why: (s) => (soundOff(s) ? "Turn SOUND on" : "Test already playing") },
    { key: "why-mix-stop", ids: ["as-mix-stop"], why: "No test playing" },
    // SPOTIFY (MUSIC & SOUND fold and the sheet; spotify.js paints #as-sp-wrap data-sp-state)
    { key: "why-sp-connect", ids: ["as-sp-connect"],
      why: (s) => (s.val("as-sp-id") === null ? PASTE : s.data("as-sp-wrap", "spState") === "connecting" ? "Connecting…" : "Already connected") },
    { key: "why-sp-disconnect", ids: ["as-sp-disconnect"], why: (s) => (s.val("as-sp-id") === null ? PASTE : "Not connected") },
    // The playlist and device pickers live only in the sheet (#2847).
    { key: "why-sp", ids: ["as-sp-play", "as-sp-pause", "as-sp-next", "as-sp-check", "as-sp-open"],
      why: (s) => (s.val("as-sp-id") === null ? PASTE : s.data("as-sp-wrap", "spState") === "connected" ? null : CONNECT), link: "as-sp-status" },
    { key: "why-sp-sheet", ids: ["sp-toggle", "sp-prev", "sp-fwd", "sp-playlist2"], why: CONNECT, link: "sp-status2" },
    // The sheet's device row is REMOTE-only: IN BROWSER plays in this tab.
    { key: "why-sp-device", ids: ["sp-refresh2", "sp-device2"],
      why: (s) => (s.data("as-sp-wrap", "spState") === "connected" ? "Only in REMOTE mode" : CONNECT), link: "sp-status2" },
    // RACE SETTINGS (race-settings.js locks these for a DAILY race / SEASON quali)
    { key: "why-daily", ids: ["rs-laps", "rs-weather", "rs-time"], why: "Set by DAILY CHALLENGE" },
    { key: "why-season-quali", ids: ["rs-quali"], why: "Set by SEASON SETUP" },
    // PHOTO STUDIO, APPEARANCE
    { key: "why-photo", ids: ["ps-save", "ps-export", "ps-background"], why: "CAPTURE a photo first", link: "ps-message" },
    // Library tile MENU BACKGROUND: owner greys when Scene is not My photo (photo-studio.js).
    { key: "why-photo-lib-bg", sel: "button.ps-use-bg", why: "Needs My photo scene" },
    { key: "why-ap-profile", ids: ["ap-profile-apply", "ap-profile-delete"], why: "Pick a saved PROFILE first" },
    { key: "why-ap-photo", ids: ["ap-photo-select", "ap-photo-choose"],
      why: (s) => (s.off("ap-photo-select") ? "No saved photos yet" : "Select a saved photo first") },
    // GARAGE team tab: owner greys the card / chips / EDIT; phone never sees title= tooltips (#2852).
    // Reasons mirror the title= strings setup-sheet already sets (shortened for the label).
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
    // TITLE SCREEN layout and PEEK
    { key: "why-title-only", ids: ["pm-tl-edit"], sel: 'button[data-peek="title"]', why: "Open from the TITLE screen" },
    { key: "why-tl-width", ids: ["tl-width-dn", "tl-width-up"], why: "Select the BUTTONS piece" },
    // TRACK DESIGNER (js/editor) and DATA HUB (js/data) build these with no ids.
    { key: "why-td-point", why: "Select a point first",
      sel: 'button[aria-label="Clear point selection"], button[aria-label="Focus selected points on the map and profile"], button[aria-label="Test drive from the selected point"]' },
    { key: "why-td-span", ids: ["td-spanw-dn", "td-spanw-up"], why: "Select a RANGE of points" },
    { key: "why-td-chip", sel: ".td-chips button", text: ["START HERE", "DELETE POINT"], why: "Select a point first" },
    { key: "why-dh-download", sel: ".dh-export-row button", text: ["Download"], why: "Press GATHER first" },
  ]);

  const CONTROLS = "input, select, button, textarea";
  const isControl = (el) => el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "BUTTON" || el.tagName === "TEXTAREA");
  const isRow = (el) => el && el.classList && el.classList.contains("set-row");
  const isContainer = (el) => el && !isControl(el) && !isRow(el);

  // The controls one target governs; a container skips <summary> (it must still open).
  function controlsOf(el) {
    if (isControl(el)) return [el];
    return Array.from(el.querySelectorAll(CONTROLS));
  }
  // Where the greyed look goes: the one-line row around a control, else the target.
  function rowOf(el) {
    if (isRow(el) || isContainer(el)) return el;
    return (el.closest && el.closest(".set-row, .tune-row, .adv-item, .player-tool-row")) || el;
  }
  // The label the reason suffix joins, so the line height never changes.
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
        // A reason inside a disabled button inherits opacity 0.45 and vanishes on
        // a phone. Put a line under the button group (same slot EXPLAIN uses).
        r = d.createElement("p");
        r.setAttribute("data-dep-reason", "line");
        const g = groupOf(el);
        if (g.parentNode) g.parentNode.insertBefore(r, g.nextSibling || null);
        else if (row.parentNode) row.parentNode.insertBefore(r, row.nextSibling || null);
      } else {
        r = d.createElement("span");
        r.setAttribute("data-dep-reason", "label");
        // The label already names the control; the reason is its DESCRIPTION.
        r.setAttribute("aria-hidden", "true");
        const host = labelOf(el, row);
        if (host) host.appendChild(r);
        else if (row.parentNode) row.parentNode.insertBefore(r, row.nextSibling || null);
      }
      r.setAttribute("id", rid);
    }
    r.textContent = text;
    return r;
  }

  function describe(ctrl, rid, add) {
    const cur = (ctrl.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    const next = add ? (cur.includes(rid) ? cur : cur.concat(rid)) : cur.filter((x) => x !== rid);
    if (next.length) ctrl.setAttribute("aria-describedby", next.join(" "));
    else ctrl.removeAttribute("aria-describedby");
  }

  function apply(id, rule, off) {
    const el = byId(id);
    if (!el) return;
    const row = rowOf(el);
    const mine = row.getAttribute("data-dep-off");
    // One rule owns a greyed row at a time; only the owner lifts it, and a later
    // rule in the same pass greys it again if it should still be inert.
    if (mine && mine !== rule.key) return;
    if (!off && !mine) return;
    const ctrls = controlsOf(el);
    const rid = id + "-dep";
    if (off) {
      const r = reasonEl(id, el, row, rule.reason);
      r.hidden = false;
      row.setAttribute("data-dep-off", rule.key);
      // Write only on change: the EXPLAIN observer watches these attributes.
      for (const c of ctrls) {
        if (!c.disabled) { c.setAttribute("data-dep-disabled", ""); c.disabled = true; }
        if (c.getAttribute("aria-disabled") !== "true") c.setAttribute("aria-disabled", "true");
        describe(c, rid, true);
      }
      return;
    }
    row.removeAttribute("data-dep-off");
    const r = byId(rid);
    if (r) { r.hidden = true; r.textContent = ""; }
    for (const c of ctrls) {
      if (c.hasAttribute("data-dep-disabled")) { c.disabled = false; c.removeAttribute("data-dep-disabled"); }
      if (c.hasAttribute("aria-disabled")) c.removeAttribute("aria-disabled");
      describe(c, rid, false);
    }
    // A SettingRow's chevrons disable at the ends of a non-wrapping list.
    if (isRow(el) && typeof SettingRow !== "undefined" && SettingRow.parts && !ctrls.some((c) => c.disabled)) {
      const p = SettingRow.parts(el);
      if (p && p.sel) SettingRow.disable(el, false);
    }
  }

  // state(rule): true active, false greyed, null unknown (left alone).
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

  // EXPLAIN targets: the ids that exist, then the selector's matches.
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
  // The one control whose state says "the owner greyed it": a row's select.
  const keyControl = (el) => (isRow(el) ? el.querySelector("select") : isControl(el) ? el : null);
  // Where a reason LINE goes for a control with no one-line label: after its button group.
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
    // One line per rule per button group, under the group.
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
        r.hidden = false;
        shown.add(r);
      } else if (r && !shown.has(r)) { r.hidden = true; r.textContent = ""; }
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

  /* Re-evaluate after any settings interaction. Capture phase because a
     SettingRow stops its change event; deferred because an owner flips
     aria-pressed in its own click handler, after this one. */
  let pending = false;
  function soon() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; refresh(); }, 0);
  }
  function init() {
    const d = doc();
    if (!d) return;
    for (const t of ["change", "input", "click"]) d.addEventListener(t, soon, true);
    if (typeof SettingsNav !== "undefined" && SettingsNav.onEnter) SettingsNav.onEnter(soon);
    // Owners grey their controls on their own clocks (Spotify connecting, a
    // DAILY race opening): follow every disabled / aria-disabled change.
    if (typeof MutationObserver !== "undefined" && d.documentElement) {
      new MutationObserver(soon).observe(d.documentElement, { subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
    }
    refresh();
  }
  if (doc()) {
    if (doc().readyState === "loading") doc().addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return { RULES, EXPLAIN, S, refresh, state };
})();
Object.freeze(SettingDeps);
