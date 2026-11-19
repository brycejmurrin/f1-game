"use strict";
const LoadingCard = (function () {
  const FLY_MS = 20000;
  function isAutomation() {
    try {
      if (typeof navigator === "undefined" || !navigator || navigator.webdriver !== true) return false;
      if (typeof window !== "undefined" && window && window.__apexFullIntro === true) return false;
      if (typeof DevFlags !== "undefined" && DevFlags.get("fullIntro")) return false;
      return true;
    } catch (_) { return false; }
  }
  const CARD_MS = 700;
  const SHORT_FLY_MS = 10000;
  const SKIP_GRACE_MS = 400;
  const SKIP_STREAK = 3;
  const FLY_MAX_MS = 60000;
  function flyMsFor(skips, wantMs, warmReady) {
    const ready = warmReady === undefined || warmReady === null ? true
      : !!(typeof warmReady === "object" ? warmReady.warmReady !== false : warmReady);
    const n = Number.isFinite(+skips) ? +skips : 0;
    if (n >= SKIP_STREAK && ready) return SHORT_FLY_MS;
    const want = Number.isFinite(+wantMs) ? +wantMs : 0;
    return Math.min(FLY_MAX_MS, Math.max(FLY_MS, Math.round(want)));
  }

  function packSettled(s) {
    return !s || s.supported === false || !!s.uploaded || !!s.error || s.tier === "off";
  }
  function warmPresentReady(assetsState) { return packSettled(assetsState); }

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
  function nextSkips(skips, skipped) {
    const n = Number.isFinite(+skips) && +skips > 0 ? Math.floor(+skips) : 0;
    return skipped ? Math.min(n + 1, 99) : 0;
  }

  const CARD = Object.freeze({
    scale: { label: "CARD SIZE", min: 0.6, max: 1.6, step: 0.02, unit: "x", def: 1 },
    x: { label: "CARD X", min: -40, max: 40, step: 1, unit: " vw", def: 0 },
    y: { label: "CARD Y", min: -70, max: 6, step: 1, unit: " vh", def: 0 },
  });
  const CARD_KEYS = Object.freeze(Object.keys(CARD));

  function clampCard(geom) {
    const out = {};
    for (const k of CARD_KEYS) {
      const d = CARD[k];
      const v = geom && Number.isFinite(+geom[k]) ? +geom[k] : d.def;
      out[k] = Math.min(d.max, Math.max(d.min, v));
    }
    return out;
  }

  function cardPristine(geom) {
    const g = clampCard(geom);
    return CARD_KEYS.every((k) => g[k] === CARD[k].def);
  }

  function cardVars(geom) {
    const g = clampCard(geom);
    return {
      "--ld-card-scale": String(g.scale),
      "--ld-card-x": g.x + "vw",
      "--ld-card-y": g.y + "svh",
    };
  }

  const GRID_ROW_MIN = 20, GRID_CHIP_MIN = 30, GRID_PAD = 4, GRID_GAP = 3, GRID_BLOCK_GAP = 8, GRID_MAX_BLOCKS = 3;
  const isGridShot = (id) => typeof id === "string" && id.indexOf("grid") === 0;
  function gridField(grid) {
    if (!Array.isArray(grid) || grid.length < 2) return null;
    let mine = -1;
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] || typeof grid[i] !== "object") return null;
      if (grid[i].isPlayer) { if (mine >= 0) return null; mine = i; }
    }
    return mine < 0 ? null : grid;
  }
  function gridFit(n, w, h, blocks) {
    const rows = Math.max(1, Math.ceil(Math.ceil(n / 2) / blocks));
    const rowH = (h - 2 * GRID_PAD) / (rows + 0.5);
    const colW = (w - 2 * GRID_PAD - blocks * GRID_GAP - (blocks - 1) * GRID_BLOCK_GAP) / (2 * blocks);
    return { blocks, rows, rowH, colW, fit: Math.min(rowH / GRID_ROW_MIN, colW / GRID_CHIP_MIN) };
  }
  function gridLayout(grid, w, h, player) {
    const n = Array.isArray(grid) ? grid.length : 0;
    let best = null;
    for (let b = 1; b <= GRID_MAX_BLOCKS; b++) {
      const f = gridFit(n, w, h, b);
      if (f.fit >= 1) { best = f; break; }
      if (!best || f.fit > best.fit + 1e-9) best = f;
      if (f.rows <= 1) break;
    }
    const { blocks, rows, rowH, colW } = best;
    const me = player >= 0 && player < n ? player : -1;
    const boxH = rowH * 0.82;
    let font = Math.max(8, Math.min(14, Math.round(boxH * 0.62)));
    const withPos = Math.min(font, Math.floor((colW - 8) / 3.65));
    const showPos = withPos >= 10;
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
  function gridColour(col) {
    if (typeof col === "string" && col) return col;
    if (!Array.isArray(col) || col.length < 3 || !col.slice(0, 3).every((v) => Number.isFinite(+v))) return "#e10600";
    let [r, g, b] = col.slice(0, 3).map((v) => Math.max(0, Math.min(1, +v)));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 0.18) { const k = 0.45; r += (1 - r) * k; g += (1 - g) * k; b += (1 - b) * k; }
    return "rgb(" + [r, g, b].map((v) => Math.round(v * 255)).join(",") + ")";
  }
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
