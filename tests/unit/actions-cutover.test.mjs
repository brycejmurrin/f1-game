import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyInstallation, activate, rollback } from '../../tools/ci/actions/cutover.mjs';
import { snapshotDigest } from '../../tools/ci/actions/migration.mjs';
const sha = 'a'.repeat(40), tree = 'b'.repeat(40), blob = 'c'.repeat(40);
const workflows = ['actions-coordinator.yml', 'actions-worker.yml', 'actions-validation.yml'];
function fixture() {
  const snapshot = { schema: 1, repo: 'o/r', complete: true, labels: [], items: [] }; snapshot.digest = snapshotDigest(snapshot);
  const state = { mode: 'paused', controls: { validation: true, merges: true }, migration: { stage: 'complete', frozenAt: '2026-11-05T00:00:00Z', controlsBeforeFreeze: { validation: false, merges: false }, planDigest: 'plan', snapshotDigest: snapshot.digest, checkpoint: { stage: 'complete', snapshotDigest: snapshot.digest, backupReceipt: `migrations/snapshot.json@${blob}`, records: [{ number: 1, kind: 'pr', paused: false }, { number: 2, kind: 'pr', paused: true }] } }, requests: { a: { number: 1, kind: 'pr', paused: true, blockers: [] }, b: { number: 2, kind: 'pr', paused: true, blockers: ['sticky-hold'] } } };
  const calls = []; let variable = 'paused';
  const request = async (path, options = {}) => {
    const method = options.method || 'GET'; calls.push({ path, method, body: options.body });
    if (method !== 'GET') { if (path.startsWith('actions/variables')) { variable = options.body.value; return { status: 204 }; } throw Error('unexpected mutation'); }
    let json;
    if (path === '') json = { default_branch: 'protected', full_name: 'o/r' };
    else if (path === 'branches/protected') json = { protected: true, commit: { sha } };
    else if (path === `git/commits/${sha}`) json = { sha, tree: { sha: tree } };
    else if (path.startsWith('contents/.github/workflows/')) json = { type: 'file', sha: blob };
    else if (path.startsWith('actions/workflows/')) { const name = path.split('/').at(-1); json = { id: workflows.indexOf(name) + 1, path: `.github/workflows/${name}`, state: ['dispatch.yml', 'land.yml'].includes(name) ? 'disabled_manually' : 'active' }; }
    else if (path.startsWith('actions/variables?')) json = { variables: [{ name: 'ACTIONS_COORDINATOR_MODE', value: variable }] };
    else if (path === 'actions/variables/ACTIONS_COORDINATOR_MODE') json = { value: variable };
    else if (path === 'actions/runs/123' || path === 'actions/runs/123/attempts/1') json = { workflow_id: 3, status: 'completed', conclusion: 'success', run_attempt: 1, head_sha: sha, path: '.github/workflows/actions-validation.yml', head_repository: { full_name: 'o/r' } };
    else if (path.startsWith('actions/runs/123/attempts/1/jobs?')) json = { jobs: [{ name: 'Actions validation', status: 'completed', conclusion: 'success' }] };
    else if (path === 'contents/migrations/snapshot.json?ref=bot%2Factions-state') json = { sha: blob, encoding: 'base64', content: Buffer.from(JSON.stringify(snapshot)).toString('base64') };
    else if (path.startsWith('labels?')) json = ['queue:paused', 'queue:priority'].map(name => ({ name }));
    else throw Error(path);
    return { status: 200, json };
  };
  const store = { read: () => ({ state: structuredClone(state), sha: 'ledger', missing: false }), update: fn => { const result = fn(state); return { state, result }; } };
  return { state, request, store, calls };
}

test('read-only preflight verifies default protected tree, installed workflows and successful exact validation job', async () => {
  const f = fixture(), proof = await verifyInstallation({ request: f.request, validationRunId: 123 });
  assert.equal(proof.treeSha, tree); assert.equal(proof.workflows.length, 3);
  assert.ok(f.calls.every(c => c.method === 'GET'));
});

test('source mismatch, nonterminal attempt and inaccessible variables fail closed without mutations', async () => {
  for (const scenario of ['tree', 'attempt', 'variables']) {
    const f = fixture(); const request = async (path, options) => {
      if (scenario === 'variables' && path.startsWith('actions/variables?')) return { status: 403, error: 'not permitted' };
      if (scenario === 'tree' && path.startsWith('git/commits/d')) return { status: 200, json: { tree: { sha: 'e'.repeat(40) } } };
      const r = await f.request(path, options);
      if (scenario === 'tree' && ['actions/runs/123', 'actions/runs/123/attempts/1'].includes(path)) r.json.head_sha = 'd'.repeat(40);
      if (scenario === 'attempt' && path === 'actions/runs/123/attempts/1') r.json.status = 'in_progress';
      return r;
    };
    await assert.rejects(verifyInstallation({ request, validationRunId: 123 }));
    assert.ok(f.calls.every(c => c.method === 'GET'));
  }
});

test('activate flips variable before ledger, clears staging alone and is idempotent', async () => {
  const f = fixture(); const update = f.store.update;
  f.store.update = fn => { assert.ok(f.calls.some(c => c.method === 'PATCH' && c.body.value === 'active')); return update(fn); };
  await activate({ ...f, validationRunId: 123, now: 'fixed' });
  assert.equal(f.state.mode, 'active'); assert.equal(f.state.requests.a.paused, false); assert.equal(f.state.requests.b.paused, true);
  await activate({ ...f, validationRunId: 123, now: 'fixed' });
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 1);
});

