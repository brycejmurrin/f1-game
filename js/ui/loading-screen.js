"use strict";
/* Apex 26 — PRE-RACE LOADING SCREEN.
 *
 * The flyby used to play BEHIND the race-settings sheet, where it competed
 * with the settings rows for attention and made the menu look like a paused
 * race. It now plays here instead, in the gap the player already pays for:
 * between pressing RACE! and the grid appearing.
 *
 * THE CARD AND THE FLYBY RUN TOGETHER. They used to be two phases — cinematic
 * first, card afterwards — because the card was there to stall behind while
 * loadTrack() did its ~1.1 s of synchronous work. That is not what the wait is
 * any more: the world is BUILT UNDER RACE SETTINGS (scheduleFlybyTrack, and
 * loadTrack memoises on builtTrackId, so the call at race start is nearly free),
 * so by the time RACE! is pressed there is nothing to hide. Showing the card
 * afterwards just meant the flyby and the circuit's details never shared the
 * screen. The card now fades in at the start and stays for the whole sequence.
 *
 * With no pre-built world to fly over — a circuit picked a moment ago, scenery
 * still downloading — there is no cinematic to play: the card goes up alone and
 * the build runs immediately behind it.
 *
 * Any pointer or key ends the screen early: it is a flourish, and a flourish
 * that cannot be skipped is a wait.
 */
