# tools/mcp B — complete source map

Scope: sorted `git ls-files tools/mcp`, positions 29–56 inclusive: exactly 28 files and 7,285 source lines. Read on 2026-10-27 at HEAD `212adc24b985b120a63507c988abea69e7740e74`; hashes identify the working-tree bytes actually read. This is source evidence, not a runtime health or test verdict. No mapped executable, server, browser, test, benchmark or workflow was run. Parent owns documentation checks.

Instructions read: `AGENTS.md`, `.claude/skills/code-nav/SKILL.md`, its `references/output-and-limits.md`, and `.claude/rules/js-nav.md`. Attached apex-lsp was used for an outline and references; source fallback is explicit below.

## Exact inventory and full-read ledger

Every listed file was read completely, including comments, using the contiguous source windows in the table. Early combined responses were truncated and were not relied on: debugger HTTP/catalog were reread; debugger-node 1–240 was reread as individual windows; lsp-mcp 1245–1280 and 1321–1342 were explicitly reread after combined-output omissions. Each final source window was bounded to at most 120 lines. SHA256 is over original bytes, without source-output line prefixes.

| Position | File | Full-read windows (inclusive) | SHA256 |
|---:|---|---|---|
| 29 | `tools/mcp/js-debugger-http.mjs` | 1–116 | `68f95d9d39e7a2ddb77ac401e42cdc843bd07e2a508404072af713934770dfed` |
| 30 | `tools/mcp/js-debugger-mcp.json` | 1–9 | `bca08c1e112a187263a10b0ed6c035780e1c08d73899b6084cc4d70b00f5e0d1` |
| 31 | `tools/mcp/js-debugger-mcp.mjs` | 1–120, 121–219 | `81edb302fa15e0950577458a9c0713eb8264c59a0fe792947ad97ab2fb35afec` |
| 32 | `tools/mcp/js-debugger-mcp.sh` | 1–5 | `2e3d415324b6d2ad16c8f7b52f868f9e2666bb634b5f42afd27b722e8dc2dd10` |
| 33 | `tools/mcp/js-debugger-node.mjs` | 1–120, 121–240, 241–291 | `5bb491b061fa842e4f1edc61943f8a9dd3cbceb6ae689badc638c6f349d8bb7f` |
| 34 | `tools/mcp/js-debugger-session.mjs` | 1–120, 121–240, 241–360, 361–480, 481–533 | `79694d24df1f70ea46e7cffe6916be8ba03aece73d6c2f4284f2334a3e203720` |
| 35 | `tools/mcp/js-debugger-smoke.mjs` | 1–120, 121–240, 241–336 | `4b14dca40b508cbd1ac18d4b19b54375292f46cf74f5e049272956b0002c3d56` |
| 36 | `tools/mcp/js-debugger-trace.mjs` | 1–120, 121–240, 241–360, 361–394 | `a50ef40ef63495ff7629df0c63e5fa9285e70e40e0fdc7f9babbfb08e41a477c` |
| 37 | `tools/mcp/js-debugger-workflow.mjs` | 1–120, 121–166 | `ba12ef14c1e5e3720f9c292fcf86ad6a7ed03a192756ffe40933dba9960badec` |
| 38 | `tools/mcp/lsp-eval.mjs` | 1–68 | `ab29865e6f75c44f9abe5bd6e49217cbabac42a9bd867529cc2abcb020501902` |
| 39 | `tools/mcp/lsp-mcp.mjs` | 1–120, 121–240, 241–360, 361–480, 481–600, 601–720, 721–840, 841–960, 961–1080, 1081–1200, 1201–1320, 1321–1342 | `d814983685992756e1c314ed7709335ed487187e14a4b25bdedc1416437a9cc2` |
| 40 | `tools/mcp/lsp-mcp.sh` | 1–5 | `92705bdea1aa8fb7975bea332e8563959195dc4b3b13d6c23b028d625282249b` |
| 41 | `tools/mcp/lsp-navigation-bench.mjs` | 1–44 | `ffe899638ca46dc19114eda7f1d822bcc4f1e24339375cf8806fcdf8108f5187` |
| 42 | `tools/mcp/mcp-cli.mjs` | 1–120, 121–240, 241–278 | `08628abedf94d6334eb12a819f5cc584f2d78dbd457702c07a2d59a1c167f494` |
| 43 | `tools/mcp/mcp-listing-cost.mjs` | 1–120, 121–143 | `29e5aac6d3f6b4ee154ebf3208a3dcd00fc1ce304ddf353681defa65ab634634` |
| 44 | `tools/mcp/mcp-preflight.sh` | 1–48 | `9e5c05b9d6436d7f9591d7bf2357ba1756d019aa16c6dc3bbb8b713ef10ac40a` |
| 45 | `tools/mcp/mcp-smoke.mjs` | 1–120, 121–240, 241–321 | `14355206ff817986caf0fd13be320e38a0ecf851bec07fbf2af177953e7dac37` |
| 46 | `tools/mcp/output-level-mcp.mjs` | 1–120, 121–240, 241–290 | `7b8a9dfde3175876f232ea504b64ee5c51902fa86b503d9754b0eea498310098` |
| 47 | `tools/mcp/output-level-mcp.sh` | 1–7 | `eccb2de7bd1052331065766f8b645f66e6b2339c3454b5a4ddfc6f50856c0480` |
| 48 | `tools/mcp/playwright-mcp.sh` | 1–120, 121–133 | `9d1729768a285c810da6293bfbd959f42292d07061ebe680ef6d0d84f4cb8640` |
| 49 | `tools/mcp/probe-mcp.py` | 1–120, 121–240, 241–360, 361–480, 481–600, 601–720, 721–840, 841–921 | `4a95388d3dfc35f1ff5a7b484fd50621064f4619da725ee184404d5e59345f1d` |
| 50 | `tools/mcp/report-server.mjs` | 1–120, 121–240, 241–314 | `930697856dddebf6d6bed56eb24a87aa5764d934b3eea3dc690745b92d788e48` |
| 51 | `tools/mcp/tinyfish-mcp.sh` | 1–120, 121–240, 241–360, 361–480, 481–557 | `0a6bea81204c62131ef39931fb58109ac73889ed558908b99894a473a625a157` |
| 52 | `tools/mcp/tinyfish-rpc.py` | 1–120, 121–240, 241–263 | `65d94b4e6e32517a796beee93755a84db276ab1d8c0f39e33c190c1837d42de4` |
| 53 | `tools/mcp/ui-tools.mjs` | 1–120, 121–156 | `6e782a76fa6c27049af8f0bd98b248cc5467b8da0c906503ae8d2cd376fb8200` |
| 54 | `tools/mcp/workflow-harness-client.mjs` | 1–16 | `402eab6613b5852b879bb7a5f13c6bcbb5ce0be43356dbe113f2f746b78902b6` |
| 55 | `tools/mcp/workflow-harness-core.mjs` | 1–120, 121–240, 241–273 | `0b97eb01966c26b4dd38dff9b6f63e453922bde6dcc90ed0d7bbb741662705a0` |
| 56 | `tools/mcp/workflow-harness.mjs` | 1–37 | `5f4a1fff88ce4539ffc75a3157fdf82b6946dc79d2fe932c7855b957295b933d` |

