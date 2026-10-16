// No browser: argument building, refusal rules and PID-exact stop for tools/mcp/debug-chrome.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chromeArgs, refusal, stop, owns } from "../../tools/mcp/debug-chrome.mjs";

test("chromeArgs carries the proven flags, the loopback-only address and optional WebGPU", () => {
  const a = chromeArgs({});
  for (const f of ["--headless=new", "--no-sandbox", "--remote-debugging-port=9222", "--remote-debugging-address=127.0.0.1",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=844,390"]) assert.ok(a.includes(f), f);
  assert.ok(a.some(x => x.startsWith("--user-data-dir=") && x.endsWith("scratch/debug-chrome")));
  assert.equal(a.at(-1), "http://127.0.0.1:3456/"); assert.ok(!a.includes("--enable-unsafe-webgpu"));
  const w = chromeArgs({ port: 9333, url: "http://127.0.0.1:3456/x", webgpu: true });
  assert.ok(w.includes("--remote-debugging-port=9333") && w.includes("--enable-unsafe-webgpu")); assert.equal(w.at(-1), "http://127.0.0.1:3456/x");
});
test("start is refused while a test run is live or loadavg >= 3", () => {
  assert.match(refusal({ load: 0.5, live: "123:456 log" }), /test run is live/);
  assert.match(refusal({ load: 3.2, live: null }), /loadavg 3\.20/);
  assert.equal(refusal({ load: 2.9, live: null }), null);
});
test("stop kills exactly its recorded PIDs and skips a reused PID", async () => {
  const pids = { port: 9222, procs: [{ pid: 111, marker: "--remote-debugging-port=9222" }, { pid: 222, marker: "http.server 3456" }] };
  const alive = new Map([[111, "chrome --remote-debugging-port=9222"], [222, "someone else entirely"]]);
  const sent = [];
  const r = await stop({ pids, read: p => alive.get(p) ?? null, kill: (pid, sig) => { sent.push([pid, sig]); if (sig === "SIGTERM") alive.delete(Math.abs(pid)); }, wait: async () => {} });
  assert.deepEqual(sent, [[-111, "SIGTERM"]]); assert.equal(r.stopped.length, 1); assert.equal(r.skipped[0].pid, 222);
  assert.ok(!owns({ pid: 1, marker: "m" }, () => null));
  assert.deepEqual((await stop({ pids: null })).stopped, []);
});
test("CLI help and unknown command do not touch processes", () => {
  assert.equal(spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "nope"], { encoding: "utf8" }).status, 1);
  const s = spawnSync(process.execPath, ["tools/mcp/debug-chrome.mjs", "status"], { encoding: "utf8" });
  assert.equal(s.status, 0);
});
