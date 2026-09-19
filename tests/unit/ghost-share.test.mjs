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
    Tracks: { LIST: tracks.map((id) => ({ id })) },
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

test("fragment sharing softly refuses codes over 14 KiB while retaining a file export", async () => {
  const { GhostShare } = harness({ plain: true });
  const huge = {
    time: 130,
    t: Array.from({ length: 3500 }, (_, i) => i / 20),
    s: Array.from({ length: 3500 }, (_, i) => i * 3.7),
    x: Array.from({ length: 3500 }, (_, i) => (i % 101) / 100),
  };
  const encoded = await GhostShare.encode(huge, { track: "monza" });
  assert.equal(encoded.ok, false);
  assert.equal(encoded.reason, "too-large");
  assert.match(encoded.file.name, /\.apexghost\.json$/);
  assert.equal(JSON.parse(encoded.file.text).track, "monza");
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
  const game = read("js/game.js");
  const hud = read("js/ui/hud.js");

  assert.match(manifest, /"js\/car\/ghost\.js",\s*"js\/car\/ghost-share\.js"/);
  assert.match(results, /res-ghost-copy-link/);
  assert.match(results, /res-ghost-copy-code/);
  assert.match(results, /res-ghost-download/);
  assert.match(game, /GhostShare\.consumeHash/);
  assert.match(game, /addEventListener\("hashchange"/);
  assert.match(game, /GhostShare\.hasGuest\(\)\s*\?\s*GhostShare\s*:\s*Ghost/);
  assert.match(hud, /GhostShare\.hasGuest\(\)\s*\?\s*GhostShare\s*:\s*Ghost/);
  assert.match(hud, /RIVAL GHOST/);
});
