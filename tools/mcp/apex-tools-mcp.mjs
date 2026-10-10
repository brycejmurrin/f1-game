#!/usr/bin/env node
/**
 * @doc Repo MCP server: wraps a pinned subset of these CLIs as `apex_*` tools; tree (no lock) vs browser (lock).
 * @skill check-changes
 * apex-tools-mcp — wrap committed tools/ CLIs as MCP tools (apex_* only).
 *
 * One of the THREE .mcp.json servers (beside chrome-devtools and
 * playwright-official; catalog trimmed 7 → 3 and wraps 30 → 11 on 2026-09; 16 with framing, doctor and session checks).
 * Never chrome_* / tinyfish_*. Local working tree only; no github.io.
 * Design: docs/research/APEX-TOOLS-MCP.md — map: docs/AGENT-SURFACE.md
 *
 *   node tools/mcp/apex-tools-mcp.mjs help | status | list-tools | serve | smoke
 *   node tools/mcp/apex-tools-mcp.mjs call apex_pick_tests '{"dryRun":true}'
 *   ./tools/mcp/apex-tools-mcp.sh call apex_status '{}'
 *   ./tools/mcp/apex-tools-mcp.sh call apex_select_specs '{"since":"HEAD~1"}'
 *   ./tools/mcp/apex-tools-mcp.sh smoke
 *
 * APEX_MCP_MOCK=1 freezes the catalog and returns fake results (no spawn).
 */
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { shotErrors } from "../gen/bake-flyby.mjs";
import { emptyPlaywright, scanPlaywrightLines } from "../ci/playwright-occupancy.mjs";
import { createExtras, JOB_KINDS, HUD_JOB_ARGV, processTree, killTreeAndWait } from "./apex-extras.mjs";
import {
  CellError, ELEMENT_TOGGLES as HUD_TOGGLES, ENUMS as HUD_ENUMS, PRESETS as HUD_PRESETS, SCALES as HUD_SCALES,
  expandMatrix, parseShard, shardCells, estimateMinutes, validateOffsets,
} from "../lib/hud-survey-matrix.mjs";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROTOCOL = "2025-06-18";
const SERVER_NAME = "apex-tools-mcp";
const SERVER_VERSION = "1.13.0";
const HTTP_HOST = "127.0.0.1";
const HTTP_PORT_DEFAULT = 3713;
const PREFIX = "apex_";
const LOCK_PATH = path.join(ROOT, "scratch", "apex-browser.lock");
// APEX_TEST_BG_STATE points the occupancy check at another registry, so a test
// never rewrites the real artifacts/logs/test-bg.json under a live run (TS1).
const TEST_BG_STATE = process.env.APEX_TEST_BG_STATE || path.join(ROOT, "artifacts", "logs", "test-bg.json");
const CHROME_DAEMON_STATE = path.join(ROOT, "scratch", "probe-chrome-daemon.port");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const SCRATCH_DIR = path.join(ROOT, "scratch");

// Design §Locking known gap — v1 mutex is MCP-owned. chrome-devtools stdio
// and playwright MCP do not answer :3712/healthz. apex_status reports them.
const KNOWN_GAP = {
  chromeDevtoolsStdio:
    "Cursor .mcp.json chrome-devtools is a third browser and does not answer :3712/healthz",
  playwrightMcpStdio:
    "Cursor .mcp.json playwright-official (@playwright/mcp) is another browser and does not answer :3712/healthz",
  hostPlaywrightMcp:
    "Playwright MCP browser_* / @playwright/mcp Chromium does not take apex-browser.lock; occupancy refuses on a Chromium with a playwright-mcp user-data-dir (the launched browser), reports but allows the idle @playwright/mcp server. Cursor --mcp-config JSON is ignored.",
  outsideLock: ["layout-audit", "cdmcp-*", "raw node tools/shot/apex-eval.mjs", "playwright-mcp"],
};

function toolKind(entry) {
  if (entry.kind === "browser" || entry.kind === "tree") return entry.kind;
  return entry.week === 2 ? "browser" : "tree";
}

function mockMode() {
  const v = (process.env.APEX_MCP_MOCK || "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no";
}

function log(...args) {
  console.error(...args);
}

function toolResult(body, { isError = false } = {}) {
  const result = {
    content: [{ type: "text", text: JSON.stringify(body) }],
  };
  // MCP 2025-06-18: a tool that advertises an outputSchema MUST return
  // structuredContent conforming to it, mirrored as serialized text (above).
  if (body && typeof body === "object" && !Array.isArray(body)) result.structuredContent = body;
  if (isError || body.ok === false) result.isError = true;
  return result;
}

function refuse(error, message, fix) {
  return toolResult({ ok: false, error, message, fix }, { isError: true });
}

function isLoopbackHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function classifyUrl(raw) {
  if (raw == null || raw === "") return null;
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return {
      error: "ssrf_blocked",
      message: `invalid url: ${raw}`,
      fix: "Pass a loopback http(s) URL (127.0.0.1 / localhost / [::1]) or omit url.",
    };
  }
  const host = u.hostname.toLowerCase();
  if (host === "github.io" || host.endsWith(".github.io")) {
    return {
      error: "github_io_blocked",
      message: "apex_* tools never hit github.io / Pages.",
      fix: "Live deploy checks belong to the deploy-research subagent (host fetch / WebFetch); apex_* never reaches Pages.",
    };
  }
  if (!isLoopbackHost(host)) {
    return {
      error: "ssrf_blocked",
      message: `non-loopback host refused: ${host}`,
      fix: "SSRF allowlist is loopback only. Deployed-site checks belong to deploy-research.",
    };
  }
  return null;
}

function resolveTarget(args) {
  if (args.url != null && args.url !== "") return "url";
  if (args.target != null && args.target !== "") return String(args.target);
  if (process.env.APEX_MCP_TARGET) return String(process.env.APEX_MCP_TARGET);
  return "local";
}

function gateTreeArgs(args) {
  const urlGate = classifyUrl(args.url);
  if (urlGate) return refuse(urlGate.error, urlGate.message, urlGate.fix);
  if (resolveTarget(args) === "deploy") {
    return refuse(
      "tree_only",
      "Tree tools operate on the working tree only.",
      "Omit target / use target=local. Deployed Pages checks: deploy-research (host fetch / WebFetch).",
    );
  }
  return null;
}

function gateBrowserArgs(args) {
  const urlGate = classifyUrl(args.url);
  if (urlGate) return refuse(urlGate.error, urlGate.message, urlGate.fix);
  if (args.url != null && args.url !== "") {
    return refuse(
      "url_not_supported",
      "v1 browser tools boot harness.mjs on loopback; they do not take --url.",
      "Omit url. Attaching to an already-running npx serve is a later feature.",
    );
  }
  if (resolveTarget(args) === "deploy") {
    return refuse(
      "local_only",
      "Browser apex_* tools are local harness only.",
      "Omit target / use target=local. Deployed Pages checks: deploy-research (host fetch / WebFetch).",
    );
  }
  return null;
}

function alive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function daemonPort() {
  // Same discovery as probe-mcp.py daemon_port(): env → state file → 3712.
  const candidates = [];
  const env = (process.env.PROBE_CHROME_PORT || "").trim();
  if (/^\d+$/.test(env)) candidates.push(Number(env));
  try {
    if (fs.existsSync(CHROME_DAEMON_STATE)) {
      const text = fs.readFileSync(CHROME_DAEMON_STATE, "utf8").trim();
      if (/^\d+$/.test(text)) candidates.push(Number(text));
    }
  } catch { /* ignore */ }
  candidates.push(3712);
  for (const port of [...new Set(candidates)]) {
    // Raw TCP + HTTP/1.0 — Node http.get from a spawnSync child hangs on
    // loopback in this environment (TCP connect succeeds; GET never completes).
    const r = spawnSync(
      process.execPath,
      [
        "-e",
        `const s=require("net").connect(${port},"127.0.0.1",()=>{s.write("GET /healthz HTTP/1.0\\r\\nHost:127.0.0.1\\r\\n\\r\\n")});let b="";s.on("data",d=>{b+=d;if(/HTTP\\/1.[01] 200/.test(b)){s.end();process.exit(0)}});s.on("error",()=>process.exit(1));s.setTimeout(800,()=>{s.destroy();process.exit(1)})`,
      ],
      { encoding: "utf8", timeout: 1500 },
    );
    if (r.status === 0) return port;
  }
  return null;
}

function playwrightLive() {
  // APEX_MCP_PS: canned `ps -eo pid,args` for occupancy unit tests so a live
  // host Playwright MCP on Cloud does not poison lock/daemon cases.
  if (process.env.APEX_MCP_PS != null) {
    return scanPlaywrightLines(process.env.APEX_MCP_PS);
  }
  const r = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8", timeout: 5000 });
  if (r.status !== 0) return emptyPlaywright();
  return scanPlaywrightLines(r.stdout);
}

function testBgStatus() {
  if (!fs.existsSync(TEST_BG_STATE)) {
    return { recorded: false, running: [], browserRunning: [], runs: [] };
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(TEST_BG_STATE, "utf8"));
  } catch {
    return { recorded: true, running: [], browserRunning: [], runs: [], error: "unreadable" };
  }
  const runs = Array.isArray(state.runs) ? state.runs : [];
  const running = runs.filter((run) => alive(run.pid));
  // Missing metadata is treated as browser-active for old state files. New
  // test-bg records distinguish Node-only groups so they do not block a dry
  // browser-tool plan or make tooling-fast fail while testing this guard.
  const browserRunning = running.filter((run) => run.browser !== false);
  return { recorded: true, mode: state.mode, running, browserRunning, runs };
}

function lockInfo() {
  if (!fs.existsSync(LOCK_PATH)) return { held: false };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  } catch {
    return { held: true, stale: false, error: "unreadable" };
  }
  if (!isObject(raw) || !Number.isInteger(Number(raw.pid)) || Number(raw.pid) <= 0) return { held: true, stale: false, error: "invalid owner" };
  const pid = Number(raw.pid);
  if (!alive(pid)) return { held: false, stale: true, pid };
  return { held: true, pid, since: raw.since || null, tool: raw.tool || null };
}

function reapStaleLock() {
  const info = lockInfo();
  if (info.stale && fs.existsSync(LOCK_PATH)) {
    try { fs.unlinkSync(LOCK_PATH); } catch { /* ignore */ }
  }
}

function occupancyRefuse() {
  reapStaleLock();
  const lock = lockInfo();
  if (lock.held) {
    return refuse(
      "lock_held",
      `scratch/apex-browser.lock is held by live pid ${lock.pid}` +
        (lock.tool ? ` (${lock.tool})` : ""),
      "Wait for the other apex_* browser tool to finish, or remove the lock if that PID is gone.",
    );
  }
  const port = daemonPort();
  if (port != null) {
    return refuse(
      "chrome_daemon_up",
      `probe chrome daemon /healthz is up on 127.0.0.1:${port}`,
      "python3 tools/mcp/probe-mcp.py chrome-stop before week-2 apex_* browser tools.",
    );
  }
  const bg = testBgStatus();
  const pw = playwrightLive();
  // An idle host @playwright/mcp SERVER is not occupancy (see
  // playwright-occupancy.mjs `busy`); its launched Chromium is.
  if (bg.browserRunning.length || pw.busy) {
    const who = [
      bg.browserRunning.length ? "test-bg" : null,
      pw.suite ? "`playwright test`" : null,
      pw.hostBrowser ? "Playwright MCP browser (`browser_*`)" : null,
    ].filter(Boolean).join(" + ");
    return refuse(
      "playwright_live",
      `${who || "A Playwright process"} is live.`,
      "Wait for test-bg (`node tools/ci/test-bg.mjs --status`) or close the host MCP browser (`browser_close`) before apex_* browser tools.",
    );
  }
  return null;
}

export function acquireLock(tool) {
  const busy = occupancyRefuse();
  if (busy) return busy;
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const payload = { pid: process.pid, since: Date.now(), tool };
  try { fs.writeFileSync(LOCK_PATH, JSON.stringify(payload), { flag: "wx" }); }
  catch (e) {
    if (e.code === "EEXIST") return refuse("lock_held", "another tool claimed the browser lock", "Retry after the owner exits.");
    throw e;
  }
  const again = lockInfo();
  if (!again.held || again.pid !== process.pid) {
    return refuse(
      "lock_held",
      "lost the browser-lock race",
      "Retry once; another apex_* browser tool took scratch/apex-browser.lock.",
    );
  }
  return null;
}

export function releaseLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    if (Number(raw.pid) === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch { /* ignore */ }
}

function nodeTool(rel) {
  return [process.execPath, path.join(ROOT, "tools", rel)];
}

