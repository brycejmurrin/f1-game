import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  prepareRequest, ingest, claimMatrix, canonicalExecution, reconcileResults, validationVerdict,
  prepareAdmission, collectObservations, downloadReceipt, readReceipt, eventContext, listAll, writeOutputs,
  collectInfrastructureRetries, applyInfrastructureRetries, freshPR, DEPLOY_BRANCH,
} from '../../tools/ci/actions/controller.mjs';
import { newState, enqueue, capacityUsage } from '../../tools/ci/actions/state.mjs';
import { computePlanDigest } from '../../tools/ci/actions/coverage.mjs';

const NOW = Date.parse('2026-11-05T12:00:00Z'), at = delta => new Date(NOW + delta).toISOString();
const HEAD = '1'.repeat(40), BASE = '2'.repeat(40), SOURCE = '3'.repeat(40), TREE = '4'.repeat(40);
const owner = { runId: '123', runAttempt: 1 };
const active = () => newState({ mode: 'active', now: NOW });
function context(overrides = {}) {
  return { eventName: 'pull_request_target', event: { relevant: true, kind: 'pr', number: 9 },
    payload: { action: 'opened', sender: { login: 'person' }, pull_request: { number: 9 } },
    issue: { number: 9, state: 'open', pull_request: {}, labels: [] },
    pr: { number: 9, state: 'open', draft: false, mergeable: true, head: { sha: HEAD }, base: { sha: BASE }, merge_commit_sha: SOURCE },
    events: [], now: at(0), ...overrides };
}
function commandContext(body, id = 500, createdAt = at(0), overrides = {}) {
  const comment = { id, created_at: createdAt, body, author_association: 'OWNER', user: { login: 'brycejmurrin' }, performed_via_github_app: null };
  return context({ eventName: 'issue_comment', payload: { action: 'created', issue: { number: 9, pull_request: {} }, comment },
    provenance: { ...comment }, ...overrides });
}
function makePlan(options, extra = {}) {
  const atom = (id, kind, prerequisites = []) => ({ id, kind, runner: 'ubuntu-latest', environment: { node: '22', backend: 'node' },
    suite: id, specs: [], sourceSha: options.sourceSha, baseSha: options.baseSha, treeSha: TREE, requestId: options.requestId,
    expectedSeconds: 30, setupSeconds: 10, prerequisites, coverageIds: [id], commands: [{ command: 'node', argv: ['--test', `tests/${id}.mjs`] }] });
  const plan = { version: 1, mode: options.mode, sourceSha: options.sourceSha, baseSha: options.baseSha, treeSha: TREE,
    requestId: options.requestId, tasks: [atom('guard', 'guard'), atom('browser', 'browser', ['guard']), atom('node', 'node', ['guard'])],
    requiredCoverage: ['guard', 'browser', 'node'], deferredCoverage: [], complete: true, ...extra };
  plan.digest = computePlanDigest(plan); plan.coverageDigest = plan.digest;
  for (const task of plan.tasks) task.planDigest = plan.digest;
  return plan;
}
const commit = () => ({ sha: SOURCE, parents: [{ sha: BASE }, { sha: HEAD }], tree: { sha: TREE } });
const prepare = (ctx, state, overrides = {}) => prepareRequest(ctx, state, { checkout: () => '/source-as-data',
  readBase: () => BASE, readMergeCommit: commit, planner: async options => makePlan(options), ...overrides });
function success(request, bundle) {
  const subreceipts = (bundle.tasks || [bundle]).map(task => ({ taskId: task.id, requestId: request.id, runId: owner.runId,
    runAttempt: owner.runAttempt, sourceSha: request.sourceSha, baseSha: request.baseSha, treeSha: request.treeSha,
    planDigest: request.coverageDigest, status: 'success', complete: true, exitCode: 0, coverageIds: [...task.coverageIds], environment: task.environment }));
  return { taskId: bundle.id, sourceSha: request.sourceSha, baseSha: request.baseSha, treeSha: request.treeSha,
    planDigest: request.coverageDigest, status: 'success', complete: true, exitCode: 0, coverageIds: [...bundle.coverageIds],
    environment: bundle.environment, requestId: request.id, ...owner, subreceipts };
}
function terminalObservation(wave, jobs, now = at(0)) { return { waveId: wave.id, ...owner, status: 'completed', jobs, now }; }
async function claimedFixture({ draft = false } = {}) {
  const state = active(), ctx = context(); ctx.pr.draft = draft;
  const prepared = await prepare(ctx, state); enqueue(state, prepared);
  const [wave] = prepareAdmission(state, NOW).waves;
  const matrix = claimMatrix(state, wave.id, owner).matrix;
  return { state, request: state.requests[prepared.id], wave, matrix };
}
function observationApi(wave, rows, { artifacts = [], runStatus = 'completed', attempt = 1, fail = null } = {}) {
  const calls = [];
  const request = (endpoint) => {
    calls.push(endpoint);
    if (fail) return { status: fail, error: `HTTP ${fail}` };
    if (endpoint.includes('/artifacts?')) return { status: 200, json: { artifacts } };
    if (endpoint.includes('/jobs?')) return { status: 200, json: { jobs: rows } };
    return { status: 200, json: { id: Number(wave.owner.runId), run_attempt: attempt, status: runStatus } };
  };
  return { request, calls };
}

