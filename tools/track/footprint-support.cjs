// @doc Advisory full-footprint support checks for substantial box masses; exact vertical contacts, review shot jobs.
// @skill scenery-dress
"use strict";

const CONTACT = 0.15;
const WARN_GAP = 1.2;
const CELL = 8;
const data = (a) => a && (a._data || a);

// addBox emits six perimeter-ordered quads. Choose the lowest near-horizontal
// face, not vertices within a band of minY: that loses a tilted base's high edge.
function bottomFace(p) {
  if (p.name !== "addBox" || p.e - p.s !== 72) return null;
  const pos = data(p.buf.pos);
  let best = null, lowest = Infinity;
  for (let s = p.s; s < p.e; s += 12) {
    const v = Array.from({ length: 4 }, (_, k) => Array.from(pos.slice(s + k * 3, s + k * 3 + 3)));
    const a = v[1].map((x, k) => x - v[0][k]), b = v[2].map((x, k) => x - v[0][k]);
    const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(ny) < 0.7 * Math.hypot(nx, ny, nz)) continue;
    const y = v.reduce((sum, q) => sum + q[1], 0) / 4;
    if (y < lowest) { lowest = y; best = v; }
  }
  return best;
}

function footprintSamples(v) {
  const samples = v.map((q) => q.slice());
  for (let i = 0; i < 4; i++) samples.push(v[i].map((x, k) => (x + v[(i + 1) % 4][k]) / 2));
  samples.push(v[0].map((_, k) => v.reduce((sum, q) => sum + q[k], 0) / 4));
  return samples;
}

// Vertical triangle intersection (both windings). AABBs only find candidates;
// they never establish contact. See https://threejs.org/docs/pages/Ray.html.
function triangleY(pos, a, b, c, x, z) {
  const ax = pos[a], az = pos[a + 2], bx = pos[b] - ax, bz = pos[b + 2] - az;
  const cx = pos[c] - ax, cz = pos[c + 2] - az, dx = x - ax, dz = z - az;
  const den = bx * cz - bz * cx;
  if (Math.abs(den) < 1e-10) return null;
  const u = (dx * cz - dz * cx) / den, v = (bx * dz - bz * dx) / den;
  if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return null;
  return pos[a + 1] + u * (pos[b + 1] - pos[a + 1]) + v * (pos[c + 1] - pos[a + 1]);
}

