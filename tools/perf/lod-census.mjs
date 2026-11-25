#!/usr/bin/env node
// lod-census.mjs — what each graphics tier BUILDS per circuit, from a Node VM track build (#6547 step 1, P6).
// @doc LOD census (#6547): per circuit x detail 0/1/2, tris by channel, instances, batches, texture MB, lazy bytes.
// @skill scenery-dress
//
//   node tools/perf/lod-census.mjs <id>|--all [--tier P-LOW|P-HIGH|ULTRA|EXTREME] [--detail 0,1,2] [--json] [--write]
//
// The VM build (tools/lib/track-build-vm.cjs) runs with a recording createInstancedBatch, so the build takes the
// browser's instancing path (build-props.js INST_MODELS, graph.js batches({instancedOnly})): the placements a
// browser draws as InstancedMesh batches are withheld from the props soup here too, and are counted per batch.
// Without the stub every VM sweep fuses them (props-tris.cjs measures that soup). Nothing is drawn: these are the
// triangles UPLOADED per channel, not the triangles a frame submits after culling (that is mesh-census.mjs, a browser).
//
// Columns per (circuit, detail):
//   tris.<channel>  index count / 3 of each uploaded mesh (road = the drawn road, floor = farTerrain's ring at 2)
//   tris.instanced  sum over batches of per-instance tris x count; drawn = every channel + instanced
//   instances       sum of batch counts; batches = instanced batches; meshes = non-instanced meshes uploaded
// Tier rows (TIERS below; #6547 §2.1): the pack tier each draws with, its est. GPU texture MB (17 layer arrays,
// albedo + normal, RGBA8, x4/3 mips; matches docs/notes/ASSET-COMPRESSION-2026-10-24.md) and the lazy wire bytes a
// race entry fetches beyond boot (circuit def + scenery + LAZY_TRACK_BUILD + the pack PNGs + models; EXTREME adds
// LAZY_GFX_HI). Byte columns are recorded, never ratcheted: eagerCodeBytes (tests/data/ratchets.json) owns code size.
//
// --write regenerates tests/data/lod-census.json for the whole roster at detail 0/1/2 (~3 min);
// tests/unit/lod-census.test.mjs ratchets its detail-0 rows. Changes no pixel and no byte of the game.
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
export const DATA = join(ROOT, "tests/data/lod-census.json");
export const CHANNELS = ["road", "terrain", "props", "glass", "water", "floor", "gate", "startline"];
// #6547 §2.1 tier rows: the track build's detail level and the asset-pack tier (assets.js _wantTier) each draws with.
export const TIERS = Object.freeze({
  "P-LOW": { detail: 0, pack: "low" },
  "P-HIGH": { detail: 0, pack: "high" },
  ULTRA: { detail: 1, pack: "high" },
  EXTREME: { detail: 2, pack: "hd", gfxHi: true },
});

const bytes = (rel) => statSync(join(ROOT, rel)).size;
const sum = (a) => a.reduce((t, v) => t + v, 0);

/** Pack tiers: est. GPU MB of both layer arrays and the PNG wire bytes, from assets/pack/manifest.json. */
export function packTiers() {
  const m = JSON.parse(readFileSync(join(ROOT, "assets/pack/manifest.json"), "utf8")).materials;
  const modelBytes = sum(readdirSync(join(ROOT, "assets/pack/models")).map((f) => bytes(`assets/pack/models/${f}`)));
  const out = {};
  for (const [tier, t] of [["low", m.low], ["high", m], ["hd", m.hd]]) {
    if (!t) continue;
    const layers = Math.max(...t.layers.map((l) => l.mat)) + 1;   // indexed by MAT id: layer 0 (FLAT) included
    const gpu = 2 * layers * t.size * t.size * 4 * (4 / 3);
    out[tier] = { size: t.size, layers, texMB: +(gpu / 1048576).toFixed(2),
      pngBytes: bytes(`assets/pack/${t.albedo}`) + bytes(`assets/pack/${t.normal}`), modelBytes };
  }
  return out;
}

/** Lazy wire bytes per tier for one circuit (recorded, not ratcheted). */
export function lazyBytes(id, pack) {
  const man = require("../manifest.cjs");
  const own = man.LAZY_CIRCUIT.filter((f) => f.endsWith(`/${id}.js`)).concat(man.LAZY_SCENERY.filter((f) => f.endsWith(`/${id}.js`)));
  const circuit = sum(own.map(bytes)), trackBuild = sum(man.LAZY_TRACK_BUILD.map(bytes)), gfxHi = sum(man.LAZY_GFX_HI.map(bytes));
  const tiers = {};
  for (const [name, t] of Object.entries(TIERS)) {
    const p = pack[t.pack];
    tiers[name] = circuit + trackBuild + p.pngBytes + p.modelBytes + (t.gfxHi ? gfxHi : 0);
  }
  return { circuit, trackBuild, gfxHi, tiers };
}

let _env = null;
function env() {
  if (_env) return _env;
  _env = require("../lib/track-build-vm.cjs").buildContext({ compact: true });
  // The browser's batch API, recording only: its presence turns on build-props.js INST_MODELS and the graph's
  // instanced set (tracks.js propBatches), exactly as GLX / TLX / WGX builds run.
  _env.sandbox.GLX.createInstancedBatch = (geo, matrices) => ({ tris: geo.idx.length / 3, count: matrices.length / 16 });
  return _env;
}

