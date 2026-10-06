import assert from "node:assert/strict";
import test from "node:test";
import { decide, tunnelUrlFromLog } from "../../tools/mcp/browser-http-up.mjs";

test("a live local server and a live public host is reused", () => {
  assert.equal(decide({ localOk: true, publicOk: true, url: "https://x.trycloudflare.com/mcp?token=a" }), "reuse");
  assert.equal(decide({ localOk: false, publicOk: false, url: "" }), "start-both");
  assert.equal(decide({ localOk: true, publicOk: false, url: "https://x.trycloudflare.com/mcp?token=a" }), "start-tunnel");
});

test("the tunnel host is read from the cloudflared log", () => {
  const log = "INF |  https://floyd-establishment-physician-travelers.trycloudflare.com  |";
  assert.equal(tunnelUrlFromLog(log), "https://floyd-establishment-physician-travelers.trycloudflare.com");
  assert.equal(tunnelUrlFromLog("still starting"), null);
});
