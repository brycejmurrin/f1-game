#!/usr/bin/env node
// @doc Wrap a stdio MCP server with bounded output levels and saved-result retrieval.
import fs from 'node:fs';
import { spawnAgentProcess } from '../agent/process.mjs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { presentMcpResult, readOutputArtifact, readOriginalMcpArtifact, readOutputCollection, saveOutputArtifact, validateOutputLevel } from '../agent/output.mjs';

// tools/list is the text every schema-loading client pays, and a deferring client pays it per loaded
// tool (docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md: the per-tool prose was 56-68 % of each
// server's listing). So LEVEL stays bare, the hint goes once into initialize's instructions, and only
// output_read keeps the level prose.
const LEVEL = { type: 'string', enum: ['compact', 'diagnostic', 'full'], default: 'compact' };
const LEVEL_DOC = { ...LEVEL, description: 'Presentation only: compact (default), diagnostic, or the original full result.' };
const ENVELOPE = { type: 'object', required: ['outputLevel', 'summary', 'artifact'], properties: { outputLevel: { enum: ['compact', 'diagnostic'] }, summary: {}, artifact: { type: 'object' } } };
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
// Third-party servers that send no instructions of their own: a deferring client sees only tool names and
// instructions before it searches, so say when each server is the right one (docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md).
export const SERVER_PREFACES = {
  // The page is not served for them: name the URL and the command (a cold agent spent two calls finding both, MCP-REFINE-2026-10-30).
  'playwright-official': 'Host browser (browser_*): menus, HUD and UI flows like a player (844x390 landscape, touch first) at http://127.0.0.1:3456/ (`npx serve -l 3456 .`). browser_find beats a full snapshot. browser_close before apex_* browser tools; never beside a Playwright run or chrome-devtools.',
  'chrome-devtools': 'Live canvas over DevTools: __apex hooks (__apex.agentHelp() lists them), console, network, traces, heap, at http://127.0.0.1:3456/ (`npx serve -l 3456 .`). One browser at a time: never beside a Playwright run or the host browser_*.',
};
export const GATEWAY_INSTRUCTIONS = 'Output gateway: every tool takes outputLevel=compact(default)|diagnostic|full, presentation only (the action runs once). Saved evidence: the final-page retrieval tool (output_read; underscore-prefixed on a name collision) reads structuredContent.artifact.path or _meta["apex/agent-output"].artifact.path.';
// MCP 2025-06-18 ToolAnnotations defaults; a hint equal to its default says nothing.
const HINT_DEFAULTS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
// annotations.title is the older display name; Tool.title, when present, takes precedence, so an equal copy is dropped too.
export function withoutDefaultHints(annotations, toolTitle) {
  if (!annotations || typeof annotations !== 'object' || Array.isArray(annotations)) return annotations;
  return Object.fromEntries(Object.entries(annotations).filter(([k, v]) =>
    !(own(HINT_DEFAULTS, k) && HINT_DEFAULTS[k] === v) && !(k === 'title' && toolTitle !== undefined && v === toolTitle)));
}

// Moving a schema into anyOf changes the root of document-local JSON pointers.
// Rewrite only schema positions, leaving literal example/const payloads untouched.
function relocateSchema(original, prefix) {
  const singles = new Set(['additionalProperties', 'additionalItems', 'contains', 'contentSchema', 'else', 'if', 'then', 'items', 'not', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties']);
  const arrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  const maps = new Set(['$defs', 'definitions', 'dependentSchemas', 'dependencies', 'patternProperties', 'properties']);
  function move(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.$id) return schema;
    const out = { ...schema };
    for (const [key, value] of Object.entries(schema)) {
      if (['$ref', '$dynamicRef', '$recursiveRef'].includes(key) && typeof value === 'string' && (value === '#' || value.startsWith('#/'))) out[key] = prefix + value.slice(1);
      else if (singles.has(key)) out[key] = Array.isArray(value) ? value.map(move) : move(value);
      else if (arrays.has(key) && Array.isArray(value)) out[key] = value.map(move);
      else if (maps.has(key) && value && typeof value === 'object') out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, move(child)]));
    }
    return out;
  }
  return move(original);
}
function resultSchema(original) {
  return { type: 'object', anyOf: [relocateSchema(original, '#/anyOf/0'), ENVELOPE] };
}

