# AWS Device Farm on a real iPhone (2026-10-23)

Goal: close G1 in `IPHONE-TLX-WEBGPU-2026-10-23.md` (PR #3592), which asks for the same iPhone measured on three.js
WebGPU and on WebGL2, with `__tlx.backendState().api` recorded for each leg. BrowserStack Automate minutes are used up,
so this note tests AWS Device Farm as the device source. Grant: Bryce, in OrchA 26's session, 2026-10-23 about 01:20Z.

## 1. Status

| step | state |
|---|---|
| credentials in env | present: `AWS_ACCESS_KEY_ID` (20 chars), `AWS_SECRET_ACCESS_KEY` (40), `AWS_DEFAULT_REGION=us-west-2`, no session token |
| AWS CLI | v2.38.5 installed into the session scratchpad after Bryce's "Try again" (the first install was refused by the auto-mode classifier) |
| `sts get-caller-identity` | works: IAM user `apex-devicefarm-agent` |
| `devicefarm list-projects` (us-west-2) | works: one project, `apex-profiler` |
| `list-devices` (iOS phones) | works: **three iPhones, all on iOS 27.0, all HIGHLY_AVAILABLE with remote access**: iPhone 14, iPhone 14 Pro, iPhone 18 Pro Max. No iOS 26 or iOS 18 device, so neither the iOS 26 path Bryce plays nor the no-WebGPU fallback is covered here |
| one-device proof | **works** (iPhone 18 Pro Max, iOS 27.0, 01:39Z): Safari opened the live site in landscape; screenshot taken; `navigator.gpu` true, `gpuAdapterOk`/`gpuCanvasOk` true; AUTO boots `api=webgl2` (`forceWebGL` from `isWebKit`, pin null) |
| A/B profile | **done** (same device, 01:44–01:55Z), §5 |
| device minutes | wall time about 4.5 min (proof) + 11 min (A/B), about 16 min. `deviceMinutes` still read 0 while the sessions sat in STOPPING; re-read it once they reach COMPLETED |

## 2. What the docs say (read 2026-10-23)

- **Route: a remote access session plus the managed Appium endpoint (client-side).** A remote access session on one
  device exposes an Appium server URL for that device, valid for the whole session, so a W3C WebDriver client
  outside AWS can drive it (Device Farm added this 2025-11-17). Appium 2 and 3 are offered for iOS 15 and later.
  On iOS 27 or later, `appium:version` must be set in `create-remote-access-session --configuration`.
  <https://docs.aws.amazon.com/devicefarm/latest/developerguide/appium-endpoint.html>,
  <https://docs.aws.amazon.com/devicefarm/latest/developerguide/appium-endpoint-support.html>
- **Capabilities:** leave out `udid`, `platformVersion` and the WebDriverAgent capabilities. The endpoint rejects
  them. Unsupported execute methods include `updateSafariPreferences` and `startRecordingScreen`. Plain
  `executeScript` in the Safari web context is not on the list of exclusions, so reading `__apex` / `__tlx` should
  work. Untested.
- **Fallback route: a server-side "web app" Appium run** (upload a test package, custom test environment on the
  `macos_tahoe` host; Appium 3 plus XCUITest are preinstalled, and Xcode 27 covers iOS 18 to 27 as of 2026-09-14).
  This is heavier: package, test spec YAML, run setup time.
  <https://docs.aws.amazon.com/devicefarm/latest/developerguide/test-types-appium.html>,
  <https://docs.aws.amazon.com/devicefarm/latest/developerguide/test-types-web-app-tests.html>,
  <https://docs.aws.amazon.com/devicefarm/latest/developerguide/history.html>
- **Cost:** $0.17 per device minute, metered. Remote access is billed the same as automated runs. There is a one-time
  1,000-minute free trial if the account still has it.
  <https://aws.amazon.com/device-farm/pricing/>
- **WebGPU on the phone:** Safari 26 ships WebGPU on by default on iOS/iPadOS 26 (WebKit WWDC25). iOS 18 has no
  `navigator.gpu`, so a device below 26 only covers the WebGL2 fallback.
  <https://discuss.privacyguides.net/t/news-from-wwdc25-webkit-in-safari-26-beta/28226>,
  <https://appdevelopermagazine.com/WebGPU-in-iOS-26/>

## 3. Run plan (once credentials are cleared)

1. `aws sts get-caller-identity`, `aws devicefarm list-projects --region us-west-2`, and
   `list-devices --filters platform=IOS,formFactor=PHONE` (record the model and OS for each device).
2. Proof, about 3 minutes: create a project, then `create-remote-access-session` on one iOS 26 iPhone with
   `{"parameters":{"appium:version":"3"}}`. Over the endpoint, open `https://brycejmurrin.github.io/f1-game/` in
   Safari (`browserName: safari`), run `executeScript` to return `__apex.info()` and
   `GLX.__tlx.backendState()`, take a screenshot, then `stop-remote-access-session`.
3. A/B, about 8 minutes per leg: the same pins that `js/perf/bench-run.js` writes (`apex26.gfxBackend=three`,
   `apex26.tlxForceGL` `"0"` for WebGPU and `"1"` for WebGL2), then reload and run `GpuTestRun.start()`. Read the
   phase fps p50/p95 and `leg.entry.cold/warm` from `__apex.perf()`, and record `backendState().api` for each leg.
4. Script: `tools/perf/devicefarm-iphone.mjs` (`devices`, `run --device NAME --legs 0|2|4`). It reads credentials only
   from env through the `aws` CLI (`APEX_AWS_CLI` overrides the path), drives WebDriver with `curl` (the proxy applies),
   never prints the endpoint URL, always stops the session in `finally`, and writes `report.json` with
   `deviceMinutes`. `--legs 2` starts BENCHMARK "paths" and trims it to WEBGPU then WEBGL2 (about 8 min); `--legs 4` runs
   the full alternating test (about 14 min).

## 4. Remote access vs automated runs, and what data each can give us

Researched 2026-10-23 for Bryce ("how can we pull more data for profiling from these tests; remote access vs
automated").

| | **Remote access + Appium endpoint** (what `devicefarm-iphone.mjs` uses) | **Automated run** (server-side, custom test environment) |
|---|---|---|
| Who runs the test | our container. It holds a WebDriver session over HTTPS to the endpoint URL and drives Safari | a Device Farm Mac test host (`macos_tahoe`, Xcode 27, Appium 3 preinstalled) next to the device. It runs our uploaded test package via a test spec YAML |
| Setup | none: `create-remote-access-session`, then `endpoints.remoteDriverEndpoint` (about 1.5 min to RUNNING, measured) | build and upload a test package plus test spec, `schedule-run` on a device pool. Each run pays host setup |
| Iteration | fast: change the script, re-run in the same session. Many Appium sessions per remote session. 150 min max, ends after 5 min idle | slow: re-upload and re-schedule per change |
| Parallel devices | one session per device slot | a device pool runs in parallel: the CI-shaped option |
| Billing | the same $0.17/device-minute (metered) for both | same |
| Artifacts | session video and device, network and activity logs in the console **Files** tab. The live Appium log streams during the session | video, iOS **Device Console log**, Appium server output, test spec output, and **anything the test writes to `$DEVICEFARM_LOG_DIR`** (customer artifacts) via `list-artifacts --type FILE/LOG/SCREENSHOT` on the run/job ARN. Reports are kept 400 days |
| Instruments (`xctrace`) | **not reachable**: `mobile: startPerfRecord` needs `xcrun xctrace` on the Appium host, which Device Farm runs, and the endpoint's exclusion list covers neighbouring recorders (`startRecordingScreen`, `startXCTestScreenRecording`) | **plausible**: the test host is a Mac with Xcode, so `mobile: startPerfRecord` (Activity Monitor / Time Profiler / Metal System Trace if offered on device) could save a `.trace` into `$DEVICEFARM_LOG_DIR`. Untested |

`ListArtifacts` documents run/job/suite/test ARNs only. Remote access session files are documented through the
console. `list-artifacts` on a session ARN is worth one free try once a session reaches COMPLETED.

### Data we can pull, cheapest first

1. **In-page, through WebDriver `execute/sync`, on any route (already wired):** `BenchRun` results
   (`apex26.bench/1`: per-phase rAF p50/p95/p99, fill slope, mirror cost, drift, link/pipeline counts, cold/warm entry
   for each path), `GpuTestRun` (adds the WebGPU `timestamp-query` GPU timer when the device has one, the cleanest
   GPU-vs-CPU split we can get from Safari), `GLX.__tlx.backendState()`, `PhoneRecorder` (the PHONE TEST trace),
   `RaceEntryProfile` / `Spans` for entry stages, and `performance.memory`-less heap proxies. Zero extra cost: the
   numbers come back in the poll that keeps the session alive.
2. **Safari console and network through Appium (both routes):** `appium:showSafariConsoleLog: true` routes every
   `Log`/console line to the `safariConsole` log bucket (`POST /session/:id/se/log {type:"safariConsole"}`), so
   WebGPU validation errors, device-lost events and our `Log` stages land on disk with timestamps. Add
   `appium:showSafariNetworkLog: true` for asset timing (pack, model, shader fetches) during cold entry. This is one
   capability flag in the script. Real-device support for these buckets is not stated in the driver docs, so try it
   on the next run.
3. **Device state through XCUITest execute methods (both routes, if not on the exclusion list):** `mobile: deviceInfo`
   gives `thermalState` (0 nominal to 3 critical) and `mobile: batteryInfo` gives level and state, so each leg can
   be tagged with thermal state. That separates throttling from a renderer difference, which matters on a 14-minute
   alternating A/B.
4. **Device Farm session video (remote access):** a frame-accurate visual record of hitches (the 5.3 s frozen
   frame from G2 would be visible). Free with the session; fetched from the console.
5. **Instruments traces (automated route only):** Time Profiler / Activity Monitor on the Safari WebContent and GPU
   processes. This needs an automated-run test package (Appium Node.js, the same WebDriver steps as the script) with
   `mobile: startPerfRecord` and the `.trace` written to `$DEVICEFARM_LOG_DIR`. Worth building only if 1–3 leave a
   question that only a native profiler answers.

Sources: <https://docs.aws.amazon.com/devicefarm/latest/developerguide/test-types.html>,
<https://docs.aws.amazon.com/devicefarm/latest/developerguide/remote-access.html>,
<https://docs.aws.amazon.com/devicefarm/latest/developerguide/how-to-access-session-results.html>,
<https://docs.aws.amazon.com/devicefarm/latest/developerguide/custom-test-environments.html>,
<https://docs.aws.amazon.com/devicefarm/latest/developerguide/reports.html>,
<https://docs.aws.amazon.com/devicefarm/latest/APIReference/API_ListArtifacts.html>,
<https://docs.aws.amazon.com/devicefarm/latest/developerguide/appium-endpoint-interaction.html>,
<https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/>,
<https://appium.github.io/appium-xcuitest-driver/latest/reference/execute-methods/>.

## 5. Result: WebGPU vs WebGL2 on iPhone 18 Pro Max (iOS 27.0, Safari 27)

`devicefarm-iphone.mjs run --device "iPhone 18 Pro Max" --legs 2`: BENCHMARK "paths" trimmed to two legs, WEBGPU then
WEBGL2. Each leg reloaded onto its pin, and `api` was recorded per leg (`webgpu` / `webgl2`, engine "three.js r185",
`fallbackWhy` null). GPU TEST: dry Monza, helmet cam, 6 phases × (5 s settle + 20 s measure).

| | WEBGPU | WEBGL2 |
|---|---|---|
| rAF p50 / p95, all 6 phases | 17 / 17 ms (59.4–60.0 fps) | 17 / 17–18 ms (59.4–59.8 fps) |
| rAF p99 / max | 17–22 / 38–62 ms | 20–23 / 51–67 ms |
| race entry COLD (build) | **29 318 ms** (go 35 154) | **6 472 ms** (go 12 341) |
| race entry WARM (build) | 821 ms | 237 ms |
| GPU timer | supported (`timestamp-query`) | unsupported |
| GPU ms p50 at scale 0.5 / 0.75 / 1.0 | 14.9 / 21.3 / 45.6 | — |
| new program links / pipelines mid-race | 0 / 1 | 1 / 0 |

Reading:
- **Frame rate does not separate the paths here.** Both sit on Safari's 60 Hz rAF cap in every phase, including
  full resolution, so the fill slope reads 0 and `mirrorMs` 0. The 18 Pro Max has headroom on this scene. The
  per-frame comparison needs either a heavier scene (BENCHMARK "races": rain, night, Singapore, Spa) or a cheaper
  device (iPhone 14 is offered), or a CPU-side frame-work number instead of the rAF interval.
- **Cold race entry is the clear gap: WebGPU takes 4.5× as long (29.3 s vs 6.5 s), and warm entry 3.5× as long.**
  This matches G2's iOS 26 cold-entry finding (13 s) and is worse on iOS 27 with the pinned WebGPU path. The
  likely suspect is first-use pipeline/shader compilation (WebGPU pipelines are created at first draw). That needs
  the entry stage breakdown (`RaceEntryProfile` / `Spans`) on the next run before anyone acts on it.
- **The WebGPU GPU-timer values are not trustworthy as absolute ms.** At scale 1.0 they read 45.6 ms p50 while
  frames still arrive every 16.7 ms, which is impossible for serial GPU work. The timer probably spans overlapping
  frames or is quantized. They do scale with pixel count (14.9 → 21.3 → 45.6), so they are usable as a relative
  fill signal only.
- Single run, single device, one leg per path: treat this as a first sample, not a verdict. The full 4-leg
  alternating test (`--legs 4`, about 14 min) controls for order and heat.