const LoadingScreen = (function () {
  // The whole sequence's budget. js/camera/flyby-seq.js spends it across eight
  // shots as FRACTIONS, so retuning this number rebalances them all rather than
  // truncating the last one. 24 s is 3 s a shot, which is what a pan needs to
  // read as a move rather than a jerk. Skippable with any pointer or key.
  const FLY_MS = 24000;
  // With nothing to fly over, just long enough for the card's fade to land
  // before the build takes the main thread.
  const CARD_MS = 700;
  /* THE HABITUAL SKIPPER. A player who has skipped the last SKIP_STREAK flybys
   * in a row has told us what they think of 24 s; they get SHORT_FLY_MS instead.
   * The shots are fractions of the budget and the announcer is fitted to it, so
   * both follow without a second sequence. One flyby left to play out resets
   * the streak — the long cut comes back for anyone who watched it again.
   * Stored as `apex26.flySkips` through the game's store. */
  const SHORT_FLY_MS = 12000;
  const SKIP_STREAK = 3;
  /** The flyby's budget for a stored streak. Pure; hostile input is no streak. */
  function flyMsFor(skips) {
    const n = Number.isFinite(+skips) ? +skips : 0;
    return n >= SKIP_STREAK ? SHORT_FLY_MS : FLY_MS;
  }
  /** The streak after one flyby: a skip extends it, a flyby watched to the end
   *  clears it. Capped so a stored number never grows without bound. */
  function nextSkips(skips, skipped) {
    const n = Number.isFinite(+skips) && +skips > 0 ? Math.floor(+skips) : 0;
    return skipped ? Math.min(n + 1, 99) : 0;
  }

  /* ── THE CARD'S OWN GEOMETRY ────────────────────────────────────────────
   * The card is a lower third over a moving camera, and where a lower third
   * belongs depends on the shot. The shipped placement suits the shipped
   * sequence; an author who re-frames the flyby (js/camera/flyby-panel.js)
   * usually has to move the card with it, and a player on a 21:9 monitor or a
   * phone in portrait wants it somewhere else again. So it is three numbers,
   * authored in the flyby editor beside the shots they are framed against.
   *
   * THREE KNOBS, EACH DOING EXACTLY ONE THING. A width slider AND a size
   * slider was the first shape and it was two controls for one question — the
   * author could not tell which one had made the card too big. SIZE scales the
   * whole plate, type and outline together; X and Y move it. Nothing else.
   *
   * The UNITS ARE THE SCREEN'S, not the card's: a translate in percent would be
   * a percentage of the card, so the same saved number would move a scaled card
   * further than an unscaled one. vw/vh means "a fifth of the way across",
   * which is what an author picking a position actually means. */
  const CARD = Object.freeze({
    scale: { label: "CARD SIZE", min: 0.6, max: 1.6, step: 0.02, unit: "x", def: 1 },
    x: { label: "CARD X", min: -40, max: 40, step: 1, unit: " vw", def: 0 },
    y: { label: "CARD Y", min: -70, max: 6, step: 1, unit: " vh", def: 0 },
  });
  const CARD_KEYS = Object.freeze(Object.keys(CARD));

  /** A COMPLETE, in-range geometry from anything at all — a saved object from a
   *  future build, a hand-edited store, null. Pure, and the only way this
   *  module ever reads one: a partial geometry reaching the stylesheet would
   *  put `NaNvw` in a custom property, where CSS drops the declaration and the
   *  card silently keeps the PREVIOUS value rather than the default. */
  function clampCard(geom) {
    const out = {};
    for (const k of CARD_KEYS) {
      const d = CARD[k];
      const v = geom && Number.isFinite(+geom[k]) ? +geom[k] : d.def;
      out[k] = Math.min(d.max, Math.max(d.min, v));
    }
    return out;
  }

  /** True when every field is the shipped value. NULL IS STORED FOR THIS, never
   *  a copy of the defaults — the same rule the flyby shot list follows, and for
   *  the same reason: a stored copy pins the player to today's numbers and
   *  silently ignores every later change to them. */
  function cardPristine(geom) {
    const g = clampCard(geom);
    return CARD_KEYS.every((k) => g[k] === CARD[k].def);
  }

  /** The custom properties css/overlays.css reads off #ld-card. */
  function cardVars(geom) {
    const g = clampCard(geom);
    return {
      "--ld-card-scale": String(g.scale),
      "--ld-card-x": g.x + "vw",
      "--ld-card-y": g.y + "vh",
    };
  }

  /* ── THE STARTING GRID GRAPHIC ───────────────────────────────────────────
   * Over the flyby's grid shots (grid-crane, grid-front, grid-mine: ids that
   * start "grid") the card's map slot shows the field the way the TV graphic
   * does: two staggered columns, P1 on the left and half a row ahead of P2 on
   * the right, with the player's box in their team colour. It draws in the box
   * the MAP already has, so the card never changes size under the camera's
   * last move.
   *
   * LEGIBLE BEFORE COMPLETE. A 22-car grid in a 150 px box is 13 px a row,
   * and no phone can read that. So the rows are sized first (GRID_ROW_MIN
   * displayed px, at least a 10 px code), the graphic shows as many rows as
   * fit, and the window is placed so the player's row is in it, which is the
   * part of the grid the player is looking for. Pure: CSS px in, boxes out,
   * tested without a canvas. */
  const GRID_ROW_MIN = 20, GRID_PAD = 4, GRID_GAP = 6;
  const isGridShot = (id) => typeof id === "string" && id.indexOf("grid") === 0;
  /** The field as the card may use it: an array of {code, colour, isPlayer}
   *  with at least two cars and exactly one player, else null (the map stays).
   *  An UNKNOWN SLOT (a random grid, whose draw belongs to the race) carries no
   *  player, and the cars seated for the flyby are then not the race's order,
   *  so a graphic of them would be a made-up grid. */
  function gridField(grid) {
    if (!Array.isArray(grid) || grid.length < 2) return null;
    let mine = -1;
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] || typeof grid[i] !== "object") return null;
      if (grid[i].isPlayer) { if (mine >= 0) return null; mine = i; }
    }
    return mine < 0 ? null : grid;
  }
  /** Boxes for `grid` in a w×h CSS-px slot. `player` is the grid index to
   *  highlight, or -1 for none. Returns {rows, first, rowH, font, cells[]}
   *  where each cell is {i, pos, col, x, y, w, h, code, colour, isPlayer}. */
  function gridLayout(grid, w, h, player) {
    const n = Array.isArray(grid) ? grid.length : 0;
    const total = Math.ceil(n / 2);
    const fit = Math.floor((h - 2 * GRID_PAD) / GRID_ROW_MIN - 0.5);
    const rows = Math.max(1, Math.min(total, fit));
    const me = player >= 0 && player < n ? player : -1;
    // The window: the player's row at (or just above) the middle, clamped to the grid's ends.
    const myRow = me >= 0 ? Math.floor(me / 2) : 0;
    const first = Math.max(0, Math.min(total - rows, myRow - Math.floor((rows - 1) / 2)));
    const rowH = (h - 2 * GRID_PAD) / (rows + 0.5);
    const colW = (w - 2 * GRID_PAD - GRID_GAP) / 2;
    const boxH = rowH * 0.82;
    const cells = [];
    for (let i = first * 2; i < Math.min(n, (first + rows) * 2); i++) {
      const col = i % 2, r = Math.floor(i / 2) - first;
      const c = grid[i] || {};
      cells.push({
        i, pos: i + 1, col,
        x: GRID_PAD + col * (colW + GRID_GAP),
        y: GRID_PAD + r * rowH + (col ? rowH / 2 : 0),
        w: colW, h: boxH,
        code: typeof c.code === "string" ? c.code.slice(0, 3).toUpperCase() : "",
        colour: c.colour, isPlayer: i === me,
      });
    }
    return { rows, first, rowH, font: Math.max(10, Math.min(14, Math.round(boxH * 0.58))), cells };
  }
  /** A team colour ([r,g,b] in 0..1, or a CSS string) as CSS, lifted toward
   *  white when it is too dark to see on the card (the 2026 Mercedes is black). */
  function gridColour(col) {
    if (typeof col === "string" && col) return col;
    if (!Array.isArray(col) || col.length < 3 || !col.slice(0, 3).every((v) => Number.isFinite(+v))) return "#e10600";
    let [r, g, b] = col.slice(0, 3).map((v) => Math.max(0, Math.min(1, +v)));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 0.18) { const k = 0.45; r += (1 - r) * k; g += (1 - g) * k; b += (1 - b) * k; }
    return "rgb(" + [r, g, b].map((v) => Math.round(v * 255)).join(",") + ")";
  }

  function create(hooks) {
    const { $, Tracks, TrackMaps, Flags, store } = hooks;
    /* The announcer may arrive as a THUNK rather than an instance, and js/game.js
     * passes one. `announcer` there is a `let` that starts at Announcer.inert()
     * and is reassigned at the module wires; today those wires run before this
     * screen is created, but that ordering is not a contract anyone maintains,
     * and a captured inert() would fail SILENTLY — play() returning false is
     * indistinguishable from the player having turned the announcer off. */
    const ann = () => {
      const a = typeof hooks.announcer === "function" ? hooks.announcer() : hooks.announcer;
      return a && typeof a.play === "function" ? a : null;
    };

    // TEAM RADIO (js/audio/radio-voice.js): a thunk for the same reason.
    const radio = () => {
      const r = typeof hooks.radio === "function" ? hooks.radio() : hooks.radio;
      return r && typeof r.sayPreRace === "function" ? r : null;
    };

    let timer = 0, phase = "", build = null, el = null, flyT0 = 0, flyMs = FLY_MS;
    // This run's flyby: `cur` is its info (shot list, field), `view` what the
    // map slot shows ("map" | "grid"), `mapBox` the map's CSS box, and
    // `radioState` the radio check ("" not yet, "done" tried, "live" on air;
    // stop() cuts a live one).
    let cur = null, view = "map", radioState = "", mapBox = null;

    function readSkips() {
      try { return store && store.get ? store.get("flySkips", 0) : 0; } catch (_) { return 0; }
    }
    /** Record how the flyby ended. Only a FLYBY counts — the no-world card is
     *  700 ms and nobody is choosing anything by letting it run. */
    function noteFlyby(skipped) {
      if (phase !== "run") return;
      try { if (store && store.set) store.set("flySkips", nextSkips(readSkips(), skipped)); }
      catch (_) { /* storage refused: the streak just does not build */ }
    }

    // The map's slot in the card, in CSS px. fitCanvas keeps the circuit's own
    // aspect inside it, so a wide circuit gets the width and a tall one the height.
    const MAP_W = 210, MAP_H = 150;

    // The live geometry, read from the store on first use and kept after.
    let geom = null;
    function cardGeom() {
      if (geom) return geom;
      let saved = null;
      try { saved = store && store.get ? store.get("ldCard", null) : null; } catch (_) { saved = null; }
      geom = clampCard(saved);
      return geom;
    }
    /** Patch the geometry, save it and push it at the card. Returns the clamped
     *  result so the editor's sliders show what actually took effect rather than
     *  what they asked for. */
    function setCardGeom(patch) {
      geom = clampCard(Object.assign({}, cardGeom(), patch));
      try { if (store && store.set) store.set("ldCard", cardPristine(geom) ? null : geom); }
      catch (e) { Log.warn("game", "loading card geometry did not save", e); }
      applyCard();
      return Object.assign({}, geom);
    }
    /** Write the three custom properties. Inline on the element, not a class:
     *  the values are continuous and the stylesheet cannot enumerate them. */
    function applyCard() {
      const c = $("ld-card");
      if (!c || !c.style || typeof c.style.setProperty !== "function") return;
      const vars = cardVars(cardGeom());
      for (const k in vars) c.style.setProperty(k, vars[k]);
    }

    const WX = { dry: "DRY", wet: "WET", rain: "RAIN", overcast: "CLOUDY", fog: "FOG" };
    const TOD = { dawn: "DAWN", day: "DAY", dusk: "DUSK", night: "NIGHT" };

    function root() { return el || (el = $("loading")); }

    function paint(info) {
      const t = info.track;
      if (!t) return;
      $("ld-flag").innerHTML = Flags.svg(t.country);
      $("ld-name").textContent = t.name + (t.night ? " ☾" : "");
      $("ld-gp").textContent = t.gp || t.country || "";
      // The same numbers the select card shows, minus the ones that need the
      // built world — this paints before any build has necessarily happened.
      const km = t.lengthKm || 0;
      const turns = TrackMaps.corners(t).length;
      const rows = [
        ["LAPS", info.laps ? String(info.laps) : "—"],
        ["LENGTH", km ? km.toFixed(3) + " km" : "—"],
        ["TURNS", turns ? String(turns) : "—"],
        ["WEATHER", WX[info.weather] || "DRY"],
        ["TIME", TOD[info.tod] || (t.night ? "NIGHT" : "DAY")],
      ];
      drawMap(t);
      const meta = $("ld-meta");
      if (typeof meta.replaceChildren === "function") meta.replaceChildren(); else meta.textContent = "";
      for (const [k, v] of rows) {
        const pair = document.createElement("div");
        const dt = document.createElement("dt"); dt.textContent = k;
        const dd = document.createElement("dd"); dd.textContent = v;
        pair.append(dt, dd);
        meta.appendChild(pair);
      }
    }

    /** The lap outline, on the circuit picker's recipe: white line, dark casing,
     *  red start marker, no corner/sector/DRS furniture. Sized from the
     *  circuit's own aspect, and oversampled for HiDPI the way the picker's
     *  preview is, with the line weight scaled by the same ratio so it keeps
     *  its visual thickness. Wrapped: a map that will not draw must never stop
     *  a race from starting. */
    function drawMap(t) {
      const cv = $("ld-map");
      // TrackMaps comes from `hooks`, not window: every module here is a bare
      // lexical `const` at script scope, so window.TrackMaps is undefined and a
      // window-based guard would silently skip the map on every boot.
      if (!cv || !TrackMaps || typeof TrackMaps.draw !== "function") return;
      try {
        const fit = TrackMaps.fitCanvas(cv, MAP_W, MAP_H, t, true);
        mapBox = { w: fit.w, h: fit.h };
        setView(cv, "map", "Circuit layout");
        // THE CARD'S SCALE IS PART OF THE OVERSAMPLE. A canvas laid out at 210
        // CSS px and then scaled to 1.6 by the card is a 210 px raster stretched
        // across 336 — the one element on the card that cannot reflow, and the
        // one that shows it. Folding the scale in here draws the pixels the
        // player actually sees. Still capped at 3: the cap is about memory.
        const ratio = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * cardGeom().scale));
        if (ratio > 1.01) {
          cv.width = Math.round(fit.w * ratio);
          cv.height = Math.round(fit.h * ratio);
        }
        const br = fit.w ? (cv.width / fit.w) : 1;
        const lw = Math.max(2, Math.round(Math.min(fit.w, fit.h) / 42));
        TrackMaps.draw(cv, t, {
          color: "#ffffff", casing: "rgba(0,0,0,0.55)", startColor: "#e10600",
          width: lw * br, pad: Math.round(lw * 1.5) * br,
          corners: false, sectors: false, drs: false,
        });
      } catch (_) { /* no outline is a smaller loss than no race */ }
    }

    /** How far through the flyby, 0..1 (see progress() below). */
    function flyU() {
      if (phase !== "run" || !flyT0) return 0;
      return Math.max(0, Math.min(1, (Date.now() - flyT0) / flyMs));
    }

    function setView(cv, v, label) {
      view = v;
      if (cv.dataset) cv.dataset.view = v;
      if (typeof cv.setAttribute === "function") cv.setAttribute("aria-label", label);
    }

    /** The grid graphic, drawn in the box the map left (see gridLayout). False
     *  when it cannot draw, and the caller keeps the map. */
    function drawGrid(field) {
      const cv = $("ld-map");
      if (!cv || !mapBox || typeof cv.getContext !== "function") return false;
      try {
        const ctx = cv.getContext("2d");
        if (!ctx) return false;
        // Laid out in DISPLAYED px: on a phone the stylesheet caps the canvas
        // at 45% of the card, and rows sized for 210 px are unreadable at 150.
        // clientWidth is the displayed width; 0 (not laid out) means as authored.
        const shown = cv.clientWidth > 0 ? cv.clientWidth / mapBox.w : 1;
        const w = mapBox.w * shown, h = mapBox.h * shown;
        const me = field.findIndex((c) => c.isPlayer);
        const L = gridLayout(field, w, h, me);
        const k = cv.width / w;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (L.first === 0) {   // the front of the grid: the start line above P1
          ctx.fillStyle = "#e10600";
          ctx.fillRect(GRID_PAD, 1, w - 2 * GRID_PAD, 2);
        }
        ctx.textBaseline = "middle";
        for (const c of L.cells) {
          const team = gridColour(c.colour);
          ctx.fillStyle = c.isPlayer ? team : "rgba(0,0,0,0.55)";
          ctx.fillRect(c.x, c.y, c.w, c.h);
          ctx.fillStyle = team;
          ctx.fillRect(c.x, c.y, 3, c.h);
          if (c.isPlayer) {
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
            ctx.strokeRect(c.x + 0.75, c.y + 0.75, c.w - 1.5, c.h - 1.5);
          }
          const mid = c.y + c.h / 2;
          ctx.font = "600 " + Math.round(L.font * 0.85) + "px system-ui, sans-serif";
          ctx.fillStyle = c.isPlayer ? "#ffffff" : "rgba(255,255,255,0.7)";
          ctx.fillText("P" + c.pos, c.x + 7, mid);
          if (c.code) {
            ctx.font = "700 " + L.font + "px system-ui, sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(c.code, c.x + 7 + L.font * 2.1, mid);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        setView(cv, "grid", "Starting grid, you start P" + (me + 1));
        return true;
      } catch (_) { return false; }
    }

    /** Ten times a second while the flyby runs: the shot on air decides what
     *  the map slot shows, and grid-mine is the radio check's cue. After a skip
     *  (`build` gone) nothing changes: the race is already on its way. */
    function watchShot() {
      if (phase !== "run" || !build || !cur || typeof FlybySeq === "undefined" || !FlybySeq.shotAt) return;
      let id = "";
      try { id = FlybySeq.shotAt(flyU(), cur.shots).id; } catch (_) { return; }
      const field = gridField(cur.grid);
      const want = field && isGridShot(id) ? "grid" : "map";
      if (want !== view) {
        if (want === "map") drawMap(cur.track);
        else if (!drawGrid(field)) cur.grid = null;   // could not draw: the map, for the rest of the run
      }
      if (id === "grid-mine" && !radioState) radioCheck(field);
    }

    /* THE RADIO CHECK. The camera has settled behind the player's own car, and
     * the engineer says one line: the grid slot and a word of calm. It goes
     * through RadioVoice.sayPreRace, so TEAM RADIO off, master sound off, and a
     * line that will not fit what is left of the flyby are all refused exactly
     * as a race line is; and it reads the radio CHATTER setting as the race
     * radio does, so "off" and "key" (key messages only) get no flavour line.
     *
     * NEVER OVER THE ANNOUNCER. The two share one speechSynthesis and say()
     * cancels whatever is on it. While a read is in progress the check WAITS
     * (this runs every 100 ms) and gives up once the flyby has too little left
     * for a line. At most once per run: only run() puts radioState back to "". */
    const RADIO_MIN_S = 2.2;   // the longest eng.grid line, with its courtesy figure, at the radio's top rate
    /** A skip or a stop() ends the check with the flyby it belonged to. */
    function cutRadio() {
      if (radioState !== "live") return;
      radioState = "done";
      const r = radio();
      if (r) { try { r.stop(); } catch (_) { /* a synth mid-teardown */ } }
    }
    /* The announcer's share of the flyby. When the radio check will run, the
     * read must be OVER by the grid-mine shot — it lands its last line at the
     * end of whatever budget it is given, and radioCheck() waits on speaking(),
     * so handed the whole flyby it held the channel until the check had no time
     * left, and the check never played with the announcer on (its default). */
    function annLife(info, life) {
      const r = radio();
      let chat = "normal";
      try { chat = store && store.get ? store.get("radioChat", "normal") : "normal"; } catch (_) { chat = "normal"; }
      let on = false;
      try { on = !!(r && r.debug && r.debug().enabled); } catch (_) { on = false; }
      if (!on || (chat !== "normal" && chat !== "chatty")) return life;
      const list = info && info.shots && info.shots.length ? info.shots : null;
      if (!list) return life;
      let total = 0, before = -1;
      for (const sh of list) { if (sh.id === "grid-mine" && before < 0) before = total; total += sh.dur || 0; }
      if (before < 0 || !(total > 0)) return life;
      return Math.max(0, Math.min(life, life * before / total - 150));
    }
    function radioCheck(field) {
      const r = radio();
      const left = (flyMs - (Date.now() - flyT0)) / 1000;
      let chat = "normal";
      try { chat = store && store.get ? store.get("radioChat", "normal") : "normal"; } catch (_) { chat = "normal"; }
      const me = field ? field.findIndex((c) => c.isPlayer) : -1;
      if (!r || me < 0 || (chat !== "normal" && chat !== "chatty") || !(left >= RADIO_MIN_S)
        || typeof RadioLines === "undefined") { radioState = "done"; return; }
      const a = ann();
      if (a && typeof a.speaking === "function" && a.speaking()) return;   // wait for the read to end
      radioState = "done";
      const text = RadioLines.create((flyT0 >>> 0) || 1).pick("eng.grid", { pos: me + 1 });
      if (!text) return;
      const lead = typeof GameAudio !== "undefined" && GameAudio.radioLeadS ? GameAudio.radioLeadS("radio") : 0;
      try {
        if (!r.sayPreRace(text, left, lead)) return;
        radioState = "live";
        // The click-hiss-squelch around it, as showAnnounce plays for a race line.
        if (typeof GameAudio !== "undefined" && GameAudio.radioSting) GameAudio.radioSting("radio", left);
      } catch (e) { Log.warn("audio", "radio check failed", e); }
    }

    function setPhase(p) {
      phase = p;
      const r = root();
      if (r) r.dataset.phase = p;
    }

    function fire() {
      clearTimeout(timer);
      timer = 0;
      const go = build;
      build = null;
      if (go) go();
    }

    /** A skip goes straight to the race. There is no second half to advance to
     *  any more, and the build behind it is already warm. */
    // A keydown AUTO-REPEAT is not a new press: holding Enter a beat long on
    // RACE! used to skip the flyby on the first repeat.
    // Once per run: the listeners stay up until startRace lowers the screen, and a
    // triple tap counted three skips (the short flyby arrived a run early).
    function onSkip(e) { if (e && e.type === "keydown" && e.repeat) return; if (phase && build) { noteFlyby(true); cutRadio(); fire(); } }
    /* THE PAD SKIPS TOO. No UI layer is open during the flyby, so the gamepad
     * walker sends no synthetic keydown and a controller-only player (TV, a
     * handheld) waited the full FLY_MS before every race. Poll the pads while
     * the screen is up: a button counts only as a fresh press, so one still
     * held from the menu has to come up first. */
    let padTimer = 0;
    const padHeld = new Set();
    function padButtons(fn) {
      let pads = [];
      try { pads = (typeof navigator !== "undefined" && navigator.getGamepads && navigator.getGamepads()) || []; } catch (_) { pads = []; }
      for (const p of pads) {
        if (!p || !p.buttons) continue;
        for (let i = 0; i < p.buttons.length; i++) fn(p.index + ":" + i, !!(p.buttons[i] && p.buttons[i].pressed));
      }
    }
    function pollPad() {
      let fresh = false;
      padButtons((k, down) => {
        if (!down) padHeld.delete(k);
        else if (!padHeld.has(k)) { padHeld.add(k); fresh = true; }
      });
      if (fresh) onSkip();
    }

    /** Show the screen and run `go` once the card is up. `info.hasWorld` false
     *  (no pre-built track to fly over) skips the flyby: an empty black hold
     *  is not a cinematic, it is a stall with extra steps. */
    function run(info, go) {
      stop();
      build = typeof go === "function" ? go : null;
      cur = info; view = "map"; radioState = "";
      const r = root();
      if (!r) { fire(); return; }          // no markup: degrade to "just race"
      paint(info);
      applyCard();
      r.hidden = false;
      const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      addEventListener("pointerdown", onSkip, true);
      addEventListener("keydown", onSkip, true);
      padHeld.clear();
      padButtons((k, down) => { if (down) padHeld.add(k); });   // held from the menu: not a skip
      if (typeof setInterval === "function") padTimer = setInterval(() => { pollPad(); watchShot(); }, 100);   // the pad, and the shot on air (the grid graphic, the radio check)
      flyT0 = Date.now();
      // "run" is the flyby WITH the card up; "card" is the no-world fallback.
      // Both show the card, so the stylesheet reveals it for either.
      setPhase(info.hasWorld && !reduced ? "run" : "card");
      const life = info.hasWorld && !reduced ? flyMsFor(readSkips()) : CARD_MS;
      flyMs = info.hasWorld && !reduced ? life : FLY_MS;
      // The letterbox (css/overlays.css) opens on the flyby's last beat, so it
      // needs the budget this run actually has, not the 24 s it usually is.
      if (r.style && typeof r.style.setProperty === "function") r.style.setProperty("--ld-fly", life + "ms");
      timer = setTimeout(() => { noteFlyby(false); fire(); }, life);
      /* THE ANNOUNCER (js/audio/announcer.js) reads the card aloud, and it is
       * given THIS SCREEN'S budget so the skip that ends the flyby ends the
       * voice too. Without that a skipped 24 s welcome keeps talking over the
       * formation lap — speechSynthesis is not in the WebAudio graph, so
       * nothing else would have stopped it.
       *
       * ONLY OVER THE FLYBY. The no-world path is a 700 ms fade, and 700 ms of
       * "Welcome to—" cut off mid-word is worse than silence. */
      if (info.hasWorld && !reduced) {
        const a = ann();
        if (a) { try { a.play(info, annLife(info, life)); } catch (e) { Log.warn("audio", "announcer failed", e); } }
      }
    }

    /** Close and disarm. Called by clearMenuScreens() once the race owns the
     *  screen, and by anything that cancels the run before the build fires. */
    function stop() {
      clearTimeout(timer);
      timer = 0;
      build = null;
      phase = "";
      // The voice outlives the screen unless something cancels it: the screen's
      // own budget timer is cleared above, and speechSynthesis has no owner.
      const a = ann();
      if (a) { try { a.stop(); } catch (_) { /* a synth mid-teardown */ } }
      cutRadio();
      cur = null;
      removeEventListener("pointerdown", onSkip, true);
      removeEventListener("keydown", onSkip, true);
      if (padTimer) { clearInterval(padTimer); padTimer = 0; }
      const r = root();
      if (r) { r.hidden = true; r.dataset.phase = ""; }
    }

    /* THE EDITOR'S HOLD. The card's size and position cannot be authored blind,
     * and the screen they belong to only exists for the 24 s between RACE! and
     * the grid — so the flyby editor puts the real card up, over the real
     * scene, and leaves it there while the sliders move.
     *
     * A THIRD PHASE, not `run` with the timer suppressed. "card" and "run" both
     * arm a skip handler and own the screen; this one is a preview under a
     * panel, so it must not swallow the clicks the panel is there to receive
     * (css/overlays.css turns pointer events off for it) and must not report
     * itself active(), which is what keeps game.js drawing the world for a
     * loading screen that is genuinely loading. */
    function hold(info) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      paint(info);
      applyCard();
      r.hidden = false;
      setPhase("hold");
      return true;
    }

    /* THE BUILD. RACE! before the menu built the world: the card goes up over the
     * usual scrim while game.js builds it, then run() takes over. No timer, no
     * skip (nothing to skip to yet), and not active(): the canvas stays hidden,
     * so the previous circuit never shows through. */
    function building(info) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("build");
      return true;
    }

    return {
      run, stop, hold, building,
      /** The flyby editor's three sliders. setCard() PATCHES — it merges onto
       *  what is there, so a size slider does not reset the position. RESET is
       *  resetCard(), which drops the geometry first: clampCard(null) is every
       *  shipped default, and storing it then clears the key, because pristine
       *  is stored as null. */
      card: () => Object.assign({}, cardGeom()),
      setCard: (patch) => setCardGeom(patch),
      resetCard() { geom = clampCard(null); return setCardGeom({}); },
      /** How far through the FLYBY the screen is, 0..1. The shot sequencer is
       *  driven by this rather than by the wall clock, so the sequence keeps its
       *  shape when FLY_MS is retuned (or shortened for a habitual skipper),
       *  and a phase skipped by a keypress does not
       *  leave the camera mid-move. 1 once the card is up, 0 when nothing runs. */
      progress: () => flyU(),
      /** True while the screen owns the canvas — game.js keeps the world
       *  drawn for exactly this window and blanks every other menu. */
      active() { return phase === "run" || phase === "card"; },
      phase() { return phase; },
    };
  }

  return { create, FLY_MS, SHORT_FLY_MS, SKIP_STREAK, flyMsFor, nextSkips, CARD_MS, CARD, CARD_KEYS, clampCard, cardPristine, cardVars,
    gridLayout, gridField, gridColour, isGridShot, GRID_ROW_MIN };
})();
Object.freeze(LoadingScreen);
