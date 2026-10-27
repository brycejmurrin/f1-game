# F1 Cloud MCP 1.0.4

Preserves the existing private app binding, identity and author metadata.
Adds an explicit connection/readiness skill so hosted sessions have a recovery
workflow without depending on a local stdio process launcher.

Tunnel selection, permissions and hosted discovery remain account-side settings.
Importing this package does not create a tunnel or prove attachment. Discover
actual tools and call status after updating. Preserve the existing app and tunnel.
Run node --test tests/*.test.mjs for package validation.

Recovery uses the canonical checkout gateway at `tools/mcp/chat-gateway.mjs` and lifecycle at `tools/env/chat-mcp-service.mjs`. Run `f1-env doctor`, then `f1-env resume`. Missing local runtime sources fail preflight. Hosted tool attachment and package import remain separate checks.
