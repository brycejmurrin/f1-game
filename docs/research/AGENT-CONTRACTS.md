# Agent contract references

Local tools validate requests before work, preserve operation identity across
awaits, and report incomplete coverage. Plans and help do not mutate the tree,
start a browser or contact a remote service. These contracts apply equally to
the CLI and MCP entry points.

Current API references checked on 2026-10-01:

- [MCP tool requests, input/output schemas and errors](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [JSON-RPC invalid requests and invalid params](https://www.jsonrpc.org/specification)
- [Node filesystem real paths and symbolic links](https://nodejs.org/api/fs.html)
- [Node timers and cancellation](https://nodejs.org/api/timers.html)
- [Node test reporters and timeout cleanup](https://nodejs.org/api/test.html#test-reporters)
- [Playwright page API and `waitForFunction` argument/options order](https://playwright.dev/docs/api/class-page)
- [Playwright screenshot behavior](https://playwright.dev/docs/screenshots)
- [Playwright compositor video recording](https://playwright.dev/docs/videos)
- [HTML dialogs and the top layer](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)
- [DOM selector document ordering](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll)
- [YAML parser and document diagnostics](https://eemeli.org/yaml/)

`tools/lib/session-contracts.mjs` is the local adapter for hosted tool results.
It unwraps nested `structuredContent` before outer status text, preserves error
signals, and marks conflicting plugin installation observations unresolved.
Its Drive file-reference adapter explicitly requests `include_base64:false`;
it makes no Drive call and does not select files or create documents.

The session catalog and the repository MCP catalog are different inputs.
Browser Use tools do not provide the deterministic Browser skill's DOM,
console and local-runtime interfaces. The repository Playwright harness is the
local validation path when those interfaces are absent. A catalog snapshot
can omit orchestration tools; the adapter reports those omissions separately.

Hosted service schemas, cancellation endpoints, permission metadata and remote
skill resources belong to their providers. Local normalization and diagnostics
do not repair those services or prove their availability. Skill resources that
require a Library artifact or a mounted helper directory remain unavailable
until the host supplies the required capability; an ordinary local file cannot
stand in for a required hosted artifact.

Validation should reproduce the boundary that failed. A successful screenshot
write is not evidence of a rendered scene; native dialog selectors are in DOM
order rather than opening order; a zero-item or rejected rollout is not a
passing diagnostic. Keep skipped work and actual browser/GPU proof explicit.

## Reproducible diagnostics

| Entry point | Evidence and bounds |
|---|---|
| `node tools/check/doctor.mjs --tree --json` or `apex_doctor` | YAML, references, mirrors, browser/cache paths and dependency availability; no installs, network or browser launch. Add `--catalog FILE` to diagnose a supplied hosted capability snapshot. |
| `node tools/check/skill-smoke.mjs --all --plan` | One bounded recipe per canonical skill. `--check` executes offline fixtures serially and requires positive passing test counts. Browser and hardware work has separate unverified status. |
| `node tools/check/lifecycle-census.mjs --track monza --seed 42 --out artifacts/census` | Actual held-flag/debris resets, obsolete WATCH completion and owned-resource cleanup, including failed boot. VM evidence does not prove GPU resource lifetime. |
| `node tools/shot/capture-bundle.mjs --track monza --backend three --viewport 1280x720 --seed 42 --out artifacts/capture` | Page/build identity, selected backend, rendered pixels, camera and console evidence, followed by teardown. Backend fallback and HUD over a black scene fail verification. |
| `node tools/shot/replay-camera-probe.mjs --fixture default --track baku --backend three --viewport 640x360 --frames 1 --seed 42 --timeout-ms 900000 --out artifacts/replay` | Offline replay entry, seek, follow, exit and reentry. Actual rendered camera anchors and independent clocks are recorded without a corrective camera reset. |
| `node tools/ci/pick-tests.mjs --json docs/TESTING.md unknown-config.json` | Per-path receipts retain the unclaimed path and return partial coverage even when other paths select valid groups. |

The capture and lifecycle commands accept `--plan` for validated inputs without
creating outputs. Browser captures must run serially in the parent agent. The
replay-camera and f1-animation-cameras repository skills provide the local
workflow and reference files; the latter does not repair a hosted skill package.

The replay probe uses compositor recording to drive headless frames and requires
Playwright's FFmpeg binary in the selected writable browser cache. Its camera-only
fixture retains radio timestamps and captions while removing audio URLs. Exit
controls receive real pointer clicks after visibility, enabled-state and center
hit-target checks; this avoids a two-frame stability wait under slow software
rendering. Failure snapshots preserve inexpensive game and screen state before
querying GPU diagnostics within the same bounded deadline.

Provider-owned follow-ups include unavailable remote reference files or helper
mounts, Pets Library persistence, Browser primitive/cancellation endpoints,
installation/permission contradictions, typed hosted output schemas and prose-only
hosted input constraints. The local adapters expose these boundaries; changing a
repository cannot supply a missing hosted endpoint or alter a provider package.
