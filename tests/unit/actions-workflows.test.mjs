import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import { buildDiagnosticRequest, DIAGNOSTIC_WORKFLOWS } from '../../tools/ci/actions/diagnostics.mjs';
const read = name => parse(fs.readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'));
const SHA = 'a'.repeat(40);

test('coordinator rejects taxonomy noise before allocating a runner and recovers every five minutes', () => {
  const w = read('actions-coordinator'), job = w.jobs.reconcile;
  assert.equal(job.permissions.issues,'read');
  assert.equal(job.permissions.checks,undefined);
  assert.equal(job.permissions.statuses,'write');
  assert.ok(w.on.workflow_run.workflows.includes('Actions test executors'));
  assert.ok(read('spec-timings').on.workflow_run.workflows.includes('Actions test executors'));
  assert.equal(w.on.schedule[0].cron, '*/5 * * * *');
  for (const name of ['queue:paused', 'queue:priority']) assert.ok(job.if.includes(name));
  assert.equal(w.on.issues,undefined,'issue intake cannot launch work');
  assert.ok(!job.if.includes('queue:ready'));
  assert.match(job.if,/github.event.issue.pull_request \|\| github.event.issue.number == 3899/);
  assert.match(job.if, /startsWith\(github.event.comment.body, '\/apex '\)/);
  assert.match(job.if, /github.event_name == 'schedule'/);
  assert.deepEqual(w.concurrency, { group: 'actions-coordinator', queue: 'max', 'cancel-in-progress': false }, 'pending control commands must not be replaced by the next webhook');
  assert.equal(w.on.push, undefined, 'state branch writes cannot recursively trigger reconciliation');
  const steps = job.steps;
  assert.equal(steps.find(s => s.uses?.startsWith('actions/checkout')).with.ref, '${{ github.workflow_sha }}');
  assert.ok(steps.filter(s => /npm (ci|install)/.test(s.run || '')).every(s => s.run.includes('--ignore-scripts')), 'protected dependency setup never runs lifecycle hooks');
  assert.ok(steps.find(s => s.env?.ACTIONS_COORDINATOR_MODE).env.ACTIONS_COORDINATOR_MODE.includes("'shadow'"));
  assert.ok(!JSON.stringify(w).includes('WORKER_FIRE'));
  assert.ok(!JSON.stringify(w).includes('WORKER_HOST_ADAPTER'));
});

test('worker claims canonical reservations with write permission and executes mixed PR tasks with read permission only', () => {
  const w = read('actions-worker');
  assert.equal(w.jobs.claim.permissions.contents, 'write');
  assert.deepEqual(w.jobs.claim.concurrency, {group:'actions-claim',queue:'max'});
  assert.match(w.jobs.claim.if, /github.ref == 'refs\/heads\/claude\/f1-game-project-26h3ng'/);
  assert.deepEqual(w.jobs.execute.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'read', issues: 'read' });
  assert.equal(w.name,'Actions test executors');
  assert.equal(w.jobs.claim.permissions.checks,undefined);
  assert.equal(w.jobs.publish.permissions.contents, 'write');
  assert.equal(w.jobs.publish.steps.filter(s => s.uses?.startsWith('actions/checkout')).length, 1);
  assert.equal(w.jobs.publish.steps.find(s => s.uses?.startsWith('actions/checkout')).with.ref, '${{ github.workflow_sha }}');
  assert.equal(w.jobs.execute.strategy['fail-fast'], false);
  assert.equal(w.jobs.execute.strategy['max-parallel'], 8);
  const checkouts = w.jobs.execute.steps.filter(s => s.uses?.startsWith('actions/checkout'));
  assert.equal(checkouts[0].with.ref, '${{ github.workflow_sha }}');
  assert.equal(checkouts[1].with.ref, '${{ matrix.source_sha }}');
  assert.ok(checkouts.every(s => s.with['persist-credentials'] === false));
  const run = w.jobs.execute.steps.find(s => s.env?.TASK_JSON);
  assert.match(run.run, /control\/tools\/ci\/actions\/cli.mjs run --task-json "\$TASK_JSON" --root source/);
  assert.equal(run.env.GH_TOKEN, '${{ github.token }}', 'only the trusted wrapper receives the readonly fence token');
  const upload = w.jobs.execute.steps.find(s => s.with?.name?.startsWith('actions-receipt-'));
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with['if-no-files-found'], 'error');
  const pack=w.jobs.execute.steps.find(s=>s.name==='Publish reusable garage before pack');
  assert.equal(pack.with.name,'garage-before-${{ matrix.source_sha }}');
  assert.equal(pack.with['retention-days'],30);
  assert.equal(pack.with.path,'source/artifacts/actions/diagnostic/garage-before/');
});

