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
| A/B profile | **done**: 2-leg on iPhone 18 Pro Max (§5), then the 4-leg alternating test on iPhone 18 Pro Max and iPhone 14 with entry stages, thermal and Safari logs (§6) |
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

## 6. Result: the 4-leg alternating test on two iPhones (iOS 27.0), with entry stages and thermal

`devicefarm-iphone.mjs run --device <name> --legs 4`: BENCHMARK "paths" in full (WEBGPU, WEBGL2, WEBGL2, WEBGPU), run on
both phones in parallel at 02:03–02:20Z. Each poll also read `RaceEntryProfile.stageTable()`, `mobile: deviceInfo`
(thermal) and the Safari console/network buffers. **Thermal state stayed 0 (nominal) on both phones for the whole
run**, so the differences below are not throttling.

### Frame time (median over the two legs per path; rAF p50 / p95 ms, fps)

| phase | 18 Pro Max WEBGPU | 18 Pro Max WEBGL2 | **iPhone 14 WEBGPU** | **iPhone 14 WEBGL2** |
|---|---|---|---|---|
| default | 17/17 (59.9) | 17/17 (59.9) | **17/17 (59.7)** | **17/24.5 (55.7)** |
| s50 | 17/17 (59.6) | 17/17 (59.6) | 17/17 (59.6) | 17/22 (57.1) |
| s75 | 17/17 (59.5) | 17/17 (59.4) | **17/17 (59.4)** | **19/27 (51.0)** |
| s100 | 17/17 (59.9) | 17/17.5 (59.6) | **17/17 (59.6)** | **23/34 (41.8)** |
| mirrorOff | 17/17 (59.7) | 17/17 (59.6) | 17/17 (59.5) | 17/21.5 (57.4) |
| fill slope | 0 | 0 | 0 | 8.07 ms per full frame |

- **On iPhone 14, three.js WebGPU holds 60 fps at every scale; WebGL2 falls to 51 fps at 0.75 and 42 fps at full
  resolution** (p95 34 ms), and loses about 4 fps even at the player's default. Both WebGL2 legs agree (p99 52 / 61
  ms at s100), and both WebGPU legs agree. This is the first real-device evidence that the WebGPU path is the faster
  renderer on a mid-range iPhone. AUTO currently picks WebGL2 on every WebKit device (`tlx.js` `isWebKit`).
- iPhone 18 Pro Max: both paths stay on Safari's 60 Hz rAF cap in every phase, as in §5.
- The WebGPU `timestamp-query` GPU timer reads 81–97 ms p50 on iPhone 14 while frames arrive at 16.7 ms, so it is
  not usable as an absolute GPU time on iOS (see §5).

### Race entry (BenchRun cold `buildMs`, ms) and the stage that costs it

| leg (order) | 18 Pro Max cold | of which `mirrorPrepare` | iPhone 14 cold | of which `mirrorPrepare` |
|---|---|---|---|---|
| 1 WEBGPU (first in session) | 30 394 | 28 197 | 33 913 (window 55 410) | 30 005 |
| 2 WEBGL2 | 6 439 | 4 659 | 11 834 | 8 483 |
| 3 WEBGL2 | 3 244 | 1 580 | 5 710 | 2 574 |
| 4 WEBGPU | 5 758 | 4 132 | 9 364 | 6 285 |
| warm (all legs) | 221–234 | 70–88 | 384–454 (WEBGPU leg 1: 2 945) | 123–2 642 |

