# Apex Tools MCP Week-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship a fourth `.mcp.json` server `apex-tools` that wraps week-1 local CLIs under `apex_*` (no browser, no github.io).

**Architecture:** Hand-rolled stdio JSON-RPC in Node (`tools/apex-tools-mcp.mjs` + shell entry), same shape as `probe-mcp.py`, separate catalog so TinyFish failures cannot empty it. Week-1 tools spawn pinned argv; refuses are tool results with `isError: true`.

**Tech Stack:** Node `node:test`, Bash wrapper, existing CLIs under `tools/`. No npm MCP SDK.

## Global Constraints

- Prefix `apex_*` only; zero `chrome_` / `tinyfish_` names or passthrough.
- No `apex_*` tool may hit github.io; SSRF allowlist is loopback only.
- Tree tools reject `target=deploy` with `tree_only`.
- Never wrap `test-bg` start/wait/stop; never `--wait` on verify-change; never bump-cache writers; never `--bg` on pick-tests.
- `APEX_MCP_MOCK=1` freezes catalog and returns fake results (no spawn).
- Logs only on stderr; stdout is JSON-RPC only.
- Protocol `2025-06-18`. Expected refuses are tool results, not JSON-RPC `-32000`.

---

### Task 1: Failing unit suite + registry wiring expectations

**Files:**
- Create: `tests/unit/apex-tools-mcp.test.mjs`
- Modify: `tools/tooling-fast.mjs` (add to `TOOLING_FAST_FILES` next to `probe-mcp.test.mjs`)

- [x] **Step 1: Write assertions from `docs/research/APEX-TOOLS-MCP.md` §Tests**
- [x] **Step 2: Run `node --test tests/unit/apex-tools-mcp.test.mjs` — expect FAIL (missing server)**
- [x] **Step 3: Commit the failing test + tooling-fast entry**

### Task 2: Implement week-1 server + shell + `.mcp.json`

**Files:**
- Create: `tools/apex-tools-mcp.mjs`, `tools/apex-tools-mcp.sh`
- Modify: `.mcp.json`
- Modify: `tests/unit/probe-mcp.test.mjs`, `tests/unit/tinyfish-mcp.test.mjs` (4-key sort)
- Modify: `tests/unit/tools-runnable.test.mjs` (help path)
- Modify: `tools/README.md`, `AGENTS.md`, `docs/TESTING.md`, mark design §Not implemented → Week-1 shipped

- [x] **Step 1: Implement serve/help/status/list-tools/call + six week-1 tools**
- [x] **Step 2: Wire registration and docs**
- [x] **Step 3: Green focused tests + `npm run test:tooling-fast` (background)**
- [x] **Step 4: Commit, push, draft PR**

Week-2 browser tools and the lock are out of scope for this plan.
