#!/usr/bin/env node
/**
 * @doc Repo MCP server: wraps a pinned subset of these CLIs as `apex_*` tools; tree (no lock) vs browser (lock).
 * @skill check-changes
 * apex-tools-mcp — wrap committed tools/ CLIs as MCP tools (apex_* only).
 *
 * One of the THREE .mcp.json servers (beside chrome-devtools and
 * playwright-official; catalog trimmed 7 → 3 and wraps 30 → 12 on 2026-09).
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
import { emptyPlaywright, scanPlaywrightLines } from "../ci/playwright-occupancy.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROTOCOL = "2025-06-18";
const SERVER_NAME = "apex-tools-mcp";
const SERVER_VERSION = "1.5.0";
const HTTP_HOST = "127.0.0.1";
const HTTP_PORT_DEFAULT = 3713;
const PREFIX = "apex_";
const LOCK_PATH = path.join(ROOT, "scratch", "apex-browser.lock");
const TEST_BG_STATE = path.join(ROOT, "artifacts", "logs", "test-bg.json");
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
    return { held: true, stale: true, error: "unreadable" };
  }
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

function acquireLock(tool) {
  const busy = occupancyRefuse();
  if (busy) return busy;
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const payload = { pid: process.pid, since: Date.now(), tool };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload));
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

function releaseLock() {
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
    description: "Tree — verify-change --fast --json (no browser groups). Never --wait. Skill: check-changes.",
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
    name: "apex_eval",
    week: 2,
    description: "Browser (lock first) — boot harness Chromium and evaluate one __apex expression. Local only, no --url. Skill: playwright-probe.",
    inputSchema: {
      type: "object",
      properties: {
        track: { type: "string" },
        expr: { type: "string" },
        raw: { type: "boolean" },
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
        tod: { type: "string" },
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
        frame: { description: "Station / alias / view name, or {view|station|cam, az, el, dist, target, lamp, zoom, pan, eye, look, clamp, crop}." },
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
    description: "Tree — TrackGraph vertex parity vs required git base. Never omit base. Skill: scenery-dress.",
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
  return resolved;
}

function buildArgv(name, args) {
  switch (name) {
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
    case "apex_eval": {
      const argv = [...nodeTool("shot/apex-eval.mjs"), String(args.track || "monza"), String(args.expr || "a.info()")];
      if (args.raw) argv.push("--raw");
      return argv;
    }
    case "apex_shot": {
      const argv = [
        ...nodeTool("shot/shot.mjs"),
        String(args.track || "monza"),
        String(args.frac ?? 0.1),
        String(args.cam || "orbit"),
      ];
      if (args.out) argv.push(assertSafeOut(args.out));
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
    default:
      throw new Error(`no argv builder for ${name}`);
  }
}

function extraEnv(name, args) {
  if (name === "apex_graph_parity") return { BASE: String(args.base) };
  return {};
}

function parseOut(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch { /* continue */ }
    }
    return null;
  }
}