test('ready PRs automatically queue verified integration validation without requesting a merge', async () => {
  const state = active(), planned = await prepare(context(), state);
  assert.ok(planned.id.includes(`${HEAD}:${BASE}:actions-v1:ready`));
  assert.equal(planned.sourceSha, SOURCE); assert.equal(planned.headSha, HEAD); assert.equal(planned.treeSha, TREE);
  assert.equal(planned.tasks.length, 3);
  assert.equal(planned.mergeRequested, false);
  assert.deepEqual(planned.tasks[1].prerequisites, [planned.tasks[0].id]);
  enqueue(state, planned); assert.equal(prepareAdmission(state, NOW).waves[0].tasks.length, 1);
});

test('ordinary issues never create implementation requests or perform intake reads', async () => {
  const issue = { number: 9, state: 'open', labels: [{ name: 'queue:ready' }] };
  const planned = await prepareRequest(context({ issue, pr: null }), active(), { request() { throw new Error('Issue intake must not read external state'); } });
  assert.equal(planned, null);
});

test('lagging PR base SHA is normalized to the protected tip before fencing the synthetic merge or planning', async () => {
  const ctx = context(), stale = '5'.repeat(40); ctx.pr.base = { sha: stale, ref: DEPLOY_BRANCH };
  const calls = [], api = endpoint => {
    calls.push(endpoint);
    return { status: 200, json: endpoint.startsWith('pulls/') ? ctx.pr : { commit: { sha: BASE } } };
  };
  const normalized = freshPR(api, 9);
  assert.equal(normalized.base.sha, BASE); assert.equal(normalized.reportedBaseSha, stale);
  assert.deepEqual(calls, ['pulls/9', `branches/${encodeURIComponent(DEPLOY_BRANCH)}`]);
  let checkouts = 0;
  const blocked = await prepareRequest(ctx, active(), { request: api,
    readMergeCommit: () => ({ ...commit(), parents: [{ sha: stale }, { sha: HEAD }] }), checkout() { checkouts++; } });
  assert.equal(blocked.baseSha, BASE); assert.ok(blocked.id.includes(BASE));
  assert.ok(blocked.blockers.includes('merge-tree-stale')); assert.equal(checkouts, 0);
  const planned = await prepareRequest(ctx, active(), { request: api, readMergeCommit: commit,
    checkout: () => '/source-as-data', planner: async options => {
      assert.equal(options.since, BASE); assert.equal(options.baseSha, BASE); return makePlan(options);
    } });
  assert.equal(planned.baseSha, BASE); assert.equal(planned.reportedBaseSha, stale);
});

test('protected-tip read failures never fall back to the PR-reported base SHA', async () => {
  await assert.rejects(prepareRequest(context(), active(), { request: () => ({ status: 403, error: 'HTTP 403' }) }), /403/);
  assert.throws(() => freshPR(endpoint => ({ status: 200, json: endpoint.startsWith('pulls/') ? context().pr : { commit: {} } }), 9), /identity/);
});

test('stale merge parents never reach checkout/planning and blocked placeholders can become executable', async () => {
  const state = active(); let checkedOut = 0;
  const blocked = await prepare(context(), state, { readMergeCommit: () => ({ ...commit(), parents: [{ sha: '5'.repeat(40) }, { sha: HEAD }] }), checkout: () => { checkedOut++; } });
  assert.ok(blocked.id.endsWith(':blocked')); assert.equal(blocked.tasks.length, 0); assert.equal(checkedOut, 0);
  let next = ingest(state, context(), blocked);
  const ready = await prepare(context({ now: at(1000) }), next);
  assert.notEqual(ready.id, blocked.id); assert.ok(ready.tasks.length);
  next = ingest(next, context({ now: at(1000) }), ready);
  assert.equal(next.requests[blocked.id].superseded, true); assert.equal(next.requests[ready.id].superseded, false);
});