test('cutover guards legacy executors, preserves Pages readonly reusable permissions and prerequisite barriers', () => {
  const retired=read('dispatch');
  assert.deepEqual(Object.keys(retired.on),['workflow_dispatch']);
  assert.ok(Object.values(retired.jobs).every(job=>job.if==='${{ false }}'));
  assert.ok(!JSON.stringify(retired).includes('--fire'));
  for (const job of Object.values(read('land').jobs)) assert.match(job.if, /ACTIONS_COORDINATOR_MODE != 'active'/);
  const ci = read('ci');
  assert.equal(ci.jobs['request-admission'], undefined, 'a skipped write job still invalidates a readonly reusable caller');
  assert.match(ci.jobs['ci-verdict'].name, /Legacy validation \(retired\)/, 'a skipped retired executor must not publish the required CI name');
  assert.ok(Object.values(ci.jobs).every(job => !Object.values(job.permissions || {}).includes('write')));
  assert.deepEqual(ci.jobs.selected.needs, ['select', 'guards-a', 'guards-b', 'guards-c', 'guards-d']);
  assert.equal(ci.jobs['baseline-trial']['continue-on-error'], true);
  assert.ok(!ci.jobs['ci-verdict'].needs.includes('baseline-trial'));
  assert.ok(!fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8').includes('READY_TIER'));
  assert.ok(ci.jobs['ci-verdict'].steps.find(s => s.env?.REQUIRE_SUCCESS).env.REQUIRE_SUCCESS.includes('smoke,staged-boot'));
  const pages = read('pages');
  assert.equal(pages.concurrency['cancel-in-progress'], false);
  assert.equal(pages.jobs.deploy.permissions['id-token'], 'write');
  assert.equal(pages.jobs.ci.permissions.contents, 'read');
});

test('every migrated diagnostic entry records admission and cannot run the legacy body in active mode', () => {
  for (const filename of Object.keys(DIAGNOSTIC_WORKFLOWS)) {
    if (filename === 'ci.yml') continue;
    const workflow = read(filename.slice(0, -4));
    const adapter = workflow.jobs['request-admission'];
    assert.deepEqual(adapter.concurrency,{group:'actions-claim',queue:'max'},'adapters and claims share one control slot');
    assert.match(adapter.if, /ACTIONS_COORDINATOR_MODE == 'active'/);
    assert.ok(adapter.steps.some(s => s.run?.includes('request --workflow')));
    assert.ok(!adapter.steps.some(s => /npm (ci|install)/.test(s.run || '')));
    for (const [name, job] of Object.entries(workflow.jobs)) if (name !== 'request-admission') assert.match(job.if, /ACTIONS_COORDINATOR_MODE != 'active'/);
  }
});

test('admission identity includes immutable source, environment and experiment parameters; commands remain structured data', () => {
  const event = { sha: SHA, inputs: { group: 'ui', gl: 'llvmpipe' } };
  const a = buildDiagnosticRequest('browser-group.yml', event);
  assert.equal(a.request_id, buildDiagnosticRequest('browser-group.yml', event).request_id);
  assert.notEqual(buildDiagnosticRequest('browser-group.yml', event, {run_id:'1'}).request_id, buildDiagnosticRequest('browser-group.yml', event, {run_id:'2'}).request_id);
  assert.equal(buildDiagnosticRequest('browser-group.yml', event, {run_id:'1'}).request_id, buildDiagnosticRequest('browser-group.yml', event, {run_id:'1'}).request_id);
  assert.notEqual(a.request_id, buildDiagnosticRequest('browser-group.yml', { ...event, inputs: { ...event.inputs, gl: 'swiftshader' } }).request_id);
  assert.notEqual(a.request_id, buildDiagnosticRequest('browser-group.yml', { ...event, sha: 'b'.repeat(40) }).request_id);
  assert.throws(() => buildDiagnosticRequest('unknown.yml', event), /unsupported/);
  assert.throws(() => buildDiagnosticRequest('browser-group.yml', { sha: 'main' }), /immutable/);
  assert.throws(() => buildDiagnosticRequest('gpu-census.yml', { sha: SHA, inputs: { images: 'self-hosted' } }), /unsupported runner/);
  assert.throws(() => buildDiagnosticRequest('gpu-census.yml', { sha: SHA, inputs: { images: 'macos-13' } }), /unsupported runner/);
  assert.equal(buildDiagnosticRequest('archive-evidence.yml', { sha: SHA }).publisher, true);
  assert.equal(buildDiagnosticRequest('lit-wgsl-advisory.yml', { sha: SHA }).advisory, true);
});


test('candidate validation is independent of active cutover and only publishes exact-tree evidence after passing checks', () => {
  const w = read('actions-validation'), job = w.jobs.validate;
  assert.deepEqual(w.permissions, { contents: 'read' });
  assert.deepEqual({ condition: job.if, displayName: job.name }, { condition: undefined, displayName: 'Actions validation' }, 'the installed validation job must match the cutover evidence contract');
  const tests = job.steps.findIndex(s => s.run === 'node --test tests/unit/actions-*.test.mjs');
  const lint = job.steps.findIndex(s => s.name === 'Validate every workflow');
  const evidence = job.steps.findIndex(s => s.name?.startsWith('Write evidence'));
  assert.ok(tests >= 0 && lint > tests && evidence > lint);
  assert.match(job.steps[evidence].run, /policyVersion: 'actions-v1'/);
  assert.match(job.steps[evidence].run, /treeSha: git\('HEAD\^\{tree\}'\)/);
  assert.equal(job.steps.at(-1).if, undefined, 'failure never uploads a passed receipt');
});
