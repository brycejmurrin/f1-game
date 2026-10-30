# Agent UI measurement: feedback before pixels

Research checked 2026-10-30. Source base: `9bcb7e73ada4f620ed820f5d5f86425a06111dd3`, fetched from origin deploy into an isolated worktree. No dependency update or new browser service is required.

## Decision

Extend the existing explorer and inspector with bounded feedback observations and an explicit visible-feedback replay oracle. A populated status hidden by CSS currently disappears from the control inventory, while a text oracle reads textContent even when nobody can see it. Keep those existing oracles compatible; require the stronger condition where the journey needs visible feedback.

A feedback observation is evidence, not a defect verdict. Closed screens, inactive panes and dedicated screen-reader announcements can intentionally contain hidden text. Record paint eligibility, viewport/ancestor clipping, ARIA hiding and live semantics separately. Never infer a screen-reader announcement from DOM markup or automatically move focus to every status.

## Research and implications

- [Playwright MCP snapshots](https://playwright.dev/mcp/snapshots) combine semantic targets with optional CSS-pixel boxes and bounded subtree snapshots. Use semantics to act and geometry to measure. Installed API support must be checked; current web documentation is not proof that our pinned package supports every new flag.
- [Playwright best practices](https://playwright.dev/docs/best-practices) favor user-visible behavior, isolated contexts and resilient locators. Keep real tap/keyboard actions and fresh storage; do not replace a player journey with a direct show-screen call.
- [Playwright Test Agents](https://playwright.dev/docs/test-agents) separate planning, generation and repair. Borrow that separation: a source scout proposes cases, the browser owner executes, an independent verifier checks the oracle. Automatic repair must not relax assertions, accept goldens or quarantine a product failure to obtain green.
- [Playwright traces](https://playwright.dev/docs/trace-viewer) preserve action, DOM and network evidence. Retain traces for diagnosis alongside compact JSON, rather than returning a full DOM on every call. A retry trace does not make a retry-dependent pass acceptable under our repository rules.
- [Element.checkVisibility](https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility) only establishes potential visibility. A positive result does not prove viewport visibility or lack of occlusion. Measure viewport and clipping ancestors separately; report occlusion as unmeasured.
- [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) explains notification without receiving focus. Preserve the distinction between visual readability and assistive-technology delivery.
- [W3C evaluation guidance](https://www.w3.org/WAI/test-evaluate/) requires knowledgeable human evaluation; automated tools alone cannot determine accessibility. Retain incomplete and unmeasured outcomes.

## Agent workflow and evaluation

[Anthropic's frontend harness study](https://www.anthropic.com/research/harness-design-long-running-apps) reports that independent evaluation with explicit design criteria was more useful than asking the generator to grade itself. Apply a small rubric: hierarchy, legibility, consistency, reachable actions, state feedback and responsive behavior. Let a reviewer cite measured evidence for each finding; an aesthetic grade is not an interaction pass.

[Writing effective tools for agents](https://www.anthropic.com/research/writing-tools-for-agents) recommends realistic task evaluations, meaningful returned context and efficient responses. Our inference: extend one existing tool contract, expose a compact summary plus saved details, and evaluate both intentionally broken and correct cases. More MCP endpoints alone would not demonstrate better agent outcomes.

[AgentLab](https://github.com/ServiceNow/AgentLab) records reproducibility information for web-agent experiments. Borrow the source/package/task identity discipline for a small Apex task corpus; importing its parallel browser architecture would conflict with this repository's single-browser constraint and is not proposed.

[Chrome DevTools MCP](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session) supports inspecting an existing browser/debugging session. Use the existing authorized browser owner and its network/performance evidence when diagnosing UI delays; do not launch a second browser or change global connection settings as routine startup. The hosted F1 MCP status and help calls were available this session, but that service has a different workspace and cannot validate this local branch's changes.

## Priority and measurement plan

| Priority | Improvement | Evaluation before adoption |
| --- | --- | --- |
| 1 | Feedback inventory plus explicit visible-feedback oracle in existing inspector/replay | Hidden Designer message, offscreen message in a real scroller, fully readable positive control, clipped screen-reader-only region, empty and ambiguous targets; preserve focus and scroll |
| 2 | Focus-retention oracle around asynchronous updates | Detect Designer DELETE and LIVE AUTO focus loss; allow explicitly expected focus transfers and distinguish removed from replaced elements |
| 3 | Input evidence for composition, synthetic gamepad and native keyboard | Capture event provenance and focus/scroll deltas; never equate dispatched KeyboardEvents with hardware, OS IME or Safari |
| 4 | Compact evidence comparison | Match source/content fingerprint, device/pointer, settings, renderer and sampling phase; reject incompatible cells; report truncated/unmeasured cases |
| 5 | Agent task-quality evaluation | Pinned broken and correct fixtures; measure reproduced defects, false alarms, missed defects, action count, elapsed time, evidence bytes and independent-verifier agreement |

Do not collapse these into one accessibility or UI quality score. Pixel similarity, geometry, semantics and successful journeys answer different questions. Cost and model tokens remain unknown unless their provider reports them; artifact bytes and elapsed time are directly measurable.

The first implementation does not certify contrast, occlusion, screen-reader speech, physical touch, hardware gamepads, native IME or Safari. Existing layout/focus measurements and axe incomplete results remain separate evidence. Generated reports and screenshots belong under ignored artifacts or scratch.
