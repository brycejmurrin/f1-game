#!/usr/bin/env node
// float-audit.cjs — EXHAUSTIVE floating-scenery detector for Apex 26.
// @doc Exhaustive FLOATING-scenery detector — wraps `TrackGeom` emitters and reports props above/under the ground; `--all`.
// @skill survey-track
//
// Screenshots only sample a few lap points; this checks EVERY prop vertex on a
// circuit against the ground actually rendered underneath it. It reuses the
// verify-track.cjs trick: run the real track build inside a Node VM with GLX
// stubbed, but KEEP the vertex buffers instead of only counting them. No
// browser, no GPU, ~1 s per circuit.
//
// Method
//   1. Bin every vertex into a CELL x CELL metre XZ grid.
//        groundTop[cell] = highest road/terrain vertex   (the visible surface)
//        propMin[cell]   = lowest prop/glass/gate vertex (the model's footing)
//   2. A cell whose lowest prop geometry sits > THRESH above the ground there is
//      a FLOAT CANDIDATE. Cells with no rendered ground fall back to the
//      circuit's own TrackSurface.heightAt() closed form (what groundYAt uses).
//   3. Flood-fill adjacent candidate cells into CLUSTERS so one hovering object
//      is reported once, not fifty times.
//   4. SUPPORT TEST — the false-positive filter. A tree canopy, a grandstand
//      roof and a gantry beam all sit high up legitimately because something
//      beneath them reaches the ground. For each cluster, look within SUPPORT_R
//      metres for prop geometry that comes within GROUNDED_EPS of the ground.
//      Supported => structure. Unsupported => genuinely floating.
//
// Usage:
//   node tools/float-audit.cjs <trackId> [--json] [--all-clusters]
//   node tools/float-audit.cjs --all [--top N]
//
// Exit code 1 if any UNSUPPORTED cluster is found (CI-usable).

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const CELL = 2.5;          // XZ grid resolution (m)
const THRESH = 1.2;        // prop base this far above ground = candidate (m)
const SUPPORT_R = 6.0;     // look this far for something touching the ground (m)
const GROUNDED_EPS = 1.0;  // prop within this of the ground counts as footing (m)
const MIN_CELLS = 1;       // ignore clusters smaller than this

// ---------------------------------------------------------------------------
// VM harness — mirrors verify-track.cjs, but captures buffers.