test('a crash after variable mutation leaves paused ledger and retry completes safely', async () => {
  const f = fixture(); const update = f.store.update; f.store.update = () => { throw Error('CAS failed'); };
  await assert.rejects(activate({ ...f, validationRunId: 123 }), /CAS failed/); assert.equal(f.state.mode, 'paused');
  f.store.update = update; await activate({ ...f, validationRunId: 123 }); assert.equal(f.state.mode, 'active');
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 1);
});

test('extra live label, enabled old consumer or changed backup prevents activation mutation', async () => {
  for (const scenario of ['label', 'consumer', 'backup']) {
    const f = fixture(); const request = async (path, options) => {
      const r = await f.request(path, options);
      if (scenario === 'label' && path.startsWith('labels?')) r.json.push({ name: 'old' });
      if (scenario === 'consumer' && path === 'actions/workflows/land.yml') r.json.state = 'active';
      if (scenario === 'backup' && path.startsWith('contents/migrations/')) r.json.sha = 'd'.repeat(40);
      return r;
    };
    await assert.rejects(activate({ ...f, request, validationRunId: 123 })); assert.equal(f.state.mode, 'paused'); assert.ok(f.calls.every(c => c.method === 'GET'));
  }
});

test('large backup Contents response verifies immutable blob instead of skipping readback', async () => {
  const f = fixture(); let content;
  const request = async (path, options) => {
    if (path === `git/blobs/${blob}`) return { status: 200, json: { sha: blob, encoding: 'base64', content } };
    const r = await f.request(path, options);
    if (path.startsWith('contents/migrations/')) { content = r.json.content; r.json = { sha: blob, encoding: 'none' }; }
    return r;
  };
  await activate({ ...f, request, validationRunId: 123 }); assert.equal(f.state.mode, 'active');
});

test('new variable creation uses POST and failed write never activates ledger', async () => {
  for (const fail of [false, true]) {
    const f = fixture(); const request = async (path, options) => {
      if (path.startsWith('actions/variables?')) return { status: 200, json: { variables: [] } };
      if (fail && options?.method === 'POST') return { status: 403, error: 'variables write forbidden' };
      return f.request(path, options);
    };
    if (fail) { await assert.rejects(activate({ ...f, request, validationRunId: 123 }), /forbidden/); assert.equal(f.state.mode, 'paused'); }
    else { await activate({ ...f, request, validationRunId: 123 }); assert.equal(f.calls.filter(c => c.method === 'POST').length, 1); }
  }
});

test('activation restores pre-freeze controls but retains later owner pauses and pause provenance', async () => {
  const f = fixture();
  f.state.migration.controlsBeforeFreeze.merges = true;
  f.state.controlProvenance = { validation: { at: '2026-11-05T00:00:01Z', paused: true, actor: 'owner' }, merges: { at: '2026-11-04T00:00:00Z', paused: true, actor: 'owner' } };
  f.state.requests.a.pauseOwner = true;
  await activate({ ...f, validationRunId: 123 });
  assert.deepEqual(f.state.controls, { validation: true, merges: true });
  assert.equal(f.state.requests.a.paused, true);
});

test('missing pre-freeze controls fail before variable mutation', async () => {
  const f = fixture(); delete f.state.migration.controlsBeforeFreeze;
  await assert.rejects(activate({ ...f, validationRunId: 123 }), /Pre-freeze/);
  assert.ok(f.calls.every(c => c.method === 'GET'));
});

test('rollback pauses variable and ledger without restoring labels or enabling old workflows', async () => {
  const f = fixture(); await activate({ ...f, validationRunId: 123 });
  await rollback({ ...f, now: '2026-11-05T01:00:00Z', reason: 'regression' });
  assert.equal(f.state.mode, 'paused'); assert.deepEqual(f.state.controls, { validation: true, merges: true });
  assert.equal(f.state.migration.rollback.labelsRestored, false);
  assert.ok(f.calls.filter(c => c.method !== 'GET').every(c => c.path.startsWith('actions/variables')));
  await rollback({ ...f, now: '2026-11-05T01:00:00Z', reason: 'regression' });
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 2);
});

test('rollback variable-first crash keeps execution frozen and retry completes ledger pause', async () => {
  const f = fixture(); await activate({ ...f, validationRunId: 123 });
  const update = f.store.update; f.store.update = () => { throw Error('CAS conflict'); };
  await assert.rejects(rollback({ ...f }), /CAS conflict/);
  assert.equal(f.state.mode, 'active');
  const observed = await f.request('actions/variables/ACTIONS_COORDINATOR_MODE'); assert.equal(observed.json.value, 'paused');
  f.store.update = update; await rollback({ ...f }); assert.equal(f.state.mode, 'paused');
});

test('later explicit owner resume overrides a pre-freeze pause while rollback pauses stay sticky', async () => {
  const f = fixture(); f.state.migration.controlsBeforeFreeze.validation = true;
  f.state.controlProvenance = {
    validation: { at: '2026-11-05T00:00:01Z', paused: false, source: 'owner', actor: 'owner', commentId: 10 },
    merges: { at: '2026-11-05T00:00:01Z', paused: true, source: 'rollback' },
  };
  await activate({ ...f, validationRunId: 123 });
  assert.equal(f.state.controls.validation, false); assert.equal(f.state.controls.merges, true);
});

test('non-owner or undated resume evidence cannot release an inherited global pause', async () => {
  for (const provenance of [
    { at: '2026-11-05T00:00:01Z', paused: false, source: 'worker' },
    { paused: false, source: 'owner' },
    { at: '2026-11-04T00:00:01Z', paused: false, source: 'owner' },
  ]) {
    const f = fixture(); f.state.migration.controlsBeforeFreeze.validation = true;
    f.state.controlProvenance = { validation: provenance };
    await activate({ ...f, validationRunId: 123 }); assert.equal(f.state.controls.validation, true);
  }
});
