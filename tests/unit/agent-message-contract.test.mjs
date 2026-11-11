import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope, formatMessage, parseMessage } from '../../tools/agent/message.mjs';
const fresh = () => ({schema:'apex.message.v1',messageId:'task-1',repo:'brycejmurrin/f1-game',thread:{kind:'issue',number:42},recipient:'grok:owner',kind:'request',sourceSha:'a'.repeat(40),expiresAt:'2026-11-01T12:00:00Z',replyTo:null,body:'Read the PR and report evidence.'});
test('message roundtrip preserves Unicode and marker text inside JSON body', () => {
  const value = {...fresh(),body:'🧭\n```apex-message\nnot another envelope\n```'};
  assert.deepEqual(parseMessage(' \n'+formatMessage(value)+'\n ', {repo:value.repo,issue:42,kind:'issue'}), value);
  assert.equal(validateEnvelope(value), value);
  assert.equal(parseMessage('ordinary human comment'), null);
});
test('message rejects injected prose, malformed JSON and multiple envelopes', () => {
  const valid = formatMessage(fresh());
  for (const body of ['prefix\n'+valid,valid+'\nsuffix',valid+'\n'+valid,'```apex-message\n{bad}\n```','```apex-messageX\n{}\n```','```apex-message\n{}']) assert.throws(()=>parseMessage(body));
});
test('message enforces exact fields, types, schema and identifiers', () => {
  const invalid = [
    {...fresh(),extra:true}, {...fresh(),schema:'apex.message.v2'}, {...fresh(),thread:{kind:'issue',number:42,extra:1}},
    {...fresh(),thread:{kind:'issue',number:0}}, {...fresh(),thread:{kind:'issue',number:Number.MAX_SAFE_INTEGER+1}},
    {...fresh(),recipient:'other:owner'}, {...fresh(),recipient:'codex:route\n'}, {...fresh(),repo:'owner/repo/more'},
    {...fresh(),messageId:'é'}, {...fresh(),messageId:'x'.repeat(129)}, {...fresh(),sourceSha:'a'.repeat(39)},
    {...fresh(),replyTo:42}, {...fresh(),kind:'approved'}, {...fresh(),body:'  '}, {...fresh(),body:'\ud800'}
  ];
  for (const value of invalid) assert.throws(()=>validateEnvelope(value));
  const missing=fresh(); delete missing.replyTo; assert.throws(()=>validateEnvelope(missing));
});
test('message rejects invalid dates and timezone offsets instead of normalizing them', () => {
  for (const expiresAt of ['2026-02-30T12:00:00Z','2026-11-01T24:00:00Z','2026-11-01T12:00:00+00:00','2026-11-01','2026-11-01T12:00:60Z']) assert.throws(()=>validateEnvelope({...fresh(),expiresAt}));
  validateEnvelope({...fresh(),expiresAt:'2026-11-01T12:00:00.001Z'});
});
test('message scope binds repo, thread number and thread kind without asserting authority', () => {
  for (const scope of [{repo:'other/repo'},{issue:43},{kind:'pull_request'}]) assert.throws(()=>parseMessage(formatMessage(fresh()),scope),/scope mismatch/);
  validateEnvelope({...fresh(),thread:{kind:'pull_request',number:42}}, {kind:'pull_request'});
});
test('message measures UTF8 body bytes and encoded envelope size separately', () => {
  validateEnvelope({...fresh(),body:'🧭'.repeat(2048)});
  assert.throws(()=>validateEnvelope({...fresh(),body:'🧭'.repeat(2048)+'x'}));
  assert.throws(()=>validateEnvelope({...fresh(),body:'\u0000'.repeat(8192)}),/16 KiB/);
  assert.throws(()=>parseMessage('```apex-message\n'+ ' '.repeat(17000)+'{}\n```'));
});