## Architecture and traced contracts

The configured path is host → `output-level-mcp.sh` → `output-level-mcp.mjs` → server wrapper → implementation. `.mcp.json:3–81` configures six stdio servers; this half owns debugger, LSP and official Playwright launchers plus the shared output gateway. `probe-mcp.py` and TinyFish are optional CLI/opt-in surfaces, absent from that configuration. The minimal `js-debugger-mcp.json` is an alternate raw debugger entry, without the gateway.

Debugger shell calls use a persistent loopback HTTP session: `js-debugger-mcp.sh:5` execs `js-debugger-cli.mjs`; the CLI imports `startDebuggerHttp` and `debuggerRequest` at line 5 and starts the daemon at line 62. HTTP dispatch and stdio both reach `handleRpc` → `callTool` → `DebugSession` methods. Session methods incorporate trace/profile/workflow mixins. Node-test probing owns separate inspector processes rather than the browser session. The native smoke imports the HTTP request client and exercises both transports.

LSP shell and stdio paths share `Lsp` and `callTool`. LSP transport launches the checkout's TypeScript executable with `--lsp --stdio`, opens the anchor, and scans `js/` plus declarations under `types/`. Semantic results are supplemented by explicitly labelled AST/text fallbacks for window globals, CommonJS-scoped globals, reinjected var IIFEs and the `G` façade. The workflow harness imports these same schemas and implementation, but runs queries against a detached frozen source worktree with recorded worker budgets and transcripts.

