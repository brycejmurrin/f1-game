#!/usr/bin/env node
// @doc AWS Device Farm: Safari on a real iPhone (remote access + Appium); renderer probe, BENCHMARK WEBGPU vs WEBGL2.
// AWS Device Farm: open the live game in Safari on a real iPhone and read the renderer state, optionally running the
// in-game BENCHMARK "WEBGPU vs WEBGL2" legs (js/perf/bench-run.js). docs/notes/AWS-DEVICE-FARM-IPHONE-2026-10-23.md.
//
//   node tools/perf/devicefarm-iphone.mjs devices
//   node tools/perf/devicefarm-iphone.mjs run --device "iPhone 18 Pro Max" [--legs 2|4|0] [--url URL] [--out DIR]
//   node tools/perf/devicefarm-iphone.mjs auto --device "iPhone 18 Pro Max" [--legs 2] [--perf none|"Activity Monitor"] [--out DIR]
//
// `run` is a remote access session driven from here; `auto` is a server-side automated run: it packages
// tools/perf/devicefarm-host.mjs (npm pack → zip), generates a test spec for the macos_tahoe host, uploads both,
// schedules an APPIUM_WEB_NODE run on a one-device pool, waits, and downloads every artifact (video, Appium log,
// device log, Customer Artifacts = the host script's report.json, Safari console and Instruments trace).
//
// Credentials come only from the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION), read by
// the aws CLI (APEX_AWS_CLI, else `aws` on PATH). Nothing here prints them. WebDriver goes through curl so the
// container's HTTPS proxy applies. Device minutes are metered: the session is always stopped in `finally`, and the
// endpoint URL (it grants control of the device) is never printed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AWS = process.env.APEX_AWS_CLI || "aws";
const REGION = process.env.AWS_DEFAULT_REGION || "us-west-2";
const PROJECT = process.env.APEX_DF_PROJECT || "apex-profiler";
const SITE = "https://brycejmurrin.github.io/f1-game/";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`);

function aws(...a) {
  let out;
  try { out = execFileSync(AWS, [...a, "--region", REGION, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { throw new Error(`aws ${a.slice(0, 2).join(" ")}: ${String(e.stderr || e.message).trim().split("\n").pop().slice(0, 300)}`); }
  return out.trim() ? JSON.parse(out) : null;
}
function wd(base, method, p, body) {
  const a = ["-sS", "-X", method, "--max-time", "300", "-H", "Content-Type: application/json", base + p];
  if (body !== undefined) a.push("--data-binary", JSON.stringify(body));
  const out = execFileSync("curl", a, { encoding: "utf8", maxBuffer: 64 << 20 });
  let j; try { j = JSON.parse(out); } catch (_) { throw new Error(`${method} ${p}: non-JSON reply ${out.slice(0, 200)}`); }
  if (j && j.value && j.value.error) throw new Error(`${method} ${p}: ${j.value.error}: ${String(j.value.message).slice(0, 300)}`);
  return j.value;
}

function iosPhones() {
  const r = aws("devicefarm", "list-devices", "--filters",
    "attribute=PLATFORM,operator=EQUALS,values=IOS", "attribute=FORM_FACTOR,operator=EQUALS,values=PHONE");
  return r.devices.map((d) => ({ name: d.name, os: d.os, availability: d.availability, remoteAccess: d.remoteAccessEnabled, arn: d.arn }));
}

// Page-side probes. Each is a function body for WebDriver execute/sync (returns JSON-able data).
const PROBE = `
  const R = typeof RendererPicker !== "undefined" ? RendererPicker : null;
  let info = null, be = null;
  try { info = window.__apex && __apex.info ? __apex.info() : null; } catch (e) { info = { error: String(e) }; }
  try { be = typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.backendState ? GLX.__tlx.backendState() : null; } catch (e) { be = { error: String(e) }; }
  return { title: document.title, ua: navigator.userAgent, gpu: !!navigator.gpu, readyState: document.readyState,
    live: R ? { api: R.liveThreeApi && R.liveThreeApi(), backend: R.liveBackend && R.liveBackend() } : null,
    pins: { gfxBackend: localStorage.getItem("apex26.gfxBackend"), tlxForceGL: localStorage.getItem("apex26.tlxForceGL") },
    backendState: be, info, w: innerWidth, h: innerHeight, dpr: devicePixelRatio };`;
// Start BENCHMARK "paths" and keep only the first `n` legs (WEBGPU, WEBGL2 for n = 2). BenchRun.run saves the plan and
// reloads after this task, so the trimmed plan is what the next boot resumes.
const BENCH = (n) => `
  if (typeof BenchRun === "undefined") return { ok: false, why: "no BenchRun" };
  const ok = BenchRun.run("paths");
  const s = GameStore.store, p = JSON.parse(s.raw(BenchRun.KEY));
  if (${n} > 0 && ${n} < p.legs.length) { p.legs = p.legs.slice(0, ${n}); s.rawSet(BenchRun.KEY, JSON.stringify(p)); }
  return { ok, legs: p.legs.map((l) => l.path) };`;
const BENCH_STATE = `
  let p = null; try { p = JSON.parse(GameStore.store.raw("apex26.benchRun")); } catch (_) {}
  if (!p) return { state: "none" };
  return { state: p.state, i: p.i, legs: p.legs.map((l) => l.state + (l.reason ? ":" + l.reason : "")),
    api: (() => { try { return RendererPicker.liveThreeApi(); } catch (_) { return null; } })(), result: p.state !== "running" ? p : null,
    entry: (() => { try { const t = RaceEntryProfile.stageTable(), s = RaceEntryProfile.snapshot();
      return { kind: t.entry, winT0: s.winT0, armed: s.armed, windowMs: t.windowMs, blockMs: t.blockMs, maxBlockMs: t.maxBlockMs,
        stages: t.stages.filter((r) => r.ms == null || r.ms >= 50).map((r) => [r.n, r.ms]),
        longTasks: (s.longTasks || []).filter((l) => l && l.ms >= 200).length }; } catch (_) { return null; } })() };`;
// The poll keeps the newest RaceEntryProfile window per (leg, window start): cold and warm entry are separate windows.
const LOG_EVERY = 5, THERMAL_EVERY = 15; // in polls of POLL_MS
const POLL_MS = 4000;

async function exec(base, sid, script, tries = 3) {
  for (let t = 1; ; t++) {
    try { return wd(base, "POST", `/session/${sid}/execute/sync`, { script, args: [] }); }
    catch (e) { if (t >= tries) throw e; log(`execute retry ${t}: ${e.message.slice(0, 120)}`); await sleep(5000); }
  }
}
// Drain Appium's Safari console / network buffers (each read empties them) into JSONL files beside the report.
function pullLogs(base, sid, out) {
  for (const type of ["safariConsole", "safariNetwork"]) {
    try {
      const rows = wd(base, "POST", `/session/${sid}/se/log`, { type });
      if (Array.isArray(rows) && rows.length) fs.appendFileSync(path.join(out, type + ".jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    } catch (e) { fs.appendFileSync(path.join(out, "log-errors.txt"), `${type}: ${e.message.slice(0, 200)}\n`); }
  }
}
function shot(base, sid, file) {
  const b64 = wd(base, "GET", `/session/${sid}/screenshot`);
  fs.writeFileSync(file, Buffer.from(b64, "base64")); log(`screenshot ${file}`);
}

async function run() {
  const want = opt("device", "iPhone 18 Pro Max"), legs = Number(opt("legs", "0")), url = opt("url", SITE);
  const out = opt("out", path.join("artifacts", "devicefarm", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
  fs.mkdirSync(out, { recursive: true });
  const dev = iosPhones().find((d) => d.name === want || d.name.endsWith(" " + want) || d.arn.endsWith(want));
  if (!dev) throw new Error(`no iOS phone named ${want}; try: devices`);
  const proj = aws("devicefarm", "list-projects").projects.find((p) => p.name === PROJECT);
  if (!proj) throw new Error(`no Device Farm project ${PROJECT}`);
  log(`device ${dev.name} iOS ${dev.os}; project ${PROJECT}; legs ${legs}`);
  const cfg = JSON.stringify({ parameters: { "appium:version": "3" } });
  const ses = aws("devicefarm", "create-remote-access-session", "--project-arn", proj.arn, "--device-arn", dev.arn,
    "--name", "apex-" + Date.now(), "--configuration", cfg).remoteAccessSession;
  const report = { device: dev.name, os: dev.os, url, legs, startedAt: new Date().toISOString(), sessionArn: ses.arn };
  let sid = null, base = null;
  try {
    for (let t = 0; ; t++) {
      const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      if (s.status === "RUNNING" && s.endpoints && s.endpoints.remoteDriverEndpoint) { base = s.endpoints.remoteDriverEndpoint.replace(/\/$/, ""); break; }
      if (/COMPLETED|STOPPING|ERRORED|FAILED/.test(s.status) || t > 90) throw new Error(`session ${s.status} ${s.result || ""} ${s.message || ""}`);
      if (t % 6 === 0) log(`session ${s.status}`);
      await sleep(5000);
    }
    log("session RUNNING; endpoint ready (not printed)");
    report.status = wd(base, "GET", "/status");
    const caps = { platformName: "iOS", browserName: "Safari", "appium:automationName": "XCUITest", "appium:newCommandTimeout": 300,
      "appium:showSafariConsoleLog": true, "appium:showSafariNetworkLog": true };
    const created = wd(base, "POST", "/session", { capabilities: { alwaysMatch: caps, firstMatch: [{}] } });
    sid = created.sessionId; log("WebDriver session up");
    try { wd(base, "POST", `/session/${sid}/orientation`, { orientation: "LANDSCAPE" }); } catch (e) { log("orientation: " + e.message.slice(0, 120)); }
    wd(base, "POST", `/session/${sid}/url`, { url });
    await sleep(20000);
    report.boot = await exec(base, sid, PROBE);
    log(`boot: gpu=${report.boot.gpu} live=${JSON.stringify(report.boot.live)} title=${report.boot.title}`);
    shot(base, sid, path.join(out, "boot.png"));
    if (legs) {
      report.benchStart = await exec(base, sid, BENCH(legs));
      log("bench " + JSON.stringify(report.benchStart));
      const t0 = Date.now(), cap = (legs * 4.5 + 3) * 60000;
      let last = "", n = 0;
      const entries = report.entries = {}, thermal = report.thermal = [];
      for (;;) {
        await sleep(POLL_MS); n++;
        if (n % LOG_EVERY === 0) pullLogs(base, sid, out);
        if (n % THERMAL_EVERY === 1) {
          try { const d = wd(base, "POST", `/session/${sid}/execute/sync`, { script: "mobile: deviceInfo", args: [] });
            thermal.push({ t: Math.round((Date.now() - t0) / 1000), thermalState: d && d.thermalState, leg: last.split(" ")[1] || null });
          } catch (e) { if (!thermal.length) log("thermal: " + e.message.slice(0, 120)); thermal.push({ t: Math.round((Date.now() - t0) / 1000), error: true }); }
        }
        let st; try { st = await exec(base, sid, BENCH_STATE, 2); } catch (e) { log("poll: " + e.message.slice(0, 120)); continue; }
        if (st.entry && st.entry.winT0 && st.entry.windowMs > 0) entries[`${st.i}:${st.api}:${Math.round(st.entry.winT0)}`] = st.entry;
        const line = `${st.state} i=${st.i} api=${st.api} ${JSON.stringify(st.legs)}`;
        if (line !== last) { log(line); last = line; }
        if (st.state !== "running" && st.state !== "none") { report.bench = st.result; break; }
        if (Date.now() - t0 > cap) { log("bench cap reached"); report.benchTimedOut = st; break; }
      }
      pullLogs(base, sid, out);
      try { shot(base, sid, path.join(out, "bench.png")); } catch (e) { log("shot: " + e.message.slice(0, 120)); }
    }
  } catch (e) {
    report.error = e.message; log("ERROR " + e.message);
  } finally {
    if (sid) try { wd(base, "DELETE", `/session/${sid}`); } catch (_) { /* gone */ }
    try { aws("devicefarm", "stop-remote-access-session", "--arn", ses.arn); } catch (e) { log("stop: " + e.message.slice(0, 160)); }
    for (let t = 0; t < 24; t++) {
      const s = aws("devicefarm", "get-remote-access-session", "--arn", ses.arn).remoteAccessSession;
      report.session = { status: s.status, result: s.result, deviceMinutes: s.deviceMinutes, billingMethod: s.billingMethod };
      if (s.status === "COMPLETED") break;
      await sleep(5000);
    }
    log("session " + JSON.stringify(report.session));
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
    log(`report ${path.join(out, "report.json")}`);
  }
}

// ---- automated run (server-side) ------------------------------------------------------------------------------
const SPEC = ({ legs, perf, url }) => `version: 0.1
ios_test_host: macos_tahoe
phases:
  install:
    commands:
      - devicefarm-cli use node 24
      - devicefarm-cli use appium 3
      - export APPIUM_BASE_PATH=
  pre_test:
    commands:
      - |-
        APPIUM_DRIVER_VERSION=$(appium driver list --installed --json | jq -r ".xcuitest.version" | cut -d "." -f 1);
        CORRESPONDING_APPIUM_WDA=$(env | grep "DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH_V\${APPIUM_DRIVER_VERSION}")
        if [[ ! -z "$APPIUM_DRIVER_VERSION" ]] && [[ ! -z "$CORRESPONDING_APPIUM_WDA" ]]; then
          DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH=$(echo $CORRESPONDING_APPIUM_WDA | cut -d "=" -f2)
        else
          DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH=$(env | grep "DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH_V" | sort -V -r | head -n 1 | cut -d "=" -f2)
        fi;
      - |-
        appium --base-path=$APPIUM_BASE_PATH --log-timestamp --log-no-colors --relaxed-security --default-capabilities \\
          "{\\"appium:deviceName\\": \\"$DEVICEFARM_DEVICE_NAME\\", \\"platformName\\": \\"iOS\\", \\"browserName\\": \\"Safari\\", \\
          \\"appium:udid\\": \\"$DEVICEFARM_DEVICE_UDID\\", \\"appium:platformVersion\\": \\"$DEVICEFARM_DEVICE_OS_VERSION\\", \\
          \\"appium:derivedDataPath\\": \\"$DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH\\", \\"appium:usePrebuiltWDA\\": true, \\
          \\"appium:automationName\\": \\"XCUITest\\"}" >> $DEVICEFARM_LOG_DIR/appium.log 2>&1 &
      - |-
        n=0; until curl --silent --fail "http://127.0.0.1:4723\${APPIUM_BASE_PATH}/status" >/dev/null; do
          n=$((n + 1)); if [[ $n -gt 60 ]]; then echo "Appium did not start"; exit 1; fi; sleep 1; done
  test:
    commands:
      - cd $DEVICEFARM_TEST_PACKAGE_PATH && tar xzf *.tgz
      - xcrun xctrace version || true
      - APEX_LEGS=${legs} APEX_PERF="${perf}" APEX_URL="${url}" node $DEVICEFARM_TEST_PACKAGE_PATH/package/devicefarm-host.mjs
  post_test:
    commands:
      - ls -la $DEVICEFARM_LOG_DIR
