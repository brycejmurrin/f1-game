// @doc Core contracts for frozen-source workflow experiments; imported by the server and fixture tests.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Lsp, callTool, TOOLS as LSP_TOOLS } from "./lsp-mcp.mjs";

export const TOOL_SCHEMAS = {
  read: { type: "object", additionalProperties: false, required: ["file"], properties: { file: { type: "string", minLength: 1 }, start: { type: "integer", minimum: 1 }, lines: { type: "integer", minimum: 1, maximum: 120 } } },
  rg: { type: "object", additionalProperties: false, required: ["pattern"], properties: { pattern: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } } },
  files: { type: "object", additionalProperties: false, properties: { path: { type: "string", minLength: 1 }, pattern: { type: "string" } } },
  probe: { type: "object", additionalProperties: false, required: ["files", "test"], properties: { files: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1 } }, setup: { type: "string" }, test: { type: "string", minLength: 1 } } },
};
export const ALL_TOOL_SCHEMAS = Object.freeze({ ...TOOL_SCHEMAS, ...Object.fromEntries(LSP_TOOLS.map(tool => [tool.name, tool.inputSchema])) });
export const PROBE_HELP = "probe.test is a script completion value. Use an expression or an IIFE such as (() => { ...; return value; })(); a top-level return is invalid.";
const ROOT_DIRS = new Set(["js", "types", "tests", "docs", "css"]);
const ROOT_FILES = new Set(["index.html", "controller.html"]);
const MAX_OUTPUT = 24_000;