test('planning rejects inconsistent source/tree/digest identity and unreadable merge evidence', async () => {
  for (const field of ['sourceSha', 'baseSha', 'treeSha', 'requestId']) {
    await assert.rejects(prepare(context(), active(), { planner: async options => makePlan(options, { [field]: 'different' }) }), /integration identity/);
  }
  await assert.rejects(prepare(context(), active(), { readMergeCommit: () => { throw new Error('HTTP 403'); } }), /403/);
});

test('metadata replay preserves evidence and approval provenance; current command wins over stale prepared metadata', async () => {
  let state = active(), prepared = await prepare(context(), state); enqueue(state, prepared);
  const record = state.requests[prepared.id]; record.approvedSha = HEAD; record.approvedDiffSha = 'diff';
  record.approvedBy = 'brycejmurrin'; record.approvedViaApp = null; record.mergeRequestedAt = at(-1000);
  const refreshed = await prepare(context(), state);
  assert.equal(refreshed.approvedBy, 'brycejmurrin'); assert.equal(refreshed.approvedViaApp, null);
  const ctx = commandContext('/apex merge', 499);
  state = ingest(state, ctx, { ...refreshed, mergeRequested: false });
  assert.equal(state.requests[prepared.id].mergeRequested, true);
  assert.equal(state.requests[prepared.id].approvedBy, 'brycejmurrin');
});

test('CAS replay cannot rebind a durable approval or erase merge consent with stale prepared metadata', async () => {
  let state = active(); const prepared = await prepare(context(), state); enqueue(state, prepared);
  const approve = commandContext(`/apex approve ${HEAD}`, 601, at(0), { diffSha: 'approved-diff' });
  state = ingest(state, approve);
  state = ingest(state, commandContext('/apex merge', 602, at(1000)));
  const stale = { ...state.requests[prepared.id], approvedDiffSha: 'recomputed-diff', approvedBy: 'some-agent',
    approvedViaApp: 1, mergeRequested: false, mergeRequestedAt: null };
  state = ingest(state, approve, stale);
  assert.equal(state.requests[prepared.id].approvedDiffSha, 'approved-diff');
  assert.equal(state.requests[prepared.id].approvedBy, 'brycejmurrin'); assert.equal(state.requests[prepared.id].approvedViaApp, null);
  assert.equal(state.requests[prepared.id].mergeRequested, true); assert.equal(state.requests[prepared.id].mergeRequestedAt, at(1000));
  const nextContext = context({ now: at(2000) }); nextContext.pr.head.sha = '8'.repeat(40);
  const next = await prepare(nextContext, state, { readMergeCommit: () => ({ ...commit(), parents: [{ sha: BASE }, { sha: nextContext.pr.head.sha }] }) });
  state = ingest(state, nextContext, next);
  assert.equal(state.requests[next.id].approvedSha, null, 'old head approval cannot bind the next source head');
});

test('trusted policy salts create a new immutable validation identity for an unchanged head and base', async () => {
  const state = active(), first = await prepare(context(), state, { policyVersion: `actions-v1:${'a'.repeat(40)}` });
  enqueue(state, first);
  const second = await prepare(context({ now: at(1000) }), state, { policyVersion: `actions-v1:${'b'.repeat(40)}` });
  assert.notEqual(first.id, second.id); assert.notEqual(first.coverageDigest, second.coverageDigest);
  enqueue(state, second); assert.equal(state.requests[first.id].superseded, true);
});

test('an exact archived PR plan reopens with its original queue age and evidence without recomputing source code', async () => {
  const { request } = await incompleteFixture(); request.closed = true; request.superseded = true; request.recoverRequested = false;
  const original = structuredClone(request);
  const prepared = await prepare(context({ now: at(5000) }), active(), { readArchive: id => {
    assert.equal(id, original.id); return { request: original };
  }, checkout() { throw new Error('Archived exact plan must not execute a checkout'); },
  planner() { throw new Error('Archived exact plan must not be recomputed'); } });
  assert.equal(prepared.closed, false); assert.equal(prepared.superseded, false);
  assert.equal(prepared.acceptedAt, original.acceptedAt); assert.deepEqual(prepared.results, original.results);
  assert.deepEqual(prepared.plan, original.plan);
});

