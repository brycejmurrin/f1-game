"use strict";
/* Apex 26 — LOADING CARD MODEL.
 *
 * The pure half of the pre-race loading screen: flyby budget, card facts and
 * geometry, and the starting-grid graphic. No DOM. LoadingScreen
 * (js/ui/loading-screen.js, next in the manifest) paints them and re-exports
 * this surface, so callers keep LoadingScreen.*.
 */
const LoadingCard = (function () {
  // The whole sequence's budget. js/camera/flyby-seq.js spends it across eight
  // shots as FRACTIONS, so retuning this number rebalances them all rather than
  // truncating the last one. 20 s is ~2.5 s a shot (24 s until 2026-10: the race
  // came too late); not lower, or grid-mine's window (~12% of it) drops under
  // RADIO_MIN_S and the radio check never plays. Skippable with any pointer or key.
  const FLY_MS = 20000;
  /** THE ONE AUTOMATION GATE for every intro shortcut: the 700 ms card instead of
   *  the flyby + announcer (LoadingScreen.run) and no garage drive-out
   *  (js/garage/setup-camera.js startDriveOut). A harness-driven page
   *  (navigator.webdriver: Playwright, the Chrome MCP) unless it opts back into
   *  player pace with ?fullIntro=1 or window.__apexFullIntro = true (the
   *  garage-out-before-card spec does, to keep the ~10.6 s drive-out covered).
   *  Not a motion flag: a player's reduced-motion setting still gets it all. */
  function isAutomation() {
    try {
      if (typeof navigator === "undefined" || !navigator || navigator.webdriver !== true) return false;
      if (typeof window !== "undefined" && window && window.__apexFullIntro === true) return false;
      if (typeof DevFlags !== "undefined" && DevFlags.get("fullIntro")) return false;
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

  /** Settled = uploaded, failed, or unsupported (Assets.state()). Same predicate
   *  as GaragePrebuild.packSettled — race-entry warm presents must not start
   *  while createTextureArray is still on the main thread (#1477 collision). */
  function packSettled(s) {
    return !s || s.supported === false || !!s.uploaded || !!s.error || s.tier === "off";
  }
  function warmPresentReady(assetsState) { return packSettled(assetsState); }

  /* THE CARD'S FACTS. A circuit gets laps, length, turns, weather and time. A
   * REAL RACE joined mid-race gets where it stands instead — the lap, your
   * place and gap, your tyres and stops, who leads, the flag if one is out —
   * and from lap 1 the grid: your slot, pole, what you start on. The numbers
   * are RealRace.situation()'s (info.real.story), so card and voice agree.
   * Pure: info in, [label, value] rows out. */
  const WX = { dry: "DRY", wet: "WET", rain: "RAIN", storm: "STORM", overcast: "CLOUDY", fog: "FOG" };
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
        [info.real.watch ? "FOLLOWING" : "RUNNING", y && y.running ? "P" + y.pos + (y.pos > 1 && gapStr(y.gap) ? " · " + gapStr(y.gap) : "") : y ? "OUT" : "—"],
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
  return {
    FLY_MS, isAutomation, CARD_MS, SHORT_FLY_MS, SKIP_GRACE_MS, SKIP_STREAK, FLY_MAX_MS,
    flyMsFor, packSettled, warmPresentReady, metaRows, nextSkips,
    CARD, CARD_KEYS, clampCard, cardPristine, cardVars,
    isGridShot, gridField, gridLayout, gridColour, gridInk, GRID_ROW_MIN,
  };
})();
Object.freeze(LoadingCard);