function runSpawn(argv, { timeoutMs = 90000, allowExit = null, env = {} } = {}) {
  const started = Date.now();
  const [cmd, ...args] = argv;
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, ...env },
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  const exit = r.status == null ? (r.signal ? 1 : 0) : r.status;
  const body = {
    ok: exit === 0,
    exit,
    argv,
    env: Object.keys(env).length ? env : undefined,
    stdout,
    stderr,
    out: parseOut(stdout),
    durationMs,
  };
  if (r.error) {
    body.ok = false;
    body.error = "spawn_failed";
    body.message = String(r.error.message || r.error);
    body.fix = "Check node and that the CLI path exists under tools/.";
  } else if (allowExit && allowExit.has(exit)) {
    body.ok = true;
  }
  return toolResult(body, { isError: !body.ok });
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
    return toolResult({
      ok: true,
      mock: true,
      lock: { held: false },
      chromeDaemon: { up: false, port: null },
      testBg: { recorded: false, running: [] },
      playwright: emptyPlaywright(),
      loadavg: os.loadavg(),
      knownGap: KNOWN_GAP,
    });
  }
  const chromePort = daemonPort();
  return toolResult({
    ok: true,
    lock: lockInfo(),
    chromeDaemon: { up: chromePort != null, port: chromePort },
    testBg: testBgStatus(),
    playwright: playwrightLive(),
    loadavg: os.loadavg(),
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
function garageClose(reason) {
  if (!garage) return null;
  const g = garage;
  garage = null;
  for (const p of g.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`garage closed: ${reason}`)); }
  if (g.readyTimer) clearTimeout(g.readyTimer);
  try { g.child.stdin.end(); } catch { /* gone */ }
  const kill = setTimeout(() => { try { g.child.kill("SIGTERM"); } catch { /* gone */ } }, 8000);
  kill.unref();
  releaseLock();
  return { closed: true, reason, uptimeMs: Date.now() - g.started, shots: g.shots };
}
function garageOnLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!garage) return;
  if (msg.ready) { if (garage.readyResolve) garage.readyResolve(msg); return; }
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
async function garageOpen(args) {
  if (garage) {
    const st = await garageSend({ status: true }, 30000).catch((e) => ({ ok: false, error: e.message }));
    return toolResult({ ok: true, op: "open", alreadyOpen: true, argv: garage.argv, ...st });
  }
  const busy = occupancyRefuse();
  if (busy) return busy;
  const took = acquireLock("apex_garage");
  if (took) return took;
  const argv = garageArgv(args);
  const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], env: process.env });
  garage = { child, argv, pending: new Map(), seq: 0, buf: "", events: [], started: Date.now(), shots: 0,
             readyResolve: null, readyTimer: null };
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
  child.on("exit", (code, sig) => { if (garage && garage.child === child) garageClose(`exit ${code ?? sig}`); });
  child.on("error", (e) => { if (garage && garage.child === child) garageClose(`spawn: ${e.message}`); });
  const ready = await new Promise((resolve) => {
    garage.readyResolve = resolve;
    garage.readyTimer = setTimeout(() => resolve(null), 180000);
  });
  if (!ready) {
    const why = garageClose("not ready within 180s");
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
    const why = garageClose("close");
    return toolResult({ ok: true, op, ...(why || { closed: false, reason: "not open" }) });
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

function dispatch(name, args = {}) {
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

  if (name === "apex_status") return handleStatus(args);
  if (name === "apex_garage") return handleGarage(args);   // async: a persistent child, not a spawnSync

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

  if (mockMode()) return mockSuccess(name, argv, env);

  if (kind === "browser") {
    const took = acquireLock(name);
    if (took) return took;
    try {
      return runSpawn(argv, { timeoutMs: 180000, env });
    } finally {
      releaseLock();
    }
  }

  const longTree = name === "apex_verify_change_fast"
    || name === "apex_rotate_markings_check" || name === "apex_graph_parity";
  const timeoutMs = longTree ? 180000 : 60000;
  // Classified non-zero: verify-change --fast exit 2 = verdict partial (fast
  // phase passed, remaining browser groups are not-run — never a tool crash).
  const allowExit = name === "apex_verify_change_fast" ? new Set([0, 2]) : null;
  return runSpawn(argv, { timeoutMs, allowExit, env });
}

function listTools() {
  return CATALOG.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
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
dropped 18 wraps (verify-track, survey-track, carshot, wgx-shot, the audits,
startline, …); run those CLIs directly.
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

async function handleRpc(msg) {
  const mid = msg.id;
  const method = msg.method;
  if (method == null || mid == null) return null;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: mid,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
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
    try {
      return { jsonrpc: "2.0", id: mid, result: await dispatch(params.name || "", params.arguments || {}) };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: mid,
        error: { code: -32000, message: String(e.message || e).slice(0, 2000) },
      };
    }
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
  rl.on("line", (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    handleRpc(msg).then((out) => { if (out) writeRpc(out); });
  });
  rl.on("close", () => process.exit(0));
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
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let msg;
        try {
          msg = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          sendHttpJson(res, 400, { error: "body must be JSON-RPC" });
          return;
        }
        handleRpc(msg).then((out) => {
          if (!out) {
            res.writeHead(204);
            res.end();
            return;
          }
          sendHttpJson(res, 200, out);
        });
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

Promise.resolve(main(process.argv.slice(2))).then((code) => {
  if (process.argv[2] !== "serve" && process.argv[2] !== "serve-http") process.exitCode = code;
});