test('draft feedback explicitly preserves deferred coverage and can never publish a full gate success', async () => {
  const fixture = await claimedFixture({ draft: true }), { state, request, wave } = fixture;
  assert.ok(request.deferredCoverage.includes('node'));
  assert.ok(request.requiredCoverage.includes('node'));
  assert.equal(validationVerdict(state, request).state, 'pending');
  const guard = request.tasks[0];
  reconcileResults(state, [terminalObservation(wave, [{ requestId: request.id, taskId: guard.id, jobId: 1,
    status: 'completed', conclusion: 'success', runAttempt: 1, receipt: success(request, guard) }])]);
  assert.notEqual(validationVerdict(state, request).state, 'success');
});

test('returning from draft to ready reactivates the exact existing full plan without losing its age', async () => {
  let state = active();
  const readyContext = context(), ready = await prepare(readyContext, state);
  state = ingest(state, readyContext, ready);
  const draftContext = context({ now: at(1000) }); draftContext.pr.draft = true;
  const draft = await prepare(draftContext, state); state = ingest(state, draftContext, draft);
  assert.equal(state.requests[ready.id].superseded, true);
  const nextReadyContext = context({ now: at(2000) }), nextReady = await prepare(nextReadyContext, state);
  state = ingest(state, nextReadyContext, nextReady);
  assert.equal(nextReady.id, ready.id); assert.equal(state.requests[ready.id].superseded, false);
  assert.equal(state.requests[draft.id].superseded, true); assert.equal(state.requests[ready.id].acceptedAt, ready.acceptedAt);
});

test('claims fence attempts and canonical execution rejects changed commands, tree or paused state', async () => {
  const { state, matrix, wave } = await claimedFixture(), envelope = JSON.parse(matrix.include[0].task_json);
  assert.equal(canonicalExecution(state, envelope, owner).task.id, envelope.taskId);
  assert.equal(claimMatrix(state, wave.id, { ...owner, runAttempt: 2 }).claimed, false);
  for (const altered of [{ ...envelope, treeSha: 'wrong' }, { ...envelope, baseSha: 'wrong' },
    { ...envelope, task: { ...envelope.task, commands: [{ command: 'node', argv: ['malicious.mjs'] }] } }]) {
    assert.throws(() => canonicalExecution(state, altered, owner), /identity mismatch/);
  }
  assert.throws(() => canonicalExecution(state, envelope, { ...owner, runAttempt: 2 }), /owner/);
  state.controls.validation = true;
  assert.throws(() => canonicalExecution(state, envelope, owner), /no longer executable/);
});

test('complete aggregate receipts require valid atomic subreceipts before the full gate becomes green', async () => {
  const { state, request, wave } = await claimedFixture();
  let nextWave = wave;
  while (nextWave) {
    const jobs = nextWave.tasks.map(entry => {
      const bundle = request.tasks.find(t => t.id === entry.taskId);
      return { requestId: request.id, taskId: bundle.id, jobId: 1, status: 'completed', conclusion: 'success', runAttempt: 1, receipt: success(request, bundle) };
    });
    reconcileResults(state, [terminalObservation(nextWave, jobs)]);
    nextWave = prepareAdmission(state, NOW).waves[0];
    if (nextWave) claimMatrix(state, nextWave.id, owner);
  }
  assert.equal(validationVerdict(state, request).state, 'success');
  assert.equal(validationVerdict(state, request, { currentPR: { state: 'open', draft: false, head: { sha: HEAD }, base: { sha: 'moved' } } }).state, 'pending');
  delete request.results[request.tasks[0].id].subreceipts;
  assert.equal(validationVerdict(state, request).state, 'failure');
});

test('an uploaded receipt cannot release a live executor or override its failed GitHub conclusion', async () => {
  const { state, request, wave } = await claimedFixture(), bundle = request.tasks[0];
  const job = { requestId: request.id, taskId: bundle.id, jobId: 1, status: 'in_progress', conclusion: null,
    runAttempt: 1, receipt: success(request, bundle) };
  reconcileResults(state, [{ ...terminalObservation(wave, [job]), status: 'in_progress' }]);
  assert.equal(capacityUsage(state).linux, 1);
  reconcileResults(state, [terminalObservation(wave, [{ ...job, status: 'completed', conclusion: 'failure' }])]);
  assert.equal(request.results[bundle.id].status, 'incomplete'); assert.equal(validationVerdict(state, request).state, 'failure');
});

