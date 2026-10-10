"use strict";
/* Apex 26 — PRE-RACE LOADING SCREEN.
 *
 * The flyby plays here, in the gap the player already pays for between
 * pressing RACE! and the grid appearing — not behind the race-settings sheet,
 * where it competes with the rows and makes the menu look like a paused race.
 *
 * THE CARD AND THE FLYBY RUN TOGETHER. The world is BUILT UNDER RACE SETTINGS
 * (scheduleFlybyTrack, and loadTrack memoises on builtTrackId, so the call at
 * race start is nearly free), so there is nothing to stall behind: the card
 * fades in at the start and shares the screen with the flyby throughout.
 *
 * With no pre-built world to fly over — a circuit picked a moment ago, scenery
 * still downloading — there is no cinematic to play: the card goes up alone and
 * the build runs immediately behind it.
 *
 * Any pointer or key ends the screen early: it is a flourish, and a flourish
 * that cannot be skipped is a wait.
 *
 * THE SCREEN OUTLIVES THE FLYBY BY ONE MORE WAIT it did not use to cover: the
 * backend compiles the race's programs on the first countdown frame and paints
 * nothing until it is done. startRace raises the card again for exactly that
 * window (handoff(), below) and lowers it with the first presented race frame.
 */
const LoadingScreen = (function () {
  // The whole sequence's budget. js/camera/flyby-seq.js spends it across eight
  // shots as FRACTIONS, so retuning this number rebalances them all rather than
  // truncating the last one. 20 s is ~2.5 s a shot (24 s until 2026-10: the race
  // came too late); not lower, or grid-mine's window (~12% of it) drops under
  // RADIO_MIN_S and the radio check never plays. Skippable with any pointer or key.
  const FLY_MS = 20000;
  /** THE ONE AUTOMATION GATE for every intro shortcut: the 700 ms card instead of
   *  the flyby + announcer (run(), below) and no garage drive-out
   *  (js/garage/setup-camera.js startDriveOut). A harness-driven page
   *  (navigator.webdriver: Playwright, the Chrome MCP) unless it opts back into
   *  player pace with ?fullIntro=1 or window.__apexFullIntro = true (the
   *  garage-out-before-card spec does, to keep the 7.6 s drive-out covered).
   *  Not a motion flag: a player's reduced-motion setting still gets it all. */
  function isAutomation() {
    try {
      if (typeof navigator === "undefined" || !navigator || navigator.webdriver !== true) return false;
      if (typeof window !== "undefined" && window && window.__apexFullIntro === true) return false;
      if (typeof location !== "undefined" && location && /[?&]fullIntro=1(?:&|$)/.test(location.search || "")) return false;
      return true;
    } catch (_) { return false; }
  }
  // With nothing to fly over, just long enough for the card's fade to land
  // before the build takes the main thread.
  const CARD_MS = 700;
  /* THE HABITUAL SKIPPER. A player who has skipped the last SKIP_STREAK flybys
   * in a row has told us what they think of the full cut; they get SHORT_FLY_MS instead.
   * The shots are fractions of the budget and the announcer is fitted to it, so
   * both follow without a second sequence. One flyby left to play out resets
   * the streak — the long cut comes back for anyone who watched it again.
   * Stored as `apex26.flySkips` through the game's store. */
  const SHORT_FLY_MS = 10000;
  const SKIP_GRACE_MS = 400;
  const SKIP_STREAK = 3;
  /* A READ THAT NEEDS LONGER. A real race joined from the Data Hub has a story
   * to tell (the order, the gaps, your tyres, the flags so far) that does not
   * fit FLY_MS; `wantMs` is the announcer's own estimate of its full read, and the
   * flyby stretches to it, up to FLY_MAX_MS. Still skippable, and a habitual
   * skipper keeps the short cut: they have told us what they think of waiting. */
  const FLY_MAX_MS = 60000;   // the Baku lap-40 read needs 54 s for its flags and retirements (announcer.test.mjs); still skippable
  /** The flyby's budget for a stored streak (and a read that wants longer). Pure; hostile input is no streak.
   *  `warmReady` (3rd arg / opts.warmReady): the habitual short cut only applies once the
   *  backend's race-entry warm is done. Shortening into a still-compiling first frame
   *  was the freeze under a shorter card (PERF-OPTIONS / load-download-weight plan).
   *  Absent / true keeps today's behaviour; false forces at least FLY_MS. */
  function flyMsFor(skips, wantMs, warmReady) {
    const ready = warmReady === undefined || warmReady === null ? true
      : !!(typeof warmReady === "object" ? warmReady.warmReady !== false : warmReady);
    const n = Number.isFinite(+skips) ? +skips : 0;
    if (n >= SKIP_STREAK && ready) return SHORT_FLY_MS;
    const want = Number.isFinite(+wantMs) ? +wantMs : 0;
    return Math.min(FLY_MAX_MS, Math.max(FLY_MS, Math.round(want)));
  }

  /* THE CARD'S FACTS. A circuit gets laps, length, turns, weather and time. A
   * REAL RACE joined mid-race gets where it stands instead — the lap, your
   * place and gap, your tyres and stops, who leads, the flag if one is out —
   * and from lap 1 the grid: your slot, pole, what you start on. The numbers
   * are RealRace.situation()'s (info.real.story), so card and voice agree.
   * Pure: info in, [label, value] rows out. */
  const WX = { dry: "DRY", wet: "WET", rain: "RAIN", overcast: "CLOUDY", fog: "FOG" };
  const TOD = { dawn: "DAWN", day: "DAY", dusk: "DUSK", night: "NIGHT" };
  const TYRE = { soft: "SOFT", medium: "MEDIUM", hard: "HARD", intermediate: "INTER", "full wet": "WET" };
  function gapStr(g) { return !g ? "" : g.lapsDown > 0 ? "+" + g.lapsDown + " LAP" + (g.lapsDown > 1 ? "S" : "") : g.s > 0 ? "+" + g.s.toFixed(1) + "s" : ""; }
  function metaRows(info, turns) {
    const t = (info && info.track) || {};
    const km = t.lengthKm || 0;
    const wx = ["WEATHER", WX[info && info.weather] || "DRY"], tod = ["TIME", TOD[info && info.tod] || (t.night ? "NIGHT" : "DAY")];
    const S = info && info.real && info.real.story;
    if (S && S.grid) {
      const y = S.you;
      return [
        ["GRID", y && y.pos ? "P" + y.pos : "—"],
        ["POLE", S.pole ? S.pole.code : "—"],
        ["TYRE", y && y.tyre ? (TYRE[y.tyre.compound] || y.tyre.compound.toUpperCase()) + (y.tyre.age > 0 ? " · USED" : "") : "—"],
        ["LAPS", info.laps ? String(info.laps) : "—"],
        wx, tod,
      ];
    }
    if (S) {
      const y = S.you, flag = (S.cautions || []).find((c) => c.now);
      const rows = [
        ["LAP", S.lap + " / " + S.realLaps],
        [info.real.watch ? "FOLLOWING" : "RUNNING", y && y.running ? "P" + y.pos + (y.pos > 1 ? " · " + gapStr(y.gap) : "") : y ? "OUT" : "—"],
        ["TYRE", y && y.tyre ? (TYRE[y.tyre.compound] || y.tyre.compound.toUpperCase()) + " · " + y.tyre.age + (y.tyre.age === 1 ? " LAP" : " LAPS") : "—"],
        ["STOPS", y ? (y.stops && y.stops.length ? y.stops.length + " (L" + y.stops.join(", L") + ")" : "NONE") : "—"],
        ["LEADER", S.leader ? S.leader.code : "—"],
      ];
      if (flag) rows.push(["FLAG", flag.kind.toUpperCase()]);
      else if (S.out && S.out.length) rows.push(["OUT", String(S.out.length)]);
      rows.push(wx, tod);
      return rows;
    }
    return [
      ["LAPS", info && info.laps ? String(info.laps) : "—"],
      ["LENGTH", km ? km.toFixed(3) + " km" : "—"],
      ["TURNS", turns ? String(turns) : "—"],
      wx, tod,
    ];
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
   * THE WHOLE FIELD, AS A WALL OF CHIPS. A 22-car grid in two columns of a
   * 150 px box is 13 px a row, and no phone can read that; the graphic used to
   * answer with a WINDOW of rows around the player, which hid the front of the
   * grid behind the part the player was already looking at. Now the field is
   * split into BLOCKS, each a staggered pair of columns (P1-P12 | P13-P22 on a
   * full grid), and the block count is the smallest that keeps a row at
   * GRID_ROW_MIN px and a chip at GRID_CHIP_MIN px. When nothing fits both
   * (a phone), the count that fits best wins, and a chip too narrow for
   * "12 VER" drops the number and keeps the code: the order says where a
   * car starts, the player's own chip is highlighted, and the canvas label
   * says their slot aloud. Pure: CSS px in, boxes out, tested without a canvas. */
  const GRID_ROW_MIN = 20, GRID_CHIP_MIN = 30, GRID_PAD = 4, GRID_GAP = 3, GRID_BLOCK_GAP = 8, GRID_MAX_BLOCKS = 3;
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
  /** Rows per block, row height and column width for `blocks` blocks. */
  function gridFit(n, w, h, blocks) {
    const rows = Math.max(1, Math.ceil(Math.ceil(n / 2) / blocks));
    const rowH = (h - 2 * GRID_PAD) / (rows + 0.5);
    const colW = (w - 2 * GRID_PAD - blocks * GRID_GAP - (blocks - 1) * GRID_BLOCK_GAP) / (2 * blocks);
    return { blocks, rows, rowH, colW, fit: Math.min(rowH / GRID_ROW_MIN, colW / GRID_CHIP_MIN) };
  }
  /** Boxes for EVERY car of `grid` in a w×h CSS-px slot. `player` is the grid
   *  index to highlight, or -1 for none. Returns {blocks, rows, first, rowH,
   *  font, showPos, cells[]} where each cell is {i, pos, block, col, x, y, w,
   *  h, code, colour, isPlayer}; `first` is always 0 (the start line). */
  function gridLayout(grid, w, h, player) {
    const n = Array.isArray(grid) ? grid.length : 0;
    let best = null;
    for (let b = 1; b <= GRID_MAX_BLOCKS; b++) {
      const f = gridFit(n, w, h, b);
      if (f.fit >= 1) { best = f; break; }                 // the fewest blocks that are legible
      if (!best || f.fit > best.fit + 1e-9) best = f;      // else the most legible
      if (f.rows <= 1) break;                              // more blocks cannot help
    }
    const { blocks, rows, rowH, colW } = best;
    const me = player >= 0 && player < n ? player : -1;
    const boxH = rowH * 0.82;
    let font = Math.max(8, Math.min(14, Math.round(boxH * 0.62)));
    // drawGrid's layout in font units: the slot number ("14", 0.8 of the font)
    // at 6 px, the code 1.35 fonts after it, and a wide bold code ("HAM",
    // "LAW") 2.3 fonts across, 2 px to spare. The number may cost the font a
    // size or two, never below 10 px; past that the code goes alone.
    const withPos = Math.min(font, Math.floor((colW - 8) / 3.65));
    const showPos = withPos >= 10;
    // A code alone may fill more of its box: as tall as the chip allows, as wide as the column does.
    font = showPos ? withPos : Math.max(8, Math.min(14, Math.round(boxH * 0.8), Math.floor((colW - 8) / 2.3)));
    const cells = [];
    for (let i = 0; i < n; i++) {
      const block = Math.floor(i / (2 * rows)), local = i - block * 2 * rows;
      const col = local % 2, r = Math.floor(local / 2);
      const c = grid[i] || {};
      cells.push({
        i, pos: i + 1, block, col,
        x: GRID_PAD + block * (2 * colW + GRID_GAP + GRID_BLOCK_GAP) + col * (colW + GRID_GAP),
        y: GRID_PAD + r * rowH + (col ? rowH / 2 : 0),
        w: colW, h: boxH,
        code: typeof c.code === "string" ? c.code.slice(0, 3).toUpperCase() : "",
        colour: c.colour, isPlayer: i === me,
      });
    }
    return { blocks, rows, first: 0, rowH, font, showPos, cells };
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
  /** Text on the player's chip, which is filled with their team colour: dark
   *  on a light livery (white on a yellow chip could not be read), else white. */
  function gridInk(col) {
    if (!Array.isArray(col) || col.length < 3 || !col.slice(0, 3).every((v) => Number.isFinite(+v))) return "#ffffff";
    const [r, g, b] = col.slice(0, 3).map((v) => Math.max(0, Math.min(1, +v)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#0a0a10" : "#ffffff";
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

    let timer = 0, phase = "", build = null, el = null, flyT0 = 0, flyMs = FLY_MS, skipCb = null;
    // This run's flyby: `cur` is its info (shot list, field), `view` what the
    // map slot shows ("map" | "grid"), `mapBox` the map's CSS box, `markN`
    // the turn marked on the map (0 none), and `radioState` the radio check
    // ("" not yet, "done" tried, "live" on air; stop() cuts a live one).
    let cur = null, view = "map", radioState = "", mapBox = null, markN = 0;

    function readSkips() {
      try { return store && store.get ? store.get("flySkips", 0) : 0; } catch (_) { return 0; }
    }
    /** Record how the flyby ended. Only a FLYBY counts — the no-world card is
     *  700 ms and nobody is choosing anything by letting it run, and a skip of the
     *  garage leave is not a verdict on the flyby that still follows it. */
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

    function root() { return el || (el = $("loading")); }

    function paint(info) {
      const t = info.track;
      if (!t) return;
      $("ld-flag").innerHTML = Flags.svg(t.country);
      const tod = info.tod || "default";   // lit as the SESSION is, not as the circuit defaults (a day race at Baku)
      $("ld-name").textContent = t.name + (tod === "night" || (tod === "default" && t.night) ? " ☾" : "");
      $("ld-gp").textContent = info.gp || t.gp || t.country || "";
      // The same numbers the select card shows, minus the ones that need the
      // built world — this paints before any build has necessarily happened.
      // A real race shows where it stands instead (metaRows).
      const rows = metaRows(info, TrackMaps.corners(t).length);
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
     *  a race from starting. `mark`: the turn the flyby is filming, tagged on
     *  the outline so the shot on screen has a place on the lap (0: none). */
    function drawMap(t, mark) {
      const cv = $("ld-map");
      // TrackMaps comes from `hooks`, not window: every module here is a bare
      // lexical `const` at script scope, so window.TrackMaps is undefined and a
      // window-based guard would silently skip the map on every boot.
      if (!cv || !TrackMaps || typeof TrackMaps.draw !== "function") return;
      try {
        const fit = TrackMaps.fitCanvas(cv, MAP_W, MAP_H, t, true);
        mapBox = { w: fit.w, h: fit.h };
        markN = mark > 0 ? mark | 0 : 0;
        if (cv.dataset) cv.dataset.turn = markN ? String(markN) : "";
        setView(cv, "map", markN ? "Circuit layout, turn " + markN + " on camera" : "Circuit layout");
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
          corners: false, sectors: false, drs: false, mark: markN, markFont: Math.round(11 * br),
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
        if (L.cells.length) {   // the front of the grid: the start line above P1's block
          const c0 = L.cells[0], c1 = L.cells[Math.min(1, L.cells.length - 1)];
          ctx.fillStyle = "#e10600";
          ctx.fillRect(c0.x, 1, c1.x + c1.w - c0.x, 2);
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
          if (L.showPos) {
            ctx.font = "600 " + Math.round(L.font * 0.8) + "px system-ui, sans-serif";
            ctx.fillStyle = c.isPlayer ? gridInk(c.colour) : "rgba(255,255,255,0.7)";
            ctx.fillText(String(c.pos), c.x + 6, mid);
          }
          if (c.code) {
            ctx.font = "700 " + L.font + "px system-ui, sans-serif";
            ctx.fillStyle = c.isPlayer ? gridInk(c.colour) : "#ffffff";
            ctx.fillText(c.code, c.x + 6 + (L.showPos ? L.font * 1.35 : 0), mid);
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
      // The corner on air (FlybySeq.airCorner: what the last rendered frame
      // filmed). The map is redrawn only when it changes, a few times a flyby.
      let turn = 0;
      if (want === "map" && typeof FlybySeq.airCorner === "function") { try { turn = FlybySeq.airCorner() | 0; } catch (_) { turn = 0; } }
      if (want !== view || (want === "map" && turn !== markN)) {
        if (want === "map") drawMap(cur.track, turn);
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
      if (!gridField(info && info.grid)) return life;   // no field (time trial): radioCheck has nothing to say
      const list = info && info.shots && info.shots.length ? info.shots : null;
      if (!list) return life;
      let total = 0, before = -1;
      for (const sh of list) { if (sh.id === "grid-mine" && before < 0) before = total; total += sh.dur || 0; }
      if (before < 0 || !(total > 0)) return life;
      // A grid-mine window too short for any line (the 12 s cut: 1.4 s) means
      // radioCheck will refuse it, so the read keeps the whole flyby.
      if (life * (total - before) / total < RADIO_MIN_S * 1000) return life;
      // No room at all (grid-mine opens the flyby) is -1, "say nothing": 0
      // is the announcer's "no budget", which read the whole 26 s script.
      const share = life * before / total - 150;
      return share > 0 ? Math.min(life, share) : -1;
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
        const secs = r.sayPreRace(text, left, lead);
        if (!secs) return;
        radioState = "live";
        // The click-hiss-squelch around it, as showAnnounce plays for a race
        // line — held for the LINE (plus a beat for a slow voice), not the rest
        // of the flyby: seconds of open-mic hiss after "P5, RADIO CHECK" ended.
        const hold = typeof secs === "number" ? Math.min(left, secs + 0.6) : left;
        if (typeof GameAudio !== "undefined" && GameAudio.radioSting) GameAudio.radioSting("radio", hold);
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
    // RACE! must not skip the flyby on the first repeat.
    // Once per run: the listeners stay up until startRace lowers the screen, and a
    // triple tap counted three skips (the short flyby arrived a run early).
    // SKIP_GRACE_MS: the second click of a double-click on RACE! (or a second
    // Enter) is not a verdict on the flyby. A skip that DOES fire stops the event:
    // the race starts inside this listener, so an Escape/P/Space let through
    // bubbled on into the race and paused it (or latched a boost) on frame one.
    function onSkip(e) {
      if (e && e.type === "keydown" && e.repeat) return;
      // THE GARAGE PHASE skips too — to the card and the flyby, not past them: the
      // flyby always runs (it is skippable itself, below), so this skip ends only the
      // drive-out and the streak does not count it. "prep" is cold compilation before
      // the garage leave — same skip contract as build.
      if (phase === "garage" || ((phase === "build" || phase === "prep") && skipCb)) {
        if (!skipCb || Date.now() - flyT0 < SKIP_GRACE_MS) return;
        if (e) { if (e.cancelable && e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
        const cb = skipCb; skipCb = null;
        cb();
        return;
      }
      if (!(phase && build) || Date.now() - flyT0 < SKIP_GRACE_MS) return;
      if (e) { if (e.cancelable && e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
      noteFlyby(true); cutRadio();
      // The voice ends with the flyby it was fitted to, not when startRace
      // reaches clearMenuScreens() after its setup work.
      const a = ann();
      if (a) { try { a.stop(); } catch (_) { /* a synth mid-teardown */ } }
      fire();
    }
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
      // REDUCED MOTION (the OS flag or SETTINGS › MOTION) no longer drops the flyby for a
      // 700 ms card: after the garage leave the card, the flyby and the announcer always
      // run, at their normal length — a tap skips them (2026-10-09; the letterbox bars and
      // the title's CSS motion still honour the flag in css/).
      // AUTOMATION (navigator.webdriver: Playwright, the Chrome MCP) keeps the 700 ms
      // card, as game.js bootSeed keeps its fixed seed: a launch driven by a harness
      // hands off to the grid promptly instead of sitting through a 20-60 s flyby and
      // read on software GL (#1290 dropped the reduce-motion card the e2e suite's
      // pinned reducedMotion relied on, and the quali/real-race specs timed out). The
      // garage drive-out before it is skipped through the same gate (isAutomation).
      // A HIDDEN TAB gets the card, not the flyby: after the drive-out's safety cap the intro reaches run()
      // in the background, where the flyby timer, the announcer and the radio check would start unseen
      // (speechSynthesis speaks in a hidden tab, and iOS synthesis then breaks until reload).
      const fly = !!info.hasWorld && !isAutomation() && !(typeof document !== "undefined" && document.hidden);
      addEventListener("pointerdown", onSkip, true);
      addEventListener("keydown", onSkip, true);
      padHeld.clear();
      padButtons((k, down) => { if (down) padHeld.add(k); });   // held from the menu: not a skip
      if (typeof setInterval === "function") padTimer = setInterval(() => { pollPad(); watchShot(); }, 100);   // the pad, and the shot on air (the grid graphic, the radio check)
      flyT0 = Date.now();
      // "run" is the flyby WITH the card up; "card" is the no-world fallback.
      // Both show the card, so the stylesheet reveals it for either.
      setPhase(fly ? "run" : "card");
      // readMs: a real race's read, which may need longer.
      const life = fly ? flyMsFor(readSkips(), info.readMs, info.warmReady) : CARD_MS;
      flyMs = fly ? life : FLY_MS;
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
      if (fly) {
        const a = ann();
        if (a) { try { a.play(info, annLife(info, life)); } catch (e) { Log.warn("audio", "announcer failed", e); } }
      }
    }

    /** Close and disarm. Called by clearMenuScreens() once the race owns the
     *  screen, and by anything that cancels the run before the build fires. */
    function stop() {
      clearTimeout(timer);
      timer = 0;
      build = null; skipCb = null;
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

    /* THE BUILD. The canvas stays hidden until preparation settles. An optional
     * skip callback skips the cinematic afterward, without interrupting the build. */
    function building(info, onSkipCb) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("build");
      armSkip(onSkipCb);
      return true;
    }

    /* PREP before the garage leave: scrim over a cold compile, #ld-card hidden
     * (css/loading.css). The race/session card must not appear until studioDone
     * hands off — introCover uses this instead of building(). Skip = studioSkip. */
    function prep(info, onSkipCb) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("prep");
      armSkip(onSkipCb);
      return true;
    }

    /* THE GARAGE. RACE! opens on the car driving out of the setup screen's
     * garage (js/garage/setup-camera.js startDriveOut), after cold preparation,
     * and that shot is the
     * car's alone: no card, no scrim, no letterbox — the card arrives with the
     * flyby and the announcer. Up only to own the screen while game.js draws
     * the garage; no timer, and not active().
     * A tap, key or pad press calls `onSkip` (the card and the flyby are next).
     * Painted now, so building() or run() only has to fade it in. */
    function garage(info, onSkipCb) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("garage");
      armSkip(onSkipCb);
      return true;
    }
    function armSkip(onSkipCb) {
      skipCb = typeof onSkipCb === "function" ? onSkipCb : null;
      if (skipCb) {
        flyT0 = Date.now();   // SKIP_GRACE_MS: the second click of a double-click on START is not a skip
        addEventListener("pointerdown", onSkip, true);
        addEventListener("keydown", onSkip, true);
        padHeld.clear();
        padButtons((k, down) => { if (down) padHeld.add(k); });   // held from the menu: not a skip
        if (typeof setInterval === "function") padTimer = setInterval(pollPad, 100);
      }
    }

    /* THE HANDOFF. run() fires `go` (startRace) and the race owns the screen
     * from then on — but not yet the CANVAS. The backend compiles the race's
     * programs on the first countdown frame (gfx.warm(), spent inside present())
     * and paints nothing until it is done, and the countdown waits with it: one
     * to four seconds on a real GPU. Lowering the screen at once therefore put
     * the HUD and an unlit gantry over whatever the canvas held — the flyby's
     * last frame, or after the no-world card nothing at all — until the grid
     * appeared. So startRace raises the screen again in this phase, DISARMED:
     * the timer, the skip, the announcer and the radio went with the flyby they
     * belonged to (clearMenuScreens' stop() ran), only the card and the vignette
     * stay, and game.js lowers it from render() on the frame the backend
     * actually presents the race — so the card gives way to the grid, never to
     * a wait. Not active(): the race, not this screen, now decides what the
     * canvas shows; and a `.screen` that is up keeps the HUD clusters hidden
     * (css/hud.css) for exactly as long as there is nothing behind them. */
    function handoff() {
      stop();
      const r = root();
      if (!r) return false;
      r.hidden = false;
      setPhase("handoff");
      return true;
    }

    /* A WAIT WITH NO RACE YET. Garage teardown and a Start Race that has not
     * painted a circuit card still owe the player a plate: otherwise the
     * canvas goes black (setupPreviewOn dropped, Home still compiling) and
     * nothing says the tap landed. Reuses #loading / #ld-card — no new layer.
     * Already covering? Keep that phase; do not reset a flyby or build. */
    /* GREEN FLAG. startRace() now raises busy/build for every path, including
     * __apex.race(), so the wait plate would outlive lights-out whenever
     * present() never runs (software warming, jump()/go() before the first
     * frame). #loading is a .screen: css/hud.css then keeps the docks at
     * visibility:hidden. Call this when state is already "race". */
    function lowerWaitPlate() {
      if (phase === "handoff" || phase === "busy" || phase === "build" || phase === "garage" || phase === "prep") stop();
    }

    function busy(label) {
      if (phase === "run" || phase === "card" || phase === "build" || phase === "handoff"
        || phase === "garage" || phase === "busy" || phase === "prep") return true;
      const r = root();
      if (!r) return false;
      const title = (typeof label === "string" && label.trim()) ? label.trim() : "Loading";
      applyCard();
      // Unhide synchronously so a Start Race tap can paint this plate in the
      // same turn (after the race-settings <dialog> is sync-closed). Callers
      // must still yield (RaceEntryProfile.afterPaint) before heavy work, or
      // the browser never paints and the player sees a frozen dialog.
      r.hidden = false;
      if (typeof r.setAttribute === "function") r.setAttribute("aria-label", title);
      const name = $("ld-name"); if (name) name.textContent = title.toUpperCase();
      const gp = $("ld-gp"); if (gp) gp.textContent = "Please wait";
      const meta = $("ld-meta");
      if (meta) { if (typeof meta.replaceChildren === "function") meta.replaceChildren(); else meta.textContent = ""; }
      const flag = $("ld-flag"); if (flag) flag.innerHTML = "";
      setPhase("busy");
      return true;
    }

    return {
      run, stop, hold, building, prep, garage, handoff, busy, lowerWaitPlate,
      /** The next flyby's length (the short cut for a habitual skipper), so its
       *  shots are planned for the seconds they will actually have. Pass
       *  warmReady=false to keep FLY_MS while the backend is still compiling. */
      nextFlyMs: (wantMs, warmReady) => flyMsFor(readSkips(), wantMs, warmReady),
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
       *  leave the camera mid-move. 1 once the flyby has run its length; 0 when
       *  no flyby runs (the card, build, handoff and hold phases). */
      progress: () => flyU(),
      /** True while the screen owns the canvas — game.js keeps the world
       *  drawn for exactly this window and blanks every other menu. */
      active() { return phase === "run" || phase === "card"; },
      phase() { return phase; },
    };
  }

  return { create, isAutomation, FLY_MS, SHORT_FLY_MS, FLY_MAX_MS, SKIP_GRACE_MS, SKIP_STREAK, flyMsFor, metaRows, nextSkips, CARD_MS, CARD, CARD_KEYS, clampCard, cardPristine, cardVars,
    gridLayout, gridField, gridColour, gridInk, isGridShot, GRID_ROW_MIN };
})();
Object.freeze(LoadingScreen);
