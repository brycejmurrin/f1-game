import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide, stopRecorded, tunnelUrlFromLog, parseUpArgs, hashMatches, sha256Of, ensureCloudflared, connectorLines, CLOUDFLARED_PIN } from "../../tools/mcp/browser-http-up.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("a live local server and a live public host is reused", () => {
  assert.equal(decide({ localOk: true, publicOk: true, url: "https://x.trycloudflare.com/mcp?token=a" }), "reuse");
  assert.equal(decide({ localOk: false, publicOk: false, url: "" }), "start-both");
  // anything short of a full reuse restarts the server too, so the token rotates
  assert.equal(decide({ localOk: true, publicOk: false, url: "https://x.trycloudflare.com/mcp?token=a" }), "restart-both");
  assert.equal(decide({ localOk: true, publicOk: true, url: "https://x.trycloudflare.com", sameMode: false }), "restart-both");
});

test("the tunnel host is read from the cloudflared log", () => {
  const log = "INF |  https://floyd-establishment-physician-travelers.trycloudflare.com  |";
  assert.equal(tunnelUrlFromLog(log), "https://floyd-establishment-physician-travelers.trycloudflare.com");
  assert.equal(tunnelUrlFromLog("still starting"), null);
});

test("--stop kills the recorded tunnel and server PIDs and tolerates a dead one", () => {
  const killed = [];
  const kill = (pid) => { if (pid === 222) { const e = new Error("gone"); e.code = "ESRCH"; throw e; } killed.push(pid); };
  const out = stopRecorded({ serverPid: 111, tunnelPid: 222, token: "t" }, kill);
  assert.deepEqual(killed, [111]);
  assert.deepEqual(out, ["tunnelPid 222 not running (ESRCH)", "serverPid 111 stopped"]);
  assert.deepEqual(stopRecorded({}, () => { throw new Error("must not be called"); }), []);
});

// W25: strict argv, a pinned and hash-checked cloudflared, header-first connector lines. No network, no tunnel.
test("argv is strict: --help and unknown flags start nothing (exit 2 on a typo)", () => {
  assert.deepEqual(parseUpArgs([]), { stop: false, dryRun: false, allowQueryToken: false, idleMin: 30 });
  assert.deepEqual(parseUpArgs(["--help"]), { help: true });
  assert.equal(parseUpArgs(["--stop"]).stop, true);
  assert.equal(parseUpArgs(["--idle-min", "5", "--allow-query-token"]).idleMin, 5);
  for (const bad of [["--stpo"], ["stop"], ["--idle-min"], ["--idle-min", "x"], ["--stop", "--dry-run"]]) assert.ok(parseUpArgs(bad).error, JSON.stringify(bad));
  const cli = (args) => spawnSync(process.execPath, ["tools/mcp/browser-http-up.mjs", ...args], { cwd: ROOT, encoding: "utf8", timeout: 10000 });
  const typo = cli(["--stpo"]);
  assert.equal(typo.status, 2); assert.equal(typo.stderr.split("\n")[0], 'phone-browser: unknown argument "--stpo"');
  assert.equal(cli(["--help"]).status, 0);
  const dry = JSON.parse(cli(["--dry-run"]).stdout);
  assert.equal(dry.cloudflared.version, CLOUDFLARED_PIN.version);
  assert.equal(dry.cloudflared.url, `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_PIN.version}/cloudflared-linux-amd64`);
  assert.equal(dry.tokenIn, "Authorization header only");
});

test("cloudflared is a pinned release whose sha256 is checked before it is made executable", async () => {
  assert.equal(/^\d{4}\.\d+\.\d+$/.test(CLOUDFLARED_PIN.version), true, "a release version, never latest");
  assert.equal(/^[0-9a-f]{64}$/.test(CLOUDFLARED_PIN.sha256), true, "a full sha256");
  const good = Buffer.from("pinned-bytes"), pin = { version: "1.2.3", asset: "x", sha256: sha256Of(good) };
  assert.equal(hashMatches(good, pin.sha256), true);
  assert.equal(hashMatches(Buffer.from("other"), pin.sha256), false);
  assert.equal(hashMatches(good, pin.sha256.toUpperCase()), false, "exact lowercase hex only");
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "cloudflared-pin-")), file = path.join(dir, "cloudflared");
  const urls = [];
  const serve = (bytes) => async (url) => { urls.push(url); return { ok: true, status: 200, arrayBuffer: async () => bytes }; };
  try {
    await assert.rejects(ensureCloudflared({ file, pin, fetchImpl: serve(Buffer.from("tampered")), platform: "linux", arch: "x64" }), /does not match the pinned sha256/);
    assert.deepEqual(fs.readdirSync(dir), [], "a mismatched download is never written");
    assert.equal(await ensureCloudflared({ file, pin, fetchImpl: serve(good), platform: "linux", arch: "x64" }), file);
    assert.equal(urls.at(-1), "https://github.com/cloudflare/cloudflared/releases/download/1.2.3/x", "a versioned URL, never latest");
    assert.equal(fs.statSync(file).mode & 0o111, 0o111);
    fs.writeFileSync(file, "altered on disk");
    await assert.rejects(ensureCloudflared({ file, pin, fetchImpl: serve(Buffer.from("still bad")), platform: "linux", arch: "x64" }), /does not match/);
    assert.equal(fs.existsSync(file), false, "an altered binary is removed, not run");
    await assert.rejects(ensureCloudflared({ file, pin, fetchImpl: serve(good), platform: "darwin", arch: "arm64" }), /linux-amd64 only/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("connector lines name the header; the query-token URL appears only when asked for", () => {
  const strict = connectorLines("https://h.trycloudflare.com", "tok", false);
  assert.deepEqual(strict, ["https://h.trycloudflare.com/mcp", "header: Authorization: Bearer tok"]);
  const loose = connectorLines("https://h.trycloudflare.com", "tok", true);
  assert.equal(loose.at(-1), "query-token URL (a credential; anyone holding it can drive the page): https://h.trycloudflare.com/mcp?token=tok");
});
