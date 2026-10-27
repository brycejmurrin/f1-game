/* overlay-publisher.test.mjs — the same-browser overlay feed (#1551): OverlayBridge's
 * BroadcastChannel halves, OverlayPublisher's frame building from __apex reads and
 * its #announce caption tap, and the 4 Hz publish loop that runs only while an
 * overlay listens.
 *
 * Run: node --test tests/unit/overlay-publisher.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const j = (v) => JSON.parse(JSON.stringify(v));

// An in-memory BroadcastChannel: every instance of a name hears every OTHER one.
function bus() {
  const open = new Set();
  class FakeChannel {
    constructor(name) { this.name = name; this.onmessage = null; open.add(this); }
    postMessage(data) {
      const copy = JSON.parse(JSON.stringify(data));   // structured clone, near enough
      for (const ch of open) if (ch !== this && ch.name === this.name && ch.onmessage) ch.onmessage({ data: copy });
    }
    close() { open.delete(this); }
  }
  return { FakeChannel, open };
}
function timers() {
  const live = new Map(); let n = 0;
  return { live, setInterval: (fn) => { live.set(++n, fn); return n; }, clearInterval: (id) => live.delete(id),
    fire() { for (const fn of [...live.values()]) fn(); } };
}

function load(extra = {}) {
  const ctx = vm.createContext({ Object, Array, String, Number, Math, JSON, Map, Set, Date, Promise, console,
    Log: { info() {}, warn() {} }, setInterval() { return 0; }, clearInterval() {}, ...extra });
  for (const file of ["js/race/broadcast.js", "js/overlay/feed.js", "js/overlay/bridge.js", "js/overlay/publisher.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: absSrc(file) });
  }
  return { Bridge: vm.runInContext("OverlayBridge", ctx), Pub: vm.runInContext("OverlayPublisher", ctx),
    Feed: vm.runInContext("OverlayFeed", ctx) };
}

const FIELD = {
  t: 61.25, raceState: "race", lapsTarget: 12, player: { pos: 2, lap: 3 },
  positions: [
    { pos: 1, code: "LEC", team: "ferrari", isPlayer: false, retired: false, lap: 3, gapToLeaderS: 0, intervalS: 0 },
    { pos: 2, code: "YOU", team: "custom", isPlayer: true, retired: false, lap: 3, gapToLeaderS: 0.84, intervalS: 0.84 },
    { pos: 3, code: "VER", team: "redbull", isPlayer: false, retired: true, lap: 2, gapToLeaderS: 9.1, intervalS: 8.26 },
  ],
};
const TEAMS = [{ id: "ferrari", color: [0.91, 0, 0.18] }, { id: "custom", color: [1, 1, 1] }];

test("input maps __apex field/info/sectorState onto the v1 frame, with team colours and fieldBest", () => {
  const { Pub, Feed } = load();
  const frame = Feed.frame(Pub.input({
    seq: 7, field: FIELD, info: { state: "race", track: "monza" }, teams: TEAMS,
    sectors: { idx: 1, last: [25.1, null, null], bests: [25.1, null, null], fieldBest: [25.0, 28.2, 23.7] },
  }));
  assert.equal(frame.state, "race"); assert.equal(frame.track, "monza");
  assert.equal(frame.lap, 3); assert.equal(frame.laps, 12); assert.equal(frame.seq, 7);
  assert.deepEqual(j(frame.rows.map((r) => [r.pos, r.code, r.team, r.interval, r.you, r.pit])), [
    [1, "LEC", "rgb(232,0,46)", null, false, false],
    [2, "YOU", "rgb(255,255,255)", 0.84, true, false],
    [3, "VER", "", 8.26, false, true],
  ]);
  assert.equal(frame.sectors.last[0].tone, "green", "a PB that is not under the field best is green, not purple");
  const purple = Feed.frame(Pub.input({ field: FIELD, sectors: { last: [24.9], bests: [24.9], fieldBest: [25.0] } }));
  assert.equal(purple.sectors.last[0].tone, "purple");
  const empty = Feed.frame(Pub.input({ field: null, info: null }));
  assert.equal(empty.state, "idle"); assert.equal(empty.rows.length, 0);
});

test("the caption tap turns #announce changes into captions with fresh ids, and null when hidden", () => {
  const { Pub } = load();
  const els = { "announce-num": { textContent: "" }, "announce-who": { textContent: "" }, "announce-text": { textContent: "" } };
  const box = { hidden: true, dataset: {}, classList: { contains: () => false } };
  const doc = { getElementById: (id) => id === "announce" ? box : els[id] || null };
  let observer = null;
  class Obs { constructor(fn) { this.fn = fn; observer = this; } observe(target, opts) { this.opts = opts; } disconnect() { this.off = true; } }
  const seen = [];
  const tap = Pub.tapCaptions(doc, (c) => seen.push(c && j(c)), Obs);
  assert.ok(observer.opts.subtree && observer.opts.characterData);
  box.hidden = false; els["announce-num"].textContent = "04"; els["announce-who"].textContent = "NOR"; els["announce-text"].textContent = "Box this lap";
  box.dataset.kind = "radio";
  observer.fn(); observer.fn();
  els["announce-text"].textContent = "Push now";
  observer.fn();
  box.hidden = true; observer.fn();
  assert.deepEqual(seen, [{ n: "04", who: "NOR", text: "Box this lap", kind: "radio", id: "a1" },
    { n: "04", who: "NOR", text: "Push now", kind: "radio", id: "a2" }, null], "a repeat is not a new caption; hiding clears it");
  tap.disconnect();
  assert.equal(observer.off, true);
  assert.equal(Pub.tapCaptions({ getElementById: () => null }, () => {}, Obs), null);
});

test("bridge: an overlay's hello starts the host, frames reach it, a full frame greets each new overlay, bye stops it", () => {
  const { FakeChannel } = bus();
  const { Bridge, Pub } = load();
  let t = 0;
  const peers = [];
  const host = Bridge.host({ BroadcastChannel: FakeChannel, now: () => t, onPeers: (n) => peers.push(n) });
  const got = [];
  const tv = timers();
  const sub = Bridge.subscribe((f) => got.push(f), { BroadcastChannel: FakeChannel, timers: tv, id: "ov-1" });
  assert.deepEqual(peers, [1]);
  const pubTimers = timers();
  const apex = { field: () => FIELD, info: () => ({ state: "race", track: "monza" }), sectorState: () => null };
  const pub = Pub.start({ bridge: host, apex: () => apex, document: null, teams: TEAMS, timers: pubTimers });
  pub.tick(); pub.tick();
  assert.equal(got.length, 2);
  assert.equal(got[0].full, true, "a new overlay gets a full frame first");
  assert.equal(got[0].rows.length, 3, "the tower rows survive the channel");
  assert.equal(got[1].full, undefined, "then patches");
  assert.equal(got[1].rows, undefined, "an unchanged tower is not re-sent");
  Bridge.subscribe(() => {}, { BroadcastChannel: FakeChannel, timers: timers(), id: "ov-2" });
  pub.tick();
  assert.equal(got.at(-1).full, true, "a second overlay forces a full frame for it");
  t = Bridge.PEER_TTL_MS + 1;                 // ov-2 never beats again
  tv.fire();                                  // ov-1's heartbeat
  assert.equal(host.peers(), 1);
  sub.close();
  assert.deepEqual(j(peers), [1, 2, 1, 0]);
  pub.stop();
  assert.equal(pubTimers.live.size, 0);
  assert.equal(Bridge.subscribe(() => {}, { BroadcastChannel: null }), null, "no BroadcastChannel: no bridge");
});

test("the publisher boots only on the game page and never on overlay.html", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/overlay/publisher.js"), "utf8");
  assert.match(src, /!document\.querySelector\('main#overlay\[role="region"\]'\)\) OverlayPublisher\.boot\(\)/);
  assert.doesNotMatch(src, /Tracks\.curvature|\.speed\s*=|\.prog\s*=/, "read-only: no physics reads or car writes");
  const html = fs.readFileSync(path.join(ROOT, "overlay.html"), "utf8");
  assert.match(html, /js\/overlay\/bridge\.js[\s\S]*js\/overlay\/render\.js/);
  assert.doesNotMatch(html, /publisher\.js/);
  assert.match(fs.readFileSync(path.join(ROOT, "js/agent/apex-lobby.js"), "utf8"), /sectorState\(\) \{[\s\S]{0,600}fieldBest:/);
});
