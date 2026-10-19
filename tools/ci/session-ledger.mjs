#!/usr/bin/env node
// session-ledger.mjs — where a session's minutes went, from a transcript (+ permission events).
// @doc Summarise an agent transcript into tool/command-family minutes, timeouts, repeats; redacts secrets.
// Full description: reads a Claude Code JSONL transcript (and optional permission-event JSONL), pairs
// tool_use with tool_result by id, classifies Bash keys against an allowlist, and prints one summary
// line (or JSON). Privacy is binding: tokens, emails, and paths outside the repo never appear in keys
// or output — everything else collapses to "other". Issue #1714 / measurement.md item 4.
// @skill check-changes
//
//   node tools/ci/session-ledger.mjs --from-transcript <path.jsonl>
//   node tools/ci/session-ledger.mjs --from-transcript <path> --permissions <perms.jsonl>
//   node tools/ci/session-ledger.mjs --from-transcript <path> --json
//   node tools/ci/session-ledger.mjs --from-transcript <path> --summarise
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Bash key shapes that may appear verbatim (prefix / pattern). Everything else → "other". */
export const BASH_ALLOW = [
  [/^npm\s+run\s+([\w:.-]+)/i, (_, s) => `npm run ${s}`],
  [/^node\s+tools\/ci\/([\w./-]+)/i, (_, s) => `node tools/ci/${s}`],
  [/^node\s+tools\/([\w./-]+)/i, (_, s) => `node tools/${s}`],
  [/^npx\s+serve\b/i, () => "npx serve"],
  [/^git\s+(status|add|commit|push|fetch|pull|diff|log|checkout|branch|merge|rev-parse|show|stash|restore|reset|remote|tag|switch|rebase|cherry-pick|mv|rm)\b/i,
    (_, v) => `git ${String(v).toLowerCase()}`],
];

