/* Apex 26 — GarageLive: the garage's LIVE atlas. The timing screen's track map, the telemetry traces, the next-race
   sign and its flag, the sponsor banners, the gantry LCDs, the contact shadow and the lamp pools — everything that
   follows the game rather than the team, repainted per circuit or career round. */
const GarageLive = (function () {
  "use strict";
  const { HALF_W, scale, rgb, css } = GaragePrims;
  const { SCREEN, GANTRY } = GarageEquipment;

// ── atlas layout ───────────────────────────────────────────────────────────
// A SECOND, smaller atlas next to the 1024 team dress on purpose: that one
// repaints on a team or paint change and is full; this one is 512 and can be
// repainted per circuit or per career round for a quarter of the upload.
const LIVE = 512;
const L_MAP    = { x: 0,   y: 0,   w: 256, h: 200 };
const L_TRACE  = { x: 256, y: 0,   w: 256, h: 128 };
const L_SHADOW = { x: 256, y: 128, w: 128, h: 128 };
const L_POOL   = { x: 384, y: 128, w: 128, h: 128 };
const L_BANNER = [{ x: 0, y: 256, w: 512, h: 64 }, { x: 0, y: 320, w: 512, h: 64 }];
const L_FLAG   = { x: 0,   y: 384, w: 128, h: 64 };
const L_RACE   = { x: 128, y: 384, w: 384, h: 64 };
const L_GANTRY = { x: 0,   y: 448, w: 256, h: 64 };   // three hung LCD faces
const L_SPILL  = { x: 256, y: 448, w: 128, h: 64 };   // soft screen spill onto the desk
const L_REFLECT = { x: 384, y: 448, w: 128, h: 64 };  // subtle epoxy reflection sheen
// Flags as stripes: [orientation, colours...]; "h" stacks top to bottom, "v"
// runs left to right. Enough to read as the country at 0.4 m on a wall.
const FLAGS = {
  Argentina: ["h", "#74acdf", "#fff", "#74acdf"], Australia: ["h", "#00247d", "#00247d"],
  Austria: ["h", "#ed2939", "#fff", "#ed2939"], Azerbaijan: ["h", "#00b5e2", "#ef3340", "#509e2f"],
  Bahrain: ["v", "#fff", "#ce1126", "#ce1126", "#ce1126"], Belgium: ["v", "#000", "#fae042", "#ed2939"],
  Brazil: ["h", "#009c3b", "#ffdf00", "#009c3b"], Canada: ["v", "#ff0000", "#fff", "#ff0000"],
  China: ["h", "#de2910", "#de2910"], France: ["v", "#0055a4", "#fff", "#ef4135"],
  Germany: ["h", "#000", "#dd0000", "#ffce00"], Hungary: ["h", "#ce2939", "#fff", "#477050"],
  Italy: ["v", "#009246", "#fff", "#ce2b37"], Japan: ["h", "#fff", "#bc002d", "#fff"],
  Malaysia: ["h", "#cc0001", "#fff", "#cc0001", "#fff"], Mexico: ["v", "#006847", "#fff", "#ce1126"],
  Monaco: ["h", "#ce1126", "#fff"], Netherlands: ["h", "#ae1c28", "#fff", "#21468b"],
  Portugal: ["v", "#006600", "#ff0000", "#ff0000"], Qatar: ["v", "#fff", "#8a1538", "#8a1538", "#8a1538"],
  Russia: ["h", "#fff", "#0039a6", "#d52b1e"], "Saudi Arabia": ["h", "#006c35", "#006c35"],
  Singapore: ["h", "#ef3340", "#fff"], "South Africa": ["h", "#de3831", "#fff", "#007a4d", "#fff", "#002395"],
  Spain: ["h", "#aa151b", "#f1bf00", "#f1bf00", "#aa151b"], Turkey: ["h", "#e30a17", "#e30a17"],
  UAE: ["h", "#00732f", "#fff", "#000"], UK: ["h", "#012169", "#fff", "#c8102e", "#fff", "#012169"],
  USA: ["h", "#b22234", "#fff", "#b22234", "#fff", "#b22234", "#fff", "#b22234"],
};
const NO_FLAG = ["h", "#555", "#888"];
const FALLBACK_SPONSORS = ["APEX 26", "PIT LANE", "PADDOCK", "GRID"];

const bodyColour = (liv) => rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
const accentColour = (liv) => rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
const trackName = (track) => String(track.name || track.id).toUpperCase();

// A radial fill of cell R centred at (mid-x, R.y + R.h * cyFrac).
function radialCell(c, R, cyFrac, r0, r1, stops) {
  const cx = R.x + R.w / 2, cy = R.y + R.h * cyFrac;
  const gr = c.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const [at, col] of stops) gr.addColorStop(at, col);
  c.fillStyle = gr; c.fillRect(R.x, R.y, R.w, R.h);
}

// ── painting ───────────────────────────────────────────────────────────────
// ctx (all optional): { track, night, weather, career, round, last, sponsor }.
function paintLive(cv, team, liv, ctx) {
  const c = cv.getContext("2d");
  c.clearRect(0, 0, LIVE, LIVE);
  const c1 = bodyColour(liv), c2 = accentColour(liv);
  const live = ctx || {};
  const night = !!live.night;
  paintTimingScreen(c, live, c1, c2);
  paintSoftGradients(c, night);
  paintGantryLcds(c, night, c2);
  paintDeskSpill(c, night);
  paintFloorSheen(c, night);
  paintBanners(c, sponsorNames(team, liv, live.sponsor), c1, c2);
  paintFlag(c, live.track);
  paintRaceSign(c, live, c2);
  return cv;
}

// TIMING SCREEN: the circuit the next race runs at, drawn from its own control
// points, with the round and the last result under it.
function paintTimingScreen(c, ctx, c1, c2) {
  const R = L_MAP, track = ctx.track;
  // Night: a slightly lifted panel so LIVE_OPTS.glow reads as an LCD, not a poster.
  c.fillStyle = ctx.night ? "#0c1218" : "#070a0e"; c.fillRect(R.x, R.y, R.w, R.h);
  c.fillStyle = css(scale(c1, 0.75)); c.fillRect(R.x, R.y, R.w, 30);
  c.fillStyle = "#f2f3f5"; c.font = "700 18px system-ui, sans-serif";
  c.textAlign = "left"; c.textBaseline = "middle";
  c.fillText(track ? trackName(track) : "NO CIRCUIT", R.x + 10, R.y + 15, R.w - 20);
  // A raw Tracks.LIST entry that has not hydrated (LAZY_CIRCUIT meta stub) THROWS on
  // `.points` ("has no path"): skip the map only, so the flag, banners and career footer
  // still paint; GarageScene.ctxKey repaints once the circuit is resident.
  let P = null;
  try { P = track && track.points; } catch (e) { P = null; }
  const M = P && P.length > 3 ? mapProj(P) : null;
  if (M) {
    // North up: -z is away from the driver at s = 0, so z runs DOWN the screen.
    c.strokeStyle = "#232a33"; c.lineWidth = 9; c.lineJoin = "round";
    c.beginPath();
    const n = M.px.length;
    c.moveTo(M.px[0], M.pz[0]);
    for (let i = 1; i <= n; i++) c.lineTo(M.px[i % n], M.pz[i % n]);
    c.stroke();
    c.strokeStyle = css(c2); c.lineWidth = 3.5; c.stroke();
    c.fillStyle = "#f2f3f5"; c.beginPath();
    c.arc(M.px[0], M.pz[0], 4.5, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = "#11151b"; c.fillRect(R.x, R.y + R.h - 40, R.w, 40);
  c.font = "700 15px system-ui, sans-serif"; c.fillStyle = "#9aa4b2";
  c.fillText(timingFooter(ctx), R.x + 10, R.y + R.h - 20, R.w - 20);
  c.textAlign = "right"; c.fillStyle = css(c2);
  c.fillText(ctx.weather && ctx.weather !== "dry" ? String(ctx.weather).toUpperCase() : "", R.x + R.w - 10, R.y + R.h - 20);
  c.textAlign = "left";
}

// Career: what happened last time out. Otherwise the country (and NIGHT).
function timingFooter(ctx) {
  const track = ctx.track, last = ctx.last;
  if (ctx.career) {
    if (!last) return "SEASON OPENER";
    return last.dnf ? `LAST: DNF · ${String(last.dnf).toUpperCase()}` : `LAST: P${last.p} · ${last.pts | 0} PTS`;
  }
  return track ? `${String(track.country || "").toUpperCase()}${ctx.night ? " · NIGHT" : ""}` : "SELECT A CIRCUIT";
}

// The car's contact shadow and the lamp pools. At night (Night Shift,
// endurance) the pools cool and lift so the bay reads as lit epoxy instead of
// a flat grey slab under dark keys.
function paintSoftGradients(c, night) {
  const poolInner = night ? "rgba(190,220,255,0.52)" : "rgba(255,238,205,0.34)";
  const poolOuter = night ? "rgba(140,180,230,0)" : "rgba(255,238,205,0)";
  radialCell(c, L_SHADOW, 0.5, 4, L_SHADOW.w / 2, [[0, "rgba(0,0,0,0.78)"], [1, "rgba(0,0,0,0)"]]);
  radialCell(c, L_POOL, 0.5, 4, L_POOL.w / 2, [[0, poolInner], [1, poolOuter]]);
}

// Three hung LCD faces, each a dotted waveform. Fill-only (no stroke):
// scene-live.test.mjs counts stroke() as a map draw, so a stroked waveform
// here would fail the unhydrated-stub gate.
function paintGantryLcds(c, night, c2) {
  const R = L_GANTRY;
  c.fillStyle = "#05070a"; c.fillRect(R.x, R.y, R.w, R.h);
  for (let k = 0; k < 3; k++) {
    const x0 = R.x + k * (R.w / 3) + 2, w = R.w / 3 - 4, y0 = R.y + 2, h = R.h - 4;
    c.fillStyle = night ? "#0e1620" : "#0b1016"; c.fillRect(x0, y0, w, h);
    c.fillStyle = k === 1 ? css(scale(c2, night ? 1.35 : 1.1)) : (night ? "#9ad0ff" : "#ffc45a");
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, px = x0 + 3 + (w - 6) * u;
      const py = y0 + h * 0.55 - Math.sin(u * 8 + k * 1.7) * h * 0.22 - Math.sin(u * 19) * h * 0.07;
      c.fillRect(px - 1, py - 1.2, 2.2, 2.4);
    }
    // Bright status chip so the glow gate (>0.5 luma) fires on the face.
    c.fillRect(x0 + 3, y0 + 3, 10, 4);
  }
}

function paintDeskSpill(c, night) {
  radialCell(c, L_SPILL, 0.35, 2, L_SPILL.w * 0.55, [
    [0, night ? "rgba(170,210,255,0.55)" : "rgba(180,210,240,0.32)"],
    [0.55, night ? "rgba(120,160,210,0.18)" : "rgba(140,170,200,0.10)"],
    [1, "rgba(100,140,180,0)"]]);
}

// Radial, not linear: the scene-live unit fake canvas only stubs
// createRadialGradient; a linear fill would throw out of paintLive there.
function paintFloorSheen(c, night) {
  radialCell(c, L_REFLECT, 0.2, 2, L_REFLECT.h * 0.95, [
    [0, night ? "rgba(160,200,255,0.28)" : "rgba(220,230,240,0.16)"],
    [0.55, night ? "rgba(110,150,200,0.10)" : "rgba(180,190,200,0.06)"],
    [1, "rgba(80,100,120,0)"]]);
}

// Up to four names: the career's backer leads, the team's own partners fill.
function sponsorNames(team, liv, sponsor) {
  const names = [];
  if (sponsor && sponsor.label) names.push(String(sponsor.label).toUpperCase());
  const pack = liv && liv.sponsors && LiveryTex.SPONSOR_PACKS && LiveryTex.SPONSOR_PACKS[liv.sponsors];
  const teamNames = pack || (LiveryTex.SPONSORS && LiveryTex.SPONSORS[team.id]) || FALLBACK_SPONSORS;
  for (let i = 0; i < teamNames.length && names.length < 4; i++) if (names.indexOf(teamNames[i]) < 0) names.push(teamNames[i]);
  return names;
}

// Two banners, two names each: a dark team-colour one and a light one.
function paintBanners(c, names, c1, c2) {
  for (let b = 0; b < 2; b++) {
    const R = L_BANNER[b];
    c.fillStyle = b ? "#eef0f3" : css(scale(c1, 0.55)); c.fillRect(R.x, R.y, R.w, R.h);
    c.fillStyle = b ? css(scale(c1, 0.75)) : "#f2f3f5";
    c.font = "800 34px system-ui, sans-serif"; c.textBaseline = "middle";
    c.textAlign = "center";
    c.fillText(`${names[b * 2] || ""}      ${names[b * 2 + 1] || ""}`, R.x + R.w / 2, R.y + R.h / 2, R.w - 24);
    c.fillStyle = css(c2); c.fillRect(R.x, R.y + R.h - 5, R.w, 5);
  }
}

// NEXT RACE flag: the stripes, then the three emblems a stripe cannot carry.
function paintFlag(c, track) {
  const R = L_FLAG, country = track && track.country, f = FLAGS[country] || NO_FLAG;
  const n = f.length - 1;
  for (let i = 0; i < n; i++) {
    c.fillStyle = f[i + 1];
    if (f[0] === "h") c.fillRect(R.x, R.y + (R.h * i) / n, R.w, R.h / n + 1);
    else c.fillRect(R.x + (R.w * i) / n, R.y, R.w / n + 1, R.h);
  }
  if (country === "Japan") { c.fillStyle = "#bc002d"; c.beginPath(); c.arc(R.x + R.w / 2, R.y + R.h / 2, 18, 0, Math.PI * 2); c.fill(); }
  if (country === "Canada") { c.fillStyle = "#ff0000"; c.fillRect(R.x + R.w / 2 - 12, R.y + 14, 24, 36); }
  if (country === "UK") { c.fillStyle = "#c8102e"; c.fillRect(R.x + R.w / 2 - 8, R.y, 16, R.h); }
}

// NEXT RACE sign: the round (career) and the race name.
function paintRaceSign(c, ctx, c2) {
  const T = L_RACE, track = ctx.track;
  c.fillStyle = "#0a0c10"; c.fillRect(T.x, T.y, T.w, T.h);
  c.fillStyle = css(c2); c.fillRect(T.x, T.y, 6, T.h);
  c.fillStyle = "#9aa4b2"; c.font = "700 18px system-ui, sans-serif"; c.textAlign = "left";
  c.fillText(ctx.career ? `NEXT · ROUND ${(ctx.round | 0) + 1}` : "NEXT RACE", T.x + 18, T.y + 18);
  c.fillStyle = "#f2f3f5"; c.font = "800 28px system-ui, sans-serif";
  c.fillText(track ? `${trackName(track)} GP` : "—", T.x + 18, T.y + 44, T.w - 30);
}

// The timing-screen map's bounds scan and projection depend only on the track's
// points (L_MAP is fixed), not the colours: a colour-drag repaint reuses them.
// Keyed on the points array and its length; the strokes still redraw every paint.
let mapMemo = null;
function mapProj(P) {
  if (mapMemo && mapMemo.P === P && mapMemo.n === P.length) return mapMemo;
  const R = L_MAP, n = P.length;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, P[i][0]); x1 = Math.max(x1, P[i][0]);
    z0 = Math.min(z0, P[i][2]); z1 = Math.max(z1, P[i][2]);
  }
  const pad = 22, top = R.y + 40, bh = R.h - 40 - 46, bw = R.w - pad * 2;
  const sc = Math.min(bw / Math.max(1e-3, x1 - x0), bh / Math.max(1e-3, z1 - z0));
  const ox = R.x + pad + (bw - (x1 - x0) * sc) / 2, oz = top + (bh - (z1 - z0) * sc) / 2;
  const px = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = ox + (P[i][0] - x0) * sc; pz[i] = oz + (P[i][2] - z0) * sc; }
  mapMemo = { P, n, px, pz };
  return mapMemo;
}

