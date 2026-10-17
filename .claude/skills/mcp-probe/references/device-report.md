# Real-device report recipes

**Use when:** this recipe family is the narrowest match for the question.

**Verification:** record the exact command, target (local or deployed), and returned evidence.

**Writes/ownership:** read-only; the parent owns browser startup and serialized MCP use.

## Getting a report off a REAL device (a phone with the bug)

MCP cannot reach the reporter's phone, and the backends that only misbehave
there (three/TLX on iOS) are exactly the ones a container cannot reproduce. Two
deliveries, same paste — `tools/mcp/apex-report.js` (bundle: `diag()`, GL identity,
canvas context attributes, log ring, `apex26.*`, frame sample + PNG, `verdict`).

| Page the device is on | What the reporter does | Where the bundle goes |
| --- | --- | --- |
| Served from your box (`node tools/mcp/report-server.mjs`, phone opens the printed LAN URL **with `?report=1`**) | taps SEND REPORT — no console at all | POSTs itself to `artifacts/reports/`, verdict printed in your terminal |
| Same, but they have a console | `fetch("/tools/mcp/apex-report.js").then(r=>r.text()).then(s=>(0,eval)(s))` | same |
| The deployed site | same line, but fetch `https://raw.githubusercontent.com/brycejmurrin/f1-game/claude/f1-game-project-26h3ng/tools/mcp/apex-report.js` | downloads on the device — the POST cannot cross from https to a plain-http laptop |

Prefer `?report=1` for anyone on an iPhone: iOS Safari has no console without a
Mac on the other end of a cable and Web Inspector switched on, and a tap samples
the frame the reporter is actually looking at.

`pages.yml` stages runtime dirs only, so `tools/` is NOT on the live site: the
same-origin loader works **only** off a local server, which is also the one that
serves whatever tree you are debugging. Ask for the LAN URL, not localhost — the
phone cannot reach your loopback. `apexReport({post:false})` forces a download.