const fail = message => Object.assign(new Error(message), { semantic: true });
function objectArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw fail(`${tool}: arguments must be an object`);
  const schema = ALL_TOOL_SCHEMAS[tool];
  if (!schema) throw fail(`unknown tool: ${tool}`);
  const unknown = Object.keys(args).filter(k => !Object.hasOwn(schema.properties, k));
  const missing = (schema.required || []).filter(k => !Object.hasOwn(args, k));
  if (unknown.length || missing.length) throw fail(`${tool}: ${[unknown.length && `unknown argument(s): ${unknown.join(", ")}`, missing.length && `missing required argument(s): ${missing.join(", ")}`].filter(Boolean).join("; ")}; accepted schema: ${JSON.stringify(schema)}`);
  for (const [key, value] of Object.entries(args)) {
    const rule = schema.properties[key], types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const actual = Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : value === null ? "null" : typeof value;
    if (rule.type && !types.includes(actual) && !(actual === "integer" && types.includes("number"))) throw fail(`${tool}.${key}: expected ${types.join(" or ")}, received ${actual}`);
    if (typeof value === "string" && rule.minLength && value.length < rule.minLength) throw fail(`${tool}.${key}: string is too short`);
    if (typeof value === "string" && rule.maxLength && value.length > rule.maxLength) throw fail(`${tool}.${key}: string is too long`);
    if (rule.enum && !rule.enum.includes(value)) throw fail(`${tool}.${key}: expected one of ${rule.enum.join(", ")}`);
    if (typeof value === "number" && (value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity))) throw fail(`${tool}.${key}: value is outside ${rule.minimum ?? "-Infinity"}..${rule.maximum ?? "Infinity"}`);
    if (Array.isArray(value) && (value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? Infinity))) throw fail(`${tool}.${key}: array length is outside ${rule.minItems ?? 0}..${rule.maxItems ?? "Infinity"}`);
    if (Array.isArray(value) && rule.items?.type) for (const item of value) if ((Array.isArray(item) ? "array" : typeof item) !== rule.items.type) throw fail(`${tool}.${key}: every item must be ${rule.items.type}`);
  }
  return args;
}
function normalized(value, label = "path") {
  if (typeof value !== "string" || !value) throw fail(`${label}: expected a non-empty repo-relative path`);
  if (path.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || value.split("/").some(p => p.startsWith("."))) throw fail(`${label}: traversal, absolute, backslash, and hidden paths are forbidden`);
  return value.replace(/^\.\//, "").replace(/\/+$/, "");
}
function allowed(rel) { const first = rel.split("/")[0]; return ROOT_DIRS.has(first) || (ROOT_FILES.has(rel) && !rel.includes("/")); }
function resolveAllowed(snapshot, tracked, value, { directory = false } = {}) {
  const rel = normalized(value);
  if (!allowed(rel)) throw fail(`path outside allowed source roots (js, types, tests, docs, css, index.html, controller.html): ${rel}`);
  const target = path.join(snapshot, rel);
  let real;
  try { real = fs.realpathSync(target); } catch { throw fail(`path does not exist: ${rel}`); }
  const base = fs.realpathSync(snapshot) + path.sep;
  if (!real.startsWith(base)) throw fail(`path escapes snapshot through a symlink: ${rel}`);
  const stat = fs.statSync(real);
  if (directory && !stat.isDirectory()) throw fail(`expected a directory: ${rel}`);
  if (!directory && !stat.isFile()) throw fail(`expected a file: ${rel}`);
  if (!directory && !tracked.has(rel)) throw fail(`file is not tracked in the recorded snapshot: ${rel}`);
  return { rel, real };
}
function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function diskFiles(root, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (next === ".git") continue;
    if (entry.isDirectory()) out.push(...diskFiles(root, next)); else out.push(next);
  }
  return out;
}
function blobOid(data, algorithm) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return crypto.createHash(algorithm).update(`blob ${body.length}\0`).update(body).digest("hex");
}
function clean(snapshot, manifest, objectFormat) {
  const disk = diskFiles(snapshot), tracked = new Set(manifest.keys()), extra = disk.find(f => !tracked.has(f));
  if (extra) throw fail(`snapshot source mutation detected; untracked or ignored file: ${extra}`);
  for (const [file, expected] of manifest) {
    const absolute = path.join(snapshot, file), stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) throw fail(`snapshot source mutation detected; missing tracked file: ${file}`);
    const mode = stat.isSymbolicLink() ? "120000" : stat.isFile() ? (stat.mode & 0o111 ? "100755" : "100644") : "other";
    if (mode !== expected.mode) throw fail(`snapshot source mutation detected; type or mode changed: ${file}`);
    if (stat.isSymbolicLink() && /^(js|types)\//.test(file)) {
      let real; try { real = fs.realpathSync(absolute); } catch { throw fail(`snapshot source dependency escape: broken symlink ${file}`); }
      if (!real.startsWith(fs.realpathSync(snapshot) + path.sep)) throw fail(`snapshot source dependency escape through symlink: ${file}`);
    }
    const now = blobOid(stat.isSymbolicLink() ? fs.readlinkSync(absolute) : fs.readFileSync(absolute), objectFormat);
    if (now !== expected.oid) throw fail(`snapshot source mutation detected; changed tracked file: ${file}`);
  }
}
function appendExclusive(file, row) { fs.appendFileSync(file, JSON.stringify(row) + "\n", { encoding: "utf8", flag: "a" }); }