const TOKEN_RE = /\b(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,})\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Absolute paths that are NOT under the repo (or a common placeholder).
const ABS_PATH_RE = /(?:^|[\s"'`=])(\/(?:Users|home|var|tmp|private|opt|root)\/[^\s"'`]+)/g;

/** Strip tokens, emails, and absolute paths outside the repo from a string. */
export function redactText(s, { root = ROOT } = {}) {
  let out = String(s ?? "");
  out = out.replace(TOKEN_RE, "<token>");
  out = out.replace(EMAIL_RE, "<email>");
  const rootPosix = root.replace(/\\/g, "/");
  out = out.replace(ABS_PATH_RE, (full, p) => {
    const norm = p.replace(/\\/g, "/");
    if (norm === rootPosix || norm.startsWith(rootPosix + "/")) {
      return full.replace(p, norm.slice(rootPosix.length + 1) || ".");
    }
    return full.replace(p, "<path>");
  });
  return out;
}

/** Classify a Bash command into an allowlisted key, or "other". Always redacted first. */
export function classifyBash(command, { root = ROOT } = {}) {
  const cleaned = redactText(String(command ?? "").replace(/\s+/g, " ").trim(), { root });
  if (!cleaned) return "other";
  // If redaction already ate a secret, never leak the surrounding command shape.
  if (/<token>|<email>/.test(cleaned)) return "other";
  for (const [re, fmt] of BASH_ALLOW) {
    const m = cleaned.match(re);
    if (m) {
      try { return fmt(...m); } catch (_) { return "other"; }
    }
  }
  return "other";
}

/** A short key for any tool row (Bash → classified; Edit/Write → repo-relative path; else tool name). */
export function toolKey(name, input = {}, { root = ROOT } = {}) {
  if (name === "Bash") return classifyBash(input.command, { root });
  const file = input.file_path || input.path || input.notebook_path;
  if (file) {
    const red = redactText(String(file), { root });
    if (red.includes("<path>") || red.includes("<token>") || red.includes("<email>")) return `${name}:<path>`;
    const norm = red.replace(/\\/g, "/");
    const rootPosix = root.replace(/\\/g, "/");
    if (norm.startsWith(rootPosix + "/")) return `${name}:${norm.slice(rootPosix.length + 1)}`;
    if (!norm.startsWith("/")) return `${name}:${norm}`;
    return `${name}:<path>`;
  }
  return name || "other";
}

function parseTs(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function contentBlocks(msg) {
  const c = msg && msg.content;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return Array.isArray(c) ? c : [];
}

/** Parse a Claude Code (or CCR-ish) JSONL transcript into raw entries. Tolerant. */
export function parseTranscript(text) {
  const lines = String(text || "").split(/\n/);
  const entries = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s || s[0] !== "{") continue;
    try { entries.push(JSON.parse(s)); } catch (_) { /* skip bad lines */ }
  }
  return entries;
}

/** Parse optional permission-event JSONL: {t, ev, tool, key} or {type:"permission_*", ...}. */
export function parsePermissionEvents(text) {
  const rows = [];
  for (const line of String(text || "").split(/\n/)) {
    const s = line.trim();
    if (!s || s[0] !== "{") continue;
    let o;
    try { o = JSON.parse(s); } catch (_) { continue; }
    const ev = o.ev || o.type || o.event;
    if (!ev) continue;
    const tool = o.tool || o.tool_name || o.name || "";
    const key = redactText(o.key || o.command || o.decision_key || toolKey(tool, o.input || {}));
    rows.push({
      t: parseTs(o.t || o.timestamp || o.ts) || Date.now(),
      ev: String(ev),
      tool: String(tool || "unknown"),
      key: /<token>|<email>/.test(key) ? "other" : key,
    });
  }
  return rows;
}

/**
 * Build ledger rows from transcript entries (+ optional permission rows).
 * Row: { t, ev, tool, key, dur_ms, ok, group, tokens }
 */
export function buildRows(entries, { permissions = [], root = ROOT } = {}) {
  const rows = [];
  const pending = new Map(); // tool_use_id → { t, tool, key, group }

  const pushTool = (block, ts, usage) => {
    if (!block || block.type !== "tool_use") return;
    const id = block.id || block.tool_use_id;
    if (!id) return;
    const name = block.name || "Tool";
    const input = block.input || {};
    const key = toolKey(name, input, { root });
    const group = name === "Bash" && /test-bg|run-playwright|test:([\w-]+)/.test(String(input.command || ""))
      ? (String(input.command).match(/test-bg\.mjs\s+([\w-]+)/)?.[1]
        || String(input.command).match(/test:([\w-]+)/)?.[1]
        || null)
      : null;
    pending.set(id, { t: ts, tool: name, key, group, tokens: usage || null });
  };

  const closeTool = (block, ts) => {
    if (!block || block.type !== "tool_result") return;
    const id = block.tool_use_id || block.id;
    const open = pending.get(id);
    if (!open) return;
    pending.delete(id);
    const dur = ts != null && open.t != null ? Math.max(0, ts - open.t) : null;
    const ok = !(block.is_error || block.is_error === true || /timed?\s*out|ETIMEDOUT|exit 124/i.test(String(block.content || "")));
    const timedOut = /timed?\s*out|ETIMEDOUT|exit 124/i.test(String(block.content || ""));
    rows.push({
      t: open.t, ev: timedOut ? "timeout" : "tool", tool: open.tool, key: open.key,
      dur_ms: dur, ok: timedOut ? false : ok, group: open.group, tokens: open.tokens,
    });
  };

  for (const ent of entries) {
    const ts = parseTs(ent.timestamp || ent.t || ent.created_at);
    const typ = ent.type || ent.kind || "";
    // Permission events may also live inside the transcript.
    if (/^perm/i.test(typ) || ent.ev === "perm_request" || ent.ev === "perm_denied") {
      rows.push({
        t: ts || 0,
        ev: ent.ev || typ,
        tool: ent.tool || ent.tool_name || "unknown",
        key: redactText(ent.key || ent.command || "other"),
        dur_ms: null, ok: true, group: null, tokens: null,
      });
      continue;
    }
    const msg = ent.message || ent;
    const usage = msg.usage || ent.usage || null;
    for (const b of contentBlocks(msg)) {
      if (b.type === "tool_use") pushTool(b, ts, usage);
      else if (b.type === "tool_result") closeTool(b, ts);
    }
    // Some transcripts put tool_result on the entry itself.
    if (ent.toolUseResult && ent.toolUseResult.tool_use_id) {
      closeTool({
        type: "tool_result",
        tool_use_id: ent.toolUseResult.tool_use_id,
        content: ent.toolUseResult.content || ent.toolUseResult,
        is_error: !!ent.toolUseResult.is_error,
      }, ts);
    }
  }

  // Unclosed tools: still count as a row with unknown duration.
  for (const open of pending.values()) {
    rows.push({
      t: open.t, ev: "tool", tool: open.tool, key: open.key,
      dur_ms: null, ok: true, group: open.group, tokens: open.tokens,
    });
  }

  for (const p of permissions) {
    rows.push({
      t: p.t, ev: p.ev, tool: p.tool, key: p.key,
      dur_ms: null, ok: !/denied/i.test(p.ev), group: null, tokens: null,
    });
  }

  rows.sort((a, b) => (a.t || 0) - (b.t || 0));
  return rows;
}

function familyOf(row) {
  const tool = row.tool || "";
  const key = row.key || "";
  if (tool === "Bash" && (/test-bg|run-playwright|test:\w/.test(key) || row.group)) return "browser";
  if (tool === "Bash" && /^npm run test:tooling|^npm run test:guards|^node tools\/ci\/(tooling-fast|verify|deploy|pick-tests)/.test(key)) return "node";
  if (tool === "Bash" && /^git /.test(key)) return "git";
  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") return "edits";
  if (/^perm/i.test(row.ev)) return "permission";
  if (row.ev === "timeout") return "timeout";
  if (tool === "Bash") return "bash";
  return tool || "other";
}

/** Aggregate rows into a summary object (minutes by family, repeats, timeouts). */
export function summarise(rows) {
  const byFamily = Object.create(null);
  const byTool = Object.create(null);
  const byKey = Object.create(null);
  let timeouts = 0;
  let waste = 0;
  let permStalls = 0;
  const permKeys = Object.create(null);
  let totalMs = 0;
  let toolWaitMs = 0;

  for (const r of rows) {
    const fam = familyOf(r);
    const ms = Number(r.dur_ms) || 0;
    byFamily[fam] = (byFamily[fam] || 0) + ms;
    byTool[r.tool || "other"] = (byTool[r.tool || "other"] || 0) + ms;
    byKey[r.key || "other"] = (byKey[r.key || "other"] || 0) + 1;
    if (ms) { totalMs += ms; toolWaitMs += ms; }
    if (r.ev === "timeout" || (r.ok === false && /timeout/i.test(r.key || ""))) timeouts++;
    if (r.ev === "waste" || r.key === "waste") waste++;
    if (/^perm/i.test(r.ev)) {
      permStalls++;
      permKeys[r.key || "other"] = (permKeys[r.key || "other"] || 0) + 1;
    }
  }

  const repeats = Object.entries(byKey)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ key: k, n }));

  const browserGroups = rows
    .filter((r) => familyOf(r) === "browser" && r.group)
    .reduce((acc, r) => {
      acc[r.group] = (acc[r.group] || 0) + (Number(r.dur_ms) || 0);
      return acc;
    }, Object.create(null));

  const edits = rows.filter((r) => familyOf(r) === "edits").length;
  const commits = rows.filter((r) => r.key === "git commit").length;
  const span = (() => {
    const ts = rows.map((r) => r.t).filter((t) => t != null);
    if (ts.length < 2) return totalMs;
    return Math.max(0, Math.max(...ts) - Math.min(...ts));
  })();
  const waitingPct = span > 0 ? Math.round((toolWaitMs / span) * 100) : 0;

  return {
    byFamily, byTool, byKey, repeats, timeouts, waste, permStalls, permKeys,
    browserGroups, edits, commits, totalMs, toolWaitMs, waitingPct, rows: rows.length,
  };
}

