#!/usr/bin/env node
// @doc Opt-in stdio JavaScript debugger MCP: attach, breakpoints, step, scopes; no browser launch.
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { DebugSession } from "./js-debugger-session.mjs";

const str = (description, maxLength = 4000) => ({ type: "string", minLength: 1, maxLength, description });
const integer = (description, minimum = 1, maximum = 1000000) => ({ type: "integer", minimum, maximum, description });
const endpoint = str("Loopback Chrome debugging origin, e.g. http://127.0.0.1:9222");
const token = str("Current pause.token from debugger_state; invalid after resume, step, reload or detach");
const expression = str("JavaScript expression", 16000);
const def = (name, description, properties = {}, required = [], readOnlyHint = false) => ({ name, description,
  inputSchema: { type: "object", properties, required, additionalProperties: false },
  annotations: { readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: true } });
export const TOOLS = [
  def("debugger_targets", "List targets in an already-running local Chrome (default pages; targetType service_worker|worker|all for sw.js and workers). No browser is launched.", { endpoint, targetType: { type: "string", enum: ["page", "service_worker", "worker", "all"] } }, ["endpoint"], true),
  def("debugger_attach", "Attach a page target by id. One session at a time; local HTTP repros/about:blank only. May pause JavaScript. endpoint may be omitted after debugger_targets.", { endpoint, targetId: str("Page id from debugger_targets") }, ["targetId"]),
  def("debugger_detach", "Remove owned breakpoints, reset exception pauses, resume, disable and detach. Reports cleanup failures; never closes the browser."),
  def("debugger_state", "Read current pause/stack/scopes and operation results. Reports `detached: target gone` after a lost target and `pageUnresponsive` when a long run blocks the page. An acknowledgment is not a pause verdict.", {}, [], true),
  def("debugger_scripts", "List parsed scripts (named URLs first, max 200; reports total/truncated). Anonymous/eval scripts hidden unless includeAnonymous. Filter = URL substring, or regex with regex:true.",
    { filter: { type: "string", maxLength: 1000 }, regex: { type: "boolean" }, includeAnonymous: { type: "boolean" } }, [], true),
  def("debugger_source", "Read a bounded script source excerpt. Lines and columns in this MCP are ONE-based.",
    { scriptId: str("Script id from debugger_scripts or a stack frame (or pass url)"), url: str("Exact script URL instead of scriptId; newest parse wins", 1000),
      startLine: integer("First line"), endLine: integer("Last line (alternative to count)"), count: integer("Line count, max 200", 1, 200) }, [], true),
  def("debugger_breakpoint", "Set a URL breakpoint, optionally conditional. ONE-based line/column; URL breakpoints survive reload. Conditions execute JavaScript. Setting the same location again replaces it. Empty locations + warning = wrong URL or script not parsed.",
    { url: str("Exact script URL, including query if present"), line: integer("Source line"), column: integer("Source column"), condition: { type: "string", maxLength: 4000 } }, ["url", "line"]),
  def("debugger_remove_breakpoint", "Remove a breakpoint created by this debugger session.", { id: str("Breakpoint id") }, ["id"]),
  def("debugger_control", "Pause on the next JS statement, resume, step over/into/out, or cancel (terminate the running script). Inspect state for a NEW pause token; steps may finish without pausing.",
    { action: { type: "string", enum: ["pause", "resume", "over", "into", "out", "cancel"] }, pauseToken: token }, ["action"]),
  def("debugger_exceptions", "Configure pause-on-exceptions for this session: none, uncaught or all.", { state: { type: "string", enum: ["none", "uncaught", "all"] } }, ["state"]),
  def("debugger_evaluate", "Evaluate in a paused stack frame (frame = zero-based index). Side effects rejected by default (V8 also refuses localStorage reads: retry with allowSideEffects:true). Exceptions are tool errors.",
    { pauseToken: token, frame: integer("Zero-based frame index (first 10 frames retained)", 0, 9), expression, allowSideEffects: { type: "boolean" } }, ["pauseToken", "expression"]),
  def("debugger_properties", "Read own property descriptors without invoking getters. Object must belong to the current pause.",
    { pauseToken: token, objectId: str("Scope/evaluation/property objectId"), offset: integer("Property offset", 0), limit: integer("Page size", 1, 100) }, ["pauseToken", "objectId"], true),
  def("debugger_logpoint", "Non-pausing breakpoint: records `expression` (evaluated in the frame) on each hit into a bounded page-side ring. For hot loops (NaN tracing). Read with debugger_logpoint_read.",
    { url: str("Exact script URL"), line: integer("Source line"), column: integer("Source column"), expression: str("Expression to record, e.g. `speed`", 1000),
      maxHits: integer("Ring size (default 100)", 1, 300), maxChars: integer("Max chars per value (default 200)", 10, 500) }, ["url", "line", "expression"]),
  def("debugger_logpoint_read", "Read (and optionally clear) logpoint hits: total hit count plus the newest `limit` retained values. Page must be running.",
    { id: str("Logpoint id (default: all)", 20), clear: { type: "boolean" }, limit: integer("Newest values per logpoint (default 50)", 1, 300) }, [], false),
  def("debugger_exception_log", "Collect caught/uncaught exceptions WITHOUT pausing (auto-resume): message, url:line, top-5 stack, per-message counts. action start|read|clear|stop; stop resets pause-on-exceptions.",
    { action: { type: "string", enum: ["start", "read", "clear", "stop"] }, state: { type: "string", enum: ["all", "uncaught"] }, max: integer("Retained entries (default 100)", 1, 300) }, ["action"]),
  def("debugger_listeners", "Count event listeners by type on window, document or a CSS selector (first match) via DOMDebugger.getEventListeners. For leak hunts across restarts.",
    { target: str("window | document | CSS selector (default window)", 500), detail: integer("Also list the first N listeners with script:line (default 0)", 0, 100) }, [], true),
  def("debugger_instances", "Count live objects for a constructor/prototype expression (Runtime.queryObjects; GCs first). Includes subclass instances. For AudioNode/Mesh leak counts. Page must be running.",
    { expression: str("Constructor or prototype expression, e.g. AudioNode", 1000) }, ["expression"]),
  def("debugger_run", "Execute potentially mutating JS while running. Returns immediately with operationId so a breakpoint cannot block resume. Read result via debugger_state. ALWAYS mutating: it has no allowSideEffects flag (only debugger_evaluate has one, default off). A new run abandons a pending/unknown one (marked abandoned; JS not cancelled).",
    { expression, awaitPromise: { type: "boolean", description: "Wait for a returned Promise in the background operation (default false)" },
      timeoutMs: integer("Response deadline in ms (default 600000). Past it the op is timedOut but still tracked and a late result is recorded", 1000, 600000) }, ["expression"]),
];

