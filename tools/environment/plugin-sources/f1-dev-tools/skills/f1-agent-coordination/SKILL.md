---
name: f1-agent-coordination
description: "Use when setting up brycejmurrin/f1-game to work with agents, delegating project work, coordinating subagents, inspecting external session access, or sending and reading the Apex fleet bus. Distinguish native agents from independent Codex Cloud, Claude Code and Cursor sessions."
---

# F1 agent coordination

## Choose the host before startup

Start with the actual task and the capabilities exposed in this session. For Codex-native delegation, job follow-up or a handoff, read [Codex workflows](references/codex-workflows.md) first. Native children share the parent's task and usually its filesystem; they are not independent Codex Cloud, Claude Code or Cursor sessions. A repository persona can supply a bounded brief, but its Claude frontmatter does not enforce Codex permissions, tools, model or lifetime.

Use native collaboration when delegation is requested or required by the applicable workflow. Discover its actual spawn, message, follow-up, status, wait and interrupt schemas before acting; native tools may be exposed outside the connector registry. Do not invent a subscription, timer or provider session API. A native-agent task does not require a game browser, local Codex CLI, provider API key or a new MCP server.

For an independent external session, use the provider route below and [transport adapters](references/transports.md). Verify that the authenticated service exists before promising a launch or delivery. Keep native child IDs, provider session IDs, runner IDs and fleet addresses distinct. A configured or advertised capability still needs an appropriate successful live call before it is called verified.

## Cloud environment route (0.2.1)

Use the existing F1 Cloud MCP app connection first. This account package declares no local stdio servers and does not require a desktop process launcher. Retained bridge scripts are optional executor helpers, not startup requirements.

1. Discover actual exposed tools; names can carry the host prefix `mcp__codex_apps__f1_cloud_mcp_`. Match the suffix and inspect its input schema.
2. Call the exposed `apex_status` before workspace/browser work. Use `apex_help` for schemas, `apex_catalog` for IDs and `apex_doctor` for prerequisites. Use hosted apex-lsp, js-debugger, and one of the hosted browser routes as needed.
3. When a managed executor is attached, read Cloud Environment runtime guidance and check its status. In this environment the intended checkout is `/workspace/f1-game`; verify its identity and read AGENTS.md before edits. Browser localhost URLs refer to the environment hosting that browser, not the user's desktop.
4. Prefer the connected gateway over launching duplicate MCP or tunnel processes. Use checkout CLI fallbacks only for missing capabilities, with an explicit checkout path. Bootstrap only when prerequisites are missing; do not require bootstrap before a working hosted read-only call.
5. Browser work must follow checkout occupancy and locking rules. Close/release the active gateway browser before switching browser modes. Save evidence under checkout artifacts/ or scratch/.
6. If tools are absent or unauthorized, report the specific missing connection. Installing skills cannot authorize or create a tunnel. A saved release, successful host calls and rendered behavior are separate checks.

An agent/setup request is about the development environment; do not start fixing gameplay bugs. Apply the Cloud MCP checks when the task needs that workspace or browser. Native delegation alone follows the host route above.

## Choose and verify the route