const fmtMin = (ms) => {
  const m = Math.round((Number(ms) || 0) / 60000);
  return `${m}m`;
};

/** One-line human summary (measurement.md shape). */
export function formatSummary(s) {
  const parts = [];
  const browserMs = s.byFamily.browser || 0;
  if (browserMs || Object.keys(s.browserGroups).length) {
    const groups = Object.entries(s.browserGroups)
      .sort((a, b) => b[1] - a[1])
      .map(([g, ms]) => `${g} ${Math.round(ms / 60000) || 0}`);
    parts.push(`browser ${fmtMin(browserMs)}${groups.length ? ` (${groups.length} groups: ${groups.join(", ")})` : ""}`);
  }
  if (s.byFamily.node) parts.push(`node gates ${fmtMin(s.byFamily.node)}`);
  if (s.edits) parts.push(`edits ${s.edits}`);
  if (s.commits) parts.push(`commits ${s.commits}`);
  if (s.permStalls) {
    const top = Object.entries(s.permKeys).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, n]) => `${k} ×${n}`).join(", ");
    parts.push(`permission stalls ${s.permStalls}${top ? ` (${top})` : ""}`);
  }
  if (s.timeouts) parts.push(`timeouts ${s.timeouts}`);
  if (s.repeats.length) {
    const top = s.repeats.slice(0, 3).map((r) => `${r.key} ×${r.n}`).join(", ");
    parts.push(`repeats ${s.repeats.length}${top ? ` (${top})` : ""}`);
  }
  if (s.waste) parts.push(`waste ${s.waste}`);
  // Tool breakdown (minutes) for audits that do not care about the prose line.
  const toolBits = Object.entries(s.byTool)
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t, ms]) => `${t} ${fmtMin(ms)}`);
  if (toolBits.length) parts.push(`by tool: ${toolBits.join(", ")}`);
  // Empty ledger: no rows worth reporting (avoid a lone "waiting on tools 0%").
  if (!parts.length && !(s.rows > 0)) return "empty ledger";
  parts.push(`waiting on tools ${s.waitingPct}%`);
  return parts.join(" · ");
}

