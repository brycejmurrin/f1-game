/* ghost-share.test.mjs — portable APXG1 ghost envelopes and session-only rivals.
 *
 * Run: node --test tests/unit/ghost-share.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";
import { fnSource } from "../helpers/fn-source.mjs";   // title-flow.js is not a game.js carve-out

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/ghost-monza-short.json"), "utf8"));

function harness(opts = {}) {
  const tracks = opts.tracks || ["monza", "spa"];
  const writes = [];
  const notices = [];
  const location = {
    origin: "https://example.test",
    pathname: "/f1-game/",
    href: opts.href || "https://example.test/f1-game/",
    hash: opts.hash || "",
  };
  const history = {
    state: { keep: true },
    replaceState(state, _title, href) {
      writes.push({ state, href });
      location.href = href;
      location.hash = new URL(href).hash;
    },
  };
  const sandbox = {
    module: { exports: {} },
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Blob,
    Response,
    CompressionStream: opts.plain ? undefined : CompressionStream,
    DecompressionStream: opts.plain ? undefined : DecompressionStream,
    btoa,
    atob,
    URL,
    location,
    history,
    Tracks: { LIST: tracks.map((id) => ({ id, lengthKm: opts.lengths && opts.lengths[id] })) },
    Ghost: { track: () => opts.currentTrack || "monza" },
  };
  Object.defineProperty(sandbox, "localStorage", {
    get() { throw new Error("guest sharing must not touch localStorage"); },
  });
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/car/ghost-share.js"), "utf8"), ctx, {
    filename: "js/car/ghost-share.js",
  });
  const GhostShare = sandbox.module.exports || vm.runInContext("GhostShare", ctx);
  return { GhostShare, location, history, writes, notices, notify: (message) => notices.push(message) };
}

test("APXG1 encode/decode round-trip preserves lap time and samples", async () => {
  const { GhostShare } = harness();
  const encoded = await GhostShare.encode(fixture, { track: "monza", context: "standard", day: "2026-09-18" });
  assert.equal(encoded.ok, true);
  assert.match(encoded.code, /^APXG1\.[zp]\.[A-Za-z0-9_-]+$/);
  assert.equal(encoded.url, "https://example.test/f1-game/#ghost=" + encoded.code);

  const decoded = await GhostShare.decode(encoded.code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.track, "monza");
  assert.equal(decoded.context, "standard");
  assert.equal(decoded.day, "2026-09-18");
  assert.equal(decoded.ghost.time, fixture.time);
  assert.equal(decoded.ghost.t.length, fixture.t.length);
  assert.equal(decoded.ghost.s.length, fixture.s.length);
  assert.equal(decoded.ghost.x.length, fixture.x.length);
});

test("plain APXG1 fallback round-trips when stream compression is unavailable", async () => {
  const { GhostShare } = harness({ plain: true });
  const encoded = await GhostShare.encode(fixture, { track: "monza" });
  assert.equal(encoded.ok, true);
  assert.match(encoded.code, /^APXG1\.p\./);
  assert.equal((await GhostShare.decode(encoded.code)).ok, true);
});

test("corrupt APXG1 payload is refused without throwing", async () => {
  const { GhostShare } = harness();
  assert.deepEqual(
    JSON.parse(JSON.stringify(await GhostShare.decode("APXG1.z.not-valid"))),
    { ok: false, reason: "corrupt" },
  );
});

test("a ghost for an unknown circuit is refused", async () => {
  const { GhostShare } = harness({ plain: true });
  const encoded = await GhostShare.encode(fixture, { track: "imaginary-ring" });
  assert.equal(encoded.ok, true, "encoding is portable and does not depend on the sender's current track roster");
  assert.deepEqual(
    JSON.parse(JSON.stringify(await GhostShare.decode(encoded.code))),
    { ok: false, reason: "unknown-track" },
  );
});

// The last sample lands ON the lap time, as a recorded ghost's does (within
// one sample, js/car/ghost.js): GhostShare binds the claimed time to it.
const trace = (n, time) => ({
  time,
  t: Array.from({ length: n }, (_, i) => i * time / (n - 1)),
  s: Array.from({ length: n }, (_, i) => i * 3.7),
  x: Array.from({ length: n }, (_, i) => (i % 101) / 100),
});

test("a long lap still shares: the LINK's copy is thinned to fit, the file keeps every sample", async () => {
  // Bug hunt 2026-09-22: a Spa-length lap overflowed the 14 KiB fragment, and
  // the download it offered instead could be imported nowhere.
  const { GhostShare } = harness({ plain: true });
  const long = trace(3500, 130);
  const encoded = await GhostShare.encode(long, { track: "monza" });
  assert.equal(encoded.ok, true, "a 130 s lap gets a link");
  assert.ok(encoded.thinned > 0, "…by thinning the link's copy");
  assert.ok(encoded.code.length - 8 <= 14 * 1024);
  assert.equal(JSON.parse(encoded.file.text).t.length, 3500, "the download is the full trace");
  const back = await GhostShare.decode(encoded.url);
  assert.equal(back.ok, true);
  assert.ok(back.ghost.t.length < 3500 && back.ghost.t.length >= 8);
  assert.equal(back.ghost.t[back.ghost.t.length - 1], long.t[3499], "the thinned trace keeps its last sample");
});

test("fragment sharing softly refuses what no thinning fits, while retaining a file export", async () => {
  const { GhostShare } = harness({ plain: true });
  // The most a recorded lap holds (600 s at 20 Hz) with full-precision samples:
  // even a 1/16 thinning is past the 14 KiB fragment. (80000 samples used here
  // is not a lap any more: validGhost caps the count.)
  const dense = trace(12000, 600);
  dense.x = dense.x.map((_, i) => Math.sin(i * 1.618) * 40 + 0.123456789012);
  dense.s = dense.s.map((_, i) => i * 3.7 + 0.123456789012 * (i % 7));
  const encoded = await GhostShare.encode(dense, { track: "monza" });
  assert.equal(encoded.ok, false);
  assert.equal(encoded.reason, "too-large");
  assert.match(encoded.file.name, /\.apexghost\.json$/);
  assert.equal(JSON.parse(encoded.file.text).track, "monza");
});

test("the downloaded file's own JSON text decodes as a ghost", async () => {
  const { GhostShare } = harness({ plain: true });
  const file = GhostShare.fileExport(trace(40, 90), { track: "monza" });
  const back = await GhostShare.decode(file.text);
  assert.equal(back.ok, true);
  assert.equal(back.track, "monza");
  assert.equal(back.ghost.t.length, 40);
  assert.equal((await GhostShare.decode("{not json")).ok, false);
});

test("guest install, replay interpolation, and clear stay in memory", () => {
  const { GhostShare } = harness();
  const decoded = { ok: true, ghost: fixture, track: "monza", context: null, day: null, meta: null };
  assert.equal(GhostShare.installGuest(decoded), true);
  assert.equal(GhostShare.guest().ghost.time, fixture.time);
  assert.equal(GhostShare.hasGuest(), true);
  assert.equal(GhostShare.bestTime(), fixture.time);
  assert.ok(GhostShare.at(0.75).s > fixture.s[1]);
  assert.ok(GhostShare.timeAt(110) > fixture.t[2]);
  GhostShare.clearGuest();
  assert.equal(GhostShare.guest(), null);
  assert.equal(GhostShare.hasGuest(), false);
});

test("a guest is inactive away from its shared circuit", () => {
  const { GhostShare } = harness({ currentTrack: "spa" });
  GhostShare.installGuest({ ok: true, ghost: fixture, track: "monza" });
  assert.equal(GhostShare.guest().track, "monza", "the session slot remains available for returning to the circuit");
  assert.equal(GhostShare.hasGuest(), false);
  assert.equal(GhostShare.at(1), null);
});

test("consumeHash installs the guest and removes only #ghost", async () => {
  const producer = harness({ plain: true });
  const encoded = await producer.GhostShare.encode(fixture, { track: "monza" });
  const href = "https://example.test/f1-game/?mode=tt#panel=results&ghost=" + encoded.code + "&camera=chase";
  const h = harness({ plain: true, href, hash: new URL(href).hash });
  const consumed = await h.GhostShare.consumeHash({ notify: h.notify });

  assert.equal(consumed.ok, true);
  assert.equal(h.GhostShare.guest().track, "monza");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].href, "https://example.test/f1-game/?mode=tt#panel=results&camera=chase");
  assert.deepEqual(h.writes[0].state, { keep: true });
  assert.match(h.notices[0], /Rival ghost loaded/i);
});

test("consumeHash clears a corrupt ghost fragment and reports the refusal", async () => {
  const href = "https://example.test/f1-game/#ghost=APXG1.z.broken&panel=title";
  const h = harness({ href, hash: new URL(href).hash });
  const consumed = await h.GhostShare.consumeHash({ notify: h.notify });

  assert.deepEqual(JSON.parse(JSON.stringify(consumed)), { ok: false, reason: "corrupt" });
  assert.equal(h.GhostShare.guest(), null);
  assert.equal(h.writes[0].href, "https://example.test/f1-game/#panel=title");
  assert.match(h.notices[0], /corrupt/i);
});

test("consumeHash is a no-op when the fragment has no ghost", async () => {
  const href = "https://example.test/f1-game/#panel=title";
  const h = harness({ href, hash: new URL(href).hash });
  assert.equal(await h.GhostShare.consumeHash({ notify: h.notify }), null);
  assert.equal(h.writes.length, 0);
  assert.equal(h.notices.length, 0);
});

test("a replaced link survives the older decode without installing or announcing it", async () => {
  const h = harness({ plain: true });
  const first = await h.GhostShare.encode(fixture, { track: "monza" });
  const second = await h.GhostShare.encode(fixture, { track: "spa" });
  h.location.hash = "#ghost=" + first.code;
  h.location.href = h.location.origin + h.location.pathname + h.location.hash;
  const pending = h.GhostShare.consumeHash({ notify: h.notify });
  h.location.hash = "#ghost=" + second.code;
  h.location.href = h.location.origin + h.location.pathname + h.location.hash;
  assert.equal(await pending, null);
  assert.equal(h.GhostShare.guest(), null);
  assert.equal(h.writes.length, 0);
  assert.equal(h.notices.length, 0);
  assert.equal((await h.GhostShare.consumeHash({ notify: h.notify })).track, "spa");
  assert.equal(h.GhostShare.guest().track, "spa");
});

test("overlapping reads of the same link install and notify only once", async () => {
  const h = harness({ plain: true });
  const encoded = await h.GhostShare.encode(fixture, { track: "monza" });
  h.location.hash = "#ghost=" + encoded.code;
  h.location.href = h.location.origin + h.location.pathname + h.location.hash;
  const first = h.GhostShare.consumeHash({ notify: h.notify });
  const second = h.GhostShare.consumeHash({ notify: h.notify });
  assert.equal(await first, null);
  assert.equal((await second).ok, true);
  assert.equal(h.notices.length, 1);
  assert.equal(h.writes.length, 1);
});

test("starting a race during ghost decoding preserves the link until returning to the menu", async () => {
  const h = harness({ plain: true });
  const encoded = await h.GhostShare.encode(fixture, { track: "monza" });
  h.location.hash = "#ghost=" + encoded.code;
  h.location.href = h.location.origin + h.location.pathname + h.location.hash;
  let racing = false, opens = 0;
  const ctx = vm.createContext({
    GhostShare: h.GhostShare, UiLayers: { inRace: () => racing, top: () => null }, Log: { info() {} },
    els: { overlay: { hidden: false } },
    announce: h.notify, setFlow() {}, session: "race", DailyChallenge: { dayKey: () => "2026-09-29" },
    daily: { stop() {} }, restoreFreePlaySelection() {}, Tracks: { LIST: [{ id: "monza" }] },
    trackIdx: 0, buildSelect() { opens++; }, vt() {}, scheduleFlybyTrack() {},
  });
  ctx.G = { announce: h.notify, session: "race", daily: { stop() {} }, trackIdx: 0, buildSelect() { opens++; }, scheduleFlybyTrack() {} };
  const consume = vm.runInContext("(" + symbolSource("async function consumeGhostHash()") + ")", ctx);
  const pending = consume();
  racing = true;
  assert.equal(await pending, null);
  assert.equal(opens, 0);
  assert.equal(h.GhostShare.guest(), null);
  assert.equal(h.writes.length, 0);
  assert.equal(h.notices.length, 0);
  assert.ok(h.location.hash.includes("ghost="));
  racing = false;
  assert.equal((await consume()).ok, true);
  assert.equal(opens, 1);
  assert.equal(h.GhostShare.guest().track, "monza");
  assert.equal(h.location.hash, "");
});

// Bug hunt 2 H13: the guard was race-only, so a #ghost= hashchange while the
// RESULTS sheet, the quali sheet, the RACE loading plate or the career hub was up
// set flow="gp"/session="tt" and opened the picker over (or under) it. The link now
// waits, fragment intact, unless the TITLE is the live layer; quitToMenu re-calls it.
test("a ghost link landing over a non-title layer waits, fragment intact, for the title", async () => {
  const h = harness({ plain: true });
  const encoded = await h.GhostShare.encode(fixture, { track: "monza" });
  h.location.hash = "#ghost=" + encoded.code;
  h.location.href = h.location.origin + h.location.pathname + h.location.hash;
  let topId = "results", overlayHidden = true, opens = 0;
  const G = { announce: h.notify, flow: "season", session: "race", daily: { stop() {} }, trackIdx: 0,
    buildSelect() { opens++; }, scheduleFlybyTrack() {} };
  const ctx = vm.createContext({
    G, GhostShare: h.GhostShare, Log: { info() {} },
    UiLayers: { inRace: () => false, top: () => (topId ? { id: topId } : null) },
    els: { get overlay() { return { hidden: overlayHidden }; } },
    DailyChallenge: { dayKey: () => "2026-09-29" }, restoreFreePlaySelection() {},
    Tracks: { LIST: [{ id: "monza" }] }, vt() {},
  });
  const source = fs.readFileSync(path.join(ROOT, "js/ui/title-flow.js"), "utf8");
  const consume = vm.runInContext("(" + fnSource(source, "async function consumeGhostHash()") + ")", ctx);
  for (const [id, hidden] of [["results", true], ["quali", true], ["loading", false], ["career", true], [null, true]]) {
    topId = id; overlayHidden = hidden;
    assert.equal(await consume(), null, `deferred over ${id || "a hidden title"}`);
    assert.equal(opens, 0);
    assert.equal(G.flow, "season", "flow untouched");
    assert.equal(G.session, "race", "session untouched");
    assert.ok(h.location.hash.includes("ghost="), "fragment kept for quitToMenu's re-call");
  }
  topId = "overlay"; overlayHidden = false;   // back on the title: the same link now lands
  assert.equal((await consume()).ok, true);
  assert.equal(opens, 1);
  assert.equal(G.session, "tt");
  assert.equal(h.location.hash, "");
});

function resultsHarness({ ghost = null, guest = false } = {}) {
  const dom = makeDom();
  const Ghost = {
    hasGhost: () => !!ghost,
    bestTime: () => ghost ? ghost.time : Infinity,
    medal: () => null,
    context: () => null,
    snapshot: () => ghost,
    clear() {},
  };
  const GhostShare = {
    hasGuest: () => guest,
    bestTime: () => guest ? 79 : Infinity,
    encode: async () => ({ ok: true, code: "APXG1.p.code", url: "https://example.test/#ghost=APXG1.p.code" }),
    fileExport: () => ({ ok: true, name: "lap.apexghost.json", text: "{}" }),
  };
  const sandbox = {
    document: dom.document,
    navigator: {},
    URL: { createObjectURL: () => "blob:ghost", revokeObjectURL() {} },
    Blob,
    Math, JSON, Object, Array, String, Number, Set, Map, isFinite,
    Ghost, GhostShare,
    Teams: { POINTS: [], LIST: [] },
    SeasonCal: { scored: () => "race" },
    Quali: { MEDALS: [], MEDAL_RANK: {} },
    Career: { objectiveLabel: () => "", OBJ_BONUS: 0 },
    GameAudio: { finish() {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  const source = fs.readFileSync(path.join(ROOT, "js/ui/results-sheet.js"), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(source, ctx, { filename: "js/ui/results-sheet.js" });
  const G = {
    els: {
      resultsTable: dom.byId("results-table"),
      resultsTitle: dom.byId("results-title"),
      resNext: dom.byId("res-next"),
    },
    track: { def: { id: "monza", name: "Monza" } },
    player: { best: 80 },
    ttNewRecord: false,
    ttSessionTs: 0,
    records: { board: () => [], key: () => null },
    referencePole: () => 0,
    teamById: () => null,
    cssCol: () => "#fff",
    fmtTime: (value) => value.toFixed(3),
    daily: { isActive: () => false, current: () => null },
  };
  const api = vm.runInContext("GameResults", ctx).create(G);
  api.buildTTResults();
  return { dom, G };
}

test("time-trial results offer link, code, and file only for a shareable local ghost", () => {
  const none = resultsHarness();
  assert.equal(none.dom.has("res-ghost-copy-link"), false);
  assert.equal(none.dom.has("res-ghost-download"), false);

  const shared = resultsHarness({ ghost: fixture });
  assert.equal(shared.dom.byId("res-ghost-copy-link").textContent, "COPY LINK");
  assert.equal(shared.dom.byId("res-ghost-copy-code").textContent, "COPY CODE");
  assert.equal(shared.dom.byId("res-ghost-download").textContent, "DOWNLOAD");
});

test("time-trial results identify a loaded guest as the rival ghost", () => {
  const h = resultsHarness({ ghost: fixture, guest: true });
  const row = h.dom.byId("results-table").children.find((child) =>
    child.children && child.children.some((part) => part.textContent === "RIVAL GHOST"));
  assert.ok(row, "the delta row names the guest rival instead of the player's PB");
});

test("Phase 1 wires sharing into load order, results, boot/hashchange, HUD, and world replay", () => {
  const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
  const manifest = read("tools/manifest.cjs");
  const results = read("js/ui/results-sheet.js");
  const game = gameSource();   // game.js + its carved modules (title-flow.js among them)
  const hud = read("js/ui/hud.js");

  assert.match(manifest, /"js\/car\/ghost\.js",\s*"js\/car\/ghost-share\.js"/);
  assert.match(results, /res-ghost-copy-link/);
  assert.match(results, /res-ghost-copy-code/);
  assert.match(results, /res-ghost-download/);
  assert.match(game, /GhostShare\.consumeHash/);
  assert.match(game, /addEventListener\("hashchange"/);
  // Bug hunt 2026-09-27: a ghost link arriving MID-RACE yanked the player to the
  // time-trial select. It must bail BEFORE consumeHash strips the fragment, and
  // quitToMenu must pick the deferred link up (the #353 invite-link rule).
  const ghostFn = game.slice(game.indexOf("async function consumeGhostHash()"));
  assert.ok(ghostFn.indexOf("UiLayers.inRace()") >= 0 &&
            ghostFn.indexOf("UiLayers.inRace()") < ghostFn.indexOf("GhostShare.consumeHash"),
    "the race guard must run before the fragment is consumed");
  const quit = game.slice(game.indexOf("function quitToMenu()"));
  assert.match(quit.slice(0, quit.indexOf("\n}\n")), /consumeGhostHash\(\)/,
    "returning to the menu lands a ghost link deferred while racing");
  assert.match(game, /GhostShare\.hasGuest\(\)\s*\?\s*GhostShare\s*:\s*Ghost/);
  assert.match(hud, /GhostShare\.hasGuest\(\)\s*\?\s*GhostShare\s*:\s*Ghost/);
  assert.match(hud, /RIVAL GHOST/);
});

// ── the claimed time is bound to the trace (2026-10-04) ────────────────────
// validGhost checked only `time > 0`, so a hand-edited link could show any
// "best time" against an ordinary trace.
test("a link whose lap time does not match its own trace is refused", async () => {
  const { GhostShare } = harness({ plain: true });
  const g = trace(40, 90);
  assert.equal(GhostShare.fileExport({ ...g, time: 60 }, { track: "monza" }).ok, false,
    "a 60 s claim on a trace that ends at 90 s is not exportable");
  const body = JSON.parse(GhostShare.fileExport(g, { track: "monza" }).text);
  assert.equal(typeof body.h, "string", "the envelope carries the trace hash");
  assert.equal((await GhostShare.decode(JSON.stringify(body))).ok, true, "the untouched export decodes");
  // Edit the time AND the last sample together: still bound, but the hash breaks.
  const edited = { ...body, time: 80, t: [...body.t.slice(0, -1), 80] };
  assert.equal((await GhostShare.decode(JSON.stringify(edited))).ok, false, "an edit after export no longer matches h");
  // Edit the time alone on an old (hashless) link: refused by the binding.
  const old = { ...body, time: 70 };
  delete old.h;
  assert.equal((await GhostShare.decode(JSON.stringify(old))).ok, false, "a hashless link must still bind its time");
  const oldOk = { ...body };
  delete oldOk.h;
  assert.equal((await GhostShare.decode(JSON.stringify(oldOk))).ok, true, "an old link that binds still loads");
});

test("a thinned link keeps its time bound to the trace", async () => {
  const { GhostShare } = harness();
  const long = trace(9000, 135);
  const r = await GhostShare.encode(long, { track: "spa" });
  assert.equal(r.ok, true);
  assert.ok(r.thinned > 0, "precondition: the link copy was thinned");
  const back = await GhostShare.decode(r.code);
  assert.equal(back.ok, true, "thinning keeps the last sample, so the time still binds and the hash matches");
  assert.equal(back.ghost.time, 135);
});

// SEC2-3 / CAR-4: `h` is an unkeyed hash the sender computes, so a crafted link
// can carry any finite number. The guest is drawn at `smp.p + r * g.x`, so the
// samples are bounded to what a recorded lap can hold, and `meta` (shown by the
// results sheet) keeps only the keys session-records writes.
test("a crafted ghost with absurd x, s, t or sample count is refused (CORRUPT)", async () => {
  const { GhostShare } = harness({ plain: true });
  const ok = trace(40, 90);
  const body = (patch) => JSON.stringify({ ...JSON.parse(GhostShare.fileExport(ok, { track: "monza" }).text), ...patch });
  const mutate = (key, i, v) => { const a = ok[key].slice(); a[i] = v; return { [key]: a }; };
  assert.equal((await GhostShare.decode(body({}))).ok, true, "the untouched export decodes");
  for (const [what, patch] of [
    ["x = 1e308", mutate("x", 5, 1e308)],
    ["x = 61 m", mutate("x", 5, 61)],
    ["s = 1e6", mutate("s", 39, 1e6)],
    ["s < 0", mutate("s", 0, -1)],
  ]) {
    const r = await GhostShare.decode(body(patch));   // no `h` change: an old / crafted link omits or recomputes it
    const noHash = JSON.parse(body(patch)); delete noHash.h;
    assert.equal(r.ok, false, what + " is refused");
    assert.equal((await GhostShare.decode(JSON.stringify(noHash))).ok, false, what + " is refused without h too");
  }
  const edge = JSON.parse(body({})); edge.x[3] = -60; edge.x[4] = 60; delete edge.h;
  assert.equal((await GhostShare.decode(JSON.stringify(edge))).ok, true, "|x| = 60 m (half-width + run-off) is still a lap");
  const long = trace(13000, 650); const longBody = JSON.stringify({ ...JSON.parse(GhostShare.fileExport(trace(40, 90), { track: "monza" }).text), time: 650, t: long.t, s: long.s, x: long.x });
  assert.equal((await GhostShare.decode(longBody)).ok, false, "a lap past 600 s / 12000 samples is refused");
  assert.equal(GhostShare.fileExport({ ...ok, x: ok.x.map((v, i) => i === 5 ? 1e308 : v) }, { track: "monza" }).ok, false);
});

test("s is bounded by the circuit's own length when the circuit declares one", async () => {
  const { GhostShare } = harness({ plain: true, lengths: { monza: 5.8 } });
  const near = trace(40, 90);                         // s ends at 144 m
  const raw = JSON.parse(GhostShare.fileExport(near, { track: "monza" }).text);
  delete raw.h;
  raw.s = raw.s.map((v, i) => i * 17400 / 39);        // 3 x 5.8 km
  assert.equal((await GhostShare.decode(JSON.stringify(raw))).ok, true, "3 laps' worth of arc is the ceiling");
  raw.s = raw.s.map((v) => v * 1.01);
  assert.equal((await GhostShare.decode(JSON.stringify(raw))).ok, false, "past 3 x lengthKm is not this circuit's ghost");
});

test("shared ghost meta keeps only the whitelisted keys, strings <= 32 chars", async () => {
  const { GhostShare } = harness({ plain: true });
  const raw = JSON.parse(GhostShare.fileExport(trace(40, 90), { track: "monza" }).text);
  raw.meta = JSON.parse('{"__proto__":{"p":1},"name":"<img src=x onerror=alert(1)>","medal":"gold","pole":71.5,' +
    '"context":"' + "c".repeat(33) + '","weather":{"a":1},"pace":1,"difficulty":"hard"}');
  delete raw.h;
  const r = await GhostShare.decode(JSON.stringify(raw));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.meta).sort(), ["difficulty", "medal", "pace", "pole"]);
  assert.deepEqual(Object.keys(r.ghost.meta).sort(), ["difficulty", "medal", "pace", "pole"]);
  assert.equal(r.meta.medal, "gold");
  assert.equal(({}).p, undefined, "no prototype pollution");
  const out = GhostShare.fileExport({ ...trace(40, 90), meta: { medal: "gold", evil: "x" } }, { track: "monza" });
  assert.deepEqual(Object.keys(out.envelope.meta), ["medal"], "an export carries the same whitelist");
});
