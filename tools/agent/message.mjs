// @doc Validate and encode untrusted versioned GitHub agent-message envelopes.
const SCHEMA = 'apex.message.v1';
const MAX_ENVELOPE_BYTES = 16 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const RECIPIENT = /^(codex|claude|cursor|grok):[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const FIELDS = ['schema','messageId','repo','thread','recipient','kind','sourceSha','expiresAt','replyTo','body'];
function fail(message) { throw new Error('Invalid agent message: ' + message); }
function exactObject(value, fields, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(name + ' must be an object');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) fail(name + ' fields must be exactly ' + fields.join(', '));
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.get || descriptor.set || !descriptor.enumerable) fail(name + ' fields must be enumerable data properties');
  }
}
function utcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === (value.includes('.') ? value : value.slice(0,-1) + '.000Z');
}

// Validation establishes shape and scope only, never sender authority or delivery.
export function validateEnvelope(value, { repo, issue, kind } = {}) {
  exactObject(value, FIELDS, 'envelope');
  if (value.schema !== SCHEMA) fail('unsupported schema');
  if (typeof value.messageId !== 'string' || !ID.test(value.messageId)) fail('messageId must be an ASCII identifier of at most 128 characters');
  if (typeof value.repo !== 'string' || !REPO.test(value.repo)) fail('repo must be owner/name');
  exactObject(value.thread, ['kind','number'], 'thread');
  if (!['issue','pull_request'].includes(value.thread.kind) || !Number.isSafeInteger(value.thread.number) || value.thread.number < 1) fail('invalid thread');
  if (typeof value.recipient !== 'string' || !RECIPIENT.test(value.recipient)) fail('invalid recipient host:route');
  if (!['request','handoff','result','ack'].includes(value.kind)) fail('invalid message kind');
  if (typeof value.sourceSha !== 'string' || !/^[a-fA-F0-9]{40}$/.test(value.sourceSha)) fail('sourceSha must be 40 hex characters');
  if (!utcTimestamp(value.expiresAt)) fail('expiresAt must be a valid UTC ISO timestamp');
  if (value.replyTo !== null && (typeof value.replyTo !== 'string' || !ID.test(value.replyTo))) fail('invalid replyTo');
  if (typeof value.body !== 'string' || !value.body.trim() || !value.body.isWellFormed() || Buffer.byteLength(value.body, 'utf8') > 8192) fail('body must be nonempty UTF8 of at most 8192 bytes');
  if (repo !== undefined && value.repo !== repo) fail('repo scope mismatch');
  if (issue !== undefined && value.thread.number !== issue) fail('issue scope mismatch');
  if (kind !== undefined && value.thread.kind !== kind) fail('thread kind scope mismatch');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_ENVELOPE_BYTES) fail('envelope exceeds 16 KiB');
  return value;
}

export function formatMessage(envelope) {
  validateEnvelope(envelope);
  return '```apex-message\n' + JSON.stringify(envelope) + '\n```';
}

export function parseMessage(body, scope) {
  if (typeof body !== 'string') fail('comment body must be a string');
  if (!body.includes('```apex-message')) return null;
  const match = body.match(/^\s*```apex-message\r?\n([\s\S]*)\r?\n```\s*$/);
  if (!match) fail('message must occupy the entire comment');
  if (Buffer.byteLength(match[1], 'utf8') > MAX_ENVELOPE_BYTES) fail('envelope exceeds 16 KiB');
  let envelope;
  try { envelope = JSON.parse(match[1]); } catch { fail('malformed envelope JSON'); }
  return validateEnvelope(envelope, scope);
}