/** Load transcript (+ optional permissions) and return { rows, summary, line }. */
export function fromTranscript(transcriptPath, {
  permissionsPath = null,
  root = ROOT,
  read = (p) => fs.readFileSync(p, "utf8"),
} = {}) {
  const entries = parseTranscript(read(transcriptPath));
  // Sidecar permissions only — buildRows already folds embedded perm_* rows
  // from the transcript itself (type/ev), so re-parsing them here would double-count.
  const permissions = permissionsPath ? parsePermissionEvents(read(permissionsPath)) : [];
  const rows = buildRows(entries, { permissions, root });
  const summary = summarise(rows);
  return { rows, summary, line: formatSummary(summary) };
}

/** Serialise rows/summary for --json (already redacted). */
export function toJson(result) {
  return {
    line: result.line,
    summary: {
      byFamily: result.summary.byFamily,
      byTool: result.summary.byTool,
      timeouts: result.summary.timeouts,
      repeats: result.summary.repeats,
      permStalls: result.summary.permStalls,
      edits: result.summary.edits,
      commits: result.summary.commits,
      waitingPct: result.summary.waitingPct,
      waste: result.summary.waste,
      rows: result.summary.rows,
    },
    rows: result.rows.map((r) => ({
      t: r.t, ev: r.ev, tool: r.tool, key: r.key,
      dur_ms: r.dur_ms, ok: r.ok, group: r.group,
    })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
    console.log(`Usage: node tools/ci/session-ledger.mjs --from-transcript <path.jsonl> [--permissions <path>] [--json|--summarise]
  --from-transcript  Claude Code JSONL (transcript_path)
  --permissions      optional permission-event JSONL
  --json             rows + summary object
  --summarise        one summary line (default)`);
    process.exit(argv.length ? 0 : 2);
  }
  const i = argv.indexOf("--from-transcript");
  if (i < 0 || !argv[i + 1]) {
    console.error("session-ledger: --from-transcript <path> is required");
    process.exit(2);
  }
  const transcriptPath = argv[i + 1];
  const pi = argv.indexOf("--permissions");
  const permissionsPath = pi >= 0 ? argv[pi + 1] : null;
  const result = fromTranscript(transcriptPath, { permissionsPath });
  if (argv.includes("--json")) console.log(JSON.stringify(toJson(result), null, 2));
  else console.log(result.line);
}
