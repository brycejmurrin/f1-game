// cursor-transcript.mjs — parse a Cursor cloud-agent run stream (SSE) into rows a reader can filter.
// @doc Parse Cursor run streams into rows: chat, tool calls (args, outcome, result head), failures, results; modes + masking.
// @skill agent-fleet
//
// Input is the text `GET /v1/agents/{id}/runs/{runId}/stream` returns (or a cached dump of it). Output is data:
// rows for one run, and one-line renderings of them for `cursor-agents.mjs transcript` and the `apex_cursor_agents`
// MCP tool. Shapes measured on real fleet runs (2026-10-20): a call is one or two `tool_call` events with the same
// `callId` (status running, then completed); `args` is elided on about a third of calls and is reported as such,
// never guessed; a result is `{success:{…}}`, `{error:{…}}` or `{spawnError:{…}}`, and an MCP tool reports its own
// failure inside a successful transport call as `{"ok":false,…}`.
//
// A transcript is another agent's record: prompts, code, tool output, sometimes secrets. Everything printed here is
// bounded and masked (best effort, not a guarantee: see `redact`), and callers label it as DATA, never instructions.

/** One SSE body -> [{event, data}], skipping rows that are not JSON (a partial last row). */
export function parseSse(text) {
  const out = [];
  let ev = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) ev = line.slice(7).trim();
    else if (line.startsWith("data: ")) {
      try {
        out.push({ event: ev, data: JSON.parse(line.slice(6)) });
      } catch {
        /* partial row */
      }
    }
  }
  return out;
}

// Best-effort masks for credentials that show up in tool output. A pattern list cannot promise a clean transcript.
const SECRET_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer <redacted>"],
  [/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "<redacted:github-token>"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "<redacted:sk-key>"],
  [/\b(?:crsr|grok|key)_[A-Za-z0-9_]{24,}\b/g, "<redacted:api-key>"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "<redacted:aws-key>"],
  [/\b[0-9a-f]{40,}\b/gi, "<redacted:hex>"],
  [/((?:api[_-]?key|token|secret|password|passwd|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]{8,}/gi, "$1<redacted>"],
];

export function redact(s) {
  let out = String(s);
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to);
  return out;
}

/** Collapse whitespace, mask ids and workspace paths, redact credentials, cut to `width` with an ellipsis. */
export function squash(s, width = 160) {
  const t = redact(String(s ?? ""))
    .replace(/\s+/g, " ")
    .replace(/\/workspace\S*/g, "<path>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .trim();
  return t.length > width ? `${t.slice(0, Math.max(0, width - 1))}…` : t;
}

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** The longest string anywhere inside `o` (the body of a result whose shape we do not know). */
function longestString(o, depth = 0) {
  if (typeof o === "string") return o;
  if (depth > 6 || !o || typeof o !== "object") return "";
  let best = "";
  for (const v of Array.isArray(o) ? o : Object.values(o)) {
    const s = longestString(v, depth + 1);
    if (s.length > best.length) best = s;
  }
  return best;
}

/**
 * Failure head of a tool result, or null on success. Ids and paths are masked so equal failures group.
 * `{error}` and `{spawnError}` are transport failures; an MCP tool may also report `{"ok":false,"error"|"message":…}`
 * inside a successful call.
 */
export function errorHead(name, result) {
  if (!result || typeof result !== "object") return null;
  let bad = null;
  if (result.error) bad = result.error.message || result.error.error || JSON.stringify(result.error);
  else if (result.spawnError) bad = `spawnError ${result.spawnError.message || JSON.stringify(result.spawnError)}`;
  else if (name === "mcp" && result.success) {
    const m = /"ok":\s*false[^}]*?"(?:error|message)":\s*"([^"]{0,120})/.exec(JSON.stringify(result.success).replace(/\\"/g, '"'));
    if (m) bad = `ok:false ${m[1]}`;
  }
  if (bad === null) return null;
  return `${name}: ${squash(typeof bad === "string" ? bad : JSON.stringify(bad), 90)}`;
}

/** One-line summary of a call's arguments, by the field that identifies it; `(elided)` when the stream dropped them. */
export function argsSummary(name, args, width = 100) {
  const a = isObj(args) ? Object.fromEntries(Object.entries(args).filter(([k]) => k !== "toolCallId")) : {};
  if (!Object.keys(a).length) return "(elided)";
  if (name === "mcp") return squash([a.serverIdentifier || a.providerIdentifier, a.toolName || a.name].filter(Boolean).join("/") || JSON.stringify(a), width);
  for (const k of ["command", "path", "pattern", "url", "query", "description", "toolName", "name", "server"]) {
    if (typeof a[k] === "string" && a[k]) return squash(a[k], width);
  }
  return squash(JSON.stringify(a), width);
}

