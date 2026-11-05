#!/usr/bin/env node
// @doc Durable Actions queue: shadow planning, trusted claims, read-only execution, and checkpointed label migration.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createApi } from './api.mjs';
import { createStore, compactHistory } from './store.mjs';
import { newState, enqueue } from './state.mjs';
import { executeBundle, executionEnv, runCommand } from './executor.mjs';
import { planCoverage, bundleTasks, verifyCoverage } from './coverage.mjs';
import { verifyInstallation, activate, rollback } from './cutover.mjs';
import { exportSnapshot, importSnapshot, planMigration, applyMigration, snapshotDigest, verifySnapshotCurrent } from './migration.mjs';
import { DEPLOY_BRANCH, POLICY_VERSION, digest, requireResponse, listAll, eventContext, prepareRequest, ingest,
  claimMatrix, canonicalExecution, diagnosticRequest, validationVerdict, prepareAdmission,
  collectObservations, reconcileResults, collectInfrastructureRetries, applyInfrastructureRetries,
  downloadReceipt, writeOutputs, sourceCheckout } from './controller.mjs';

const HERE = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const fileJSON = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const at = () => new Date().toISOString();
const using = (options, name, fallback) => options._deps?.[name] || fallback;
const policyVersion = () => `${POLICY_VERSION}:${execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()}`;
function args(argv) {
  const values = { command: argv[0] || 'help' };
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
    const key = argv[i].slice(2);
    values[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key === 'apply' && values[key] !== true) throw new Error('--apply is a flag and accepts no value');
  }
  return values;
}

function transport({ migration = false } = {}) {
  const api = createApi({ maxRequests: migration ? 10000 : 100 });
  const request = (endpoint, options = {}) => api(endpoint, {
    ...options,
    ...(options.method === 'PUT' && endpoint === 'contents/state.json' && options.body?.branch === 'bot/actions-state' ? { storeWrite: true, bypassCooldown: true } : {}),
    ...(options.method === 'GET' && endpoint === 'contents/state.json?ref=bot%2Factions-state' ? { storeRead: true, bypassCooldown: true } : {}),
  });
  return { api, request, store: createStore({ request }) };
}

function readLedger(store, api) {
  const snapshot = store.read();
  const fresh = { ...api.cooldown };
  Object.assign(api.cooldown, snapshot.state.api || {});
  if (Number(fresh.notBefore || 0) > Number(api.cooldown.notBefore || 0)) Object.assign(api.cooldown, fresh);
  return snapshot;
}

function activeOnly(snapshot) {
  if (snapshot.missing || snapshot.state.mode !== 'active' || snapshot.state.migration?.stage !== 'complete') {
    throw new Error('Active execution requires a completed durable migration and an active ledger');
  }
}

function requestTime(descriptor, { request }) {
  const id = descriptor.request_run_id || descriptor.producer_run_id;
  if (!id) return at(); // Explicit local intake begins when accepted here.
  const run = requireResponse(request, `actions/runs/${id}`);
  if (String(run.id) !== String(id) || !Number.isFinite(Date.parse(run.created_at))) throw new Error('Diagnostic submission time is unavailable');
  return new Date(run.created_at).toISOString();
}

function readCurrentPR(request, number) {
  const pr = requireResponse(request, `pulls/${number}`);
  if (pr.base.ref === DEPLOY_BRANCH) {
    const branch = requireResponse(request, `branches/${encodeURIComponent(DEPLOY_BRANCH)}`);
    if (!/^[a-f0-9]{40}$/.test(branch.commit?.sha || '')) throw new Error('Current deploy base is unavailable');
    pr.base = { ...pr.base, sha: branch.commit.sha };
  }
  return pr;
}

async function refreshPR(number, state, request, now) {
  const payload = { action: 'synchronize', number, pull_request: { number }, sender: { login: 'reconciliation' } };
  const context = { ...eventContext('pull_request_target', payload, state, { request, now }), eventName: 'pull_request_target' };
  const prepared = await prepareRequest(context, state, { request, now, policyVersion: policyVersion() });
  return { context, prepared };
}

