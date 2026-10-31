# Phone bridge: a Claude session drives the live game on Bryce's phone (2026-10-30)

Goal (Bryce, 2026-10-30): let a Claude session test and profile the **live** site on the phone he plays on, two-way,
instead of reading SwiftShader numbers from a container. Module: `js/agent/apex-bridge.js`; test:
`tests/unit/apex-bridge.test.mjs`.

## 1. Routes tried

| route | verdict | evidence |
|---|---|---|
| MCP server on the phone | no | a phone browser takes no inbound connection |
| Nostr relays (the lobby's rendezvous, `js/net/nostr.js`) | no | the container proxy refuses WebSocket upgrades (`/root/.ccr/README.md` §Not supported) |
| ntfy.sh (free HTTP pub/sub, CORS `*`) | no | reachable from the container, but its anonymous quota is per IP and the shared proxy IP had already spent it: `429 {"code":42908,"error":"limit reached: daily message quota reached"}` on the first publish |
| claude.ai artifact (shared `db`) framing the game | no | the artifact page contract: "Other sites cannot be embedded — no … iframes" |
| **one GitHub issue as the bus** | **yes** | both ends reach api.github.com; the session posts with the GitHub MCP, the phone with a fine-grained token |

GitHub facts this leans on (read 2026-10-30):
- The REST API "supports cross-origin resource sharing (CORS) for AJAX requests from any origin" —
  <https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests>
- "Making a conditional request does not count against your primary rate limit if a `304` response is returned"
  (authorized requests) — <https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api>
- The game's CSP `connect-src` already allows `https:`.

## 2. Setup (Bryce, once per device, from the phone)

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: only
   `brycejmurrin/f1-game`. Permissions: **Issues: Read and write**, nothing else. Expiry: 7 days.
2. The session opens (or names) a bridge issue, say #N, and gives the link
   `https://brycejmurrin.github.io/f1-game/?apex=1&bridge=N`.
3. Open it on the phone, paste the token into the LINK box once (kept in `localStorage` `apex26.bridgeToken` on that
   device only; never in a URL). The orange **CLAUDE LINK** badge appears; tap it to end the link.

## 3. Protocol

- On link the page posts a hello comment (` ```apex-result ` fence, `{hello, facts}`); its server `created_at` is the
  cutoff, so a reload never replays older commands.
- The session posts a command comment:

  ````
  ```apex-cmd
  {"cmd": "frames", "args": {"seconds": 10}}
  ```
  ````

- The page polls the thread every 4 s while visible (ETag, so an idle poll is a free 304), runs commands whose
  author is the repo OWNER, oldest first, and answers with ` ```apex-result ` `{re: <command comment id>, cmd, ok, ms,
  value | error}`. Read them back with the GitHub MCP `issue_read` `get_comments`.

| cmd | args | does |
|---|---|---|
| `ping` | — | liveness |
| `facts` | — | UA, dpr, viewport, `navigator.gpu`, apex-sha, `__apex.info()` |
| `frames` | `seconds` 1–60 | rAF interval p50/p95/p99/max, fps, frames over 33 ms, long tasks |
| `call` | `method`, `args[]` | one `__apex` method from `CALL_OK` (perf/state reads, `race`/`go`/`jump`/`rollout`, renderer A/B toggles) |
| `gpuTest` | `op` start/stop/status/active | the PHONE TEST > GPU TEST run (`GpuTestRun`) |
| `recorder` | `op` start/stop/isOn/json | `PhoneRecorder` |
| `reload` | — | reload the page (the link re-forms with a new hello) |
| `path` | `to` webgpu/webgl2/auto, `reload` | pin three.js on a path (the pin `BenchRun.pathPrefs` writes) and reload; no `to` = the current pin and live path |
| `bench` | `op` tests/start/stop/status/result/leg | SETTINGS > GRAPHICS > BENCHMARK (`BenchRun`); start reloads per leg |
| `snap` | `w` 64–640, `q` | a downscaled JPEG data URL of the canvas, under 56,000 chars |
| `wait` | `ms` 0–30000 | a pause between `batch` steps |
| `batch` | `steps[]` 1–10 | several commands from one comment; stops at the first failure; `reload`/`path` only last |

Recipes and result parsing: skill `phone-bridge` (`.claude/skills/phone-bridge/`).

## 4. Limits and safety

- Only the OWNER's comments command the page; the token can touch Issues on this repo and nothing else. No eval:
  saves, career, garage files and every lobby / net hook are outside `CALL_OK` (pinned by the unit test).
- The repo is public, so the thread (device facts, results) is public. Close the issue when done.
- iOS suspends a background tab, so the game must stay in front while commands run. Replies are capped at 60,000
  chars (GitHub's comment limit is 65,536); a bigger result comes back as `{truncated, head}`.
- Poll latency is about 4 s plus GitHub's own; this is for perf runs and state reads, not frame-level control.

## 5. Token box fix (2026-10-30, Bryce: "It won't let me type or paste")

The first LINK box was a plain `<form>` on `<body>`. The game's focus trap (`TopModal.onFocusIn`, a document-capture
`focusin`) pulled focus back into the title screen as soon as the box was tapped: in Chromium at 844×390 touch the
focus landed on `#soundbtn` and typed text never reached the box. The box is now its own modal `<dialog>` (top layer,
never inert), a window-capture `focusin` listener keeps that trap from seeing focus inside it, and a PASTE button
reads the clipboard directly. Same probe after the fix: focus stays on the input and the text arrives.

## 6. Live runs

| date (Pacific) | build (`facts.sha`) | device | path | scene | fps | p50 / p95 / p99 ms | over 33 ms |
|---|---|---|---|---|---|---|---|
| 2026-10-30 | — | — | — | first live run pending: the link was not formed this session | — | — | — |