UI handlers are dependency-injected into apex-tools: `apex-tools-mcp.mjs:36` imports `createUITools` and schemas; line 3110 creates the handlers with root, result/refusal, safe-output, spawn, occupancy and mock helpers. `apex_ui_inspect` invokes the explorer CLI, which owns the browser lock. Mission planning writes a scenario and command; it does not execute a playtest. Saved inspection comparison is a filesystem operation.

The report collector deliberately differs from loopback-only MCP bridges: it defaults to `0.0.0.0` so a phone can reach the working tree, authenticates with a per-session capability/cookie, serves an allowlist of runtime paths, and accepts exclusive JSON report files. It partners with `apex-report.js`, not with the MCP JSON-RPC protocol.

## Per-file responsibilities, interfaces and consumers

### js-debugger-http.mjs

Exports `DEFAULT_PORT=3714`, port parsing, HTTP refusal checks, `startDebuggerHttp` and `debuggerRequest`. Imports `DebugSession` and the MCP handler/catalog. GET `/healthz` reports session connectivity; POST `/mcp` handles RPC and returns 202 for notifications. Binds 127.0.0.1; rejects non-loopback Host, every browser Origin, wrong POST content type and unsupported version headers. Limits: 32 pending requests, 64,000 request bytes, 10-second headers/request timeouts. Close destroys incomplete uploads, settles dispatched work and detaches. Client requires nonzero port, allows a 660-second node-test deadline versus 35 seconds normally, caps response at 512,000 bytes, and states that timeout does not cancel execution. Direct consumers: debugger CLI and native smoke; transport/unit tests import it.

### js-debugger-mcp.json

Nine-line alternate `mcpServers.js-debugger` stdio configuration: bash wrapper with `serve`. Transport tests inspect this contract. Current root config additionally places the output gateway in front.

### js-debugger-mcp.mjs

Exports the 23-tool debugger catalog, `callTool`, `handleRpc`, and `serve`. Imports session and node-test implementations. Schemas use one-based source positions, zero-based frame indexes and pause-generation tokens. Recursive argument validation enforces types, bounds, enums, required/unknown keys and limited aliases (`frameIndex`, `mode`, `token`, `scriptUrl`, `target_id`). Session-mutating calls use a busy guard; detach bypasses it, and node tests own independent resources. Result serialization refuses bodies beyond 128,000 UTF-8 bytes after the action may already have happened; normal replies include text plus structuredContent and appropriate isError. RPC validates envelopes, ignores notifications, supports initialize/ping/list/call and reports method/argument errors. Stdio processes requests concurrently so a paused evaluation cannot block resume; EOF settles work then detaches. Imported by HTTP/CLI and debugger tests; shell smoke spawns it.

### js-debugger-mcp.sh

Strict five-line bash wrapper computes root and execs `js-debugger-cli.mjs` with unchanged arguments. Consumed by root/Cursor/Codex MCP configuration, environment bridge launchers, `mcp-smoke`, and `tools/ci/js-debugger-smoke.mjs`. CLI supports serve, serve-http, status, list-tools, call, native smoke and profile; the wrapper itself contains no browser launch.

