# sysaudit4 WEB RESEARCH: hosts + GPU (slice web-hosts-gpu), 2026-10-26
Inputs: BRIEF.md; repo docs CI-RENDERING-PERFORMANCE.md, LOCAL-LLVMPIPE-2026-10-26.md, playwright.config.js, agent-fleet adapters.md, MULTI-AGENT-ORCHESTRATION-2026-10-10.md, .codex/*.
Ran: WebFetch/WebSearch only (no browser, no tests). Quotes are from fetched pages; secondary sources flagged. Fetch tool paraphrases, so quotes marked "~" are summarised, not verbatim.

## 1. Headless Chromium GPU in Linux containers
- Chromium docs: "Allowing automatic fallback to WebGL backed by SwiftShader has been deprecated" ... opt-in "not intended for running untrusted content". `--use-gl=angle --use-angle=swiftshader` = SwiftShader as GL driver; `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader` = WebGL only.
  https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md
  Repo: playwright.config.js:27-28,136-139 pins swiftshader + unsafe-swiftshader; fine, but WebGL via SwiftShader is on a deprecation path ("will soon fail") -> pin the Chromium version / watch release notes.
- Chrome team headless Linux WebGPU recipe: `--headless=new --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu`; without a driver chrome://gpu shows WebGPU "Software only". The post names NVIDIA drivers, NOT mesa-vulkan-drivers/libvulkan1; no benchmark numbers.
  https://developer.chrome.com/blog/supercharge-web-ai-testing
- Software WebGPU adapter: `--use-webgpu-adapter=swiftshader` appears in Chromium's own web_tests config (webgpu-swiftshader) and agent-browser docs (secondary). I found NO official doc stating `navigator.gpu` is exposed without a GPU; it is empirical.
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/web_tests/FlagSpecificConfig ; https://agent-browser.dev/webgpu
- Mesa env: LIBGL_ALWAYS_SOFTWARE "if set to true, always use software rendering"; GALLIUM_DRIVER softpipe|llvmpipe; LP_NUM_THREADS. https://docs.mesa3d.org/envvars.html (cited in LOCAL-LLVMPIPE note, not re-fetched)
- Packages (repo's own source-reading, LOCAL-LLVMPIPE:42-62): ANGLE GL backend dlopens `libEGL.so.1`; need libegl1 + libgles2 (+ mesa-vulkan-drivers for lavapipe, libvulkan1 loader). Consistent with Chromium sources it cites; I did not re-verify the sources.

## 2. Playwright (repo pins @playwright/test 1.63.0, package.json:86)
- Retries: "A test that fails at first but passes on a retry is reported as flaky"; on failure the worker + browser are discarded; `testInfo.retry` detects retries. https://playwright.dev/docs/test-retries
- retryStrategy (v1.62+): default 'immediate'; 'isolated' = retries "at the end of the run, one at a time in a single worker". https://playwright.dev/docs/api/class-testconfig  Repo playwright.config.js:213 matches.
- workers default "half of the number of logical CPU cores"; docs example limits CI workers; `--shard=2/3`; fullyParallel opt-in. https://playwright.dev/docs/test-parallel
- TestResult.status = passed|failed|timedOut|skipped|interrupted: there is NO "flaky" result status; flaky is a TestCase.outcome() ("flaky") derived across attempts. live-reporter.js:123 uses `test.outcome()==="flaky"` = the correct API. (outcome() list not on the fetched page; known from the API, unverified here.) https://playwright.dev/docs/api/class-testresult
- Blob reporter + merge for shards; names `report-<hash>-<shard>.zip`; dot reporter prints "±" for passed-on-retry. https://playwright.dev/docs/test-reporters  JSON reporter field list is NOT on that page (points to the Reporter API).

## 3. Cursor Cloud Agents API v1
- Endpoints: POST /v1/agents (launch), GET /v1/agents (newest first, default 20, max 100), GET /v1/agents/{id}, POST /v1/agents/{id}/runs (follow-up; `delivery:"steer"` steers a running agent), GET .../runs, .../runs/{runId}, .../stream (SSE), POST .../runs/{runId}/cancel (terminal), DELETE /v1/agents/{id}, POST .../archive. NO "conversation" endpoint on that page. https://cursor.com/docs/cloud-agent/api/endpoints
- Status: agent ACTIVE|IDLE|ARCHIVED; run CREATING|RUNNING|WAITING_FOR_BACKGROUND_WORK|FINISHED|ERROR|CANCELLED|EXPIRED. Same page.
- Rate limits: numbers not on the endpoints/overview pages (they defer to https://cursor.com/docs/api.md, which 404'd); only `429 rate_limit_exceeded` on env builds. UNKNOWN.
- MCP: create and follow-up accept inline `mcpServers` (max 50, http/sse remote or stdio in the VM; follow-up REPLACES the set). https://cursor.com/docs/cloud-agent/api/overview
- Hooks: "Cloud agents run command-based hooks from `.cursor/hooks.json` in your repository"; user-level hooks unavailable; repo rules not addressed. https://cursor.com/docs/cloud-agent
- Webhooks: v1 "coming soon"; legacy v0 only event `statusChange` -> ERROR|FINISHED, HMAC `X-Webhook-Signature`. Cursor->you only. https://cursor.com/docs/cloud-agent/api/webhooks

## 4. OpenAI Codex (docs moved to learn.chatgpt.com via 308)
- Hooks: `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`; events SessionStart, SessionEnd, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt; matchers cover Bash, apply_patch/Edit/Write, MCP tools by `mcp__server__tool`; hosted tools (WebSearch) NOT covered; hooks on by default; "Non-managed hooks must be reviewed and trusted before they run" (/hooks). https://learn.chatgpt.com/docs/hooks
- Skills: `.agents/skills` from CWD up to repo root, `$HOME/.agents/skills`, `/etc/codex/skills`; symlinks followed; `.codex/skills` not mentioned. So `.agents/skills/` IS a real convention. https://learn.chatgpt.com/docs/build-skills
- AGENTS.md: AGENTS.override.md > AGENTS.md > fallback names, one per dir, root->cwd merge, cap `project_doc_max_bytes` default 32 KiB. https://learn.chatgpt.com/docs/agent-configuration/agents-md

## 5. Grok Build / xAI (docs.x.ai/build exists; search-result summaries, hooks page fetched)
- Hooks: PreToolUse "the only blocking event"; exit 2 denies; "timeouts, crashes, and malformed output fail open"; reads `.claude/settings.json` and `.cursor/hooks.json`; "Project hooks require trust" (/hooks-trust or --trust). https://docs.x.ai/build/features/hooks
- `grok inspect [--json]` lists rules, skills, plugins, hooks, MCP; MCP reads project .mcp.json + Claude/Cursor configs; skills in ./.grok/skills; AGENTS.md loaded. https://docs.x.ai/build/cli/reference (via search snippets: https://docs.x.ai/build/features/mcp-servers, https://docs.x.ai/build/features/skills-plugins-marketplaces, https://docs.x.ai/build/features/project-rules)
- xAI API tools page lists only built-in + function calling (no MCP/hooks): https://docs.x.ai/docs/guides/tools/overview ; remote-mcp URL 404.

## Clean
- playwright.config.js:213 retryStrategy and live-reporter.js:123 outcome()==='flaky' match current docs.
- adapters.md Cursor v1 endpoints (POST /v1/agents, /runs, /stream) match the endpoints page; "webhooks coming soon" (MULTI-AGENT:52) re-confirmed today.
- .codex/config.toml comment "scans .agents/skills/, not .claude/skills/" and "32 KiB cap" are correct.
- .codex/hooks.json matcher on `^mcp__.*__(...)$` is a supported form.

## Findings
| id | finding | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| W1 | AGENTS.md:33 "~2.7x" is a single dated sample (9.5 s vs 25.8 s, one montreal boot) presented as a general speedup; no official doc gives a multiplier. Outside source: ~4x on a heavy page (microlink, cited in LOCAL-LLVMPIPE) | CI-RENDERING-PERFORMANCE.md:65; AGENTS.md:33; Mesa/Chromium docs give no number | misleads shard sizing/timeouts; low | Reword to "one sample, 2026-08, 2.7x; re-measure on CI" | high | NEW |
| W2 | The llvmpipe path IS supported by docs in mechanism (ANGLE gl backend -> system libEGL.so.1; Mesa software env vars), but "the 9.5 s" row predates and the 2026-09-16 section says it did not reproduce locally; LOCAL-LLVMPIPE says the cause was missing libegl1. Two notes disagree on the "do not re-attempt" advice | CI-RENDERING-PERFORMANCE.md:93,122 vs LOCAL-LLVMPIPE:15-25 | an agent obeying the older "do not re-attempt" skips a ~2.7x local win | Edit :122 to point at LOCAL-LLVMPIPE; one Chromium probe is still unrun | high | NEW (doc conflict) |
| W3 | "llvmpipe does not expose navigator.gpu" has no official source; WebGPU on Linux needs Vulkan (lavapipe/SwiftShader). Official Chrome post only shows `--use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu`; the repo's WebGPU rows are empirical | developer.chrome.com post; CI-RENDERING:65 | none if probe-verified; mark as measured | Tag the claim "empirical, Chromium <ver>" | med | NEW |
| W4 | SwiftShader-for-WebGL fallback is deprecated by Chromium ("will soon fail"); repo relies on --enable-unsafe-swiftshader in 3 places | swiftshader.md; playwright.config.js:136-139; browser-workers.mjs:23 | a Chromium/Playwright bump could break every local browser run | Add a canary (probe-gl) on bump; already partly there at config:335 | med | NEW |
| W5 | "Cursor workers cannot message out at all" is too strong: v1 agents get inline mcpServers (stdio runs in VM) and `.cursor/hooks.json`, and VMs have normal egress (restrictable). They can post GitHub comments (already noted) or call a webhook/MCP tool if given one. True narrow claim: no built-in send-to-orchestrator tool; v1 has no webhooks | agent-fleet SKILL.md:12; MULTI-AGENT-ORCHESTRATION:53; cursor endpoints+cloud-agent pages | wrong premise limits Cursor lanes to PR comments | Say "no native message tool; can use a passed mcpServer or curl to a relay" and test once | med (egress claim not verified) | NEW |
| W6 | Cursor hooks run in cloud agents, so repo `.cursor/hooks.json` can bind Cursor workers like `.claude/hooks`; adapters.md says only that Grok is bound | cursor.com/docs/cloud-agent; adapters.md:24-26 | unguarded Cursor lanes if hooks.json is absent | Check .cursor/hooks.json exists and mirrors protect-files/bash-guard | med | NEW |
| W7 | Grok hooks FAIL OPEN on timeout/crash/malformed output and need trust; "guard hooks therefore bind a Grok agent" (adapters.md:26) is conditional on `--trust`/`/hooks-trust` and exit 2 | docs.x.ai/build/features/hooks | DAD can bypass guards silently | Add `--trust` to launch line and a test that denies via exit 2 | med | NEW |
| W8 | Codex project hooks only load if `.codex/` is trusted and each hook definition is reviewed; changed hooks are skipped until /hooks review. Headless Codex cloud may never trust them | learn.chatgpt.com/docs/hooks; .codex/config.toml:1 comment says trusted-only | guards on Codex silently absent | Document; do not count Codex hooks as an enforcement layer | med | NEW |
| W9 | Hosted tools (WebSearch) are outside Codex hooks; repo mcp-guard matcher is fine but WebSearch can't be gated | same | low | none | high | NEW |
| W10 | Cursor v1 rate-limit numbers and a "conversation" endpoint are not in current docs; any repo claim of them is unsupported (adapters.md uses runs/stream, fine) | endpoints page; api.md 404 | low | Grep docs for "conversation" claims | low | NEW |
| W11 | JSON reporter: no official field list on the reporters page; rely on the Reporter API/types (the repo uses a custom reporter, fine) | test-reporters page | none | n/a | high | NEW |

## Not done
- No Chromium probe (hook-refused); W2/W3 stay empirical. Did not fetch Mesa/ANGLE pages again (relied on LOCAL-LLVMPIPE citations).
- Cursor rate limits (api.md 404), Grok headless/sandbox pages (not opened; only a summary of CLI reference), xAI remote-MCP page (404), Playwright outcome() values and JSON reporter schema not verified.
- Did not check whether .cursor/hooks.json exists or whether Grok launch lines pass --trust.
