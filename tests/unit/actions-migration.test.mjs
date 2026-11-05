import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSnapshot, importSnapshot, planMigration, applyMigration, snapshotDigest, verifySnapshotCurrent } from '../../tools/ci/actions/migration.mjs';
import { requestFromPR } from '../../tools/ci/actions/requests.mjs';
const NOW = '2026-11-05T00:00:00Z';
const labels = ['queue:paused', 'queue:priority'].map(name => ({ name, color: '123456', description: name }));
const response = json => ({ status: 200, json });
const issue = (number, extra = {}) => ({ number, state: 'open', labels: [], body: '', ...extra });
const pr = (number, extra = {}) => issue(number, { pull_request: {}, pullRequest: { draft: false, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) } }, ...extra });
function snapshot(items = [], extra = {}) {
  const s = { schema: 1, repo: 'owner/repo', capturedAt: NOW, complete: true, labels: ['ready', 'claimed', 'hold', 'land', 'priority', 'needs-decision', 'batch', 'dispatch:pause', 'dispatch:merge-pause'].map(name => ({ name })), items, ...extra };
  s.digest = snapshotDigest(s); return s;
}
const options = plan => ({ dryRun: false, activeCutover: true, durableBackup: { verified: true, snapshotDigest: plan.snapshotDigest, receipt: 'commit:backup' }, oldConsumersDisabled: { verified: true, receipt: 'freeze:verified' } });

test('export paginates all labels and all issue/PR states including closed attachments', async () => {
  const definitions = Array.from({ length: 52 }, (_, n) => ({ name: `label${n}`, color: '123456' }));
  const items = Array.from({ length: 101 }, (_, n) => issue(n + 1, { state: 'closed', labels: [{ name: 'label1' }] }));
  const request = async path => path.startsWith('labels?') ? response(definitions) : path.startsWith('issues?') ? response(path.endsWith('page=1') ? items.slice(0, 100) : items.slice(100)) : assert.fail(path);
  const s = await exportSnapshot({ request }); assert.equal(s.labels.length, 52); assert.equal(s.items.length, 101);
  assert.deepEqual(s.items[100].labels, [{ name: 'label1' }]); assert.equal(s.complete, true);
  assert.equal(importSnapshot(JSON.stringify(s)).digest, s.digest);
});

test('missing or duplicated pagination fails closed rather than exporting incomplete attachments', async () => {
  const request = async path => path.startsWith('labels') ? response([]) : path.endsWith('page=1') ? response(Array.from({ length: 100 }, (_, n) => issue(n))) : { status: 403, error: 'limited' };
  await assert.rejects(exportSnapshot({ request }), /incomplete/);
  await assert.rejects(exportSnapshot({ request: async path => path.startsWith('labels') ? response([]) : response([issue(1), issue(1)]) }), /Duplicate/);
});

test('migration imports open PRs only; issue claims/batches remain archival and never grant implementation work', () => {
  const s = snapshot([issue(1, { labels: [{ name: 'batch' }], body: '## Members\n- #2\n- #2' }), issue(2, { labels: [{ name: 'claimed' }] }), pr(3), pr(4, { state: 'closed' })]);
  const p = planMigration(s, { labels }); assert.deepEqual(p.requests.map(r => r.number), [3]);
  assert.ok(p.requests.every(r => r.kind === 'pr' && !('owner' in r) && !('members' in r) && !('workerLaunch' in r)));
  assert.equal(p.records[0].mergeRequested, false); assert.equal(p.records[0].ready, true); assert.deepEqual(p.records[0].queueLabels, []);
  assert.equal(p.requests[0].headSha, 'a'.repeat(40)); assert.equal(p.requests[0].baseSha, 'b'.repeat(40));
});