/** What a result says, by tool where the shape is known, else its longest string. `size` is the stored JSON length. */
export function resultBody(name, result) {
  if (result === undefined || result === null) return { size: 0, text: "" };
  const size = JSON.stringify(result).length;
  const s = isObj(result) ? result.success : undefined;
  let text = "";
  if (s && name === "edit_file") text = `${s.path} +${s.linesAdded ?? 0} -${s.linesRemoved ?? 0}${s.message ? ` ${s.message}` : ""}`;
  else if (s && name === "read_file") text = `${s.path} lines ${s.readRange?.startLine ?? 1}-${s.readRange?.endLine ?? s.totalLines ?? "?"} of ${s.totalLines ?? "?"}`;
  else if (s && name === "run_terminal_cmd") text = String(s.stdout ?? s.interleavedOutput ?? "");
  else if (s && name === "task") text = String(s.conversationSteps?.at(-1)?.assistantMessage?.text ?? longestString(s));
  else if (s && name === "web_fetch") text = `${s.url} ${String(s.markdown ?? "").length} chars`;
  else text = longestString(result);
  return { size, text };
}

const argCount = (a) => (isObj(a) ? Object.keys(a).filter((k) => k !== "toolCallId").length : 0);

/**
 * Fold one `tool_call` event into its call. A call is several events sharing a callId (running, running, completed):
 * the LATEST name wins (it can start as an `mcp` placeholder and become `task`), as do the richest args and the last
 * result. Counting events instead of calls overcounts about 3x (measured: 2,156 events, 678 calls) and counts a
 * transient `running` error that the completed event later replaced.
 */
export function foldCallEvent(call, data) {
  if (data.name) call.name = data.name;
  if (isObj(data.args) && argCount(data.args) >= argCount(call.args)) call.args = data.args;
  if (data.result !== undefined) call.result = data.result;
  if (data.status) call.status = data.status;
  return call;
}

/** The distinct calls of a run, in first-seen order, from parseSse events. */
export function groupCalls(events) {
  const map = new Map();
  let anon = 0;
  for (const { event, data } of events) {
    if (event !== "tool_call") continue;
    const id = data.callId || `anon-${++anon}`;
    if (!map.has(id)) map.set(id, { callId: id, name: data.name || "?", args: null, status: data.status, result: undefined });
    foldCallEvent(map.get(id), data);
  }
  return [...map.values()];
}

/**
 * Rows for one run, in stream order. kinds: status, chat (consecutive assistant chunks merged), thinking (chars only),
 * tool, result, error. A tool row merges the events that share a callId.
 */
export function parseRun(sseText, run = {}) {
  const rows = [];
  const calls = new Map();
  let chat = null;
  let toolSeq = 0;
  for (const { event, data } of parseSse(sseText)) {
    if (event !== "assistant") chat = null;
    if (event === "assistant") {
      const t = typeof data.text === "string" ? data.text : "";
      if (!chat) rows.push((chat = { kind: "chat", text: "" }));
      chat.text += t;
    } else if (event === "thinking") {
      rows.push({ kind: "thinking", chars: JSON.stringify(data).length });
    } else if (event === "status") {
      rows.push({ kind: "status", status: data.status });
    } else if (event === "result") {
      rows.push({ kind: "result", status: data.status, text: data.text || "", durationMs: data.durationMs });
    } else if (event === "error") {
      rows.push({ kind: "error", text: JSON.stringify(data).slice(0, 300) });
    } else if (event === "tool_call") {
      const id = data.callId || `anon-${rows.length}`;
      let row = calls.get(id);
      if (!row) {
        row = { kind: "tool", seq: ++toolSeq, callId: id, name: data.name || "?", args: null, status: data.status, result: undefined };
        calls.set(id, row);
        rows.push(row);
      }
      foldCallEvent(row, data);
    }
  }
  for (const r of rows) {
    if (r.kind !== "tool") continue;
    r.error = errorHead(r.name, r.result);
    const b = resultBody(r.name, r.result);
    r.resultSize = b.size;
    r.resultText = b.text;
  }
  const tools = rows.filter((r) => r.kind === "tool");
  const finalRow = rows.findLast?.((r) => r.kind === "result") ?? [...rows].reverse().find((r) => r.kind === "result");
  return {
    runId: run.id || "",
    run8: (run.id || "run-????????").slice(-8),
    createdAt: run.createdAt,
    status: finalRow?.status || run.status || "?",
    durationMs: finalRow?.durationMs ?? run.durationMs,
    rows,
    stats: { calls: tools.length, errors: tools.filter((t) => t.error).length, elidedArgs: tools.filter((t) => !t.args || !Object.keys(t.args).filter((k) => k !== "toolCallId").length).length },
  };
}