### js-debugger-node.mjs

Exports `repoFile`, `probeCondition`, `runNodeFile`, `nodeTest`. Imports CDP, workflow frame helpers and uses the bootloader for spawned Node children. Realpath validation keeps files inside the repository. Direct runner uses `--inspect-brk=127.0.0.1:0`; test runner uses real `node --test` with child attachment. Removes inherited NODE_TEST_CONTEXT and inspector options. Each file owns a detached process group, timeout, bounded stdout/stderr and inspector sockets; timeout kills its descendants. Up to eight files, default concurrency four. Probe counters emit first retained values and then every thousand hits; exit flush is exact for the main context, while other VM contexts have sampling limits. Unnamed scripts match normalized first 400 characters and compatible line counts; entry script instrumentation defaults to 300 pause-bind executions, then falls back to scriptParsed, which can miss immediate calls. Collects TAP counts, failing names, probes, exceptions and pauses; unresolved probes carry warnings. Imported by MCP dispatcher and node-test fixtures.

### js-debugger-session.mjs

Exports `attachableUrl`, `breakpointTarget`, `DebugSession`; imports CDP, shared-browser endpoint discovery, trace/profile/workflow mixins and saved-output artifacts. Owns one attachment, scripts, breakpoints, remote handles, pause generations, operations and profiler state. Local targets only; Node file targets and blank worker forms have explicit acceptance. Attach verifies discovery/WebSocket host consistency, watches parsed scripts and lifecycle events, caps script storage at 2,000 and warns of another live registered debugger client. Pause/context transitions invalidate handles; iframe destruction retains a new resumable synthetic pause. Breakpoints cap at 100 and replace prior conditions by actually removing CDP state. Evaluate rejects side effects by default and properties require current-pause ownership. Run is nonblocking, keeps ten operation records, retains oversized results as artifacts, marks earlier pending runs abandoned without cancelling JS, and accepts late replies after timeouts. Detach drops local state even when cleanup fails and protects replacement attachments from older cleanup. Incident capture validates current local URL before/after, captures bounded state plus JPEG under scratch/debug-incidents and explicitly records that it is later than the exception. Consumers: MCP/HTTP/CLI, debugger rig and lifecycle/trace/transport/node tests.

### js-debugger-smoke.mjs

Top-level parent-only native integration executable. Imports Playwright, Chromium discovery, browser lock and HTTP client. Starts one fixture HTTP server, native Chromium and debugger stdio process, then persistent daemon. Asserts pause tokens, stepping, descriptor reads, side-effect refusal, reload persistence, exceptions including primitive/reserved-key throws, logpoint rings, listeners/instances, delayed operations, cancellation, workers, iframe destruction, EOF cleanup and separate shell-process session continuity. Writes artifacts/js-debugger/smoke.json with explicit `gpuClaim:false`; finally reaps owned resources and releases the lock. Imported by CLI `smoke`; distinct from the offline `tools/ci/js-debugger-smoke.mjs`. Read only here: these assertions are intended coverage, not passing results.

### js-debugger-trace.mjs

Exports logpoint condition generation, exception recording, trace/profile mixins, CPU/heap summaries, URL shortening, hitch extraction/sampler and profile artifact persistence. Session incorporates its mixins. Page logpoints return false after bounded recording and preserve frame this/arguments with prefixed helper names. Exception mode records then auto-resumes; counts use null-prototype storage and retain at most 50 message keys. Listener inspection and instance queries release object groups; queryObjects includes subclasses and triggers V8 GC. CPU self/inclusive attribution aggregates timeDeltas; heap sample walks selfSize; rAF sampler bounds duration, threshold and windows. One CPU/heap sample at a time, running page required except status; raw profiles optionally persist under scratch/debug-profiles. CPU hitch implementation records individual large deltas, despite a comment mentioning same-frame runs. Session and debugger tests consume it.

### js-debugger-workflow.mjs