test('old claimed/lane ownership does not pause PR test admission or introduce host ownership', () => {
  const p = planMigration(snapshot([pr(1, { labels: [{ name: 'claimed' }] })]), { labels });
  assert.equal(p.records[0].paused, false); assert.equal(p.records[0].pauseOwner, false);
  assert.deepEqual(p.requests[0].blockers, []); assert.equal(p.requests[0].owner, undefined);
  assert.equal(p.requests[0].paused, true, 'only migration staging pauses until verified activation');
});

test('legacy PR holds and decisions remain sticky through refresh; direct owner may release the pause', () => {
  for (const label of ['hold', 'needs-decision']) {
    const record = planMigration(snapshot([pr(7, { labels: [{ name: label }] })]), { labels }).requests[0];
    assert.equal(record.pauseOwner, true);
    const current = { number: 7, state: 'open', labels: [], head: { sha: record.sourceSha }, base: { sha: record.baseSha } };
    const agent = { event: 'unlabeled', label: { name: 'queue:paused' }, actor: { login: 'worker' }, performed_via_github_app: null, created_at: NOW };
    const refreshed = requestFromPR(current, { previous: record, events: [agent], owner: 'owner' });
    assert.equal(refreshed.pauseOwner, true); assert.equal(refreshed.paused, true);
    const direct = { ...agent, actor: { login: 'owner' }, created_at: '2026-11-05T00:01:00Z' };
    assert.equal(requestFromPR(current, { previous: refreshed, events: [agent, direct], owner: 'owner' }).pauseOwner, false);
  }
});