function inputWithLevel(schema, parameter) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  // A local pointer is relative to its schema resource, not necessarily the
  // outer tool document. Keep the id on the decorated resource only: copying
  // it into the preserved source would change the relocated pointers' base.
  const resourceId = schema.$id;
  if (resourceId) { schema = { ...schema }; delete schema.$id; }
  const restoreId = result => resourceId ? { ...result, $id: resourceId } : result;
  const definitions = { ...schema.$defs }, adapted = new Map();
  let originalName = '__upstreamInput';
  while (own(definitions, originalName)) originalName = '_' + originalName;
  const originalPrefix = '#/$defs/' + originalName;
  function target(ref) {
    if (ref === '#') return schema;
    if (!ref.startsWith('#/')) return undefined;
    let value = schema;
    try {
      for (const part of decodeURIComponent(ref.slice(2)).split('/')) {
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
        if (!value || typeof value !== 'object' || !own(value, key)) return undefined;
        value = value[key];
      }
    } catch { return undefined; }
    return value;
  }
  function adapt(branch) {
    if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return branch;
    if (branch.$id) return inputWithLevel(branch, parameter);
    // A preserved source document keeps nested references to the root (or an
    // applicator) from resolving back into a gateway-decorated argument schema.
    const relocated = relocateSchema(branch, originalPrefix);
    const out = { ...relocated, properties: { ...relocated.properties, [parameter]: LEVEL } };
    // Only same-instance applicators get the presentation key. Leave property
    // values and the original definitions closed, even when they reuse a ref.
    if (typeof branch.$ref === 'string') {
      const source = target(branch.$ref);
      if (source !== undefined) {
        if (!adapted.has(branch.$ref)) {
          let name = '__outputLevel';
          while (own(definitions, name)) name = '_' + name;
          definitions[name] = {}; // reserve before following a recursive alias
          adapted.set(branch.$ref, '#/$defs/' + name);
          definitions[name] = adapt(source);
        }
        out.$ref = adapted.get(branch.$ref);
      }
    }
    for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(branch[key])) out[key] = branch[key].map(adapt);
    for (const key of ['if', 'then', 'else', 'not']) if (branch[key] !== undefined) out[key] = adapt(branch[key]);
    for (const key of ['dependentSchemas', 'dependencies']) if (branch[key] && typeof branch[key] === 'object') out[key] = Object.fromEntries(Object.entries(branch[key]).map(([name, child]) => [name, adapt(child)]));
    return out;
  }
  const result = adapt(schema);
  if (adapted.size) {
    definitions[originalName] = relocateSchema(schema, originalPrefix);
    result.$defs = definitions;
  } else {
    // No referenced same-instance schema was adapted, so references need no relocation.
    return restoreId(adaptWithoutRefs(schema));
  }
  return restoreId(result);

  function adaptWithoutRefs(branch) {
    if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return branch;
    if (branch.$id) return inputWithLevel(branch, parameter);
    const out = { ...branch, properties: { ...branch.properties, [parameter]: LEVEL } };
    for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(branch[key])) out[key] = branch[key].map(adaptWithoutRefs);
    for (const key of ['if', 'then', 'else', 'not']) if (branch[key] !== undefined) out[key] = adaptWithoutRefs(branch[key]);
    for (const key of ['dependentSchemas', 'dependencies']) if (branch[key] && typeof branch[key] === 'object') out[key] = Object.fromEntries(Object.entries(branch[key]).map(([name, child]) => [name, adaptWithoutRefs(child)]));
    return out;
  }
}