Exports bounded RemoteObject summaries, scope-locals reader, path-suffix regex, frame formatter and workflow mixin. Imported by session and Node probing. Locals retain inner scope names first, skip global/script scopes, and default to one closure scope. `breakAndInspect` arms breakpoints, optionally triggers execution with an independent operation deadline, waits for a pause, reads up to three frames, and optionally resumes/removes owned breakpoints. `collect` sets logpoints, triggers/waits, reads this call's hits and removes them unless keep; an unexpected pause leaves them installed with recovery instructions. No runtime promise of zero perturbation: these helpers interact with debugger state.

### lsp-eval.mjs

Imports production `Lsp`/`callTool`; exports twelve pinned `QUESTIONS` and `run`. Compares each tool response against a regex answer and a shell grep command; reports correctness, output characters and wall time, closes LSP in finally. CLI table or `--json`, nonzero when any expected answer fails. Fixed questions cover qualified definitions/reexports, aliases, façade hover, outline, body and honest missing-member errors. Char counts are output proxies, not billed token measurements. Consumer: LSP unit tests and code-nav verification guidance.

### lsp-mcp.mjs

Exports lexical classification/masking helpers, `Lsp`, seven-tool catalog, dispatcher/RPC/stdio serve. Imports espree, eslint-scope, Node fs/process/module primitives; requires installed checkout dependencies and TypeScript LSP. Content-Length framing is internal LSP transport, newline JSON-RPC is external MCP. Lazy startup and default ten-minute idle shutdown; config snapshots include resolvable extends chains and force restart on graph change. Source scan refreshes js/types and cache generations, while explicit file operations can open other repository files. AST/text fallback is constrained by lexical bindings; dynamic spread/assign contributions report uncertainty and multiple contributions do not claim runtime winner. References follow destructures and aliases; callers group actual use rows by lexical owner; scope applies after resolution. More than four unrelated top-level declarations refuses a reference guess. Default rows 200, body 40 (up to 400); paging and file summaries expose boundedness. Diagnostics temporarily add @ts-check, retain selected high-signal codes plus syntax, normally subtract HEAD, and explicitly skip subtraction when dependencies/config differ; TS2339 is intentionally absent. Serializes stdio queries and stops on EOF/signals. CLI def/refs/callers/outline/sym/hover/diag shares dispatch; its positional filename regex only recognizes .js/.ts, while explicit MCP file arguments support .mjs/.cjs diagnostics. Consumers: wrappers, eval/navigation bench, workflow harness, MCP smoke catalog and LSP fixture/regression tests.

### lsp-mcp.sh

Strict five-line root-resolving exec wrapper forwarding all arguments to lsp-mcp.mjs. Root/Cursor/Codex configs and environment bridges call serve; code-nav and reviewer workflows call shell navigation commands.

### lsp-navigation-bench.mjs

Exports four query scenarios and `measure`, sharing a persistent production LSP instance and stopping it in finally. Records per-query first versus warm sample, milliseconds, error, characters, UTF-8 bytes and SHA256; iterations 2–10, default three. CLI accepts only `--iterations=N`, prints JSON and fails on tool errors. Explicitly disclaims OS cache flushing, latency thresholds, browser and billed-model measurement. Imported by navigation-efficiency tests; not executed here.

### mcp-cli.mjs

Standalone Chrome DevTools stdio client, importing only Node spawn/fs/path/url and launching chrome-devtools wrapper (`APEX_MCP_WRAPPER` override). Raw JSON call arrays or probe flags produce ordered new-page, backend-setting, reload and evaluation calls; console can be regex-filtered. Validates backend/TLX combinations and wait 0–180,000ms; eval can be source, file or stdin. `--dry-run` exits before spawn. Default call ceiling 180 seconds, environment override at least ten seconds; tool errors set exit 1. Text output clips ordinary results to 2,500 characters, console to 20,000. Help advertises --json but parsing stores the flag without using it in output; current source does not fulfill a distinct raw-JSON output mode. Manifest/tests and renderer/mcp-probe instructions reference this CLI.