test('priority requires latest direct owner provenance and applies only to PRs', () => {
  for (const [event, expected] of [
    [undefined, false],
    [{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'worker' }, performed_via_github_app: null }, false],
    [{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' }, performed_via_github_app: {} }, false],
    [{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' }, performed_via_github_app: null }, true],
  ]) {
    const p = planMigration(snapshot([pr(1, { labels: [{ name: 'priority' }], controlEvents: event ? [event] : [] })]), { labels });
    assert.equal(p.requests[0].priority, expected); assert.deepEqual(p.records[0].queueLabels, expected ? ['queue:priority'] : []);
  }
});

test('global implementation pause stays archival; legacy merge pause remains an operator control', () => {
  const p = planMigration(snapshot([issue(3899, { labels: [{ name: 'dispatch:pause' }, { name: 'dispatch:merge-pause' }] })]), { labels });
  assert.deepEqual(p.controls, { validation: false, merges: true }); assert.deepEqual(p.requests, []);
  assert.equal(p.controls.workers, undefined);
  const event = { event: 'unlabeled', label: { name: 'dispatch:merge-pause' }, actor: { login: 'owner' }, performed_via_github_app: null };
  assert.equal(planMigration(snapshot([issue(3899, { labels: [{ name: 'dispatch:merge-pause' }], controlEvents: [event] })]), { labels }).controls.merges, false);
});

test('catalog and snapshot digest must be valid before any migration', () => {
  assert.throws(() => planMigration(snapshot(), { labels: [...labels, { name: 'queue:ready' }] }), /two PR queue labels/);
  const s = snapshot(); s.items.push(issue(99)); assert.throws(() => planMigration(s, { labels }), /digest/);
});

test('dry run has no effects and apply requires verified backup/freeze receipts', async () => {
  const p = planMigration(snapshot(), { labels }); let calls = 0;
  assert.equal((await applyMigration(p, { request: () => calls++ })).dryRun, true); assert.equal(calls, 0);
  await assert.rejects(applyMigration(p, { dryRun: false }), /Verified/);
  await assert.rejects(applyMigration(p, { ...options(p), checkpoint: async () => { throw Error('not durable'); }, request: async () => { calls++; } }), /not durable/);
  assert.equal(calls, 0);
});

test('all 52 definitions delete sequentially; new labels apply only to open PR pause/priority intent', async () => {
  const old = Array.from({ length: 52 }, (_, n) => ({ name: n === 0 ? 'hold' : `old-${n}` }));
  const p = planMigration(snapshot([issue(1, { labels: [{ name: 'hold' }] }), pr(2, { labels: [{ name: 'hold' }] }), pr(3), pr(4, { state: 'closed' })], { labels: old }), { labels });
  const calls = []; let checkpointed = 0;
  const result = await applyMigration(p, { ...options(p), checkpoint: async state => { checkpointed = state.completed.length; }, request: async (path, { method, body }) => {
    calls.push({ path, method, body });
    if (method === 'DELETE') { assert.equal(checkpointed, calls.filter(c => c.method === 'DELETE').length - 1); return { status: 204 }; }
    if (path.startsWith('labels/') && method === 'GET') return { status: 404 };
    if (method === 'GET') return response(pr(2));
    return { status: 201 };
  } });
  assert.equal(result.stage, 'complete'); assert.equal(calls.filter(c => c.method === 'DELETE').length, 52);
  assert.deepEqual(calls.filter(c => c.path.startsWith('issues/') && c.method === 'POST').map(c => [c.path, c.body]), [['issues/2/labels', { labels: ['queue:paused'] }]]);
});

test('partial reset resumes completed deletes and tolerates already-absent labels', async () => {
  const p = planMigration(snapshot(), { labels }); let fail = true, saved; const calls = [];
  const request = async (path, { method }) => {
    calls.push({ path, method });
    if (method === 'DELETE' && path === 'labels/hold' && fail) { fail = false; return { status: 500 }; }
    return method === 'GET' ? { status: 404 } : { status: method === 'DELETE' ? 404 : 201 };
  };
  const checkpoint = async state => { saved = structuredClone(state); };
  await assert.rejects(applyMigration(p, { ...options(p), request, checkpoint }), /delete:hold/);
  await applyMigration(p, { ...options(p), request, checkpoint, resume: saved });
  assert.equal(calls.filter(c => c.method === 'DELETE' && c.path === 'labels/ready').length, 1);
});

test('freshness detects closed attachments and active PR control changes without requiring agent data', async () => {
  const data = { labels: [{ name: 'hold' }], items: [pr(1), issue(2, { state: 'closed', labels: [{ name: 'hold' }] })], events: [] };
  const request = async (path, { method }) => {
    assert.equal(method, 'GET');
    if (path.startsWith('labels?')) return response(structuredClone(data.labels));
    if (path.startsWith('issues?')) return response(structuredClone(data.items));
    if (path.startsWith('issues/1/events?')) return response(structuredClone(data.events));
    if (path.startsWith('issues/1/comments?')) return response([]);
    if (path === 'pulls/1') return response(data.items[0].pullRequest);
    assert.fail(path);
  };
  const s = await exportSnapshot({ request }); assert.equal((await verifySnapshotCurrent({ request, snapshot: s })).verified, true);
  data.items[1].labels = []; await assert.rejects(verifySnapshotCurrent({ request, snapshot: s }), /Snapshot stale/);
  data.items[1].labels = [{ name: 'hold' }]; data.events = [{ event: 'labeled', label: { name: 'hold' } }];
  await assert.rejects(verifySnapshotCurrent({ request, snapshot: s }), /Snapshot stale/);
});


test('ready unlabelled PR queues validation metadata without granting merge intent', () => {
  const p = planMigration(snapshot([pr(1), pr(2, { labels: [{ name: 'land' }] }), pr(3, { pullRequest: { draft: true, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) } } })]), { labels });
  const ready = p.requests.find(record => record.number === 1);
  assert.equal(ready.kind, 'pr'); assert.equal(ready.ready, true); assert.equal(ready.draft, false);
  assert.equal(ready.mergeRequested, false); assert.deepEqual(ready.blockers, []);
  assert.deepEqual(p.records.find(record => record.number === 1).queueLabels, []);
  assert.equal(p.requests.find(record => record.number === 2).mergeRequested, true);
  assert.equal(p.requests.find(record => record.number === 3).ready, false);
});
