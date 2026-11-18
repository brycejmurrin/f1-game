// preview-scenery-shift — issue #5081.
//
// The race-select preview builds a circuit's centreline on the build worker and
// the page ADOPTS the arrays (Tracks.adoptPreviewCenterline). An adopted
// centreline is a cache hit for Tracks.buildCenterline, so the page never ran
// the code that derives `def._sceneryShift`; the garage exterior then dressed
// the 18 circuits with a `sceneryStartFrac` at shift 0 (or NaN → props dropped).
//
// The REAL worker (js/track/build-worker.js in its own VM, replies crossing a
// structured clone with their transfer list) answers the REAL client
// (js/track/build-client.js) on a page VM that has never built the circuit.
// Run: node --test tests/unit/preview-scenery-shift.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = require("../../tools/manifest.cjs");
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const vmFiles = MANIFEST.TRACK_VM.flatMap((e) => (e === "@circuits" ? MANIFEST.CIRCUITS.map((id) => MANIFEST.circuitPath(id)) : [e]));

// One worker for the file: its own realm, importScripts reading the repo.
const posted = [];
const wctx = vm.createContext({ performance, console, URL, setTimeout, clearTimeout,
  postMessage: (m, t) => posted.push(structuredClone(m, { transfer: t || [] })) });
wctx.self = wctx;
wctx.importScripts = (...files) => { for (const f of files) { const rel = f.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, ""); vm.runInContext(read(rel), wctx, { filename: absSrc(rel) }); } };
vm.runInContext(read("js/track/build-worker.js"), wctx, { filename: absSrc("js/track/build-worker.js") });

/** A page that has built nothing: engine + garage exterior builder + the build client wired to the worker. */
function page({ dropShift = false } = {}) {
  const h = buildContext({ assets: false });
  const ctx = vm.createContext(h.sandbox);
  class BridgeWorker {
    postMessage(m) {
      const from = posted.length;
      Promise.resolve(wctx.onmessage({ data: structuredClone(m) })).then(() => {
        for (const reply of posted.splice(from)) {
          if (dropShift) delete reply.sceneryShift;   // a reply as the worker sent it before #5081
          this.onmessage({ data: reply });
        }
      });
    }
    terminate() {}
  }
  Object.assign(ctx, { Worker: BridgeWorker, URL, Promise, setTimeout, clearTimeout,
    navigator: { hardwareConcurrency: 4 },
    localStorage: { getItem: (k) => (k === "apex26.buildWorker" ? "1" : null), setItem() {} },
    location: { href: "http://x/index.html" },
    document: { readyState: "loading", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
    ApexRoster: { TRACK_VM: vmFiles, TRACK_WORKER_EXTRA: [] } });
  ctx.window = ctx;
  for (const f of ["js/track/build-client.js", "js/garage/exterior-geometry.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  const Tracks = h.Tracks;
  return { Tracks, client: ctx.TrackBuildClient, Builder: ctx.GarageExteriorGeometry, def: (id) => Tracks.LIST.find((d) => d.id === id) };
}
function exterior(p, id) {
  const it = p.Builder.buildSteps(p.def(id), { teamId: "ferrari" });
  let next; do { next = it.next(); } while (!next.done);
  assert.equal(next.value.supported, true, id + " exterior builds");
  return next.value;
}
const sha = (a) => createHash("sha1").update(Buffer.from(Float64Array.from(a).buffer)).digest("hex").slice(0, 16);
const dressing = (data) => ({ vertices: data.scenery.pos.length / 3, pos: sha(data.scenery.pos), first: Array.from(data.scenery.pos.slice(0, 3)) });

// The full path: buildCenterline on a def nothing previewed. The oracle for both tests.
const full = page();
const fullShift = (id) => { full.Tracks.buildCenterline(full.def(id), { line: false }); return full.def(id)._sceneryShift; };

for (const id of ["jerez", "monaco", "vegas"]) {
  test(`a worker preview of ${id} leaves the page def with the full build's _sceneryShift`, async () => {
    const p = page(), def = p.def(id);
    assert.notEqual(def.sceneryStartFrac, null, id + " is one of the shifted circuits");
    assert.equal(def._sceneryShift, undefined, "nothing built on this page yet");
    assert.equal(await p.client.previewMap(def), true, "the preview was adopted");
    const want = fullShift(id);
    assert.ok(want > 0.01 && want < 0.99, id + " has a real shift (" + want + ")");
    assert.equal(def._sceneryShift, want, "the page def carries exactly the full build's shift");
    const adopted = p.Tracks.buildCenterline(def, { line: false });
    assert.equal(adopted.total, full.Tracks.buildCenterline(full.def(id), { line: false }).total, "and the adopted centreline is the same lap");
  });
}

// monaco reads the shift through TrackSpace (0 → dressing 2/3 of a lap away); vegas reads
// `1 - api.def._sceneryShift` itself (undefined → NaN → props dropped).
for (const id of ["monaco", "vegas"]) {
  test(`the garage exterior after a select-screen preview dresses ${id} exactly as the full path does`, async () => {
    const want = dressing(exterior(full, id));
    assert.ok(want.vertices > 1000, id + " has authored scenery in the garage window");

    const p = page();
    assert.equal(await p.client.previewMap(p.def(id)), true);
    assert.deepEqual(dressing(exterior(p, id)), want, "same props at the same world positions");

    // A preview adopted WITHOUT the shift (an older worker reply, or any other adopt):
    // the exterior must rebuild the centreline rather than dress at shift 0.
    const old = page({ dropShift: true });
    assert.equal(await old.client.previewMap(old.def(id)), true);
    assert.equal(old.def(id)._sceneryShift, undefined, "the pre-#5081 state: adopted, no shift");
    assert.deepEqual(dressing(exterior(old, id)), want, "the exterior finalises the shift itself");
    assert.equal(old.def(id)._sceneryShift, fullShift(id));
  });
}