### mcp-listing-cost.mjs

Exports `estTokens`, `sizeListing`, `listServer`. Reads root .mcp.json, optionally filters servers or adds simple whitespace-split `--entry` commands, starts each stdio process, initializes and fetches every tools/list cursor page, then stops it. Default 90-second timeout. Reports schema/description/name/output character costs and estimated chars/4 tokens; deferring-client count is names-only convention, not observed model billing. No browser tool is called. Imported by listing-cost tests; it is a measurement executable, not evidence it ran in this audit.

### mcp-preflight.sh

Sourced function, not standalone server. Waits for node_modules lock plus sharp with 60-second default (APEX_MCP_PREFLIGHT_SECS override, zero skips), prints progress/cache guidance only to stderr, and continues even if readiness never arrives. Optional npx package cache check is advisory. Sourced by apex-tools, Chrome, Playwright and BrowserStack wrappers. The header's <=60 claim describes the default; override can extend it.

### mcp-smoke.mjs

Exports wrapper smoke plan, real minimal arguments, browser checks, selection and verdict helpers. Default runs apex_status plus other help/status/catalog commands, writes artifacts/logs/mcp-smoke.json and bases success solely on apex-tools responding ok; missing TinyFish key/Chrome clone warns. `--dry-run` prints plan without executing/writing. `--real` derives read-only tree tools plus graph parity from actual catalog, excludes job start/cancel and slow verify, validates explicit selection, invokes each and rejects empty success envelopes. Browser opt-in runs three calls sequentially and refuses loadavg >=3 outside mock. Profile-query smoke creates/removes a synthetic profile and labels parser-only evidence. Real results write -real.json unless --no-write. `ensure-mcp-ready.sh`, apex-tools shell routing, manifest and smoke tests consume it. Intro/help attachment claims are historical; root config above is current evidence.

### output-level-mcp.mjs

Exports server prefaces, default-hint trimming and `runGateway`. Imports agent process-tree lifecycle and output presentation/artifact readers. Wraps arbitrary stdio MCP, adds compact/diagnostic/full presentation argument, avoiding upstream key collisions, rewrites input schema composition/local refs and wraps output schema in original-or-envelope union. Appends retrieval tool only on final listing page and prefixes its name on collision. Can discover schemas before first direct call; cancellation during discovery prevents dispatch. Strips only gateway presentation key, forwards action once, then presents result or preserves original on presentation/persistence failure. Retrieval supports byte pages, exact retained collection rows and original MCP blocks with explicit full mode and 8MiB ceiling. Upstream notifications/list changes update schema cache. Retains stderr in artifacts; owned process-tree stop runs on EOF/signals and reports cleanup failures. Wrapper, generated output-surface configuration and gateway tests consume it.

### output-level-mcp.sh

Seven-line strict root/cwd normalizer execs gateway. Every configured server in root/Cursor/Codex settings uses it; environment MCP launch and plugin bridge also compose it. Does not itself select or start a browser.

### playwright-mcp.sh

Pins official @playwright/mcp@0.0.79. Commands help/status/run plus play/dom forwarding to css-play. run performs preflight, discovers the installed Chromium executable, and normally passes isolated/headless/no-sandbox/output-dir to npx --prefer-offline. APEX_PW_CDP switches to an existing endpoint; APEX_PW_DEVICE supplies descriptor settings, unlike mere resize. Profile path is printed but isolated run does not combine it with user-data-dir. Root MCP config consumes run; css-play, bootstrap and wrapper tests reference it. One-browser/touch/loopback guidance in comments is operational policy, not an authorization or URL-validation layer implemented here.

### probe-mcp.py