test('missing uploaded evidence waits for bounded grace and then remains explicitly incomplete', async () => {
  const { state, request, wave } = await claimedFixture(), bundle = request.tasks[0];
  const job = { requestId: request.id, taskId: bundle.id, jobId: 1, status: 'completed', conclusion: 'success', runAttempt: 1, completedAt: at(0) };
  reconcileResults(state, [terminalObservation(wave, [job], at(0))]);
  assert.equal(capacityUsage(state).linux, 1); assert.equal(request.results[bundle.id], undefined);
  reconcileResults(state, [terminalObservation(wave, [job], at(120001))]);
  assert.equal(capacityUsage(state).linux, 0); assert.equal(request.results[bundle.id].status, 'incomplete');
});

test('a temporarily unreadable existing receipt remains recoverable even after the visibility grace', async () => {
  const { state, request, wave } = await claimedFixture(), bundle = request.tasks[0];
  const job = { requestId: request.id, taskId: bundle.id, jobId: 1, status: 'completed', conclusion: 'success', runAttempt: 1,
    completedAt: at(0), receiptReadError: 'HTTP 429' };
  reconcileResults(state, [terminalObservation(wave, [job], at(600000))]);
  assert.equal(capacityUsage(state).linux, 1); assert.equal(request.results[bundle.id], undefined);
  reconcileResults(state, [terminalObservation(wave, [{ ...job, receiptReadError: undefined, receipt: success(request, bundle) }], at(601000))]);
  assert.equal(capacityUsage(state).linux, 0); assert.equal(request.results[bundle.id].status, 'success');
});

test('crash recovery redispatches the same reserved wave and backoff does not leak new reservations', async () => {
  const state = active(), prepared = await prepare(context(), state); enqueue(state, prepared);
  const first = prepareAdmission(state, NOW).waves[0];
  assert.equal(prepareAdmission(state, NOW + 1000).waves.length, 0);
  assert.equal(prepareAdmission(state, NOW + 120001).waves[0].id, first.id);
  assert.equal(Object.keys(state.waves).length, 1); assert.equal(capacityUsage(state).linux, 1);
});

test('observation collection uses the exact run attempt, terminal executor jobs and authoritative artifact inventory', async () => {
  const { state, request, wave, matrix } = await claimedFixture(), row = matrix.include[0]; let downloads = 0;
  const api = observationApi(wave, [{ id: 1, name: `Task ${row.id}`, status: 'completed', conclusion: 'success', run_attempt: 1, completed_at: at(0) }],
    { artifacts: [{ name: `actions-receipt-${row.id}-1`, expired: false }] });
  const observations = collectObservations(state, { request: api.request, now: at(0), download: () => { downloads++; return success(request, request.tasks[0]); } });
  assert.equal(observations[0].status, 'completed'); assert.equal(downloads, 1);
  assert.equal(api.calls[0], 'actions/runs/123/attempts/1');
  reconcileResults(state, observations); assert.equal(request.results[request.tasks[0].id].status, 'success');
});

test('publisher jobs are mapped, live jobs do not download receipts, and API failures retain ownership', async () => {
  const { state, wave, matrix } = await claimedFixture(), row = matrix.include[0]; let downloads = 0;
  const live = observationApi(wave, [{ id: 1, name: `Trusted publisher ${row.id}`, status: 'in_progress', run_attempt: 1 }], { runStatus: 'in_progress' });
  const observations = collectObservations(state, { request: live.request, now: at(0), download: () => { downloads++; } });
  assert.equal(observations[0].jobs.length, 1); assert.equal(downloads, 0); assert.equal(live.calls.length, 2);
  for (const api of [observationApi(wave, [], { fail: 403 }), observationApi(wave, [], { attempt: 2 })]) {
    const unreadable = collectObservations(state, { request: api.request, now: at(600000), download: () => {} });
    assert.ok(unreadable[0].error); reconcileResults(state, unreadable); assert.equal(capacityUsage(state).linux, 1);
  }
});

