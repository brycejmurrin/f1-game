import test from 'node:test';
import assert from 'node:assert/strict';
import { requestFromIssue, requestFromPR } from '../../tools/ci/actions/requests.mjs';
import { applyControls } from '../../tools/ci/actions/controls.mjs';
import { planWorkerLaunches } from '../../tools/ci/actions/workers.mjs';
import { newState, enqueue } from '../../tools/ci/actions/state.mjs';
import { exportSnapshot, planMigration, applyMigration, snapshotDigest, parseMembers, verifySnapshotCurrent } from '../../tools/ci/actions/migration.mjs';
const labels = ['queue:ready', 'queue:paused', 'queue:priority'].map(name => ({ name, color: '123456', description: name }));
const response = json => ({ status: 200, json });
const item = (number, extra = {}) => ({ number, state: 'open', labels: extra.body?.startsWith('## Members') ? [{ name: 'batch' }] : [], body: '', assignees: [], ownershipComments: [], controlEvents: [], ...extra });
function snapshot(items, extra = {}) {
  const s = { schema: 1, repo: 'owner/repo', capturedAt: 'fixed', complete: true, labels: [{ name: 'ready' }, { name: 'hold' }, { name: 'claimed' }, { name: 'land' }, { name: 'priority' }, { name: 'batch' }], items, ...extra };
  s.digest = snapshotDigest(s); return s;
}
const options = plan => ({ dryRun: false, activeCutover: true, durableBackup: { verified: true, snapshotDigest: plan.snapshotDigest, receipt: 'commit:backup' }, oldConsumersDisabled: { verified: true, receipt: 'freeze:verified' } });

test('Members parser ignores references outside explicit section and conditional merge order', () => {
  assert.deepEqual(parseMembers('# Work\nRefs #99\n## Members\n- [ ] #2 title\n- #3\n## Order\nIf #2 merges then #4'), [2, 3]);
  assert.equal(parseMembers('References #12\n## Plan\n- #13'), null);
  assert.throws(() => parseMembers('## Members\n- #2\n- #2'), /Duplicate/);
});

test('export paginates labels and all issue states, preserving closed attachments and active provenance', async () => {
  const calls = [], definitions = Array.from({ length: 52 }, (_, n) => ({ name: `label${n}`, color: '123456' }));
  const issues = Array.from({ length: 101 }, (_, n) => item(n + 1, { state: n ? 'closed' : 'open', labels: [{ name: 'label1' }], ...(n === 0 ? { pull_request: {} } : {}) }));
  const request = async path => {
    calls.push(path);
    if (path.startsWith('labels?')) return response(definitions);
    if (path.startsWith('issues?')) return response(path.endsWith('page=1') ? issues.slice(0, 100) : issues.slice(100));
    if (path === 'issues/1/events?per_page=100&page=1') return response([{ event: 'labeled', label: { name: 'hold' }, actor: { login: 'owner' } }]);
    if (path === 'issues/1/comments?per_page=100&page=1') return response([{ body: 'claims #1 — native:session', user: { login: 'worker' } }]);
    if (path === 'pulls/1') return response({ draft: true, head: { sha: 'abc' } });
    throw Error(path);
  };
  const s = await exportSnapshot({ request, repo: 'owner/repo', now: 'fixed' });
  assert.equal(s.complete, true); assert.equal(s.labels.length, 52); assert.equal(s.items.length, 101);
  assert.equal(s.items[100].state, 'closed'); assert.deepEqual(s.items[100].labels, [{ name: 'label1' }]);
  assert.equal(s.items[0].controlEvents.length, 1); assert.equal(s.items[0].pullRequest.head.sha, 'abc');
  assert.ok(calls.includes('issues?state=all&sort=created&direction=asc&per_page=100&page=2'));
  assert.equal(s.digest, snapshotDigest(JSON.parse(JSON.stringify(s))));
});

test('export fails closed on missing later page or duplicated pagination', async () => {
  let request = async path => path.startsWith('labels') ? response([]) : path.endsWith('page=1') ? response(Array.from({ length: 100 }, (_, n) => item(n))) : { status: 403, error: 'limited' };
  await assert.rejects(exportSnapshot({ request }), /incomplete/);
  request = async path => path.startsWith('labels') ? response([]) : response([item(1, { state: 'closed' }), item(1, { state: 'closed' })]);
  await assert.rejects(exportSnapshot({ request }), /Duplicate pagination/);
});

