---
name: compound-verify
description: "Use when /compound-verify is typed: Pass/Fail/Skip evidence per changed behavior."
disable-model-invocation: true
---
## F1 project integration

This project copy is an explicit opt-in. The repository subsystem skills, `check-changes`, browser occupancy rules, generated-file policy, and verification gates govern F1 work. Use those workflows for their mechanisms; this skill supplies supporting diagnosis, review, or verification reasoning. It does not authorize bypassing repository gates or publishing changes.

The F1 checks, cheapest first: `node tools/ci/pick-tests.mjs` names the groups a change needs; `node tools/ci/tooling-fast.mjs --changed --jobs=3` in the edit loop and `npm run test:tooling-fast` before a code push; one browser group at a time via `node tools/ci/test-bg.mjs <group>` in the background, its verdict the log's `= run …` line (AGENTS.md rules 4–5). Never run a browser inside a subagent (rule 10): mark that coverage Skip with the reason.


# Verify changed behavior

Done when every scoped behavior has a Pass, Fail, or Skip outcome with supporting evidence, and the report makes clear which environments and checks were exercised.

Derive the verification scope from the user's acceptance criteria and the actual changed behavior. Use project checks and the active host's tools. This skill does not require other skills or supply a browser, runtime, credentials, MCP connection, or game checkout. When a capability is missing, identify the blocker rather than inventing a result. Never treat plugin creation or a tool appearing in a list as proof that the tool's underlying service works.

Choose checks that distinguish correct behavior from the reported failure. Run the original reproduction where one exists, followed by the relevant unit, integration, build, or browser checks. Record command or action, environment, expected result, actual result, and evidence location. Do not broaden or repeat checks without a changed risk, failure, or unresolved uncertainty.

For browser behavior, map changed files to affected routes and critical interactions. Use an available browser capable of reaching the target, following its own instructions; localhost belongs to the machine running the browser. Here, live poking is skill `mcp-probe`, never while a Playwright run is live. Confirm page and build identity before testing. Use fresh inspected state for interactions. Exercise the relevant flow and inspect rendered state and console errors. Record viewport and other conditions that affect comparisons. Static code reads and DOM-free simulations do not establish rendered browser correctness.

Use sandbox data for consequential external flows. If authentication or human action is unavailable, mark that flow Skip with the exact reason and continue independent checks. Do not send messages, make purchases, or write to external systems unless the user's request authorizes the action. Start local development services only within the authorized project scope and record any process left running.

For game animation or camera work, follow the game's existing diagnostic and animation skills. Compare matching scenes and opening, middle, and ending frames or traces; one still cannot establish smooth motion. Record the checkout revision, renderer, viewport, real or synthetic replay source, and reduced-motion setting. Do not claim that a synthetic replay proves the real WATCH flow.

Report a table of behaviors or routes with Pass, Fail, or Skip and evidence or reason. Include the actual check outcomes and remaining blockers. Overall PASS requires every required behavior to pass; a failure makes the result FAIL, and required skipped coverage makes it PARTIAL. Cleanup temporary verification changes while preserving requested fixes and useful evidence.

Adaptation and attribution: see `references/source.md`.
