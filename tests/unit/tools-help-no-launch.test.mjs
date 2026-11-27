/* tools-help-no-launch.test.mjs — the #7083 batch: --help on a browser/network CLI exits 0 with a usage line,
 * launching no process and making no fetch. A preload makes fetch, child_process.spawn/fork/exec* and
 * net.connect throw a marker; if --help reached any of them the run exits non-zero or prints the marker.
 *
 * Run: node --test tests/unit/tools-help-no-launch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOLS = [
  "tools/gen/track-stills.mjs",
  "tools/gfx/live-frame-census.mjs",
  "tools/track/measure-props-over-road.mjs",
  "tools/track/refresh-f1-circuit-reference.mjs",
  "tools/ui/profile-survey.mjs",
  "tools/net/rtc-e2e-room.mjs",
  "tools/net/nostr-probe.mjs",
  "tools/net/nostr-local.cjs",
];
const PRELOAD = `
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const boom = (what) => () => { process.stderr.write("HELP-SIDE-EFFECT " + what + "\\n"); process.exit(97); };
globalThis.fetch = boom("fetch");
const cp = require("node:child_process");
for (const k of ["spawn", "spawnSync", "fork", "exec", "execFile", "execSync", "execFileSync"]) cp[k] = boom(k);
const net = require("node:net");
net.connect = net.createConnection = boom("net.connect");
net.Socket.prototype.connect = boom("socket.connect");
`;

for (const rel of TOOLS) {
  for (const flag of ["--help", "-h"]) {
    test(`${rel} ${flag}: exit 0, usage printed, no browser, no fetch`, () => {
      const r = spawnSync(process.execPath,
        ["--import", "data:text/javascript," + encodeURIComponent(PRELOAD), rel, flag],
        { cwd: ROOT, encoding: "utf8", timeout: 30000, env: { ...process.env, CHROME: "/nonexistent", PW_CHROMIUM: "/nonexistent" } });
      assert.ok(!/HELP-SIDE-EFFECT/.test(r.stderr), `${rel} ${flag} reached a side effect: ${r.stderr}`);
      assert.equal(r.status, 0, `${rel} ${flag}: exit ${r.status}\n${r.stderr}`);
      assert.match(r.stdout, /^Usage:/, `${rel} ${flag}: no usage line`);
    });
  }
}
