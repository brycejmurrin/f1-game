// custom-tracks-stale — js/editor/custom-tracks.js, issue #5048.
//
// 1. A stored design is re-judged against TODAY's TrackValidate rules: a design
//    that sanitises (so it still loads and races) but that the validator now
//    marks RED is flagged (`CustomTracks.stale(id)`) and named in one banner.
// 2. A `#track=` share link whose designer bundle does not load is stripped
//    from the URL and announced once, instead of retrying on every menu return;
//    the TRACK DESIGNER door retries it.
//
// The REAL engine, registry and validator in one VM (the page's load order).
// Run: node --test tests/unit/custom-tracks-stale.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BOOT = ["js/core/hash32.js", "js/editor/track-themes.js", "js/editor/custom-tracks.js"];
const VALIDATOR = ["js/editor/shape.js", "js/editor/validate.js"];

const q = (v) => Math.round(v * 4) / 4;
const ellipse = (n, a, b) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [q(a * Math.cos(t)), q(b * Math.sin(t))]; });
const design = (extra) => Object.assign({ name: "Good Loop", seed: 7, theme: "parkland", baseHW: 7, pts: ellipse(36, 760, 480) }, extra);
// Sanitises (the engine builds it) but is a 1.03 km lap: RED on today's 2.5 km floor.
const SHORT = design({ name: "Short Loop", pts: ellipse(24, 200, 130) });