export function createSnapshot({ repo, runDir, sha = "HEAD" }) {
  if (fs.existsSync(runDir)) throw fail(`run directory already exists; refusing to append or resume: ${runDir}`);
  const originalSha = git(repo, ["rev-parse", `${sha}^{commit}`]);
  fs.mkdirSync(runDir, { recursive: true });
  const snapshot = path.join(runDir, "source");
  try {
    execFileSync("git", ["worktree", "add", "--detach", snapshot, originalSha], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
    const objectFormat = git(snapshot, ["rev-parse", "--show-object-format"]);
    const records = execFileSync("git", ["ls-tree", "-rz", "HEAD"], { cwd: snapshot }).toString().split("\0").filter(Boolean);
    const entries = records.map(record => { const match = /^(\d+) blob ([0-9a-f]+)\t([\s\S]+)$/.exec(record); if (!match) throw Error(`unsupported tree entry: ${record}`); return { mode: match[1], oid: match[2], file: match[3] }; });
    const files = entries.map(x => x.file);
    const backendFile = fileURLToPath(new URL("./lsp-mcp.mjs", import.meta.url));
    const backendImplementation = { file: backendFile, sha256: crypto.createHash("sha256").update(fs.readFileSync(backendFile)).digest("hex") };
    fs.writeFileSync(path.join(runDir, "source-manifest.json"), JSON.stringify({ originalSha, backendImplementation, createdAt: new Date().toISOString(), files: entries }, null, 2) + "\n", { flag: "wx" });
    return { snapshot, originalSha, tracked: new Set(files), sourceManifest: new Map(entries.map(x => [x.file, x])), objectFormat };
  } catch (e) {
    try { execFileSync("git", ["worktree", "remove", "--force", snapshot], { cwd: repo, stdio: "ignore" }); } catch { /* creation may not have registered it */ }
    fs.rmSync(runDir, { recursive: true, force: true }); throw e;
  }
}

export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.workers) || !plan.workers.length) throw fail("plan.workers must be a non-empty array");
  const ids = new Set(), known = new Set([...Object.keys(TOOL_SCHEMAS), ...LSP_TOOLS.map(x => x.name)]);
  for (const w of plan.workers) {
    if (!w || !/^[a-z][a-z0-9_-]{0,63}$/.test(w.id || "") || ids.has(w.id)) throw fail(`invalid or duplicate worker id: ${w?.id}`); ids.add(w.id);
    if (!Number.isInteger(w.maxCalls) || w.maxCalls < 1 || w.maxCalls > 1000) throw fail(`worker ${w.id}: maxCalls must be 1..1000`);
    if (!Array.isArray(w.tools) || !w.tools.length || w.tools.some(t => !known.has(t))) throw fail(`worker ${w.id}: plan contains an unknown tool or empty tool list`);
  }
  return plan;
}