async function incompleteFixture({ bothMissing = false } = {}) {
  const fixture = await claimedFixture(), { state, request, wave } = fixture;
  const guard = request.tasks[0];
  reconcileResults(state, [terminalObservation(wave, [{ requestId: request.id, taskId: guard.id, jobId: 1,
    status: 'completed', conclusion: 'success', runAttempt: 1, receipt: success(request, guard) }])]);
  const [next] = prepareAdmission(state, NOW + 1).waves; claimMatrix(state, next.id, owner);
  const browser = request.tasks.find(bundle => bundle.tasks.some(task => task.kind === 'browser'));
  const jobs = next.tasks.map(entry => {
    const bundle = request.tasks.find(task => task.id === entry.taskId);
    return { requestId: request.id, taskId: bundle.id, jobId: 2, status: 'completed', conclusion: 'success',
      runAttempt: 1, completedAt: at(0), ...(!bothMissing && bundle.id !== browser.id ? { receipt: success(request, bundle) } : {}) };
  });
  reconcileResults(state, [terminalObservation(next, jobs)], { receiptGraceMs: 0 });
  const accepted = ingest(state, commandContext('/apex recover'));
  return { ...fixture, state: accepted, request: accepted.requests[request.id], wave: accepted.waves[next.id],
    browser: accepted.requests[request.id].tasks.find(task => task.id === browser.id) };
}
const recoveryApi = (overrides = {}) => ({ status: 200, json: { id: 123, run_attempt: 1, status: 'completed', ...overrides } });

test('explicit infrastructure recovery retries only missing receipts with fresh terminal proof and consumes intent once', async () => {
  const { state, request, browser } = await incompleteFixture(); let reads = 0;
  const before = structuredClone(state), observations = collectInfrastructureRetries(state, { now: at(1000), request(endpoint) {
    reads++; assert.equal(endpoint, 'actions/runs/123/attempts/1'); return recoveryApi();
  } });
  assert.deepEqual(state, before, 'collection does not mutate the ledger'); assert.equal(reads, 1);
  const outcomes = applyInfrastructureRetries(state, observations);
  assert.equal(outcomes[0].tasks[0].retried, true); assert.equal(request.tasks.find(t => t.id === browser.id).status, 'queued');
  assert.equal(request.results[request.tasks[0].id].status, 'success', 'successful guard remains reusable');
  assert.equal(Object.values(request.results).filter(r => r.status === 'success').length, 2);
  assert.equal(request.recoverRequested, false); assert.equal(state.intents[request.number].recoverRequested, false);
  assert.equal(request.resultHistory[browser.id].length, 1);
  assert.deepEqual(applyInfrastructureRetries(state, observations), [], 'CAS replay cannot consume the command twice');
  assert.equal(prepareAdmission(state, NOW + 2000).waves[0].tasks.length, 1);
});

test('infrastructure recovery deduplicates owner reads and bounds work per cycle', async () => {
  const { state } = await incompleteFixture({ bothMissing: true }); let reads = 0;
  const observations = collectInfrastructureRetries(state, { request() { reads++; return recoveryApi(); }, now: at(1000), maxOwnerReads: 1 });
  assert.equal(observations[0].tasks.length, 2); assert.equal(reads, 1);
  assert.equal(applyInfrastructureRetries(state, observations)[0].tasks.filter(result => result.retried).length, 2);
});

test('API errors, live owners and mismatched attempt responses preserve explicit recovery without relaunching', async () => {
  for (const response of [{ status: 403, error: 'HTTP 403' }, recoveryApi({ status: 'in_progress' }), recoveryApi({ run_attempt: 2 })]) {
    const { state, request, browser } = await incompleteFixture();
    const observations = collectInfrastructureRetries(state, { request: () => response, now: at(1000) });
    const outcome = applyInfrastructureRetries(state, observations)[0];
    assert.equal(outcome.deferred, true); assert.equal(request.recoverRequested, true);
    assert.equal(browser.status, 'incomplete'); assert.equal(request.resultHistory?.[browser.id], undefined);
    const retry = collectInfrastructureRetries(state, { request: () => recoveryApi(), now: at(2000) });
    assert.equal(applyInfrastructureRetries(state, retry)[0].tasks[0].retried, true);
  }
});

test('assertion failures and a second exhausted infrastructure attempt never retry into green', async () => {
  for (const mode of ['assertion', 'attempt-limit']) {
    const { state, request, browser } = await incompleteFixture();
    if (mode === 'assertion') { browser.status = 'failure'; request.results[browser.id].status = 'failure'; }
    else browser.attempt = 2;
    let reads = 0;
    const observations = collectInfrastructureRetries(state, { request() { reads++; return recoveryApi(); }, now: at(1000) });
    assert.equal(reads, 0); assert.equal(observations[0].refused, 'no-eligible-infrastructure-attempt');
    const outcome = applyInfrastructureRetries(state, observations)[0];
    assert.equal(outcome.consumed, true); assert.equal(request.recoverRequested, false);
    assert.equal(request.results[browser.id].complete, false);
    assert.equal(request.resultHistory?.[browser.id], undefined);
  }
});

