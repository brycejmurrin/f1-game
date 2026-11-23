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
  assert.equal(cliMode(["--status", "--stop"]), "bad");
  assert.equal(cliMode(["--dry-run"]), "dry-run");
  assert.equal(cliMode(["--idle-min", "5"]), "up");
});

const OPTS = { idleMin: 30, allowQueryToken: false };
function fakeIo(over = {}) {
  const log = { writes: [], detached: [], stopped: [], cleared: 0 };
  let pinged = 0;
  const io = {
    readState: () => ({}),
    writeState: (s) => log.writes.push({ ...s }),
    clearState: () => { log.cleared++; },
    ping: async () => (pinged++ > 0),            // dead before the start, live after it
    detach: (cmd) => { log.detached.push(cmd); return 4242 + log.detached.length; },
    waitFor: async (_label, probe) => { const hit = await probe(); if (!hit) throw new Error("down"); return hit; },
    ensureCloudflared: async () => "/fake/cloudflared",
    stop: (s) => { log.stopped.push({ ...s }); return []; },
    resetLog: () => {},
    readLog: () => "",
    ...over,
  };
  return { io, log };
}

test("bringUp checks the pinned binary before anything starts: a refused binary leaves nothing running", async () => {
  const { io, log } = fakeIo({ ensureCloudflared: async () => { throw new Error("could not download cloudflared"); } });
  await assert.rejects(bringUp(OPTS, io), /could not download cloudflared/);
  assert.deepEqual(log.detached, [], "no server or tunnel was started");
  assert.deepEqual(log.writes, []);
});

test("bringUp records the server before the tunnel step, and a failed tunnel stops what it started", async () => {
  const { io, log } = fakeIo({ readLog: () => "no url yet" });
  await assert.rejects(bringUp(OPTS, io), /down/);
  assert.ok(log.writes.length >= 1);
  assert.equal(log.writes[0].serverPid, 4243, "the server is recorded before the tunnel starts");
  assert.equal(log.writes[0].port, 3001);
  assert.equal(log.writes[0].tunnelPid, undefined);
  assert.equal(log.writes[0].token.length, 48, "a fresh 24-byte token");
  assert.equal(Buffer.from(log.writes[0].token, "hex").toString("hex"), log.writes[0].token, "a hex token");
  assert.equal(log.stopped.length, 1, "the failure stops the recorded processes");
  assert.equal(log.stopped[0].serverPid, 4243);
  assert.equal(log.cleared, 1, "and forgets the state");
});