function boot(items, { bundle = "ok" } = {}) {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext;
  const data = { customTracks: { v: 1, items } };
  ctx.GameStore = { store: {
    get: (k, d) => (k in data ? JSON.parse(JSON.stringify(data[k])) : d),
    set: (k, v) => { data[k] = v; },
    write: (k, v) => { data[k] = v; return { ok: true, durable: true }; },
    rawDel: (k) => { delete data[k]; },
  } };
  const warns = [], said = [], urls = [], loads = [], opened = [];
  ctx.Log = { info() {}, debug() {}, warn: (_ns, m) => warns.push(m) };
  ctx.setTimeout = (fn) => setImmediate(fn);
  ctx.location = { hash: "", pathname: "/", search: "" };
  ctx.history = { state: null, replaceState(_s, _t, url) { urls.push(url); const i = url.indexOf("#"); ctx.location.hash = i < 0 ? "" : url.slice(i); } };
  ctx.ApexRoster = { LAZY_EDITOR: VALIDATOR, LAZY_EDITOR_EDGES: [] };
  const run = (f) => vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  for (const f of BOOT) run(f);
  const state = { bundle, inRace: false };
  ctx.UiLayers = { inRace: () => state.inRace, top: () => "title" };
  const G = { trackIdx: 0, announce: (msg) => { said.push(msg); return true; } };
  const door = {};
  const hooks = { door, load: async (files) => {
    loads.push(files.length);
    if (state.bundle === "reject") throw new Error("offline");
    if (state.bundle !== "ok") return false;
    if (!ctx.TrackValidate) for (const f of files) run(f);
    ctx.TrackDesigner = { init() {}, open: (o) => opened.push(o || null) };
    return true;
  } };
  const C = ctx.CustomTracks;
  C.create(G, hooks);
  const select = (id) => { G.trackIdx = Tracks.LIST.findIndex((t) => t.id === id); };
  return { Tracks, ctx, C, G, state, warns, said, urls, loads, opened, door, select };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

test("a stored design that fails today's validator is flagged; a passing one is not", async () => {
  const b = boot([design(), SHORT]);
  const [good, short] = b.Tracks.LIST.filter((t) => t.custom).map((t) => t.id);
  assert.ok(good && short, "both designs sanitise and reach the picker");
  assert.equal(b.C.stale(short), null, "unjudged reads null: nothing is flagged on a guess");
  assert.equal(await b.C.judgeStored(), 2);
  assert.equal(b.C.stale(good), null);
  assert.equal(b.C.stale(short), "Lap is 1.03 km — at least 2.5 km", "the validator's own first RED message");
  assert.equal(await b.C.judgeStored(), 0, "a judged design is not judged twice");
  assert.equal(b.loads.length, 1, "one bundle load");
});

test("the selected stale circuit is named in ONE banner per session", async () => {
  const b = boot([design(), SHORT]);
  const short = b.Tracks.LIST.filter((t) => t.custom)[1].id;
  b.select(short);
  assert.equal(await b.C.consumeTrackHash(), false, "no share link");
  await settle();
  assert.deepEqual(b.said, ["SHORT LOOP BREAKS TODAY'S TRACK RULES — FIX IT IN TRACK DESIGNER"]);
  assert.ok(b.warns.some((w) => w.includes(short) && w.includes("at least 2.5 km")), "the log carries the rule");
  await b.C.consumeTrackHash(); await settle();   // the next menu return
  assert.equal(b.said.length, 1, "not said again");
  assert.equal(b.C.tellStale(b.Tracks.LIST.filter((t) => t.custom)[0].id), false, "a passing circuit is never announced");
});

test("no custom circuit selected and no validator resident: the designer bundle is not loaded", async () => {
  const b = boot([design(), SHORT]);
  await b.C.consumeTrackHash(); await settle();
  assert.equal(b.loads.length, 0, "a player on a shipped circuit never pays for the bundle");
  assert.deepEqual(b.said, []);
});

test("nothing is judged or announced during a race", async () => {
  const b = boot([SHORT]);
  b.select(b.Tracks.LIST.find((t) => t.custom).id);
  b.state.inRace = true;
  await b.C.consumeTrackHash(); await settle();
  assert.equal(b.loads.length, 0);
  assert.deepEqual(b.said, []);
});

test("a sweep whose bundle does not load is not retried on every menu return", async () => {
  const b = boot([SHORT], { bundle: "missing" });
  b.select(b.Tracks.LIST.find((t) => t.custom).id);
  for (let i = 0; i < 3; i++) { await b.C.consumeTrackHash(); await settle(); }
  assert.equal(b.loads.length, 1, "one attempt");
  assert.equal(b.warns.length, 1, b.warns.join(" | "));
  b.state.bundle = "ok";
  assert.equal(await b.C.judgeStored(), 1, "an explicit judge (the picker, the designer door) still loads it");
  await b.C.consumeTrackHash(); await settle();
  assert.equal(b.said.length, 1, "and the next menu return names the circuit");
});

test("an edited design is a new content id: the old verdict goes, the new one is judged", async () => {
  const b = boot([SHORT]);
  const id = b.Tracks.LIST.find((t) => t.custom).id;
  await b.C.judgeStored();
  assert.ok(b.C.stale(id));
  const r = b.C.upsert(design({ name: "Short Loop" }), { replace: id });
  assert.equal(r.ok, true);
  assert.equal(b.C.stale(id), null, "the old id's verdict went with it");
  assert.equal(b.C.stale(r.id), null);
  assert.equal(await b.C.judgeStored(), 1);
  assert.equal(b.C.stale(r.id), null, "the fixed loop passes");
});

for (const bundle of ["missing", "reject"]) {
  test(`a #track= link whose bundle does not load (${bundle}) is stripped and announced once`, async () => {
    const b = boot([], { bundle });
    b.ctx.location.hash = "#track=APXT1.abc&vs=9";
    assert.equal(await b.C.consumeTrackHash(), false);
    assert.equal(b.ctx.location.hash, "#vs=9", "only the track fragment is removed");
    assert.equal(await b.C.consumeTrackHash(), false);   // the menu return
    assert.equal(await b.C.consumeTrackHash(), false);
    await settle();
    assert.equal(b.loads.length, 1, "the bundle is not retried on a menu return");
    assert.equal(b.warns.length, 1, b.warns.join(" | "));
    assert.deepEqual(b.said, ["TRACK LINK DID NOT LOAD — TAP TRACK DESIGNER TO RETRY"]);
  });
}

test("the TRACK DESIGNER door retries the lost link once the bundle loads", async () => {
  const b = boot([], { bundle: "missing" });
  b.ctx.location.hash = "#track=APXT1.abc";
  await b.C.consumeTrackHash();
  assert.equal(b.ctx.location.hash, "");
  b.state.bundle = "ok";
  const decoded = [];
  // The codec is part of the real bundle; this link's payload is the test's own.
  b.ctx.TrackCodec = { fromHash: (h) => /track=([^&]+)/.exec(h)[1], decode: async (code) => { decoded.push(code); return { ok: true, id: "custom-1", design: { name: "Shared" } }; },
    withoutTrack: (h) => h.replace(/[#&]?track=[^&]*/, "") };
  await b.door.onclick(); await settle();
  assert.deepEqual(decoded, ["APXT1.abc"], "the same link, decoded on the retry");
  assert.equal(b.opened.length, 1);
  assert.equal(b.opened[0].shared, true, "opened as the shared design, not a blank designer");
  assert.equal(b.ctx.location.hash, "", "and stripped as on a first arrival");
  await b.door.onclick(); await settle();
  assert.equal(b.opened.length, 2);
  assert.equal(b.opened[1], null, "the next tap is the ordinary door");
});