function runGateway({ server, command, args = [], root = process.cwd() }) {
  const processTree = spawnAgentProcess(command, args, { env: process.env, stdio: ['pipe', 'pipe', 'pipe'], cleanupOnExit: true });
  const { child } = processTree;
  const pending = new Map(), internal = new Map(), schemas = new Map();
  let retrievalName = 'output_read', stopping = false, stderrBytes = 0, discoveryComplete = false;
  let stderrArtifact, stderrFd, retentionError = false;
  const cancelled = new Set(), discovering = new Set();
  const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
  const upstream = message => child.stdin.writable && child.stdin.write(`${JSON.stringify(message)}\n`);
  const key = id => JSON.stringify(id);
  const error = (request, code, message) => { if (own(request, 'id')) send({ jsonrpc: '2.0', id: request.id, error: { code, message } }); };
  function remember(tool) {
    let parameter = 'outputLevel';
    // Do not reinterpret an upstream argument, including one hidden behind a schema composition.
    const serialized = JSON.stringify(tool.inputSchema ?? {});
    while (serialized.includes(JSON.stringify(parameter))) parameter = `_${parameter}`;
    schemas.set(tool.name, { tool, parameter });
    while (schemas.has(retrievalName)) retrievalName = `_${retrievalName}`;
  }
  function decorate(tool) {
    remember(tool);
    const { parameter } = schemas.get(tool.name);
    const input = tool.inputSchema ?? { type: 'object' };
    // The general hint is in the server instructions; a renamed level key is per tool, so it stays here.
    const collision = parameter !== 'outputLevel' ? { description: `${tool.description ?? ''}\nOutput level key: ${parameter} (upstream outputLevel unchanged; collision).` } : {};
    const annotations = tool.annotations ? { annotations: withoutDefaultHints(tool.annotations, tool.title) } : {};
    return { ...tool, ...collision, ...annotations, inputSchema: inputWithLevel(input, parameter), ...(tool.outputSchema ? { outputSchema: resultSchema(tool.outputSchema) } : {}) };
  }
  const retrieval = () => ({ name: retrievalName, description: 'Read saved evidence without repeating its action. format=page: byte pages. format=collection + pointer: exact JSON rows (limit 1..100, max 262144 bytes/page; nextOffset pages retained rows only). format=original + outputLevel=full: the original MCP blocks, images up to 8 MiB.', inputSchema: { type: 'object', properties: { artifact: { type: 'string', description: 'artifact.path returned by a previous tool call' }, format: { type: 'string', enum: ['page', 'collection', 'original'], default: 'page' }, pointer: { type: 'string', description: 'RFC 6901 pointer to retained array; embedded JSON text is decoded while traversing' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 65536 }, outputLevel: LEVEL_DOC }, required: ['artifact'], additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } });
  function discover(cursor) {
    return new Promise((resolve, reject) => {
      const id = `output-gateway:${randomUUID()}`;
      internal.set(key(id), { resolve, reject });
      upstream({ jsonrpc: '2.0', id, method: 'tools/list', ...(cursor !== undefined ? { params: { cursor } } : {}) });
    });
  }
  async function findSchema(name) {
    if (schemas.has(name) || discoveryComplete) return;
    let cursor;
    do {
      const reply = await discover(cursor);
      if (reply.error) throw new Error('Cannot inspect upstream tool schema: tools/list failed');
      for (const tool of reply.result?.tools ?? []) remember(tool);
      cursor = reply.result?.nextCursor;
      if (cursor === undefined) discoveryComplete = true;
    } while (cursor !== undefined && !schemas.has(name));
  }
  async function fromHost(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) { upstream(message); return; }
    if (message.method === 'notifications/cancelled' && discovering.has(key(message.params?.requestId))) cancelled.add(key(message.params.requestId));
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      try {
        if (own(message, 'id')) discovering.add(key(message.id));
        await findSchema(name);
        discovering.delete(key(message.id));
        if (own(message, 'id') && cancelled.delete(key(message.id))) { error(message, -32800, 'Request cancelled before dispatch'); return; }
        if (name === retrievalName) {
          const a = message.params?.arguments ?? {};
          const extra = Object.keys(a).filter(k => !['artifact', 'offset', 'limit', 'outputLevel', 'format', 'pointer'].includes(k));
          if (extra.length || (a.format !== undefined && !['page', 'collection', 'original'].includes(a.format)) || (a.pointer !== undefined && (typeof a.pointer !== 'string' || a.format !== 'collection')) || typeof a.artifact !== 'string' || (a.offset !== undefined && (!Number.isInteger(a.offset) || a.offset < 0)) || (a.limit !== undefined && (!Number.isInteger(a.limit) || a.limit < 1 || a.limit > 65536))) throw new Error('Invalid output_read arguments');
          const level = validateOutputLevel(a.outputLevel);
          let result;
          if (a.format === 'original') {
            if (level !== 'full' || a.offset !== undefined || a.limit !== undefined) throw new Error('format=original requires outputLevel=full and no offset/limit; use format=page for paged JSON evidence');
            result = readOriginalMcpArtifact({ root, artifact: a.artifact, maxBytes: 8 * 1024 * 1024 });
          } else {
            const page = a.format === 'collection' ? readOutputCollection({ root, artifact: a.artifact, pointer: a.pointer, offset: a.offset, limit: a.limit }) : readOutputArtifact({ root, artifact: a.artifact, offset: a.offset, limit: a.limit, level });
            // A byte page is the artifact's own text: send it as-is after a one-line header, never re-escaped
            // inside a JSON string (that cost ~2.1x the original, field test 2026-10-30).
            const { text, ...meta } = page;
            result = a.format === 'collection' || page.encoding
              ? { content: [{ type: 'text', text: JSON.stringify(page) }], structuredContent: page }
              : { content: [{ type: 'text', text: `${JSON.stringify(meta)}\n${text}` }], structuredContent: page };
          }
          if (own(message, 'id')) send({ jsonrpc: '2.0', id: message.id, result });
          return;
        }
        const parameter = schemas.get(name)?.parameter ?? 'outputLevel';
        const args = message.params?.arguments;
        const level = validateOutputLevel(args?.[parameter]);
        if (args && own(args, parameter)) {
          const forwarded = { ...args }; delete forwarded[parameter];
          message = { ...message, params: { ...message.params, arguments: forwarded } };
        }
        if (own(message, 'id')) pending.set(key(message.id), { method: 'tools/call', level, name });
      } catch (e) { discovering.delete(key(message.id)); cancelled.delete(key(message.id)); error(message, -32602, e.message); return; }
    } else if ((message.method === 'tools/list' || message.method === 'initialize') && own(message, 'id')) pending.set(key(message.id), { method: message.method });
    upstream(message);
  }
  function fromChild(message) {
    if (message.method === 'notifications/tools/list_changed') { schemas.clear(); discoveryComplete = false; retrievalName = 'output_read'; }
    if (!message.method && own(message, 'id')) {
      const internalRequest = internal.get(key(message.id));
      if (internalRequest) { internal.delete(key(message.id)); internalRequest.resolve(message); return; }
      const request = pending.get(key(message.id));
      pending.delete(key(message.id)); cancelled.delete(key(message.id));
      if (request && own(message, 'result')) {
        if (request.method === 'initialize') {
          const upstreamText = typeof message.result?.instructions === 'string' && message.result.instructions ? message.result.instructions : SERVER_PREFACES[server] ?? '';
          message = { ...message, result: { ...message.result, instructions: upstreamText ? `${upstreamText}\n\n${GATEWAY_INSTRUCTIONS}` : GATEWAY_INSTRUCTIONS } };
        } else if (request.method === 'tools/list') {
          // Cache the whole page before descriptions are generated (including reserved-name collisions).
          for (const tool of message.result.tools ?? []) remember(tool);
          const tools = (message.result.tools ?? []).map(decorate);
          if (message.result.nextCursor === undefined) { discoveryComplete = true; tools.push(retrieval()); }
          message = { ...message, result: { ...message.result, tools } };
        } else {
          try { message = { ...message, result: presentMcpResult(message.result, { root, tool: `${server}/${request.name}`, level: request.level }) }; }
          catch { /* Preserve the original evidence if presentation or persistence fails. */ }
        }
      }
    }
    send(message);
  }
  const hostLines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const childLines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  hostLines.on('line', line => { try { const msg = JSON.parse(line); void fromHost(msg); } catch { if (child.stdin.writable) child.stdin.write(`${line}\n`); } });
  childLines.on('line', line => { try { fromChild(JSON.parse(line)); } catch { process.stdout.write(`${line}\n`); } });
  function retainStderr(chunk) {
    stderrBytes += chunk.length;
    try {
      if (!stderrArtifact) {
        stderrArtifact = saveOutputArtifact('', { root, tool: `${server}-stderr`, kind: 'stderr' });
        stderrFd = fs.openSync(path.resolve(root, stderrArtifact.path), fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
      }
      fs.writeSync(stderrFd, chunk);
    } catch { retentionError = true; }
  }
  child.stderr.on('data', retainStderr);
  function stop() {
    if (stopping) return;
    stopping = true;
    void processTree.stop({ graceful: true });
  }
  hostLines.on('close', stop);
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  child.stdin.on('error', () => {});
  child.on('error', error => {
    retainStderr(Buffer.from(`Unable to start ${server}: ${error.stack ?? error.message}\n`));
    hostLines.close(); process.stdin.destroy();
  });
  void processTree.done.then(({ exitCode, signal, error, cleanupError, survivors }) => {
    for (const request of internal.values()) request.reject(new Error('Upstream server exited'));
    internal.clear();
    if (stderrFd !== undefined) { try { fs.closeSync(stderrFd); } catch {} }
    if ((!stopping && (exitCode || signal)) || error || cleanupError) {
      const diagnostic = stderrArtifact ? `stderr retained at ${stderrArtifact.path} (${stderrBytes} bytes${retentionError ? ', retention incomplete' : ''})` : 'no stderr diagnostic retained';
      process.stderr.write(`output-level-mcp: ${server} ${cleanupError ? 'cleanup failed' : error ? 'unable to start' : 'exited'} (${cleanupError ? `${cleanupError}; survivors=${(survivors ?? []).join(',')}` : error?.code ?? exitCode ?? signal}); ${diagnostic}\n`);
    }
    process.exitCode = error || cleanupError ? 1 : stopping ? 0 : (exitCode ?? 1);
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    hostLines.close(); process.stdin.destroy();
  });
  return child;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), split = args.indexOf('--');
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: node tools/mcp/output-level-mcp.mjs --server NAME -- EXECUTABLE [ARGS...]\nAdds compact (default), diagnostic, full outputLevel and output_read saved-result paging.\n');
  } else if (split !== 2 || args[0] !== '--server' || !args[1] || !args[split + 1]) {
    process.stderr.write('Expected --server NAME -- EXECUTABLE [ARGS...]; use --help\n'); process.exitCode = 2;
  } else runGateway({ server: args[1], command: args[split + 1], args: args.slice(split + 2) });
}