artifacts:
  - $DEVICEFARM_LOG_DIR
`;

function upload(projArn, file, type) {
  const u = aws("devicefarm", "create-upload", "--project-arn", projArn, "--name", path.basename(file), "--type", type).upload;
  execFileSync("curl", ["-sS", "--fail", "-T", file, u.url], { stdio: ["ignore", "ignore", "pipe"] });
  return u.arn;
}
async function uploaded(arn) {
  for (let t = 0; t < 60; t++) {
    const u = aws("devicefarm", "get-upload", "--arn", arn).upload;
    if (u.status === "SUCCEEDED") return u;
    if (u.status === "FAILED") throw new Error(`upload ${u.name} FAILED: ${u.metadata || u.message || ""}`.slice(0, 400));
    await sleep(3000);
  }
  throw new Error("upload processing timed out");
}

async function auto() {
  const want = opt("device", "iPhone 18 Pro Max"), legs = Number(opt("legs", "2")), perf = opt("perf", "none"), url = opt("url", SITE);
  const out = opt("out", path.join("artifacts", "devicefarm", "auto-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
  const pkg = path.join(out, "pkg");
  fs.mkdirSync(pkg, { recursive: true });
  const dev = iosPhones().find((d) => d.name === want || d.name.endsWith(" " + want) || d.arn.endsWith(want));
  if (!dev) throw new Error(`no iOS phone named ${want}`);
  const proj = aws("devicefarm", "list-projects").projects.find((p) => p.name === PROJECT);
  if (!proj) throw new Error(`no Device Farm project ${PROJECT}`);
  // Test package: a zip holding the `npm pack` tarball of a dependency-free package (test-types-appium-integrate).
  fs.copyFileSync(fileURLToPath(new URL("./devicefarm-host.mjs", import.meta.url)), path.join(pkg, "devicefarm-host.mjs"));
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "apex-devicefarm-host", version: "1.0.0", private: true, type: "module", files: ["devicefarm-host.mjs"] }, null, 2));
  const tgz = execFileSync("npm", ["pack", "--silent"], { cwd: pkg, encoding: "utf8" }).trim().split("\n").pop();
  const zip = path.resolve(out, "apex-host-tests.zip");
  execFileSync("zip", ["-q", "-j", zip, path.join(pkg, tgz)]);
  const specFile = path.resolve(out, "apex-testspec.yml");
  fs.writeFileSync(specFile, SPEC({ legs, perf, url }));
  log(`device ${dev.name} iOS ${dev.os}; legs ${legs}; perf ${perf}`);
  const pkgArn = upload(proj.arn, zip, "APPIUM_WEB_NODE_TEST_PACKAGE"), specArn = upload(proj.arn, specFile, "APPIUM_WEB_NODE_TEST_SPEC");
  await uploaded(pkgArn); await uploaded(specArn); log("uploads processed");
  const poolName = "apex-" + dev.arn.split(":device:")[1].slice(0, 12);
  let pool = (aws("devicefarm", "list-device-pools", "--arn", proj.arn, "--type", "PRIVATE").devicePools || []).find((p) => p.name === poolName);
  if (!pool) pool = aws("devicefarm", "create-device-pool", "--project-arn", proj.arn, "--name", poolName,
    "--rules", JSON.stringify([{ attribute: "ARN", operator: "IN", value: JSON.stringify([dev.arn]) }])).devicePool;
  const runArn = aws("devicefarm", "schedule-run", "--project-arn", proj.arn, "--device-pool-arn", pool.arn, "--name", "apex-auto-" + Date.now(),
    "--test", JSON.stringify({ type: "APPIUM_WEB_NODE", testPackageArn: pkgArn, testSpecArn: specArn }),
    "--execution-configuration", JSON.stringify({ jobTimeoutMinutes: Math.ceil(legs * 5 + 15), videoCapture: true })).run.arn;
  const report = { device: dev.name, os: dev.os, legs, perf, runArn };
  let r, last = "";
  for (;;) {
    r = aws("devicefarm", "get-run", "--arn", runArn).run;
    const line = `${r.status} ${r.result || ""}`;
    if (line !== last) { log("run " + line); last = line; }
    if (r.status === "COMPLETED") break;
    await sleep(15000);
  }
  report.run = { status: r.status, result: r.result, deviceMinutes: r.deviceMinutes, counters: r.counters, message: r.message };
  log("run " + JSON.stringify(report.run));
  // Every artifact of every job: video, Appium/device logs, and the Customer Artifacts zip (our $DEVICEFARM_LOG_DIR).
  const dl = path.join(out, "artifacts");
  fs.mkdirSync(dl, { recursive: true });
  report.artifacts = [];
  for (const type of ["FILE", "LOG", "SCREENSHOT"]) {
    for (const a of aws("devicefarm", "list-artifacts", "--arn", runArn, "--type", type).artifacts || []) {
      const f = path.join(dl, `${a.name.replace(/[^\w.-]+/g, "_")}.${a.extension}`);
      try { execFileSync("curl", ["-sS", "--fail", "-o", f, a.url]); report.artifacts.push({ type, name: a.name, file: f, bytes: fs.statSync(f).size }); }
      catch (e) { report.artifacts.push({ type, name: a.name, error: e.message.slice(0, 120) }); }
    }
  }
  for (const a of report.artifacts) log(`artifact ${a.type} ${a.name} ${a.bytes ?? a.error}`);
  fs.writeFileSync(path.join(out, "auto-report.json"), JSON.stringify(report, null, 2));
  log(`report ${path.join(out, "auto-report.json")}`);
}

const cmd = args[0];
if (cmd === "devices") { for (const d of iosPhones()) console.log(`${d.name}\tiOS ${d.os}\t${d.availability}\tremoteAccess=${d.remoteAccess}`); }
else if (cmd === "run") run().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === "auto") auto().catch((e) => { console.error(e.message); process.exit(1); });
else { console.error("usage: devicefarm-iphone.mjs devices | run --device NAME [--legs 0|2|4] | auto --device NAME [--legs N] [--perf NAME|none]"); process.exit(2); }
