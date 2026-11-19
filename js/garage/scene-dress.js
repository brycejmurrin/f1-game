const GarageDress = (function () {
  "use strict";
  const { HALF_W, Z_BACK, Z_DOOR, scale, rgb, css } = GaragePrims;

function seatDriverAt(team, idx) {
  if (!team) return null;
  const i = idx | 0;
  const over = (typeof Career !== "undefined" && Career.driverOverride)
    ? Career.driverOverride(team.id, i) : null;
  if (over) return over;
  const seats = (typeof Career !== "undefined" && Career.gridDrivers)
    ? (Career.gridDrivers(team) || team.drivers) : team.drivers;
  return (seats && seats[i]) || (seats && seats[0]) || null;
}
let _boardInfo = null, _boardInfoKey = "";
function boardInfo(team, getParts, driverIdx, ctx) {
  if (typeof Parts === "undefined" || typeof getParts !== "function") return null;
  const rev = (typeof GameStore !== "undefined" && GameStore.store) ? GameStore.store.rev : 0;
  const owned = typeof Career !== "undefined" && Career.owned && team && Career.owned(team.id);
  const unlimited = !owned && !!(ctx && ctx.unlimited);
  const tdev = owned && Career.data ? ((Career.data().tdev || {})[team.id] || 0) : 0;
  const capStamp = owned ? ("C" + Career.budget() + ":" + tdev) : unlimited ? "U" : "F";
  const stamp = (team && team.id) + "|" + (driverIdx | 0) + "|" + rev + "|" + capStamp;
  if (_boardInfo && stamp === _boardInfoKey) return _boardInfo;
  try {
    const tune = typeof SetupTune !== "undefined" ? SetupTune.mods(team.id) : null;
    const r = Parts.resolveSetup(getParts(team.id), team, tune);
    const base = GarageExperience.statsOf(team) || { speed: 85, accel: 85, cornering: 85, braking: 85 };
    const stats = Parts.STAT_KEYS.map((k) => {
      const b = base[k.key] || 75;
      const value = Math.round(Parts.displayStat(b * r.mods[k.key]));
      return { value, delta: value - b };
    });
    const spec = Parts.CATALOG.map((cat) => {
      const opt = r.options[cat.id];
      return { cat: String(cat.label || cat.id).toUpperCase(), label: (opt && opt.label) || "Stock" };
    });
    const drv = seatDriverAt(team, driverIdx) || {};
    const cap = owned ? Career.budget() : Parts.BUDGET;
    _boardInfo = { stats, spec, driver: drv, budget: cap, unlimited,
             left: unlimited ? 0 : Math.max(0, cap - (r.cost || 0)) };
    _boardInfoKey = stamp;
    return _boardInfo;
  } catch (e) {
    Log.warn("game", `GarageScene boardInfo failed: ${e && e.message}`);
    _boardInfo = null; _boardInfoKey = "";
    return null;
  }
}
function boardKey(info) {
  if (!info) return "-";
  let k = `${info.unlimited ? "U" : info.left}|${info.driver.num == null ? "-" : info.driver.num}`;
  for (let i = 0; i < info.stats.length; i++) k += `|${info.stats[i].value}`;
  for (let i = 0; i < info.spec.length; i++) k += `|${info.spec[i].label}`;
  return k;
}

const DRESS = 1024;
const D_CREST = { x: 0, y: 0, w: 512, h: 512 };
const D_WORD  = { x: 512, y: 0, w: 512, h: 128 };
const D_BOARD = { x: 512, y: 160, w: 256, h: 352 };
const D_SCREEN = { x: 0, y: 512, w: 512, h: 256 };
const D_STATS  = { x: 512, y: 512, w: 512, h: 256 };
const D_DRIVER = { x: 768, y: 128, w: 256, h: 256 };
const D_SPEC   = { x: 0, y: 768, w: 512, h: 256 };
const D_BUDGET = { x: 512, y: 768, w: 512, h: 128 };
const D_SIGN = { x: 768, y: 384, w: 256, h: 128 };
const D_STRAT = { x: 512, y: 896, w: 512, h: 128 };

function paintDress(team, liv, info) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = DRESS;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, DRESS, DRESS);
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
  let sig = 0;
  for (let i = 0; i < String(team && team.id || "").length; i++)
    sig = (sig * 31 + String(team.id).charCodeAt(i)) & 0xffff;
  const img = LiveryTex.LOGOS && LiveryTex.LOGOS[team.id];
  const onField = (img && img._avg) ? [img._avg]
    : (LiveryTex.markOnField ? LiveryTex.markOnField(team.id, liv) : null);
  const tinted = scale(c1, 0.30);
  const worstOn = (f) => onField.reduce(
    (m, c) => Math.min(m, LiveryTex.contrast(c, f)), Infinity);
  const field = (onField && onField.length && LiveryTex.contrast && worstOn(tinted) < 2.2)
    ? (LiveryTex.inkOn ? LiveryTex.inkOn(onField) : [0.93, 0.94, 0.96]) : tinted;
  ctx.fillStyle = css(field); ctx.fillRect(D_CREST.x, D_CREST.y, D_CREST.w, D_CREST.h);
  ctx.strokeStyle = css(c2); ctx.lineWidth = 9;
  ctx.strokeRect(D_CREST.x + 12, D_CREST.y + 12, D_CREST.w - 24, D_CREST.h - 24);
  const inner = { x: D_CREST.x + 40, y: D_CREST.y + 40, w: D_CREST.w - 80, h: D_CREST.h - 80 };
  if (LiveryTex.paintTeamMark) {
    const halo = (img && img._avg && LiveryTex.contrast && LiveryTex.contrast(img._avg, field) < 2.6 && LiveryTex.inkOn)
      ? LiveryTex.inkOn([img._avg]) : null;
    LiveryTex.paintTeamMark(ctx, team.id, liv, inner, field, { fullLockup: true, halo });
  }
  ctx.fillStyle = css(scale(c1, 0.55)); ctx.fillRect(D_WORD.x, D_WORD.y, D_WORD.w, D_WORD.h);
  ctx.fillStyle = css(c2); ctx.fillRect(D_WORD.x, D_WORD.y + D_WORD.h - 9, D_WORD.w, 9);
  const wordMark = { x: D_WORD.x + 12, y: D_WORD.y + 16, w: 96, h: 96 };
  if (LiveryTex.paintTeamMark) {
    LiveryTex.paintTeamMark(ctx, team.id, liv, wordMark, [c1, c2], {});
  }
  ctx.fillStyle = "#f2f3f5";
  ctx.font = "700 48px system-ui, sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(String(team.name || team.short || "").toUpperCase(),
    D_WORD.x + 120, D_WORD.y + D_WORD.h / 2 - 4, D_WORD.w - 136);
  ctx.fillStyle = "#0a0b0d"; ctx.fillRect(D_BOARD.x, D_BOARD.y, D_BOARD.w, D_BOARD.h);
  ctx.fillStyle = css(c1); ctx.fillRect(D_BOARD.x, D_BOARD.y, D_BOARD.w, 56);
  ctx.fillStyle = "#f4f5f7"; ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText(String(team.short || ""), D_BOARD.x + D_BOARD.w / 2, D_BOARD.y + 29);
  const drv = [seatDriverAt(team, 0), seatDriverAt(team, 1)];
  for (let i = 0; i < 2; i++) {
    const d = drv[i] || {}, top = D_BOARD.y + 78 + i * 140;
    ctx.fillStyle = "#f4f5f7"; ctx.font = "700 88px system-ui, sans-serif";
    ctx.fillText(d.num == null ? "--" : String(d.num), D_BOARD.x + D_BOARD.w / 2, top + 46);
    ctx.fillStyle = css(c2); ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText(String(d.code || ""), D_BOARD.x + D_BOARD.w / 2, top + 108);
  }
  ctx.fillStyle = "#05070a"; ctx.fillRect(D_SCREEN.x, D_SCREEN.y, D_SCREEN.w, D_SCREEN.h);
  for (let t = 0; t < 6; t++) {
    const tx = D_SCREEN.x + (t % 3) * (D_SCREEN.w / 3), ty = D_SCREEN.y + ((t / 3) | 0) * (D_SCREEN.h / 2);
    const tw = D_SCREEN.w / 3 - 6, th = D_SCREEN.h / 2 - 6;
    ctx.fillStyle = "#0b1016"; ctx.fillRect(tx + 3, ty + 3, tw, th);
    const tSeed = (sig + t * 7) % 32;
    ctx.strokeStyle = t % 2 ? css(c2) : "#e2a33c"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 22; k++) {
      const px = tx + 8 + (tw - 16) * (k / 22);
      const py = ty + th * 0.55
        - Math.sin(k * (0.55 + tSeed * 0.035) + t + tSeed) * th * 0.20
        - Math.sin(k * 0.31 + tSeed) * th * 0.07
        - (k % (3 + (tSeed % 4))) * 1.4;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,150,175,0.22)"; ctx.lineWidth = 1;
    for (let gl = 1; gl < 4; gl++) {
      ctx.beginPath(); ctx.moveTo(tx + 6, ty + th * (gl / 4)); ctx.lineTo(tx + tw, ty + th * (gl / 4)); ctx.stroke();
    }
  }
  {
    const R = D_STRAT;
    ctx.fillStyle = "#07090c"; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.fillStyle = css(c1); ctx.fillRect(R.x, R.y, R.w, 26);
    const hi = c1[0] * 0.30 + c1[1] * 0.59 + c1[2] * 0.11 > 0.55;
    ctx.fillStyle = hi ? "#0a0b0d" : "#f4f5f7";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("RACE PLAN", R.x + 12, R.y + 13);
    ctx.textAlign = "right";
    ctx.fillText(String(team.short || team.name || "").toUpperCase(), R.x + R.w - 12, R.y + 13);
    const h = sig;
    const COMP = [["SOFT", "#d8443c"], ["MED", "#d8b23c"], ["HARD", "#d8d8d8"]];
    for (let r = 0; r < 3; r++) {
      const y = R.y + 44 + r * 28, c = COMP[(h + r * 2 + (r === 1 ? 1 : 0)) % 3];
      ctx.fillStyle = "#101720"; ctx.fillRect(R.x + 10, y - 11, R.w - 20, 22);
      ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(R.x + 28, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c8d4de"; ctx.font = "600 15px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`STINT ${r + 1}   ${c[0]}`, R.x + 46, y);
      ctx.textAlign = "right"; ctx.fillStyle = css(c2);
      ctx.fillText(`${12 + ((h >> (r * 3)) & 7) * 3} LAPS`, R.x + R.w - 18, y);
    }
  }
  ctx.clearRect(D_SIGN.x, D_SIGN.y, D_SIGN.w, D_SIGN.h);
  ctx.fillStyle = "#e9ecef"; ctx.font = "700 30px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(team.name || team.short || "").toUpperCase(),
    D_SIGN.x + D_SIGN.w / 2, D_SIGN.y + D_SIGN.h / 2, D_SIGN.w - 16);
  return { canvas: cv };
}
function paintBoards(cv, team, liv, info) {
  if (!info) return;
  const ctx = cv.getContext("2d");
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
  const panel = (R, title) => {
    ctx.fillStyle = "#0a0c10"; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.fillStyle = css(scale(c1, 0.75)); ctx.fillRect(R.x, R.y, R.w, 44);
    ctx.fillStyle = "#f2f3f5"; ctx.font = "700 27px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(title, R.x + 18, R.y + 23);
    ctx.textAlign = "center";
  };
  panel(D_STATS, "CAR PERFORMANCE");
  const keys = Parts.STAT_KEYS;
  for (let i = 0; i < keys.length; i++) {
    const st = info.stats[i], y = D_STATS.y + 74 + i * 46;
    ctx.textAlign = "left"; ctx.fillStyle = "#9aa4b2"; ctx.font = "700 21px system-ui, sans-serif";
    ctx.fillText(keys[i].label, D_STATS.x + 18, y);
    const bx = D_STATS.x + 168, bw = 250;
    ctx.fillStyle = "#191d24"; ctx.fillRect(bx, y - 11, bw, 22);
    ctx.fillStyle = css(c2);
    ctx.fillRect(bx, y - 11, Math.max(2, bw * Math.min(1, st.value / 120)), 22);
    ctx.textAlign = "right"; ctx.fillStyle = "#f2f3f5"; ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(String(st.value), D_STATS.x + D_STATS.w - 66, y);
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillStyle = st.delta > 0 ? "#4ad07a" : st.delta < 0 ? "#e2645a" : "#6b7480";
    ctx.fillText(st.delta > 0 ? "+" + st.delta : String(st.delta), D_STATS.x + D_STATS.w - 14, y);
    ctx.textAlign = "center";
  }
  panel(D_BUDGET, "BUDGET");
  ctx.textAlign = "left"; ctx.fillStyle = "#f2f3f5"; ctx.font = "700 40px system-ui, sans-serif";
  if (info.unlimited) {
    ctx.fillText("FREE BUILD", D_BUDGET.x + 18, D_BUDGET.y + 84);
    ctx.fillStyle = "#8f98a6"; ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText("NO BUDGET LIMIT", D_BUDGET.x + 18, D_BUDGET.y + 118);
  } else {
    ctx.fillText(`${info.left} cr`, D_BUDGET.x + 18, D_BUDGET.y + 84);
    ctx.fillStyle = "#8f98a6"; ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(`OF ${info.budget} REMAINING`, D_BUDGET.x + 190, D_BUDGET.y + 88);
    const rw = D_BUDGET.w - 36;
    ctx.fillStyle = "#191d24"; ctx.fillRect(D_BUDGET.x + 18, D_BUDGET.y + 104, rw, 12);
    ctx.fillStyle = css(c2);
    ctx.fillRect(D_BUDGET.x + 18, D_BUDGET.y + 104, rw * Math.max(0, Math.min(1, info.left / info.budget)), 12);
  }
  ctx.textAlign = "center";
  panel(D_DRIVER, "DRIVER");
  ctx.fillStyle = css(c2); ctx.font = "700 96px system-ui, sans-serif";
  ctx.fillText(info.driver.num == null ? "--" : String(info.driver.num),
    D_DRIVER.x + D_DRIVER.w / 2, D_DRIVER.y + 122);
  ctx.fillStyle = "#f2f3f5"; ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(String(info.driver.code || ""), D_DRIVER.x + D_DRIVER.w / 2, D_DRIVER.y + 180);
  ctx.fillStyle = "#9aa4b2"; ctx.font = "600 19px system-ui, sans-serif";
  ctx.fillText(String(info.driver.name || ""), D_DRIVER.x + D_DRIVER.w / 2, D_DRIVER.y + 218, D_DRIVER.w - 20);
  panel(D_SPEC, "FITTED SPEC");
  for (let i = 0; i < info.spec.length && i < 12; i++) {
    const col = i < 6 ? 0 : 1, row = i % 6;
    const sx = D_SPEC.x + 16 + col * (D_SPEC.w / 2), sy = D_SPEC.y + 74 + row * 30;
    const changed = lastSpec && lastSpec[i] !== undefined && lastSpec[i] !== info.spec[i].label;
    ctx.textAlign = "left";
    if (changed) { ctx.fillStyle = css(c2); ctx.fillRect(sx - 8, sy - 11, 4, 22); }
    ctx.fillStyle = changed ? css(c2) : "#79828f"; ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillText(info.spec[i].cat, sx, sy);
    ctx.fillStyle = "#e8eaee"; ctx.font = "600 17px system-ui, sans-serif";
    ctx.fillText(info.spec[i].label, sx + 92, sy, D_SPEC.w / 2 - 112);
    ctx.textAlign = "center";
  }
  lastSpec = info.spec.map((s) => s.label);
}
let lastSpec = null;

