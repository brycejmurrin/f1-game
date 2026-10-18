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
  const S = Object.freeze({ val, on, is });

  /* A rule: { key, ids: [control or container id…], parent, values? | except?,
     reason, runtime? }. With `values` the rule is live while the parent's value
     is one of them, with `except` while it is none of them; with neither, while
     the parent is ON (aria-pressed, a checkbox, or any value but "off"). A rule
     whose parent is module state, not a control, gives `when(S)` instead.
     `runtime` marks targets a module builds (not in index.html). Every predicate answers true (live), false (grey) or
     null (parent unknown: leave the control alone). `reason` stays short: it
     sits inside a one-line label. */
  const layer = (slider, toggle, name) => ({ key: "layer-" + toggle, ids: [slider], parent: toggle, reason: name + " layer is off" });
  const RULES = Object.freeze([
    // A container rule first: its re-enable runs before a narrower rule re-greys a control inside it.
    { key: "sound-engine", ids: ["as-engine-details"], parent: "as-sound", reason: "Applies when SOUND is on" },
    { key: "steer-tilt", ids: ["pm-tiltsimple", "pm-tiltdeg", "pm-smooth", "pm-tiltcurve"],
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
    { key: "hud-off", ids: ["pm-hudprofile", "pm-hudmetrics", "pm-hudmap", "pm-hudgaps", "pm-hudmirror", "pm-panelopacity"],
      parent: "pm-hidehud", values: ["on"], reason: "HUD is OFF" },
    // SGSR reconstructs a below-full buffer; at HIGH there is nothing to upscale.
    { key: "upscale-full", ids: ["pm-upscale"], parent: "pm-res", except: ["high"], reason: "Needs RESOLUTION below HIGH" },
    { key: "titleart-off", ids: ["pm-tl-art-size", "pm-tl-art-x", "pm-tl-art-y"], runtime: true,
      parent: "pm-titleart", except: ["off"], reason: "TITLE ART is OFF" },
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
    { key: "line-off", ids: ["pm-linecolor", "pm-lineopacity"], reason: "Driving line is OFF",
      when: () => (typeof DrivingLine !== "undefined" && DrivingLine.mode ? DrivingLine.mode() !== "off" : null) },
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
    if (!off && !mine) return;
    if (off && mine && mine !== rule.key) return; // another rule already greys it
    const ctrls = controlsOf(el);
    const rid = id + "-dep";
    if (off) {
      const r = reasonEl(id, el, row, rule.reason);
      r.hidden = false;
      row.setAttribute("data-dep-off", rule.key);
      for (const c of ctrls) {
        if (!c.disabled) c.setAttribute("data-dep-disabled", "");
        c.disabled = true;
        c.setAttribute("aria-disabled", "true");
        describe(c, rid, true);
      }
      return;
    }
    row.removeAttribute("data-dep-off");
    const r = byId(rid);
    if (r) { r.hidden = true; r.textContent = ""; }
    for (const c of ctrls) {
      if (c.hasAttribute("data-dep-disabled")) { c.disabled = false; c.removeAttribute("data-dep-disabled"); }
      c.removeAttribute("aria-disabled");
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
        : S.on(rule.parent);
      return v === null || v === undefined ? null : !!v;
    }
    catch (e) { Log.warn("game", "SettingDeps rule " + rule.key + " failed: " + (e && e.message)); return null; }
  }

  function refresh() {
    for (const rule of RULES) {
      const s = state(rule);
      for (const id of rule.ids) apply(id, rule, s === false);
    }
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
    refresh();
  }
  if (doc()) {
    if (doc().readyState === "loading") doc().addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return { RULES, S, refresh, state };
})();
Object.freeze(SettingDeps);