function buildContext(opts) {
  const stackFor = (opts && opts.stackFor) || null;
  const captures = [];
  const capture = (buf) => {
    const verts = buf && buf.pos ? buf.pos.length / 3 : 0;
    const rec = { verts, pos: buf && buf.pos ? buf.pos : [],
                  idx: buf && buf.idx ? buf.idx : null };
    captures.push(rec);
    return { verts, idxCount: buf && buf.idx ? buf.idx.length : 0, __cap: rec };
  };
  const GLX = {
    createMesh: capture,
    createChunkedMesh: (buf) => capture(buf),
  };

  const sandbox = {
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON,
    isNaN, isFinite, parseInt, parseFloat,
    GLX,
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {},
               debug: () => {}, trace: () => {}, assert: () => {}, group: () => {},
               groupEnd: () => {}, table: () => {}, dir: () => {}, count: () => {},
               time: () => {}, timeEnd: () => {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  function runFile(relPath) {
    const src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    vm.runInContext(src.replace(/^const\b/gm, "var"), ctx, { filename: relPath });
  }

  // Load list comes from tools/manifest.cjs (TRACK_VM) — same source of truth
  // as verify-track.cjs. Everything before the instrumentation point (the
  // emitter wrappers below must install before tracks.js runs).
  const MANIFEST = require("./manifest.cjs");
  const PRE = MANIFEST.TRACK_VM.slice(0, MANIFEST.TRACK_VM.indexOf("@circuits"));
  for (const f of PRE) runFile(f);

  // Instrument the geometry emitters so every flagged cluster can name the
  // primitive that produced it. tracks.js destructures TrackGeom at load time,
  // so the wrappers must be installed BEFORE it runs. Emitters called from
  // inside js/track/geom.js (addCyl -> emit) use module-scope references and
  // are untouched, so nothing is double-counted.
  const prims = [];
  const TG = ctx.TrackGeom;
  for (const name of Object.keys(TG)) {
    if (typeof TG[name] !== "function") continue;
    const orig = TG[name];
    TG[name] = function (out) {
      if (!out || !out.pos || typeof out.pos.length !== "number")
        return orig.apply(this, arguments);
      const start = out.pos.length;
      const r = orig.apply(this, arguments);
      const end = out.pos.length;
      if (end > start) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity,
            minZ = Infinity, maxZ = -Infinity;
        const pos = out.pos._data || out.pos;
        for (let i = start; i < end; i += 3) {
          const x = pos[i], y = pos[i + 1], z = pos[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const rec = { name, minX, maxX, minY, maxY, minZ, maxZ, mat: out._mat || 0 };
        // --why: capture the emitting source line, but only for primitives the
        // first pass already flagged. The build is deterministic, so the second
        // pass reproduces identical geometry and this stays cheap.
        if (stackFor) {
          const key = `${minX.toFixed(1)}|${minY.toFixed(1)}|${minZ.toFixed(1)}`;
          if (stackFor.has(key)) {
            // Keep a DEEP slice. tracks.js wraps every emitter in a culling
            // shim, so the innermost one or two frames are always that shim
            // (addBox -> RAW.addBox) and say nothing about who asked for the
            // geometry. The reporter walks outward past them to the first frame
            // that names a real builder.
            const st = new Error().stack.split("\n").slice(2, 14)
              .map((l) => l.trim().replace(/^at\s+/, ""))
              .filter((l) => !/track\/geom\.js/.test(l));
            rec.stack = st.slice(0, 6).join("  <-  ");
          }
        }
        prims.push(rec);
      }
      return r;
    };
  }
  ctx.__prims = prims;
  for (const f of fs.readdirSync(path.join(ROOT, MANIFEST.CIRCUITS_DIR))
                    .filter((f) => f.endsWith(".js")).sort()) {
    runFile(path.join(MANIFEST.CIRCUITS_DIR, f));
  }
  // …and the split-out scenery closures (LAZY_SCENERY). The .js filter above
  // only sees the top level, so without this every circuit builds BARE — road
  // and terrain, no dressing — and the numbers look plausible enough to trust.
  // That is exactly how cota read 3,988 prop cells here instead of 32,897.
  for (const f of MANIFEST.LAZY_SCENERY) runFile(f);
  runFile("js/track/tracks.js");

  if (!ctx.Tracks || !ctx.Tracks.LIST) throw new Error("Tracks.LIST missing");
  return { Tracks: ctx.Tracks, TrackSurface: ctx.TrackSurface, TrackGeom: ctx.TrackGeom, prims };
}

// ---------------------------------------------------------------------------

const ck = (ix, iz) => ix * 4000003 + iz;   // cell key (large prime stride)

function audit(id) {
  const { Tracks, TrackSurface, prims } = buildContext();
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`track "${id}" not found`);
  const track = Tracks.build(def);
  const M = track.meshes;

  // Ground = what the player sees underfoot. Props = everything placed on it.
  const groundMeshes = ["road", "terrain", "floor"];
  const propMeshes = ["props", "glass", "gate", "startline"];

  const groundTop = new Map();   // cell -> highest ground vertex y
  const propMin = new Map();     // cell -> {ix, iz, y} lowest prop vertex
  const waterTop = new Map();    // cell -> water surface y (support only)

  const binGround = (pos) => {
    for (let i = 0; i < pos.length; i += 3) {
      const ix = Math.floor(pos[i] / CELL), iz = Math.floor(pos[i + 2] / CELL);
      const k = ck(ix, iz), y = pos[i + 1];
      const cur = groundTop.get(k);
      if (cur === undefined || y > cur) groundTop.set(k, y);
    }
  };
  const binProps = (pos) => {
    for (let i = 0; i < pos.length; i += 3) {
      const ix = Math.floor(pos[i] / CELL), iz = Math.floor(pos[i + 2] / CELL);
      const k = ck(ix, iz), y = pos[i + 1];
      const cur = propMin.get(k);
      if (cur === undefined) propMin.set(k, { ix, iz, y });
      else if (y < cur.y) cur.y = y;
    }
  };

  for (const name of groundMeshes) if (M[name] && M[name].__cap) binGround(M[name].__cap.pos);
  for (const name of propMeshes) if (M[name] && M[name].__cap) binProps(M[name].__cap.pos);
  // WATER, for the SUPPORT test only. A hull resting on a water surface is
  // held up by it in exactly the sense this audit measures, but water is not
  // "ground" — it must not enter groundMeshes, where it would join the terrain
  // triangle set and let a pool or fountain plane above the verge redraw the
  // ground for props beside it.
  if (M.water && M.water.__cap) {
    const pos = M.water.__cap.pos;
    for (let i = 0; i < pos.length; i += 3) {
      const k = ck(Math.floor(pos[i] / CELL), Math.floor(pos[i + 2] / CELL));
      const y = pos[i + 1], cur = waterTop.get(k);
      if (cur === undefined || y > cur) waterTop.set(k, y);
    }
  }

  // Closed-form ground fallback for cells the terrain ribbon doesn't cover —
  // the same surface groundYAt() anchors props to. Nearest-node lookup via a
  // coarse spatial grid over the centreline.
  const surface = track.surface || TrackSurface.profile(track.def, track);
  const n = track.n, px = track.px, pz = track.pz, hw = track.hw;
  const NG = 40;   // node-grid cell (m)
  const nodeGrid = new Map();
  for (let k = 0; k < n; k++) {
    const key = ck(Math.floor(px[k] / NG), Math.floor(pz[k] / NG));
    let a = nodeGrid.get(key); if (!a) nodeGrid.set(key, a = []);
    a.push(k);
  }
  const surfaceGround = (wx, wz) => {
    const gx = Math.floor(wx / NG), gz = Math.floor(wz / NG);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 4 && best < 0; r++) {          // widen until a node is found
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r && r > 1) continue;
        const a = nodeGrid.get(ck(gx + dx, gz + dz)); if (!a) continue;
        for (const k of a) {
          const d = (wx - px[k]) ** 2 + (wz - pz[k]) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
      }
    }
    // The ring search only reaches ~4*NG metres. Distant backdrop props (and any
    // prop that floats out there) MUST still get a ground reference, or they are
    // silently skipped and never audited — fall back to a full node scan.
    if (best < 0) {
      for (let k = 0; k < n; k++) {
        const d = (wx - px[k]) ** 2 + (wz - pz[k]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    if (best < 0) return null;
    const lat = Math.max(0, Math.sqrt(bestD) - hw[best]);
    return surface.heightAt(best, lat);
  };

  // Ground as a SURFACE, not a scatter of vertices. Binning vertices per cell
  // misreads any cell spanned by a large triangle that keeps its vertices
  // elsewhere, so props above it look like they float. Index the ground
  // triangles and interpolate the exact height, the way the game's own
  // terrainYAt() does when it anchors a prop.
  const TC = 8;                      // triangle-grid cell (m)
  const triGrid = new Map();
  const TRI = [];
  for (const name of groundMeshes) {
    const m = M[name];
    if (!m || !m.__cap || !m.__cap.idx) continue;
    const pos = m.__cap.pos, idx = m.__cap.idx;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
      const base = TRI.length;
      TRI.push(pos[ia], pos[ia + 1], pos[ia + 2],
               pos[ib], pos[ib + 1], pos[ib + 2],
               pos[ic], pos[ic + 1], pos[ic + 2]);
      const x0 = Math.min(pos[ia], pos[ib], pos[ic]), x1 = Math.max(pos[ia], pos[ib], pos[ic]);
      const z0 = Math.min(pos[ia + 2], pos[ib + 2], pos[ic + 2]);
      const z1 = Math.max(pos[ia + 2], pos[ib + 2], pos[ic + 2]);
      if ((x1 - x0) > 400 || (z1 - z0) > 400) continue;      // skip degenerate spans
      for (let gx = Math.floor(x0 / TC); gx <= Math.floor(x1 / TC); gx++)
        for (let gz = Math.floor(z0 / TC); gz <= Math.floor(z1 / TC); gz++) {
          const k = ck(gx, gz);
          let a = triGrid.get(k); if (!a) triGrid.set(k, a = []);
          a.push(base);
        }
    }
  }
  const surfaceY = (x, z) => {
    const arr = triGrid.get(ck(Math.floor(x / TC), Math.floor(z / TC)));
    if (!arr) return null;
    let best = null;
    for (const b of arr) {
      const ax = TRI[b], ay = TRI[b + 1], az = TRI[b + 2];
      const bx = TRI[b + 3], by = TRI[b + 4], bz = TRI[b + 5];
      const cx2 = TRI[b + 6], cy = TRI[b + 7], cz2 = TRI[b + 8];
      const v0x = cx2 - ax, v0z = cz2 - az, v1x = bx - ax, v1z = bz - az;
      const v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z;
      const d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-9) continue;
      const u = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den;
      if (u < -0.01 || vv < -0.01 || u + vv > 1.01) continue;
      const y = ay + u * (cy - ay) + vv * (by - ay);
      if (best === null || y > best) best = y;
    }
    return best;
  };
  const groundAtXZ = (x, z) => {
    const y = surfaceY(x, z);
    return y !== null ? y : surfaceGround(x, z);
  };
  const groundAt = (ix, iz) => groundAtXZ((ix + 0.5) * CELL, (iz + 0.5) * CELL);

  // ---- support-chain analysis --------------------------------------------
  // The real question is per-MODEL: "what is this piece resting on?" Cell
  // flood-fill could not answer it — in dense scenery a hovering box merges
  // into a neighbouring blob of tree canopies and inherits their support.
  //
  // So resolve it over PRIMITIVES. Process them bottom-up by their lowest
  // vertex. A primitive is GROUNDED if it either touches the ground itself, or
  // it rests on an already-grounded primitive that overlaps it in XZ and rises
  // to meet it. Everything left over is genuinely hanging in the air.
  const EPS = 0.6;             // vertical slack for "rests on" (m)
  const GRID = 10;             // spatial hash cell for primitives (m)
  const MAXSPREAD = 60;        // prims wider than this go in the linear list

  // TOTAL order, not just by minY. Array.prototype.sort is stable, so equal
  // keys keep INSERTION order — i.e. the order the circuit happened to emit its
  // primitives in. That made the audit's answer depend on emission order, which
  // is not a property of the world: reversing singapore's lap left every prop at
  // an identical world position (verified to 0.02 m) yet moved the count 17 -> 37,
  // purely because the mirrored anchors emit in a different sequence. Break ties
  // on geometry so the same scene always scores the same.
  const byGeom = (a, b) => a.minX - b.minX || a.minZ - b.minZ || a.minY - b.minY
                        || a.maxX - b.maxX || a.maxZ - b.maxZ || a.maxY - b.maxY;
  const sorted = prims.slice().sort((a, b) => (a.minY - b.minY) || byGeom(a, b));
  const TOL = 0.6;             // XZ slack: panes/cladding hug a wall's outer face
  const cellsOf = (p) => {
    const out = [];
    for (let ix = Math.floor((p.minX - TOL) / GRID); ix <= Math.floor((p.maxX + TOL) / GRID); ix++)
      for (let iz = Math.floor((p.minZ - TOL) / GRID); iz <= Math.floor((p.maxZ + TOL) / GRID); iz++)
        out.push(ck(ix, iz));
    return out;
  };
  const overlaps = (a, b) =>
    !(a.maxX + TOL < b.minX || a.minX - TOL > b.maxX ||
      a.maxZ + TOL < b.minZ || a.minZ - TOL > b.maxZ);

  const gridded = new Map();   // cell -> grounded prims touching it
  const bigGrounded = [];      // grounded prims too large to hash

  const addGrounded = (p) => {
    if ((p.maxX - p.minX) > MAXSPREAD || (p.maxZ - p.minZ) > MAXSPREAD) bigGrounded.push(p);
    else for (const c of cellsOf(p)) {
      let a = gridded.get(c); if (!a) gridded.set(c, a = []);
      a.push(p);
    }
  };
  const restsOnGrounded = (p) => {
    const wide = (p.maxX - p.minX) > MAXSPREAD || (p.maxZ - p.minZ) > MAXSPREAD;
    const test = (q) => q !== p && q.maxY >= p.minY - EPS && overlaps(p, q);
    if (!wide) {
      for (const c of cellsOf(p)) {
        const arr = gridded.get(c); if (!arr) continue;
        for (const q of arr) if (test(q)) return true;
      }
    }
    for (const q of bigGrounded) if (test(q)) return true;
    if (wide) for (const [, arr] of gridded) for (const q of arr) if (test(q)) return true;
    return false;
  };

  // Seed: primitives that touch the ground themselves.
  let pending = [];
  for (const p of sorted) {
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    // Footing = whichever of ground and water is higher under this primitive.
    // Without the water term every boat on the fleet was a false positive —
    // Monaco's yachts and megaYacht, Jeddah's marina dhows — measured instead
    // against the seabed, or against the `floor` backdrop slab tracks.js lays
    // at pyMin-5, which covers the sea too. They are not defects and no
    // circuit-side edit clears them without sinking the boats.
    const gw = waterTop.get(ck(Math.floor(cx / CELL), Math.floor(cz / CELL)));
    const gr = groundAtXZ(cx, cz);
    const g = gw !== undefined && (gr === null || gw > gr) ? gw : gr;
    p._g = g;
    if (g !== null && p.minY <= g + GROUNDED_EPS) addGrounded(p);
    else pending.push(p);
  }
  // Propagate to a FIXED POINT rather than in one bottom-up sweep. A single pass
  // ordered by lowest vertex gets cantilevers wrong: a lamp head hangs BELOW the
  // arm carrying it, so the arm is not yet grounded when the head is tested.
  // Repeating until nothing new resolves fixes every interpenetrating assembly.
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const still = [];
    for (const p of pending) {
      if (restsOnGrounded(p)) addGrounded(p);
      else still.push(p);
    }
    if (still.length === pending.length) break;   // stable
    pending = still;
  }
  const floatingPrims = pending.map((p) => ({ p, gap: p.minY - (p._g === null ? 0 : p._g) }));

  // group neighbouring floating primitives so one object reports once
  // Same total-order requirement, and it matters MORE here: the grouping below
  // is greedy seed-and-absorb, so which primitive gets to be a seed decides how
  // many clusters come out. Ties on gap alone left that to emission order.
  floatingPrims.sort((a, b) => (b.gap - a.gap) || byGeom(a.p, b.p));
  const used = new Set(), report = [];
  for (let i = 0; i < floatingPrims.length; i++) {
    if (used.has(i)) continue;
    const seed = floatingPrims[i];
    const group = [seed]; used.add(i);
    for (let j = i + 1; j < floatingPrims.length; j++) {
      if (used.has(j)) continue;
      const q = floatingPrims[j].p;
      if (Math.abs((q.minX + q.maxX) / 2 - (seed.p.minX + seed.p.maxX) / 2) < 12 &&
          Math.abs((q.minZ + q.maxZ) / 2 - (seed.p.minZ + seed.p.maxZ) / 2) < 12 &&
          Math.abs(floatingPrims[j].gap - seed.gap) < 6) { group.push(floatingPrims[j]); used.add(j); }
    }
    const cx = (seed.p.minX + seed.p.maxX) / 2, cz = (seed.p.minZ + seed.p.maxZ) / 2;
    let bk = 0, bd = Infinity;
    for (let k = 0; k < n; k++) {
      const d = (cx - px[k]) ** 2 + (cz - pz[k]) ** 2;
      if (d < bd) { bd = d; bk = k; }
    }
    const names = new Map();
    for (const it of group) names.set(it.p.name, (names.get(it.p.name) || 0) + 1);
    report.push({
      cells: group.length,
      minGap: +Math.min(...group.map((g2) => g2.gap)).toFixed(2),
      maxGap: +Math.max(...group.map((g2) => g2.gap)).toFixed(2),
      x: +cx.toFixed(1), z: +cz.toFixed(1), lowY: +seed.p.minY.toFixed(2),
      dims: [+(seed.p.maxX - seed.p.minX).toFixed(1), +(seed.p.maxY - seed.p.minY).toFixed(1),
             +(seed.p.maxZ - seed.p.minZ).toFixed(1)],
      frac: +(bk / n).toFixed(3), distFromCentre: +Math.sqrt(bd).toFixed(1),
      supported: false,
      src: [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([nm, c]) => `${nm}x${c}`).join(","),
    });
  }
  report.sort((a, b) => (b.minGap * b.cells) - (a.minGap * a.cells));
  const floating = report.filter((r) => r.minGap > THRESH);
  const flagKeys = new Set(floatingPrims.map(
    (f) => `${f.p.minX.toFixed(1)}|${f.p.minY.toFixed(1)}|${f.p.minZ.toFixed(1)}`));
  return { id, propCells: prims.length, clusters: report.length, floating, all: report, flagKeys };
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const allClusters = args.includes("--all-clusters");
const topN = (() => { const i = args.indexOf("--top"); return i >= 0 ? +args[i + 1] : 6; })();

function printOne(res, top) {
  const list = allClusters ? res.all : res.floating;
  const tag = res.floating.length ? `${res.floating.length} FLOATING` : "clean";
  console.log(`\n${res.id.padEnd(13)} ${String(res.propCells).padStart(7)} prop cells, ` +
              `${String(res.clusters).padStart(4)} elevated clusters — ${tag}`);
  for (const r of list.slice(0, top)) {
    console.log(`   ${r.supported ? "ok  " : "FLOAT"} gap ${String(r.minGap).padStart(7)}m..${String(r.maxGap).padStart(7)}m  ` +
                `cells ${String(r.cells).padStart(4)}  frac ${String(r.frac).padStart(5)}  ` +
                `lat ${String(r.distFromCentre).padStart(6)}m  ${(r.dims||[]).join("x").padEnd(16)} ${r.src}`);
  }
}

// --clip: prop-vs-prop interpenetration. along() warns that a box longer than
// the true node spacing shares real volume with its neighbour (z-fighting on
// straights, visible overlap on hairpins) but nothing enforces it. Report pairs
// sharing significant volume, skipping CONTAINMENT (a window band inside a wall
// is deliberate detailing, not a clip).
function clipAudit(id) {
  const { Tracks, prims } = buildContext();
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === id));
  // Landforms (mountains, ridges, backdrop mounds) are BUILT to interpenetrate,
  // and they dwarf everything else, so an unfiltered pass is all noise. Restrict
  // to trackside props of comparable size — where along()'s overlap hazard and
  // real modelling mistakes actually live.
  const MAXDIM = 25, NEAR = 70;
  const span = (p) => Math.max(p.maxX - p.minX, p.maxY - p.minY, p.maxZ - p.minZ);
  const nearTrack = (p) => {
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    for (let k = 0; k < track.n; k += 4) {
      const dx = cx - track.px[k], dz = cz - track.pz[k];
      if (dx * dx + dz * dz < NEAR * NEAR) return true;
    }
    return false;
  };
  const G = 10, grid = new Map(), hits = [];
  const vol = (p) => (p.maxX - p.minX) * (p.maxY - p.minY) * (p.maxZ - p.minZ);
  prims.forEach((p, i) => {
    if (vol(p) < 0.05 || span(p) > MAXDIM || !nearTrack(p)) return;
    for (let gx = Math.floor(p.minX / G); gx <= Math.floor(p.maxX / G); gx++)
      for (let gz = Math.floor(p.minZ / G); gz <= Math.floor(p.maxZ / G); gz++) {
        const k = ck(gx, gz);
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(i);
      }
  });
  const seen = new Set();
  for (const [, arr] of grid) {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = prims[arr[i]], b = prims[arr[j]];
      const key = arr[i] < arr[j] ? arr[i] * 1e7 + arr[j] : arr[j] * 1e7 + arr[i];
      if (seen.has(key)) continue; seen.add(key);
      const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (ox <= 0.02 || oy <= 0.02 || oz <= 0.02) continue;
      const ov = ox * oy * oz, va = vol(a), vb = vol(b), small = Math.min(va, vb);
      if (ov < 0.5) continue;
      if (ov > small * 0.85) continue;              // containment: intentional detail
      if (ov / small < 0.30) continue;              // incidental touch
      if (Math.max(va, vb) / small > 8) continue;   // detail inside a mass
      hits.push({ ov, a, b });
    }
  }
  hits.sort((x, y) => y.ov - x.ov);
  return { id, pairs: hits.length, top: hits.slice(0, 8) };
}