function supportProbe(props, groundY) {
  const grid = new Map(), big = [], triangles = new Map();
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const p of props) {
    if (p.maxX - p.minX > 160 || p.maxZ - p.minZ > 160) { big.push(p); continue; }
    for (let x = Math.floor(p.minX / CELL); x <= Math.floor(p.maxX / CELL); x++)
      for (let z = Math.floor(p.minZ / CELL); z <= Math.floor(p.maxZ / CELL); z++) {
        const k = `${x},${z}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(p);
      }
  }
  const indices = (p) => {
    if (triangles.has(p)) return triangles.get(p);
    // Boxes are solid volumes. Hidden-face stripping may remove a buried
    // underside from idx while retaining these emitted vertices. Reconstruct
    // its six exact faces so a real foundation keeps its lower boundary.
    if (p.name === "addBox" && p.e - p.s === 72) {
      const out = [];
      for (let s = p.s; s < p.e; s += 12) out.push(s, s + 3, s + 6, s, s + 6, s + 9);
      triangles.set(p, out);
      return out;
    }
    const idx = data(p.buf.idx) || [], start = p.s / 3, end = p.e / 3;
    // Emitter ranges are append-only, as are the triangles within each buffer.
    // Locate this primitive without scanning the entire track at every sample.
    let lo = 0, hi = Math.floor(idx.length / 3);
    while (lo < hi) {
      const m = (lo + hi) >>> 1, k = m * 3;
      if (Math.min(idx[k], idx[k + 1], idx[k + 2]) < start) lo = m + 1;
      else hi = m;
    }
    const out = [];
    for (let i = lo * 3; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      if (Math.min(a, b, c) >= end) break;
      if (a >= start && a < end && b >= start && b < end && c >= start && c < end) out.push(a * 3, b * 3, c * 3);
    }
    triangles.set(p, out);
    return out;
  };
  const envelope = (p, x, z) => {
    const pos = data(p.buf.pos), idx = indices(p);
    let bottom = Infinity, top = -Infinity;
    for (let i = 0; i < idx.length; i += 3) {
      const y = triangleY(pos, idx[i], idx[i + 1], idx[i + 2], x, z);
      if (y !== null) { bottom = Math.min(bottom, y); top = Math.max(top, y); }
    }
    return top === -Infinity ? null : { bottom, top };
  };
  const rests = (p, x, y, z, path) => {
    const ground = groundY(x, z, y);
    if (ground !== null && y <= ground + CONTACT) return "ground";
    if (path.size >= 32) return "unknown";
    path.add(p);
    let unknown = ground === null;
    for (const q of [...(grid.get(key(x, z)) || []), ...big]) {
      if (path.has(q) || x < q.minX || x > q.maxX || z < q.minZ || z > q.maxZ || q.minY > y + CONTACT) continue;
      const e = envelope(q, x, z);
      // A foundation may intentionally overlap the base. Require geometry at
      // or just below it and a strictly lower bottom, rather than exact top-Y
      // equality; descend to that bottom to prove this contact reaches ground.
      if (!e || e.top < y - CONTACT || q.minY >= y - 1e-4) continue;
      // An arbitrary baked mesh can contain disconnected roofs/windows. Its
      // min/max ray hits do not prove there is solid material between them.
      // Even the procedural cone/cylinder emitters omit their bottom caps, so
      // only a reconstructed box currently certifies a complete solid interval.
      if (q.name !== "addBox" || q.e - q.s !== 72) { unknown = true; continue; }
      if (e.bottom >= y - 1e-4) continue;
      const support = rests(q, x, e.bottom, z, path);
      if (support === "ground" || support === "primitive") { path.delete(p); return "primitive"; }
      if (support === "unknown") unknown = true;
    }
    path.delete(p);
    return unknown ? "unknown" : "none";
  };
  return (p, v) => rests(p, v[0], v[1], v[2], new Set());
}

function analyseFootprints(props, groundY) {
  const probe = supportProbe(props, groundY), findings = [];
  let candidates = 0, unknownSamples = 0;
  for (const p of props) {
    // Masses, not roof skins, bridge decks, signs, vegetation or window panes.
    // This is advisory geometry evidence, not a claim about structural intent.
    if (p.maxY - p.minY < 3) continue;
    const face = bottomFace(p);
    if (!face) continue;
    const width = Math.hypot(...face[1].map((x, k) => x - face[0][k]));
    const depth = Math.hypot(...face[2].map((x, k) => x - face[1][k]));
    const a = face[1].map((x, k) => x - face[0][k]), b = face[2].map((x, k) => x - face[1][k]);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const centre = [(p.minX + p.maxX) / 2, (p.minY + p.maxY) / 2, (p.minZ + p.maxZ) / 2];
    const height = 2 * Math.abs(n.reduce((sum, x, k) => sum + x * (centre[k] - face[0][k]), 0)) / Math.hypot(...n);
    if (Math.min(width, depth, height) < 3) continue;
    candidates++;
    const samples = footprintSamples(face).map((v) => {
      const ground = groundY(v[0], v[2], v[1]);
      const support = probe(p, v);
      return { at: v, ground, gap: ground === null ? null : v[1] - ground, support };
    });
    const unknown = samples.filter((s) => s.support === "unknown").length;
    unknownSamples += unknown;
    const supported = samples.filter((s) => s.support === "ground" || s.support === "primitive").length;
    const open = samples.filter((s) => s.support === "none" && s.gap > WARN_GAP);
    const unverified = samples.filter((s) => s.support === "unknown" && s.gap > WARN_GAP);
    // Do not defer detached masses to the old AABB graph: a nearby primitive
    // can falsely ground them there too. Unknown coverage never means support.
    if (open.length + unverified.length < 3) continue;
    findings.push({ p, samples, maxGap: Math.max(...[...open, ...unverified].map((s) => s.gap)),
      supportedSamples: supported, unsupportedSamples: open.length,
      unverifiedSamples: unverified.length,
      unsupportedFraction: open.length / samples.length, unknownSamples: unknown });
  }
  findings.sort((a, b) => b.maxGap - a.maxGap || a.p.minX - b.p.minX || a.p.minZ - b.p.minZ);
  return { candidates, unknownSamples, findings };
}

function diagnostic(track, id, f) {
  const p = f.p, x = (p.minX + p.maxX) / 2, z = (p.minZ + p.maxZ) / 2;
  let node = 0, distance = Infinity;
  for (let k = 0; k < track.px.length; k++) {
    const d = (track.px[k] - x) ** 2 + (track.pz[k] - z) ** 2;
    if (d < distance) { distance = d; node = k; }
  }
  const frac = node / track.px.length;
  const az = Math.atan2(x - track.px[node], z - track.pz[node]) * 180 / Math.PI;
  return { kind: f.unverifiedSamples ? "unverifiedFootprint" : f.supportedSamples ? "partialFootprint" : "unsupportedFootprint", emitter: p.name, primitive: p.q,
    bounds: { min: [p.minX, p.minY, p.minZ], max: [p.maxX, p.maxY, p.maxZ] },
    node, frac, maxGap: f.maxGap, unsupportedFraction: f.unsupportedFraction,
    supportedSamples: f.supportedSamples, unsupportedSamples: f.unsupportedSamples,
    unverifiedSamples: f.unverifiedSamples,
    unknownSamples: f.unknownSamples, samples: f.samples,
    // Nearby review views, not an assertion that a centreline camera sees the
    // entire object. Bounds/samples above carry the exact world-space location.
    shots: [0, 120, 240].map((offset, i) => ({ trackId: id, frac, cam: "orbit",
      az: az + offset, el: 25, dist: Math.max(60, Math.sqrt(distance) * 1.8),
      profile: "preview", tod: "day", out: `artifacts/footprint-shots/${id}-${p.q}-${i}.jpg` })) };
}

module.exports = { analyseFootprints, diagnostic, bottomFace, footprintSamples, CONTACT, WARN_GAP };
