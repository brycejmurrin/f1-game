# Apex Tools MCP Week-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the eight harness-backed `apex_*` tools and the exclusive browser lock, plus fix week-1 `apex_status` Playwright false-positives.

**Architecture:** Same stdio server. Week-2 tools take `scratch/apex-browser.lock` only after occupancy refuses (live lock / chrome `/healthz` / `playwright test`). `dryRun` and `APEX_MCP_MOCK=1` never spawn Chromium. Week-1 tools still do not take the lock.

**Tech Stack:** Node, existing `tools/*` CLIs, `node:test`. No MCP SDK.

## Global Constraints

- `apex_*` only; no `--url` on shot/eval/survey/gfx-probe.
- `target=deploy` and any URL refused (github.io typed first).
- `apex_ui_survey` frozen recipe; widening `--screens=` / `--viewports=` / `--jobs=` refused.
- Never wrap `test-bg` start/wait/stop.
- Stale lock (dead PID) is stolen; week-1/`apex_status` never take the lock.

## Status

Shipped on `cursor/apex-tools-mcp-9a72`: Playwright occupancy is a `playwright test` token match (not exec-daemon MCP JSON). Week-2 catalog + lock + occupancy refuses are covered by `tests/unit/apex-tools-mcp.test.mjs` (mock/`dryRun`, no Chromium).

---
