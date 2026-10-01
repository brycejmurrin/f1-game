/* Apex 26 — ScreenLooks: one engine for every per-screen fold under SETTINGS ›
   APPEARANCE (PAUSE MENU's extra knobs, DATA HUB, TRACK SELECTOR, RACE SETTINGS,
   CAREER, GARAGE, POPUPS) and the see-through PEEK every fold previews with.

   Self-wiring like js/ui/pause-opts.js: GameStore at eval (HARD_EDGES), no G
   façade and no line in js/game.js. SettingRow, SheetShape, PauseOpts, TitleFx
   and Tracks are read when called, never at eval.

   THE REGISTRY IS THE CONTRACT. SCREENS lists each screen's knobs; css/ keys
   off what apply() writes, and tests/unit/screen-looks.test.mjs checks every
   non-default value and every range token has a rule:
     - an enum knob at a non-default value  → <html data-look-<screen>-<k>="<v>">
     - a range knob off its default         → inline --look-<screen>-<k> on :root
       (v / 100 unitless, or "<v>%" for token:"pct") AND a presence attribute
       data-look-<screen>-<k>, so a rule matches only while it is custom.
   At its default a knob writes NOTHING, so the shipped screen is the absence
   of every attribute and token. Nothing here paints on first frame (only the
   title screen does, and TitleLayout / TitleFx own it), so there is no boot
   copy in index.html: apply() runs at eval, before js/game.js can open any of
   these screens.

   STORE: one object per screen, apex26.look<Screen> (lookPause, lookDatahub,
   …), holding only the knobs off their defaults; all-default stores null.
   normalize() drops unknown keys, checks enums and clamps / snaps ranges, so a
   hand-edited value reads as shipped.

   PEEK: the settings page is a modal in the top layer, so whatever screen a
   fold describes is hidden underneath it — or not open at all (settings opens
   from the title screen or the pause card). While a knob changes,
   <html data-appearance-peek="<screen>"> fades the settings page to a ghost and
   css/responsive.css (@layer overlays) DISPLAYS that screen behind it, without
   ever touching its `hidden` / `open` attributes: TopModal, UiLayers,
   SheetShape and input gating all key on those, and none of them should
   believe the screen opened. A screen that is empty because it was never
   built this session gets a STAND-IN (existing classes, aria-hidden, removed
   when the peek ends). A peek ends on its timer, Esc (consumed — it does not
   also close SETTINGS), the gamepad's cancel, a tap outside the fold, the
   settings page hiding, or the tab hiding. The PEEK button holds one until
   dismissed, for keyboard and screen-reader players. */
