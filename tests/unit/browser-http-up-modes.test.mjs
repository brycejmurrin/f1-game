// browser-http-up (#5674): only a bare run starts anything, and a failed tunnel leaves the server it started recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cliMode, bringUp } from "../../tools/mcp/browser-http-up.mjs";

test("cliMode: a bare run starts; --stop/--status/--help are their own modes; anything else is refused", () => {
  assert.equal(cliMode([]), "up");
  assert.equal(cliMode(["--stop"]), "stop");
  assert.equal(cliMode(["--status"]), "status");
  assert.equal(cliMode(["--help"]), "help");
  assert.equal(cliMode(["-h"]), "help");
  assert.equal(cliMode(["--port", "4000"]), "bad");
  assert.equal(cliMode(["--stop", "--help"]), "bad");
});

test("bringUp records the server before the tunnel step throws", async () => {
  const writes = [];
  let pinged = 0;
  const io = {
    readState: () => ({}),
    writeState: (s) => writes.push({ ...s }),
    ping: async () => (pinged++ > 0),            // dead before the start, live after it
    detach: () => 4242,
    waitFor: async (_label, probe) => { const hit = await probe(); if (!hit) throw new Error("down"); return hit; },
    ensureCloudflared: async () => { throw new Error("could not download cloudflared"); },
    readLog: () => "",
  };
  await assert.rejects(bringUp(io), /could not download cloudflared/);
  assert.equal(writes.length, 2);
  assert.equal(writes.at(-1).serverPid, 4242);
  assert.equal(writes.at(-1).port, 3001);
  assert.equal(writes.at(-1).tunnelPid, undefined);
  assert.equal(writes.at(-1).token.length, 36);
  assert.equal(Buffer.from(writes.at(-1).token, "hex").toString("hex"), writes.at(-1).token, "a hex token");
});