test('stale recovery observations cannot reset superseded heads or consume a newer command', async () => {
  for (const mode of ['superseded', 'source', 'new-command']) {
    const { state, request, browser } = await incompleteFixture();
    const observations = collectInfrastructureRetries(state, { request: () => recoveryApi(), now: at(1000) });
    if (mode === 'superseded') request.superseded = true;
    if (mode === 'source') request.sourceSha = '9'.repeat(40);
    if (mode === 'new-command') { request.recoveryToken = 'comment:501'; state.intents[request.number].recoveryToken = 'comment:501'; }
    assert.deepEqual(applyInfrastructureRetries(state, observations), []);
    assert.equal(request.recoverRequested, true); assert.equal(browser.status, 'incomplete');
  }
});

test('recovery is scoped to its source plan and replaying the same consumed comment cannot rearm it', async () => {
  const { state, request } = await incompleteFixture();
  const observations = collectInfrastructureRetries(state, { request: () => recoveryApi(), now: at(1000) });
  applyInfrastructureRetries(state, observations);
  const ctx = commandContext('/apex recover');
  const replayed = ingest(state, ctx);
  assert.equal(replayed.requests[request.id].recoverRequested, false);
  assert.equal(replayed.intents[9].recoverRequested, false);
  request.recoverRequested = true; request.recoverySourceSha = 'old-source';
  let reads = 0;
  const refused = collectInfrastructureRetries(state, { request() { reads++; return recoveryApi(); }, now: at(2000) });
  assert.equal(reads, 0); assert.equal(refused[0].refused, 'recovery-source-changed');
  assert.equal(applyInfrastructureRetries(state, refused)[0].consumed, true);
});

test('an older accepted recovery comment cannot replace a newer recovery token or rearm consumed intent through stale metadata', async () => {
  let { state, request } = await incompleteFixture();
  const newer = commandContext('/apex recover', 501, at(1000));
  state = ingest(state, newer); request = state.requests[request.id];
  assert.equal(request.recoveryToken, 'comment:501');
  state = ingest(state, commandContext('/apex recover', 500, at(0)));
  assert.equal(state.requests[request.id].recoveryToken, 'comment:501');
  const stale = structuredClone(state.requests[request.id]);
  const proofs = collectInfrastructureRetries(state, { request: () => recoveryApi(), now: at(2000) });
  applyInfrastructureRetries(state, proofs);
  state = ingest(state, newer, stale);
  assert.equal(state.requests[request.id].recoverRequested, false);
  assert.equal(state.intents[9].recoverRequested, false);
});

test('event context includes its event name and authoritative label provenance; pagination cannot silently truncate', () => {
  const ctx = context(), issue = { ...ctx.issue, labels: [{ name: 'queue:priority' }] };
  const payload = { action: 'labeled', pull_request: ctx.pr, label: { name: 'queue:priority' }, sender: { login: 'brycejmurrin' } };
  const fetched = eventContext('pull_request_target', payload, active(), { now: at(0), request(endpoint) {
    const json = endpoint.includes('/events?') ? [{ id: 2, created_at: at(0), event: 'labeled', label: { name: 'queue:priority' }, actor: { login: 'brycejmurrin' }, performed_via_github_app: null }] :
      endpoint.startsWith('branches/') ? { commit: { sha: BASE } } : endpoint.startsWith('pulls/') ? ctx.pr : issue;
    return { status: 200, json };
  } });
  assert.equal(fetched.eventName, 'pull_request_target'); assert.equal(fetched.provenance.id, 2);
  assert.throws(() => listAll(() => ({ status: 200, json: Array(100).fill({}) }), 'issues', x => x, { maxPages: 2 }), /Incomplete paginated/);
});