const ScreenLooks = (function () {
  "use strict";

  const store = GameStore.store;
  const doc = typeof document !== "undefined" ? document : null;
  const root = doc ? doc.documentElement : null;
  const byId = (id) => (doc ? doc.getElementById(id) : null);

  // ── the shared core knobs ───────────────────────────────────────────────
  const CORE = {
    w: { k: "w", label: "WIDTH", kind: "range", min: 60, max: 140, step: 5, def: 100 },
    density: { k: "density", label: "DENSITY", kind: "cycle", reflow: true,
      values: [["auto", "AUTO"], ["roomy", "ROOMY"], ["tight", "TIGHT"]], def: "auto" },
    btn: { k: "btn", label: "BUTTON HEIGHT", kind: "range", min: 80, max: 150, step: 5, def: 100 },
    corners: { k: "corners", label: "CORNERS", kind: "cycle",
      values: [["sharp", "SHARP"], ["round", "ROUND"], ["pill", "PILL"]], def: "round" },
    dim: { k: "dim", label: "BACKGROUND", kind: "cycle",
      values: [["solid", "SOLID"], ["full", "FULL"], ["soft", "SOFT"], ["off", "OFF"]], def: "full" },
    head: { k: "head", label: "HEADINGS", kind: "cycle",
      values: [["left", "LEFT"], ["centre", "CENTRE"]], def: "left" },
  };
  function core(list, over) {
    return list.map((k) => Object.freeze(Object.assign({}, CORE[k], (over && over[k]) || {})));
  }
  const cyc = (k, label, values, def, extra) => Object.freeze(Object.assign({ k, label, kind: "cycle", values, def }, extra || {}));
  const rng = (k, label, min, max, step, def, extra) => Object.freeze(Object.assign({ k, label, kind: "range", min, max, step, def }, extra || {}));
  const SHOWHIDE = [["show", "SHOW"], ["hide", "HIDE"]];
  const ROWS3 = [["tight", "TIGHT"], ["shipped", "SHIPPED"], ["roomy", "ROOMY"]];
  const VPOS = [["top", "TOP"], ["middle", "MIDDLE"], ["bottom", "BOTTOM"]];

  // ── stand-ins: what an EMPTY screen shows while it is peeked ───────────
  function mk(tag, cls, text) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function standInto(host, nodes) {
    const made = [];
    for (const n of nodes) {
      n.setAttribute("aria-hidden", "true");
      n.setAttribute("data-look-standin", "");
      host.appendChild(n);
      made.push(n);
    }
    return () => { for (const n of made) if (n.parentNode) n.parentNode.removeChild(n); };
  }
  const isEmpty = (el) => !el || !el.children || el.children.length === 0;
  const SAMPLE_ROWS = ["VERSTAPPEN", "NORRIS", "LECLERC", "PIASTRI", "HAMILTON", "RUSSELL", "SAINZ", "ALONSO", "GASLY", "ALBON"];
  function sampleRows(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(mk("div", "res-row", `P${i + 1}  ${SAMPLE_ROWS[i % SAMPLE_ROWS.length]}`));
    return out;
  }

  function datahubStandIn(el) {
    if (!el || el.querySelector(".dh-card")) return null;
    const added = !el.classList.contains("dh-overlay");
    if (added) el.classList.add("dh-overlay");
    const card = mk("div", "dh-card");
    const head = mk("div", "sheet-head");
    head.appendChild(mk("h2", "", "F1 DATA HUB"));
    const tabs = mk("div", "dh-tabs");
    ["SCHEDULE", "STANDINGS", "LAST RACE", "LIVE"].forEach((t, i) => tabs.appendChild(mk("span", "dh-tab" + (i === 1 ? " active" : ""), t)));
    const body = mk("div", "dh-content");
    SAMPLE_ROWS.slice(0, 8).forEach((n, i) => body.appendChild(mk("div", "dh-row", `${i + 1}  ${n}`)));
    card.append(head, tabs, body);
    const undo = standInto(el, [card]);
    return () => { undo(); if (added) el.classList.remove("dh-overlay"); };
  }
  function selectStandIn() {
    const strip = byId("sel-tracks");
    if (!strip || !isEmpty(strip)) return null;
    const list = (typeof Tracks !== "undefined" && Tracks.LIST) || [];
    const tiles = [];
    for (let i = 0; i < Math.max(6, Math.min(list.length, 12)); i++) {
      const t = list[i] || {};
      const tile = mk("span", "track-row");
      tile.appendChild(mk("span", "track-row-meta", String(i + 1)));
      tile.appendChild(mk("span", "track-row-name", String(t.name || t.id || "CIRCUIT").toUpperCase()));
      tiles.push(tile);
    }
    return standInto(strip, tiles);
  }
  function careerStandIn() {
    const l = byId("cr-left"), r = byId("cr-right");
    const undo = [];
    if (l && isEmpty(l)) undo.push(standInto(l, [1, 2, 3].map((n) => mk("div", "cr-slot", `SLOT ${n}`))));
    if (r && isEmpty(r)) undo.push(standInto(r, sampleRows(8)));
    return undo.length ? () => undo.forEach((f) => f()) : null;
  }
  function garageStandIn() {
    const tabs = byId("cs-tabs"), opts = byId("cs-options");
    const undo = [];
    if (tabs && isEmpty(tabs))
      undo.push(standInto(tabs, ["ENGINE", "AERO", "CHASSIS", "BRAKES", "TYRES", "LIVERY"].map((t, i) => mk("span", "cs-tab" + (i ? "" : " active"), t))));
    if (opts && isEmpty(opts))
      undo.push(standInto(opts, ["STANDARD", "UPGRADED", "WORKS"].map((t) => mk("span", "cs-opt", t))));
    return undo.length ? () => undo.forEach((f) => f()) : null;
  }
  function popupsStandIn() {
    const body = byId("standings-body");
    return body && isEmpty(body) ? standInto(body, sampleRows(10)) : null;
  }

  // ── the registry ────────────────────────────────────────────────────────
  const SCREENS = Object.freeze([
    Object.freeze({
      id: "pause", key: "lookPause", title: "PAUSE MENU", host: "pm-pausemenu-body",
      help: "BUTTON HEIGHT, CARD WIDTH and BUTTON GAP size the pause card's buttons. CORNERS, BUTTON STYLE and TEXT ALIGN change how they look; VERTICAL POSITION moves the card up or down; MUSIC CARD and BUILD TAG hide those two lines.",
      target: () => byId("pausemenu"),
      knobs: Object.freeze([
        rng("btn", "BUTTON HEIGHT", 80, 150, 5, 100),
        rng("w", "CARD WIDTH", 70, 200, 5, 100),
        rng("gap", "BUTTON GAP", 0, 200, 10, 100),
        ...core(["corners"]),
        cyc("style", "BUTTON STYLE", [["filled", "FILLED"], ["outline", "OUTLINE"]], "filled"),
        cyc("align", "TEXT ALIGN", [["centre", "CENTRE"], ["left", "LEFT"]], "centre"),
        cyc("vpos", "VERTICAL POSITION", VPOS, "middle"),
        cyc("music", "MUSIC CARD", SHOWHIDE, "show"),
        cyc("build", "BUILD TAG", SHOWHIDE, "show"),
      ]),
    }),
    Object.freeze({
      id: "datahub", key: "lookDatahub", title: "DATA HUB",
      help: "The F1 DATA HUB card: its width, row height and tab style. ROW STRIPES shades every other row of a table.",
      target: () => byId("datahub"), standIn: datahubStandIn,
      knobs: Object.freeze([
        ...core(["w", "btn", "corners", "dim", "head"]),
        cyc("rows", "ROW HEIGHT", ROWS3, "shipped"),
        cyc("tabs", "TAB STYLE", [["filled", "FILLED"], ["underline", "UNDERLINE"], ["pill", "PILL"]], "filled"),
        cyc("stripes", "ROW STRIPES", [["off", "OFF"], ["on", "ON"]], "off"),
      ]),
    }),
    Object.freeze({
      id: "select", key: "lookSelect", title: "TRACK SELECTOR",
      help: "The circuit picker: card width and density, the size of the circuit tiles, how many rows the strip uses, and whether it sits above or below the circuit.",
      target: () => byId("select"), standIn: selectStandIn,
      knobs: Object.freeze([
        ...core(["w", "density", "btn", "corners", "dim", "head"]),
        rng("tile", "TILE SIZE", 70, 160, 5, 100),
        cyc("rows", "STRIP ROWS", [["1", "1"], ["2", "2"], ["3", "3"]], "1"),
        cyc("names", "TILE NAMES", SHOWHIDE, "show"),
        cyc("strip", "STRIP POSITION", [["top", "TOP"], ["bottom", "BOTTOM"]], "top"),
      ]),
    }),
    Object.freeze({
      id: "race", key: "lookRace", title: "RACE SETTINGS",
      help: "The pre-race settings sheet: width, density, columns, and how the preset buttons show.",
      target: () => byId("race-settings"),
      knobs: Object.freeze([
        ...core(["w", "density", "btn", "corners", "dim", "head"]),
        cyc("cols", "COLUMNS", [["auto", "AUTO"], ["one", "ONE"], ["two", "TWO"]], "auto", { reflow: true }),
        cyc("presets", "PRESETS", [["cards", "CARDS"], ["compact", "COMPACT"], ["hide", "HIDE"]], "cards"),
      ]),
    }),
    Object.freeze({
      id: "career", key: "lookCareer", title: "CAREER",
      help: "DRIVER CAREER and MY TEAM: width, density, whether the two columns sit side by side or stacked, how wide the left one is, and which side each goes.",
      target: () => byId("career"), standIn: careerStandIn,
      knobs: Object.freeze([
        ...core(["w", "density", "btn", "corners", "dim", "head"]),
        cyc("layout", "COLUMNS", [["auto", "AUTO"], ["split", "SPLIT"], ["stacked", "STACKED"]], "auto", { reflow: true }),
        rng("split", "LEFT COLUMN", 30, 70, 1, 49, { token: "pct" }),
        cyc("side", "COLUMN ORDER", [["shipped", "SHIPPED"], ["swapped", "SWAPPED"]], "shipped"),
      ]),
    }),
    Object.freeze({
      id: "garage", key: "lookGarage", title: "GARAGE",
      help: "The garage panel: which side it docks on (the car moves over to the other side), its width, how see-through it is, and the stat bars.",
      target: () => byId("carsetup"), standIn: garageStandIn,
      knobs: Object.freeze([
        ...core(["density", "btn", "corners", "head"]),
        cyc("side", "PANEL SIDE", [["right", "RIGHT"], ["left", "LEFT"]], "right"),
        rng("pw", "PANEL WIDTH", 100, 150, 5, 100),
        cyc("glass", "PANEL", [["solid", "SOLID"], ["shipped", "SHIPPED"], ["glass", "GLASS"]], "shipped"),
        cyc("stats", "STAT BARS", SHOWHIDE, "show"),
      ]),
    }),
    Object.freeze({
      id: "popups", key: "lookPopups", title: "POPUPS",
      help: "Every pop-up sheet — standings, results, qualifying, the team and duel pickers, season setup, VS FRIEND, customise, HOW TO PLAY, music, the career offers / guide / history and circuit details. WIDTH scales each one's own size.",
      target: () => byId("standings"), standIn: popupsStandIn,
      knobs: Object.freeze([
        ...core(["w", "density", "btn", "corners", "dim", "head"]),
        cyc("vpos", "POSITION", VPOS, "middle"),
        cyc("rows", "TABLE ROWS", ROWS3, "shipped"),
      ]),
    }),
  ]);
  /** Peek-only entries: a fold of their own already exists (TITLE SCREEN). */
  const PEEK_ONLY = Object.freeze({
    title: Object.freeze({ id: "title", title: "TITLE SCREEN", fold: "pm-titlescreen",
      peekable: () => { const o = byId("overlay"); return !!o && !o.hidden; } }),
  });
  const BY_ID = {};
  for (const s of SCREENS) BY_ID[s.id] = s;
  const screen = (id) => BY_ID[id] || null;
  const knobOf = (s, k) => { for (const n of s.knobs) if (n.k === k) return n; return null; };

  // ── store ───────────────────────────────────────────────────────────────
  function clampKnob(n, v) {
    if (n.kind === "cycle") {
      for (const [id] of n.values) if (id === v) return v;
      return n.def;
    }
    const x = typeof v === "number" && isFinite(v) ? v : n.def;
    const snapped = n.min + Math.round((x - n.min) / n.step) * n.step;
    return Math.max(n.min, Math.min(n.max, Math.round(snapped * 100) / 100));
  }
  /** Any stored value → a complete look for screen `id` (every knob, valid). */
  function normalize(id, o) {
    const s = screen(id);
    if (!s) return {};
    const src = o && typeof o === "object" ? o : {};
    const out = {};
    for (const n of s.knobs) out[n.k] = clampKnob(n, src[n.k] === undefined ? n.def : src[n.k]);
    return out;
  }
  const read = (id) => normalize(id, store.get(screen(id) ? screen(id).key : "", null));
  function save(id, look) {
    const s = screen(id);
    const diff = {};
    let any = false;
    for (const n of s.knobs) if (look[n.k] !== n.def) { diff[n.k] = look[n.k]; any = true; }
    store.set(s.key, any ? diff : null);
  }
  function isShipped(id) {
    const s = screen(id);
    if (!s) return true;
    const l = read(id);
    for (const n of s.knobs) if (l[n.k] !== n.def) return false;
    return true;
  }

  // ── stamping ────────────────────────────────────────────────────────────
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const dataKey = (s, n) => "look" + cap(s.id) + cap(n.k);
  const tokenOf = (s, n) => "--look-" + s.id + "-" + n.k;
  function tokenValue(n, v) { return n.token === "pct" ? v + "%" : String(v / 100); }
  function apply(only) {
    if (!root || !root.dataset) return;
    for (const s of SCREENS) {
      if (only && s.id !== only) continue;
      const l = read(s.id);
      for (const n of s.knobs) {
        const v = l[n.k], dk = dataKey(s, n);
        if (v === n.def) {
          delete root.dataset[dk];
          if (n.kind === "range" && root.style) root.style.removeProperty(tokenOf(s, n));
        } else {
          root.dataset[dk] = String(v);
          if (n.kind === "range" && root.style) root.style.setProperty(tokenOf(s, n), tokenValue(n, v));
        }
      }
    }
  }

  const listeners = {};
  function onChange(id, fn) { (listeners[id] = listeners[id] || []).push(fn); }
  function changed(id, reflow) {
    if (reflow && typeof SheetShape !== "undefined" && SheetShape.reclassify) {
      try { SheetShape.reclassify(); } catch (_) { /* a stale tier is survivable */ }
    }
    for (const fn of listeners[id] || []) { try { fn(); } catch (e) { Log.warn("ui", "ScreenLooks listener", e); } }
  }
  /** Set knob `k` of screen `id`; returns the stored (validated) value. */
  function set(id, k, v) {
    const s = screen(id), n = s && knobOf(s, k);
    if (!n) return undefined;
    const l = read(id);
    l[k] = clampKnob(n, n.kind === "range" ? Number(v) : v);
    save(id, l);
    apply(id);
    changed(id, !!n.reflow);
    return l[k];
  }
  function reset(id) {
    const s = screen(id);
    if (!s) return;
    store.set(s.key, null);
    apply(id);
    changed(id, s.knobs.some((n) => n.reflow));
  }

  // ── PEEK ────────────────────────────────────────────────────────────────
  const PEEK_MS = 1800;
  const pk = { id: null, t: 0, button: false, cleanups: [], swallowClick: false, swallowGen: 0 };
  const peekUi = {};   // id -> { btn, status, fold }
  const settingsOpen = () => { const p = byId("pmsettings"); return !!p && !p.hidden; };
  function foldOf(id) {
    if (peekUi[id] && peekUi[id].fold) return peekUi[id].fold;
    const po = PEEK_ONLY[id];
    if (po) return byId(po.fold);
    return id === "pause" ? byId("pm-pausemenu") : null;
  }
  function paintPeekUi() {
    for (const id in peekUi) {
      const u = peekUi[id];
      const on = pk.id === id && pk.button;
      if (u.btn) { u.btn.setAttribute("aria-pressed", on ? "true" : "false"); u.btn.textContent = on ? "BACK TO SETTINGS" : "PEEK"; }
      if (u.status) u.status.textContent = on
        ? "Previewing " + (screen(id) || PEEK_ONLY[id]).title + ". Tap anywhere or press Esc to return." : "";
    }
  }
  /** Show screen `id` behind a ghosted settings page for `ms` (0 = hold). */
  function peek(id, ms) {
    if (!root || !root.dataset) return false;
    const s = screen(id) || PEEK_ONLY[id];
    if (!s || !settingsOpen()) return false;
    if (s.peekable && !s.peekable()) return false;
    clearTimeout(pk.t);
    if (pk.id !== id) {
      endPeek();
      pk.id = id;
      root.dataset.appearancePeek = id;
      if (s.standIn) {
        try { const undo = s.standIn(s.target ? s.target() : null); if (undo) pk.cleanups.push(undo); }
        catch (e) { Log.warn("ui", "ScreenLooks stand-in", e); }
      }
    }
    pk.button = false;
    if (ms) pk.t = setTimeout(endPeek, ms);
    paintPeekUi();
    return true;
  }
  function endPeek() {
    clearTimeout(pk.t);
    if (!pk.id) return;
    const s = screen(pk.id);
    pk.id = null;
    pk.button = false;
    if (root && root.dataset) delete root.dataset.appearancePeek;
    // A revealed CLOSED dialog had layout; flush it back to display:none now,
    // so a showModal() later in this same task can never inherit those boxes
    // (the closed-dialog box drop, css/components.css dialog.screen:not([open])).
    const t = s && s.target ? s.target() : null;
    if (t && t.tagName === "DIALOG") void t.offsetWidth;
    const c = pk.cleanups;
    pk.cleanups = [];
    for (const f of c) { try { f(); } catch (e) { Log.warn("ui", "ScreenLooks stand-in cleanup", e); } }
    paintPeekUi();
  }
  function holdPeek(id) {
    if (pk.id === id && pk.button) { endPeek(); return false; }
    if (!peek(id, 0)) return false;
    pk.button = true;
    paintPeekUi();
    return true;
  }

  // Window CAPTURE: runs before TopModal's document-capture Escape and before
  // any door's own handler, so a peek always ends before a screen changes.
  function onKey(e) {
    if (!pk.id || !e) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      endPeek();
      return;
    }
    // Any other key aimed OUTSIDE the fold (Enter on BACK, a pad's synthetic
    // activate) ends the peek first and then does its job.
    const f = foldOf(pk.id), a = doc && doc.activeElement;
    if (!(f && a && f.contains && f.contains(a))) endPeek();
  }
  function onCancel(e) {
    if (!pk.id) return;
    if (e.preventDefault) e.preventDefault();
    e.stopImmediatePropagation();
    endPeek();
  }
  function onPointer(e) {
    if (!pk.id) return;
    const f = foldOf(pk.id);
    const t = e && e.target;
    if (f && t && f.contains && f.contains(t)) return;   // stepping the same fold keeps peeking
    const swallow = pk.button;
    endPeek();
    if (swallow) {
      e.preventDefault();
      e.stopImmediatePropagation();
      pk.swallowClick = true;
      // preventDefault often suppresses the click that onClick would clear,
      // and a long hold then ate the NEXT click. The click event is
      // dispatched before a 0-timer, so clear on the following turn if this
      // generation is still the one that armed the swallow.
      const gen = ++pk.swallowGen;
      const up = () => {
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", up, true);
        setTimeout(() => { if (pk.swallowGen === gen) pk.swallowClick = false; }, 0);
      };
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", up, true);
    }
  }
  function onClick(e) {
    if (!pk.swallowClick) return;
    pk.swallowClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  let endsWired = false;
  function wirePeekEnds() {
    if (endsWired || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    endsWired = true;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("cancel", onCancel, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("click", onClick, true);
    if (doc) doc.addEventListener("visibilitychange", () => { if (doc.hidden) endPeek(); });
    const p = byId("pmsettings");
    if (p && typeof MutationObserver !== "undefined")
      new MutationObserver(() => { if (p.hidden) endPeek(); }).observe(p, { attributes: true, attributeFilter: ["hidden"] });
  }

  // ── fold building ───────────────────────────────────────────────────────
  function el(tag, props, kids) {
    const e = doc.createElement(tag);
    for (const k in props || {}) {
      if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
    }
    for (const c of kids || []) e.appendChild(c);
    return e;
  }
  const rangeTxt = (n, v) => (n.token === "pct" ? v + "%" : v + "%");
  /** A PEEK toggle and its polite status line, mounted into `host` for screen `id`. */
  function mountPeekButton(host, id, before) {
    if (!host || !doc) return null;
    const btn = el("button", { type: "button", textContent: "PEEK", attrs: { "aria-pressed": "false" } });
    btn.addEventListener("click", () => holdPeek(id));
    const status = el("p", { className: "adv-help", attrs: { "aria-live": "polite", "data-help": "keep" } });
    peekUi[id] = Object.assign(peekUi[id] || {}, { btn, status });
    if (before && before.parentNode === host) { host.insertBefore(btn, before); host.insertBefore(status, before); }
    else { host.appendChild(btn); host.appendChild(status); }
    const s = PEEK_ONLY[id];
    if (s && s.peekable) {
      const paint = () => { btn.disabled = !s.peekable(); };
      paint();
      const o = byId("overlay");
      if (o && typeof MutationObserver !== "undefined")
        new MutationObserver(paint).observe(o, { attributes: true, attributeFilter: ["hidden"] });
    }
    return btn;
  }

  function buildRows(s, body, paintSum) {
    const painters = [];
    for (const n of s.knobs) {
      const id = "pm-look-" + s.id + "-" + n.k;
      if (n.kind === "cycle") {
        if (typeof SettingRow === "undefined" || !SettingRow.build) continue;
        const r = SettingRow.build(id, n.label, n.values);
        SettingRow.wire(r.row, {
          values: n.values,
          read: () => read(s.id)[n.k],
          write: (v) => { const out = set(s.id, n.k, v); paintSum(); peek(s.id, PEEK_MS); return out; },
        });
        body.appendChild(r.row);
        painters.push(() => SettingRow.paint(r.row, read(s.id)[n.k]));
      } else {
        const out = el("b");
        const inp = el("input", { id, type: "range", min: String(n.min), max: String(n.max), step: String(n.step),
          attrs: { "aria-label": s.title.toLowerCase() + " " + n.label.toLowerCase() } });
        const paint = () => {
          const v = read(s.id)[n.k];
          if (doc.activeElement !== inp) inp.value = String(v);
          out.textContent = rangeTxt(n, v);
        };
        inp.addEventListener("input", () => {
          const v = set(s.id, n.k, parseFloat(inp.value));
          out.textContent = rangeTxt(n, v);
          paintSum();
          peek(s.id, PEEK_MS);
        });
        inp.addEventListener("pointerdown", () => peek(s.id, 0));
        inp.addEventListener("pointerup", () => peek(s.id, 1500));
        inp.addEventListener("pointercancel", () => endPeek());
        body.appendChild(el("label", { className: "tune-row" }, [
          el("span", { className: "tune-label" }, [el("span", { textContent: n.label + " " }), out]), inp]));
        painters.push(paint);
      }
    }
    return () => { for (const p of painters) p(); };
  }

  const built = {};
  function buildScreen(s, after) {
    const paintSumFns = [];
    const paintSum = () => { for (const f of paintSumFns) f(); };
    let body, fold;
    if (s.host) {
      body = byId(s.host);
      if (!body) return after;
      fold = body.closest ? body.closest("details") : null;
      if (typeof PauseOpts !== "undefined" && PauseOpts.wireRows) PauseOpts.wireRows();
      body.appendChild(el("h4", { className: "pm-look-h", textContent: "BUTTONS & CARD" }));
      body.appendChild(el("p", { className: "adv-help", textContent: s.help }));
      paintSumFns.push(() => { if (typeof PauseOpts !== "undefined" && PauseOpts.apply) PauseOpts.apply(); });
    } else {
      const sum = el("summary", { className: "adv-more-btn" });
      sum.id = "pm-look-" + s.id + "-sum";
      body = el("div", { attrs: { role: "group", "aria-label": s.title.toLowerCase() + " appearance" } });
      body.id = "pm-look-" + s.id + "-body";
      fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
      fold.id = "pm-look-" + s.id;
      body.appendChild(el("p", { className: "adv-help", textContent: s.help + " Change anything to see the real screen behind this page." }));
      paintSumFns.push(() => { sum.textContent = s.title + " · " + (isShipped(s.id) ? "SHIPPED" : "CUSTOM"); });
    }
    const paintRows = buildRows(s, body, paintSum);
    const resetBtn = el("button", { type: "button", textContent: "RESET " + s.title });
    resetBtn.addEventListener("click", () => {
      reset(s.id);
      if (s.id === "pause" && typeof PauseOpts !== "undefined") {
        PauseOpts.setLayout("grid"); PauseOpts.setSide("centre"); PauseOpts.setDim("full"); PauseOpts.setConfirm("on");
      }
      paintRows(); paintSum(); peek(s.id, PEEK_MS);
    });
    const row = el("div", { className: "balanced-row" }, [resetBtn]);
    body.appendChild(row);
    peekUi[s.id] = { fold };
    mountPeekButton(row, s.id);
    // The status line belongs under the buttons, not inside the balanced row.
    if (peekUi[s.id].status) body.appendChild(peekUi[s.id].status);
    paintSum();
    onChange(s.id, paintSum);
    built[s.id] = { fold, paintRows, paintSum };
    if (!s.host && fold) {
      if (after && after.parentNode) after.parentNode.insertBefore(fold, after.nextSibling);
      else { const panel = byId("pm-panel-appearance"); if (panel) panel.appendChild(fold); }
      return fold;
    }
    return after;
  }

  function build() {
    if (!doc || built._done) return;
    const panel = byId("pm-panel-appearance");
    if (!panel) return;
    built._done = true;
    Log.info("ui", "ScreenLooks.build");
    let after = byId("pm-titlescreen");
    for (const s of SCREENS) after = buildScreen(s, after);
    // TITLE SCREEN keeps its own fold; it gains the PEEK button, last (after REPLAY INTRO).
    const tsBody = byId("pm-titlescreen-body");
    if (tsBody) {
      peekUi.title = { fold: byId("pm-titlescreen") };
      mountPeekButton(tsBody, "title");
    }
    wirePeekEnds();
  }

  apply();

  // Deferred scripts run while readyState is "interactive"; only a document
  // that is already COMPLETE builds now (same rule as js/ui/pause-opts.js).
  if (doc) {
    if (doc.readyState === "complete") build();
    else doc.addEventListener("DOMContentLoaded", build, { once: true });
  }

  return {
    SCREENS, PEEK_ONLY, CORE, PEEK_MS,
    read, set, reset, apply, normalize, isShipped, onChange,
    peek, endPeek, holdPeek, build, mountPeekButton,
    dataKey: (id, k) => { const s = screen(id); const n = s && knobOf(s, k); return n ? dataKey(s, n) : null; },
    token: (id, k) => { const s = screen(id); const n = s && knobOf(s, k); return n ? tokenOf(s, n) : null; },
    get peeking() { return pk.id; },
  };
})();
Object.freeze(ScreenLooks);
