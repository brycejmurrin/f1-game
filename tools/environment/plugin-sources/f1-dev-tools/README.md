# F1 Dev Tools 0.2.5

Cloud-first repair of the retained 0.2.0 rebuild source, aligned with the active
0.2.1 workflow. The account plugin uses the existing F1 Cloud MCP app and no
longer auto-launches three local stdio processes in a hosted chat. Local MCP
configuration is retained under executor/ for hosts that explicitly support
local process launch. Bridge scripts remain optional helpers.

The private app binding, plugin identity and author metadata are preserved.
Tool exposure and authorization are managed by the host, separately from this
package. Discover actual callable tools and call status after importing an update.
A successful local build does not certify hosted attachment.

Game inspection starts at skills/f1-dev-tools/SKILL.md. Agent coordination starts
at skills/f1-agent-coordination/SKILL.md. Run node --test tests/*.test.mjs for
packaging and helper checks. See /workspace/f1-toolchain/PLUGIN-BUILD.md in the
prepared environment for repeatable build instructions.

Recovery uses the canonical checkout gateway at `tools/mcp/chat-gateway.mjs` and lifecycle at `tools/env/chat-mcp-service.mjs`. Run `f1-env doctor`, then `f1-env resume`. Missing local runtime sources fail preflight. Hosted tool attachment and package import remain separate checks.