Python stdlib bridge with chrome_ and tinyfish_ namespaces, CLI help/status/route/list-tools/call/chrome-start/chrome-stop/chrome-daemon/serve. Chrome backend lazily chooses a health-validated daemon matching checkout rootId, otherwise dynamically imports cdmcp-cli.py and owns its short-lived client; schema-driven pageId injection handles upstream variants. TinyFish backend ensures proxy, initializes its own session and calls HTTP MCP. Listing uses frozen catalogs and does not launch live backends; calls ensure them. CLI retains >12,000-character results in exclusive 0600 artifacts unless full mode, propagates tool isError. Persistent Chrome uses checkout-specific tmux session, health checks, state file, loopback threaded HTTP and live-Playwright refusal unless force; HTTP routes are healthz/tools/call. Stdio supports initialize/list/call/ping, reports call errors, and closes owned Chrome client. Catalog comments describe historical egress restrictions; this source audit did not test current connectivity. Imported dynamically/manual-tested and referenced by test-bg browser occupancy, apex-tools and MCP smoke.

### report-server.mjs

Exports filename sanitization, report route factory and server startup; imports static harness. Defaults host 0.0.0.0, port 3456 and random 24-byte base64url capability; exact runtime files/directories plus apex-report.js are allowed. Authenticated report shell installs HttpOnly SameSite=Strict cookie and SEND REPORT UI. POST requires JSON object and optional string verdict array; limits 32MiB/request and 128MiB/session including concurrent reservations. Releases quota on bad/aborted requests, writes exclusive 0600 files, refuses duplicate filename and prints bounded-shape diagnostic metadata. CLI prints actual bound tokenized LAN URLs, holds event loop and closes on signals. Device-report workflow and apex-report.js pair with it; unit/tools-runnable tests import/run bounded fixtures. It cannot collect mixed-content POSTs from a deployed HTTPS page to an HTTP laptop.

### tinyfish-mcp.sh

CLI-only proxy lifecycle and JSON-RPC helpers: setup/start/stop/status/init/ensure/tools/fetch/search/deploy-check/deploy-js. Clone/build under scratch, key from shell or ignored .env only, tmux server/session and saved MCP session id. Port defaults 3711; protocol 2025-06-18. setup can clone/pull/npm-build, start persists credentials and starts dist/index.js; none were invoked here. initialize drops stale session id; ensure retries initialization. Fetch/search marshal requests and use tinyfish-rpc.py for text; raw --json modes differ by command. Live build retry recognizes helper exit 3; deploy-check compares local version or existing deploy-tip git blob; does not fetch remote branch. deploy-js resolves live cache tag and can grep marker with explicit truncation caveat. Header says shell key wins; persist_env keeps an already populated .env, so a changed shell key is not automatically rewritten into the tmux file. Consumers: probe bridge, cloud install, manual tests, manifest and smoke help.

### tinyfish-rpc.py

Stdlib parser CLI unwrap/deploy-summary/live-build/tool-names; imported functions are also fixture-tested. Handles optional leading data:, outer RPC error, embedded fetch results/errors and search snippets, extracts numeric build from fenced/plain text by regex. Deploy summary exit 0 match, 1 stale, 2 parse failure, 3 upstream fetch failure; no local comparison returns just live. Generic unwrap prints payload errors to stderr but returns zero, so its result is not a deployment verdict. Shell helper is its principal runtime consumer.

### ui-tools.mjs

Exports three UI schemas, inspection summary and handler factory. Imports route IDs, mission catalog and inspection diff. Validates saved JSON at <=5MiB/file, 1–16 records and <=5,000 controls/issues/layout contexts. Recursive output bounds strings 512, arrays 100, object keys 40, depth five; result budget 512KiB. Summaries preserve missing diagnostic availability as null/unknown. Mission planner writes canonical scenario only when real/non-dry and returns argv/limits. Inspect refuses roundtrip without viewports, preflights occupancy, passes 180-second signal-aware spawn to explorer and summarizes saved file. Diff requires same screen/record/viewport/phase sequence and caps each diff collection to 100 with totals. Every path says completion/advisories/differences are not correctness or independent navigation proof. Factory/schema imports and apex-tools handler construction are confirmed above; UI explorer and apex-tools tests consume it.

### workflow-harness-client.mjs