export const ONLY = ["tools", "errors", "chat", "turns"];

/** The longest run of the same failure back to back (a retry storm), over the tool rows of one run. */
export function errorStreak(rows) {
  let last = null;
  let n = 0;
  let worst = 0;
  for (const r of rows) {
    if (r.kind !== "tool") continue;
    n = r.error && r.error === last ? n + 1 : r.error ? 1 : 0;
    last = r.error;
    worst = Math.max(worst, n);
  }
  return worst;
}

/** One line per run: status, duration, counts, the final reply head. */
export function summaryLine(p, width = 140) {
  const fin = p.rows.findLast?.((r) => r.kind === "result") ?? [...p.rows].reverse().find((r) => r.kind === "result");
  return `RUN ${p.run8} ${p.status} dur=${Math.round((p.durationMs || 0) / 1000)}s calls=${p.stats.calls} err=${p.stats.errors} streak=${errorStreak(p.rows)} elidedArgs=${p.stats.elidedArgs} "${squash(fin?.text || "", width)}"`;
}

/**
 * Render parsed runs to lines.
 * only: any of tools|errors|chat|turns (default all four); tool: only calls of that tool name; grep: regex on a line;
 * results: add a bounded result head to tool lines; width: head width.
 */
export function renderLines(parsed, { only = ONLY, tool, grep, results = false, width = 160 } = {}) {
  const want = new Set(only);
  const re = grep ? new RegExp(grep, "i") : null;
  const lines = [];
  for (const p of parsed) {
    if (want.has("turns")) lines.push(summaryLine(p, width));
    for (const r of p.rows) {
      let line = null;
      if (r.kind === "tool") {
        if (tool && r.name !== tool) continue;
        const showTool = want.has("tools") || (want.has("errors") && r.error);
        if (!showTool) continue;
        if (!want.has("tools") && !r.error) continue;
        line = `TOOL ${p.run8}#${r.seq} ${r.name} ${r.error ? "ERR" : "ok"} ${argsSummary(r.name, r.args, width)} res=${r.resultSize}c`;
        if (r.error) line += ` !! ${squash(r.error, width)}`;
        else if (results && r.resultText) line += ` -> ${squash(r.resultText, width)}`;
      } else if (r.kind === "chat" && want.has("chat") && !tool) {
        line = `CHAT ${p.run8} "${squash(r.text, width)}"`;
      } else if (r.kind === "result" && want.has("chat") && !tool) {
        line = `RESULT ${p.run8} ${r.status} "${squash(r.text, width)}"`;
      } else if (r.kind === "error" && !tool) {
        line = `STREAM_ERROR ${p.run8} ${squash(r.text, width)}`;
      }
      if (line && (!re || re.test(line))) lines.push(line);
    }
  }
  return lines;
}

/** One call's result in full (masked, cut at `max` characters), found by callId prefix or `<run8>#<seq>`. */
export function findCall(parsed, ref, { max = 4000 } = {}) {
  for (const p of parsed) {
    for (const r of p.rows) {
      if (r.kind !== "tool") continue;
      if (r.callId === ref || r.callId.startsWith(ref) || `${p.run8}#${r.seq}` === ref) {
        const full = redact(typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? null));
        return {
          ref: `${p.run8}#${r.seq}`,
          name: r.name,
          error: r.error,
          args: argsSummary(r.name, r.args, 400),
          chars: full.length,
          truncated: full.length > max,
          text: full.slice(0, max),
        };
      }
    }
  }
  return null;
}

/** Normalized rows for another tool: bounded and masked, never the raw results. */
export function jsonRows(parsed, { width = 400, tool, only } = {}) {
  const want = new Set(only || ONLY);
  const out = [];
  for (const p of parsed) {
    out.push({ kind: "run", run: p.run8, status: p.status, durationMs: p.durationMs ?? null, ...p.stats, streak: errorStreak(p.rows) });
    for (const r of p.rows) {
      if (r.kind === "tool") {
        if (tool && r.name !== tool) continue;
        if (!want.has("tools") && !(want.has("errors") && r.error)) continue;
        out.push({ kind: "tool", run: p.run8, seq: r.seq, callId: r.callId, name: r.name, ok: !r.error, error: r.error || null, args: argsSummary(r.name, r.args, width), resultSize: r.resultSize, resultHead: squash(r.resultText, width) });
      } else if ((r.kind === "chat" || r.kind === "result") && want.has("chat") && !tool) {
        out.push({ kind: r.kind, run: p.run8, ...(r.status && { status: r.status }), text: squash(r.text, width * 5) });
      }
    }
  }
  return out;
}
