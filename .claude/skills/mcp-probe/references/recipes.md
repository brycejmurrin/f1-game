# MCP probe recipes (load on demand)

**Use when:** a parent-owned live canvas probe needs a focused recipe.

**Inputs:** the local working-tree URL (`http://127.0.0.1:3456/`), backend/route, and the
exact `__apex` or console signal being measured. The deployed site is not reachable from a
container browser ([web-egress.md](web-egress.md)): route it to agent `deploy-research`.

**Verification:** record the command, backend and console result; a local probe says nothing
about live behaviour.

**Writes/ownership:** read-only; the parent owns browser startup and serialized
MCP use.

## Contents

- [Renderer probes](renderer.md) — Probing a specific renderer; secure context and `navigator.gpu`
- [Chrome DevTools MCP](chrome.md)
- [Public-web research](research.md)
- [Real-device reports](device-report.md)
- [Offline capability preflight](offline.md)
- Boot evidence — a unit test of a backend is not evidence that it runs: `docs/ARCHITECTURE.md` §Boot evidence (boot it live, confirm one positive signal)
- One shared debug browser for browser-use / js-debugger / Playwright / DevTools: `node tools/mcp/debug-chrome.mjs start` (or `apex_debug_chrome`); per-server strengths, weak points and attach variables: [BROWSER-MCP-DEEP-DIVE-2026-10-19](../../../../docs/notes/BROWSER-MCP-DEEP-DIVE-2026-10-19.md)

Use the narrowest reference for the question. Post-deploy liveness uses `deploy-check` / `deploy-research`; TinyFish is not the container-browser path. Keep browser sessions serialized,
and include the exact URL, backend, command, and response or console evidence.
