// @doc Shared bounded agent output with private, retrievable original artifacts.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const OUTPUT_LEVELS = Object.freeze(['compact', 'diagnostic', 'full']);
export function validateOutputLevel(value, defaultLevel = 'compact') {
  const level = value === undefined ? defaultLevel : value;
  if (!OUTPUT_LEVELS.includes(level)) throw new Error(`output level must be ${OUTPUT_LEVELS.join('|')}; got ${JSON.stringify(level)}`);
  return level;
}
const contained = (base, target) => { const rel = path.relative(base, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
function artifactBase(root, create = false) {
  const realRoot = fs.realpathSync(root || process.cwd());
  let dir = realRoot;
  for (const part of ['artifacts', 'agent-output']) {
    dir = path.join(dir, part);
    if (create && !fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('artifact directory must be a real directory');
  }
  return { base: dir, root: realRoot };
}
export function saveOutputArtifact(value, { root = process.cwd(), tool = 'output', kind = 'json' } = {}) {
  const { base } = artifactBase(root, true);
  const token = String(tool).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'output';
  const extension = kind === 'json' || kind === 'mcp' ? 'json' : 'log';
  const name = `${token}-${Date.now()}-${randomUUID()}.${extension}`;
  const data = Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : JSON.stringify(value);
  if (data === undefined) throw new Error('cannot retain undefined output');
  fs.writeFileSync(path.join(base, name), data, { flag: 'wx', mode: 0o600 });
  return { path: `artifacts/agent-output/${name}`, bytes: Buffer.byteLength(data), kind, tool };
}
function excerpt(text, max) {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.65), tail = max - head;
  return text.slice(0, head) + `\n[omitted ${text.length - max} characters]\n` + (tail ? text.slice(-tail) : '');
}
const important = /status|verdict|count|total|error|fail|warn|message|fix|cause|stack|exit|signal|timed?out|unknown|pass|skip|dirty|unpushed|retriev|artifact|omitt|stdout|stderr/i;
export function summarizeOutput(value, { level = 'compact' } = {}) {
  level = validateOutputLevel(level);
  if (level === 'full') return value;
  const diagnostic = level === 'diagnostic';
  const budget = { remaining: diagnostic ? 18000 : 6000, nodes: diagnostic ? 500 : 180 };
  const seen = new WeakSet();
  function visit(v, depth = 0, key = '') {
    if (budget.nodes-- <= 0) return { omitted: true, reason: 'summary node budget' };
    if (v === null || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v === 'string') {
      const max = Math.max(0, Math.min(budget.remaining, diagnostic && /error|cause|stack|stderr|fail/i.test(key) ? 4000 : diagnostic ? 1600 : 650));
      const out = excerpt(v, max); budget.remaining -= Math.min(v.length, max); return out;
    }
    if (typeof v !== 'object') return String(v);
    if (seen.has(v)) return '[circular reference]';
    seen.add(v);
    if (depth > (diagnostic ? 6 : 4) || budget.remaining <= 0) return { omitted: true, ...(Array.isArray(v) ? { count: v.length } : { keys: Object.keys(v).length }) };
    if (Array.isArray(v)) {
      const cap = diagnostic ? 8 : 3;
      if (/^(checks|findings|errors|warnings)$/i.test(key)) {
        const groups = [[], [], [], []], statusCounts = {};
        for (const item of v) {
          const status = String(item && typeof item === 'object' ? item.status ?? item.verdict ?? item.severity ?? item.level ?? (item.ok === false || item.pass === false ? 'failed' : item.error ? 'error' : 'unspecified') : 'unspecified').slice(0, 60);
          const label = Object.hasOwn(statusCounts, status) || Object.keys(statusCounts).length < 16 ? status : 'other';
          statusCounts[label] = (statusCounts[label] || 0) + 1;
          const severity = /fail|error|fatal|critical|^high$/i.test(status) ? 3 : /warn|medium/i.test(status) ? 2 : /unknown|unresolved/i.test(status) ? 1 : 0;
          if (groups[severity].length < cap) groups[severity].push(item);
        }
        const rows = [...groups[3], ...groups[2], ...groups[1], ...groups[0]].slice(0, cap);
        const out = rows.map((item) => visit(item, depth + 1, key));
        out.push({ totalItems: v.length, omittedItems: Math.max(0, v.length - rows.length), statusCounts, prioritizedIssues: true });
        return out;
      }
      const out = v.slice(0, cap).map((item) => visit(item, depth + 1, key));
      if (v.length > cap) out.push({ omittedItems: v.length - cap, totalItems: v.length });
      return out;
    }
    if ((v.type === 'image' || v.type === 'audio') && v.data) return { type: v.type, mimeType: v.mimeType, omittedDataCharacters: v.data.length, data: '[retained in artifact]' };
    const out = {}, keys = Object.keys(v).sort((a, b) => Number(important.test(b)) - Number(important.test(a)));
    const cap = diagnostic ? 35 : 20;
    for (const k of keys.slice(0, cap)) out[excerpt(k, 160)] = visit(v[k], depth + 1, k);
    if (keys.length > cap) out.omittedFields = keys.length - cap;
    return out;
  }
  // Text MCP blocks commonly contain the actual tool JSON. Summarize that data,
  // preserving structuredContent and transport status independently.
  if (value && Array.isArray(value.content)) {
    const normalized = { ...value, content: value.content.map((block) => {
      if (block.type !== 'text') return block;
      try {
        const data = JSON.parse(block.text);
        return value.structuredContent !== undefined && isDeepStrictEqual(data, value.structuredContent)
          ? { type: 'text', duplicateOf: 'structuredContent', omittedDuplicate: true }
          : { type: 'text', data };
      } catch { return block; }
    }) };
    return visit(normalized);
  }
  return visit(value);
}
export function presentMcpResult(result, { root = process.cwd(), tool = 'mcp', level = 'compact' } = {}) {
  level = validateOutputLevel(level);
  let artifact;
  try { artifact = saveOutputArtifact(result, { root, tool, kind: 'mcp' }); }
  catch (error) {
    if (level === 'full') {
      process.stderr.write(`Agent output presentation error: could not retain original output: ${error.message}. Returning full original result.\n`);
      return result;
    }
    return { ...result, content: [...(result.content || []), { type: 'text', text: `Presentation error: could not retain original output: ${error.message}. Full original output follows in this result.` }], presentationError: error.message };
  }
  if (level === 'full') return result;
  const envelope = { outputLevel: level, summary: summarizeOutput(result, { level }), artifact };
  return { content: [{ type: 'text', text: JSON.stringify(envelope) }], structuredContent: envelope, ...(Object.hasOwn(result, 'isError') ? { isError: result.isError } : {}) };
}
function openOutputArtifact(root, artifact) {
  const ref = typeof artifact === 'string' ? artifact : artifact?.path;
  if (typeof ref !== 'string' || path.isAbsolute(ref) || ref.split(/[\\/]/).includes('..') || !ref.startsWith('artifacts/agent-output/')) throw new Error('artifact must be a relative artifacts/agent-output/ path');
  const { base, root: realRoot } = artifactBase(root);
  const target = path.resolve(realRoot, ref);
  if (!contained(base, target) || target === base) throw new Error('artifact path escapes agent-output');
  let cursor = base;
  for (const part of path.relative(base, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('artifact symlinks are forbidden');
  }
  if (!contained(base, fs.realpathSync(target))) throw new Error('artifact path escapes agent-output');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  return { fd, ref };
}
export function readOutputArtifact({ root = process.cwd(), artifact, level = 'compact', offset = 0, limit = 16384 }) {
  level = validateOutputLevel(level);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 262144) throw new Error('offset must be nonnegative and limit must be 1..262144 bytes');
  const { fd, ref } = openOutputArtifact(root, artifact);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('artifact must be a regular file');
    const data = Buffer.alloc(Math.min(limit, Math.max(0, stat.size - offset)));
    const bytes = fs.readSync(fd, data, 0, data.length, offset);
    return { artifact: ref, outputLevel: level, offset, bytes, totalBytes: stat.size, nextOffset: offset + bytes < stat.size ? offset + bytes : null, omittedBytes: Math.max(0, stat.size - offset - bytes), text: data.subarray(0, bytes).toString('utf8'), ...(Buffer.from(data.subarray(0, bytes).toString('utf8')).equals(data.subarray(0, bytes)) ? {} : { encoding: 'base64', base64: data.subarray(0, bytes).toString('base64') }) };
  } finally { fs.closeSync(fd); }
}

export function readOriginalMcpArtifact({ root = process.cwd(), artifact, maxBytes = 8388608 }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 8388608) throw new Error('maxBytes must be 1..8388608');
  const { fd } = openOutputArtifact(root, artifact);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('artifact must be a regular file');
    if (stat.size > maxBytes) throw new Error('original MCP artifact exceeds maxBytes; use paged retrieval');
    const data = Buffer.alloc(stat.size);
    let bytes = 0;
    while (bytes < data.length) {
      const count = fs.readSync(fd, data, bytes, data.length - bytes, bytes);
      if (!count) throw new Error('artifact changed while reading');
      bytes += count;
    }
    const original = JSON.parse(data.toString('utf8'));
    if (!original || !Array.isArray(original.content)) throw new Error('artifact is not an original MCP result');
    return original;
  } finally { fs.closeSync(fd); }
}
