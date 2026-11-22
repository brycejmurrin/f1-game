/* HUD customization controls and color stylesheet, loaded on demand. */
"use strict";
const HudLayoutEditor = (() => {
  function createHiddenReason({ doc, store, ELEMENTS, hudLive, has, shownProf, shown, mirrorMode, visibilityIds }) {
    /* WHY AN ELEMENT IS NOT ON SCREEN. [ids, test(has, attr, hide), reason, soft].
       The classes are js/ui/hud.js's and the rules css/hud.css's /
       css/track-detail.css's; first match wins. SOFT = the sliders still matter:
       a placed chip shows in a touch cockpit (data-hl-user), and a chip that
       appears only on an event (flag, limits strike, message) is edited blind.
       "cockpit-cam" is the wheel's LCD (gear / speed); the touch-cockpit row
       follows the painted LAYOUT set (shown(), = body[data-hl-set]) instead,
       whatever the wheel. */
    // SPEED rides .hud-bottom with GEAR on BROADCAST+TV (css/hud.css hides the
    // whole band) and shares the wheel-LCD hide with GEAR on cockpit-cam. It is
    // NOT in the plain hud-bcam list — TV cams keep a plated #hud-speed.
    const BOTTOM = ["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb"];
    const CHIPS = ["energy", "ot", "aero"];
    const READOUTS = ["damage", "rel", "strat", "inputs"];   // css/hud.css hides all four on the same classes
    // Data Hub WATCH / HIGHLIGHTS (css/hud.css). Hard: a placed chip does not
    // bring the driving HUD back. "tower" here is the POS/LAP band (.hud-top),
    // not #bc-tower. The radio card stands down with the rest of the HUD.
    const REPLAY_HUD = ["tower", "map", "gaps", "sectors", "limits", "flag", "mirror", "announce"]
      .concat(BOTTOM, READOUTS);
    const replayOn = (h) => h("bc-on") || h("watch-controls-on");
    // body.hud-prof-* / hud-met-* are painted by js/ui/hud.js while the race HUD
    // is up. Under SETTINGS #hud is hidden, so those classes lag the store —
    // trust shownProf() / hudMetricsLayout so MOVE & SIZE greys chips the active
    // style already hides (#3273). A forced metrics name wins; AUTO/null falls
    // back to whatever class is still on the body (tests + last-race leftover).
    const profIs = (name) => (hudLive() ? has("hud-prof-" + name) : shownProf() === name);
    const metIs = (name) => {
      if (hudLive()) return has("hud-met-" + name);
      // Default must match js/game.js (store-registry ratchet); AUTO/FULL mean
      // "no forced strip" so fall back to any leftover body.hud-met-* class.
      const want = store ? store.get("hudMetricsLayout", "full") : "full";
      if (want && want !== "auto" && want !== "full") return want === name;
      return has("hud-met-" + name);
    };
    const HIDE_RULES = Object.freeze([
      [REPLAY_HUD, replayOn, "a real-race watch keeps the driving HUD off"],
      [["map"], (h) => h("hud-hide-map"), "MAP is off for this camera or style (DISPLAY › HUD › MAP)"],
      [["gaps"], (h) => h("hud-hide-gaps"), "GAPS is off for this style (DISPLAY › HUD › GAPS)"],
      [BOTTOM, (h) => h("hud-prof-broadcast") && h("hud-bcam"), "BROADCAST style on a TV camera keeps the frame clean"],
      [CHIPS.concat(["bb", "sectors"], READOUTS), () => profIs("minimal"), "MINIMAL style"],
      [CHIPS.concat(["bb"]), () => metIs("timing"), "LAYOUT is TIMING"],
      [CHIPS.concat(["bb", "sectors", "tyre"]), () => metIs("compact"), "LAYOUT is COMPACT"],
      [["sectors"], () => metIs("driver"), "LAYOUT is DRIVER"],
      [["gearbox", "ot", "aero", "energy", "bb", "limits"].concat(READOUTS), (h) => h("hud-bcam"), "TV camera"],
      [["sectors"], (h) => h("hud-bcam") && !h("hud-prof-broadcast"), "TV camera"],
      // css/track-detail.css: body.cockpit-cam hides GEAR + SPEED with no data-hl-user escape.
      [["gearbox", "speed"], (h) => h("cockpit-cam"), "the wheel's display shows it in the cockpit"],
      [["gearbox", "speed", "energy", "tyre", "ot", "aero", "bb", "sectors", "limits"].concat(READOUTS), (h, a, off) => off, "turned off in the HUD element list (DISPLAY › HUD)"],
      [["tyre"], (h, a, off, el, live) => !!(live && el && el.hidden), "TYRE WEAR is off (RACE SETTINGS)"],
      [CHIPS.concat(["tyre", "bb"]), (h, a) => shown() === "cockpit" && !h("desktop") && !a, "touch cockpit: no room beside the wheel — move it to show it", true],
      [["ot", "aero", "bb"], (h, a) => shown() === "helmet" && !h("desktop") && !a, "touch helmet: the OT / AERO buttons carry it — move it to show it", true],
      [["bb"], (h, a) => !h("desktop") && !a, "touch screens: move it to show it", true],
      [["flag"], () => true, "shows when a flag is out", true],
      [["limits"], () => true, "shows on a track-limits strike", true],
      [["announce"], () => true, "shows with a race message", true],
      // MIRROR: DISPLAY › HUD › MIRROR off greys the sliders (hard). AUTO / a
      // chase cam / a session collapse soft-hides the frame — like SPEED's wheel
      // LCD rule, a place (data-hl-user) turns it ON via revealMirror().
      [["mirror"], (h, a) => !a && mirrorMode() === "off", "MIRROR is off (DISPLAY › HUD › MIRROR)"],
      [["mirror"], (h, a, off, el) => !a && !!(el && el.hidden), "MIRROR is not needed now — move it to show it", true],
    ].map(Object.freeze));
    /** Live: is element `el` drawn? (hidden attribute, display none, zero box) */
    function drawn(el) {
      if (!el || el.hidden) return false;
      if (typeof getComputedStyle === "function") {
        try { if (getComputedStyle(el).display === "none") return false; } catch (_) { /* a fake or detached node: fall through to the box */ }
      }
      if (!el.getBoundingClientRect) return true;
      const r = el.getBoundingClientRect();
      return !!(r.width && r.height);
    }
    /** Why element `id` is not on screen now: {reason, soft} or null when it is
     *  (or nothing says otherwise). While the HUD is up the live element has the
     *  last word: drawn = null whatever the classes say; hidden with no known
     *  class reads "hidden right now" (soft). Outside a race the classes decide. */
    function hiddenReason(id) {
      const row = ELEMENTS.find((e) => e[0] === id);
      if (!row || !doc) return null;
      const el = doc.querySelector(row[2]);
      const live = hudLive();
      if (live && el && el.hasAttribute && el.hasAttribute("data-col-drop")) return { reason: "not enough room", soft: true };
      if (live && drawn(el)) return null;
      const user = !!(el && el.hasAttribute && el.hasAttribute("data-hl-user"));
      const hideAttr = doc.body && doc.body.getAttribute ? String(doc.body.getAttribute("data-hud-hide") || "") : "";
      const ids = visibilityIds(id), hidden = hideAttr.split(/\s+/);
      const off = ids.length > 0 && ids.every((key) => hidden.indexOf(key) >= 0);
      for (const [ids, test, reason, soft] of HIDE_RULES) {
        if (ids.indexOf(id) >= 0 && test(has, user, off, el, live)) return { reason, soft: !!soft };
      }
      return live ? { reason: "hidden right now", soft: true } : null;
    }

    return hiddenReason;
  }

  function createColors(ELEMENTS, store, doc) {
    const parts = [];
    const add = (id, label, selector, property) => parts.push({ id, label, selector, property });
    function panel(id, label, selector) {
      add(id + "-fill", label + " · Background", selector, "background-color");
      add(id + "-text", label + " · Text", selector, "color");
    }
    for (const [id, label, selector] of ELEMENTS) {
      if (id === "map") {
        add("map-fill", "TRACK MAP · Background", selector, "background-color");
        add("map-frame", "TRACK MAP · Frame", selector, "--map-frame-color");
      } else if (id === "mirror") {
        add("mirror-frame", "MIRROR · Frame", selector, "outline-color");
      } else if (id === "tower") {
        panel(id, label, ".hud-top .hud-box, #bc-tower");
      } else {
        panel(id, label, selector);
      }
    }
    for (const [id, label] of [["pos", "POSITION"], ["lap", "LAP"], ["time", "LAP TIME"], ["best", "BEST"], ["delta", "DELTA"]]) {
      const box = id === "delta" ? "#hud-delta" : "#hud-box-" + id;
      add(id + "-fill", label + " · Background", box + (id === "pos" ? ", #bc-tower .bc-pos" : ""), "background-color");
      add(id + "-text", label + " · Text", id === "pos" ? "#hud-pos:not([data-delta]), #bc-tower .bc-row:not([data-delta]) .bc-pos" : box + " .hud-value", "color");
    }
    for (const [state, label] of [["up", "POSITION GAINED"], ["down", "POSITION LOST"]]) {
      const broadcast = ', #bc-tower .bc-row[data-delta="' + state + '"] .bc-pos';
      add("pos-" + state + "-fill", label + " · Background", '#hud-box-pos:has(#hud-pos[data-delta="' + state + '"])' + broadcast, "background-color");
      add("pos-" + state + "-text", label + " · Text", '#hud-pos[data-delta="' + state + '"]' + broadcast, "color");
    }
    // Use the race producers' state attributes. A missing override leaves the
    // shipped paint (including team and accessibility palettes) in control.
    function event(id, label, plate, ink = plate) {
      add(id + "-fill", label + " · Background", plate, "background-color");
      add(id + "-text", label + " · Text", ink, "color");
    }
    function states(group, root, attr, labels, plateSuffix = "", inkSuffix = plateSuffix) {
      for (const [state, label] of Object.entries(labels)) {
        const selector = root + "[" + attr + '="' + state + '"]';
        event(group + "-" + state, label, selector + plateSuffix, selector + inkSuffix);
      }
    }
    for (const [state, label] of [["pb", "PERSONAL BEST LAP"], ["lap", "COMPLETED LAP"]]) {
      const ink = '#hud-time[data-hold="' + state + '"]';
      event("tower-time-" + state, label, "#hud-box-time:has(" + ink + ")", "#hud-box-time " + ink);
    }
    states("tower-delta", "#hud-delta", "data-sign", { fast: "FASTER DELTA", slow: "SLOWER DELTA" }, "", " .hud-value");
    add("tower-ghost", "GHOST REFERENCE · Indicator", '#hud-delta[data-ref="ghost"] .hud-label::after', "color");
    for (const [state, label] of Object.entries({ on: "CAMERA CAR", fl: "FASTEST LAP", pit: "PITTING", out: "RETIRED" })) {
      const row = "#bc-tower .bc-row." + state;
      event("tower-broadcast-" + state, "BROADCAST " + label, row + " button", row + (state === "pit" ? " .bc-gap" : " .bc-code"));
    }
    for (const [state, label] of Object.entries({ yellow: "YELLOW FLAG", vsc: "VIRTUAL SAFETY CAR", sc: "SAFETY CAR", red: "RED FLAG", blue: "BLUE FLAG" })) {
      event("flag-" + state, label, state === "blue" ? '#hud-flag[data-flag="blue"]' : "#hud-flag.flag-" + state);
    }
    event("limits-warn", "TRACK LIMIT WARNING", "#hud-limits.limits-warn");
    event("limits-hot", "TRACK LIMIT PENALTY RISK", "#hud-limits.limits-hot");
    for (const [state, label] of Object.entries({ session: "SESSION BEST", personal: "PERSONAL BEST", slow: "SLOWER SECTOR" })) {
      const row = '#hud-sectors [data-split="' + state + '"]';
      event("sectors-" + state, label, row, row + " .sec-val");
      add("sectors-" + state + "-stripe", label + " · Stripe", row, "border-left-color");
    }
    for (const [kind, label] of Object.entries({ race: "RACE RADIO", comm: "COMMENTARY", coach: "COACH", practice: "PRACTICE", info: "INFORMATION", warning: "WARNING", "penalty-warn": "PENALTY WARNING", "penalty-hit": "PENALTY ISSUED", box: "BOX CALL" })) {
      const card = kind === "race" ? "#announce:not([data-kind])" : '#announce[data-kind="' + kind + '"]';
      event("announce-" + kind, label, card, card + " #announce-text");
      add("announce-" + kind + "-channel", label + " · Channel text", card + " #announce-who", "color");
    }
    for (const [state, label] of Object.entries({ off: "UNAVAILABLE", armed: "ARMED", active: "ACTIVE", cool: "NEXT LAP" })) {
      event("ot-" + state, label, "#hud-ot.ot-" + state);
    }
    for (const [state, label] of Object.entries({ off: "CORNER MODE", armed: "ARMED", open: "STRAIGHT MODE", none: "NO ZONES" })) {
      event("aero-" + state, label, "#hud-aero.ax-" + state);
    }
    states("ot-gate", "#hud-ot", "data-gate", { caution: "CAUTION", "low-grip": "LOW GRIP", "opening-lap": "OPENING LAP", "waiting-for-leader": "ON GRID", "race-control": "RACE CONTROL" });
    states("aero-zone", "#hud-aero", "data-zone", { near: "APPROACHING ZONE", in: "IN ZONE", auto: "AUTOMATIC", straight: "AUTOMATIC STRAIGHT" });
    event("mirror-collapsed", "COLLAPSED MIRROR", "#hud-mirror-chip");
    add("gearbox-redline", "REDLINE · Rev bar", "#hud-tach.redline #hud-rpm-fill", "background");
    for (const [state, label] of [["deploy", "DEPLOYING"], ["harvest", "HARVESTING"]]) {
      const bar = '#hud-energy[data-ers="' + state + '"]';
      add("energy-" + state + "-bar", label + " · Bar", bar + " #hud-energy-fill", "background");
      add("energy-" + state + "-text", label + " · Text", bar + " .hud-energy-label", "color");
    }
    states("tyre-temp", "#hud-tyre", "data-temp", { hot: "HOT TYRE", cold: "COLD TYRE" }, " #hud-tyre-code");
    states("tyre-plan", "#hud-tyre", "data-plan", { soon: "BOX NEXT LAP", now: "BOX THIS LAP", cheap: "LOW COST STOP" }, " #hud-plan");
    for (const [state, label] of [["ok", "HEALTHY"], ["warn", "WORN"], ["gone", "WORN OUT"]]) {
      add("tyre-wear-" + state, label + " · Wear bar", '#hud-tyre[data-wear="' + state + '"] #hud-tyre-fill', "background");
    }
    add("tyre-commit", "PIT COMMITMENT · Progress", '#hud-tyre[data-pit="commit"] #hud-tyre-code', "--you");
    states("tyre-stop", "#hud-tyre", "data-pit", { lane: "IN PIT LANE", box: "IN PIT BOX" }, " #hud-tyre-code");
    states("tyre-cue", "#hud-pit", "data-phase", { near: "APPROACHING ENTRY", enter: "HOLD THE LANE", armed: "STOP CALLED", lane: "STAY IN LANE", keep: "RETURN TO LANE", "near-box": "APPROACHING BOX", stop: "STOP HERE", square: "ALIGN CAR", missed: "BOX MISSED", box: "SERVICE", served: "RELEASE", merge: "MERGE", out: "EXIT ROAD" });
    event("tyre-work", "WORK ON CAR", "#hud-work");
    states("gaps-ghost", ".hud-gaps > div", "data-ghost", { fast: "AHEAD OF GHOST", slow: "BEHIND GHOST" });
    event("gaps-tow", "SLIPSTREAM", ".hud-gaps > div[data-tow]");
    event("gaps-window", "RIVAL PIT WINDOW", '.hud-gaps > div[data-pit]:not([data-pit="IN"])::after');
    event("gaps-in", "RIVAL IN PITS", '.hud-gaps > div[data-pit="IN"]::after');
    states("rel-lap", "#hud-rel > div", "data-lap", { up: "LAP AHEAD", down: "LAP BEHIND" });
    event("rel-self", "PLAYER ROW", "#hud-rel > div[data-self]");
    states("strat", "#hud-strat > div", "data-k", { uc: "UNDERCUT", cov: "COVER" });
    for (const [level, label] of [["1", "LIGHT"], ["2", "MODERATE"], ["3", "SEVERE"]]) {
      add("damage-" + level, label + " DAMAGE · Diagram", '#hud-damage [data-lvl="' + level + '"]', "fill");
    }
    // The start gantry and side warnings have no movable piece of their own.
    add("tower-lights", "START LIGHTS · Lit lamp", "#lights .light.on", "background");
    add("tower-countdown", "START COUNTDOWN · Text", "#lights.count::after", "color");
    add("tower-go", "START SIGNAL · Go text", '#lights.count[data-count="GO"]::after', "color");
    for (const [side, label] of [["l", "LEFT"], ["r", "RIGHT"]]) {
      add("gaps-along-" + side, "CAR ALONGSIDE · " + label, '#hud[data-along~="' + side + '"]::after', "--along-" + side);
    }
    for (const [name, label] of Object.entries({ ghost: "GHOST CAR", approaching: "PIT RECOMMENDED", armed: "PIT ARMED", lane: "PLAYER IN PITS" })) {
      add("map-" + name, label + " · Marker", null, null);
    }
    for (const channel of ["throttle", "brake", "steering"]) {
      add("inputs-" + channel, channel.toUpperCase() + " · Trace", null, null);
    }
    let activeColors = {}, edits = null;
    let sheet = null;
    function options(element) {
      return parts.filter(part => part.id.startsWith(element + "-") ||
        (element === "tower" && /^(pos|lap|time|best|delta)-/.test(part.id)));
    }
    function read() {
      const raw = store && store.get("hudColors", null);
      return Object.fromEntries(parts.filter(p => raw && /^#[0-9a-f]{6}$/i.test(raw[p.id])).map(p => [p.id, raw[p.id]]));
    }
    function paint() {
      const colors = read();
      for (const [id, value] of Object.entries(edits || {})) {
        if (value) colors[id] = value;
        else delete colors[id];
      }
      activeColors = colors;
      if (!sheet && Object.keys(colors).length && doc?.head) {
        sheet = doc.createElement("style");
        doc.head.appendChild(sheet);
      }
      if (sheet) sheet.textContent = parts.filter(p => p.selector && colors[p.id]).map(p =>
        p.selector + " { " + p.property + ": " + colors[p.id] + " !important; }").join("\n");
    }
    function save(id, value) {
      if (!parts.some(part => part.id === id) || (value !== null && !/^#[0-9a-f]{6}$/i.test(value))) return;
      if (edits) { edits[id] = value; paint(); return; }
      const colors = read();
      if (value) colors[id] = value;
      else delete colors[id];
      if (store) store.set("hudColors", Object.keys(colors).length ? colors : null);
      paint();
    }
    if (store && store.subscribe) store.subscribe(change => {
      if (change.key === "hudColors" || change.keys?.includes("hudColors")) paint();
    });
    paint();
    function finish(accept) {
      const changed = Object.keys(edits || {}).length;
      paint();
      edits = null;
      if (accept && changed && store) store.set("hudColors", Object.keys(activeColors).length ? activeColors : null);
      paint();
    }
    return { options, read: () => ({ ...activeColors }), save, value: id => activeColors[id],
      snapshot: () => ({ ...edits }), preview: patch => { edits = { ...patch }; paint(); }, finish };
  }

  function peek(on, holdMs) {
    if (typeof ScreenLooks === "undefined") return;
    if (on) ScreenLooks.peek("hud", holdMs || 0);
    else ScreenLooks.endPeek();
  }
  const NAMES = { x: "LEFT / RIGHT", y: "UP / DOWN", s: "SIZE" };

  function build({ host, doc, store, ELEMENTS, IDS, PRESETS, TOUCH_UNFIT, profile, get, set, apply, isShipped,
    presetOf, applyPreset, visibility, setVisibility, presetFits, hiddenReason, resetEl, resetSet,
    relativeSize, factoryEl, camera, setPreview, select, mount, subscribeMode }) {
    const txt = (k, n, id, sn, pn) => {
      if (k === "s") return relativeSize(n, id, sn, pn) + "% of default";
      if (!n) return factoryEl(id, sn, pn)[k] ? "0%" : "SHIPPED";
      if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
      return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
    };

    const el = (tag, props, kids) => {
      const e = doc.createElement(tag);
      for (const k in props || {}) {
        if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
      }
      for (const c of kids || []) e.appendChild(c);
      return e;
    };
    const sum = el("summary", { id: "pm-hudlayout-sum", className: "adv-more-btn" });
    const body = el("div", { id: "pm-hudlayout-body", attrs: { role: "group", "aria-label": "HUD element position and size" } });
    const fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
    fold.id = "pm-hudlayout"; mount(fold);   // a plain assignment, so tools/check/shell-ids.mjs sees the mount-once guard's target
    let editing = camera(), editingProf = profile(), sel = IDS[0];
    const paintSum = () => { sum.textContent = "MOVE & SIZE · " + (isShipped(undefined, editingProf) ? "SHIPPED" : "CUSTOM"); };

    const help = el("p", { className: "adv-help" });
    body.appendChild(help);
    const paintHelp = () => {
      help.textContent = "Choose an element to show, hide, move or resize. AUTO follows the camera and HUD style. " +
        "Editing " + editingProf.toUpperCase() + " · " + editing.toUpperCase() + ": other styles and camera layouts keep their own positions. " +
          "Start with a preset or reset an element. Finish editing a value to apply it; leave the value fields to preview the HUD in a race.";
    };
    // Use the settings control's native-select and disabled-option semantics.
    function stepper(id, label, options, read, write) {
      const built = SettingRow.build(id, label, options);
      SettingRow.wire(built.row, { values: options, read, write });
      body.appendChild(built.row);
      return built.sel;
    }
    const setPick = stepper("pm-hl-set", "LAYOUT FOR", [["cockpit", "COCKPIT CAM"], ["helmet", "HELMET CAM"], ["other", "OTHER CAMS"]], () => editing, (v) => {
      editing = v; if (fold.open) setPreview(v, editingProf); apply(); paintAll(); peek(true, 900);
    });
    const presetPick = stepper("pm-hl-preset", "PRESET",
      PRESETS.map((p) => [p[0], p[1]]).concat([["custom", "CUSTOM", true]]), () => presetOf(editing, editingProf), (v) => {
        applyPreset(v, editing, editingProf); paintAll(); peek(true, 900);
      });
    const pick = stepper("pm-hl-el", "ELEMENT", ELEMENTS.map((e) => [e[0], e[1]]), () => sel, (v) => {
      sel = v; select(sel); apply(); paintAll(); peek(true, 900);
    });

    stepper("pm-hl-visibility", "VISIBILITY", [], () => visibility(sel)?.value || "", (v) => {
      setVisibility(sel, v); paintAll(); peek(true, 900);
    });
    function paintVisibility() {
      const current = visibility(sel);
      doc.getElementById("pm-hl-visibility").hidden = !current;
      SettingRow.paint("pm-hl-visibility", current ? current.value : "", current ? current.choices : []);
    }

    const painters = [], sliders = [];
    let previewPending = false;
    for (const k of ["x", "y", "s"]) {
      const out = el("b");
      const paintValue = n => { out.textContent = txt(k, n, sel, editing, editingProf); };
      const inp = el("input", { type: "number", step: "any",
        attrs: { "aria-label": NAMES[k].toLowerCase() } });
      inp.id = "pm-hl-" + k;
      sliders.push(inp);
      let dirty = false;
      const commit = () => {
        dirty = false;
        const raw = inp.value.trim(), n = raw ? Number(raw) : NaN;
        if (!Number.isFinite(n) || (k === "s" && n <= 0)) {
          inp.value = String(get(sel, editing, editingProf)[k]);
          return;
        }
        const e = set(sel, { [k]: n }, editing, editingProf);
        inp.value = String(e[k]);
        paintValue(e[k]); paintSum(); paintPreset();
        previewPending = true;
      };
      // Drafts stay in the native field. In particular, a minus sign or an
      // exponent halfway through typing must neither save nor fade the form.
      inp.addEventListener("focus", () => peek(false));
      inp.addEventListener("input", () => { dirty = true; peek(false); });
      inp.addEventListener("change", commit);
      inp.addEventListener("blur", () => {
        if (dirty) commit();
        if (!previewPending) return;
        // Blur precedes the next field's focus. Wait for that focus before
        // deciding whether the committed HUD can be previewed comfortably.
        setTimeout(() => {
          if (!fold.open) { previewPending = false; return; }
          if (previewPending && !sliders.includes(doc.activeElement)) {
            previewPending = false;
            peek(true, 900);
          }
        }, 0);
      });
      painters.push(() => {
        const n = get(sel, editing, editingProf)[k];
        if (doc.activeElement !== inp) inp.value = String(n);
        paintValue(n);
      });
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
    }

    // WHY the sliders are off: one line under them, empty when the element shows.
    const why = el("p", { className: "adv-help", attrs: { "aria-live": "polite" } });
    why.id = "pm-hl-why";
    body.appendChild(why);

    const resetOne = el("button", { type: "button", className: "opt-btn", textContent: "RESET ELEMENT" });
    resetOne.id = "pm-hl-reset-el";
    resetOne.addEventListener("click", () => { resetEl(sel, editing, editingProf); paintAll(); peek(true, 900); });
    const resetAll = el("button", { type: "button", className: "opt-btn", textContent: "RESET LAYOUT" });
    resetAll.id = "pm-hl-reset-set";
    resetAll.addEventListener("click", () => { resetSet(editing, editingProf); paintAll(); peek(true, 900); });
    body.appendChild(el("div", { className: "opt-row" }, [resetOne, resetAll]));

    function paintPreset() {
      for (const pid in TOUCH_UNFIT) SettingRow.optionDisabled("pm-hl-preset", pid, !presetFits(pid));
      const p = presetOf(editing, editingProf); if (presetPick.value !== p) presetPick.value = p;
    }
    // The picker says which elements the current mode does not draw; a HARD
    // reason greys the sliders (they would move nothing), a soft one only notes it.
    function paintHidden() {
      for (const o of pick.options) {
        const r = hiddenReason(o.value), base = ELEMENTS.find((e) => e[0] === o.value)[1];
        const t = r ? base + " (" + (r.soft ? "" : "hidden: ") + r.reason + ")" : base;
        if (o.textContent !== t) o.textContent = t;
      }
      const r = hiddenReason(sel), off = !!(r && !r.soft);
      for (const inp of sliders) inp.disabled = off;
      resetOne.disabled = off;
      why.textContent = off ? "Not drawn now: " + r.reason + ". Its controls come back when it shows." : r ? "Note: " + r.reason + "." : "";
    }
    function paintAll() {
      if (!fold.open) editingProf = profile();
      if (setPick.value !== editing) setPick.value = editing;
      if (pick.value !== sel) pick.value = sel;
      for (const p of painters) p();
      paintSum(); paintPreset(); paintHelp(); paintVisibility(); paintHidden();
    }
    // Open: preview the layout being edited and outline the selected element.
    // Closed: the race shows the camera's layout again.
    fold.addEventListener("toggle", () => {
      if (fold.open) { editing = camera(); editingProf = profile(); setPreview(editing, editingProf); select(sel); }
      else { setPreview(null, null); select(null); previewPending = false; }
      apply(); paintAll();
    });
    // The STYLE / LAYOUT / MAP / GAPS rows share this HUD fold: a change there
    // moves the edited style and what is hidden. Next tick, after it applied.
    const refresh = () => {
      if (fold.open) { editingProf = profile(); setPreview(editing, editingProf); apply(); }
      paintAll();
    };
    host.addEventListener("change", (ev) => { if (!fold.contains(ev.target)) setTimeout(refresh, 0); });
    // SettingRow.wire stops `change` propagation and the chevrons fire none, so
    // the bubbling listener above misses those rows: follow their store keys.
    const ROW_KEYS = ["hudProfile", "hudMetricsLayout", "hudMapVis", "hudGapsVis", "hudMirror", "hudElements"];
    if (store && store.subscribe) store.subscribe((c) => {
      if (c && (ROW_KEYS.indexOf(c.key) >= 0 || (Array.isArray(c.keys) && c.keys.some((k) => ROW_KEYS.indexOf(k) >= 0)))) setTimeout(refresh, 0);
    });
    subscribeMode(refresh);   // setCam: the race camera or the painted style changed
    host.appendChild(fold);
    paintAll();
  }

  return { createColors, createHiddenReason, build };
})();