// --foliage: canopy pushing through barriers. forestEdge() sizes its `dist` by
// canopy radius so foliage cannot reach a wall, but raw per-track tree()/pine()
// calls at a small gap have no such guard. Material tags separate the two
// populations without needing call-site capture.
function foliageAudit(id) {
  const { Tracks, TrackGeom, prims } = buildContext();
  const track = Tracks.build(Tracks.LIST.find((d) => d.id === id));
  const M = TrackGeom.MAT || {};
  const FOL = M.FOLIAGE, WOOD = M.WOOD;
  const isFol = (p) => p.mat === FOL || p.mat === WOOD;
  // A barrier is hard material sitting close to the racing line.
  const nearEdge = (p) => {
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    let best = Infinity;
    for (let k = 0; k < track.n; k += 2) {
      const dx = cx - track.px[k], dz = cz - track.pz[k];
      const d = Math.sqrt(dx * dx + dz * dz) - track.hw[k];
      if (d < best) best = d;
    }
    return best;
  };
  // A tree canopy is at most a few metres across. backdrop() emits its distant
  // wooded landforms in the SAME foliage material, and those AABBs are hundreds
  // of metres wide, so without a size gate every hillside "intersects" every
  // trackside post inside its bounding box — that single false-positive class
  // was most of redbull's count and all of spa's.
  const isCanopy = (p) => Math.max(p.maxX - p.minX, p.maxZ - p.minZ) < 15;
  const bar = [], fol = [];
  for (const p of prims) {
    if (isFol(p)) { if (isCanopy(p)) fol.push(p); continue; }
    if (p.mat === M.CONCRETE || p.mat === M.METAL || p.mat === 0) {
      const h = p.maxY - p.minY, w = Math.max(p.maxX - p.minX, p.maxZ - p.minZ);
      if (h > 0.5 && h < 6 && w < 12) bar.push(p);   // wall/fence/guardrail-shaped
    }
  }
  const G = 8, grid = new Map();
  for (const b of bar) {
    if (nearEdge(b) > 6) continue;                   // only true trackside barriers
    for (let gx = Math.floor(b.minX / G); gx <= Math.floor(b.maxX / G); gx++)
      for (let gz = Math.floor(b.minZ / G); gz <= Math.floor(b.maxZ / G); gz++) {
        const k = ck(gx, gz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(b);
      }
  }
  const hits = [];
  for (const f of fol) {
    const seen = new Set();
    for (let gx = Math.floor(f.minX / G); gx <= Math.floor(f.maxX / G); gx++)
      for (let gz = Math.floor(f.minZ / G); gz <= Math.floor(f.maxZ / G); gz++) {
        const arr = grid.get(ck(gx, gz)); if (!arr) continue;
        for (const b of arr) {
          if (seen.has(b)) continue; seen.add(b);
          const ox = Math.min(f.maxX, b.maxX) - Math.max(f.minX, b.minX);
          const oy = Math.min(f.maxY, b.maxY) - Math.max(f.minY, b.minY);
          const oz = Math.min(f.maxZ, b.maxZ) - Math.max(f.minZ, b.minZ);
          if (ox > 0.05 && oy > 0.05 && oz > 0.05)
            hits.push({ pen: Math.min(ox, oz), ov: ox * oy * oz, f, b });
        }
      }
  }
  hits.sort((x, y) => y.pen - x.pen);
  // Lap fraction of each hit, so a reported intersection can be looked AT
  // (`__apex.orbit(frac, …)`) instead of only counted. The AABB screen below
  // over-reports by construction — a fence panel is 0.05 m thick but its
  // axis-aligned box is metres wide wherever the barrier runs diagonally — so
  // eyeballing the top hits is part of using this tool, not optional polish.
  const fracOf = (x, z) => {
    let best = Infinity, bk = 0;
    for (let k = 0; k < track.n; k++) {
      const dx = x - track.px[k], dz = z - track.pz[k], d = dx * dx + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    return bk / track.n;
  };
  for (const h of hits) h.frac = fracOf((h.f.minX + h.f.maxX) / 2, (h.f.minZ + h.f.maxZ) / 2);
  // Raw hit counts are PRIMITIVE-pair counts and badly overstate the problem: a
  // single tree overlapping a single box scores once per canopy tier per box
  // face, so redbull's 613 collapse to two actual spots on the circuit. Cluster
  // by 10 m cell to report how many places are really affected.
  const spots = new Set();
  for (const h of hits)
    spots.add(`${Math.round((h.f.minX + h.f.maxX) / 20)}|${Math.round((h.f.minZ + h.f.maxZ) / 20)}`);
  const key = (p) => `${p.minX.toFixed(1)}|${p.minY.toFixed(1)}|${p.minZ.toFixed(1)}`;
  const flagKeys = new Set();
  for (const h of hits) { flagKeys.add(key(h.f)); flagKeys.add(key(h.b)); }
  return { id, hits, spots: spots.size, flagKeys, key };
}

if (args.includes("--foliage")) {
  const why = args.includes("--why");
  const ids = args[0] === "--all" ? buildContext().Tracks.LIST.map((d) => d.id) : [args[0]];
  for (const id of ids) {
    const r = foliageAudit(id);
    console.log(`\n${r.id.padEnd(13)} ${String(r.hits.length).padStart(4)} prim-pair hit(s) ` +
                `across ${r.spots} distinct location(s)`);
    for (const h of r.hits.slice(0, why ? 3 : 6))
      console.log(`   ${h.pen.toFixed(2).padStart(6)} m into a ${h.b.name}  ` +
                  `canopy ${h.f.name} @(${((h.f.minX + h.f.maxX) / 2).toFixed(0)}, ` +
                  `${((h.f.minZ + h.f.maxZ) / 2).toFixed(0)})  frac ${h.frac.toFixed(3)}`);
    if (!why) continue;
    // Second deterministic pass with stack capture on exactly the flagged prims,
    // so each hit can be attributed to the call site that emitted it. Without
    // this the counts are unactionable: "a canopy overlaps a box" says nothing
    // about whether the box is a catch fence (a real defect) or a crowd terrace
    // / landform slab / signboard (deliberate, or an artefact of the shape
    // heuristic that decides what counts as a barrier).
    const { Tracks, prims } = buildContext({ stackFor: r.flagKeys });
    Tracks.build(Tracks.LIST.find((d) => d.id === id));
    const stackAt = new Map();
    for (const p of prims) if (p.stack) stackAt.set(r.key(p), p.stack);
    // Walk outward past the emitter shims to the frame that names a real
    // builder (tree/fence/grandstand/backdrop/…), which is the only thing that
    // tells you whether a hit is a defect or deliberate detailing.
    const RAWFN = /^(addBox|addCyl|addCone|addFrustum|addPrism|addPyramid|emit|addTube|addSphere)\b/;
    // Two frames, not one: the species helper (tree/pine/…) is never the useful
    // answer on its own — what matters is who ASKED for a tree there, i.e.
    // forestEdge vs the roadside scatter vs a direct call in a track file.
    const site = (s) => {
      const fr = (s || "?").split("  <-  ").filter((f) => !RAWFN.test(f));
      return (fr.length ? fr.slice(0, 2) : ["?"]).join(" < ").replace(/Object\./g, "");
    };
    const pairs = new Map();
    for (const h of r.hits) {
      const kk = `${site(stackAt.get(r.key(h.f)))}   ==>   ${site(stackAt.get(r.key(h.b)))}`;
      const e = pairs.get(kk) || { n: 0, pen: 0 };
      e.n++; e.pen = Math.max(e.pen, h.pen); pairs.set(kk, e);
    }
    console.log(`  canopy call site  ==>  obstacle call site   (${pairs.size} distinct pairing(s)):`);
    for (const [p, e] of [...pairs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10))
      console.log(`   x${String(e.n).padStart(4)} max ${e.pen.toFixed(2)}m  ${p}`);
  }
  process.exit(0);
}

// Emit JSON with a SYNCHRONOUS write, not console.log.
//
// console.log to a PIPE is asynchronous in Node, and every exit path below
// calls process.exit() immediately afterwards — which kills the process before
// the buffer drains. The --all payload is ~1 MB (it carries `all` and
// `flagKeys` per circuit), so a consumer reading this over a pipe got the JSON
// TRUNCATED mid-object: `SyntaxError: Expected ',' or '}' after property value
// in JSON at position 219264`, from tests/unit/scenery-grounding.test.mjs in
// CI. It never reproduced locally because a shell redirect to a FILE is a
// synchronous write and completes before exit.
//
// fs.writeSync(1, ...) is synchronous for pipes too, so the control flow below
// (each branch emits then exits) stays exactly as it was.
function emitJson(obj) {
  fs.writeSync(1, JSON.stringify(obj, null, 1) + "\n");
}

if (args.includes("--clip")) {
  const ids = args[0] === "--all" ? buildContext().Tracks.LIST.map((d) => d.id) : [args[0]];
  let total = 0;
  for (const id of ids) {
    const r = clipAudit(id);
    total += r.pairs;
    console.log(`\n${r.id.padEnd(13)} ${r.pairs} interpenetrating pair(s)  ` +
                `[EXPLORATORY — see note below]`);
    for (const h of r.top)
      console.log(`   ${h.ov.toFixed(1).padStart(7)} m3  ${h.a.name} x ${h.b.name}  ` +
                  `@(${((h.a.minX + h.a.maxX) / 2).toFixed(0)}, ${((h.a.minZ + h.a.maxZ) / 2).toFixed(0)})`);
  }
  console.log(`\nNOTE: counts are NOT actionable. Dense scenery interpenetrates
by design — forest canopies, crowd boxes, stacked building detail — and this
pass cannot tell those from mistakes because it has no model identity.
tools/clip-audit.cjs is the actionable form (call-site tagging, cross-model
pairs only, baseline-gated by tests/unit/prop-clipping.test.mjs) — use that; treat
this ranked list as a lead at most.`);
  process.exit(0);
}

if (args[0] === "--all") {
  const { Tracks } = buildContext();
  const ids = Tracks.LIST.map((d) => d.id);
  const out = [];
  let bad = 0;
  for (const id of ids) {
    try {
      const res = audit(id);
      out.push(res);
      if (!asJson) printOne(res, topN);
      if (res.floating.length) bad++;
    } catch (e) {
      console.error(`FAIL ${id}: ${e.message}`);
      bad++;
    }
  }
  if (asJson) emitJson(out);
  else {
    console.log(`\n${"=".repeat(72)}`);
    const dirty = out.filter((o) => o.floating.length);
    console.log(dirty.length
      ? `${dirty.length}/${ids.length} circuits have unsupported floating clusters: ` +
        dirty.map((o) => `${o.id}(${o.floating.length})`).join(", ")
      : `All ${ids.length} circuits clean — every elevated prop cluster is supported.`);
  }
  process.exit(bad ? 1 : 0);
} else if (args.includes("--why")) {
  const id = args[0];
  const res = audit(id);
  printOne(res, 12);
  const { Tracks, prims } = buildContext({ stackFor: res.flagKeys });
  Tracks.build(Tracks.LIST.find((d) => d.id === id));
  const bySite = new Map();
  for (const p of prims) {
    if (!p.stack) continue;
    const e = bySite.get(p.stack) || { n: 0, minY: Infinity, name: p.name };
    e.n++; e.minY = Math.min(e.minY, p.minY);
    bySite.set(p.stack, e);
  }
  console.log(`\n  source of the floating primitives (${bySite.size} distinct call sites):`);
  for (const [site, e] of [...bySite.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 14))
    console.log(`   x${String(e.n).padStart(4)}  ${e.name.padEnd(10)} ${site}`);
  process.exit(res.floating.length ? 1 : 0);
} else {
  const id = args[0];
  if (!id) { console.error("usage: float-audit.cjs <trackId> | --all"); process.exit(2); }
  const res = audit(id);
  if (asJson) emitJson(res);
  else printOne(res, allClusters ? 200 : 40);
  process.exit(res.floating.length ? 1 : 0);
}
