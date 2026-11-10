/* tv-graphics.test.mjs — the broadcast FASTEST LAP banner, driven by a REAL Broadcast.
 *
 * TvGraphics looked for `c.fastest` on G.ranked, which nothing ever sets, so the
 * banner never appeared. Broadcast already knows the holder (script.fastest, the
 * same value its tower paints purple); it now hands that to TvGraphics. This test
 * runs Broadcast.create → start → tick with no `fastest` on any ranked car.
 *
 * Run: node --test tests/unit/tv-graphics.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot() {
  const dom = makeDom();
  const ctx = { console, document: dom.document };
  vm.createContext(ctx);
  seedLog(ctx);
  for (const [f, name] of [["js/race/broadcast.js", "Broadcast"], ["js/overlay/feed.js", "OverlayFeed"], ["js/race/tv-graphics.js", "TvGraphics"]])
    vm.runInContext(source(f) + `;this.${name}=${name};`, ctx, { filename: absSrc(f) });
  return { ctx, dom };
}

test("a real Broadcast hands TvGraphics the fastest-lap holder: the banner shows once script.fastest is reached", () => {
  const { ctx, dom } = boot();
  // G.ranked as the watch puppets carry it: codes and positions, no `fastest` flag anywhere.
  const G = { hudProfile: "broadcast", state: "race", raceT: 0, lap: 3, laps: 10,
    ranked: [{ code: "LEC", pos: 1, prog: 3000, speed: 60 }, { code: "NOR", pos: 2, prog: 2000, speed: 60 }] };
  const script = { drivers: [{ num: 16, code: "LEC" }, { num: 4, code: "NOR" }], fastest: { num: 4, t: 50 } };
  const bc = ctx.Broadcast.create(G, {});
  bc.start({ auto: false, tower: false });
  const st = (T) => ({ script, T, speed: 1, list: [], reel: null, follow: null, isOut: () => false, carOf: () => null, running: () => [] });
  const banner = () => dom.document.getElementById("tvg-fastest");
  bc.tick(0.3, st(10));
  assert.ok(banner(), "TvGraphics mounted by Broadcast.start");
  assert.equal(banner().hidden, true, "before the fastest lap is set: no banner");
  bc.tick(0.3, st(60));
  assert.equal(banner().hidden, false, "script.fastest reached: the banner is up");
  assert.equal(banner().textContent, "FASTEST LAP  ·  NOR");
  bc.stop();
});

test("TvGraphics.diff takes an explicit holder over per-car flags", () => {
  const { ctx } = boot();
  const ranked = [{ code: "LEC", pos: 1 }, { code: "NOR", pos: 2 }];
  const first = ctx.TvGraphics.diff(null, ranked, null);
  assert.equal(first.fastest, null);
  const next = ctx.TvGraphics.diff(first.snapshot, ranked, "LEC");
  assert.deepEqual(JSON.parse(JSON.stringify(next.fastest)), { code: "LEC" });
  assert.equal(ctx.TvGraphics.diff(next.snapshot, ranked, "LEC").fastest, null, "a held record is not news again");
});