async function reconcile(options) {
  const { api, request, store } = using(options, 'transport', transport)();
  let snapshot = readLedger(store, api);
  const mode = options.mode || process.env.ACTIONS_COORDINATOR_MODE || 'shadow';
  if (!['shadow', 'paused', 'active'].includes(mode)) throw new Error('Reconciliation mode must be shadow, paused or active');
  if (mode === 'active') {
    activeOnly(snapshot);
    if (Buffer.byteLength(JSON.stringify(snapshot.state)) > 4 * 1024 * 1024) {
      await using(options, 'compactHistory', compactHistory)({ store, request, maxArchives: 2, now: at() });
      snapshot = readLedger(store, api);
    }
  }
  const payload = options['event-file'] ? fileJSON(options['event-file']) : {};
  const eventName = options.event || process.env.GITHUB_EVENT_NAME || 'workflow_dispatch';
  const now = using(options, 'now', at)();
  if (mode === 'paused' && !['issue_comment', 'issues', 'pull_request_target'].includes(eventName)) {
    writeOutputs({ wave: '' }); return { mode, mutated: false };
  }
  if (eventName === 'workflow_dispatch' && payload.inputs?.workflow) {
    if (mode !== 'active') { writeOutputs({ wave: '' }); return { mode, mutated: false, workflow: payload.inputs.workflow }; }
    const supplied = JSON.parse(payload.inputs.request || '{}');
    const event = supplied.inputs ? supplied : { inputs: supplied };
    return diagnostic({ ...options, workflow: payload.inputs.workflow, event });
  }
  if (mode === 'active' && eventName === 'workflow_run' && payload.workflow_run?.name === 'CI' &&
    ['schedule', 'workflow_dispatch'].includes(payload.workflow_run.event) && payload.workflow_run.head_branch === DEPLOY_BRANCH) {
    const run = requireResponse(request, `actions/runs/${payload.workflow_run.id}`);
    if (run.head_repository?.full_name !== 'brycejmurrin/f1-game' || run.head_sha !== payload.workflow_run.head_sha) throw new Error('CI producer provenance changed');
    return diagnostic({ ...options, workflow: 'ci.yml', event: { workflow_run: run },
      context: { source_sha: run.head_sha, event_name: run.event, run_id: String(run.id) } });
  }
  let state = snapshot.state;
  const context = { ...using(options, 'eventContext', eventContext)(eventName, payload, state, { request, now }), eventName };
  if (!context.event.relevant) { writeOutputs({ wave: '' }); return { mode, ignored: context.event.reason }; }
  if (mode === 'paused') {
    if (snapshot.missing) { writeOutputs({ wave: '' }); return { mode, mutated: false }; }
    store.update(live => Object.assign(live, ingest(live, context)));
    writeOutputs({ wave: '' }); return { mode, controlsRecorded: true };
  }
  if (context.event.command?.type === 'approve' && context.pr) {
    const base = requireResponse(request, `git/commits/${context.pr.base.sha}`);
    const approvedAt = Date.parse(context.provenance?.created_at), baseAt = Date.parse(base.committer?.date);
    if (context.event.command.sha !== context.pr.head.sha || !Number.isFinite(approvedAt) || !Number.isFinite(baseAt) || approvedAt < baseAt) {
      throw new Error('Approval must be a fresh owner comment for the current head and deploy base');
    }
  }
  // Apply new intent before deriving a plan (batch/merge/approval command).
  state = ingest(state, context);
  if (context.event.command?.type === 'approve' && context.pr) {
    const files = listAll(request, `pulls/${context.pr.number}/files`);
    const { approvalDigest } = await import('./landing.mjs');
    context.diffSha = approvalDigest(files);
    state = ingest(snapshot.state, context);
  }
  const prepared = context.issue ? await using(options, 'prepareRequest', prepareRequest)(context, state, { request, now, policyVersion: policyVersion() }) : null;
  state = ingest(state, context, prepared);
  const refreshes = [];
  if (!context.issue && ['schedule', 'workflow_dispatch', 'workflow_run'].includes(eventName)) {
    // Recover replaced hints, in bounded rotating slices rather than N full comment scans per event.
    const prs = listAll(request, `pulls?state=open&base=${encodeURIComponent(DEPLOY_BRANCH)}`);
    const cursor = state.discoveryCursor || 0;
    const ordered = [...prs.slice(cursor), ...prs.slice(0, cursor)];
    for (const pr of ordered.slice(0, 4)) {
      const current = Object.values(state.requests).find(r => r.kind === 'pr' && r.number === pr.number && !r.superseded && r.headSha === pr.head.sha && r.baseSha === pr.base.sha && r.draft === pr.draft && r.tasks.length);
      if (!current) {
        const refresh = await refreshPR(pr.number, state, request, now);
        refreshes.push(refresh); state = ingest(state, refresh.context, refresh.prepared);
      }
    }
    state.discoveryCursor = prs.length ? (cursor + 4) % prs.length : 0;
  }
  const observations = mode === 'active' ? using(options, 'collectObservations', collectObservations)(state, { request, download: downloadReceipt, now }) : [];
  reconcileResults(state, observations);
  const retries = mode === 'active' ? using(options, 'collectInfrastructureRetries', collectInfrastructureRetries)(state, { request, now }) : [];
  if (mode === 'shadow') {
    writeOutputs({ wave: '' });
    return { mode, mutated: false, requests: Object.keys(state.requests).length,
      plans: Object.values(state.requests).filter(r => r.plan).map(r => ({ id: r.id, jobs: r.tasks.length, requiredCoverage: r.requiredCoverage.length })), api: api.metrics };
  }
  activeOnly(snapshot);
  const saved = store.update(live => {
    let next = ingest(live, context, prepared);
    for (const refresh of refreshes) next = ingest(next, refresh.context, refresh.prepared);
    next.discoveryCursor = state.discoveryCursor;
    reconcileResults(next, observations);
    applyInfrastructureRetries(next, retries);
    next.api = { ...api.cooldown };
    Object.assign(live, next);
    return prepareAdmission(live, now);
  });
  const wave = saved.result.waves[0]?.id || '';
  writeOutputs({ wave });
  await using(options, 'publishVerdicts', publishVerdicts)(saved.state, { request, store });
  const { landNext } = await import('./landing.mjs');
  const landing = await using(options, 'landNext', landNext)({ store, request, now });
  const { planWorkerLaunches, executeWorkerLaunch, reconcileWorkers } = await import('./workers.mjs');
  await using(options, 'reconcileWorkers', reconcileWorkers)(store, { now });
  const workers = planWorkerLaunches(store.read().state, { now });
  store.update(live => { live.producer = workers.producer; });
  // One new producer per recovery cycle prevents a resume burst.
  for (const launch of workers.launches.slice(0, 1)) await using(options, 'executeWorkerLaunch', executeWorkerLaunch)(store, { requestId: launch.requestId, now,
    read: async record => {
      const issue = requireResponse(request, `issues/${record.number}`);
      const { parseMembers } = await import('./migration.mjs');
      const timeline = listAll(request, `issues/${record.number}/timeline`);
      return { issue, blockers: listAll(request, `issues/${record.number}/dependencies/blocked_by`).filter(i => i.state !== 'closed'),
        members: parseMembers(issue.body || ''), paused: record.paused,
        linkedPrs: timeline.filter(e => e.event === 'cross-referenced' && e.source?.issue?.pull_request && e.source.issue.state === 'open'),
        batchParent: Object.values(store.read().state.requests).find(r => !r.superseded && r.members?.includes(record.number))?.number };
    } });
  return { mode, wave, requests: Object.keys(saved.state.requests).length, landing, producer: workers.producer, api: api.metrics };
}

