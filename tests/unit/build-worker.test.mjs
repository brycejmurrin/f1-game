// The track build Worker (js/track/build-worker.js + js/track/build-client.js),
// PROTOTYPE behind apex26.buildWorker. Its promise is the stepped build's:
// NOTHING changes. The worker runs the unchanged Tracks.build against a
// recording gfx, its message crosses a structured clone (what postMessage
// does), and TrackBuildClient.replay issues the recorded uploads against the
// real backend — which must then have received exactly what a synchronous
// build() hands it, in the same order, and leave the same physics arrays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");
const MANIFEST = require("../../tools/manifest.cjs");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const Tracks = buildContext(null, { quiet: true, instancing: true });
const main = Tracks._vmContext;
// The replay paces itself on requestAnimationFrame, else setTimeout, and times slices: give the sandbox what a page has.
main.setTimeout = setTimeout; main.performance = performance;

// The worker: its own context, importScripts reading the repo, postMessage kept.
function spawnWorker() {
  const posted = [];
  const ctx = vm.createContext({ performance, console, URL, postMessage: (m) => posted.push(structuredClone(m)) });
  ctx.self = ctx;
  ctx.importScripts = (...files) => {
    for (const f of files) {
      const rel = f.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel });
    }
  };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-worker.js"), "utf8"), ctx);
  return { send: (m) => ctx.onmessage({ data: m }), posted };
}
const vmFiles = MANIFEST.TRACK_VM.flatMap((e) => (e === "@circuits" ? MANIFEST.CIRCUITS.map((id) => MANIFEST.circuitPath(id)) : [e]));

// A gfx that records every upload, hashing its buffers, and frees a chunked
// upload's source channels the way glx/chunked.js and wgx-chunked.js do.
function recorder() {
  const log = [];
  const h = (a) => createHash("sha1").update(a && a.length ? Buffer.from(Float64Array.from(a).buffer) : Buffer.alloc(0)).digest("hex").slice(0, 16);
  const geo = (kind, g, extra) => {
    log.push([kind, g && g.pos ? g.pos.length : 0, h(g && g.pos), h(g && g.nrm), h(g && g.col), h(g && g.idx), h(g && g.mat), extra || ""].join(" "));
    return { kind };
  };
  return {
    log,
    gfx: {
      createMesh: (g) => geo("mesh", g),
      createChunkedMesh: (g, cell) => {
        const r = geo("chunked", g, "cell=" + cell);
        if (!g._keepPositions) { g.pos = null; g.idx = null; }
        return { kind: "chunked", chunks: [1] };
      },
      createInstancedBatch: (g, m, c) => geo("inst", g, h(m) + "/" + h(c)),
    },
  };
}
const PHYS = ["px", "py", "pz", "hw", "barL", "barR", "lineX", "lineK"];
const physics = (t) => PHYS.filter((k) => t[k]).map((k) => k + ":" + createHash("sha1").update(Buffer.from(Float64Array.from(t[k]).buffer)).digest("hex").slice(0, 16));

vm.runInContext(fs.readFileSync(path.join(ROOT, "js/track/build-client.js"), "utf8").replace(/^const\b/gm, "var"), main);
const worker = spawnWorker();
worker.send({ type: "init", files: vmFiles.map((f) => "http://x/" + f + "?v=1") });

test("the worker loads the page's build modules and answers ready", () => {
  assert.deepEqual(worker.posted.map((m) => m.type), ["ready"]);
});

for (const id of ["monza", "vegas"]) {
  test(`${id}: worker build + replay uploads exactly what build() uploads`, async () => {
    const def = Tracks.LIST.find((d) => d.id === id);
    const a = recorder();
    const tA = Tracks.build(def, { gfx: a.gfx, chunkRibbons: true, retainGraph: false });

    worker.posted.length = 0;
    const wIdx = MANIFEST.CIRCUITS.indexOf(id);
    worker.send({ type: "build", seq: 1, idx: wIdx, id, opts: { chunkRibbons: true, retainGraph: false }, scenery: "http://x/" + MANIFEST.sceneryPath(id) + "?v=1" });
    const msg = worker.posted[0];
    assert.equal(msg.type, "built", msg.message);
    assert.ok(msg.recs.length > 5 && msg.ms > 0);

    const b = recorder();
    const tB = await main.TrackBuildClient.replay(msg, def, b.gfx);
    assert.deepEqual(b.log, a.log, "every upload, in order, byte-identical");
    assert.deepEqual(physics(tB), physics(tA), "the physics arrays match");
    assert.equal(tB.total, tA.total);
    assert.equal(tB.def, def, "the page's own def is re-attached");
    assert.deepEqual(Object.keys(tB.meshes).sort(), Object.keys(tA.meshes).sort());
    for (const [k, v] of Object.entries(tB.meshes)) {
      const flat = Array.isArray(v) ? v : [v];
      assert.ok(flat.every((x) => !x || x.__rec === undefined), k + " holds a real handle, not a token");
    }
    for (let s = 0; s < tA.total; s += tA.total / 37) {
      assert.equal(tB.surface.heightAt ? tB.surface.heightAt(s, 0) : 0, tA.surface.heightAt ? tA.surface.heightAt(s, 0) : 0, "surface sampler rebuilt at s=" + s);
    }
  });
}

test("a ribbon the backend did not chunk is re-seated as tracks.js does it", async () => {
  const def = Tracks.LIST.find((d) => d.id === "monza");
  worker.posted.length = 0;
  worker.send({ type: "build", seq: 2, idx: MANIFEST.CIRCUITS.indexOf("monza"), id: "monza", opts: { chunkRibbons: true, retainGraph: false } });
  const msg = worker.posted[0];
  const ribbons = Object.keys(msg.track.meshes).filter((k) => k.endsWith("Chunked") && msg.track.meshes[k]);
  assert.ok(ribbons.length > 0, "the worker chunked at least one ribbon");
  const small = recorder();
  small.gfx.createChunkedMesh = (g) => ({ kind: "small", chunks: null });   // under a chunk: a plain mesh
  const t = await main.TrackBuildClient.replay(msg, def, small.gfx);
  for (const k of ribbons) {
    assert.equal(t.meshes[k], null, k + " cleared");
    assert.equal(t.meshes[k.slice(0, -7)].kind, "small", k.slice(0, -7) + " holds the plain mesh");
  }
  assert.equal(await main.TrackBuildClient.replay(msg, def, small.gfx), null, "a message is replayed once");
});

test("a worker error answers an error message, never a throw", () => {
  worker.posted.length = 0;
  worker.send({ type: "build", seq: 3, idx: 0, id: "not-a-circuit", opts: {} });
  assert.equal(worker.posted[0].type, "error");
  assert.equal(worker.posted[0].seq, 3);
});

test("BUILD IN BACKGROUND's write flips exactly what enabled() (and loadTrackStepped) reads", () => {
  const mem = new Map();
  main.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const C = main.TrackBuildClient;
  assert.equal(C.enabled(), false, "unset reads OFF");
  C.set(false); assert.equal(mem.get("apex26.buildWorker"), "0"); assert.equal(C.enabled(), false);
  mem.set("apex26.buildWorker", "1"); assert.equal(C.enabled(), true, "\"1\" is on");
  mem.set("apex26.buildWorker", "0"); assert.equal(C.enabled(), false);
  delete main.localStorage;
});
