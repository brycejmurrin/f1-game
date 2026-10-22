/** W13a — probe-page shot timeout helpers + tiled CDP fallback (no browser). */
import assert from "node:assert/strict";
import test from "node:test";
import {
  shotTimeoutMs, parseShotTimeout, resolveShotTimeoutMs, tileClips,
  screenshotPresentedCanvas,
} from "../../tools/shot/probe-page.mjs";

test("shotTimeoutMs scales above 1.5 Mpx (1920×1080)", () => {
  assert.equal(shotTimeoutMs(844, 390), 60000);
  assert.equal(shotTimeoutMs(1280, 720), 60000);
  assert.equal(shotTimeoutMs(1920, 1080), 180000);
});

test("parseShotTimeout reads --shot-timeout forms and rejects junk", () => {
  assert.equal(parseShotTimeout([]), null);
  assert.equal(parseShotTimeout(["--shot-timeout=90000"]), 90000);
  assert.equal(parseShotTimeout(["--shot-timeout", "120000"]), 120000);
  assert.throws(() => parseShotTimeout(["--shot-timeout=0"]), /positive/);
  assert.throws(() => parseShotTimeout(["--shot-timeout", "nope"]), /positive/);
});

test("resolveShotTimeoutMs prefers explicit opts then viewport area", () => {
  assert.equal(resolveShotTimeoutMs({ timeout: 45000 }), 45000);
  assert.equal(resolveShotTimeoutMs({ shotTimeout: 99000 }), 99000);
  assert.equal(resolveShotTimeoutMs({}, { width: 1920, height: 1080 }), 180000);
  assert.equal(resolveShotTimeoutMs({}), 60000);
});

test("tileClips covers the box in a 2×2 grid", () => {
  const tiles = tileClips({ x: 0, y: 0, width: 100, height: 40 }, 2, 2);
  assert.equal(tiles.length, 4);
  assert.equal(tiles[0].width + tiles[1].width, 100);
  assert.equal(tiles[0].height + tiles[2].height, 40);
  const area = tiles.reduce((s, t) => s + t.width * t.height, 0);
  assert.ok(Math.abs(area - 4000) < 1);
});

test("CDP full-frame timeout falls back to cdp-tiled when tileFallback is on", async () => {
  let sends = 0;
  const page = {
    viewportSize: () => ({ width: 1920, height: 1080 }),
    context: () => ({
      newCDPSession: async () => ({
        send: async (_method, params) => {
          sends++;
          // First session: full-frame clip → hang (timeout). Tile clips → tiny PNG.
          const isTile = params.clip && (params.clip.width < 1920 || params.clip.height < 1080);
          if (!isTile) return new Promise(() => {}); // never resolves → timeout
          // Minimal valid 1×1 PNG
          const png = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64",
          );
          return { data: png.toString("base64") };
        },
        detach: async () => {},
      }),
    }),
  };
  const shot = await screenshotPresentedCanvas(page, {
    skipAwait: true, forceCdp: true,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
    timeout: 30,
    tileFallback: true,
  });
  assert.equal(shot.via, "cdp-tiled");
  assert.ok(shot.bytes > 0);
  assert.ok(sends >= 5, `expected 1 timed full + 4 tiles, got ${sends}`);
});
