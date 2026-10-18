# MCP review against the mcp-builder guidance — 2026-10-18

Scope: the four servers in `.mcp.json` (`apex-tools`, `playwright-official`, `chrome-devtools`, `js-debugger`), their launchers
under `tools/mcp/`, and `docs/AGENT-SURFACE.md`. Guidance: the `anthropic-skills:mcp-builder` skill and its
`mcp_best_practices.md` (naming, descriptions, annotations, structured output, pagination, errors, transport, evaluations).
Everything below was measured on the tree at `origin/claude/f1-game-project-26h3ng` tip unless marked otherwise.

## 1. apex-tools `CONNECTION_CLOSED` at startup — root cause

**Cause: a static `import sharp from "sharp"` in `tools/mcp/apex-extras.mjs:18`.** `.mcp.json` launches `apex-tools` at session
start, concurrently with the SessionStart hook's `npm install` (`.claude/hooks/session-start.sh:21`). In a fresh container
`node_modules/sharp` does not exist yet, so Node's ESM loader throws `ERR_MODULE_NOT_FOUND` while resolving the import graph.
The process exits before it reads `initialize`, which the client reports as `CONNECTION_CLOSED`. This is a race, not a
config error, so it reproduces only on a fresh container and passes once `npm install` finishes.

Reproduced by hand: copying `tools/` to a directory with no `node_modules` and running
`bash tools/mcp/apex-tools-mcp.sh serve` with an `initialize` request gave
`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sharp' imported from …/tools/mcp/apex-extras.mjs`, exit 1, no JSON-RPC
output. With `node_modules` present, `initialize` answers in ~0.2 s, so it is not a slow-startup or timeout problem
(`timeout: 900000` in `.mcp.json` is irrelevant). Beware: a `git worktree` under `scratch/` does NOT reproduce it, because Node
resolves `sharp` from the parent checkout's `node_modules`.

**Fix: already written, not yet on the deploy branch** — `d49d1930` on `cursor/apex-mcp-lazy-sharp-7c1d`
(`const { default: sharp } = await import("sharp")` at the call site in `thumbBlock`, plus a unit test that walks the static
import graph and fails on any bare npm specifier). I did not duplicate it. Follow-up worth adding to that PR: have
`apex-tools-mcp.sh` fail soft, i.e. print the loader error to stderr as a JSON-RPC `-32000` reply when the graph cannot load,
so the next missing dependency shows its cause instead of a closed pipe.

## 2. apex-tools (`tools/mcp/apex-tools-mcp.mjs`, 3020 lines, 33 `apex_*` tools) — keep

What it does: wraps pinned `tools/` CLIs (pick-tests, verify-change, shots, HUD survey, track audits, CI status, job runner)
over stdio, with an optional loopback HTTP mode (`127.0.0.1:3713`), a browser lock, and a background job layer.

Against the guidance, it is the best of the four:

| Guidance | State |
|---|---|
| Prefixed snake_case, action-oriented names | OK (`apex_` prefix throughout). A few nouns-only names (`apex_status`, `apex_catalog`, `apex_locations`, `apex_garage`) lack a verb. |
| Annotations | OK, measured 33/33 with honest `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint` derived in `toolAnnotations` (`apex-tools-mcp.mjs:2592`). |
| `outputSchema` + `structuredContent` | OK, 33/33 (`RESULT_SCHEMA`, ~line 2606). |
| Actionable errors | OK, bodies carry `ok/error/message/fix` and `isError` (`refuse()`, line 93). |
| Input validation | OK, `additionalProperties:false` forced on every schema (line 1147). |
| Long operations | OK, `apex_job_*` background jobs because hosts cut MCP calls at ~60–120 s. |
| Context cost | **Weak.** `tools/list` is 71,511 bytes (~18k tokens) for 33 tools; the five largest (`apex_shot_survey` 6.4 KB, `apex_hud_shot` 5.6 KB, `apex_job_start` 4.6 KB, `apex_track` 4.2 KB, `apex_hud_mock` 4.2 KB) are 24 KB. |
| Pagination / `response_format` | **Absent.** No `limit`/`next_offset`; size control is ad hoc (`full:true` on `apex_doctor`, `SLIMMED` set). |
| Single-file size | 3020 lines in one module; `apex-extras.mjs` is another 897. |

Ranked improvements:
1. `apex-tools-mcp.mjs` (startup): land `d49d1930` (see §1) and add the fail-soft loader reply. Highest value, it is the only
   outage seen.
2. `apex-tools-mcp.mjs` catalog (~lines 339–1030): cut the 71 KB `tools/list`. Move parameter prose for the five large tools
   (`apex_shot_survey`, `apex_hud_shot`, `apex_job_start`, `apex_track`, `apex_hud_mock`) into a `help` field returned by a
   read-only `apex_help {tool}` call, and keep each description to one sentence plus "Skill: …". Target ≤ 35 KB.
3. `apex-tools-mcp.mjs` result path (`slimBody`, ~line 2577): give every list-returning tool the same `limit` + `truncated`
   + `next_offset` contract (the `js-debugger` `debugger_scripts` shape already does this) instead of per-tool slimming.
4. Split by concern (catalog, validation, spawn/jobs, HUD results) so the file stops being the one place every change lands;
   the repo already ratchets big modules (`tests/data/ratchets.json`).
5. Rename the verbless tools in a future major (`apex_get_status`, `apex_list_catalog`, `apex_list_locations`) — low
   priority, the names are baked into skills and allow rules.

### Eval questions for apex-tools (mcp-builder §Phase 4)

Read-only, independent, single string answer, stable on a pinned commit. Verify each by hand before putting it in an XML file.