// Two of the six engineer screens carry LIVE traces: a scrolling pair of
// channels that move with time, so the bank reads as monitors rather than a
// poster of monitors. Painted into L_TRACE every frame it is shown.
function paintTrace(cv, liv, now) {
  const c = cv.getContext("2d");
  const R = L_TRACE;
  const t = now / 1000;
  const c2 = accentColour(liv);
  c.fillStyle = "#05070a"; c.fillRect(R.x, R.y, R.w, R.h);
  for (let k = 0; k < 2; k++) {
    const x0 = R.x + k * (R.w / 2) + 3, w = R.w / 2 - 6, y0 = R.y + 3, h = R.h - 6;
    c.fillStyle = "#0d141c"; c.fillRect(x0, y0, w, h);
    c.strokeStyle = "rgba(140,175,210,0.28)"; c.lineWidth = 1;
    for (let g = 1; g < 4; g++) { c.beginPath(); c.moveTo(x0 + 4, y0 + h * g / 4); c.lineTo(x0 + w - 4, y0 + h * g / 4); c.stroke(); }
    // Bright traces: the glow gate needs luma; a dim amber line looked painted-on.
    c.strokeStyle = k ? css(scale(c2, 1.25)) : "#ffc45a"; c.lineWidth = 2.2; c.beginPath();
    for (let i = 0; i <= 28; i++) {
      const u = i / 28, px = x0 + 6 + (w - 12) * u;
      const py = y0 + h * 0.55 - Math.sin(u * 9 + t * (k ? 1.7 : 2.3)) * h * 0.22
        - Math.sin(u * 23 - t * 3.1) * h * 0.08 - (i % 4 === 0 ? 2 : 0);
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke();
    c.fillStyle = "#b6c2d2"; c.font = "700 11px system-ui, sans-serif"; c.textAlign = "left"; c.textBaseline = "top";
    c.fillText(k ? "BRAKE TEMP" : "ERS SOC", x0 + 6, y0 + 4);
    c.textAlign = "right"; c.fillStyle = k ? css(scale(c2, 1.2)) : "#ffc45a";
    c.fillText(k ? `${410 + Math.round(Math.sin(t * 0.7) * 35)}°C` : `${Math.round(62 + Math.sin(t * 0.4) * 30)}%`, x0 + w - 6, y0 + 4);
  }
}

// ── the quads the atlas lands on ───────────────────────────────────────────
// One textured quad sampling atlas cell `region`; corners c wind CCW about n.
function atlasQuad(out, c, n, region) {
  const uL = region.x / LIVE, uR = (region.x + region.w) / LIVE;
  const vT = 1 - region.y / LIVE, vB = 1 - (region.y + region.h) / LIVE;
  const uvs = [[uL, vB], [uR, vB], [uR, vT], [uL, vT]];
  const i = out.pos.length / 3;
  for (let k = 0; k < 4; k++) {
    out.pos.push(c[k][0], c[k][1], c[k][2]);
    out.nrm.push(n[0], n[1], n[2]);
    out.uv.push(uvs[k][0], uvs[k][1]);
  }
  out.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
// Facing +Y at height y, over x0..x1 by z0..z1.
const upQuad = (out, y, x0, x1, z0, z1, region) =>
  atlasQuad(out, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], region);
// On the plane x, rising y0..y1; the image's left edge is at zL, right at zR.
const xQuad = (out, x, nx, y0, y1, zL, zR, region) =>
  atlasQuad(out, [[x, y0, zL], [x, y0, zR], [x, y1, zR], [x, y1, zL]], [nx, 0, 0], region);
// On the plane z facing -Z (toward the deep end), image left at xL, right at xR.
const zQuad = (out, z, y0, y1, xL, xR, region) =>
  atlasQuad(out, [[xL, y0, z], [xR, y0, z], [xR, y1, z], [xL, y1, z]], [0, 0, -1], region);
const poolQuad = (out, x, z, r) => upQuad(out, 0.005, x - r, x + r, z - r, z + r, L_POOL);

// `floor` is its own group: the shadow and pools draw with no glow (they are
// not signage), everything else at the dress's 0.62. FIXTURES is GarageScene's
// lamp table: [x, y, z, ..., aimX (6), aimY, aimZ (8), ..., wide (13)].
function buildLive(FIXTURES) {
  const g = {};
  for (const k of ["mid", "floor", "nx", "px", "door"]) g[k] = { pos: [], nrm: [], uv: [], idx: [] };
  const xw = HALF_W - 0.03;
  // The timing screen face, on the housing's -Z side (see buildEquipment).
  const sx = SCREEN[0], sy = SCREEN[1], sz = SCREEN[2] - 0.051;
  zQuad(g.mid, sz, sy - 0.68, sy + 0.68, sx + 0.88, sx - 0.88, L_MAP);
  // Contact shadow: the car's footprint, y 0.006 above the wheel boxes (0.003).
  upQuad(g.floor, 0.006, -1.7, 1.7, -3.4, 3.8, L_SHADOW);
  // Lamp pools under the two keys and four fills, pushed 1.2 m along each aim.
  for (let i = 0; i < 6; i++) {
    const F = FIXTURES[i];
    poolQuad(g.floor, F[0] + F[6] * 1.2, F[2] + F[8] * 1.2, F[13] ? 2.2 : 1.6);
  }
  // Soft pools near the nose / rear-jack corners (no mesh lamps — 18k-tri cap).
  poolQuad(g.floor, -2.85, 3.35, 1.35);
  poolQuad(g.floor, 3.05, -3.55, 1.35);
  // A thin epoxy sheen under the timing screen and along the -X desk, not a
  // second car mirror (that stays in scene.js).
  upQuad(g.floor, 0.007, sx - 1.2, sx + 1.2, sz - 1.6, sz + 0.4, L_REFLECT);
  upQuad(g.floor, 0.007, -5.4, -3.6, GANTRY.z - 1.6, GANTRY.z + 1.6, L_REFLECT);
  // Two live trace rows over the dress screen bank (D_SCREEN spans z 2.15..
  // -0.95, y 1.10..2.65 on -X). They sit 5 mm proud of THAT quad, which stands
  // 0.19 m off the wall on the monitor bank block: 5 mm off the wall would be
  // inside the bank, where the depth test deletes them.
  const xt = -xw + 0.195;
  xQuad(g.nx, xt, 1, 1.10, 1.875, 2.15, 0.08, L_TRACE);
  xQuad(g.nx, xt, 1, 1.875, 2.65, 2.15, 0.08, L_TRACE);
  // Hung gantry LCDs (GarageEquipment.monitorGantry): the bay-facing face of
  // the housing is at x + 0.12; sit 6 mm proud of it so the depth test keeps
  // the atlas over the LCD mesh instead of burying it inside the bezel.
  const gx = GANTRY.x + 0.126;
  for (let i = 0; i < GANTRY.dz.length; i++) {
    const cz = GANTRY.z + GANTRY.dz[i], hy = 0.105, hz = 0.16;
    const cell = { x: L_GANTRY.x + i * (L_GANTRY.w / 3), y: L_GANTRY.y, w: L_GANTRY.w / 3, h: L_GANTRY.h };
    xQuad(g.nx, gx, 1, 1.92 - hy, 1.92 + hy, cz + hz, cz - hz, cell);
  }
  // Desk spill on the gantry worktop (y 0.86 in buildProps).
  upQuad(g.nx, 0.872, -5.35, -4.55, GANTRY.z - 1.35, GANTRY.z + 1.35, L_SPILL);
  // Banners on the side walls, in the y 1.72-2.12 band both walls have free
  // forward of the data boards.
  xQuad(g.nx, -xw, 1, 1.72, 2.12, 4.6, 2.4, L_BANNER[0]);
  xQuad(g.px, xw, -1, 1.72, 2.12, 2.4, 4.6, L_BANNER[1]);
  // Next-race sign ON THE SHUTTER (z 6.24, where the door wordmark lives),
  // under that wordmark's y 2.60 and above the shutter's 1.98 bottom rail: the
  // REAR preset frames the door wall beside it only at its extreme corner.
  zQuad(g.door, 6.24, 2.26, 2.50, 3.42, 2.94, L_FLAG);
  zQuad(g.door, 6.24, 2.04, 2.21, 3.98, 2.94, L_RACE);
  return g;
}

  // LIVE is public: GarageScene.uploadLive sizes the canvas from it.
  return { LIVE, paintLive, paintTrace, build: buildLive };
})();
if (typeof window !== "undefined") window.GarageLive = GarageLive;