// T12: parameter names agents guess. Accepted as aliases only when the tool has the real one;
// any other unknown key is refused with the list of valid names.
const ALIASES = { frameIndex: "frame", frame_index: "frame", mode: "state", token: "pauseToken", scriptUrl: "url", target_id: "targetId" };
function validate(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw Error("arguments must be an object");
  const { properties, required } = tool.inputSchema;
  for (const [alias, real] of Object.entries(ALIASES)) {
    if (Object.hasOwn(args, alias) && !properties[alias] && properties[real] && !Object.hasOwn(args, real)) { args[real] = args[alias]; delete args[alias]; }
  }
  for (const key of required) if (!Object.hasOwn(args, key)) throw Error(`Missing argument: ${key}${properties[key]?.description ? ` (${properties[key].description.slice(0, 80)})` : ""}`);
  for (const [key, value] of Object.entries(args)) {
    const spec = properties[key];
    if (!spec) throw Error(key === "allowSideEffects" && tool.name === "debugger_run"
      ? "debugger_run is always mutating and takes no allowSideEffects; that flag exists only on debugger_evaluate (paused frames, default off)"
      : `Unknown argument: ${key}; valid arguments: ${Object.keys(properties).join(", ") || "(none)"}`);
    if (spec.type === "integer" ? !Number.isInteger(value) : typeof value !== spec.type) throw Error(`Invalid type for ${key}`);
    if (spec.enum && !spec.enum.includes(value)) throw Error(`Invalid ${key}`);
    if (spec.type === "integer" && (value < spec.minimum || value > spec.maximum)) throw Error(`Out of range: ${key}`);
    if (spec.type === "string" && (value.length < (spec.minLength || 0) || value.length > spec.maxLength)) throw Error(`Invalid length: ${key}`);
  }
}
export async function callTool(session, name, args = {}) {
  try {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw Error(`Unknown tool: ${name}`);
    validate(tool, args);
    const a = args;
    const routes = {
      debugger_targets: () => session.listTargets(a.endpoint, a.targetType), debugger_attach: () => session.attach(a.endpoint, a.targetId),
      debugger_detach: () => session.detach(), debugger_state: () => session.stateWithHealth(), debugger_scripts: () => session.scriptsList(a.filter, { regex: a.regex, includeAnonymous: a.includeAnonymous }),
      debugger_logpoint: () => session.setLogpoint(a), debugger_logpoint_read: () => session.readLogpoints(a),
      debugger_exception_log: () => session.exceptionLogControl(a), debugger_listeners: () => session.listeners(a), debugger_instances: () => session.instances(a),
      debugger_source: () => session.source(a.scriptId, a.startLine ?? 1, a.count ?? 40, { url: a.url, endLine: a.endLine }),
      debugger_breakpoint: () => session.setBreakpoint(a.url, a.line, a.column, a.condition),
      debugger_remove_breakpoint: () => session.removeBreakpoint(a.id), debugger_control: () => session.control(a.action, a.pauseToken),
      debugger_exceptions: () => session.exceptions(a.state), debugger_evaluate: () => session.evaluate(a.pauseToken, a.frame ?? 0, a.expression, a.allowSideEffects),
      debugger_properties: () => session.properties(a.pauseToken, a.objectId, a.offset ?? 0, a.limit ?? 30), debugger_run: () => session.runTool(a.expression, a.awaitPromise, a.timeoutMs),
    };
    // detach never waits behind a stuck command: it is the recovery path (T13).
    const changesSession = !["debugger_targets", "debugger_state", "debugger_scripts", "debugger_detach"].includes(name);
    if (changesSession && session.toolBusy) throw Error("Another debugger command is in progress; inspect state or retry after its response");
    let body;
    if (changesSession) session.toolBusy = true;
    try { body = await routes[name](); }
    finally { if (changesSession || name === "debugger_detach") session.toolBusy = false; }
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, "utf8") > 128000) throw Error("Result exceeds 128KB; narrow the request. The debugger action may already have completed.");
    return { content: [{ type: "text", text: serialized }], structuredContent: body,
      isError: body.ok === false || !!body.cleanupErrors?.length || !!body.exceptionDetails };
  } catch (error) {
    const body = { ok: false, error: String(error.message || error).slice(0, 2000) };
    return { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body, isError: true };
  }
}
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
export async function handleRpc(session, msg) {
  if (!msg || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(null, -32600, "Invalid JSON-RPC request");
  if (!Object.hasOwn(msg, "id")) return null;
  const { id, method } = msg;
  if (id !== null && typeof id !== "string" && !(typeof id === "number" && Number.isFinite(id))) return rpcError(null, -32600, "Invalid request id");
  if (msg.params !== undefined && (!msg.params || typeof msg.params !== "object" || Array.isArray(msg.params))) return rpcError(id, -32602, "params must be an object");
  const result = value => ({ jsonrpc: "2.0", id, result: value });
  if (method === "initialize") return result({ protocolVersion: "2025-06-18", capabilities: { tools: {} },
    serverInfo: { name: "js-debugger-mcp", version: "0.1.0" },
    instructions: "Local Chrome page debugger. ONE browser, parent-owned; attaches only, never launches. Use a dedicated debug profile. ONE-based source positions, ZERO-based frame index. Inspect pause.token after every control. debugger_run returns immediately; read operation status separately. Code evaluation can mutate the page. Detach before ending." });
  if (method === "ping") return result({});
  if (method === "tools/list") return result({ tools: TOOLS });
  if (method === "tools/call" && Object.hasOwn(msg.params ?? {}, "arguments") &&
      (!msg.params.arguments || typeof msg.params.arguments !== "object" || Array.isArray(msg.params.arguments))) return rpcError(id, -32602, "tools/call arguments must be an object");
  if (method === "tools/call") return result(await callTool(session, msg.params?.name, msg.params?.arguments ?? {}));
  return rpcError(id, -32601, "Method not found");
}

export async function serve() {
  const session = new DebugSession(), work = new Set();
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let closing = false;
  const cleanup = async () => {
    if (closing) return; closing = true;
    const result = await session.detach();
    if (result.cleanupErrors?.length) {
      process.stderr.write(`Debugger cleanup incomplete: ${result.cleanupErrors.join("; ")}\n`);
      process.exitCode = 1;
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { cleanup().finally(() => process.exit(process.exitCode || 0)); });
  for await (const line of input) {
    if (!line.trim()) continue;
    let msg;
    try { if (line.length > 64000) throw Error("too large"); msg = JSON.parse(line); }
    catch { process.stdout.write(JSON.stringify(rpcError(null, -32700, "Invalid or oversized JSON")) + "\n"); continue; }
    // Never serialize transport processing behind a paused/evaluating target.
    const p = handleRpc(session, msg).then(response => {
      if (response) process.stdout.write(JSON.stringify(response) + "\n");
    }).catch(e => process.stderr.write(`Debugger request failed: ${e.message}\n`)).finally(() => work.delete(p));
    work.add(p);
  }
  await Promise.allSettled(work); await cleanup();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) process.stdout.write("node tools/mcp/js-debugger-mcp.mjs [--help | --list-tools]\nStdio MCP; attaches to an existing loopback Chrome. No browser launch.\n");
  else if (process.argv.includes("--list-tools")) process.stdout.write(JSON.stringify(TOOLS, null, 2) + "\n");
  else serve().catch(e => { process.stderr.write(e.message + "\n"); process.exitCode = 1; });
}