const triCount = (m) => (m && m.__cap && m.__cap.idx ? m.__cap.idx.length / 3 : 0);

/** One circuit at one detail level. */
export function measure(id, detail) {
  const E = env();
  const def = E.Tracks.LIST.find((d) => d.id === id);
  if (!def) throw new Error(`unknown circuit ${id}`);
  const from = E.mark();
  const tr = E.Tracks.build(def, { night: false, detail });
  const tris = {};
  for (const k of CHANNELS) tris[k] = k === "road" ? triCount(tr.meshes.road || tr.meshes.roadChunked) : triCount(tr.meshes[k]);
  const pb = tr.meshes.propBatches || [];
  tris.instanced = sum(pb.map((b) => b.tris * b.count));
  const row = {
    drawn: sum(Object.values(tris)), tris,
    instances: sum(pb.map((b) => b.count)), batches: pb.length,
    meshes: Object.entries(tr.meshes).filter(([k, m]) => k !== "propBatches" && m && m.__cap).length,
  };
  E.trim(from);
  E.release(tr);
  return row;
}

export function roster() {
  return require("../lib/circuit-scope.cjs").scope(env().Tracks.LIST.map((d) => d.id));
}

/** Rows for ids x details: { id: { detail0: row, ... } }. */
export function census(ids, details) {
  const out = {};
  for (const id of ids) {
    out[id] = {};
    for (const d of details) out[id][`detail${d}`] = measure(id, d);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, `usage: node tools/perf/lod-census.mjs <id>|--all [--tier P-LOW|P-HIGH|ULTRA|EXTREME] [--detail 0,1,2] [--json] [--write]
  Per circuit x detail: uploaded tris by channel, instanced batches / instances, est. texture MB and lazy
  bytes per tier, from a Node VM build on the browser's instancing path. --write regenerates
  tests/data/lod-census.json (whole roster, detail 0/1/2).`);
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const tier = val("--tier");
  if (tier && !TIERS[tier]) { console.error(`unknown tier ${tier} (${Object.keys(TIERS).join(" | ")})`); process.exit(2); }
  const write = argv.includes("--write");
  if (write && process.env.APEX_CIRCUITS) { console.error("--write measures the whole roster: unset APEX_CIRCUITS"); process.exit(2); }
  const details = tier ? [TIERS[tier].detail] : (val("--detail") || "0,1,2").split(",").map(Number);
  const pos = argv.filter((a, i) => !a.startsWith("--") && !["--tier", "--detail"].includes(argv[i - 1]));
  const ids = write || argv.includes("--all") ? roster() : pos;
  if (!ids.length) { console.error("usage: lod-census.mjs <id>|--all [--tier T] [--json] [--write]"); process.exit(2); }
  const pack = packTiers();
  const circuits = census(ids, write ? [0, 1, 2] : details);
  for (const id of ids) circuits[id].lazyBytes = lazyBytes(id, pack).tiers;
  if (write) {
    const doc = {
      _doc: "LOD census (#6547 step 1): tools/perf/lod-census.mjs --write. Uploaded tris per channel, instanced batches and instances per circuit x detail; " +
        "est. texture MB and lazy wire bytes per tier. tests/unit/lod-census.test.mjs ratchets detail0 (drawn, instanced, instances, batches: grow > 0.5 % fails, " +
        "a shrink passes). detail1/detail2 and every byte column are advisory (#6547 §7.4) until measured on a real GPU.",
      tiers: TIERS, pack, circuits,
    };
    // One line per circuit, so a re-measure diffs as the rows that moved.
    const rows = Object.entries(circuits).map(([id, r]) => `  ${JSON.stringify(id)}: ${JSON.stringify(r)}`);
    const head = ["_doc", "tiers", "pack"].map((k) => ` ${JSON.stringify(k)}: ${JSON.stringify(doc[k])}`);
    writeFileSync(DATA, `{\n${head.join(",\n")},\n "circuits": {\n${rows.join(",\n")}\n }\n}\n`);
    console.log(`wrote ${DATA} (${ids.length} circuits)`);
    return;
  }
  if (argv.includes("--json")) { process.stdout.write(JSON.stringify({ tiers: TIERS, pack, circuits })); return; }
  for (const id of ids) {
    for (const [lv, r] of Object.entries(circuits[id])) {
      if (lv === "lazyBytes") continue;
      const ch = Object.entries(r.tris).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join("  ");
      console.log(`${id.padEnd(16)} ${lv}  drawn ${String(r.drawn).padStart(8)}  batches ${r.batches} (${r.instances} inst)  meshes ${r.meshes}  | ${ch}`);
    }
    const tiers = tier ? [tier] : Object.keys(TIERS);
    console.log(`${"".padEnd(16)} ` + tiers.map((t) => `${t}: tex ${pack[TIERS[t].pack].texMB} MB, lazy ${(circuits[id].lazyBytes[t] / 1048576).toFixed(2)} MB`).join("  "));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
