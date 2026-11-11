# Reading Bryce's iPhone Safari console (2026-10-29, #4203)

Follow-up from the dev-tooling scout (PR #4192, §3 "Safari Web Inspector from Linux/Windows"). Goal: an agent reads
the console of the game running in Safari on Bryce's iPhone (the TLX WebGPU path he plays), so a device-only bug can be
diagnosed from text instead of screenshots.

**Status: wired and unit-tested against a fake socket; NOT verified on a real phone.** No agent has run it against
the device. The first run on Bryce's phone is the verification; record the result in this file.

## What needs Bryce's phone and cable (an agent cannot do these)
1. A computer with the cable: macOS (easiest) or Linux/Windows. The cloud container has no USB path to the phone.
2. iPhone: Settings > Safari > Advanced > Web Inspector = ON; plug in, unlock, tap **Trust**.
3. Open the game in Safari on the phone and keep it unlocked and in the foreground (the tab list is empty otherwise).
4. Run the proxy on that computer, then run the CLI below, or paste its output into the session.

## Route
```sh
brew install ios-webkit-debug-proxy        # macOS; Windows: scoop install ios-webkit-debug-proxy; Linux: build from source
ios_webkit_debug_proxy -F                  # -F = no frontend; device list http://localhost:9221/json, first device :9222
node tools/mcp/ios-console.mjs status      # binary present? devices listed?
node tools/mcp/ios-console.mjs tabs        # Safari tabs on device 1
node tools/mcp/ios-console.mjs console --match apex --seconds 30   # Console.enable, then print Console.messageAdded
```
`console` prints messages logged before attach too (the WebKit Console domain replays them on `enable`). Pipe it to
`artifacts/logs/ios-console.log` when asking an agent to read it.

## Why a WebKit client, not Chrome DevTools
The proxy's own README: it "proxies requests from usbmuxd daemon over a websocket connection" to MobileSafari, but
there are "major discrepancies" between Chrome's and WebKit's inspector protocols, so newer Chrome DevTools does not
work against it. The CLI therefore speaks the WebKit `Console` domain directly. Do not point `chrome-devtools` MCP at it.

## Open risks (unverified until a phone run)
- Recent iOS: the README says an empty tab list on iOS 12.2+ and lockdownd errors on iOS 10+ were fixed in newer proxy
  builds; the repo shows no tagged release, so build or install the latest. No source found confirms the current iOS
  (the phone runs a 2026 build). If `tabs` is empty, that is the first suspect.
- Whether the proxy forwards page messages unwrapped on the newest iOS (Target-multiplexed protocol) is untested; if
  `console` connects but prints nothing for a page that logs, capture raw frames with `--json` and file a follow-up.
- Alternative if the proxy fails: HimbeersaftLP/ios-safari-remote-debug-kit (WebKit's own frontend), or a Mac with
  Safari > Develop > [iPhone].

## Sources (read 2026-10-29)
- https://github.com/google/ios-webkit-debug-proxy (install, ports 9221/9222+, Web Inspector, Trust, protocol note)
- https://webkit.googlesource.com/WebKit/+/be09c02769141845ecc5fd59a18746729bb6bc83/Source/JavaScriptCore/inspector/protocol/Console.json (Console.enable replays earlier messages)
- https://github.com/HimbeersaftLP/ios-safari-remote-debug-kit
