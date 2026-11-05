import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../../tools/ci/actions/cli.mjs';
import { newState, enqueue } from '../../tools/ci/actions/state.mjs';
import { computePlanDigest } from '../../tools/ci/actions/coverage.mjs';
import { snapshotDigest } from '../../tools/ci/actions/migration.mjs';
import { requestFromPR } from '../../tools/ci/actions/requests.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = '2026-11-05T12:00:00Z', BASE = 'a'.repeat(40), TREE = 'b'.repeat(40);
const response = json => ({ status: 200, json });
function fixture({ request = () => response([]), mode = 'active' } = {}) {
  let state = newState({ mode, now: NOW }); state.migration = { stage: 'complete' };
  let writes = 0;
  const store = {
    read: () => ({ state: structuredClone(state), missing: false }),
    update(fn) { const next = structuredClone(state), result = fn(next); state = next; writes++; return { state: structuredClone(state), result }; },
    initialize() { return this.read(); },
    get state() { return state; }, get writes() { return writes; },
  };
  const api = { cooldown: {}, metrics: {} };
  const dependencies = {
    transport: () => ({ api, store, request }), now: () => NOW, requestTime: () => NOW,
    eventContext: (_name, payload) => ({ event: { relevant: true, kind: 'reconcile' }, payload, now: NOW }),
    collectObservations: () => [], publishVerdicts: async () => {}, landNext: async () => ({ status: 'deferred' }),
  };
  return { store, api, dependencies };
}
function temporary(t) {
  const base = path.join(ROOT, 'artifacts'); fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'actions-cli-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
async function environment(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { return await fn(); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('CLI shadow manual requests do not enqueue or execute on an active ledger', async t => {
  const f = fixture(), file = path.join(temporary(t), 'event.json');
  fs.writeFileSync(file, JSON.stringify({ inputs: { workflow: 'ci.yml', request: '{}' } }));
  f.dependencies.sourceCheckout = () => assert.fail('shadow must not construct an executable manual request');
  const result = await main(['reconcile', '--mode', 'shadow', '--event', 'workflow_dispatch', '--event-file', file], f.dependencies);
  assert.equal(result.mode, 'shadow'); assert.equal(f.store.writes, 0); assert.deepEqual(f.store.state.requests, {});
});

test('CLI automatically admits a ready PR without labels, coding-agent services or launch secrets', async () => {
  const f = fixture();
  const pr = { number: 17, state: 'open', draft: false, labels: [], head: { sha: 'c'.repeat(40) }, base: { sha: BASE } };
  const context = { event: { relevant: true, kind: 'pr', number: 17 }, payload: { action: 'ready_for_review', pull_request: pr },
    issue: { number: 17, state: 'open', labels: [], pull_request: {} }, pr, events: [], now: NOW };
  f.dependencies.eventContext = () => context;
  f.dependencies.prepareRequest = () => ({ ...requestFromPR(pr, { now: NOW }),
    sourceSha: 'd'.repeat(40), headSha: pr.head.sha, baseSha: BASE, treeSha: TREE,
    coverageDigest: 'ready-plan', requiredCoverage: ['guard:one'],
    tasks: [{ id: 'guard', kind: 'guard', runner: 'ubuntu-latest', expectedSeconds: 1, setupSeconds: 1,
      coverageIds: ['guard:one'], prerequisites: [] }], results: {} });
  await environment({ WORKER_FIRE_URL: undefined, WORKER_FIRE_TOKEN: undefined }, async () => {
    const result = await main(['reconcile', '--mode', 'active', '--event', 'pull_request_target'], f.dependencies);
    assert.ok(result.wave, 'ready PR test work is admitted automatically');
    assert.equal(result.producer, undefined, 'test admission does not expose a coding-agent producer');
    const stored = Object.values(f.store.state.requests)[0];
    assert.equal(stored.kind, 'pr'); assert.equal(stored.number, 17); assert.equal(stored.draft, false);
    assert.equal(stored.tasks[0].status, 'reserved');
    assert.ok(Object.values(f.store.state.waves).some(wave => wave.tasks.some(task => task.requestId === stored.id)));
  });
  const source = fs.readFileSync(path.join(ROOT, 'tools/ci/actions/cli.mjs'), 'utf8');
  assert.doesNotMatch(source, /planWorkerLaunches|executeWorkerLaunch|reconcileWorkers|WORKER_FIRE_(?:URL|TOKEN)/,
    'the executable CLI has no coding-agent host or retired dispatch-fire dependency');
});

test('CLI manual diagnostic intake is durable and replay does not reset age or multiply requests', async () => {
  const f = fixture();
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  f.dependencies.sourceCheckout = source => { assert.equal(source, sha); return ROOT; };
  f.dependencies.planCoverage = async options => {
    const task = { id: 'node', kind: 'node', runner: 'ubuntu-latest', expectedSeconds: 1, setupSeconds: 1, environment: { node: '22' }, coverageIds: ['node:one'], prerequisites: [], commands: [] };
    const plan = { mode: 'train', sourceSha: options.sourceSha, baseSha: BASE, treeSha: options.treeSha, requestId: options.requestId, tasks: [task], requiredCoverage: ['node:one'] };
    plan.digest = computePlanDigest(plan); return plan;
  };
  await environment({ GITHUB_SHA: sha, GITHUB_RUN_ID: '1234', GITHUB_EVENT_NAME: 'workflow_dispatch' }, async () => {
    const first = await main(['request', '--workflow', 'ci.yml', '--request', '{"inputs":{}}'], f.dependencies);
    const acceptedAt = f.store.state.requests[first.requestId].acceptedAt;
    const second = await main(['request', '--workflow', 'ci.yml', '--request', '{"inputs":{}}'], f.dependencies);
    assert.equal(second.requestId, first.requestId); assert.equal(Object.keys(f.store.state.requests).length, 1);
    const stored = f.store.state.requests[first.requestId];
    assert.equal(stored.acceptedAt, acceptedAt); assert.equal(stored.sourceSha, sha); assert.equal(stored.baseSha, BASE);
    assert.ok(stored.tasks.length); assert.ok(stored.tasks.every(task => task.treeSha === stored.treeSha && task.planDigest === stored.planDigest));
  });
});

test('periodic PR discovery reuses the actual current base despite stale PR base metadata', async () => {
  const head = 'c'.repeat(40), reportedBase = 'd'.repeat(40);
  const pr = { number: 18, state: 'open', draft: false, labels: [], head: { sha: head }, base: { sha: reportedBase } };
  const calls = [];
  const f = fixture({ request: endpoint => {
    calls.push(endpoint);
    if (endpoint.startsWith('pulls?')) return response([pr]);
    if (endpoint.startsWith('branches/')) return response({ commit: { sha: BASE } });
    assert.fail(`an unchanged current test plan needs no extra API read: ${endpoint}`);
  } });
  f.store.update(state => {
    state.controls.validation = true;
    enqueue(state, { ...requestFromPR(pr, { now: NOW }), headSha: head, sourceSha: head, baseSha: BASE,
      tasks: [{ id: 'guard', kind: 'guard', runner: 'ubuntu-latest', prerequisites: [], coverageIds: [] }] });
  });
  f.dependencies.prepareRequest = () => assert.fail('stale PR metadata must not replan the current tree');
  await main(['reconcile', '--mode', 'active', '--event', 'schedule'], f.dependencies);
  assert.equal(calls.length, 2);
  assert.equal(Object.keys(f.store.state.requests).length, 1);
});

test('CLI retains a fresh rate cooldown instead of replacing it with an older saved value', async () => {
  const f = fixture();
  const fresh = Date.parse(NOW) + 120_000, old = Date.parse(NOW) + 30_000;
  f.api.cooldown.notBefore = fresh; f.api.cooldown.reason = 'primary-rate-limit';
  f.store.update(state => { state.api = { notBefore: old, reason: 'old' }; });
  await main(['reconcile', '--mode', 'paused'], f.dependencies);
  assert.equal(f.api.cooldown.notBefore, fresh);
});

test('CLI migration backup failure occurs before changing variable, consumer state or labels', async t => {
  const snapshot = { schema: 1, repo: 'brycejmurrin/f1-game', capturedAt: NOW, complete: true, labels: [{ name: 'ready' }], items: [] };
  snapshot.digest = snapshotDigest(snapshot);
  const file = path.join(temporary(t), 'snapshot.json'); fs.writeFileSync(file, JSON.stringify(snapshot));
  const calls = [], names = ['actions-coordinator.yml', 'actions-worker.yml', 'actions-validation.yml'];
  const request = (endpoint, options = {}) => {
    calls.push({ endpoint, ...options });
    if (endpoint === '') return response({ full_name: snapshot.repo, default_branch: 'deploy' });
    if (endpoint === 'branches/deploy') return response({ protected: true, commit: { sha: BASE } });
    if (endpoint === `git/commits/${BASE}`) return response({ tree: { sha: TREE } });
    const workflow = names.find(name => endpoint === `actions/workflows/${name}`);
    if (workflow) return response({ id: names.indexOf(workflow) + 1, state: 'active', path: `.github/workflows/${workflow}` });
    if (endpoint.startsWith('contents/.github/workflows/')) return response({ sha: TREE, type: 'file' });
    if (endpoint.startsWith('actions/variables?')) return response({ variables: [{ name: 'ACTIONS_COORDINATOR_MODE', value: 'active' }] });
    if (endpoint === 'actions/runs/42') return response({ workflow_id: 3, status: 'completed', conclusion: 'success', path: '.github/workflows/actions-validation.yml', head_sha: BASE, head_repository: { full_name: snapshot.repo }, run_attempt: 1 });
    if (endpoint === 'actions/runs/42/attempts/1') return response({ status: 'completed', conclusion: 'success', head_sha: BASE });
    if (endpoint.startsWith('actions/runs/42/attempts/1/jobs?')) return response({ jobs: [{ name: 'Actions validation', status: 'completed', conclusion: 'success' }] });
    if (endpoint.startsWith('contents/migrations/')) return { status: options.method === 'PUT' ? 403 : 404, error: options.method === 'PUT' ? 'backup permission denied' : undefined };
    throw new Error(`Unexpected mutation before backup: ${endpoint}`);
  };
  const f = fixture({ request });
  await assert.rejects(main(['migrate', '--snapshot', file, '--apply', '--validation-run', '42'], f.dependencies), /backup/i);
  assert.ok(calls.some(call => call.endpoint.startsWith('contents/migrations/') && call.method === 'PUT'));
  assert.ok(!calls.some(call => call.endpoint.startsWith('actions/variables') && call.method && call.method !== 'GET'));
  assert.ok(!calls.some(call => /\/disable$|\/cancel$|^labels/.test(call.endpoint)));
});

test('CLI --apply false rejects before constructing a transport or producing any side effects', async () => {
  let transports = 0;
  await assert.rejects(main(['migrate', '--snapshot', 'missing.json', '--apply', 'false'], {
    transport: () => { transports++; assert.fail('must not access remote state'); },
  }), /--apply is a flag/);
  assert.equal(transports, 0);
});

test('direct CLI request shadow mode does not read state, plan coverage, or enqueue work', async () => {
  let transports = 0;
  const result = await main(['request', '--mode', 'shadow', '--workflow', 'pages.yml'], {
    transport: () => { transports++; assert.fail('shadow intake must not read or mutate state'); },
    sourceCheckout: () => assert.fail('shadow must not inspect source'),
    planCoverage: () => assert.fail('shadow must not plan executable work'),
  });
  assert.deepEqual(result, { mode: 'shadow', mutated: false }); assert.equal(transports, 0);
});

test('paused reconciliation records an owner pause without planning or launching work', async t => {
  const f = fixture({ mode: 'paused' }), file = path.join(temporary(t), 'pause.json');
  const comment = { id: 9001, body: '/apex pause all', created_at: NOW, user: { login: 'brycejmurrin' },
    author_association: 'OWNER', performed_via_github_app: null };
  fs.writeFileSync(file, JSON.stringify({ action: 'created', issue: { number: 3899 }, comment }));
  f.dependencies.prepareRequest = () => assert.fail('paused controls must not plan work');
  const result = await main(['reconcile', '--mode', 'paused', '--event', 'issue_comment', '--event-file', file], f.dependencies);
  assert.equal(result.controlsRecorded, true);
  assert.deepEqual(f.store.state.controls, { validation: true, merges: true });
  assert.equal(f.store.state.controlProvenance.validation.commentId, 9001);
});

test('an approval created before the current deploy base grants no new diff authority', async () => {
  const f = fixture({ request: endpoint => {
    assert.equal(endpoint, `git/commits/${BASE}`);
    return response({ committer: { date: NOW } });
  } });
  f.dependencies.eventContext = () => ({ event: { relevant: true, kind: 'command', command: { type: 'approve', sha: TREE } },
    payload: {}, issue: { number: 12 }, pr: { head: { sha: TREE }, base: { sha: BASE } },
    provenance: { id: 9002, created_at: '2026-11-04T00:00:00Z' } });
  f.dependencies.prepareRequest = () => assert.fail('stale approval must fail before planning');
  await assert.rejects(main(['reconcile', '--mode', 'active', '--event', 'issue_comment'], f.dependencies), /fresh owner comment/);
  assert.equal(f.store.writes, 0);
});

function releaseFixture() {
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  let tip = source;
  const request = endpoint => {
    if (endpoint.startsWith('branches/')) return response({ commit: { sha: tip } });
    if (endpoint.startsWith('compare/')) return response({ status: 'identical' });
    assert.fail(`Unexpected release API request: ${endpoint}`);
  };
  const f = fixture({ request });
  f.dependencies.sourceCheckout = sha => { assert.equal(sha, source); return ROOT; };
  f.dependencies.releaseBase = async () => ({ alreadyLive: false, baseSha: BASE });
  f.dependencies.planCoverage = async options => {
    assert.equal(options.mode, 'train'); assert.equal(options.since, BASE); assert.equal(options.baseSha, BASE); assert.equal(options.sourceSha, source);
    const tasks = ['node', 'browser'].map((kind, index) => ({ id: `task-${index}`, kind, runner: 'ubuntu-latest', expectedSeconds: 1, setupSeconds: 1,
      environment: { node: '22', backend: kind }, coverageIds: [`${kind}:one`], prerequisites: [], commands: [] }));
    const plan = { mode: 'train', sourceSha: source, baseSha: BASE, treeSha: options.treeSha, requestId: options.requestId, tasks, requiredCoverage: tasks.flatMap(t => t.coverageIds) };
    plan.digest = computePlanDigest(plan); return plan;
  };
  return { ...f, source, moveTip: () => { tip = 'f'.repeat(40); } };
}

test('release intake rejects a superseded source before planning or queuing validation', async () => {
  const f = releaseFixture(); f.moveTip();
  f.dependencies.planCoverage = () => assert.fail('superseded release must not consume planning or test capacity');
  await environment({ GITHUB_SHA: f.source, GITHUB_RUN_ID: 'release-1', GITHUB_EVENT_NAME: 'push' }, async () => {
    const result = await main(['request', '--workflow', 'pages.yml', '--request', '{}'], f.dependencies);
    assert.equal(result.superseded, true); assert.equal(f.store.writes, 0); assert.deepEqual(f.store.state.requests, {});
  });
});

test('release intake binds current tip to proven live base, retains full coverage, and orders publication after every bundle', async () => {
  const f = releaseFixture();
  await environment({ GITHUB_SHA: f.source, GITHUB_RUN_ID: 'release-2', GITHUB_EVENT_NAME: 'push' }, async () => {
    const result = await main(['request', '--workflow', 'pages.yml', '--request', '{}'], f.dependencies);
    const stored = f.store.state.requests[result.requestId];
    assert.equal(stored.kind, 'release'); assert.equal(stored.sourceSha, f.source); assert.equal(stored.baseSha, BASE);
    assert.deepEqual(stored.requiredCoverage, ['node:one', 'browser:one']);
    const publish = stored.tasks.find(t => t.release), validation = stored.tasks.filter(t => !t.release);
    assert.equal(validation.length, 2); assert.deepEqual(publish.prerequisites.sort(), validation.map(t => t.id).sort());
    assert.ok(stored.tasks.every(task => task.planDigest === stored.planDigest && task.treeSha === stored.treeSha && task.baseSha === BASE));
    assert.ok(validation.flatMap(t => t.coverageIds).includes('browser:one'));
  });
});

test('release preparation refuses missing or mismatched source/base/tree/coverage receipts before publishing', async t => {
  const directory = temporary(t), oldExit = process.exitCode;
  t.after(() => { process.exitCode = oldExit; });
  for (const scenario of ['missing', 'wrong-source', 'wrong-base', 'wrong-tree', 'missing-coverage', 'complete']) {
    const f = releaseFixture(); let prepared = 0;
    f.dependencies.prepareRelease = async ({ sourceSha, treeSha }) => { prepared++; assert.equal(sourceSha, f.source); assert.ok(treeSha); return { publish: true, build: 123 }; };
    await environment({ GITHUB_SHA: f.source, GITHUB_RUN_ID: '321', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/claude/f1-game-project-26h3ng', ACTIONS_RECEIPT_DIR: directory }, async () => {
      const intake = await main(['request', '--workflow', 'pages.yml', '--request', '{}'], f.dependencies);
      let envelope;
      f.store.update(state => {
        const record = state.requests[intake.requestId], publish = record.tasks.find(task => task.release);
        for (const bundle of record.tasks.filter(task => !task.release)) {
          record.results[bundle.id] = { status: 'success', complete: true, subreceipts: bundle.tasks.map(task => ({ taskId: task.id, sourceSha: scenario === 'wrong-source' ? BASE : record.sourceSha,
            baseSha: scenario === 'wrong-base' ? TREE : record.baseSha, treeSha: scenario === 'wrong-tree' ? BASE : record.treeSha, planDigest: record.planDigest, environment: task.environment,
            coverageIds: scenario === 'missing-coverage' ? [] : task.coverageIds, status: 'success', complete: true, exitCode: 0 })) };
        }
        if (scenario === 'missing') delete record.results[record.tasks.find(task => !task.release).id];
        publish.status = 'running';
        state.waves.wave = { id: 'wave', status: 'running', owner: { runId: '321', runAttempt: 1 }, tasks: [{ requestId: record.id, taskId: publish.id, status: 'running' }] };
        envelope = { id: '1'.repeat(24), waveId: 'wave', requestId: record.id, taskId: publish.id, runId: '321', runAttempt: 1,
          sourceSha: record.sourceSha, baseSha: record.baseSha, treeSha: record.treeSha, planDigest: record.planDigest, task: publish };
      });
      const result = await main(['release-prepare', '--task-json', JSON.stringify(envelope), '--root', ROOT, '--control-root', directory], f.dependencies);
      if (scenario === 'complete') { assert.equal(result.prepared, true); assert.equal(prepared, 1); }
      else { assert.equal(result.complete, false); assert.match(result.error, /complete exact-source validation receipts/); assert.equal(prepared, 0); }
      process.exitCode = oldExit;
    });
  }
});