Exports CLI `runClient`; reads endpoint file and exactly one args JSON/file input, POSTs id/tool/args with x-workflow-token to endpoint host/port and client deadline (default endpoint value or 120 seconds). Quiet suppresses successful output; HTTP/row error exits 1, argument/fetch/parse errors exit 2. File-based probe input avoids shell quoting. Client trusts supplied endpoint file contents; loopback restriction comes from the companion server endpoint, not client validation. Imported by harness tests and documented experiment workflow.

### workflow-harness-core.mjs

Exports local/merged schemas, synchronous probe help, snapshot creation, plan validation and `WorkflowHarness`. Imports production LSP. Creates detached worktree at recorded commit and writes manifest including backend implementation hash; refuses existing run dir. Allowed reads are tracked js/types/tests/docs/css and two root HTML files; rejects hidden/traversal/absolute/backslash paths and realpath escapes. Before/after each accepted operation rehashes manifest bytes/modes and rejects extra/missing files; mutation permanently invalidates run. Worker budgets 1–1,000 reserve before queueing, tool allowlists are explicit, workers serialize calls and LSP compiler calls share a global queue. Local read max120 lines; rg max25 matches/file and bounded output; files lists tracked paths; probe loads 1–8 js files in timed VM, allows synchronous completion only, serializes under timeout with captured intrinsics and rejects Promise results. Every result/transcript records sizes/timing/errors/RPCs; returned output clips at 24,000 characters. Close settles calls, stops LSPs, removes worktree and records stopped marker. Harness server and fixture tests import it; this audit created no snapshot/worktree.

### workflow-harness.mjs

Exports `startServer`; CLI requires run-dir and plan, optionally repo/SHA/timeouts/compiler. Creates harness, binds ephemeral 127.0.0.1 port and writes exclusive 0600 endpoint with random token. Only authenticated POST /call accepted; body capped at 64,000 characters, request timeout default120 seconds, headers five seconds. HTTP rejects throw with 400; semantic harness errors are structured rows for client handling. Stop closes connections then harness/server. Harness client consumes endpoint contract; fixture tests import startup. Not part of root MCP configuration.

## Navigation evidence and limits

Attached `lsp_outline {file:"tools/mcp/js-debugger-http.mjs",limit:40,outputLevel:"full"}` returned imports and exported bridge functions. File-position references for startDebuggerHttp (27:23) returned only its definition, while source proves CLI import/call at 5/62 and smoke imports. WorkflowHarness (127:14) likewise returned only its definition. These results establish that a tools/ file can be inspected, but do not establish comprehensive tools/ consumer indexing. Correctly positioned createUITools (81:17) returned three references across ui-tools and apex-tools; Lsp (240:14) returned five across its implementation and workflow-harness-core, omitting eval/bench imports found in source. An initial ui-tools query at 84:17 hit Buffer.byteLength, was recognized as the wrong position, and was discarded; a second at 86 was also not the factory and discarded. No false absence conclusion was drawn.

For cross-file imports, shell/Python consumers, executable/config strings and consumers omitted by LSP, fallback used tracked-file source text for each exact filename, then inspected actual imports/calls/config blocks. The source itself shows why broad semantic coverage is limited: default Lsp scan is js/types; explicit files can be opened, but this is not a whole-repository module graph. Text filename matches in generated catalogs, maps and archival docs were not treated as runtime callers. Known unit/manual tests are consumers and intended coverage only; none ran in this lane.

Comment claims were checked against current implementations: the six configured servers supersede older three-server/CLI-only attachment prose; probe catalog listing is static despite stale smoke-plan prose saying live list starts Chromium; mcp-cli's --json flag is unused; preflight override can exceed its header default; CPU hitch extraction currently detects individual long samples; TinyFish credential persistence may preserve an older .env value. Historical egress/browser/latency measurements remain attributed comments, not fresh observations. No hardware GPU, player UX pass, remote deployment, connectivity, benchmark speed or test success is claimed.