- **Corrected (A·W14, PR #3604, 02:44Z): the 28–34 s first-leg cost belongs to WebGPU, not to session order.** In
  my runs leg 1 was always WEBGPU, so order and path were confounded. A·W14 ran the iPhone 14 as WEBGL2, WEBGPU,
  WEBGL2, WEBGPU with `GLX.__tlx.memState().warm` per entry. The spike moved to the first WEBGPU leg (warm 42.9 s:
  scene 16.6, mirror 16.9, draw 5.2, fx 4.2 s), and the session's first WEBGL2 leg took only 9.4 s. **The first
  WebGPU pipeline build costs about 30 s on a phone.** Safari then caches it: my later WEBGPU legs entered in 5.8 s
  (18 Pro Max) and 9.4 s (iPhone 14), still about 1.7× WebGL2's 3.2 / 5.7 s. Whether that cache survives a tab
  close, an app kill or a new deploy (new shader source) decides how often a player pays the 30 s. Not measured yet.
- **`mirrorPrepare` is 70–93 % of every cold entry, on both paths.** Every other stage (`loadTrack` 0.3–0.8 s,
  `gridCountdown` 0.8–1.6 s, `warmCarAssets` 0.8–1.5 s) is small and path-independent. This is the same stage G2
  found on iOS 26 (9.96 s). A·W14 measured `mirrorPrepare` ≈ `memState().warm.total` on every cold leg, so this stage is the whole
  shader/pipeline warm-up, not mirror work alone.
- No WebGPU validation errors, device-lost events or error-level console lines on either phone. The console has
  only known warnings (`TLX on a phone: ~54 MB CPU geometry copies`, `unregistered save key apex26.phoneRec`,
  music `NotAllowedError` without a user gesture). The network log captured about 8.5k rows per phone (not analysed
  here).

### Cost

Wall time per session: proof about 4.5 min, 2-leg A/B about 11 min, 4-leg runs about 16.5 min each. **About 48
device-minutes in total** (about $8 at $0.17 metered unless the free trial covers it). AWS still reported every
session as STOPPING with `deviceMinutes` 0 at 02:21Z, so the billed figure must be read later.

## 7. Automated (server-side) runs: what they add, what broke

`devicefarm-iphone.mjs auto` (Bryce: "Also try using aws automated tests"). It packages
`tools/perf/devicefarm-host.mjs` (a zip of the `npm pack` tarball, upload type `APPIUM_WEB_NODE_TEST_PACKAGE`),
generates a `macos_tahoe` test spec (`APPIUM_WEB_NODE_TEST_SPEC`), creates a static one-device pool (a static pool
rejects `--max-devices`), runs `schedule-run`, waits, and downloads every artifact. Two runs: iPhone 14 (02:26Z, before
the fleet device split) and iPhone 18 Pro Max (02:53Z), each 2 legs plus an Instruments Activity Monitor attempt.

**What works.** The host has Node 24, Appium 3 with XCUITest and the prebuilt WDA, and `xctrace version 27.0`. Appium
was up 2 s after launch, and Safari opened the live site 10 s into the test. On the 18 Pro Max both legs completed
and reproduced the remote-access numbers: first WEBGPU cold entry 31.6 s (`mirrorPrepare` 29.4 s), WEBGL2 7.2 s,
warm 228 / 247 ms, 60 fps on both paths in every phase, thermal 0 throughout.

**What it adds over remote access** (all fetched by `list-artifacts` on the run ARN):

| artifact | 18 Pro Max run | use |
|---|---|---|
| Video | 54 MB mp4 | frame-accurate replay of every hitch and freeze |
| Syslog | 290 MB (+ 27 / 2.8 MB) | full iOS device log: WebContent/GPU process messages, jetsam, thermal |
| TCP dump log | 3.9 MB | packet-level asset timing |
| Customer Artifacts | our `report.json`, `safariConsole.jsonl`, `appium.log`, the trace | everything the host script wrote to `$DEVICEFARM_LOG_DIR` |
| Screenshots | `boot`, `bench` | from `$DEVICEFARM_SCREENSHOT_PATH` |

**Instruments does not work on Device Farm (yet).** `mobile: startPerfRecord` starts xctrace, but on both phones
xctrace logged **"Device got disconnected, ending recording"** 2.7 s later, so the saved trace (659 KB) covers about
3 s. On the iPhone 14 the Safari remote debugger also stopped answering after the first leg's reload: every
`execute/sync` timed out for 20 min until I stopped the run. That run cost 33.7 device-minutes for no result. On the
18 Pro Max the debugger survived. The host script therefore defaults to `--perf none`, puts a 90 s timeout on every
WebDriver call, and after two failed polls deletes the session and attaches a fresh one to the open tab
(`appium:safariInitialUrl: ""`).

**Reading Device Farm status.** During a custom-environment run, `list-suites` shows Setup/Tests/Teardown as PENDING
and `list-jobs` shows no `started` time even while the test is executing. I misread a running job as queued because
of this. The truth is in the `Test spec timestamped output` artifact once the run completes. Device minutes include
host setup and teardown: the 18 Pro Max test body took 7 min, but the run billed 18.5 device-minutes (7.5 metered)
and finalised 13 min after the test ended.

**Remote access or automated?** For the A/B and entry timing, remote access (`run`) is cheaper (minutes about equal
to test time), gives live feedback and has never wedged. Use `auto` when the evidence needed is the video, the full
device syslog or the packet capture, or for unattended runs across several devices at once.

**Trial budget.** The account has a 1,000-minute free trial: 844.83 minutes were left at 03:14Z (both fleets
combined), so nothing has been billed.

## 8. Shader-cache lifetime on the post-fix build (iPhone 18 Pro Max, 07:07–07:14Z)

Bryce: "go deeper do more runs and live connections". The live site at this point (`version.json` build 20919)
carries both follow-ups: #3603 (AUTO picks three.js WebGPU on WebKit; the unpinned boot now reports `api=webgpu`)
and #3604 (the warm-up/mirrorPrepare fix; the stage is now reported as `programWarm`). Run:
`devicefarm-iphone.mjs run --scenario cache --pins webgpu,webgl2` (remote access, `?apex=1`). Each step is one
`__apex.race("monza")` entry timed by `RaceEntryProfile` plus `GLX.__tlx.memState().warm`. **Caveat on "first":** a
Device Farm session does not reliably start with an empty Safari cache. A·W14 (#3604, comment 6359610979) saw the
first-WebGPU `scene` stage at 3.5 s in a session that began about 1 min after its previous session on the same
phone, against 7.8 s in that previous one. Device Farm has more than one iPhone 18 Pro Max, and this unit may have
run the game earlier tonight, so the "first" row is a first entry in this session, not a guaranteed cold device.
A truly cold number needs either a unit known to be unused or a cache clear (Settings › Safari › Clear History and
Website Data via XCUITest) before the first entry.

| step | WEBGPU entry window | WEBGPU `programWarm` (warm.total) | WEBGL2 entry window | WEBGL2 `programWarm` (warm.total) |
|---|---|---|---|---|
| first entry of the session | 9.1 s | **7.3 s** (6.8) | 5.3 s | 2.3 s (2.3) |
| after a page reload | 3.8 s | 2.3 s (2.4) | 1.9 s | 0.37 s (0.43) |
| after a second reload | 1.7 s | 0.24 s (0.30) | 2.9 s | 0.37 s (0.42) |
| after force-quitting Safari (`mobile: terminateApp`) | **2.8 s** | **0.24 s** (0.29) | 1.9 s | 0.24 s (0.30) |

- **Safari's compiled-shader cache survives a force-quit.** After the first two loads a WebGPU race warms in
  0.24 s, the same as WebGL2. A player pays the warm-up about once per device (per cache life), not per launch, and Device Farm's
  own cache carry-over between sessions points the same way.
  Still unmeasured: a reboot, low-storage eviction, and a deploy that changes shader source.
- **WebGPU needs two loads to finish warming** (7.3 → 2.3 → 0.24 s); WebGL2 needs one (2.3 → 0.37 s). The second
  WebGPU warm is mostly `post` (1.9 s): pipelines the first warm deferred.
- **#3604 worked:** the first WebGPU warm on this phone is 7.3 s against 29.4 s (`mirrorPrepare`) before it (§6,
  §7). The first-session entry window is 9.1 s, down from about 30 s.
- **The entry floor is not the renderer.** With a warm cache, both paths enter in 1.7–2.9 s, made of `loadTrack`
  (0.36–0.41 s), `gridCountdown` (0.73–0.86 s) and `warmCarAssets` (0.69–0.82 s), plus about 1 s of `scenery` when
  it is not cached. Any further entry win is there, not in shaders.
- Live view: each run logs `live view: AWS console > Device Farm > … > Remote access > <session>`; the stream and
  the recorded video are in the console while the script drives the phone.