test('plan preserves claims, sticky hold, old land and conditional review without hard blockers', () => {
  const s = snapshot([item(1, { body: '## Members\n- #2\n- #3' }), item(2, { labels: [{ name: 'claimed' }, { name: 'land' }], pull_request: {}, controlEvents: [{ event: 'labeled', label: { name: 'hold' } }, { event: 'unlabeled', label: { name: 'hold' }, actor: { login: 'worker' } }] }), item(3, { body: 'Only if #2 merges should this merge. Refs #99' }), item(4915, { body: '## Members\n- #99' }), item(4, { state: 'closed', labels: [{ name: 'ready' }] })]);
  const p = planMigration(s, { labels, expectedCounts: { labels: 6, parents: 1, members: 2 } });
  const claimed = p.records.find(r => r.number === 2), conditional = p.records.find(r => r.number === 3);
  assert.equal(claimed.legacyLand, true); assert.equal(claimed.claimed, true); assert.deepEqual(claimed.queueLabels, ['queue:paused']);
  assert.ok(claimed.pauseReasons.includes('sticky-hold'));
  assert.deepEqual(conditional.dependencies, []); assert.ok(conditional.pauseReasons.includes('migration-review'));
  assert.ok(!p.records.some(r => [4, 4915].includes(r.number)));
});