async function publishVerdicts(state, { request, store }) {
  for (const record of Object.values(state.requests).filter(r => r.kind === 'pr' && !r.superseded && r.headSha && r.plan)) {
    const proposed = validationVerdict(state, record);
    if (record.publishedVerdict === digest(proposed)) continue;
    const current = readCurrentPR(request, record.number);
    if (current.base.ref !== DEPLOY_BRANCH || current.head.sha !== record.headSha || current.base.sha !== record.baseSha || current.state !== 'open') continue;
    const result = validationVerdict(state, record, { currentPR: current }), signature = digest(result);
    if (record.publishedVerdict === signature) continue;
    requireResponse(request, `statuses/${record.headSha}`, { method: 'POST', body: { context: 'gate', ...result,
      target_url: `https://github.com/brycejmurrin/f1-game/actions/runs/${process.env.GITHUB_RUN_ID || ''}` } });
    store.update(live => { if (live.requests[record.id]) live.requests[record.id].publishedVerdict = signature; });
  }
}

async function claim(options) {
  if (process.env.GITHUB_REF !== `refs/heads/${DEPLOY_BRANCH}`) throw new Error('Claims run only from the protected deploy branch');
  const { api, store } = using(options, 'transport', transport)();
  activeOnly(readLedger(store, api));
  const owner = { runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  const saved = store.update(state => claimMatrix(state, options.wave, owner));
  const include = saved.result.matrix.include;
  const readonly = include.filter(row => !JSON.parse(row.task_json).task.publisher);
  const publishers = include.filter(row => { const task = JSON.parse(row.task_json).task; return task.publisher && !task.release; });
  const releases = include.filter(row => JSON.parse(row.task_json).task.release);
  writeOutputs({ claimed: saved.result.claimed && readonly.length ? 'true' : 'false', matrix: { include: readonly },
    publisher_claimed: saved.result.claimed && publishers.length ? 'true' : 'false', publisher_matrix: { include: publishers },
    release_claimed: saved.result.claimed && releases.length ? 'true' : 'false', release_matrix: { include: releases } });
  return { claimed: saved.result.claimed, tasks: include.length };
}

async function runTask(options, publisher = false) {
  const envelope = JSON.parse(options['task-json']);
  if (!/^[a-f0-9]{24}$/.test(envelope.id || '')) throw new Error('Invalid receipt identity');
  const identity = { runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  let receipt = { version: 1, ...envelope, task: undefined, taskId: envelope.taskId, status: 'incomplete', complete: false, exitCode: 1 };
  try {
    const { api, request, store } = using(options, 'transport', transport)();
    const snapshot = readLedger(store, api);
    activeOnly(snapshot);
    const canonical = canonicalExecution(snapshot.state, envelope, identity);
    const record = canonical.request;
    if (record.kind === 'pr') {
      const pr = readCurrentPR(request, record.number);
      const labels = requireResponse(request, `issues/${record.number}`).labels.map(l => l.name);
      if (pr.base.ref !== DEPLOY_BRANCH || pr.head.sha !== record.headSha || pr.base.sha !== record.baseSha || pr.state !== 'open' || labels.includes('queue:paused')) throw new Error('PR state changed before execution');
    }
    const sourceRoot = path.resolve(options.root);
    const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
    const actualTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
    if (!publisher && (actualSha !== record.sourceSha || actualTree !== record.treeSha)) throw new Error('Execution source differs from the admitted tree');
    const lease = { ...identity, taskId: canonical.task.id, sourceSha: record.sourceSha, planDigest: record.coverageDigest || record.planDigest };
    receipt = { ...receipt, ...identity, sourceSha: record.sourceSha, baseSha: record.baseSha, treeSha: record.treeSha,
      planDigest: record.coverageDigest || record.planDigest, coverageIds: canonical.task.coverageIds, environment: canonical.task.environment };
    if (publisher) {
      if (!canonical.task.publisher || canonical.task.release || process.env.GITHUB_REF !== `refs/heads/${DEPLOY_BRANCH}`) throw new Error('Publisher requires a trusted protected-branch task');
      const { executePublisher } = await import('./diagnostic-executor.mjs');
      const protectedTip = requireResponse(request, `branches/${encodeURIComponent(DEPLOY_BRANCH)}`).commit.sha;
      const ancestry = requireResponse(request, `compare/${record.sourceSha}...${protectedTip}`);
      if (!['ahead', 'identical'].includes(ancestry.status)) throw new Error('Publisher source is not a protected-branch ancestor');
      const trustedRoot = actualSha === record.sourceSha ? sourceRoot : sourceCheckout(record.sourceSha, { cwd: sourceRoot });
      if (trustedRoot !== sourceRoot) {
        const install = await runCommand('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
          cwd: trustedRoot, env: executionEnv({}, process.env), timeoutMs: 600_000,
        });
        if (install.exitCode !== 0) throw new Error('Historical protected publisher dependency installation failed');
      }
      const result = await executePublisher(record.diagnostic, { trustedRoot, env: process.env, ledger: snapshot.state });
      receipt = { ...receipt, status: result.status, complete: result.complete === true && result.status === 'success',
        exitCode: result.complete && result.status === 'success' ? 0 : 1, publication: result.publication };
    } else {
      if (canonical.task.publisher) throw new Error('A read-only executor cannot publish');
      if (record.diagnostic && !record.plan) {
        const { executeDiagnostic } = await import('./diagnostic-executor.mjs');
        const result = await executeDiagnostic({ descriptor: record.diagnostic, task: canonical.task, sourceRoot,
          sourceSha: record.sourceSha, baseSha: record.baseSha, treeSha: record.treeSha, env: process.env });
        receipt = { ...receipt, ...result };
      } else receipt = await executeBundle({ bundle: canonical.task, plan: record.plan, sourceRoot, claim: lease, owner: lease, env: process.env });
    }
    receipt.requestId = envelope.requestId; receipt.waveId = envelope.waveId;
  } catch (error) { receipt.error = error.message; }
  const directory = path.resolve(process.env.ACTIONS_RECEIPT_DIR || 'artifacts/actions/receipts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${envelope.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.complete) process.exitCode = 1;
  return { status: receipt.status, complete: receipt.complete, taskId: receipt.taskId, error: receipt.error };
}

async function releaseTask(options, completing = false) {
  const envelope = JSON.parse(options['task-json']);
  if (!/^[a-f0-9]{24}$/.test(envelope.id || '')) throw new Error('Invalid release receipt identity');
  const identity = { runId: process.env.GITHUB_RUN_ID, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  let receipt = { version: 1, ...envelope, task: undefined, ...identity, status: 'incomplete', complete: false, exitCode: 1 };
  try {
    if (process.env.GITHUB_REF !== `refs/heads/${DEPLOY_BRANCH}`) throw new Error('Release requires a protected-branch workflow');
    const { api, store } = using(options, 'transport', transport)();
    const snapshot = readLedger(store, api);
    activeOnly(snapshot);
    const { request: record, task } = canonicalExecution(snapshot.state, envelope, identity);
    receipt = { ...receipt, sourceSha: record.sourceSha, baseSha: record.baseSha, treeSha: record.treeSha,
      planDigest: record.planDigest, environment: task.environment, coverageIds: task.coverageIds };
    if (record.kind !== 'release' || !task.release || !task.publisher || !record.plan ||
      !verifyCoverage(record.plan, Object.values(record.results)).ok ||
      record.tasks.some(t => !t.release && (record.results[t.id]?.status !== 'success' || !record.results[t.id]?.complete))) {
      throw new Error('Release requires complete exact-source validation receipts');
    }
    const sourceRoot = path.resolve(options.root), trustedRoot = path.resolve(options['control-root']);
    const { prepareRelease, verifyRelease } = await import('./diagnostic-executor.mjs');
    if (!completing) {
      const prepared = await using(options, 'prepareRelease', prepareRelease)({ sourceRoot, trustedRoot, sourceSha: record.sourceSha, treeSha: record.treeSha });
      writeOutputs({ publish: prepared.publish ? 'true' : 'false', build: prepared.build });
      return { prepared: true, publish: prepared.publish, outcome: prepared.outcome, sourceSha: record.sourceSha };
    }
    if (process.env.PREPARE_RESULT !== 'success') throw new Error('Release preparation did not succeed');
    const prepared = fileJSON(path.join(trustedRoot, 'artifacts/actions/release/prepared.json'));
    const result = await using(options, 'verifyRelease', verifyRelease)({ sourceRoot, trustedRoot, prepared, deploymentResult: process.env.DEPLOYMENT_RESULT });
    receipt = { ...receipt, ...result, publication: prepared.publish ? 'published' : prepared.outcome };
  } catch (error) { receipt.error = error.message; }
  const directory = path.resolve(process.env.ACTIONS_RECEIPT_DIR || 'artifacts/actions/receipts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${envelope.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.complete) process.exitCode = 1;
  return { status: receipt.status, complete: receipt.complete, publication: receipt.publication, error: receipt.error };
}

async function diagnostic(options) {
  if (options.mode && options.mode !== 'active') { writeOutputs({ wave: '' }); return { mode: options.mode, mutated: false }; }
  const { api, request, store } = using(options, 'transport', transport)();
  const snapshot = readLedger(store, api);
  activeOnly(snapshot);
  const event = options.event || (options['event-file'] ? fileJSON(options['event-file']) : JSON.parse(options.request || '{}'));
  const item = diagnosticRequest(options.workflow, event, options.context || { source_sha: process.env.GITHUB_SHA, event_name: process.env.GITHUB_EVENT_NAME, run_id: process.env.GITHUB_RUN_ID });
  item.id = `${item.id}:${policyVersion()}`;
  const { diagnosticTasks } = await import('./diagnostic-executor.mjs');
  const root = using(options, 'sourceCheckout', sourceCheckout)(item.sourceSha);
  const treeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
  item.treeSha = treeSha;
  item.baseSha = item.diagnostic.base_sha || null;
  if (['ci.yml', 'pages.yml'].includes(options.workflow)) {
    let since = item.baseSha || `${item.sourceSha}^`;
    if (options.workflow === 'pages.yml') {
      const tip = requireResponse(request, `branches/${encodeURIComponent(DEPLOY_BRANCH)}`).commit.sha;
      if (tip !== item.sourceSha) { writeOutputs({ wave: '' }); return { superseded: true, sourceSha: item.sourceSha, currentTip: tip }; }
      const { releaseBase } = await import('./diagnostic-executor.mjs');
      const live = await using(options, 'releaseBase', releaseBase)({ sourceRoot: root, sourceSha: item.sourceSha });
      if (live.alreadyLive) { writeOutputs({ wave: '' }); return { alreadyLive: true, sourceSha: item.sourceSha }; }
      item.baseSha = live.baseSha;
      since = live.baseSha || 'unknown-release-base';
    }
    const plan = await using(options, 'planCoverage', planCoverage)({ root, since, mode: options.workflow === 'pages.yml' ? 'train' : item.diagnostic.event_name === 'schedule' ? 'nightly' : 'manual', sourceSha: item.sourceSha,
      baseSha: item.baseSha, treeSha, requestId: item.id });
    item.baseSha = plan.baseSha;
    item.plan = plan; item.coverageDigest = plan.digest; item.planDigest = plan.digest;
    item.requiredCoverage = plan.requiredCoverage;
    item.tasks = bundleTasks(plan).bundles;
    if (options.workflow === 'pages.yml') {
      const tip = requireResponse(request, `branches/${encodeURIComponent(DEPLOY_BRANCH)}`).commit.sha;
      const ancestry = requireResponse(request, `compare/${item.sourceSha}...${tip}`);
      if (!['ahead', 'identical'].includes(ancestry.status)) throw new Error('Release source must be an ancestor of the protected deploy branch');
      item.kind = 'release';
      item.tasks.push({ id: 'publish-pages', kind: 'release', release: true, publisher: true, runner: 'ubuntu-latest',
        sourceSha: item.sourceSha, baseSha: item.baseSha, treeSha, requestId: item.id, planDigest: plan.digest,
        coverageIds: [], environment: { node: '22', backend: 'none' }, prerequisites: item.tasks.map(t => t.id), expectedSeconds: 180, setupSeconds: 60 });
    }
  } else {
    item.tasks = diagnosticTasks(item.diagnostic, { sourceRoot: root, sourceSha: item.sourceSha, baseSha: item.baseSha, treeSha });
    item.planDigest = digest(item.tasks);
    for (const task of item.tasks) { task.planDigest = item.planDigest; task.requestId = item.id; }
    item.requiredCoverage = [...new Set(item.tasks.flatMap(t => t.coverageIds || []))];
  }
  item.acceptedAt = using(options, 'requestTime', requestTime)(item.diagnostic, { request });
  const saved = store.update(state => {
    enqueue(state, item);
    return options.command === 'reconcile' ? prepareAdmission(state, at()) : { waves: [] };
  });
  const wave = saved.result.waves[0]?.id || '';
  writeOutputs({ wave });
  return { requestId: item.id, tasks: item.tasks.length, wave };
}

function writeJSON(filename, value) {
  if (!filename) throw new Error('An explicit --out path is required');
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

async function migrationCommand(options) {
  const { api, request, store } = using(options, 'transport', transport)({ migration: true });
  if (options.command === 'snapshot') {
    const snapshot = await exportSnapshot({ request });
    writeJSON(options.out, snapshot);
    return { path: options.out, digest: snapshot.digest, labels: snapshot.labels.length, objects: snapshot.items.length };
  }
  const snapshot = importSnapshot(fs.readFileSync(options.snapshot, 'utf8'));
  const plan = planMigration(snapshot);
  if (options.command === 'migration-plan') { writeJSON(options.out, plan); return { digest: plan.digest, counts: plan.counts, destructive: false }; }
  if (!options.apply) return { dryRun: true, counts: plan.counts, digest: plan.digest };
  // Export first, then persist every attachment in immutable page documents and verify it by digest.
  // Never accept an arbitrary CLI assertion that backup or freeze already happened.
  const installation = await verifyInstallation({ request, validationRunId: options['validation-run'] });
  const baseSha = installation.sourceSha;
  store.initialize({ baseSha, state: newState({ mode: 'paused' }) });
  const backupPath = `migrations/${snapshot.digest}/snapshot.json`;
  let backup = request(`contents/${backupPath}?ref=bot%2Factions-state`);
  if (backup.status === 404) backup = request(`contents/${backupPath}`, { method: 'PUT', body: { branch: 'bot/actions-state',
    message: 'chore(actions): preserve complete pre-cutover label snapshot', content: Buffer.from(JSON.stringify(snapshot)).toString('base64') } });
  if (backup.error || backup.status < 200 || backup.status >= 300) throw new Error('Durable backup failed');
  const verified = requireResponse(request, `contents/${backupPath}?ref=bot%2Factions-state`);
  const blob = verified.encoding === 'none' ? requireResponse(request, `git/blobs/${verified.sha}`) : verified;
  if (blob.encoding !== 'base64' || blob.truncated || typeof blob.content !== 'string' || (blob.sha && blob.sha !== verified.sha)) throw new Error('Durable snapshot blob unavailable');
  const persisted = importSnapshot(Buffer.from(blob.content, 'base64').toString('utf8'));
  if (snapshotDigest(persisted) !== snapshot.digest) throw new Error('Durable snapshot readback failed');
  requireResponse(request, installation.variable ? 'actions/variables/ACTIONS_COORDINATOR_MODE' : 'actions/variables', {
    method: installation.variable ? 'PATCH' : 'POST', body: { name: 'ACTIONS_COORDINATOR_MODE', value: 'paused' },
  });
  if (requireResponse(request, 'actions/variables/ACTIONS_COORDINATOR_MODE').value !== 'paused') throw new Error('Paused mode variable readback failed');
  store.update(state => {
    if (state.migration?.snapshotDigest && state.migration.snapshotDigest !== snapshot.digest &&
      state.migration.checkpoint?.completed?.some(key => key.startsWith('delete:'))) throw new Error('Resume the existing snapshot migration after label deletion has begun');
    state.migration = { ...state.migration, snapshotDigest: snapshot.digest, planDigest: plan.digest,
      controlsBeforeFreeze: state.migration?.controlsBeforeFreeze || Object.fromEntries(['workers', 'validation', 'merges'].map(scope => [scope, !!(state.controls[scope] || plan.controls?.[scope])])),
      frozenAt: state.migration?.frozenAt || at() };
    state.mode = 'paused'; state.controls = { workers: true, validation: true, merges: true };
  });
  const freeze = [];
  for (const name of ['dispatch.yml', 'land.yml']) {
    requireResponse(request, `actions/workflows/${name}/disable`, { method: 'PUT' });
    const observed = requireResponse(request, `actions/workflows/${name}`);
    if (observed.state !== 'disabled_manually') throw new Error(`Old consumer ${name} is not disabled`);
    freeze.push({ name, id: observed.id, state: observed.state });
  }
  // Paused YAML blocks new legacy admission. Previously queued/running jobs must be
  // terminal too: cancellation is a request, never terminal ownership evidence.
  const liveLegacy = [];
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const runs = listAll(request, `actions/runs?status=${status}`, data => data.workflow_runs);
    liveLegacy.push(...runs.filter(run => !['.github/workflows/actions-coordinator.yml', '.github/workflows/actions-validation.yml'].includes(run.path?.split('@')[0])));
  }
  if (liveLegacy.length) {
    for (const run of new Map(liveLegacy.map(run => [run.id, run])).values()) requireResponse(request, `actions/runs/${run.id}/cancel`, { method: 'POST' });
    throw new Error('Legacy work cancellation requested. Resume this migration after every old run is terminal; no labels were deleted.');
  }
  const resume = store.read().state.migration?.checkpoint;
  if (!resume?.completed?.some(key => key.startsWith('delete:'))) await verifySnapshotCurrent({ request, snapshot });
  const result = await applyMigration(plan, { request, dryRun: false, activeCutover: true, resume,
    durableBackup: { verified: true, snapshotDigest: snapshot.digest, receipt: `${backupPath}@${verified.sha}` },
    oldConsumersDisabled: { verified: true, receipt: digest(freeze) },
    checkpoint: async checkpoint => store.update(state => {
      state.migration = { ...state.migration, stage: checkpoint.stage, snapshotDigest: snapshot.digest, planDigest: plan.digest, checkpoint };
      for (const record of plan.requests) if (!state.requests[record.id]) enqueue(state, record);
    }) });
  return { stage: result.stage, mode: 'paused', backup: backupPath, message: 'Labels migrated; activation is a separate verified step.' };
}

async function dispatch(options) {
  if (options.command === 'reconcile') return reconcile(options);
  if (options.command === 'claim') return claim(options);
  if (options.command === 'run') return runTask(options);
  if (options.command === 'publish') return runTask(options, true);
  if (options.command === 'release-prepare') return releaseTask(options);
  if (options.command === 'release-complete') return releaseTask(options, true);
  if (options.command === 'request') return diagnostic(options);
  if (['snapshot', 'migration-plan', 'migrate'].includes(options.command)) return migrationCommand(options);
  if (options.command === 'status') { const { store } = using(options, 'transport', transport)(); return store.read().state; }
  if (options.command === 'compact') {
    const { store, request, api } = using(options, 'transport', transport)();
    const snapshot = readLedger(store, api);
    if (snapshot.missing || snapshot.state.migration?.stage !== 'complete' || !['active', 'paused'].includes(snapshot.state.mode)) throw new Error('History compaction requires an installed migration ledger');
    return compactHistory({ store, request, maxArchives: 2, thresholdBytes: 0, now: at() });
  }
  if (['activate', 'rollback'].includes(options.command)) {
    const { request, store } = using(options, 'transport', transport)({ migration: true });
    const result = options.command === 'activate'
      ? await activate({ request, store, validationRunId: options['validation-run'] })
      : await rollback({ request, store, reason: options.reason || 'operator rollback' });
    return result.result;
  }
  return { usage: 'cli.mjs reconcile|claim|run|publish|request|snapshot|migration-plan|migrate|activate|rollback|compact|status', default: 'shadow; migration dry-run unless --apply' };
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = args(argv), transports = [];
  options._deps = { ...dependencies, transport: (...values) => {
    const instance = (dependencies.transport || transport)(...values);
    transports.push(instance); return instance;
  } };
  try { return await dispatch(options); }
  finally {
    const mutable = (options.command === 'reconcile' && (options.mode || process.env.ACTIONS_COORDINATOR_MODE) === 'active') ||
      (options.command === 'migrate' && options.apply) || ['activate', 'rollback', 'compact'].includes(options.command);
    if (mutable) for (const { api, store } of transports) {
      if (!(Number(api?.cooldown?.notBefore) > Date.now())) continue;
      try {
        const current = store.read();
        if (!current.missing && Number(api.cooldown.notBefore) > Number(current.state.api?.notBefore || 0)) {
          store.update(state => { state.api = { ...api.cooldown }; });
        }
      } catch (error) { console.error(`actions: cooldown persistence deferred: ${error.message}`); }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  try { console.log(JSON.stringify(await main(), null, 2)); }
  catch (error) { console.error(`actions: ${error.message}`); process.exitCode = 1; }
}
