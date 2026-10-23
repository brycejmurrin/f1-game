# AWS Device Farm on a real iPhone (2026-10-23)

Goal: close G1 in `IPHONE-TLX-WEBGPU-2026-10-23.md` (PR #3592), which asks for the same iPhone measured on three.js
WebGPU and on WebGL2, with `__tlx.backendState().api` recorded for each leg. BrowserStack Automate minutes are used up,
so this note tests AWS Device Farm as the device source. Grant: Bryce, in OrchA 26's session, 2026-10-23 about 01:20Z.

## 1. Status

| step | state |
|---|---|
| credentials in env | present: `AWS_ACCESS_KEY_ID` (20 chars), `AWS_SECRET_ACCESS_KEY` (40), `AWS_DEFAULT_REGION=us-west-2`, no session token |
| AWS CLI / SDK | neither installed here (no `aws` binary, no `@aws-sdk/*` in `node_modules`) |
| `sts get-caller-identity`, `devicefarm list-projects` | **not run.** This session's auto-mode classifier refused the AWS CLI v2 install (reason: "Credential Exploration"). Unblocked only by an approval typed in the acting session, or a Bash allow rule for the `aws` CLI. |
| `list-devices` (iOS phones, OS versions) | not run (same blocker) |
| one-device proof, A/B profile | not run. Device minutes used so far: **0** |

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
4. Write a script under `tools/perf/` that takes credentials only from env and prints minutes used.