test('explicit unresolved blockers pause but closed dependency permits readiness', () => {
  const p = planMigration(snapshot([item(1, { body: '## Members\n- #2\n- #3' }), item(2, { body: 'Blocked by #4' }), item(3, { body: 'Blocked by #5', labels: [{ name: 'priority' }], controlEvents: [{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' }, performed_via_github_app: null }] }), item(4), item(5, { state: 'closed' })]), { labels });
  assert.deepEqual(p.records.find(r => r.number === 2).queueLabels, ['queue:paused']);
  assert.deepEqual(p.records.find(r => r.number === 3).queueLabels, ['queue:ready', 'queue:priority']);
});

test('missing members, duplicate membership, expected drift and digest corruption fail before mutation', () => {
  assert.throws(() => planMigration(snapshot([item(1, { body: '## Members\n- #9' })]), { labels }), /Invalid/);
  assert.throws(() => planMigration(snapshot([item(1, { body: '## Members\n- #3' }), item(2, { body: '## Members\n- #3' }), item(3)]), { labels }), /duplicate/);
  assert.throws(() => planMigration(snapshot([]), { labels, expectedCounts: { parents: 27 } }), /Expected/);
  const s = snapshot([]); s.items.push(item(9)); assert.throws(() => planMigration(s, { labels }), /digest/);
});

test('dry run performs no calls and active reset requires verified receipts', async () => {
  const p = planMigration(snapshot([]), { labels }); let calls = 0;
  assert.equal((await applyMigration(p, { request: () => calls++ })).dryRun, true); assert.equal(calls, 0);
  await assert.rejects(applyMigration(p, { dryRun: false }), /Verified/);
  await assert.rejects(applyMigration(p, { ...options(p), oldConsumersDisabled: true }), /Verified/);
});

test('checkpoint all intent before deletion; resume safely after partial reset', async () => {
  const p = planMigration(snapshot([item(2, { labels: [{ name: 'ready' }] }), item(3, { state: 'closed' })]), { labels });
  const calls = [], saved = []; let fail = true;
  const checkpoint = async s => { saved.push(JSON.parse(JSON.stringify(s))); };
  const request = async (path, { method, body }) => {
    assert.ok(saved.length); assert.equal(saved[0].records[0].number, 2);
    calls.push({ path, method, body });
    if (method === 'DELETE' && path === 'labels/claimed' && fail) { fail = false; return { status: 500 }; }
    if (method === 'GET' && path.startsWith('labels/')) return { status: 404 };
    if (method === 'GET') return response(item(2));
    return { status: method === 'DELETE' ? 404 : 201, json: {} };
  };
  await assert.rejects(applyMigration(p, { ...options(p), request, checkpoint }), /delete:claimed/);
  const resume = saved.at(-1), before = calls.filter(c => c.method === 'DELETE').length;
  const final = await applyMigration(p, { ...options(p), request, checkpoint, resume });
  assert.equal(final.stage, 'complete');
  assert.equal(calls.filter(c => c.path === 'labels/ready' && c.method === 'DELETE').length, 1);
  assert.equal(calls.filter(c => c.method === 'DELETE').length - before, 4);
  assert.deepEqual(calls.find(c => c.path === 'issues/2/labels').body, { labels: ['queue:ready'] });
  assert.ok(!calls.some(c => c.path.includes('issues/3')));
});

test('failed durable checkpoint prevents all label deletion', async () => {
  const p = planMigration(snapshot([]), { labels }); let mutations = 0;
  await assert.rejects(applyMigration(p, { ...options(p), request: async () => { mutations++; }, checkpoint: async () => { throw Error('backup unavailable'); } }), /backup unavailable/);
  assert.equal(mutations, 0);
});

test('all 52 label deletions are sequential and checkpointed before creating exact policy labels', async () => {
  const s = snapshot([], { labels: Array.from({ length: 52 }, (_, n) => ({ name: `legacy-${n}`, color: 'abcdef', description: 'old definition' })) });
  const p = planMigration(s, { labels, expectedCounts: { labels: 52, parents: 0, members: 0 } });
  const sequence = []; let lastCompleted = 0;
  await applyMigration(p, { ...options(p), checkpoint: async state => { lastCompleted = state.completed.length; }, request: async (path, { method }) => {
    if (method === 'DELETE') { assert.equal(lastCompleted, sequence.length); sequence.push(path); return { status: 204 }; }
    assert.equal(sequence.length, 52);
    return method === 'GET' ? { status: 404 } : { status: 201, json: {} };
  } });
  assert.equal(new Set(sequence).size, 52);
});

test('imported requests retain first-ready queue age, are paused, and do not relaunch an inherited owner', () => {
  const old = '2026-10-01T00:00:00Z', ready = '2026-10-02T00:00:00Z';
  const s = snapshot([item(1, { body: '## Members\n- #2' }), item(2, { created_at: old, updated_at: '2026-11-05T00:00:00Z', labels: [{ name: 'claimed' }], controlEvents: [{ event: 'labeled', label: { name: 'ready' }, created_at: ready }] })]);
  const p = planMigration(s, { labels });
  const request = p.requests.find(r => r.number === 2);
  assert.equal(request.acceptedAt, ready); assert.equal(request.paused, true); assert.equal(request.owner.kind, 'legacy-unverified'); assert.equal(request.owner.terminal, false);
  assert.ok(request.blockers.includes('live-ownership-unverified')); assert.deepEqual(request.tasks, []);
  assert.deepEqual(p.requests.find(r => r.number === 1).members, [2]);
});

test('closed historical batch overlaps remain archived without entering active membership', () => {
  const p = planMigration(snapshot([item(1, { body: '## Members\n- #3' }), item(2, { state: 'closed', body: '## Members\n- #3\n- #999' }), item(3), item(4, { body: '## Members\n- #999', labels: [] })]), { labels });
  assert.deepEqual(p.parents, [1]); assert.equal(p.counts.members, 1);
  assert.equal(p.records.find(r => r.number === 3).parent, 1);
});

function liveFixture() {
  const data = { labels: [{ name: 'ready', color: '123456', description: 'legacy ready' }], items: [item(1), item(2, { state: 'closed', labels: [{ name: 'ready' }] })], events: [], comments: [], dependencies: [] };
  const request = async (path, options) => {
    assert.equal(options.method, 'GET');
    let value;
    if (path.startsWith('labels?')) value = data.labels;
    else if (path.startsWith('issues?')) value = data.items;
    else if (path.startsWith('issues/1/events?')) value = data.events;
    else if (path.startsWith('issues/1/comments?')) value = data.comments;
    else if (path.startsWith('issues/1/dependencies/blocked_by?')) value = data.dependencies;
    else throw Error(path);
    return response(structuredClone(value));
  };
  return { data, request };
}

test('freshness rechecks closed attachments, native blockers, controls and ownership without writes', async () => {
  for (const change of [
    f => { f.data.items[1].labels = []; },
    f => { f.data.dependencies = [item(2)]; },
    f => { f.data.events = [{ id: 1, event: 'labeled', label: { name: 'hold' } }]; },
    f => { f.data.comments = [{ id: 1, body: 'claims #1 — worker:session' }]; },
    f => { f.data.labels[0].color = 'ffffff'; },
  ]) {
    const f = liveFixture(), s = await exportSnapshot({ request: f.request, now: 'old' });
    assert.equal((await verifySnapshotCurrent({ request: f.request, snapshot: s })).verified, true);
    change(f); await assert.rejects(verifySnapshotCurrent({ request: f.request, snapshot: s }), /Snapshot stale/);
  }
});

test('native dependencies are paginated and canonical blockers even with no body refs', async () => {
  const f = liveFixture(), calls = [];
  const request = async (path, options) => {
    calls.push(path);
    if (path.startsWith('issues/1/dependencies/blocked_by?')) return response(path.endsWith('page=1') ? Array.from({ length: 100 }, (_, n) => item(n + 10, { state: n ? 'closed' : 'open' })) : [item(110, { state: 'closed' })]);
    return f.request(path, options);
  };
  const s = await exportSnapshot({ request }); assert.equal(s.items[0].nativeBlockedBy.length, 101);
  assert.ok(calls.includes('issues/1/dependencies/blocked_by?per_page=100&page=2'));
  const p = planMigration(s, { labels }); assert.equal(p.records[0].paused, true); assert.ok(p.records[0].pauseReasons.includes('dependency'));
  const foreign = snapshot([item(1, { labels: [{ name: 'ready' }], nativeBlockedBy: [{ number: 2, state: 'open', repository_url: 'https://api.github.com/repos/elsewhere/repo' }] }), item(2, { state: 'closed' })]);
  assert.ok(planMigration(foreign, { labels }).records[0].pauseReasons.includes('migration-review'));
});

test('legacy priority requires latest direct owner label-set provenance, never bot or missing evidence', () => {
  for (const [events, expected] of [
    [[], false],
    [[{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' } }], false],
    [[{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' }, performed_via_github_app: {} }], false],
    [[{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'worker' }, performed_via_github_app: null }], false],
    [[{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' }, performed_via_github_app: null }], true],
    [[{ event: 'labeled', label: { name: 'priority' }, actor: { login: 'owner' }, performed_via_github_app: null }, { event: 'labeled', label: { name: 'priority' }, actor: { login: 'bot' }, performed_via_github_app: null }], false],
  ]) {
    const p = planMigration(snapshot([item(1, { labels: [{ name: 'ready' }, { name: 'priority' }], controlEvents: events })]), { labels });
    assert.equal(p.requests[0].priority, expected);
  }
});

test('legacy global worker and merge pauses survive reset without pausing validation', () => {
  const s = snapshot([item(3899, { labels: [{ name: 'dispatch:pause' }, { name: 'dispatch:merge-pause' }] })], {
    labels: [{ name: 'dispatch:pause' }, { name: 'dispatch:merge-pause' }],
  });
  const p = planMigration(s, { labels });
  assert.deepEqual(p.controls, { workers: true, validation: false, merges: true });
  assert.equal(p.controlProvenance.workers.issue, 3899);
  assert.equal(p.controlProvenance.merges.label, 'dispatch:merge-pause');
});

test('only a direct owner removal releases sticky legacy global controls', () => {
  for (const [removal, paused] of [
    [{ actor: { login: 'worker' }, performed_via_github_app: null }, true],
    [{ actor: { login: 'owner' }, performed_via_github_app: {} }, true],
    [{ actor: { login: 'owner' } }, true],
    [{ actor: { login: 'owner' }, performed_via_github_app: null }, false],
  ]) {
    const s = snapshot([item(3899, { controlEvents: [
      { event: 'labeled', label: { name: 'dispatch:pause' }, actor: { login: 'owner' }, performed_via_github_app: null },
      { event: 'unlabeled', label: { name: 'dispatch:pause' }, ...removal },
    ] })]);
    assert.equal(planMigration(s, { labels }).controls.workers, paused);
  }
  const ordinary = snapshot([item(55, { labels: [{ name: 'dispatch:pause' }] })], { labels: [{ name: 'dispatch:pause' }] });
  assert.equal(planMigration(ordinary, { labels }).controls.workers, false);
});

test('safe explicit batch parent is ready as one scope; ordinary merge-order headings do not park it', () => {
  const p = planMigration(snapshot([item(1, { body: '## Members\n- #2\n- #3\n## Merge order\nImplement the members together.' }), item(2), item(3)]), { labels });
  const parent = p.records.find(r => r.number === 1);
  assert.equal(parent.paused, false); assert.deepEqual(parent.queueLabels, ['queue:ready']);
  assert.deepEqual(p.requests.find(r => r.number === 1).members, [2, 3]);
  assert.deepEqual(p.requests.find(r => r.number === 1).memberStates, { 2: 'open', 3: 'open' });
});

test('claimed or actually blocked member parks parent without losing the member owner evidence', () => {
  for (const child of [item(2, { labels: [{ name: 'claimed' }] }), item(2, { body: 'Blocked by #3' }), item(2, { labels: [{ name: 'hold' }] })]) {
    const p = planMigration(snapshot([item(1, { body: '## Members\n- #2' }), child, item(3)]), { labels });
    const parent = p.records.find(r => r.number === 1);
    assert.equal(parent.paused, true); assert.ok(parent.pauseReasons.includes('batch-member:2'));
    assert.deepEqual(parent.queueLabels, ['queue:paused']);
    assert.ok(p.requests.find(r => r.number === 2).blockers.length);
  }
});

test('claimed migration ownership remains nonterminal through native refresh and agent pause-label removal', () => {
  const s = snapshot([item(2, { created_at: '2026-11-01T00:00:00Z', labels: [{ name: 'claimed' }] })]);
  const p = planMigration(s, { labels }); const migrated = p.requests[0];
  assert.equal(migrated.owner.kind, 'legacy-unverified'); assert.equal(migrated.owner.terminal, false);
  assert.equal(migrated.owner.session, undefined); assert.equal(migrated.owner.evidence.snapshotDigest, s.digest);
  const issue = item(2, { labels: [{ name: 'queue:ready' }] });
  const refreshed = requestFromIssue(issue, { previous: migrated, blockers: [], events: [{ event: 'unlabeled', label: { name: 'queue:paused' }, actor: { login: 'worker' }, performed_via_github_app: null, created_at: '2026-11-05T00:00:00Z' }] });
  assert.equal(refreshed.blockers.length, 0); assert.equal(refreshed.owner.terminal, false);
  const state = newState({ mode: 'active' }); state.workers = { capability: { supported: true } }; enqueue(state, refreshed);
  const changed = applyControls(state, 'issues', { action: 'unlabeled', issue: { number: 2 }, label: { name: 'queue:paused' } }, {
    provenance: { event: 'unlabeled', actor: { login: 'worker' }, performed_via_github_app: null, label: { name: 'queue:paused' } },
  });
  assert.equal(changed.requests['issue:2'].owner.terminal, false);
  const admission = planWorkerLaunches(changed, { now: '2026-11-05T12:00:00Z' });
  assert.equal(admission.pressure.activeWorkers, 1); assert.deepEqual(admission.launches, []);
});

test('migrated PR owner and sticky owner hold survive refresh until direct owner release', () => {
  const s = snapshot([item(7, { labels: [{ name: 'claimed' }, { name: 'hold' }], pull_request: {}, pullRequest: { head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) } } })]);
  const migrated = planMigration(s, { labels }).requests[0]; assert.equal(migrated.pauseOwner, true);
  const pr = { number: 7, state: 'open', labels: [], head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) } };
  const agentRemoval = { event: 'unlabeled', label: { name: 'queue:paused' }, actor: { login: 'worker' }, performed_via_github_app: null, created_at: '2026-11-05T00:00:00Z' };
  const refreshed = requestFromPR(pr, { previous: migrated, blockers: [], events: [agentRemoval], owner: 'owner' });
  assert.equal(refreshed.pauseOwner, true); assert.equal(refreshed.paused, true); assert.equal(refreshed.owner.terminal, false);
  const ownerRemoval = { ...agentRemoval, actor: { login: 'owner' }, created_at: '2026-11-05T00:01:00Z' };
  const released = requestFromPR(pr, { previous: refreshed, events: [agentRemoval, ownerRemoval], owner: 'owner' });
  assert.equal(released.pauseOwner, false); assert.equal(released.paused, false);
  assert.equal(released.owner.terminal, false, 'owner label release never proves worker termination');
});
