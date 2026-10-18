#!/usr/bin/env node
// @doc Wrap a stdio MCP server with bounded output levels and saved-result retrieval.
import fs from 'node:fs';
import { spawnAgentProcess } from '../lib/agent-process.mjs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { presentMcpResult, readOutputArtifact, readOriginalMcpArtifact, saveOutputArtifact, validateOutputLevel } from '../lib/agent-output.mjs';

const LEVEL = { type: 'string', enum: ['compact', 'diagnostic', 'full'], default: 'compact', description: 'Presentation only: compact (default), diagnostic, or original full result. The action executes once; use the saved-result retrieval tool for saved evidence.' };
const ENVELOPE = { type: 'object', required: ['outputLevel', 'summary', 'artifact'], properties: { outputLevel: { enum: ['compact', 'diagnostic'] }, summary: {}, artifact: { type: 'object' } } };
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Moving a schema into anyOf changes the root of document-local JSON pointers.
// Rewrite only schema positions, leaving literal example/const payloads untouched.
function resultSchema(original) {
  const singles = new Set(['additionalProperties', 'additionalItems', 'contains', 'contentSchema', 'else', 'if', 'then', 'items', 'not', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties']);
  const arrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  const maps = new Set(['$defs', 'definitions', 'dependentSchemas', 'dependencies', 'patternProperties', 'properties']);
  function move(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.$id) return schema;
    const out = { ...schema };
    for (const [key, value] of Object.entries(schema)) {
      if (['$ref', '$dynamicRef', '$recursiveRef'].includes(key) && typeof value === 'string' && (value === '#' || value.startsWith('#/'))) out[key] = '#/anyOf/0' + value.slice(1);
      else if (singles.has(key)) out[key] = Array.isArray(value) ? value.map(move) : move(value);
      else if (arrays.has(key) && Array.isArray(value)) out[key] = value.map(move);
      else if (maps.has(key) && value && typeof value === 'object') out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, move(child)]));
    }
    return out;
  }
  return { type: 'object', anyOf: [move(original), ENVELOPE] };
}

function inputWithLevel(schema, parameter) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const result = { ...schema, properties: { ...schema.properties, [parameter]: LEVEL } };
  // Composition branches validate the same argument object. Closed branches
  // must recognize the presentation key too, before the gateway strips it.
  for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(schema[key])) result[key] = schema[key].map(branch => inputWithLevel(branch, parameter));
  for (const key of ['if', 'then', 'else', 'not']) if (schema[key] !== undefined) result[key] = inputWithLevel(schema[key], parameter);
  return result;
}

export function runGateway({ server, command, args = [], root = process.cwd() }) {
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
    const description = `${tool.description ?? ''}\nOutput presentation: ${parameter}=compact (default), diagnostic, or full. Use the saved-result retrieval tool listed on the final tools/list page with artifact.path to inspect saved evidence without rerunning the action.${parameter !== 'outputLevel' ? ' The upstream outputLevel argument is preserved; the wrapper uses ' + parameter + ' to avoid a collision.' : ''}`;
    return { ...tool, description, inputSchema: inputWithLevel(input, parameter), ...(tool.outputSchema ? { outputSchema: resultSchema(tool.outputSchema) } : {}) };
  }
  const retrieval = () => ({ name: retrievalName, description: 'Read a saved original result without executing its action again. Default format=page returns bounded UTF-8 JSON text; it does not render saved images. Use format=original with outputLevel=full to return original MCP content blocks, including images, up to 8 MiB, without rerunning. nextOffset continues page retrieval.', inputSchema: { type: 'object', properties: { artifact: { type: 'string', description: 'artifact.path returned by a previous tool call' }, format: { type: 'string', enum: ['page', 'original'], default: 'page' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 65536 }, outputLevel: LEVEL }, required: ['artifact'], additionalProperties: false }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } });
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
          const extra = Object.keys(a).filter(k => !['artifact', 'offset', 'limit', 'outputLevel', 'format'].includes(k));
          if (extra.length || (a.format !== undefined && !['page', 'original'].includes(a.format)) || typeof a.artifact !== 'string' || (a.offset !== undefined && (!Number.isInteger(a.offset) || a.offset < 0)) || (a.limit !== undefined && (!Number.isInteger(a.limit) || a.limit < 1 || a.limit > 65536))) throw new Error('Invalid output_read arguments');
          const level = validateOutputLevel(a.outputLevel);
          let result;
          if (a.format === 'original') {
            if (level !== 'full' || a.offset !== undefined || a.limit !== undefined) throw new Error('format=original requires outputLevel=full and no offset/limit; use format=page for paged JSON evidence');
            result = readOriginalMcpArtifact({ root, artifact: a.artifact, maxBytes: 8 * 1024 * 1024 });
          } else {
            const page = readOutputArtifact({ root, artifact: a.artifact, offset: a.offset, limit: a.limit, level });
            result = { content: [{ type: 'text', text: JSON.stringify(page) }], structuredContent: page };
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
    } else if (message.method === 'tools/list' && own(message, 'id')) pending.set(key(message.id), { method: 'tools/list' });
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
        if (request.method === 'tools/list') {
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