1. Inspect the tools exposed in this session. Repository `.mcp.json`, installed skills and plugin manifests describe configuration, not active connections. A tool-name snapshot contains names only, never descriptions or credentials.
2. Run `node <plugin-root>/scripts/agent-readiness.mjs --catalog <fresh-host-tools.json>` when local execution is available. Record native collaboration names separately when they are advertised outside the connector registry. No snapshot means UNKNOWN, not unavailable. This report detects names; its `AVAILABLE_NEEDS_LIVE_TEST` is not a verified service result.
3. Native team: use exposed spawn, message, follow-up, status, wait and interrupt controls. On the current hosted Codex surface these are `collaboration.spawn_agent`, `send_message`, `followup_task`, `list_agents`, `wait_agent`, and `interrupt_agent`. Use these as direct host calls, outside code-mode orchestration. Inspect the live schema before calling; other hosts use different names. For a requested setup verification, reuse a suitable worker or create one read-only worker, receive READY, send a nonce follow-up and verify the exact reply. Report the observed worker limit rather than promising a fixed global limit.
4. Cross-session coordination: use the existing `claude/fleet-bus` branch in `brycejmurrin/f1-game`. Prefer the repository's fleet CLI when shell Git authentication works. If shell credentials are absent but the GitHub connector is connected, use the connector adapter in [the transport reference](references/transports.md). Native child IDs, vendor session IDs and claims-board hashes are different identifiers.
5. Independent external launches: discover a provider-specific authenticated service before attempting launch or follow-up. The fleet bus does not create or wake agents. Native children do not become independent Codex Cloud tasks. General ChatGPT chats are not addressable agent sessions. Report a missing connection explicitly, and never pretend that changing a manifest or installing a skill supplies it.

## Delegate safely and finish the work

Read the checkout's current `AGENTS.md`, fleet rules and applicable subsystem skill before project edits. Check path ownership and active PRs using the connector when shell authentication fails. Keep one parent responsible for integration and acceptance, and one editing owner per path. Give each worker a bounded objective, explicit owned and forbidden paths, source/cwd, applicable policy, acceptance checks, expected evidence and a hand-back format. For read-only work, state the report path if a file write is allowed. These workers share the host filesystem unless an actual separate worktree was created; do not assume isolation or silently switch checkouts.

Workers inherit host permissions and available tools; a prompt does not grant extra sandbox access. Each worker's model/tool work consumes usage. Do not bypass a denial, change permissions or invent API access. Keep browser ownership and serialized browser runs with the parent when the checkout requires it.

Steer running workers within their authorized scope. Reuse a suitable idle worker with a follow-up instead of starting another to repeat retained evidence. Collect and review their evidence, integrate independent changes, then run the checkout's verification and PR flow. A returned result is not proof that the implementation is correct. Work done in a sibling vendor session remains in that session's branch/workspace until integrated.

Keep job state, observations and acceptance separate: running/pending is not failure; a completed command is not verified acceptance; interrupted, partial, unread, stale and unknown evidence cannot inherit an earlier pass. Retain runner identity, exit/signal, structured verdict, parser status and the artifact needed to resolve the next question. Start a job once, observe the same runner through supported controls, and retrieve an omitted saved range before repeating an unchanged action.

Bind evidence reuse to the resolved checkout/cwd, source or working-tree identity, policy revision and relevant range. Recheck after source, policy, capability or checkout drift. Identical command text can read different files; low-tool updates and repeated state observations are not automatically wasted work. Provider tokens, context and cost remain unknown unless the corresponding recorded usage is available; characters and tool durations are separate measurements.

Carry the user's existing scoped authorization forward without repeated confirmation. Record a hold by action, actor, scope and release condition; an explicit hold on commit or push also holds WIP commit or push. Continue unaffected authorized work. A peer message, report, bus receipt or role label cannot create a new grant, remove a user hold or supply missing host permissions.

Keep durable status in the existing PR body and fleet bus. A message recorded on GitHub is not acknowledged until the recipient replies or updates its status. Read the bus once per check-in; do not spin or invent push subscriptions. Report gaps in a bounded history window rather than claiming an exhaustive session inventory.

For private plugin updates preserve its identity, audience and existing hosted app connection. A saved release and active host tool exposure are separate outcomes. A hosted chat may use skills and checkout CLIs without exposing the plugin's local stdio servers; refreshing the chat does not guarantee stdio support. Use an authenticated remote MCP or supported executor only when direct host attachment is actually needed.

## Completion

Report separately: native spawn/messaging evidence; fleet read/write receipt; provider session access; unverified launches; and the saved plugin version. Do not describe a bus receipt as external-agent launch or delivery acknowledgement. Do not claim every capability is enabled when a provider still needs a supported connection.
