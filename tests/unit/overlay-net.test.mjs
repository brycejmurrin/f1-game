/* overlay-net.test.mjs — STREAM OVERLAY over the multiplayer wire (#1552): OverlayNet.hub (game) and
 * OverlayNet.view (overlay.html) over NetTransport.loopback() with latency, loss and jitter.
 * Run: node --test tests/unit/overlay-net.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = (rel, name) => eval(fs.readFileSync(path.join(ROOT, rel), "utf8") + ";" + name);
seedLogGlobal();
globalThis.NetBytes = load("js/net/bytes.js", "NetBytes");
globalThis.NetIce = load("js/net/ice.js", "NetIce");
const T = globalThis.NetTransport = load("js/net/transport.js", "NetTransport");
const OverlayFeed = globalThis.OverlayFeed = load("js/overlay/feed.js", "OverlayFeed");
const OverlayNet = load("js/net/overlay-net.js", "OverlayNet");

const ranked = [{ pos: 1, code: "NOR", team: "#f80", isPlayer: true }, { pos: 2, code: "VER", team: "#00f", intervalS: 1.2, gapToLeaderS: 1.2 }];
const mk = (seq, caption) => OverlayFeed.frame({ seq, t: seq / 4, state: "race", track: "monza", lap: 3, laps: 10, ranked, caption });

// Both ends pump on their own clocks; step wire time in 10 ms ticks.
function rig(opts) {
  const [ea, eb] = T.loopback({ latencyMs: 40, jitterMs: 25, loss: 0.3, rnd: T.seededRnd(7), ...opts });
  let t = 0;
  const hub = OverlayNet.hub({ pump: false, now: () => t });
  const got = [];
  ea.pump(0); eb.pump(0);
  const viewer = OverlayNet.view(eb, (f) => got.push(f), { pump: false, now: () => t });
  hub.add(ea);
  const step = (ms) => { for (let i = 0; i < ms / 10; i++) { t += 10; hub.pump(); viewer.pump(); } };
  return { hub, viewer, got, step };
}

test("no viewer until its hello; the first frame after it is FULL", () => {
  const r = rig({ loss: 0 });
  assert.equal(r.hub.peers(), 0);
  r.step(500);
  assert.equal(r.hub.peers(), 1);
  assert.equal(r.hub.takeFresh(), true);
  const differ = OverlayFeed.createDiffer();
  assert.equal(r.hub.send(differ.next(mk(1), 0)), true);
  r.step(2000);
  assert.ok(r.got.length >= 1, "the full frame reaches the viewer");
  assert.equal(r.got[0].full, true);
});

test("lossy, jittered wire: ordered, stale seqs dropped, captions fire once", () => {
  const r = rig({});
  r.step(500);
  const differ = OverlayFeed.createDiffer();
  const cap = { id: "c1", who: "NOR", text: "Great move", kind: "radio" };
  for (let s = 1; s <= 60; s++) {
    r.hub.send(differ.next(mk(s, s >= 10 && s < 30 ? cap : null), s * 250));
    r.step(250);
  }
  r.step(1000);
  const seqs = r.got.map((f) => f.seq);
  assert.ok(seqs.length > 20, "most frames arrive at 30% loss");
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "never out of order");
  assert.equal(new Set(seqs).size, seqs.length, "never twice");
  const withCaption = r.got.filter((f) => f.caption && f.caption.id === "c1" && !f.full);
  assert.ok(withCaption.length <= 1, "a patch repeats a caption at most once");
});

test("a replayed or reordered frame is ignored", () => {
  const r = rig({ loss: 0, jitterMs: 0 });
  r.step(500);
  r.hub.send(mk(5)); r.step(200);
  r.hub.send(mk(4)); r.hub.send(mk(5)); r.step(200);
  assert.deepEqual(r.got.map((f) => f.seq), [5]);
  assert.equal(r.viewer.stats().stale, 2);
});

test("a viewer that closes drops the peer count", () => {
  const r = rig({ loss: 0 });
  r.step(500);
  assert.equal(r.hub.peers(), 1);
  r.viewer.close(); r.step(300);
  assert.equal(r.hub.peers(), 0);
});

test("overlayUrl / codeFromHash round-trip; MAX_VIEWERS caps links", () => {
  assert.equal(OverlayNet.overlayUrl("ABC234", "https://x.test/game/index.html?a=1#b"), "https://x.test/game/overlay.html#ov=ABC234");
  assert.equal(OverlayNet.codeFromHash("#ov=abc234"), "ABC234");
  assert.equal(OverlayNet.codeFromHash("#x=1"), null);
  const hub = OverlayNet.hub({ pump: false });
  for (let i = 0; i < OverlayNet.MAX_VIEWERS; i++) {
    const [ea, eb] = T.loopback({ latencyMs: 0 });
    const l = hub.add(ea);
    l.open = true;
  }
  const [extra] = T.loopback({ latencyMs: 0 });
  assert.equal(hub.add(extra), null);
});
