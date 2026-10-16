# MCP probe recipes (load on demand)

**Use when:** a parent-owned live canvas probe needs a focused recipe.

**Inputs:** local or deployed URL, backend/route, and the exact `__apex` or
console signal being measured.

**Verification:** record the command, backend, console result, and whether the
probe was local or deployed; do not infer live behavior from a local mirror.

**Writes/ownership:** read-only; the parent owns browser startup and serialized
MCP use.

## Contents

- [Renderer probes](renderer.md) — Probing a specific renderer; secure context and `navigator.gpu`
- [Chrome DevTools MCP](chrome.md)
- [Public-web research](research.md)
- [Real-device reports](device-report.md)
- [Offline capability preflight](offline.md)

Use the narrowest reference for the question. Post-deploy liveness uses `deploy-check` / `deploy-research`; TinyFish is not the container-browser path. Keep browser sessions serialized,
and include the exact URL, backend, command, response or console evidence, and
whether the result came from the real deployment or a local mirror.