const CATALOG = [
  {
    name: "apex_verify_change_fast",
    week: 1,
    description: "Tree — verify-change --fast --json (no browser groups). Never --wait. Can take several minutes on a large diff (10 min cap). Skill: check-changes.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        staged: { type: "boolean" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_pick_tests",
    week: 1,
    description: "Tree — which test GROUPS this change needs (--json). Never --bg (that would start test-bg). Skill: check-changes.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        staged: { type: "boolean" },
        files: { type: "array", items: { type: "string" } },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_bump_cache_check",
    week: 1,
    description: "Tree — are ?v= hashes and version.json consistent? --check --json only. Never --apply. Skill: check-changes.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_status",
    week: 1,
    description: "Tree — read-only occupancy: lock, chrome /healthz, test-bg, playwright PIDs, loadavg. Does not take the lock. Call before any browser apex_*.",
    inputSchema: { type: "object", properties: { dryRun: { type: "boolean" } } },
  },
  {
    name: "apex_doctor",
    kind: "tree",
    description: "Tree — read-only local tool readiness and prerequisite report; no browser, network, installation or writes.",
    inputSchema: { type: "object", properties: { dryRun: { type: "boolean" } } },
  },
  {
    name: "apex_eval",
    week: 2,
    description: "Browser (lock first) — boot harness Chromium and evaluate one __apex expression; `backend` pins three|webgl2|webgpu (a `GLX.*` expr under the default answers for TLX); `vm: true` runs the same expr in the Node VM instead (no browser, no pixels, ~4 s). Local only, no --url. Skill: playwright-probe.",
    inputSchema: {
      type: "object",
      properties: {
        track: { type: "string" },
        expr: { type: "string" },
        raw: { type: "boolean" },
        backend: { type: "string", enum: ["three", "webgl2", "webgpu"], description: "Pin the renderer the expr measures (default three = TLX)." },
        vm: { type: "boolean", description: "Node VM route (tools/lib/game-vm.cjs): no Chromium, no rasters; refuses `backend`." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_shot",
    week: 2,
    description: "Browser (lock first) — deterministic scene screenshot (track/frac/cam). Local harness only. Skill: playwright-probe.",
    inputSchema: {
      type: "object",
      properties: {
        track: { type: "string" },
        frac: { type: "number" },
        cam: { type: "string" },
        out: { type: "string" },
        az: { type: "number" },
        el: { type: "number" },
        dist: { type: "number" },
        side: { type: "number" },
        hud: { type: "boolean" },
        image: { type: "boolean", description: "Attach a JPEG thumbnail (default true)." },
        tod: { type: "string" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_shot_survey",
    week: 7,
    kind: "browser",
    description: "Browser (lock first) — multi-shot scenery survey via one track-session boot per circuit. Presets: quick (4), dual_lite (8), night_pass, lap, dual, inspect, scenery/full (12). Long or multi-track runs default to async (returns jobId; watch apex_job_status). Options: tracks[], resume, async, gl llvmpipe|swiftshader, progress/findings JSON. Skill: survey-track.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        track: { type: "string", description: "Circuit id (or use tracks[])." },
        tracks: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 12,
          description: "Queue several circuits sequentially (one lock). Implies async job by default.",
        },
        preset: {
          type: "string",
          enum: ["quick", "dual_lite", "night_pass", "scenery", "full", "lap", "dual", "inspect", "custom"],
          description: "quick=4 orbit; dual_lite=4×2; night_pass=6 night orbit; scenery/full=12; dual/inspect=16.",
        },
        label: { type: "string", pattern: "^[A-Za-z0-9._-]{1,80}$", description: "Shot name prefix (default survey)." },
        count: { type: "integer", minimum: 1, maximum: 32, description: "Evenly spaced fracs when fracs omitted." },
        fracs: { type: "array", items: { type: "number", minimum: 0, maximum: 1 }, minItems: 1, maxItems: 32 },
        cam: { type: "string", enum: ["park", "eye", "orbit", "cinematic", "trackside"] },
        cams: { type: "array", items: { type: "string", enum: ["park", "eye", "orbit", "cinematic", "trackside"] }, maxItems: 5 },
        shots: {
          type: "array",
          maxItems: 32,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              frac: { type: "number" },
              cam: { type: "string" },
              tod: { type: "string" },
              az: { type: "number" },
              el: { type: "number" },
              dist: { type: "number" },
              h: { type: "number" },
              side: { type: "number" },
              hud: { type: "boolean" },
            },
          },
          description: "Explicit shot list; overrides preset/count/fracs.",
        },
        az: { type: "number" },
        el: { type: "number" },
        dist: { type: "number" },
        h: { type: "number" },
        side: { type: "number", enum: [-1, 1] },
        tod: { type: "string", enum: ["day", "dusk", "dawn", "night"] },
        hud: { type: "boolean" },
        cols: { type: "integer", minimum: 0, maximum: 12, description: "Panel columns (0 = auto)." },
        sheetName: { type: "string", pattern: "^[A-Za-z0-9._-]{1,80}$" },
        panel: { type: "boolean", description: "Build contact sheet PNG (default true)." },
        index: { type: "boolean", description: "Write index.html gallery (default true)." },
        resume: { type: "boolean", description: "Skip cells whose PNG already exists under out/." },
        async: { type: "boolean", description: "true=jobId via shot_survey; false=sync; default=job when estimate≥60s or multi-track." },
        gl: { type: "string", enum: ["llvmpipe", "swiftshader"], description: "Software GL stack (default llvmpipe when Mesa dri present)." },
        closeSession: { type: "boolean", description: "Free browser lock when done (default true; sync path)." },
        keepSession: { type: "boolean", description: "When true, leave session open (implies closeSession false)." },
        out: { type: "string", description: "Output dir under artifacts/ or scratch/." },
        image: { type: "boolean", description: "Attach panel JPEG thumbnail (default true; sync path)." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_agent",
    week: 2,
    description: "Browser (lock first) — agent.mjs world/track/scene/rollout via harness. Skill: agent-view.",
    inputSchema: {
      type: "object",
      properties: {
        track: { type: "string" },
        command: { type: "string" },
        detail: { type: "string" },
        at: { type: "number" },
        speed: { type: "number" },
        lateral: { type: "number" },
        what: { type: "string" },
        id: { type: "string" },   // describe: prop:12 | corner:T3 | car:4 | span:2 (agent.mjs --id)
        radius: { type: "number" },
        limit: { type: "number" },
        seconds: { type: "number" },
        weather: { type: "string" },
        tod: { type: "string" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_garage",
    week: 4,
    kind: "browser",
    description: "Browser (lock first) — a PERSISTENT garage session over garage-angles --serve: op open once, then team / livery / design / frame / shot / diff / sheet / reload / status / close, each a few seconds instead of a boot. Keys given together apply in order (design → frame → shot). Needs the MCP server (serve / serve-http); a one-shot `call` ends the session with the process. Skill: garage-parts-livery.",
    inputSchema: {
      type: "object",
      properties: {
        op: { type: "string", enum: ["open", "status", "team", "livery", "design", "frame", "shot", "diff", "sheet", "reload", "close"] },
        team: { type: "string", description: "Team id (open: the team to boot with; team: switch to it)." },
        seat: { type: "number", description: "Driver seat 0/1 with op team." },
        livery: { type: "string", description: "Catalog livery id." },
        design: { type: "object", description: "Liveries.FIELDS values (+ part.<cat>, driver, light.<knob>)." },
        base: { type: "string", description: "Catalog livery the design paints over." },
        frame: { description: "Station / alias / view name, or {view|station|cam, az, el, dist, target, lamp, zoom, pan, eye, look, clamp, crop}. az / el are RADIANS (el is clamped to the orbit's pitch range), dist is metres." },
        name: { type: "string", description: "Output name for op shot (default: the tool's own name)." },
        diff: { type: "array", items: { type: "string" }, description: "Two shot names or PNG paths → Δ fraction + overlay." },
        sheet: { type: "string", description: "Contact-sheet name for op sheet." },
        out: { type: "string", description: "Output dir under artifacts/ or scratch/ (open)." },
        fast: { type: "boolean" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_select_specs",
    week: 3,
    description: "Tree — which SPECS fit the budget since a git ref (--json). Requires since. Never starts tests. Skill: check-changes.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        budgetMin: { type: "number" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_rotate_markings_check",
    week: 4,
    description: "Tree — would rotating start-line markings move circuit blocks? --check only. Never --write. Skill: new-track.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_graph_parity",
    week: 4,
    description: "Tree — TrackGraph vertex parity vs required git base. Never omit base. id: one circuit, ~2–5 s. all:true outlasts the 180 s tool cap, so it starts apex_job_start graph_parity_all and returns its jobId — watch with apex_job_status. Skill: scenery-dress.",
    inputSchema: {
      type: "object",
      properties: {
        base: { type: "string", description: "Git ref for BASE= (required)." },
        id: { type: "string" },
        all: { type: "boolean" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_frame_report",
    week: 5,
    kind: "tree",
    description: "Tree — FRAMING REPORT of the flyby with no browser and no GPU (node VM, ~3 s boot): per frame subject cover / % visible / occluders, sky, near obstructions, motion, flags, score, ASCII thumb. One circuit; the fleet sweep and --diff stay CLI (minutes). Never --out / --fleet / --pose. Skill: playwright-probe.",
    inputSchema: {
      type: "object",
      properties: {
        track: { type: "string", description: "Circuit id (required) — one of Tracks.LIST (tools/manifest.cjs CIRCUITS)." },
        u: { type: "array", items: { type: "number" }, description: "Exact flyby points 0..1 (max 64). Not with frames." },
        frames: { type: "integer", description: "N evenly spaced frames (1..120). Not with u. Default: each shot's start/mid/end." },
        shots: { type: "string", description: "Shot-list JSON data file under scratch/ or artifacts/ (default FlybySeq.DEFAULT); executable JS is refused." },
        json: { type: "boolean", description: "Full JSON report (parsed into out) instead of the text table + thumbs." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["track"],
    },
  },
  // 12 → 15 on 2026-10-02: the three read-only checks AGENTS.md rule 12 runs
  // every session (status block for the PR body, who else is on a red, one CI
  // poll after a push). Each answers in 0.1–2 s and only reads.
  {
    name: "apex_session_status",
    week: 6,
    kind: "tree",
    description: "Tree — this branch's handoff block as JSON (sessions, commits vs the deploy branch, dirty/unpushed, each test log's verdict, a live run): the PR body's status section. Read-only. Skill: steward.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_who_is_on_it",
    week: 6,
    kind: "tree",
    description: "Tree — recent pushes per branch, who touched these paths, live claims (--json): the check before fixing a red you did not cause. Read-only: never --claim / --release (run the CLI for those). Skill: steward.",
    inputSchema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "Look-back window in hours (1..168, default 6)." },
        paths: { type: "array", items: { type: "string" }, description: "Repo-relative paths whose recent authors to list." },
        noFetch: { type: "boolean", description: "Skip the git fetch (faster, may be stale)." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_ci_status",
    week: 6,
    kind: "tree",
    description: "Tree — ONE poll of a SHA's CI runs (ci-watch --once): per-job lines, a red's failing step, and the `= ci <verdict>` line parsed into out. Never waits — arm a Monitor on ci-watch.mjs for that. Read-only GETs. Skill: steward.",
    inputSchema: {
      type: "object",
      properties: {
        sha: { type: "string", description: "Commit SHA (7–40 hex) or HEAD (default)." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  // 24 → 26 on 2026-10-04: the race-HUD survey (tools/shot/hud-survey.mjs).
  // Results carry structuredContent + its serialized text copy + resource_link
  // content per https://modelcontextprotocol.io/specification/2025-06-18/server/tools
  {
    name: "apex_hud_shot",
    kind: "browser",
    description: "Browser (lock first) — ONE race-HUD cell (device × camera × HUD settings): screenshot + measured boxes + findings (overlap / missing / offscreen / unsafe / tinyText / pageError). ~2 min on SwiftShader (one boot), past the host's ~60–120 s MCP limit, so by default it runs as apex_job_start hud_shot and returns a jobId at once (poll apex_job_status). async:false blocks instead and returns structuredContent {shot, findings, measurements} + a resource_link to the PNG. Local tree only. Skill: survey-ui-matrix.",
    inputSchema: {
      type: "object",
      properties: {
        track: { type: "string", description: "Circuit id (default monza)." },
        frac: { type: "number", description: "Lap fraction to park at (default 0.18)." },
        async: { type: "boolean", description: "Default true = background hud_shot job (jobId); false = block on the cell (~2 min; host may time out)." },
        device: { type: "string", enum: HUD_ENUMS.device },
        cam: { type: "string", enum: HUD_ENUMS.cam, description: "CamModes id (default chase)." },
        profile: { type: "string", enum: HUD_ENUMS.profile },
        layout: { type: "string", enum: HUD_ENUMS.layout },
        map: { type: "string", enum: HUD_ENUMS.map },
        gaps: { type: "string", enum: HUD_ENUMS.gaps },
        preset: { description: "MOVE & SIZE preset name, or inline offsets {elementId: {x, y, s}} (x/y -50..50, s 50..200)." },
        theme: { type: "string", enum: HUD_ENUMS.theme },
        cvd: { type: "string", enum: HUD_ENUMS.cvd },
        contrast: { type: "string", enum: HUD_ENUMS.contrast },
        hudScale: { type: "number", description: "HUD SIZE percent (40..200; the game clamps to 70..200)." },
        tyres: { type: "string", enum: HUD_ENUMS.tyres },
        mirror: { type: "string", enum: HUD_ENUMS.mirror },
        hud: { type: "string", enum: HUD_ENUMS.hud },
        presetSet: { type: "string", enum: HUD_ENUMS.presetSet, description: "Apply the preset to the camera's layout set (cam) or both." },
        textSize: { type: "string", enum: HUD_ENUMS.textSize },
        tod: { type: "string", enum: HUD_ENUMS.tod },
        steer: { type: "string", enum: HUD_ENUMS.steer },
        profileLive: { type: "string", enum: HUD_ENUMS.profileLive, description: "Switch the profile LIVE (settings row) after the cell's MOVE & SIZE writes." },
        uiScale: { type: "number", description: "UI SIZE percent (40..200)." },
        btnScale: { type: "number", description: "BUTTON SIZE percent (40..300; touch devices)." },
        off: { type: "array", items: { type: "string", enum: Object.keys(HUD_TOGGLES) }, description: "HudElements ids switched OFF." },
        inlineImage: { type: "boolean", description: "Also return the PNG as image content (≤ 1.5 MB; async:false only)." },
        backend: { type: "string", enum: ["three", "webgl2"], description: "Renderer the cell boots (default three = TLX; webgl2 = GLX)." },
        out: { type: "string", description: "Output dir under artifacts/ or scratch/." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_hud_survey",
    kind: "browser",
    description: "Browser (lock first) — the race-HUD survey over a matrix: quick (13 cells, 3 boots, ~10 min), leads (static-audit repros with numeric checks, ~25 min), full (pairwise, ~33 cells / 20 boots, ~45 min), exhaustive (~470 cells, shard required) or a matrix JSON under scratch/ or artifacts/. By default it runs as apex_job_start hud_survey and returns a jobId at once (poll apex_job_status). async:false blocks instead and returns the findings summary + resource_links to findings.md / index.html / report.json. Skill: survey-ui-matrix.",
    inputSchema: {
      type: "object",
      properties: {
        matrix: { type: "string", description: "quick (default) | full | leads | exhaustive (needs shard) | path to a matrix JSON under scratch/ or artifacts/." },
        only: { type: "array", items: { type: "string" }, description: "Keep cells whose id contains any of these substrings." },
        shard: { type: "string", description: "i/n — one balanced shard of the matrix (whole boot groups)." },
        backend: { type: "string", enum: ["three", "webgl2"], description: "Renderer every cell boots (default three = TLX; webgl2 = GLX)." },
        noShots: { type: "boolean", description: "Measure only, no PNGs." },
        async: { type: "boolean", description: "Default true = background hud_survey job (jobId); false = block for the whole matrix (minutes; host may time out)." },
        track: { type: "string" },
        frac: { type: "number" },
        out: { type: "string", description: "Output dir under artifacts/ or scratch/." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  // 16 → 24 on 2026-10-03: a persistent track session, background jobs for the
  // minutes-long CLIs, one-cell UI checks, and the offline car / track audits.
  // Handlers live in tools/mcp/apex-extras.mjs.
  {
    name: "apex_track",
    week: 7,
    kind: "browser",
    description: "Browser (lock first) — a PERSISTENT track session over track-session.mjs --serve: op open {track} once (~30 s), then shot / eval / track / sheet / diff / status / close (~10–25 s each), or op survey {track,preset|fracs} for a multi-shot panel in one call (same as apex_shot_survey). Skill: survey-track.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        op: { type: "string", enum: ["open", "shot", "eval", "track", "sheet", "diff", "status", "close", "survey"] },
        track: { type: "string", description: "Circuit id (open; op track switches; survey requires)." },
        preset: { type: "string", enum: ["scenery", "lap", "dual", "inspect", "custom"] },
        label: { type: "string", pattern: "^[A-Za-z0-9._-]{1,80}$" },
        count: { type: "integer", minimum: 1, maximum: 32 },
        fracs: { type: "array", items: { type: "number", minimum: 0, maximum: 1 }, minItems: 1, maxItems: 32 },
        cams: { type: "array", items: { type: "string", enum: ["park", "eye", "orbit", "cinematic", "trackside"] }, maxItems: 5 },
        shots: { type: "array", maxItems: 32, items: { type: "object" } },
        cols: { type: "integer", minimum: 0, maximum: 12 },
        sheetName: { type: "string" },
        panel: { type: "boolean" },
        index: { type: "boolean" },
        closeSession: { type: "boolean" },
        keepSession: { type: "boolean" },
        frac: { type: "number", minimum: 0, maximum: 1 },
        cam: { type: "string", enum: ["park", "eye", "orbit", "cinematic", "trackside"] },
        az: { type: "number" },
        el: { type: "number", description: "Degrees. orbit/cinematic: elevation; eye: pitch (+ up; omit to look ahead)." },
        dist: { type: "number" },
        h: { type: "number", description: "Metres above the road at frac. eye: eye height (default 2.5); orbit: aim-point height (default 1.5)." },
        side: { type: "number", enum: [-1, 1] },
        tod: { type: "string", enum: ["day", "dusk", "dawn", "night"] },
        hud: { type: "boolean" },
        name: { type: "string", pattern: "^[A-Za-z0-9._-]{1,80}$", description: "Shot or sheet file name (no extension)." },
        expr: { type: "string", description: "eval: an __apex expression, `a` is __apex." },
        diff: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
        image: { type: "boolean", description: "Attach a JPEG thumbnail (default true)." },
        out: { type: "string", description: "open: output dir under artifacts/ or scratch/." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_job_start",
    week: 7,
    kind: "tree",
    description: "Tree — start a minutes-long CLI in the BACKGROUND and return a jobId at once (survey_track, shot_survey, hud_shot, hud_survey, ui_gallery, ui_matrix, flicker_gate take the browser lock until they exit; hud_* start only from apex_hud_shot / apex_hud_survey). Watch with apex_job_status. Skill: check-changes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: JOB_KINDS },
        track: { type: "string", description: "survey_track / shot_survey: circuit id." },
        tracks: { type: "string", description: "shot_survey: comma-separated circuit ids (sequential)." },
        preset: { type: "string", description: "shot_survey: quick|dual_lite|night_pass|scenery|full|lap|dual|inspect|custom." },
        label: { type: "string", description: "shot_survey: shot name prefix." },
        out: { type: "string", description: "shot_survey: output dir under artifacts/ or scratch/." },
        resume: { type: "boolean", description: "shot_survey: skip existing PNGs." },
        panel: { type: "boolean", description: "shot_survey: contact sheet (default true)." },
        index: { type: "boolean", description: "shot_survey: index.html (default true)." },
        gl: { type: "string", enum: ["llvmpipe", "swiftshader"], description: "shot_survey: software GL." },
        tod: { type: "string", enum: ["day", "dusk", "dawn", "night"], description: "shot_survey: time of day override." },
        count: { type: "integer", description: "shot_survey: frac count override." },
        fracs: { type: "array", items: { type: "number" }, description: "shot_survey: explicit fracs." },
        oblique: { type: "boolean", description: "survey_track: add topdown + N/E/S/W aerials." },
        screens: { type: "string", description: "ui_gallery / ui_matrix: comma list of screen ids." },
        viewports: { type: "string", description: "ui_gallery / ui_matrix: comma list (wildcards ok, e.g. ios-*)." },
        scale: { type: "string", description: "ui_matrix: comma list of interface sizes, e.g. 100,130." },
        site: { type: "string", description: "flicker_gate: comma list of site ids (default all)." },
        team: { type: "string", description: "livery_contrast: one team id (default every team — slow)." },
        base: { type: "string", description: "graph_parity_all: the git ref for BASE= (required)." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["kind"],
    },
  },
  {
    name: "apex_job_status",
    week: 7,
    kind: "tree",
    description: "Tree — a background job's state (running | done | failed | cancelled), elapsed time, log tail and, once finished, its parsed JSON result in out. No jobId lists every job this server started. Skill: check-changes.",
    inputSchema: { type: "object", additionalProperties: false, properties: { jobId: { type: "string" }, dryRun: { type: "boolean" }, target: { type: "string", enum: ["local", "deploy"] }, url: { type: "string" } } },
  },
  {
    name: "apex_job_cancel",
    week: 7,
    kind: "tree",
    description: "Tree — stop a running background job: kills its process group (and the Chromium it launched) and releases the browser lock. Skill: check-changes.",
    inputSchema: { type: "object", additionalProperties: false, properties: { jobId: { type: "string" }, dryRun: { type: "boolean" }, target: { type: "string", enum: ["local", "deploy"] }, url: { type: "string" } }, required: ["jobId"] },
  },
  {
    name: "apex_ui_fit",
    week: 7,
    kind: "browser",
    description: "Browser (lock first) — layout geometry for ONE menu screen × viewport (× interface scale): clipped, offscreen, small taps, truncation, under-hardware, starved, deep scroll — as numbers, ~15 s. Full matrix: apex_job_start ui_matrix. Skill: ui-menu-a11y.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        screen: { type: "string", description: "layout-audit screen id (title, select, garage, settings, …)." },
        viewport: { type: "string", description: "Default ios-iphone-landscape. Ids: `node tools/ui/layout-audit.mjs --list` (a phone at 844x390 is ios-iphone-landscape-844)." },
        scale: { type: "number", minimum: 40, maximum: 200, description: "Interface size %, default 100." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["screen"],
    },
  },
  {
    name: "apex_ui_shot",
    week: 7,
    kind: "browser",
    description: "Browser (lock first) — PNG + structured DOM of ONE menu screen at one viewport (layout-audit --screen), ~15 s, with a thumbnail in the result. Every screen: apex_job_start ui_gallery. Skill: survey-ui-matrix.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        screen: { type: "string", description: "A screen id from `node tools/ui/layout-audit.mjs --list` (title, select, garage, settings, …)." },
        viewport: { type: "string", description: "Default ios-iphone-landscape; ids from the same --list (a phone at 844x390 is ios-iphone-landscape-844)." },
        image: { type: "boolean", description: "Attach a JPEG thumbnail (default true)." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["screen"],
    },
  },
  {
    name: "apex_car_audit",
    week: 7,
    kind: "tree",
    description: "Tree — offline car checks, no browser: ladder (is any paid part dominated by a cheaper one, <1 s) or crest (team crest legibility, ~35 s; optional teams). parts_sweep / livery_contrast take minutes: apex_job_start. Skill: garage-parts-livery.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        check: { type: "string", enum: ["ladder", "crest"] },
        teams: { type: "array", items: { type: "string" }, maxItems: 12 },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["check"],
    },
  },
  {
    name: "apex_track_audit",
    week: 7,
    kind: "tree",
    description: "Tree — one circuit's offline health in one call (no browser): verify-track build guard + float-audit (~4 s); with `checks`, any of verify | float | clip | coplanar | props | ground against their baselines via track/audit-circuit.cjs (~16 s for all six). Confirm suspects with apex_track shots. Skill: survey-track.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        track: { type: "string" },
        checks: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", enum: ["verify", "float", "clip", "coplanar", "props", "ground"] }, description: "Which audits to run (audit-circuit.cjs); omit for the verify + float pair." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["track"],
    },
  },
  {
    name: "apex_unit_test",
    week: 8,
    kind: "tree",
    description: "Tree — `node --test` of ONE file under tests/unit/ (seconds, no browser): the check eight skills run every session. `pattern` is --test-name-pattern. Not for tests/specs (browser groups go through test-bg). Skill: check-changes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        file: { type: "string", description: "tests/unit/<name>.test.mjs (the path as the repo spells it)." },
        pattern: { type: "string", description: "Only tests whose name matches this regex (--test-name-pattern)." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
      required: ["file"],
    },
  },
];

function badArgs(message, fix) {
  throw Object.assign(new Error(message), {
    refuse: refuse("bad_args", message, fix || "See the tool inputSchema."),
  });
}

function assertSafeOut(raw) {
  const s = String(raw || "");
  if (!s) badArgs("empty output path", "Pass a path under artifacts/ or scratch/.");
  const resolved = path.resolve(ROOT, s);
  const ok = [ARTIFACTS_DIR, SCRATCH_DIR].some((base) => {
    const rel = path.relative(base, resolved);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  if (!ok) {
    throw Object.assign(new Error("path_escaped"), {
      refuse: refuse(
        "path_escaped",
        `output path must stay under artifacts/ or scratch/ (got ${s})`,
        "Pass a repo-relative path under artifacts/ or scratch/.",
      ),
    });
  }
  // The final file may not exist yet. Resolve its nearest existing ancestor
  // so a directory (or existing file) symlink cannot turn a lexical in-tree
  // path into an out-of-tree write. Never create directories during preflight.
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) {
    try {
      fs.lstatSync(ancestor); // a dangling symlink is not a missing directory
      badArgs(`output path has an unresolved symlink: ${s}`);
    } catch (e) {
      if (e.refuse) throw e;
      if (e.code !== "ENOENT") throw e;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) badArgs(`cannot resolve output path: ${s}`);
    ancestor = parent;
  }
  const real = path.join(fs.realpathSync(ancestor), path.relative(ancestor, resolved));
  const realInside = [ARTIFACTS_DIR, SCRATCH_DIR].some((base) => {
    let realBase;
    try { realBase = fs.realpathSync(base); } catch { realBase = base; }
    const rel = path.relative(realBase, real);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  if (!realInside) throw Object.assign(new Error("path_escaped"), {
    refuse: refuse("path_escaped", `output symlink escapes artifacts/ or scratch/ (got ${s})`, "Use an output directory inside the permitted roots."),
  });
  return resolved;
}

function underScratchOrArtifacts(resolved) {
  return [ARTIFACTS_DIR, SCRATCH_DIR].some((base) => {
    const rel = path.relative(base, resolved);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
}

/** An INPUT file the wrapped CLI will read: it must be a real file under
 *  artifacts/ or scratch/, and still be there once symlinks are resolved. */
function assertSafeIn(raw, what) {
  const s = String(raw || "");
  if (!s) badArgs(`empty ${what} path`, "Pass a path under artifacts/ or scratch/.");
  const escaped = () => {
    throw Object.assign(new Error("path_escaped"), {
      refuse: refuse(
        "path_escaped",
        `${what} must be a file under artifacts/ or scratch/ (got ${s})`,
        "Copy the file into scratch/ and pass its repo-relative path.",
      ),
    });
  };
  const resolved = path.resolve(ROOT, s);
  if (!underScratchOrArtifacts(resolved)) escaped();
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    badArgs(`${what} not found: ${s}`, "Write the file under scratch/ first.");
  }
  const realBases = [ARTIFACTS_DIR, SCRATCH_DIR].map((b) => { try { return fs.realpathSync(b); } catch { return b; } });
  const inside = realBases.some((base) => {
    const rel = path.relative(base, real);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
  if (!inside) escaped();
  if (!fs.statSync(real).isFile()) badArgs(`${what} is not a file: ${s}`, "Pass a shot-list JSON file.");
  return real;
}

let circuitIds = null;
function knownCircuits() {
  if (!circuitIds) circuitIds = require(path.join(ROOT, "tools/manifest.cjs")).CIRCUITS.slice();
  return circuitIds;
}

// The same schemas are published and enforced. Keep bounds at the wrapper
// seam: malformed input must fail before occupancy checks or expensive boots.
for (const tool of CATALOG) {
  const schema = tool.inputSchema;
  schema.additionalProperties = false;
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (spec.type === "string") spec.maxLength = key === "expr" ? 65536 : 4096;
    if (spec.type === "array") spec.maxItems = 256;
  }
  if (schema.properties.track) schema.properties.track.enum = knownCircuits();
}
const schemaFor = (name) => CATALOG.find((t) => t.name === name).inputSchema;
const bound = (name, key, extra) => Object.assign(schemaFor(name).properties[key], extra);
schemaFor("apex_select_specs").required = ["since"];
schemaFor("apex_graph_parity").required = ["base"];
schemaFor("apex_graph_parity").anyOf = [{ required: ["id"] }, { required: ["all"], properties: { all: { const: true } } }];
schemaFor("apex_frame_report").required = ["track"];
bound("apex_graph_parity", "id", { enum: knownCircuits() });
bound("apex_pick_tests", "files", { items: { type: "string", minLength: 1, maxLength: 4096 } });
bound("apex_select_specs", "budgetMin", { exclusiveMinimum: 0, maximum: 120 });
bound("apex_shot", "frac", { minimum: 0, maximum: 1 });
bound("apex_shot", "cam", { enum: ["park", "eye", "orbit", "cinematic", "trackside"] });
bound("apex_shot", "dist", { exclusiveMinimum: 0, maximum: 10000 });
bound("apex_shot", "az", { minimum: -36000, maximum: 36000 });
bound("apex_shot", "el", { minimum: -90, maximum: 90 });
bound("apex_shot", "side", { enum: [-1, 1] });
bound("apex_track", "dist", { exclusiveMinimum: 0, maximum: 10000 });
bound("apex_track", "az", { minimum: -36000, maximum: 36000 });
bound("apex_track", "el", { minimum: -90, maximum: 90 });
bound("apex_track", "h", { minimum: -100, maximum: 3000 });
bound("apex_shot_survey", "track", { enum: knownCircuits() });
bound("apex_shot_survey", "tracks", { maxItems: 12 });
bound("apex_shot_survey", "count", { type: "integer", minimum: 1, maximum: 32 });
bound("apex_shot_survey", "fracs", { maxItems: 32 });
bound("apex_shot_survey", "shots", { maxItems: 32 });
bound("apex_shot_survey", "dist", { exclusiveMinimum: 0, maximum: 10000 });
bound("apex_shot_survey", "el", { minimum: -90, maximum: 90 });
bound("apex_shot_survey", "gl", { enum: ["llvmpipe", "swiftshader"] });
bound("apex_agent", "at", { minimum: 0, maximum: 1 });
bound("apex_agent", "speed", { minimum: 0, maximum: 300 });
bound("apex_agent", "lateral", { minimum: -10000, maximum: 10000 });
bound("apex_agent", "radius", { minimum: 0, maximum: 10000 });
bound("apex_agent", "limit", { type: "integer", minimum: 0, maximum: 1000 });
bound("apex_agent", "seconds", { minimum: 0, maximum: 120 });
bound("apex_agent", "command", { enum: ["help", "world", "track", "field", "atmosphere", "objective", "describe", "query", "scene", "render", "rollout", "car", "visible", "frame", "plan", "survey", "model"] });
bound("apex_agent", "weather", { enum: ["dry", "wet", "rain", "overcast", "fog"] });
for (const name of ["apex_agent", "apex_shot"]) bound(name, "tod", { enum: ["dawn", "day", "dusk", "night"] });
bound("apex_garage", "seat", { type: "integer", enum: [0, 1] });
bound("apex_garage", "frame", { anyOf: [{ type: "string", maxLength: 4096 }, { type: "object" }] });
bound("apex_garage", "diff", { minItems: 2, maxItems: 2, items: { type: "string", maxLength: 4096 } });
bound("apex_frame_report", "u", { minItems: 1, maxItems: 64, items: { type: "number", minimum: 0, maximum: 1 } });
bound("apex_frame_report", "frames", { minimum: 1, maximum: 120 });
for (const name of ["apex_hud_shot", "apex_hud_survey"]) bound(name, "frac", { minimum: 0, maximum: 1 });
for (const k of ["hudScale", "uiScale", "btnScale"]) bound("apex_hud_shot", k, { minimum: HUD_SCALES[k][0], maximum: HUD_SCALES[k][1] });
bound("apex_hud_shot", "off", { maxItems: 14 });
bound("apex_hud_survey", "shard", { maxLength: 5 });
bound("apex_hud_shot", "preset", { anyOf: [{ type: "string", enum: Object.keys(HUD_PRESETS) }, { type: "object" }] });
bound("apex_hud_survey", "only", { maxItems: 32, items: { type: "string", minLength: 1, maxLength: 80 } });
bound("apex_hud_survey", "matrix", { minLength: 1, maxLength: 1024 });

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function validateValue(value, schema, label) {
  if (schema.anyOf) {
    const fits = schema.anyOf.some((part) => { try { validateValue(value, part, label); return true; } catch { return false; } });
    if (!fits) badArgs(`${label} must match one of the advertised types`);
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) badArgs(`${label} must equal ${JSON.stringify(schema.const)}`);
  const type = schema.type;
  const validType = !type || (type === "object" ? isObject(value)
    : type === "array" ? Array.isArray(value)
    : type === "integer" ? Number.isInteger(value)
    : type === "number" ? typeof value === "number" && Number.isFinite(value)
    : typeof value === type);
  if (!validType) badArgs(`${label} must be ${type}`);
  if (schema.enum && !schema.enum.includes(value)) badArgs(`${label} must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) badArgs(`${label} must be finite`);
    if (schema.minimum != null && value < schema.minimum || schema.maximum != null && value > schema.maximum
        || schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) {
      badArgs(`${label} outside permitted range ${schema.minimum ?? `>${schema.exclusiveMinimum}`}..${schema.maximum ?? "unbounded"}`);
    }
  }
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength || schema.maxLength != null && value.length > schema.maxLength) badArgs(`${label} has invalid length`);
    if (/[\u0000-\u001f]/.test(value) && label !== "expr") badArgs(`${label} contains control characters`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems || schema.maxItems != null && value.length > schema.maxItems) badArgs(`${label} must have ${schema.minItems ?? 0}..${schema.maxItems ?? "unbounded"} items`);
    if (schema.items) value.forEach((item, i) => validateValue(item, schema.items, `${label}[${i}]`));
  }
  if (isObject(value)) {
    for (const key of schema.required || []) if (!(key in value)) badArgs(`${label === "arguments" ? "tool" : label} needs ${key}`);
    for (const [key, child] of Object.entries(value)) {
      const spec = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : null;
      if (!spec && schema.additionalProperties === false) badArgs(`unknown argument ${key}`);
      if (spec) validateValue(child, spec, key);
    }
  }
}

function validateArgs(tool, args) {
  validateValue(args, tool.inputSchema, "arguments");
  // These values reach CLI parsers as positional names or option values.
  // shell:false prevents shell injection; it does not prevent flag injection.
  for (const key of ["since", "base", "track", "id", "command", "detail", "what", "team", "livery"]) {
    if (typeof args[key] === "string" && args[key].startsWith("-")) badArgs(`${key} may not start with a CLI flag`);
  }
  if (typeof args.expr === "string" && args.expr.startsWith("--")) badArgs("expr may not start with a CLI flag");
  for (const file of args.files || []) if (file.startsWith("-")) badArgs("files must be paths, not CLI flags");
}

/** apex_frame_report argv. Every value is validated here; nothing the caller
 *  passes reaches the CLI as a free-form flag. */
function frameReportArgv(args) {
  const track = args.track == null ? "" : String(args.track);
  if (!track) badArgs("apex_frame_report needs track", 'Pass {"track":"monza"} — a Tracks.LIST id.');
  if (!knownCircuits().includes(track)) {
    badArgs(`unknown track ${track}`, `Tracks.LIST ids: ${knownCircuits().join(", ")}.`);
  }
  const argv = [...nodeTool("shot/frame-report.mjs"), "--track", track];
  const hasU = args.u != null, hasFrames = args.frames != null;
  if (hasU && hasFrames) badArgs("pass u or frames, not both", 'Either {"u":[0.1,0.5]} or {"frames":12}.');
  if (hasU) {
    if (!Array.isArray(args.u) || !args.u.length || args.u.length > 64) {
      badArgs("u must be a non-empty array of at most 64 numbers", 'Pass {"u":[0.25,0.5]}.');
    }
    for (const v of args.u) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
        badArgs(`u values must be numbers in 0..1 (got ${JSON.stringify(v)})`, "The flyby runs u = 0 → 1.");
      }
    }
    argv.push(`--u=${args.u.join(",")}`);
  }
  if (hasFrames) {
    const n = args.frames;
    if (!Number.isInteger(n) || n < 1 || n > 120) badArgs(`frames must be an integer 1..120 (got ${JSON.stringify(n)})`);
    argv.push(`--frames=${n}`);
  }
  if (args.shots != null && args.shots !== "") {
    const file = assertSafeIn(args.shots, "shots");
    if (path.extname(file).toLowerCase() !== ".json") badArgs("shots must be a JSON data file; JavaScript is not permitted by this read-only tool");
    if (fs.statSync(file).size > 1024 * 1024) badArgs("shots JSON exceeds 1 MiB");
    let shots;
    try { shots = JSON.parse(fs.readFileSync(file, "utf8")); } catch { badArgs("shots must contain valid JSON data"); }
    if (!Array.isArray(shots)) badArgs("shots JSON must contain a shot-list array");
    if (shots.length > 256) badArgs("shots JSON must have at most 256 entries");
    const invalid = shots.length ? shotErrors(shots) : [];
    if (invalid.length) badArgs(`shots JSON: ${invalid.join("; ")}`);
    argv.push("--shots", file);
  }
  if (args.json) argv.push("--json");
  return argv;
}

// ── apex_hud_shot / apex_hud_survey: tools/shot/hud-survey.mjs ────────────
// Every knob is an enum or a bounded number in the published schema; the two
// free-form inputs (inline offsets, a matrix file) are validated here with
// the CLI's own pure validators, so a bad cell fails before any lock or boot.
const HUD_TOOL = "shot/hud-survey.mjs";
const HUD_KNOB_FLAGS = [["profile", "--profile"], ["layout", "--layout"], ["map", "--map"], ["gaps", "--gaps"],
  ["theme", "--theme"], ["cvd", "--cvd"], ["contrast", "--contrast"], ["tyres", "--tyres"], ["mirror", "--mirror"], ["hud", "--hud"],
  ["presetSet", "--preset-set"], ["textSize", "--text-size"], ["tod", "--tod"], ["steer", "--steer"], ["profileLive", "--profile-live"],
  ["uiScale", "--ui-scale"], ["btnScale", "--btn-scale"]];
const hudStamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
function hudCommonArgv(args, kind) {
  const argv = [...nodeTool(HUD_TOOL), "--json"];
  if (args.track) argv.push("--track", String(args.track));
  if (args.frac != null) argv.push("--frac", String(args.frac));
  // The CLI pins three|webgl2 (apex26.gfxBackend); over MCP a cell silently
  // measured TLX whatever the caller meant until this flag (2026-10-05).
  if (args.backend) argv.push("--backend", String(args.backend));
  argv.push("--out", assertSafeOut(args.out || `artifacts/hud-survey/mcp-${kind}-${hudStamp()}`));
  return argv;
}
export function hudShotArgv(args) {
  const argv = hudCommonArgv(args, "shot");
  // --device and --cam always: one-cell mode is any cell flag, so the CLI can
  // never fall back to the quick matrix behind a single-shot tool.
  argv.push("--device", String(args.device || "desktop-1280"), "--cam", String(args.cam || "chase"));
  for (const [k, fl] of HUD_KNOB_FLAGS) if (args[k] != null) argv.push(fl, String(args[k]));
  if (args.hudScale != null) argv.push("--hud-scale", String(args.hudScale));
  if (Array.isArray(args.off) && args.off.length) argv.push("--off", [...new Set(args.off)].join(","));
  if (args.preset != null) {
    if (typeof args.preset === "string") argv.push("--preset", args.preset);
    else {
      let o;
      try { o = validateOffsets(args.preset); }
      catch (e) { badArgs(String(e.message), 'Pass {"preset":{"map":{"s":150}}} — HudLayout.ELEMENTS ids, x/y -50..50, s 50..200.'); }
      argv.push("--preset", JSON.stringify(o));
    }
  }
  return argv;
}
export function hudSurveyArgv(args) {
  const argv = hudCommonArgv(args, "survey");
  const m = args.matrix == null || args.matrix === "" ? "quick" : String(args.matrix);
  let shard = null;
  if (args.shard != null && args.shard !== "") {
    try { shard = parseShard(args.shard); shardCells([], shard.i, shard.n); }
    catch (e) { badArgs(String(e.message), 'Pass {"shard":"2/8"}.'); }
  }
  // exhaustive is ~4 h on this container: one MCP call may not hold it.
  if (m === "exhaustive" && !shard) {
    badArgs("matrix exhaustive needs a shard (≈ 4 h unsharded)",
      'Pass {"matrix":"exhaustive","shard":"1/8"}, run the CLI in the background, or dispatch .github/workflows/hud-survey.yml.');
  }
  if (["quick", "full", "leads", "exhaustive"].includes(m)) argv.push("--matrix", m);
  else {
    const file = assertSafeIn(m, "matrix");
    if (path.extname(file).toLowerCase() !== ".json") badArgs("matrix must be quick, full or a .json file under scratch/ or artifacts/");
    if (fs.statSync(file).size > 1024 * 1024) badArgs("matrix JSON exceeds 1 MiB");
    let spec;
    try { spec = JSON.parse(fs.readFileSync(file, "utf8")); } catch { badArgs("matrix must contain valid JSON"); }
    try { expandMatrix(spec); }
    catch (e) { if (e instanceof CellError) badArgs(`matrix: ${e.message}`); throw e; }
    argv.push("--matrix", file);
  }
  if (Array.isArray(args.only) && args.only.length) {
    for (const s of args.only) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(s)) badArgs(`only entries are cell-id substrings [a-z0-9._-] (got ${JSON.stringify(s)})`);
    }
    argv.push("--only", args.only.join(","));
  }
  if (shard) argv.push("--shard", `${shard.i}/${shard.n}`);
  if (args.noShots) argv.push("--no-shots");
  return argv;
}
/** Budget: twice the CLI's own estimate for the named matrix (+ 5 min), capped at 90 min. */
const HUD_TIMEOUT_MS = (name, args) => {
  if (name === "apex_hud_shot") return 420000;
  let est = 45;
  try {
    const m = args.matrix || "quick";
    if (["quick", "full", "leads", "exhaustive"].includes(m)) {
      let cells = expandMatrix(m, args.track ? { track: args.track } : {}).cells;
      if (args.shard) { const s = parseShard(args.shard); cells = shardCells(cells, s.i, s.n); }
      est = estimateMinutes(cells, { shots: !args.noShots });
    }
  } catch { /* the argv builder already validated; keep the default */ }
  return Math.min(90, est * 2 + 5) * 60000;
};

/** The CLI's --json summary → an MCP result: structuredContent, its serialized
 *  copy as the FIRST text block (cmdCall and older clients read content[0]),
 *  a human summary, and resource_links to the files on disk. */
export function hudResult(name, result, args = {}) {
  let body;
  try { body = JSON.parse(result.content[0].text); } catch { return result; }
  const sum = body.out;
  if (!sum || typeof sum !== "object" || !Array.isArray(sum.cells)) return result;
  const link = (rel, mimeType, description) => rel ? {
    type: "resource_link", uri: pathToFileURL(path.join(ROOT, rel)).href, name: path.basename(rel), mimeType, description,
  } : null;
  const line = (f) => `- [${f.severity}] ${f.kind} ${f.cell}: ${f.detail}`;
  const base = { ok: !!sum.ok && body.ok !== false, tool: name, mock: body.mock || undefined, argv: body.argv,
    durationMs: body.durationMs, counts: sum.counts, report: sum.report, findingsMd: sum.findingsMd, indexHtml: sum.indexHtml };
  let structured, text, links;
  if (name === "apex_hud_shot") {
    const c = sum.cells[0] || {};
    structured = { ...base, cell: c.id, shot: c.shot || null, lit: c.lit, state: c.state, error: c.error || null,
      findings: c.findings || [], measurements: c.measurements || [] };
    const fs1 = structured.findings;
    text = `${c.id}: ${fs1.length} finding(s)${c.error ? ` — cell error: ${c.error}` : ""}${c.shot ? ` — shot ${c.shot}` : ""}\n` + fs1.slice(0, 20).map(line).join("\n");
    links = [link(c.shot, "image/png", `HUD screenshot of ${c.id}`), link(sum.report, "application/json", "report.json (every box)")];
  } else {
    const all = sum.cells.flatMap((c) => c.findings || []);
    const top = all.slice().sort((a, b) => ({ high: 3, medium: 2, low: 1, info: 0 }[b.severity] - { high: 3, medium: 2, low: 1, info: 0 }[a.severity])).slice(0, 25);
    structured = { ...base, out: sum.out, sheets: sum.sheets || [],
      cells: sum.cells.map((c) => ({ id: c.id, shot: c.shot || null, findings: (c.findings || []).length, error: c.error || null })), top };
    text = `HUD survey (${sum.meta || args.matrix || "quick"}): ${sum.cells.length} cells, ${JSON.stringify(sum.counts)}\n` + top.map(line).join("\n");
    links = [link(sum.findingsMd, "text/markdown", "ranked findings"), link(sum.indexHtml, "text/html", "static gallery"),
      link(sum.report, "application/json", "report.json")];
  }
  const content = [{ type: "text", text: JSON.stringify(structured) }, { type: "text", text }, ...links.filter(Boolean)];
  if (name === "apex_hud_shot" && args.inlineImage && structured.shot) {
    try {
      const buf = fs.readFileSync(path.join(ROOT, structured.shot));
      if (buf.length <= 1.5 * 1024 * 1024) content.push({ type: "image", data: buf.toString("base64"), mimeType: "image/png" });
    } catch { /* the link still stands */ }
  }
  const out = { content, structuredContent: structured };
  if (!structured.ok) out.isError = true;
  return out;
}

/** APEX_MCP_MOCK: a canned CLI summary, run through the same hudResult. */
function hudMock(name, argv, args) {
  const out = argv[argv.indexOf("--out") + 1];
  const rel = path.relative(ROOT, out);
  const finding = { cell: "mock-cell", kind: "missing", elements: ["map"], detail: "map expected (MAP: ON) but hidden by display", severity: "high" };
  const cells = [{ id: "mock-cell", shot: path.join(rel, "shots", "mock-cell.png"), lit: 0.5, state: null, error: null,
    findings: [finding], measurements: [{ key: "tower", visible: true, hiddenBy: null, rect: [500, 8, 280, 50], minFontPx: 12 }] }];
  const summary = { ok: true, out: rel, report: path.join(rel, "report.json"), findingsMd: path.join(rel, "findings.md"),
    indexHtml: path.join(rel, "index.html"), sheets: [], counts: { total: 1, high: 1, medium: 0, low: 0, info: 0, byKind: { missing: 1 } },
    meta: name === "apex_hud_shot" ? "cell" : String(args.matrix || "quick"), cells };
  return hudResult(name, toolResult({ ok: true, mock: true, exit: 0, argv, stdout: "", stderr: "", out: summary, durationMs: 0 }), args);
}

function buildArgv(name, args) {
  switch (name) {
    case "apex_hud_shot":
      return hudShotArgv(args);
    case "apex_hud_survey":
      return hudSurveyArgv(args);
    case "apex_doctor":
      return [...nodeTool("check/doctor.mjs"), "--tree", "--json"];
    case "apex_frame_report":
      return frameReportArgv(args);
    case "apex_verify_change_fast": {
      const argv = [...nodeTool("ci/verify-change.mjs"), "--fast", "--json"];
      if (args.since) argv.push("--since", String(args.since));
      if (args.staged) argv.push("--staged");
      return argv;
    }
    case "apex_pick_tests": {
      const argv = [...nodeTool("ci/pick-tests.mjs"), "--json"];
      if (args.since) argv.push("--since", String(args.since));
      if (args.staged) argv.push("--staged");
      if (Array.isArray(args.files)) {
        for (const f of args.files) argv.push(String(f));
      }
      return argv;
    }
    case "apex_bump_cache_check": {
      const argv = [...nodeTool("ci/bump-cache.mjs"), "--check", "--json"];
      if (args.since) argv.push("--since", String(args.since));
      return argv;
    }
    case "apex_unit_test": {
      const file = String(args.file || "");
      if (!/^tests\/unit\/[A-Za-z0-9_.-]+\.test\.mjs$/.test(file)) badArgs(`apex_unit_test: file must be tests/unit/<name>.test.mjs (got "${file}")`, "Name one unit file, e.g. tests/unit/hud-layout.test.mjs.");
      if (!fs.existsSync(path.join(ROOT, file))) badArgs(`apex_unit_test: ${file} does not exist`, "ls tests/unit/ for the file's name.");
      const argv = [process.execPath, "--test"];
      if (args.pattern != null && args.pattern !== "") {
        const pat = String(args.pattern);
        if (pat.length > 200 || /[\u0000-\u001f]/.test(pat)) badArgs("apex_unit_test: pattern must be a short regex", "Keep --test-name-pattern under 200 printable characters.");
        argv.push("--test-name-pattern", pat);
      }
      argv.push(file);
      return argv;
    }
    case "apex_eval": {
      const argv = [...nodeTool("shot/apex-eval.mjs"), String(args.track || "monza"), String(args.expr || "a.info()")];
      if (args.raw) argv.push("--raw");
      if (args.vm && args.backend) badArgs("apex_eval: vm has no renderer, so backend means nothing there", "Drop `vm` or `backend`.");
      if (args.backend) argv.push("--backend", String(args.backend));
      if (args.vm) argv.push("--vm");
      return argv;
    }
    case "apex_shot": {
      const argv = [
        ...nodeTool("shot/shot.mjs"),
        String(args.track || "monza"),
        String(args.frac ?? 0.1),
        String(args.cam || "orbit"),
      ];
      if (args.out) {
        // shot.mjs's 4th positional is a FILE (`[out.png]`); a directory here
        // made it write a path with no extension and die 84 s later with
        // "unsupported mime type null" (measured 2026-10-05). Keep the CLI's
        // own default name inside the directory instead.
        const out = assertSafeOut(args.out);
        const track = String(args.track || "monza"), cam = String(args.cam || "orbit");
        argv.push(/\.png$/i.test(out) ? out : path.join(out, `${track}-${Math.round(Number(args.frac ?? 0.1) * 100)}-${cam}.png`));
      }
      if (args.az != null) argv.push("--az", String(args.az));
      if (args.el != null) argv.push("--el", String(args.el));
      if (args.dist != null) argv.push("--dist", String(args.dist));
      if (args.side != null) argv.push("--side", String(args.side));
      if (args.tod) argv.push("--tod", String(args.tod));
      if (args.hud) argv.push("--hud");
      return argv;
    }
    case "apex_agent": {
      const argv = [
        ...nodeTool("shot/agent.mjs"),
        String(args.track || "monza"),
        String(args.command || "world"),
      ];
      const flags = [
        ["detail", args.detail],
        ["at", args.at],
        ["speed", args.speed],
        ["lateral", args.lateral],
        ["what", args.what],
        ["id", args.id],
        ["radius", args.radius],
        ["limit", args.limit],
        ["seconds", args.seconds],
        ["weather", args.weather],
        ["tod", args.tod],
      ];
      for (const [k, v] of flags) {
        if (v != null && v !== "") argv.push(`--${k}`, String(v));
      }
      return argv;
    }
    case "apex_select_specs": {
      if (!args.since) {
        badArgs("apex_select_specs needs since", 'Pass {"since":"HEAD~1"} or a git ref.');
      }
      const argv = [...nodeTool("ci/select-specs.mjs"), "--since", String(args.since), "--json"];
      if (args.budgetMin != null) argv.push("--budget-min", String(args.budgetMin));
      return argv;
    }
    case "apex_rotate_markings_check":
      return [...nodeTool("track/rotate-markings.cjs"), "--check"];
    case "apex_graph_parity": {
      if (!args.base) {
        badArgs(
          "apex_graph_parity needs base",
          'Pass {"base":"HEAD~1","id":"monza"}. Never omit BASE — a clean tree would pass vacuously.',
        );
      }
      const argv = [...nodeTool("track/graph-parity.cjs")];
      if (args.all) argv.push("--all");
      else {
        if (!args.id) {
          badArgs("apex_graph_parity needs id or all=true", 'Pass {"base":"HEAD~1","id":"monza"}.');
        }
        argv.push(String(args.id));
      }
      return argv;
    }
    case "apex_session_status":
      return [...nodeTool("ci/session-status.mjs"), "--json"];
    case "apex_who_is_on_it": {
      const argv = [...nodeTool("ci/who-is-on-it.mjs"), "--json"];
      if (args.hours != null) {
        const h = Number(args.hours);
        if (!Number.isFinite(h) || h < 1 || h > 168) badArgs(`hours must be 1..168 (got ${JSON.stringify(args.hours)})`);
        argv.push("--hours", String(h));
      }
      if (args.noFetch) argv.push("--no-fetch");
      if (args.paths != null) {
        if (!Array.isArray(args.paths)) badArgs("paths must be an array of repo-relative paths");
        for (const p of args.paths) {
          // A path is a positional: one that starts with "-" would reach the
          // CLI as a flag, and --claim / --release write refs.
          if (typeof p !== "string" || !p || p.startsWith("-")) {
            badArgs(`paths must be repo-relative paths, not flags (got ${JSON.stringify(p)})`);
          }
          argv.push(p);
        }
      }
      return argv;
    }
    case "apex_ci_status": {
      const sha = args.sha == null || args.sha === "" ? "HEAD" : String(args.sha);
      if (sha !== "HEAD" && !/^[0-9a-f]{7,40}$/i.test(sha)) {
        badArgs(`sha must be 7–40 hex characters or HEAD (got ${sha})`, 'Pass {"sha":"e21bcf4"}.');
      }
      return [...nodeTool("ci/ci-watch.mjs"), "--once", "--sha", sha];
    }
    default:
      throw new Error(`no argv builder for ${name}`);
  }
}

function extraEnv(name, args) {
  if (name === "apex_graph_parity") return { BASE: String(args.base) };
  return {};
}

/** Split a CLI's stdout into its JSON result and the text before it.
 *  `out` is the whole stdout (any JSON value — apex_eval may print a bare
 *  number), else the LAST block that opens with `{` or `[` at column 0 and
 *  runs to the end (a text line, then pretty-printed JSON). The fallback
 *  takes only an object or array: a line-by-line scan returned `563.528` for
 *  apex_shot, an indented number from inside its JSON. `rest` is the stdout
 *  with that block removed — the JSON is never returned twice. */
export function splitOut(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return { out: null, rest: "" };
  const isDoc = (v) => v !== null && typeof v === "object";
  try { return { out: JSON.parse(text), rest: "" }; } catch { /* fall through */ }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!/^[{[]/.test(lines[i])) continue;
    try {
      const v = JSON.parse(lines.slice(i).join("\n"));
      if (isDoc(v)) return { out: v, rest: lines.slice(0, i).join("\n").trim() };
    } catch { /* an earlier opener may hold the whole block */ }
  }
  return { out: null, rest: text };
}
export function parseOut(stdout) { return splitOut(stdout).out; }

/** Run a CLI without blocking the server. spawnSync froze the whole process
 *  for a browser tool's 30–100 s: apex_status could not answer, and when a
 *  client gave up at its own 60 s limit the child ran on holding the lock, so
 *  the next call got lock_held (2026-10-03 re-test). The child leads its own
 *  process group so a timeout or a client's notifications/cancelled takes the
 *  Chromium it launched down with it. */
const running = new Set();   // a detached child must not outlive the server
process.on("exit", () => { for (const c of running) { try { process.kill(-c.pid, "SIGKILL"); } catch { /* gone */ } } });
export function runSpawn(argv, { timeoutMs = 90000, allowExit = null, env = {}, signal = null } = {}) {
  const started = Date.now();
  const [cmd, ...args] = argv;
  return new Promise((resolve) => {
    let stdout = "", stderr = "", spawnErr = null, stopped = null, settled = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, detached: true });
    } catch (e) { spawnErr = e; }
    // On a timeout or cancel: snapshot the WHOLE tree first (Playwright puts
    // Chromium in its own process group, so a group kill missed it and the
    // browser outlived the lock by ~7 s), kill it, and settle only once it is gone.
    let treeGone = null;
    const killTree = (why) => {
      if (!child || child.exitCode != null || stopped) return;
      stopped = why;
      treeGone = killTreeAndWait(processTree(child.pid));
    };
    const timer = setTimeout(() => killTree("timeout"), timeoutMs);
    const onAbort = () => killTree("cancelled");
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true }); }
    const finish = (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      const exit = code == null ? (sig ? 1 : 0) : code;
      // stdout carries only what `out` does not: returning the raw JSON beside
      // its parse doubled every result (apex_who_is_on_it reached 60 KB).
      const { out, rest } = splitOut(stdout);
      const body = {
        ok: exit === 0,
        exit,
        argv,
        env: Object.keys(env).length ? env : undefined,
        stdout: rest,
        stderr,
        out,
        durationMs: Date.now() - started,
      };
      if (spawnErr) {
        body.ok = false;
        body.error = "spawn_failed";
        body.message = String(spawnErr.message || spawnErr);
        body.fix = "Check node and that the CLI path exists under tools/.";
      } else if (stopped) {
        body.ok = false;
        body.error = stopped;
        body.message = stopped === "timeout"
          ? `stopped after ${Math.round(timeoutMs / 1000)} s (process group killed)`
          : "the client cancelled the call; the process group was killed";
        body.fix = stopped === "timeout" ? "Check apex_status for load, then retry." : "Retry when ready.";
      } else if (allowExit && allowExit.has(exit)) {
        body.ok = true;
      }
      const result = toolResult(body, { isError: !body.ok });
      if (treeGone) treeGone.then(() => resolve(result)); else resolve(result);
    };
    if (!child) return finish(null, null);
    running.add(child);
    child.on("close", () => running.delete(child));
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const cap = 8 * 1024 * 1024;
    child.stdout.on("data", (d) => { if (stdout.length < cap) stdout += d; });
    child.stderr.on("data", (d) => { if (stderr.length < cap) stderr += d; });
    child.on("error", (e) => { spawnErr = e; finish(null, null); });
    child.on("close", finish);
  });
}

/** rotate-markings --check prints text: one row per circuit whose start-line
 *  markings a rotation would move, then a count. Lift both into `out`. */
export function rotateReport(stdout) {
  const circuits = [];
  for (const l of String(stdout || "").split("\n")) {
    const m = /^(\S+)\s+shift\s+([\d.]+)% of lap\s+(\d+) turns(\s+\(sectors left alone\))?/.exec(l);
    if (m) circuits.push({ id: m[1], shiftPct: Number(m[2]), turns: Number(m[3]), sectorsLeftAlone: !!m[4] });
  }
  const n = /^(\d+) circuit file\(s\) would change/m.exec(String(stdout || ""));
  return { wouldChange: n ? Number(n[1]) : circuits.length, circuits };
}

/** ci-watch prints text: lift its terminal `= ci <verdict> (…)` line, and
 *  the per-job lines, into `out` so a caller need not regex stdout. */
export function ciVerdict(stdout) {
  const lines = String(stdout || "").split("\n").filter((l) => l.startsWith("[ci-watch]"));
  const term = lines.map((l) => /\]\s*= ci (\S+)\s*(.*)$/.exec(l)).filter(Boolean).pop();
  return {
    verdict: term ? term[1] : null,
    summary: term ? term[2].trim() : null,
    jobs: lines.filter((l) => !/\]\s*= ci /.test(l)).map((l) => l.replace(/^\[ci-watch\]\s*/, "")),
  };
}
async function withCiVerdict(pending) {
  const result = await pending;
  const body = JSON.parse(result.content[0].text);
  // The job lines and the verdict move into `out`; stdout keeps the raw text
  // only when nothing parsed (no token, API down) so the reason survives.
  if (!body.error) {
    body.out = ciVerdict(body.stdout);
    if (body.out.verdict) body.stdout = "";
  }
  result.content[0].text = JSON.stringify(body);
  return result;
}

function mockSuccess(name, argv, env = {}) {
  return toolResult({
    ok: true,
    mock: true,
    tool: name,
    exit: 0,
    argv,
    env: Object.keys(env).length ? env : undefined,
    stdout: JSON.stringify({ ok: true, mock: true, tool: name }),
    stderr: "",
    out: { ok: true, mock: true, tool: name },
    durationMs: 0,
  });
}

function statusNext(lock, playwright, loadavg) {
  const load = Array.isArray(loadavg) ? loadavg[0] : 0;
  if (lock?.held) {
    return {
      action: "wait",
      tool: "apex_status",
      reason: `browser lock held by ${lock.tool || "pid " + lock.pid}`,
      hint: "Wait for the owner to finish, or apex_job_status if it is a job; do not start a second browser apex_*.",
    };
  }
  if (playwright?.busy || playwright?.suite) {
    return {
      action: "wait",
      tool: "apex_status",
      reason: "Playwright suite or busy Chromium occupancy",
      hint: "Finish or stop the suite before apex_shot_survey / apex_track.",
    };
  }
  if (load >= 3) {
    return {
      action: "wait",
      tool: "apex_status",
      reason: `loadavg ${load.toFixed?.(2) ?? load} ≥ 3`,
      hint: "Box is busy; delay browser surveys (test-bg also refuses at this load).",
    };
  }
  return {
    action: "ready",
    tool: "apex_shot_survey",
    reason: "lock free; occupancy clear",
    hint: "e.g. apex_shot_survey {track, preset:\"quick\"} or multi-track async job via tracks[].",
  };
}
function handleStatus(args = {}) {
  if (args.dryRun) {
    return toolResult({
      ok: true,
      dryRun: true,
      argv: ["apex_status"],
      note: "read-only; does not take scratch/apex-browser.lock",
      knownGap: KNOWN_GAP,
    });
  }
  if (mockMode()) {
    const loadavg = os.loadavg();
    const lock = { held: false };
    const playwright = emptyPlaywright();
    return toolResult({
      ok: true,
      mock: true,
      lock,
      chromeDaemon: { up: false, port: null },
      testBg: { recorded: false, running: [] },
      playwright,
      loadavg,
      next: statusNext(lock, playwright, loadavg),
      knownGap: KNOWN_GAP,
    });
  }
  const chromePort = daemonPort();
  const lock = lockInfo();
  const playwright = playwrightLive();
  const loadavg = os.loadavg();
  return toolResult({
    ok: true,
    lock,
    chromeDaemon: { up: chromePort != null, port: chromePort },
    testBg: testBgStatus(),
    playwright,
    loadavg,
    next: statusNext(lock, playwright, loadavg),
    knownGap: KNOWN_GAP,
  });
}

function pinOk(name, argv) {
  if (name === "apex_verify_change_fast") {
    if (!argv.includes("--fast") || !argv.includes("--json") || argv.includes("--wait")) {
      return refuse(
        "pin_violated",
        "apex_verify_change_fast must be --fast --json and never --wait",
        "Do not pass wait; use dryRun to inspect argv.",
      );
    }
  }
  if (name === "apex_bump_cache_check") {
    if (argv.includes("--apply") || argv.includes("--at") || argv.includes("--merge")) {
      return refuse(
        "pin_violated",
        "apex_bump_cache_check never writes cache versions",
        "Use the bump-cache CLI directly when you intend --apply (last edit before commit).",
      );
    }
  }
  if (name === "apex_pick_tests" && argv.includes("--bg")) {
    return refuse(
      "pin_violated",
      "apex_pick_tests never passes --bg",
      "Run test-bg yourself from a shell after reading pick-tests JSON.",
    );
  }
  if (name === "apex_select_specs") {
    if (!argv.includes("--json") || !argv.includes("--since") || argv.includes("--bg")) {
      return refuse(
        "pin_violated",
        "apex_select_specs must be --since <ref> --json and never --bg",
        "Pass since. Run test-bg yourself after reading the selected spec list.",
      );
    }
  }
  if (name === "apex_rotate_markings_check") {
    if (!argv.includes("--check") || argv.includes("--write")) {
      return refuse(
        "pin_violated",
        "apex_rotate_markings_check is --check only — never --write",
        "Use the rotate-markings CLI directly when you intend --write (once per circuit).",
      );
    }
  }
  if (name === "apex_graph_parity") {
    if (argv.includes("--url") || !argv.some((a) => a.endsWith("graph-parity.cjs"))) {
      return refuse(
        "pin_violated",
        "apex_graph_parity must spawn graph-parity.cjs",
        "Pass base plus id or all=true.",
      );
    }
  }
  if (name === "apex_frame_report") {
    if (!argv.some((a) => a.endsWith("frame-report.mjs")) || !argv.includes("--track")
        || argv.some((a) => /^--(out|fleet|diff|pose|tracks)(=|$)/.test(a))) {
      return refuse(
        "pin_violated",
        "apex_frame_report is one circuit, read-only: --track, never --out / --fleet / --diff / --pose",
        "Run `node tools/shot/frame-report.mjs --fleet` / `--diff` from a shell for the fleet sweep.",
      );
    }
  }
  if (name === "apex_who_is_on_it" && (argv.includes("--claim") || argv.includes("--release"))) {
    return refuse(
      "pin_violated",
      "apex_who_is_on_it is read-only — never --claim / --release",
      "Run `node tools/ci/who-is-on-it.mjs --claim \"<text>\"` from a shell when you mean to claim.",
    );
  }
  if (name === "apex_ci_status" && (!argv.includes("--once") || argv.includes("--timeout") || argv.includes("--pages"))) {
    return refuse(
      "pin_violated",
      "apex_ci_status is one poll — --once, never a wait",
      "Arm a Monitor on `node tools/ci/ci-watch.mjs --sha <sha> --timeout 30` to watch a run.",
    );
  }
  if ((name === "apex_hud_shot" || name === "apex_hud_survey")
      && (!argv.some((a) => a.endsWith("hud-survey.mjs")) || !argv.includes("--json") || !argv.includes("--out")
        || argv.some((a) => /^--(plan|self-test|url)(=|$)/.test(a)))) {
    return refuse(
      "pin_violated",
      `${name} spawns hud-survey.mjs --json --out <dir>, never --plan / --self-test / --url`,
      "Run `node tools/shot/hud-survey.mjs --plan` or `--self-test` from a shell.",
    );
  }
  if (name === "apex_hud_shot" && !(argv.includes("--device") && argv.includes("--cam"))) {
    return refuse("pin_violated", "apex_hud_shot is one cell: --device and --cam always", "See the apex_hud_shot inputSchema.");
  }
  if (argv.includes("--url")) {
    return refuse(
      "pin_violated",
      "apex_* browser tools must not pass --url",
      "Omit url. Harness binds its own loopback port.",
    );
  }
  return null;
}

function dryRunBody(name, argv, env = {}) {
  return toolResult({
    ok: true,
    dryRun: true,
    exit: 0,
    argv,
    env: Object.keys(env).length ? env : undefined,
    stdout: "",
    stderr: "",
    out: name === "apex_verify_change_fast"
      ? { plan: true, note: "dryRun — no spawn; --fast --json only" }
      : null,
    durationMs: 0,
  });
}

// ── apex_garage: a persistent garage-angles --serve child ─────────────────
// One child per server process, one lock while it lives. Every op is one JSON
// line to its stdin and one JSON line back; the browser stays open between
// tool calls, which is the whole point — a look at a design costs a settle,
// not a boot. `open` is the only op that spawns; everything else refuses until
// it has. The child's `event` lines (watch re-shoots) ride along on the next
// reply as `events`.
const GARAGE_TOOL = "tools/shot/garage-angles.mjs";
let garage = null;
function garageArgv(args) {
  const argv = [process.execPath, path.join(ROOT, GARAGE_TOOL), "--serve",
    "--team", String(args.team || "mclaren"),
    "--out", assertSafeOut(args.out || "artifacts/garage-session")];
  if (args.fast) argv.push("--fast");
  if (args.livery) argv.push("--livery", String(args.livery));
  return argv;
}
function settleGarageReady(g, value) {
  if (g.readyTimer) clearTimeout(g.readyTimer);
  g.readyTimer = null;
  if (g.readyResolve) { const resolve = g.readyResolve; g.readyResolve = null; resolve(value); }
}
export function garageClose(reason) {
  if (!garage) return null;
  const g = garage;
  garage = null;
  g.failure = reason;
  settleGarageReady(g, null);
  for (const p of g.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`garage closed: ${reason}`)); }
  g.pending.clear();
  if (g.exited) releaseLock();
  else {
    try { g.child.stdin.end(); } catch { /* gone */ }
    g.killTimer = setTimeout(() => { try { g.child.kill("SIGTERM"); } catch { /* gone */ } }, 8000);
    g.killTimer.unref();
    // The child still owns its browser while it shuts down. The exit handler
    // releases the lock; the closed session cannot open another browser yet.
  }
  return { closed: true, reason, uptimeMs: Date.now() - g.started, shots: g.shots };
}
function garageOnLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!garage) return;
  if (msg.ready) { settleGarageReady(garage, msg); return; }
  if (msg.event) { garage.events.push(msg); return; }
  const p = garage.pending.get(msg.id);
  if (!p) return;
  garage.pending.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.shot) garage.shots++;
  p.resolve(msg);
}
function garageSend(cmd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = ++garage.seq;
    const timer = setTimeout(() => {
      if (garage) garage.pending.delete(id);
      reject(new Error(`garage: no reply to ${Object.keys(cmd).join("+")} within ${timeoutMs}ms`));
    }, timeoutMs);
    garage.pending.set(id, { resolve, reject, timer });
    garage.child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n");
  });
}
export async function garageOpen(args, { spawnChild = spawn, readyTimeoutMs = 180000 } = {}) {
  if (garage) {
    const st = await garageSend({ status: true }, 30000).catch((e) => ({ ok: false, error: e.message }));
    return toolResult({ ok: true, op: "open", alreadyOpen: true, argv: garage.argv, ...st });
  }
  const argv = garageArgv(args); // validate paths before taking ownership
  const busy = occupancyRefuse();
  if (busy) return busy;
  const took = acquireLock("apex_garage");
  if (took) return took;
  let child;
  try { child = spawnChild(argv[0], argv.slice(1), { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], env: process.env }); }
  catch (e) { releaseLock(); return refuse("garage_boot_failed", `garage spawn failed: ${e.message}`, "Check the garage CLI and Node executable."); }
  const g = garage = { child, argv, pending: new Map(), seq: 0, buf: "", events: [], started: Date.now(), shots: 0,
             readyResolve: null, readyTimer: null, killTimer: null, exited: false };
  const readiness = new Promise((resolve) => {
    g.readyResolve = resolve;
    g.readyTimer = setTimeout(() => settleGarageReady(g, null), readyTimeoutMs);
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    if (!garage || garage.child !== child) return;
    garage.buf += d;
    let i;
    while (garage && (i = garage.buf.indexOf("\n")) >= 0) {
      const line = garage.buf.slice(0, i);
      garage.buf = garage.buf.slice(i + 1);
      if (line.trim()) garageOnLine(line);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => log(`[garage] ${String(d).trim().slice(0, 400)}`));
  child.on("exit", (code, sig) => {
    g.exited = true;
    if (g.killTimer) clearTimeout(g.killTimer);
    if (garage === g) garageClose(`exit ${code ?? sig}`);
    else { settleGarageReady(g, null); releaseLock(); }
  });
  child.on("error", (e) => {
    if (!child.pid) g.exited = true; // a failed spawn emits error without exit
    if (garage === g) garageClose(`spawn: ${e.message}`);
  });
  const ready = await readiness;
  if (!ready || garage !== g || g.exited) {
    const why = garage === g ? garageClose(`not ready within ${readyTimeoutMs}ms`) : { reason: g.failure };
    return refuse("garage_boot_failed", "garage-angles --serve never reported ready", "Check loadavg and orphan Chromium (apex_status); see the server log.", why);
  }
  return toolResult({ ok: true, op: "open", argv, ...ready });
}
async function handleGarage(args = {}) {
  const op = String(args.op || "status");
  const gated = gateBrowserArgs(args);
  if (gated) return gated;
  try {
    if (args.dryRun) {
      const argv = op === "open" ? garageArgv(args) : garage ? garage.argv : null;
      return toolResult({ ok: true, dryRun: true, op, argv, command: op === "open" ? null : garageCommand(op, args), open: !!garage });
    }
    if (mockMode()) return mockSuccess("apex_garage", op === "open" ? garageArgv(args) : ["apex_garage", op]);
    if (op === "open") return await garageOpen(args);
  } catch (e) {
    if (e.refuse) return e.refuse;   // assertSafeOut: the out dir escaped artifacts/ or scratch/
    return refuse("bad_args", String(e.message || e), "See the apex_garage inputSchema.");
  }
  if (op === "close") {
    const g = garage;
    const why = garageClose("close");
    // The child still owns its browser while it shuts down and holds the browser lock until it exits: wait for that, so
    // the next browser tool does not hit lock_held (a software-GL Chromium took ~30 s). A slow child is reported, not waited on forever.
    let settled = true;
    if (g) {
      const deadline = Date.now() + 60000;
      while (!g.exited && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
      settled = !!g.exited;
    }
    return toolResult({ ok: true, op, ...(why || { closed: false, reason: "not open" }), ...(why ? { settled } : {}) });
  }
  if (!garage) return refuse("garage_not_open", "no garage session", 'Call apex_garage with {"op":"open","team":"ferrari"} first.');
  const cmd = garageCommand(op, args);
  try {
    const reply = await garageSend(cmd, 180000);
    const events = garage ? garage.events.splice(0) : [];
    return toolResult({ op, ...reply, events: events.length ? events : undefined }, { isError: reply.ok === false });
  } catch (e) {
    return refuse("garage_failed", String(e.message || e), "Retry; if the child died, op open again (apex_status shows the lock).");
  }
}
/** The JSON-line command for an op — every key the caller gave rides along, so
 *  {op:"shot", design:{…}, frame:"spineTop", name:"a"} is design → frame → shot. */
function garageCommand(op, args) {
  const cmd = {};
  if (args.team && op !== "open") cmd.team = String(args.team);
  if (args.seat != null) cmd.seat = Number(args.seat);
  if (args.livery && op !== "open") cmd.livery = String(args.livery);
  if (args.design && typeof args.design === "object") { cmd.design = args.design; if (args.base) cmd.base = String(args.base); }
  if (args.frame != null) cmd.frame = args.frame;
  if (op === "shot" || args.name) cmd.shot = args.name ? String(args.name) : true;
  if (Array.isArray(args.diff) && args.diff.length === 2) cmd.diff = args.diff.map(String);
  if (op === "sheet" || args.sheet) cmd.sheet = args.sheet ? String(args.sheet) : true;
  if (op === "reload") cmd.reload = true;
  if (op === "status") cmd.status = true;
  return cmd;
}
process.on("exit", () => { if (garage) garageClose("server exit"); });

function dispatch(name, args = {}, { signal = null } = {}) {
  if (typeof name !== "string") return refuse("bad_args", "tool name must be a string", "Use a name from tools/list.");
  if (!name.startsWith(PREFIX)) {
    return refuse(
      "bad_prefix",
      `tool name must start with ${PREFIX} (got ${name})`,
      "Use apex_* tools only. chrome_* is the chrome-devtools MCP; tinyfish is not attached.",
    );
  }
  const known = CATALOG.find((t) => t.name === name);
  if (!known) {
    return refuse(
      "unknown_tool",
      `unknown tool ${name}`,
      "list-tools for the apex_* catalog.",
    );
  }

  try { validateArgs(known, args); }
  catch (e) { return e.refuse || refuse("bad_args", String(e.message || e), "See the tool inputSchema."); }

  if (name === "apex_status") return handleStatus(args);
  if (name === "apex_garage") return handleGarage(args);   // async: a persistent child, not a spawnSync
  if (name === "apex_graph_parity" && args.all === true) {
    // Every circuit twice outlasts the 180 s cap (killed at ~46 of 52,
    // 2026-10-05): the whole fleet runs as a background job instead.
    const gate = gateTreeArgs(args);
    if (gate) return gate;
    const r = extras().handlers.apex_job_start(   // sync: returns the jobId at once
      { kind: "graph_parity_all", base: args.base, dryRun: args.dryRun });
    const body = JSON.parse(r.content[0].text);
    if (body.ok === false) return r;
    return toolResult({ ...body, routed: "apex_job_start graph_parity_all",
      hint: "all:true runs in the background: apex_job_status {jobId} until state is done; the verdict is in tail / log." });
  }
  if (Object.hasOwn(extras().handlers, name)) {
    const gate = toolKind(known) === "tree" ? gateTreeArgs(args) : gateBrowserArgs(args);
    if (gate) return gate;
    return extras().handlers[name](args, { signal });
  }

  const kind = toolKind(known);
  const gated = kind === "tree" ? gateTreeArgs(args) : gateBrowserArgs(args);
  if (gated) return gated;

  let argv;
  try {
    argv = buildArgv(name, args);
  } catch (e) {
    if (e.refuse) return e.refuse;
    return refuse("bad_args", String(e.message || e), "See the tool inputSchema.");
  }

  const pinned = pinOk(name, argv);
  if (pinned) return pinned;
  const env = extraEnv(name, args);

  if (args.dryRun) {
    if (kind === "browser" && !mockMode()) {
      const busy = occupancyRefuse();
      if (busy) return busy;
    }
    return dryRunBody(name, argv, env);
  }

  const hud = name === "apex_hud_shot" || name === "apex_hud_survey";
  if (mockMode()) return hud ? hudMock(name, argv, args) : mockSuccess(name, argv, env);

  if (hud && args.async !== false) {
    // Host MCP calls die at ~60–120 s; a cell is ~2 min and the quick matrix
    // ~10 min. Default to a background job (pinned argv above) unless async:false.
    const kind = name === "apex_hud_shot" ? "hud_shot" : "hud_survey";
    const r = extras().handlers.apex_job_start({ kind, [HUD_JOB_ARGV]: argv });   // sync: returns the jobId at once
    const body = JSON.parse(r.content[0].text);
    if (body.ok === false) return r;
    return toolResult({ ...body, routed: `apex_job_start ${kind}`, estimateMs: HUD_TIMEOUT_MS(name, args),
      hint: "Runs in the background: apex_job_status {jobId} until state is done; findings land in out / the log. async:false blocks instead." });
  }
  if (hud) {
    const took = acquireLock(name);
    if (took) return took;
    return runSpawn(argv, { timeoutMs: HUD_TIMEOUT_MS(name, args), env, signal })
      .then((r) => hudResult(name, r, args)).finally(releaseLock);
  }
  if (kind === "browser") {
    const took = acquireLock(name);
    if (took) return took;
    // Released when the child exits — after a cancel too, never while a
    // Chromium still runs.
    const run = runSpawn(argv, { timeoutMs: 180000, env, signal }).finally(releaseLock);
    // apex_shot: attach the frame as a thumbnail so the caller sees it in the
    // result (image:false opts out). The path is on shot.mjs's "wrote" line.
    if (name !== "apex_shot" || args.image === false) return run;
    return run.then(async (r) => {
      const m = /wrote (\S+\.png)/.exec(JSON.parse(r.content[0].text).stdout || "");
      if (r.isError || !m) return r;
      try { r.content.push(await extras().thumbBlock(m[1])); } catch (e) { log(`thumb failed: ${e.message}`); }
      return r;
    });
  }

  if (name === "apex_rotate_markings_check") {
    return runSpawn(argv, { timeoutMs: 180000, env, signal }).then((result) => {
      const body = JSON.parse(result.content[0].text);
      if (!body.error) { body.out = rotateReport(body.stdout); body.stdout = ""; }
      result.content[0].text = JSON.stringify(body);
      return result;
    });
  }
  if (name === "apex_ci_status") {
    // ci-watch exits: 0 green / no run, 1 red, 2 cancelled, 4 superseded, 124
    // still running — each a verdict, not a tool failure. 3 (no token / API down) is one.
    return withCiVerdict(runSpawn(argv, { timeoutMs: 60000, allowExit: new Set([0, 1, 2, 4, 124]), env, signal }));
  }
  const longTree = name === "apex_verify_change_fast"
    || name === "apex_rotate_markings_check" || name === "apex_graph_parity"
    || name === "apex_frame_report" || name === "apex_who_is_on_it";
  // verify-change --fast runs the node suites serially; measured >180 s on a
  // ~90-file diff (2026-10-05), where the cap killed it with no verdict. Ten
  // minutes is its ceiling; the host moves a long MCP call to the background.
  const timeoutMs = name === "apex_verify_change_fast" ? 600000 : longTree ? 180000 : 60000;
  // Classified non-zero: verify-change --fast exit 2 = verdict partial (fast
  // phase passed, remaining browser groups are not-run — never a tool crash).
  const allowExit = name === "apex_verify_change_fast" ? new Set([0, 2]) : null;
  return runSpawn(argv, { timeoutMs, allowExit, env, signal });
}

// Tool annotations (MCP 2025-06-18 ToolAnnotations). The spec's defaults are
// destructiveHint: true and openWorldHint: true, which misdescribe nearly every
// wrap here; derive honest hints from the catalog instead of restating them per
// tool. Clients treat these as untrusted hints, so they are self-description,
// not a permission boundary — the pins and the lock remain the real guards.
const NOT_READ_ONLY = new Set(["apex_job_start", "apex_job_cancel", "apex_verify_change_fast", "apex_graph_parity"]);
const DESTRUCTIVE = new Set(["apex_job_cancel"]);
const OPEN_WORLD = new Set(["apex_ci_status", "apex_who_is_on_it"]);
function toolAnnotations(entry) {
  const readOnly = toolKind(entry) === "tree" && !NOT_READ_ONLY.has(entry.name);
  return {
    title: "Apex 26 · " + entry.name.replace(/^apex_/, "").replace(/_/g, " "),
    readOnlyHint: readOnly,
    destructiveHint: DESTRUCTIVE.has(entry.name),
    idempotentHint: readOnly || DESTRUCTIVE.has(entry.name),
    openWorldHint: OPEN_WORLD.has(entry.name),
  };
}

// Every result body is the CLI's JSON summary (ok / error / message / fix /
// argv / durationMs / out) — toolResult mirrors it as structuredContent. The
// race-HUD pair adds the keys hudResult builds.
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
    message: { type: "string" },
    fix: { type: "string" },
    tool: { type: "string" },
    dryRun: { type: "boolean" },
    argv: { type: "array", items: { type: "string" } },
    durationMs: { type: "number" },
    out: {},
  },
  additionalProperties: true,
};
const HUD_RESULT_SCHEMA = {
  ...RESULT_SCHEMA,
  properties: {
    ...RESULT_SCHEMA.properties,
    counts: { type: "object" },
    report: { type: "string" },
    findingsMd: { type: "string" },
    indexHtml: { type: "string" },
    cell: { type: "string" },
    shot: { type: ["string", "null"] },
    findings: { type: "array" },
    measurements: { type: "array" },
    cells: { type: "array" },
    top: { type: "array" },
    sheets: { type: "array" },
  },
};
// Per-tool shapes, measured from real calls on 2026-10-05 (docs/notes/
// AGENT-SURFACE-SURVEY-2026-10-05.md §8). Every CLI wrap returns the runSpawn
// envelope {ok, exit, argv, stdout, stderr, out, durationMs}; `out` is the
// CLI's --json object (null when the CLI printed none). Nothing is `required`
// because a refusal body ({ok:false, error, message, fix}) and a dryRun body
// ({ok, dryRun, argv}) share the tool; `additionalProperties: true` because a
// CLI may grow a key before this map does. The test validates real results.
const CLI_RESULT_SCHEMA = {
  ...RESULT_SCHEMA,
  properties: { ...RESULT_SCHEMA.properties, exit: { type: "number" }, stdout: { type: "string" }, stderr: { type: "string" },
    out: { type: ["object", "null"] } },
};
const cliOut = (properties, type = ["object", "null"]) => ({
  ...CLI_RESULT_SCHEMA,
  properties: { ...CLI_RESULT_SCHEMA.properties, out: { type, properties, additionalProperties: true } },
});
const S = (type) => ({ type });
const OUTPUT_SCHEMAS = {
  apex_status: { type: "object", additionalProperties: true, properties: { ok: S("boolean"), lock: S("object"), chromeDaemon: S("object"),
    testBg: S("object"), playwright: S("object"), loadavg: S("array"), knownGap: S("object") } },
  apex_doctor: cliOut({ ok: S("boolean"), mode: S("string"), checks: S("array"), summary: S("object") }),
  apex_pick_tests: cliOut({ reason: S("string"), receipts: S("array"), unclaimed: S("array"), files: S("array"), groups: S("array") }),
  apex_select_specs: cliOut({ reason: S("string"), changed: S("number"), groups: S("array"), selected: S("array"), skipped: S("array"),
    shards: S("array"), cap: S("object"), testsSelected: S("number"), testsFit: S("number"), secSelected: S("number"), secFit: S("number") }),
  apex_session_status: cliOut({ at: S("string"), branch: S("string"), base: S("string"), upstream: S("string"), ahead: S("number"),
    behind: S("number"), unpushed: S("number"), sessions: S("array"), commits: S("array"), dirty: S("array"), logs: S("array"),
    live: S(["object", "null"]) }),
  apex_bump_cache_check: cliOut({ consistent: S("boolean"), mode: S("string"), tagCount: S("number"), assetMismatches: S("array"),
    shellBuild: S("number"), versionJson: S("number") }),
  apex_who_is_on_it: cliOut({ hours: S("number"), fetched: S("boolean"), branch: S("string"), live: S("array"), claims: S("array"),
    touched: S("array") }),
  apex_car_audit: cliOut({}, ["array", "null"]),
  apex_track_audit: { type: "object", additionalProperties: true, properties: { ok: S("boolean"), track: S("string"), verify: S("object"),
    float: S("object"), hint: S("string"), error: S("string"), message: S("string"), fix: S("string") } },
  apex_job_status: { type: "object", additionalProperties: true, properties: { ok: S("boolean"), jobs: S("array"), error: S("string"),
    message: S("string"), fix: S("string") } },
  apex_hud_shot: HUD_RESULT_SCHEMA,
  apex_hud_survey: HUD_RESULT_SCHEMA,
};
function toolOutputSchema(entry) {
  return OUTPUT_SCHEMAS[entry.name] || CLI_RESULT_SCHEMA;
}

function listTools() {
  return CATALOG.map((t) => ({
    name: t.name,
    title: toolAnnotations(t).title,
    description: t.description,
    inputSchema: t.inputSchema,
    outputSchema: toolOutputSchema(t),
    annotations: toolAnnotations(t),
  }));
}

function writeRpc(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function cmdHelp() {
  const tree = CATALOG.filter((t) => toolKind(t) === "tree").map((t) => `  ${t.name}`).join("\n");
  const browser = CATALOG.filter((t) => toolKind(t) === "browser").map((t) => `  ${t.name}`).join("\n");
  process.stdout.write(`apex-tools-mcp — wrap tools/ CLIs as apex_* MCP tools (${CATALOG.length} wraps)

Commands:
  help
  status
  list-tools
  call <apex_name> '<json>'
  smoke                 # repo wrapper shell probe (tools/mcp/mcp-smoke.mjs; no Chromium)
  serve                 # stdio MCP (.mcp.json → tools/mcp/apex-tools-mcp.sh serve)
  serve-http            # 127.0.0.1:3713 /mcp + /healthz (never 0.0.0.0)

Tree (no browser lock):
${tree}

Browser (harness Chromium; lock + occupancy first):
${browser}

Everything else is a plain tools/ CLI (tools/README.md) — the 2026-09 trim
dropped 18 wraps (verify-track, survey-track, carshot, wgx-shot, clip-audit,
coplanar-audit, startline-snap/-probe, …); run those CLIs directly. Two audits
came back on 2026-10-03: apex_track_audit (float-audit) and apex_car_audit.
Local working tree only — no github.io. Deploy checks: deploy-research subagent.
Mock: APEX_MCP_MOCK=1  Design: docs/research/APEX-TOOLS-MCP.md
`);
  return 0;
}

function cmdStatus() {
  const result = handleStatus({});
  const body = JSON.parse(result.content[0].text);
  process.stdout.write(JSON.stringify(body, null, 2) + "\n");
  return body.ok === false ? 1 : 0;
}

function cmdListTools() {
  process.stdout.write(JSON.stringify(listTools(), null, 2) + "\n");
  return 0;
}

async function cmdCall(name, argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (e) {
    log(`args must be JSON: ${e.message}`);
    return 2;
  }
  const result = await dispatch(name, args);
  const body = JSON.parse(result.content[0].text);
  process.stdout.write(JSON.stringify(body, null, 2) + "\n");
  if (garage) garageClose("call ended");   // a one-shot call cannot keep a session
  return result.isError ? 1 : 0;
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

let extrasInst = null;
/** apex_track / apex_job_* / apex_ui_* / apex_*_audit handlers (tools/mcp/apex-extras.mjs). */
function extras() {
  if (!extrasInst) {
    extrasInst = createExtras({ ROOT, toolResult, refuse, acquireLock, releaseLock, occupancyRefuse, assertSafeOut,
      knownCircuits, runSpawn, splitOut, log, mockMode });
  }
  return extrasInst;
}

// MCP resources: the references an agent reads before calling __apex hooks,
// served without booting anything.
const RESOURCES = [
  ["docs/DEBUG-HOOKS.md", "__apex dev API reference: every hook, its arguments and return shape."],
  ["docs/AGENT-SURFACE.md", "Which CLIs are wrapped as apex_*, their pins, and what stays CLI-only."],
  ["docs/research/APEX-TOOLS-MCP.md", "apex-tools MCP design, refuse table and measured history."],
].map(([rel, description]) => ({ uri: `file:///${rel}`, name: path.basename(rel), description, mimeType: "text/markdown", rel }));

/** tools/call requests still running, by JSON-RPC id, for notifications/cancelled. */
const inflight = new Map();

async function handleRpc(msg) {
  // MCP 2025-06-18 removed JSON-RPC batching. Reject arrays and primitive
  // envelopes without dereferencing them or terminating the shared server.
  // Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic
  if (!isObject(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string" || !msg.method) {
    return rpcError(null, -32600, "Invalid Request: expected a JSON-RPC 2.0 object; batches are not supported");
  }
  const hasId = Object.hasOwn(msg, "id");
  const mid = hasId ? msg.id : null;
  if (hasId && mid !== null && typeof mid !== "string" && !(typeof mid === "number" && Number.isFinite(mid))) {
    return rpcError(null, -32600, "Invalid Request: id must be a string, number or null");
  }
  if (Object.hasOwn(msg, "params") && !isObject(msg.params)) return rpcError(mid, -32602, "params must be an object");
  const method = msg.method;
  if (!hasId) {
    // notifications/cancelled: stop the call and send no response for it.
    // Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation
    if (method === "notifications/cancelled" && isObject(msg.params)) {
      const ctl = inflight.get(String(msg.params.requestId));
      if (ctl) { log(`cancelled request ${msg.params.requestId}: ${msg.params.reason || "no reason"}`); ctl.abort(); }
    }
    return null;
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: mid,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Local CLI wrap (apex_*). Skills say when; tools/ CLIs do the work; " +
          "this server pins safe flags. Map: docs/AGENT-SURFACE.md. " +
          "Tree = TRACK_VM / static, no lock. Browser = harness Chromium after " +
          "apex_status + lock. Never github.io (deploy-research subagent). " +
          "chrome_* is the chrome-devtools MCP. HTTP 127.0.0.1:3713 only.",
      },
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id: mid, result: { tools: listTools() } };
  }
  if (method === "tools/call") {
    const params = msg.params || {};
    if (typeof params.name !== "string" || !params.name) return rpcError(mid, -32602, "tools/call needs a string name");
    if (Object.hasOwn(params, "arguments") && !isObject(params.arguments)) return rpcError(mid, -32602, "tools/call arguments must be an object");
    const ctl = new AbortController();
    inflight.set(String(mid), ctl);
    try {
      const result = await dispatch(params.name, params.arguments ?? {}, { signal: ctl.signal });
      return ctl.signal.aborted ? null : { jsonrpc: "2.0", id: mid, result };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: mid,
        error: { code: -32000, message: String(e.message || e).slice(0, 2000) },
      };
    } finally {
      inflight.delete(String(mid));
    }
  }
  if (method === "resources/list") {
    return { jsonrpc: "2.0", id: mid, result: { resources: RESOURCES.map(({ rel, ...r }) => r) } };
  }
  if (method === "resources/read") {
    const res = RESOURCES.find((r) => r.uri === (msg.params && msg.params.uri));
    if (!res) return rpcError(mid, -32002, `Resource not found: ${msg.params && msg.params.uri}`);
    return { jsonrpc: "2.0", id: mid, result: { contents: [{ uri: res.uri, mimeType: res.mimeType, text: fs.readFileSync(path.join(ROOT, res.rel), "utf8") }] } };
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id: mid, result: {} };
  }
  return { jsonrpc: "2.0", id: mid, error: { code: -32601, message: `Method not found: ${method}` } };
}

function cmdServe() {
  const rl = require("readline").createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  const pending = new Set();
  let closing = false;
  const finish = () => {
    if (closing && !pending.size) { garageClose("stdio closed"); process.exitCode = 0; }
  };
  rl.on("line", (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      writeRpc(rpcError(null, -32700, "Parse error: body must be JSON"));
      return;
    }
    const task = handleRpc(msg).then((out) => { if (out) writeRpc(out); })
      .catch(() => writeRpc(rpcError(null, -32603, "Internal error")))
      .finally(() => { pending.delete(task); finish(); });
    pending.add(task);
  });
  rl.on("close", () => { closing = true; finish(); });
  return 0;
}

function sendHttpJson(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function cmdServeHttp() {
  const port = /^\d+$/.test(String(process.env.APEX_MCP_HTTP_PORT || ""))
    ? Number(process.env.APEX_MCP_HTTP_PORT)
    : HTTP_PORT_DEFAULT;
  const srv = http.createServer((req, res) => {
    const url = req.url || "/";
    if (req.method === "GET" && (url === "/healthz" || url.startsWith("/healthz?"))) {
      sendHttpJson(res, 200, {
        ok: true,
        name: SERVER_NAME,
        version: SERVER_VERSION,
        tools: CATALOG.length,
        bind: HTTP_HOST,
      });
      return;
    }
    if (req.method === "GET" && (url === "/tools" || url === "/mcp/tools")) {
      sendHttpJson(res, 200, { tools: listTools() });
      return;
    }
    if (req.method === "POST" && (url === "/mcp" || url === "/")) {
      const chunks = [];
      let bytes = 0;
      let oversized = false;
      req.on("data", (c) => {
        bytes += c.length;
        if (bytes > 1024 * 1024) {
          if (!oversized) sendHttpJson(res, 413, rpcError(null, -32600, "Request exceeds 1 MiB"));
          oversized = true;
          chunks.length = 0;
        } else if (!oversized) chunks.push(c);
      });
      req.on("end", () => {
        if (oversized) return;
        let msg;
        try {
          msg = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          sendHttpJson(res, 400, rpcError(null, -32700, "Parse error: body must be JSON-RPC"));
          return;
        }
        handleRpc(msg).then((out) => {
          if (!out) {
            res.writeHead(204);
            res.end();
            return;
          }
          sendHttpJson(res, 200, out);
        }).catch(() => sendHttpJson(res, 200, rpcError(null, -32603, "Internal error")));
      });
      return;
    }
    sendHttpJson(res, 404, { error: `no route ${req.method} ${url}` });
  });
  srv.listen(port, HTTP_HOST, () => {
    const addr = srv.address();
    const p = addr && typeof addr === "object" ? addr.port : port;
    log(`apex-tools-mcp http ${HTTP_HOST}:${p}`);
  });
  return 0;
}

function main(argv) {
  const cmd = argv[0] || "help";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") return cmdHelp();
  if (cmd === "status") return cmdStatus();
  if (cmd === "list-tools") return cmdListTools();
  if (cmd === "call") return cmdCall(argv[1], argv[2] || "{}");
  if (cmd === "smoke") {
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools/mcp/mcp-smoke.mjs"), ...argv.slice(1)], {
      stdio: "inherit",
      cwd: ROOT,
    });
    return r.status ?? 2;
  }
  if (cmd === "serve") return cmdServe();
  if (cmd === "serve-http") return cmdServeHttp();
  log(`unknown command: ${cmd}`);
  cmdHelp();
  return 2;
}

// Symlink entry points run; imports with synthetic argv paths stay inert.
let isEntryPoint = false;
if (process.argv[1]) {
  try { isEntryPoint = fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { /* An importing host may use a synthetic argv path. */ }
}
if (isEntryPoint) {

  Promise.resolve(main(process.argv.slice(2))).then((code) => {
    if (process.argv[2] !== "serve" && process.argv[2] !== "serve-http") process.exitCode = code;
  });
}