export class WorkflowHarness {
  constructor({ repo, runDir, plan, sha = "HEAD", lspCommand, requestTimeoutMs = 30_000, probeTimeoutMs = 1_000, createLsp, invokeLsp = callTool }) {
    validatePlan(plan);
    const planJson = JSON.stringify(plan, null, 2) + "\n";
    plan = JSON.parse(planJson);
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 100 || !Number.isFinite(probeTimeoutMs) || probeTimeoutMs < 1) throw fail("timeouts must be positive bounded numbers");
    this.repo = repo; this.runDir = runDir; this.plan = plan; this.requestTimeoutMs = requestTimeoutMs; this.probeTimeoutMs = probeTimeoutMs;
    const snap = createSnapshot({ repo, runDir, sha }); Object.assign(this, snap);
    this.lspCommand = lspCommand || path.join(repo, "node_modules/.bin/tsc");
    this.createLsp = createLsp || (() => new Lsp({ root: this.snapshot, cmd: this.lspCommand, idleMs: 60_000, timeout: this.requestTimeoutMs }));
    this.invokeLsp = invokeLsp;
    this.workers = new Map(); this.compilerTail = Promise.resolve(); this.stopped = false;
    try {
      for (const w of plan.workers) {
        const dir = path.join(runDir, "workers", w.id); fs.mkdirSync(dir, { recursive: true });
        this.workers.set(w.id, { spec: w, dir, seq: 0, reserved: 0, tail: Promise.resolve(), lsp: null, currentRpc: null });
      }
      fs.writeFileSync(path.join(runDir, "plan.json"), planJson, { flag: "wx" });
    } catch (e) {
      try { execFileSync("git", ["worktree", "remove", "--force", this.snapshot], { cwd: repo, stdio: "ignore" }); } catch { /* retain the original setup error */ }
      fs.rmSync(runDir, { recursive: true, force: true });
      throw e;
    }
  }
  async call({ id, tool, args }) {
    if (this.stopped) throw fail("run is stopped");
    const worker = this.workers.get(id); if (!worker) throw fail(`unknown worker id: ${id}`);
    if (this.invalidated) {
      const reason = `run permanently invalidated by source mutation: ${this.invalidated}`;
      appendExclusive(path.join(this.runDir, "rejected.jsonl"), { at: new Date().toISOString(), id, tool, args, reason });
      return { seq: null, error: true, errorCode: "run_invalidated", clipped: false, fullChars: reason.length, output: reason };
    }
    if (worker.reserved >= worker.spec.maxCalls) {
      const rejection = { at: new Date().toISOString(), id, tool, args, reason: `worker ${id} call budget exhausted (${worker.spec.maxCalls})` };
      appendExclusive(path.join(this.runDir, "rejected.jsonl"), rejection);
      return { seq: null, error: true, errorCode: "budget_exhausted", clipped: false, fullChars: rejection.reason.length, output: rejection.reason };
    }
    worker.reserved++;
    const isLsp = typeof tool === "string" && tool.startsWith("lsp_");
    const received = performance.now();
    const work = async () => {
      const started = performance.now(); let output = "", error = false, errorCode = null, rpc = [];
      try {
        if (!worker.spec.tools.includes(tool)) throw fail(`worker ${id} condition ${worker.spec.condition || "unnamed"} excludes tool ${tool}`);
        this.assertClean();
        args = objectArgs(tool, args ?? {});
        if (isLsp) {
          this.validateLspPaths(args);
          if (!worker.lsp) {
            worker.lsp = this.createLsp();
            const request = worker.lsp.request.bind(worker.lsp);
            worker.lsp.request = async (method, params) => { const at = performance.now(); try { return await request(method, params); } finally { worker.currentRpc?.push({ method, ms: performance.now() - at }); } };
          }
          worker.currentRpc = rpc;
          const result = await this.invokeLsp(worker.lsp, tool, args); output = result.content.map(x => x.text || "").join("\n"); error = !!result.isError; if (error) errorCode = "tool_error";
        } else output = this.local(tool, args);
        this.assertClean();
      } catch (e) { error = true; errorCode ||= this.invalidated ? "source_mutation" : e.semantic ? "invalid_request" : "execution_error"; output = String(e.message || e); }
      finally { worker.currentRpc = null; }
      const fullChars = output.length, clipped = fullChars > MAX_OUTPUT;
      if (clipped) output = output.slice(0, MAX_OUTPUT) + "\n[output clipped at 24000 characters; refine the request]";
      const row = { id, seq: ++worker.seq, condition: worker.spec.condition || null, tool, args, queueMs: started - received, ms: performance.now() - started, error, errorCode, clipped, fullChars, chars: output.length, bytes: Buffer.byteLength(output), rpc, output };
      appendExclusive(path.join(worker.dir, "transcript.jsonl"), row);
      return { seq: row.seq, error, errorCode, clipped, fullChars, output };
    };
    const queued = worker.tail.then(() => isLsp ? (this.compilerTail = this.compilerTail.then(work, work)) : work());
    worker.tail = queued.catch(() => {}); return queued;
  }
  assertClean() {
    if (this.invalidated) throw fail(`run permanently invalidated by source mutation: ${this.invalidated}`);
    try { clean(this.snapshot, this.sourceManifest, this.objectFormat); }
    catch (e) { this.invalidated ||= String(e.message || e); throw e; }
  }
  validateLspPaths(args) {
    if (args.file !== undefined) resolveAllowed(this.snapshot, this.tracked, args.file);
    if (args.path !== undefined) {
      const rel = normalized(args.path), target = path.join(this.snapshot, rel);
      let directory = false; try { directory = fs.statSync(target).isDirectory(); } catch { /* resolveAllowed supplies the diagnostic */ }
      resolveAllowed(this.snapshot, this.tracked, rel, { directory });
    }
  }
  local(tool, args) {
    if (tool === "read") {
      const { rel, real } = resolveAllowed(this.snapshot, this.tracked, args.file);
      if (args.start !== undefined && (!Number.isInteger(args.start) || args.start < 1)) throw fail("read.start must be a positive integer");
      if (args.lines !== undefined && (!Number.isInteger(args.lines) || args.lines < 1 || args.lines > 120)) throw fail("read.lines must be an integer from 1 through 120");
      const start = args.start ?? 1, count = args.lines ?? 50, lines = fs.readFileSync(real, "utf8").split("\n");
      let out = lines.slice(start - 1, start - 1 + count).map((line, i) => `${start + i}: ${line}`).join("\n");
      out += `\n[read ${rel}:${start}-${Math.min(lines.length, start + count - 1)} of ${lines.length}; maximum window 120 lines]`; return out;
    }
    if (tool === "rg") {
      if (typeof args.pattern !== "string" || !args.pattern) throw fail("rg.pattern must be a non-empty string");
      const scope = args.path ?? "js"; const target = resolveAllowed(this.snapshot, this.tracked, scope, { directory: fs.existsSync(path.join(this.snapshot, scope)) && fs.statSync(path.join(this.snapshot, scope)).isDirectory() });
      try { return execFileSync("rg", ["-n", "--max-count", "25", "--", args.pattern, target.rel], { cwd: this.snapshot, encoding: "utf8", timeout: this.requestTimeoutMs, maxBuffer: 1_000_000 }) + "[rg bounded to 25 matching lines per file and 24000 returned characters; more matches may exist]"; }
      catch (e) { if (e.status === 1) return "(no matches)\n[rg bounded to 25 matching lines per file]"; throw e; }
    }
    if (tool === "files") {
      const { rel: scope } = resolveAllowed(this.snapshot, this.tracked, args.path ?? "js", { directory: true });
      let files = [...this.tracked].filter(f => f === scope || f.startsWith(`${scope}/`));
      if (args.pattern !== undefined) { if (typeof args.pattern !== "string") throw fail("files.pattern must be a string"); let re; try { re = new RegExp(args.pattern); } catch (e) { throw fail(`files.pattern is not a valid regular expression: ${e.message}`); } files = files.filter(f => re.test(f)); }
      return files.sort().join("\n") + `\n[${files.length} tracked files returned]`;
    }
    if (tool === "probe") {
      if (!Array.isArray(args.files) || !args.files.length || args.files.length > 8) throw fail("probe.files must contain 1..8 js files");
      if (typeof args.test !== "string" || !args.test) throw fail(`probe.test must be non-empty JavaScript. ${PROBE_HELP}`);
      if (args.setup !== undefined && typeof args.setup !== "string") throw fail("probe.setup must be JavaScript text");
      const files = args.files.map(f => { const x = resolveAllowed(this.snapshot, this.tracked, f); if (!x.rel.startsWith("js/")) throw fail("probe files must be under js/"); return x; });
      const logs = [], context = vm.createContext({ console: { log: (...v) => logs.push(v.map(String).join(" ")), warn: (...v) => logs.push(v.map(String).join(" ")), error: (...v) => logs.push(v.map(String).join(" ")) }, performance: { now: () => 0 } });
      vm.runInContext("globalThis.window=globalThis", context, { timeout: this.probeTimeoutMs });
      if (args.setup) vm.runInContext(args.setup, context, { timeout: this.probeTimeoutMs, filename: "probe-setup.js" });
      for (const f of files) vm.runInContext(fs.readFileSync(f.real, "utf8"), context, { timeout: this.probeTimeoutMs, filename: f.rel });
      let result; try { result = vm.runInContext(args.test, context, { timeout: this.probeTimeoutMs, filename: "probe-test.js" }); }
      catch (e) { if (e instanceof SyntaxError || e?.name === "SyntaxError") throw fail(`${e.message}. ${PROBE_HELP}`); throw e; }
      return JSON.stringify({ logs, result: result ?? null });
    }
    throw fail(`unknown tool: ${tool}`);
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.stopped = true;
    await Promise.allSettled([...this.workers.values()].map(w => w.tail));
    for (const w of this.workers.values()) w.lsp?.stop();
    try { execFileSync("git", ["worktree", "remove", "--force", this.snapshot], { cwd: this.repo, stdio: "ignore" }); } catch { /* retain evidence if cleanup cannot complete */ }
    fs.writeFileSync(path.join(this.runDir, "stopped.json"), JSON.stringify({ stoppedAt: new Date().toISOString() }) + "\n", { flag: "wx" });
  }
}