test('late label webhooks reconcile the newest authoritative state while preserving sticky owner pauses', async () => {
  const state = active(), prepared = await prepare(context(), state); enqueue(state, prepared);
  state.requests[prepared.id].paused = true; state.requests[prepared.id].pauseOwner = true;
  const ctx = context(), issue = { ...ctx.issue, labels: [] };
  const payload = { action: 'labeled', pull_request: ctx.pr, label: { name: 'queue:paused' }, sender: { login: 'brycejmurrin' } };
  const event = (id, action, actor) => ({ id, created_at: at(0), event: action, label: { name: 'queue:paused' }, actor: { login: actor }, performed_via_github_app: null });
  for (const remover of ['brycejmurrin', 'agent']) {
    const fetched = eventContext('pull_request_target', payload, state, { now: at(2000), request(endpoint) {
      const json = endpoint.includes('/events?') ? [event(10, 'labeled', 'brycejmurrin'), event(20, 'unlabeled', remover)] :
        endpoint.startsWith('branches/') ? { commit: { sha: BASE } } : endpoint.startsWith('pulls/') ? ctx.pr : issue;
      return { status: 200, json };
    } });
    assert.equal(fetched.payload.action, 'unlabeled'); assert.equal(fetched.provenance.id, 20);
    const next = ingest(state, fetched);
    assert.equal(next.requests[prepared.id].paused, remover !== 'brycejmurrin');
  }
});

test('edited or identity-mismatched comments cannot grant intent through delayed creation events', () => {
  const original = commandContext(`/apex approve ${HEAD}`, 700, at(0));
  for (const changes of [{ body: '/apex merge' }, { updated_at: at(1000) }, { id: 701 }]) {
    const fetchedComment = { ...original.provenance, ...changes };
    const fetched = eventContext('issue_comment', original.payload, active(), { now: at(2000), request(endpoint) {
      const json = endpoint.startsWith('issues/comments/') ? fetchedComment : endpoint.startsWith('branches/') ? { commit: { sha: BASE } } : endpoint.includes('/events?') ? [] :
        endpoint.startsWith('pulls/') ? original.pr : original.issue;
      return { status: 200, json };
    } });
    assert.equal(fetched.event.relevant, false); assert.equal(fetched.payload.action, 'edited');
    assert.equal(ingest(active(), fetched).intents?.[9]?.approvedSha, undefined);
  }
  const current = eventContext('issue_comment', original.payload, active(), { request(endpoint) {
    const json = endpoint.startsWith('issues/comments/') ? { ...original.provenance, updated_at: at(0) } : endpoint.startsWith('branches/') ? { commit: { sha: BASE } } :
      endpoint.includes('/events?') ? [] : endpoint.startsWith('pulls/') ? original.pr : original.issue;
    return { status: 200, json };
  } });
  assert.equal(ingest(active(), current).intents[9].approvedSha, HEAD);
});

function scratch(t) {
  const parent = path.resolve('artifacts'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'actions-controller-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}

test('receipt downloads use fresh extraction directories and reject links or arbitrary artifact paths', t => {
  const root = scratch(t), id = 'a'.repeat(24), artifact = `actions-receipt-${id}-1`, dirs = [];
  const run = (command, args) => {
    assert.equal(command, 'gh'); const directory = args[args.indexOf('--dir') + 1]; dirs.push(directory);
    fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify({ attempt: dirs.length }));
  };
  assert.equal(downloadReceipt('123', artifact, id, root, { run }).attempt, 1);
  assert.equal(downloadReceipt('123', artifact, id, root, { run }).attempt, 2);
  assert.notEqual(dirs[0], dirs[1]); assert.ok(dirs.every(directory => !fs.existsSync(directory)));
  assert.throws(() => downloadReceipt('123', '../bad', id, root, { run }), /Unsafe artifact/);
  const secret = path.join(root, 'control.json'); fs.writeFileSync(secret, '{"secret":true}');
  assert.throws(() => downloadReceipt('123', artifact, id, root, { run(command, args) {
    const directory = args[args.indexOf('--dir') + 1]; fs.symlinkSync(secret, path.join(directory, `${id}.json`));
  } }), /Unsafe receipt/);
});

test('receipt reads and GitHub outputs reject file links and multiline injection', t => {
  const root = scratch(t), filename = path.join(root, 'receipt.json'); fs.writeFileSync(filename, '{}');
  const link = path.join(root, 'link.json'); fs.symlinkSync(filename, link);
  assert.throws(() => readReceipt(link), /Unsafe receipt/);
  const output = path.join(root, 'output');
  assert.throws(() => writeOutputs({ matrix: 'one\nclaimed=true' }, output), /single-line/);
  assert.throws(() => writeOutputs({ 'bad=key': 'value' }, output), /single-line/);
  writeOutputs({ matrix: { include: [] } }, output); assert.equal(fs.readFileSync(output, 'utf8'), 'matrix={"include":[]}\n');
});