1. "Using only apex tools, which test groups does `apex_pick_tests` name for a change that touches only
   `js/circuits/monza.js`, and which single spec does `apex_select_specs` list for the same path?" (answer: the two names,
   compared as a set).
2. "How many checks does `apex_doctor` report failing on a clean tree, and what is the id of the first warning?"
   (answer: `0` and the id; use `full:false`).
3. "Which circuit ids does `apex_locations` list for the `hud` survey, and how many are there?" (answer: the count).
4. "Start `apex_track_audit` for `spa` through `apex_job_start`, poll `apex_job_status`, and report the number of
   barrier gaps in the final result." (answer: the integer; exercises job lifecycle and pagination).
5. "What is the exact `fix` string returned when `apex_shot` is called with an unknown track id `nowhere`?" (answer: the
   string; tests error actionability).

## 3. playwright-official (`tools/mcp/playwright-mcp.sh`, 110 lines) — keep, low risk

Third-party `@playwright/mcp@0.0.79` through `npx --yes`, pinned, headless, `--isolated`, repo-discovered Chromium. The
tool surface is the vendor's, so naming/annotation/schema guidance does not apply; the wrapper is what matters.
- `playwright-mcp.sh:61–76` `cmd_run`: `npx --yes` downloads the package on first start with no timeout or cache check. A
  slow registry looks like a closed pipe, the same symptom class as §1. Warm it in the SessionStart hook
  (`npx --yes @playwright/mcp@0.0.79 --version` in the background) or vendor it into `devDependencies`.
- `playwright-mcp.sh:68` exe discovery is `|| true`, so a missing Chromium silently falls back to the package's pinned build
  (chromium-1237, absent here, measured 2026-10-05); print a stderr warning.
- No `cmd_verify` like `chrome-devtools-mcp.sh` has; add one so `status` proves a `tools/list` round trip.

## 4. chrome-devtools (`tools/mcp/chrome-devtools-mcp.sh`, 217 lines) — keep, same start-up risk

Vendor `chrome-devtools-mcp@1.7.0`, pinned, run via a local clone or `npx -y`. Strong wrapper (WebGPU flags documented with
measurements, `verify` with a `with_timeout` watchdog).
- `chrome-devtools-mcp.sh:90–95` `npx -y` on first run has the same cold-download race as playwright; same warm-up fix.
- `chrome-devtools-mcp.sh:55–70` shells out to `node webgpu-chrome-args.cjs` and a temp file on every start; any failure
  there under `set -e` kills the server before the handshake. Cache the flag list or guard it with `|| true`.
- Two browser MCPs plus apex-tools' own Chromium all contend for one box (`KNOWN_GAP` in `apex-tools-mcp.mjs:50`).
  Consider whether `playwright-official` and `chrome-devtools` both need to be auto-started; `enabledMcpjsonServers`
  starts both every session. Making one opt-in saves a Node process and a startup race per session.

## 5. js-debugger (`tools/mcp/js-debugger-mcp.mjs`, 160 lines + session 407) — keep, best-designed small server

In-repo, attach-only CDP debugger. Matches the guidance well: `snake_case` prefixed names, bounded `maxLength`/`minimum`/
`maximum` on every string/integer, `additionalProperties:false`, explicit `readOnlyHint`, `limit` on list tools with
`truncated` reporting (`debugger_scripts`), actionable text (`pause.token` rules in descriptions), `resource_link` for files.
- `js-debugger-mcp.mjs:14` `destructiveHint: !readOnlyHint` marks every write-ish tool destructive, including
  `debugger_breakpoint`, `debugger_logpoint` and `debugger_exceptions`, which only change debugger state. Set it true only
  for `debugger_control` `cancel`, `debugger_evaluate` with side effects, and `debugger_detach`; add `idempotentHint`.
- No `outputSchema` / `structuredContent` (compare apex-tools). Add a small `{ok, pause, …}` schema for the stateful tools;
  the pause token is the field clients most need machine-readable.
- Server version `0.1.0` (line 120) while the tool set is production-used; bump when the schema changes.
- 17 tools is a lot for a rarely used server; the descriptions are concise, which keeps `tools/list` small. Fine.

## 6. Cross-cutting

1. **Startup race class (all three `npx`/`node` servers).** The only reproduced outage is §1; the same shape exists for
   `playwright-official` and `chrome-devtools` (network fetch at launch). A single preflight helper script called from each
   launcher (`node_modules` present? package cached? else wait ≤ 60 s for `npm install` and print progress to stderr)
   would turn all three into a bounded wait instead of a closed pipe.
2. **Docs drift.** The `apex-tools-mcp.mjs` header (lines 11–14) says the catalog is "THREE .mcp.json servers … wraps 30 → 11
   … 16 with framing", while the server serves 33 tools and `.mcp.json` lists four servers. `docs/AGENT-SURFACE.md:5` says
   thirty-three, so the header comment is the stale one.
3. **Tests exist and are good** (`tests/unit/apex-tools-mcp.test.mjs`, `js-debugger-mcp.test.mjs`, `mcp-smoke.test.mjs`),
   but none boots the server in an environment without optional dependencies; §1's graph-walk test is the right pattern,
   so extend it to `js-debugger-mcp.mjs`.

## 7. Keep / drop

| Server | Verdict |
|---|---|
| apex-tools | Keep. Fix the startup race first, then shrink `tools/list`. |
| js-debugger | Keep. Tighten annotations; add structured output. |
| playwright-official | Keep, but consider opt-in (see §4 contention). |
| chrome-devtools | Keep, because the WebGPU/heap tools have no substitute; same opt-in question. |

No code was changed by this review; the §1 fix is on another branch (`d49d1930`) and was not duplicated.
