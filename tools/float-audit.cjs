#!/usr/bin/env node
// float-audit.cjs — EXHAUSTIVE floating-scenery detector for Apex 26.
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
    const rec = { verts, pos: buf && buf.pos ? buf.pos : [] };
    captures.push(rec);
    return { verts, idxCount: buf && buf.idx ? buf.idx.length : 0, __cap: rec };
  };
  const GLX = {
    createMesh: capture,
    createChunkedMesh: (buf) => capture(buf),
  };

  const sandbox = {
    Math, Array, Float32Array, Uint16Array, Uint32Array, Object, JSON,
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

  for (const f of ["js/circuits.js", "js/track-geom.js", "js/track-scenery-data.js",
                   "js/circuit-markings.js", "js/track-space.js", "js/track-surface.js",
                   "js/track-models.js", "js/scenery-themes.js", "js/landmark-kit.js",
                   "js/circuit-kit.js"]) runFile(f);

  // Instrument the geometry emitters so every flagged cluster can name the
  // primitive that produced it. tracks.js destructures TrackGeom at load time,
  // so the wrappers must be installed BEFORE it runs. Emitters called from
  // inside track-geom.js (addCyl -> emit) use module-scope references and are
  // untouched, so nothing is double-counted.
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
        for (let i = start; i < end; i += 3) {
          const x = out.pos[i], y = out.pos[i + 1], z = out.pos[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const rec = { name, minX, maxX, minY, maxY, minZ, maxZ };
        // --why: capture the emitting source line, but only for primitives the
        // first pass already flagged. The build is deterministic, so the second
        // pass reproduces identical geometry and this stays cheap.
        if (stackFor) {
          const key = `${minX.toFixed(1)}|${minY.toFixed(1)}|${minZ.toFixed(1)}`;
          if (stackFor.has(key)) {
            const st = new Error().stack.split("\n").slice(2, 6)
              .map((l) => l.trim().replace(/^at\s+/, ""))
              .filter((l) => !/track-geom/.test(l));
            rec.stack = st.slice(0, 3).join("  <-  ");
          }
        }
        prims.push(rec);
      }
      return r;
    };
  }
  ctx.__prims = prims;
  for (const f of fs.readdirSync(path.join(ROOT, "js/tracks"))
                    .filter((f) => f.endsWith(".js")).sort()) {
    runFile(path.join("js/tracks", f));
  }
  runFile("js/tracks.js");

  if (!ctx.Tracks || !ctx.Tracks.LIST) throw new Error("Tracks.LIST missing");
  return { Tracks: ctx.Tracks, TrackSurface: ctx.TrackSurface, prims };
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

  const groundAt = (ix, iz) => {
    const g = groundTop.get(ck(ix, iz));
    if (g !== undefined) return g;
    return surfaceGround((ix + 0.5) * CELL, (iz + 0.5) * CELL);
  };

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

  const sorted = prims.slice().sort((a, b) => a.minY - b.minY);
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
    const gx = Math.floor((p.minX + p.maxX) / 2 / CELL);
    const gz = Math.floor((p.minZ + p.maxZ) / 2 / CELL);
    const g = groundAt(gx, gz);
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
  floatingPrims.sort((a, b) => b.gap - a.gap);
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
  if (asJson) console.log(JSON.stringify(out, null, 1));
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
  if (asJson) console.log(JSON.stringify(res, null, 1));
  else printOne(res, allClusters ? 200 : 40);
  process.exit(res.floating.length ? 1 : 0);
}
