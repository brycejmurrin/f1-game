#!/usr/bin/env node
// iphone-sim-setup.mjs — create, enable automation on and boot an iPhone simulator on a macOS runner.
// @doc Creates, automation-enables and boots an iPhone simulator on a macOS runner; prints IC_SIM_* env lines.
// @skill renderer-debug
//
//   node tools/gfx/iphone-sim-setup.mjs [--device "iPhone 17 Pro"] [--os 26] [--download]
//
// Writes IC_SIM_UDID / IC_SIM_DEVICE / IC_SIM_OS to $GITHUB_ENV when set. Every
// step logs the command it ran, so a red first dispatch names its own cause.
// Pure picking lives in iphone-census-lib.mjs (pickRuntime, pickDeviceType).
//   xcrun simctl: create / boot / bootstatus / spawn / list -j
//   xcodebuild -downloadPlatform iOS — fetches a runtime when the image has none
//   (runner images ship one iOS runtime per Xcode, no spares:
//    https://github.com/actions/runner-images/issues/13220).
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pickDeviceType, pickRuntime } from "./iphone-census-lib.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const wantDevice = flag("--device", "iPhone 17 Pro");
const wantOs = flag("--os", "");
const sh = (cmd, args, opt = {}) => {
  console.log("$ " + [cmd, ...args].join(" "));
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20, ...opt });
  if (r.stdout && !opt.quietOut) process.stdout.write(r.stdout.length > 4000 ? r.stdout.slice(0, 4000) + "…\n" : r.stdout);
  if (r.stderr) process.stderr.write(r.stderr.slice(0, 2000));
  return r;
};
const list = (what) => JSON.parse(sh("xcrun", ["simctl", "list", what, "-j"], { quietOut: true }).stdout || "{}");

let runtime = pickRuntime(list("runtimes"), wantOs);
if (!runtime) {
  console.log("no available iOS runtime on this image: downloading one");
  sh("xcodebuild", ["-downloadPlatform", "iOS"], { stdio: ["ignore", "inherit", "inherit"] });
  runtime = pickRuntime(list("runtimes"), wantOs);
}
if (!runtime) { console.error("iphone-sim-setup: still no iOS runtime" + (wantOs ? " matching " + wantOs : "")); process.exit(1); }
const dt = pickDeviceType(list("devicetypes"), wantDevice);
if (!dt) { console.error("iphone-sim-setup: no iPhone device type"); process.exit(1); }
if (!dt.exact) console.log(`device type "${wantDevice}" not on this Xcode: using "${dt.name}"`);
console.log(`runtime ${runtime.name} (${runtime.version}, ${runtime.identifier}); device type ${dt.name}`);

const c = sh("xcrun", ["simctl", "create", "census-iphone", dt.identifier, runtime.identifier]);
const udid = (c.stdout || "").trim();
if (c.status !== 0 || !udid) { console.error("iphone-sim-setup: simctl create failed"); process.exit(1); }

// Remote Automation is a Safari/webinspectord preference the Settings app writes on a phone.
// The key names below are the ones WebKit's remote inspector reads (best effort, unverified
// on the runner until the first dispatch): written while booted, then the simulator restarts
// so webinspectord and Safari pick them up. safaridriver's session creation is the real test.
const PREFS = [
  ["com.apple.webinspectord", "RemoteInspectorEnabled"],
  ["com.apple.webinspectord", "RemoteAutomationEnabled"],
  ["com.apple.mobilesafari", "WebKitDeveloperExtrasEnabledPreferenceKey"],
];
sh("xcrun", ["simctl", "boot", udid]);
sh("xcrun", ["simctl", "bootstatus", udid, "-b"]);
for (const [dom, key] of PREFS) sh("xcrun", ["simctl", "spawn", udid, "defaults", "write", dom, key, "-bool", "true"]);
sh("xcrun", ["simctl", "shutdown", udid]);
sh("xcrun", ["simctl", "boot", udid]);
const bs = sh("xcrun", ["simctl", "bootstatus", udid, "-b"]);
if (bs.status !== 0) { console.error("iphone-sim-setup: simulator did not finish booting"); process.exit(1); }
sh("xcrun", ["simctl", "list", "devices", "booted"]);

const lines = [`IC_SIM_UDID=${udid}`, `IC_SIM_DEVICE=${dt.name}`, `IC_SIM_OS=${runtime.version}`];
console.log(lines.join("\n"));
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, lines.join("\n") + "\n");