function uvOf(r) {
  return { uL: r.x / DRESS, uR: (r.x + r.w) / DRESS, vT: 1 - r.y / DRESS, vB: 1 - (r.y + r.h) / DRESS };
}
function dquad(out, c, n, region) {
  const u = uvOf(region), i = out.pos.length / 3;
  const uvs = [[u.uL, u.vB], [u.uR, u.vB], [u.uR, u.vT], [u.uL, u.vT]];
  for (let k = 0; k < 4; k++) {
    out.pos.push(c[k][0], c[k][1], c[k][2]);
    out.nrm.push(n[0], n[1], n[2]);
    out.uv.push(uvs[k][0], uvs[k][1]);
  }
  out.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
function buildDress(SIDES) {
  const g = {};
  for (let i = 0; i < SIDES.length; i++) g[SIDES[i]] = { pos: [], nrm: [], uv: [], idx: [] };
  const zb = Z_BACK + 0.03, zd = Z_DOOR - 0.03, xw = HALF_W - 0.03;
  dquad(g.back, [[-1.45, 1.30, zb], [1.45, 1.30, zb], [1.45, 3.50, zb], [-1.45, 3.50, zb]], [0, 0, 1], D_CREST);
  dquad(g.back, [[-2.6, 0.42, zb], [2.6, 0.42, zb], [2.6, 1.15, zb], [-2.6, 1.15, zb]], [0, 0, 1], D_WORD);
  dquad(g.back, [[4.30, 1.74, -6.085], [5.10, 1.74, -6.085], [5.10, 2.86, -6.085], [4.30, 2.86, -6.085]], [0, 0, 1], D_BOARD);
  dquad(g.back, [[-5.16, 2.26, -6.085], [-4.24, 2.26, -6.085], [-4.24, 2.58, -6.085], [-5.16, 2.58, -6.085]], [0, 0, 1], D_STRAT);
  const wordZ = [[-4.6, -2.4], [-1.1, 1.1], [2.4, 4.6]];
  for (let i = 0; i < wordZ.length; i++) {
    const z0 = wordZ[i][0], z1 = wordZ[i][1];
    if (i > 0) dquad(g.nx, [[-xw, 3.10, z1], [-xw, 3.10, z0], [-xw, 3.60, z0], [-xw, 3.60, z1]], [1, 0, 0], D_WORD);
    if (i > 0) dquad(g.px, [[xw, 3.10, z0], [xw, 3.10, z1], [xw, 3.60, z1], [xw, 3.60, z0]], [-1, 0, 0], D_WORD);
  }
  dquad(g.nx, [[-xw, 1.60, -2.40], [-xw, 1.60, -5.40], [-xw, 3.10, -5.40], [-xw, 3.10, -2.40]], [1, 0, 0], D_STATS);
  dquad(g.nx, [[-xw, 0.69, -2.40], [-xw, 0.69, -5.40], [-xw, 1.44, -5.40], [-xw, 1.44, -2.40]], [1, 0, 0], D_BUDGET);
  dquad(g.back, [[1.70, 1.75, zb], [3.70, 1.75, zb], [3.70, 3.75, zb], [1.70, 3.75, zb]], [0, 0, 1], D_DRIVER);
  dquad(g.back, [[-4.10, 2.15, zb], [-1.70, 2.15, zb], [-1.70, 3.35, zb], [-4.10, 3.35, zb]], [0, 0, 1], D_SPEC);
  dquad(g.mid, [[-2.30, 0.004, -4.15], [2.30, 0.004, -4.15], [2.30, 0.004, -5.95], [-2.30, 0.004, -5.95]],
    [0, 1, 0], D_SIGN);
  dquad(g.mid, [[-2.30, 0.004, 5.90], [2.30, 0.004, 5.90], [2.30, 0.004, 4.10], [-2.30, 0.004, 4.10]],
    [0, 1, 0], D_SIGN);
  dquad(g.door, [[2.66, 4.83, 6.205], [-2.66, 4.83, 6.205], [-2.66, 4.99, 6.205], [2.66, 4.99, 6.205]], [0, 0, -1], D_SIGN);
  dquad(g.nx, [[-5.18, 1.10, 2.15], [-5.18, 1.10, -0.95], [-5.18, 2.65, -0.95], [-5.18, 2.65, 2.15]], [1, 0, 0], D_SCREEN);
  dquad(g.door, [[4.20, 1.40, zd], [5.20, 1.40, zd], [5.20, 2.75, zd], [4.20, 2.75, zd]], [0, 0, -1], D_BOARD);
  dquad(g.shutter, [[2.3, 2.60, 6.24], [-2.3, 2.60, 6.24], [-2.3, 3.20, 6.24], [2.3, 3.20, 6.24]], [0, 0, -1], D_WORD);
  return g;
}

const { block, cyl, tube, tile, lookCol, CEIL_Y, MAT } = GaragePrims;
const livCols = (liv) => [rgb(liv && liv.c1, [0.30, 0.32, 0.36]), rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.55, 0.57, 0.62])];
function lookWall(L, liv) {
  const [c1, c2] = livCols(liv), W = L.wall;
  const dado = lookCol(W.dado, c1, c2), stripe = lookCol(W.stripe, c1, c2), panel = lookCol(W.panel, c1, c2);
  const back = W.back ? lookCol(W.back, c1, c2) : null;
  const bands = [[0, 0.12, 1, W.skirt], [0.12, 1.50, 2], [1.50, 1.62, 1]];
  if (W.seam === "block") {
    const mortar = scale(panel, 0.62);
    for (let y = 1.62; y < CEIL_Y - 0.01; y += 0.20) {
      const y1 = Math.min(CEIL_Y, y + 0.18);
      bands.push([y, y1, 1]);
      if (y1 < CEIL_Y) bands.push([y1, Math.min(CEIL_Y, y1 + 0.02), 1, mortar]);
    }
  } else bands.push([1.62, CEIL_Y, 4]);
  const wallAt = (y, isBack) => (isBack && back ? (y < 0.12 ? W.skirt : back) : y < 1.4995 ? dado : y < 1.6205 ? stripe : panel);
  const seamed = (col) => col;
  return { bands, wallAt, seamed, ceil: L.ceil, mat: L.wall.mat != null ? L.wall.mat : MAT.FLAT };
}
function lookFloorCols(L, liv) {
  const [c1, c2] = livCols(liv), F = L.floor;
  return { SLAB: lookCol(F.slab, c1, c2), IN: lookCol(F.inner, c1, c2), PAINT: lookCol(F.paint, c1, c2),
           WALK: lookCol(F.walk, c1, c2), band: lookCol(F.band, c1, c2), key: lookCol(F.key, c1, c2) };
}
function lookFloor(out, liv, L) {
  const [c1, c2] = livCols(liv), F = L.floor;
  const oc = F.outline ? lookCol(F.outline, c1, c2) : null;
  const Y = 0.003, M = MAT.ASPHALT, T = 0.05;
  if (oc) {
    const X0 = -1.15, X1 = 1.15, Z0 = -3.05, Z1 = 3.55;
    tile(out, X0, X1, Z0, Z0 + T, oc, Y, M); tile(out, X0, X1, Z1 - T, Z1, oc, Y, M);
    tile(out, X0, X0 + T, Z0, Z1, oc, Y, M); tile(out, X1 - T, X1, Z0, Z1, oc, Y, M);
    for (const [wx, wz] of [[1.62, 1.7], [-1.62, 1.7], [1.62, -1.6], [-1.62, -1.6]]) {
      tile(out, wx - 0.30, wx + 0.30, wz - 0.03, wz + 0.03, oc, Y, M);
      tile(out, wx - 0.03, wx + 0.03, wz - 0.30, wz + 0.30, oc, Y, M);
    }
  }
  if (L.ceilLed === "pendants") {
    const yel = [0.85, 0.66, 0.06], blk = [0.05, 0.05, 0.05];
    for (let i = 0; i < 18; i++) {
      const x = -2.7 + i * 0.30;
      tile(out, x, x + 0.30, Z_DOOR - 0.75, Z_DOOR - 0.30, i % 2 ? yel : blk, Y, M);
    }
  }
  if (L.floor && L.floor.wetBands) {
    const wet = [0.55, 0.60, 0.66];
    for (const z of [-2.2, 0.2, 2.4])
      tile(out, -0.95, 0.95, z - 0.08, z + 0.08, wet, Y + 0.001, M);
  }
}
function lookTruss(out, L) {
  if (!L || L.truss === "stock") return false;
  if (L.truss === "rails") {
    for (const s of [-1, 1]) {
      block(out, s * 2.6, CEIL_Y - 0.12, 0, 0.035, 0.035, (Z_DOOR - Z_BACK) / 2 - 0.3, GREY_RAIL);
      for (let z = -5.0; z <= 5.01; z += 2.5) block(out, s * 2.6, CEIL_Y - 0.0425, z, 0.008, 0.0425, 0.008, GREY_RAIL);
    }
    return true;
  }
  const ST = [0.20, 0.21, 0.23], lo = CEIL_Y - 0.95, hi = CEIL_Y - 0.12;
  for (const z of [-4.8, -1.6, 1.6, 4.8]) {
    block(out, 0, lo, z, HALF_W, 0.05, 0.07, ST, MAT.METAL);
    block(out, 0, hi, z, HALF_W, 0.05, 0.07, ST, MAT.METAL);
    for (let i = 0; i < 10; i++) {
      const xa = -HALF_W + 0.05 + i * ((HALF_W * 2 - 0.1) / 10), xb = xa + (HALF_W * 2 - 0.1) / 10;
      tube(out, [xa, i % 2 ? hi : lo, z], [xb, i % 2 ? lo : hi, z], 0.035, ST, 6, MAT.METAL);
    }
  }
  for (const x of [-3.6, -1.2, 1.2, 3.6]) block(out, x, (hi + 0.05 + CEIL_Y) / 2, 0, 0.05, (CEIL_Y - hi - 0.05) / 2, (Z_DOOR - Z_BACK) / 2, ST, MAT.METAL);
  return true;
}
const GREY_RAIL = [0.55, 0.56, 0.60];
function lookProps(g, liv, L) {
  if (L.wall.seam !== "joint") return;
  const J = [0.10, 0.105, 0.115], p = L.wall.jointPitch || 1.35;
  const d = 0.006, h = (CEIL_Y - 0.12) / 2, cy = 0.12 + h;
  for (let z = Z_BACK + p; z < Z_DOOR - 0.2; z += p)
    for (const s of [-1, 1]) block(s < 0 ? g.nx : g.px, s * (HALF_W - d), cy, z, d, h, 0.008, J);
  for (let x = -HALF_W + p; x < HALF_W - 0.2; x += p) block(g.back, x, cy, Z_BACK + d, 0.008, h, d, J);
  for (const y of [1.66, 2.70]) {
    for (const s of [-1, 1]) block(s < 0 ? g.nx : g.px, s * (HALF_W - d), y, 0, d, 0.008, HALF_W + 1.0, J);
    block(g.back, 0, y, Z_BACK + d, HALF_W, 0.008, d, J);
  }
}
function lookLed(g, liv, L) {
  const [c1, c2] = livCols(liv), zb = Z_BACK + 0.008;
  if (L.ceilLed === "grid") {
    for (const x of [-2.0, 2.0]) for (let i = -2; i <= 2; i++) {
      const z = i * 2.4;
      block(g.mid, x, CEIL_Y - 0.02, z, 0.34, 0.02, 0.34, GREY(0.30));
      block(g.mid, x, CEIL_Y - 0.045, z, 0.30, 0.005, 0.30, [1.12, 1.12, 1.16]);
    }
  } else if (L.ceilLed === "strips") {
    for (const x of [-1.4, 1.4]) {
      block(g.mid, x, CEIL_Y - 0.02, 0, 0.07, 0.02, (Z_DOOR - Z_BACK) / 2, GREY(0.03));
      const lens = L.hotStrips ? [1.15, 1.20, 1.35] : [0.95, 1.05, 1.20];
      block(g.mid, x, CEIL_Y - 0.045, 0, 0.035, 0.005, (Z_DOOR - Z_BACK) / 2 - 0.05, lens);
    }
  } else if (L.ceilLed === "pendants") {
    for (const x of [-2.2, 2.2]) for (const z of [-4.0, 0, 4.0]) {
      cyl(g.mid, x, 3.95, z, 0.012, CEIL_Y - 3.95, GREY(0.05), 4);
      cyl(g.mid, x, 3.80, z, 0.30, 0.16, [0.10, 0.16, 0.12], 12);
      block(g.mid, x, 3.79, z, 0.20, 0.01, 0.20, [1.18, 1.05, 0.80]);
    }
  }
  if (L.wall.seam === "slat") {
    for (const s of [-1, 1]) for (const z of [-6.0, -1.7, 3.0, 5.9])
      block(s < 0 ? g.nx : g.px, s * (HALF_W - 0.015), 1.55, z, 0.015, 1.40, 0.035, scale(c2, 1.3));
  }
  if (L.backWall === "frame") {
    const fc = scale(c2, 1.25), X = HALF_W - 0.25;
    for (const y of [0.18, 4.55]) block(g.back, 0, y, zb, X, 0.03, 0.008, fc);
    for (const sx of [-1, 1]) block(g.back, sx * X, 2.365, zb, 0.03, 2.215, 0.008, fc);
  } else if (L.backWall === "header") {
    block(g.back, 0, 3.92, zb, HALF_W, 0.20, 0.008, scale(c1, 1.05));
    block(g.back, 0, 3.70, zb, HALF_W, 0.015, 0.008, scale(c2, 1.2));
  }
}
const GREY = (v) => [v, v * 1.01, v * 1.05];

  function resetSpec() { lastSpec = null; }
  function releaseDress() { lastSpec = null; _boardInfo = null; _boardInfoKey = ""; }

  return { seatDriverAt, boardInfo, boardKey, paintDress, paintBoards, buildDress, resetSpec, releaseDress,
    lookWall, lookFloorCols, lookFloor, lookTruss, lookProps, lookLed };
})();

Object.freeze(GarageDress);
