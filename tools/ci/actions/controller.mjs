// @doc Reconcile current GitHub events with durable requests, trusted execution and publication.
/** Trusted orchestration. Repository source is data here; only read-only executors run its code. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { classifyEvent } from './policy.mjs';
import { applyControls } from './controls.mjs';
import { requestFromIssue, requestFromPR } from './requests.mjs';
import { enqueue, claimWave, completeTask, reconcileOwner, retryTask, requestComplete, runnerPool, timeMs, withArchiveContext } from './state.mjs';
import { admit, producerBackpressure } from './scheduler.mjs';
import { planCoverage, bundleTasks, verifyCoverage, computePlanDigest } from './coverage.mjs';
import { buildDiagnosticRequest } from './diagnostics.mjs';
import { readArchivedRequest } from './store.mjs';

export const DEPLOY_BRANCH = 'claude/f1-game-project-26h3ng';
export const POLICY_VERSION = 'actions-v1';
export const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const SHA = /^[a-f0-9]{40}$/;
const safeId = value => digest(value).slice(0, 24);
export const RECEIPT_GRACE_MS = 120_000;
export const MAX_INFRASTRUCTURE_TASK_ATTEMPTS = 2;

export function requireResponse(request, endpoint, options = {}) {
  const response = request(endpoint, options);
  if (!response || !Number.isInteger(response.status) || response.error || response.status < 200 || response.status >= 300) {
    const error = new Error(`${options.method || 'GET'} ${endpoint}: ${response?.error || response?.json?.message || response?.status || 'missing HTTP status'}`);
    error.response = response;
    throw error;
  }
  return response.json;
}

export function listAll(request, endpoint, pick = value => value, { maxPages = 50 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = requireResponse(request, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const batch = pick(data);
    if (!Array.isArray(batch)) throw new Error(`Incomplete listing: ${endpoint}`);
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  throw new Error(`Incomplete paginated listing: ${endpoint}`);
}

/** Pull-request base.sha can lag behind its branch. Fence against the branch
 * object itself; a stale synthetic merge will then wait for regeneration. */
export function freshPR(request, number, { baseBranch = DEPLOY_BRANCH } = {}) {
  if (!Number.isSafeInteger(Number(number)) || Number(number) < 1) throw new Error('A positive PR number is required');
  const pr = requireResponse(request, `pulls/${number}`);
  const tip = requireResponse(request, `branches/${encodeURIComponent(baseBranch)}`)?.commit?.sha;
  if (Number(pr?.number) !== Number(number) || !pr.base || !SHA.test(pr?.head?.sha || '') || !SHA.test(tip || '') ||
    pr.base?.ref && pr.base.ref !== baseBranch) throw new Error('Fresh PR branch identity is unavailable');
  return { ...pr, reportedBaseSha: pr.base.sha, base: { ...pr.base, sha: tip } };
}

export function sourceCheckout(sha, { cwd = process.cwd(), directory = process.env.RUNNER_TEMP || path.join(cwd, 'artifacts/actions-source') } = {}) {
  if (!SHA.test(sha || '')) throw new Error('Source checkout requires a full commit SHA');
  const root = path.join(path.resolve(directory), `source-${sha}`);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd, stdio: 'pipe' }); }
    catch { execFileSync('git', ['fetch', '--no-tags', 'origin', sha], { cwd, stdio: 'pipe' }); }
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', root, sha], { cwd, stdio: 'pipe' });
  }
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (actual !== sha) throw new Error('Source worktree identity changed');
  const realRoot = fs.realpathSync(root);
  // Planning may read source data with write credentials in its parent process.
  // Tracked links may point within the source tree, never into control files.
  const tracked = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: realRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  for (const record of tracked.split('\0').filter(Boolean)) {
    if (!record.startsWith('120000 ')) continue;
    const filename = record.slice(record.indexOf('\t') + 1), link = path.join(realRoot, filename);
    const destination = path.resolve(path.dirname(link), fs.readlinkSync(link));
    let resolved;
    try { resolved = fs.realpathSync(destination); } catch { resolved = destination; }
    if (resolved !== realRoot && !resolved.startsWith(`${realRoot}${path.sep}`)) throw new Error('Source symlink escapes its checkout');
  }
  return realRoot;
}

/** Fetch only the affected object. Label provenance comes from authoritative event rows. */
export function eventContext(eventName, payload, state, { request, now = new Date().toISOString() }) {
  let event = classifyEvent(eventName, payload, { knownRequest: Object.values(state.requests).some(r => r.number === (payload.issue?.number || payload.number)) });
  if (!event.relevant || !event.number) return { eventName, event, payload, now };
  const issue = requireResponse(request, `issues/${event.number}`);
  const pr = issue.pull_request ? freshPR(request, event.number) : null;
  const events = listAll(request, `issues/${event.number}/events`);
  let provenance, normalizedAction = payload.action;
  if (event.kind === 'label') {
    const current = (issue.labels || []).some(label => (typeof label === 'string' ? label : label.name) === event.label);
    normalizedAction = current ? 'labeled' : 'unlabeled';
    const latest = events.filter(e => e.label?.name === event.label && ['labeled', 'unlabeled'].includes(e.event))
      .sort((a, b) => {
        const difference = Date.parse(b.created_at) - Date.parse(a.created_at);
        if (Number.isFinite(difference) && difference) return difference;
        const aId = BigInt(/^[1-9]\d*$/.test(String(a.id)) ? a.id : 0), bId = BigInt(/^[1-9]\d*$/.test(String(b.id)) ? b.id : 0);
        return aId === bId ? 0 : bId > aId ? 1 : -1;
      })[0];
    if (latest?.event === normalizedAction && Number.isFinite(Date.parse(latest.created_at || ''))) provenance = latest;
    event = { ...event, action: normalizedAction };
  }
  if (event.kind === 'command' && payload.comment?.id) provenance = requireResponse(request, `issues/comments/${payload.comment.id}`);
  if (event.kind === 'command' && (!provenance || String(provenance.id) !== String(payload.comment?.id) ||
    provenance.body !== payload.comment?.body || provenance.updated_at && Date.parse(provenance.updated_at) !== Date.parse(provenance.created_at))) {
    normalizedAction = 'edited';
    event = { relevant: false, kind: 'ignored', number: event.number, reason: 'command was edited or its authoritative identity changed' };
  }
  const enriched = { ...payload, action: normalizedAction, ...(pr ? { pull_request: { ...pr, labels: issue.labels } } : { issue }),
    ...(provenance && payload.comment ? { comment: provenance } : {}) };
  return { eventName, event, payload: enriched, issue, pr, events, provenance, now };
}

/** A complete source plan is immutable; scheduling only changes its execution order. */
export async function prepareRequest(context, state, { request, checkout = sourceCheckout, planner = planCoverage,
  readMergeCommit = sha => requireResponse(request, `git/commits/${sha}`),
  readBase = branch => requireResponse(request, `branches/${encodeURIComponent(branch)}`)?.commit?.sha,
  readArchive = null,
  now = context.now, policyVersion = POLICY_VERSION } = {}) {
  if (typeof policyVersion !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(policyVersion)) throw new Error('Invalid trusted policy version');
  const archiveLookups = new Map();
  const lookup = readArchive || (id => readArchivedRequest({ state, request, id, lookups: archiveLookups }));
  const finish = value => {
    if (value) Object.defineProperty(value, '__archiveLookups', { value: archiveLookups, enumerable: false });
    return value;
  };
  const { issue, events } = context;
  let { pr } = context;
  if (!issue || issue.state === 'closed') return null;
  const previous = Object.values(state.requests).filter(r => r.number === issue.number && !r.superseded)
    .sort((a, b) => Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt))[0];
  const intent = state.intents?.[issue.number] || {};
  const metadata = { previous, intent, events, now, owner: 'brycejmurrin' };
  if (!pr) {
    const parent = Object.values(state.requests).find(r => !r.superseded && !r.closed && r.members?.includes(issue.number));
    const blockers = listAll(request, `issues/${issue.number}/dependencies/blocked_by`).filter(i => i.state !== 'closed').map(i => `issue:${i.number}`);
    const item = requestFromIssue(issue, { ...metadata, blockers, batchParent: parent?.number });
    if (item && !state.requests[item.id]) await lookup(item.id);
    return finish(item);
  }
  const baseTip = await readBase(DEPLOY_BRANCH);
  if (!SHA.test(baseTip || '') || !pr.base || pr.base.ref && pr.base.ref !== DEPLOY_BRANCH) throw new Error('Current protected base identity is unavailable');
  pr = { ...pr, reportedBaseSha: pr.reportedBaseSha || pr.base.sha, base: { ...pr.base, sha: baseTip } };
  const result = requestFromPR({ ...pr, labels: issue.labels }, metadata);
  if (!result) return null;
  result.headSha = pr.head.sha;
  result.baseSha = pr.base.sha;
  result.reportedBaseSha = pr.reportedBaseSha;
  if (!SHA.test(pr.head.sha) || !SHA.test(pr.base.sha)) throw new Error('PR head/base identity is unavailable');
  // Validation runs the actual merge tree, not an isolated head that may fail integration.
  const testSha = pr.merge_commit_sha;
  result.id = `pr:${pr.number}:${pr.head.sha}:${pr.base.sha}:${policyVersion}:${pr.draft ? 'draft' : 'ready'}`;
  const unavailable = async reason => {
    result.id += ':blocked';
    result.sourceSha = pr.head.sha;
    result.treeSha = null; result.tasks = []; result.results = {}; result.plan = null;
    result.coverageDigest = null; result.planDigest = null; result.requiredCoverage = [];
    result.sourceObservedAt = new Date(timeMs(now)).toISOString(); result.superseded = false;
    result.blockers = [...new Set([...(result.blockers || []), reason])];
    if (!state.requests[result.id]) await lookup(result.id);
    return finish(result);
  };
  if (pr.mergeable === false || !SHA.test(testSha || '')) return unavailable('merge-tree-unavailable');
  const commit = await readMergeCommit(testSha);
  if (commit?.sha !== testSha || !SHA.test(commit?.tree?.sha || '') || commit.parents?.length !== 2 ||
    commit.parents[0].sha !== pr.base.sha || commit.parents[1].sha !== pr.head.sha) return unavailable('merge-tree-stale');
  let existing = state.requests[result.id] || (await lookup(result.id))?.request;
  if (existing?.plan && existing.treeSha !== commit.tree.sha) {
    // The same head/base can be regenerated by GitHub. A changed candidate tree
    // is a new immutable plan, while an identical tree can reuse its evidence.
    result.id += `:tree:${commit.tree.sha}`;
    existing = state.requests[result.id] || (await lookup(result.id))?.request;
  }
  if (existing?.plan) return finish({ ...existing, paused: result.paused, priority: result.priority, pauseOwner: result.pauseOwner,
    mergeRequested: result.mergeRequested, approvedSha: result.approvedSha, approvedDiffSha: result.approvedDiffSha,
    approvedBy: result.approvedBy, approvedViaApp: result.approvedViaApp, mergeRequestedAt: result.mergeRequestedAt,
    recoverRequested: result.recoverRequested, closed: false, superseded: false, sourceObservedAt: new Date(timeMs(now)).toISOString() });
  const root = checkout(testSha);
  const plan = await planner({ root, since: pr.base.sha, mode: pr.draft ? 'draft' : 'ready', requestId: result.id,
    sourceSha: testSha, baseSha: pr.base.sha });
  if (plan.sourceSha !== testSha || plan.baseSha !== pr.base.sha || plan.treeSha !== commit.tree.sha || plan.requestId !== result.id || plan.mode !== (pr.draft ? 'draft' : 'ready') || computePlanDigest(plan) !== plan.digest) throw new Error('Coverage planner returned a different integration identity');
  const admission = bundleTasks(plan);
  result.sourceSha = testSha; result.treeSha = plan.treeSha; result.plan = plan;
  result.coverageDigest = plan.digest; result.planDigest = plan.digest;
  result.requiredCoverage = plan.requiredCoverage;
  result.tasks = admission.bundles.map(task => ({ ...task, requestId: result.id, sourceSha: testSha,
    baseSha: result.baseSha, treeSha: result.treeSha }));
  result.deferredCoverage = admission.deferredCoverage;
  result.deferredBundles = admission.deferredBundles;
  result.results = {};
  result.sourceObservedAt = new Date(timeMs(now)).toISOString();
  return finish(result);
}

/** Apply an already fetched event without I/O; safe to replay on a CAS conflict. */
export function ingest(state, context, prepared = null) {
  let next = structuredClone(state);
  if (prepared) {
    if (next.requests[prepared.id]) {
      // Controls can change; evidence and original admission age cannot.
      for (const key of ['paused', 'pauseOwner', 'priority', 'mergeRequested', 'mergeRequestedAt', 'approvedSha', 'approvedDiffSha', 'approvedBy', 'approvedViaApp', 'intakeWithdrawn', 'recoverRequested', 'blockers', 'members']) {
        if (Object.hasOwn(prepared, key)) next.requests[prepared.id][key] = prepared[key];
      }
      const newer = Object.values(next.requests).some(r => r.kind === 'pr' && r.number === prepared.number && !r.superseded &&
        timeMs(r.sourceObservedAt || r.acceptedAt) > timeMs(prepared.sourceObservedAt || context.now));
      if (prepared.kind === 'pr' && prepared.superseded === false && prepared.sourceObservedAt && !newer) {
        for (const other of Object.values(next.requests)) if (other.kind === 'pr' && other.number === prepared.number) other.superseded = other.id !== prepared.id;
        next.requests[prepared.id].sourceObservedAt = prepared.sourceObservedAt;
      }
    } else {
      if (prepared.__archiveLookups) withArchiveContext(prepared.__archiveLookups, () => enqueue(next, prepared));
      else enqueue(next, prepared);
    }
  }
  // The current command wins over metadata prepared from the previous snapshot.
  const incomingCommentId = context.provenance?.id || context.payload.comment?.id;
  const alreadyAccepted = incomingCommentId && next.acceptedCommands?.[String(incomingCommentId)];
  next = applyControls(next, context.eventName, context.payload, { now: context.now, provenance: context.provenance,
    commandAllowed: ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(context.provenance?.author_association), diffSha: context.diffSha });
  // A deduped command is deliberately a reducer no-op. Reconstruct its owned
  // fields from durable intent so stale prepared metadata cannot undo it during
  // a CAS replay, rebind an approval, or rearm a consumed recovery request.
  for (const record of Object.values(next.requests)) {
    const intent = next.intents?.[record.number];
    if (!intent) continue;
    if (Object.hasOwn(intent, 'mergeRequested')) {
      record.mergeRequested = intent.mergeRequested === true;
      record.mergeRequestedAt = intent.mergeRequestedAt || null;
    }
    if (Object.hasOwn(intent, 'approvedSha')) {
      const matches = intent.approvedSha === (record.headSha || record.sourceSha);
      for (const key of ['approvedSha', 'approvedDiffSha', 'approvedBy', 'approvedViaApp']) record[key] = matches ? intent[key] ?? null : null;
    }
    if (Object.hasOwn(intent, 'recoverRequested')) record.recoverRequested = intent.recoverRequested === true;
    if (intent.commandProvenance?.batch) record.members = [...intent.members];
    if (intent.commandProvenance?.decision) record.decision = structuredClone(intent.decision);
  }
  const command = classifyEvent(context.eventName, context.payload);
  if (command.kind === 'command' && command.command.type === 'recover' && !alreadyAccepted &&
    next.acceptedCommands?.[String(incomingCommentId)]?.type === 'recover' &&
    next.intents?.[command.number]?.commandProvenance?.recover?.commentId === String(incomingCommentId) &&
    next.intents?.[command.number]?.recoverRequested &&
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(context.provenance?.author_association || context.payload.comment?.author_association)) {
    const commentId = context.provenance?.id || context.payload.comment?.id;
    if (commentId) {
      const token = `comment:${commentId}`, intent = next.intents[command.number];
      intent.recoveryToken = token;
      if (intent.recoveryConsumedToken === token) intent.recoverRequested = false;
      for (const record of Object.values(next.requests)) if (record.number === command.number && !record.superseded && record.recoverRequested) {
        if (record.recoveryConsumedToken === token) { record.recoverRequested = false; continue; }
        record.recoveryToken = token; record.recoverySourceSha = record.sourceSha;
        record.recoveryPlanDigest = record.coverageDigest || record.planDigest || null;
      }
    }
  }
  if (context.issue?.state === 'closed' || context.pr?.merged) {
    const number = context.issue?.number || context.pr?.number;
    for (const r of Object.values(next.requests)) if (r.number === number) { r.superseded = true; r.closed = true; }
  }
  for (const member of Object.values(next.requests)) if (member.kind === 'issue') member.blockers = member.blockers.filter(blocker => !String(blocker).startsWith('batch:'));
  for (const parent of Object.values(next.requests).filter(r => !r.superseded && !r.closed)) for (const number of parent.members || []) {
    for (const member of Object.values(next.requests)) if (member.kind === 'issue' && member.number === number) {
      member.blockers = [...new Set([...(member.blockers || []), `batch:${parent.number}`])];
    }
  }
  return next;
}

export function claimMatrix(state, waveId, owner) {
  const result = claimWave(state, waveId, owner);
  if (!result.claimed) return { claimed: false, reason: result.reason, matrix: { include: [] }, readonlyMatrix: { include: [] }, publisherMatrix: { include: [] } };
  const include = result.wave.tasks.map(entry => {
    const request = state.requests[entry.requestId], task = request.tasks.find(t => t.id === entry.taskId);
    const id = safeId({ waveId, requestId: request.id, taskId: task.id });
    return { id, source_sha: request.sourceSha, runner: task.runner,
      task_json: JSON.stringify({ waveId, requestId: request.id, taskId: task.id, id, sourceSha: request.sourceSha,
        baseSha: request.baseSha, treeSha: request.treeSha, planDigest: request.coverageDigest || request.planDigest,
        runId: String(owner.runId), runAttempt: Number(owner.runAttempt), task }) };
  });
  return { claimed: true, matrix: { include },
    readonlyMatrix: { include: include.filter(row => !JSON.parse(row.task_json).task.publisher) },
    publisherMatrix: { include: include.filter(row => JSON.parse(row.task_json).task.publisher) } };
}

/** Never read code or trust a caller's task body in a privileged phase. */
export function canonicalExecution(state, envelope, identity) {
  const wave = state.waves[envelope.waveId], request = state.requests[envelope.requestId];
  const entry = wave?.tasks.find(e => e.requestId === envelope.requestId && e.taskId === envelope.taskId);
  const task = request?.tasks.find(t => t.id === envelope.taskId);
  if (!wave || !task || !entry || wave.status !== 'running' || task.status !== 'running' || entry.status !== 'running'
    || String(wave.owner?.runId) !== String(identity.runId) || wave.owner?.runAttempt !== Number(identity.runAttempt)
    || envelope.runId !== String(identity.runId) || envelope.runAttempt !== Number(identity.runAttempt)) throw new Error('Execution owner is not current');
  if (state.mode !== 'active' || state.controls.validation || request.paused || request.superseded || request.closed
    || request.blockers.length || Object.values(request.results).some(r => r.status !== 'success')) throw new Error('Request is no longer executable');
  if (digest(envelope.task) !== digest(task) || envelope.sourceSha !== request.sourceSha
    || envelope.baseSha !== request.baseSha || envelope.treeSha !== request.treeSha
    || envelope.planDigest !== (request.coverageDigest || request.planDigest)) throw new Error('Execution task identity mismatch');
  return { task, request, wave };
}

export function diagnosticRequest(workflow, event, context) {
  const metadata = buildDiagnosticRequest(workflow, event, context);
  return { id: metadata.request_id, kind: metadata.publisher ? 'maintenance' : 'experiment', sourceSha: metadata.source_sha,
    baseSha: null, treeSha: null, acceptedAt: new Date().toISOString(), priority: false, paused: false, blockers: [], members: [],
    tasks: [], results: {}, diagnostic: metadata };
}

export function receiptIdentity(envelope) {
  return { waveId: envelope.waveId, requestId: envelope.requestId, taskId: envelope.taskId,
    runId: envelope.runId, runAttempt: envelope.runAttempt };
}

/** Reconciliation receives validated terminal job observations and receipts from the transport. */
export function reconcileResults(state, observations, { receiptGraceMs = RECEIPT_GRACE_MS } = {}) {
  if (!Number.isFinite(receiptGraceMs) || receiptGraceMs < 0) throw new Error('Invalid receipt grace period');
  const outcomes = [];
  for (const observation of observations) {
    const wave = state.waves[observation.waveId];
    if (!wave || observation.error || String(wave.owner?.runId) !== String(observation.runId) || wave.owner?.runAttempt !== observation.runAttempt) continue;
    wave.receiptWaits ||= {};
    const now = timeMs(observation.now ?? Date.now());
    const ready = [], waiting = new Set();
    for (const job of observation.jobs || []) {
      if (job.status !== 'completed' || job.runAttempt !== observation.runAttempt) continue;
      const key = `${job.requestId}:${job.taskId}`;
      if (job.receipt && !(job.receipt.status === 'success' && job.conclusion !== 'success')) {
        const result = completeTask(state, { waveId: wave.id, runId: observation.runId, runAttempt: observation.runAttempt,
          requestId: job.requestId, taskId: job.taskId, jobId: job.jobId }, job.receipt);
        outcomes.push(result);
        if (result.accepted) { delete wave.receiptWaits[key]; ready.push(job); continue; }
      }
      if (job.receiptReadError) { waiting.add(key); continue; }
      if (!job.receipt && !job.invalidReceipt) {
        let completed = now;
        if (job.completedAt && Number.isFinite(Date.parse(job.completedAt))) completed = Math.min(now, Date.parse(job.completedAt));
        wave.receiptWaits[key] ??= new Date(completed).toISOString();
        if (now - timeMs(wave.receiptWaits[key]) < receiptGraceMs) { waiting.add(key); continue; }
      }
      ready.push(job);
    }
    const unmapped = wave.tasks.filter(entry => ['reserved', 'running'].includes(entry.status) &&
      !(observation.jobs || []).some(job => job.requestId === entry.requestId && job.taskId === entry.taskId));
    if (observation.status === 'completed' && unmapped.length) {
      wave.terminalObservedAt ??= new Date(now).toISOString();
      if (now - timeMs(wave.terminalObservedAt) < receiptGraceMs) waiting.add('unmapped-executors');
    }
    // A known artifact that is temporarily unreadable must remain recoverable.
    // A conclusively absent artifact becomes incomplete after bounded grace.
    reconcileOwner(state, wave.id, { ...observation,
      status: waiting.size ? 'in_progress' : observation.status, jobs: ready });
  }
  return outcomes;
}

function infrastructureCandidates(state, record) {
  return record.tasks.filter(task => {
    const result = record.results[task.id], wave = state.waves[task.waveId];
    return task.status === 'incomplete' && result?.status === 'incomplete' && result.complete === false &&
      result.reason === 'terminal-owner-without-valid-receipt' && Number.isInteger(task.attempt) &&
      task.attempt >= 1 && task.attempt < MAX_INFRASTRUCTURE_TASK_ATTEMPTS && wave?.owner &&
      result.waveId === wave.id && String(result.runId) === String(wave.owner.runId) && result.runAttempt === wave.owner.runAttempt;
  });
}
function recoveryIdentity(record) {
  return { requestId: record.id, sourceSha: record.sourceSha, baseSha: record.baseSha, treeSha: record.treeSha,
    planDigest: record.coverageDigest || record.planDigest || null, recoveryToken: record.recoveryToken || null };
}
function recoveryScopeMatches(record) {
  return (!record.recoverySourceSha || record.recoverySourceSha === record.sourceSha) &&
    (!record.recoveryPlanDigest || record.recoveryPlanDigest === (record.coverageDigest || record.planDigest));
}
/** Only external reads occur here. The observation is replayable through a CAS
 * conflict; it cannot reset a newer task attempt or a different source plan. */
export function collectInfrastructureRetries(state, { request, now = new Date().toISOString(), maxRequests = 8, maxOwnerReads = 8 } = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isInteger(maxOwnerReads) || maxOwnerReads < 1) throw new Error('Invalid infrastructure recovery bounds');
  const observations = [], owners = new Map();
  const records = Object.values(state.requests).filter(record => record.kind !== 'issue' && record.recoverRequested && !record.superseded && !record.closed)
    .sort((a, b) => timeMs(a.recoveryObservedAt || 0) - timeMs(b.recoveryObservedAt || 0) || a.id.localeCompare(b.id)).slice(0, maxRequests);
  for (const record of records) {
    const observation = { ...recoveryIdentity(record), now, tasks: [] };
    if (!recoveryScopeMatches(record)) { observation.refused = 'recovery-source-changed'; observations.push(observation); continue; }
    const candidates = infrastructureCandidates(state, record);
    if (!candidates.length) { observation.refused = 'no-eligible-infrastructure-attempt'; observations.push(observation); continue; }
    for (const task of candidates) {
      const wave = state.waves[task.waveId], key = `${wave.owner.runId}:${wave.owner.runAttempt}`;
      if (!owners.has(key)) {
        if (owners.size >= maxOwnerReads) owners.set(key, { status: 'unknown', error: 'recovery-owner-read-budget' });
        else {
          try {
            const run = requireResponse(request, `actions/runs/${wave.owner.runId}/attempts/${wave.owner.runAttempt}`);
            if (String(run.id) !== String(wave.owner.runId) || Number(run.run_attempt) !== wave.owner.runAttempt) throw new Error('Recovery owner attempt identity mismatch');
            owners.set(key, { status: run.status, runId: String(run.id), runAttempt: Number(run.run_attempt) });
          } catch (error) { owners.set(key, { status: 'unknown', error: String(error.message || error) }); }
        }
      }
      observation.tasks.push({ taskId: task.id, waveId: wave.id, attempt: task.attempt,
        resultDigest: digest(record.results[task.id]), ...wave.owner, ...owners.get(key) });
    }
    observations.push(observation);
  }
  return observations;
}

/** Consume one explicit recovery intent; do not turn an assertion failure or
 * an unobserved owner into an automatic retry. Successful siblings are retained. */
export function applyInfrastructureRetries(state, observations) {
  const outcomes = [];
  for (const observation of observations) {
    const record = state.requests[observation.requestId];
    if (!record || record.kind === 'issue' || !record.recoverRequested || record.superseded || record.closed ||
      digest(recoveryIdentity(record)) !== digest({ requestId: observation.requestId, sourceSha: observation.sourceSha,
        baseSha: observation.baseSha, treeSha: observation.treeSha, planDigest: observation.planDigest, recoveryToken: observation.recoveryToken })) continue;
    record.recoveryObservedAt = new Date(timeMs(observation.now)).toISOString();
    const results = []; let deferred = false;
    if (!observation.refused && recoveryScopeMatches(record)) for (const proof of observation.tasks || []) {
      const task = infrastructureCandidates(state, record).find(candidate => candidate.id === proof.taskId);
      if (!task || task.waveId !== proof.waveId || task.attempt !== proof.attempt || digest(record.results[task.id]) !== proof.resultDigest) continue;
      if (proof.error || proof.status !== 'completed') { deferred = true; results.push({ taskId: task.id, retried: false, reason: 'owner-not-terminal' }); continue; }
      results.push(retryTask(state, record.id, task.id, { ...proof, authorized: true, infrastructure: true,
        reason: 'Explicit recovery of terminal owner without a valid receipt', now: observation.now }));
    }
    if (!deferred) {
      record.recoverRequested = false; record.recoveryConsumedToken = observation.recoveryToken;
      const intent = record.number && state.intents?.[record.number];
      if (intent && (intent.recoveryToken || null) === observation.recoveryToken) {
        intent.recoverRequested = false; intent.recoveryConsumedToken = observation.recoveryToken;
      }
    }
    record.recoveryResult = { at: record.recoveryObservedAt, deferred, reason: observation.refused || null, tasks: results };
    outcomes.push({ requestId: record.id, consumed: !deferred, deferred, reason: observation.refused || null, tasks: results });
  }
  return outcomes;
}

export function validationVerdict(state, request, { currentPR } = {}) {
  if (request.paused || state.mode !== 'active' || state.controls.validation || request.superseded || request.closed) return { state: 'pending', description: 'Validation paused or superseded' };
  if (request.blockers.length) return { state: 'pending', description: request.blockers.join(', ').slice(0, 140) };
  if (currentPR && (currentPR.state !== 'open' || currentPR.merged || currentPR.draft !== request.draft ||
    currentPR.head?.sha !== request.headSha || currentPR.base?.sha !== request.baseSha)) return { state: 'pending', description: 'Current PR integration identity changed' };
  if (Object.values(request.results).some(r => r.status !== 'success')) return { state: 'failure', description: 'Required validation failed or is incomplete' };
  if (request.draft && request.tasks.every(t => t.status === 'success')) return { state: 'pending', description: 'Draft feedback is partial; ready validation is required' };
  if (!requestComplete(state, request.id)) return { state: 'pending', description: 'Waiting for complete affected-test coverage' };
  if (!request.plan || request.plan.sourceSha !== request.sourceSha || request.plan.baseSha !== request.baseSha ||
    request.plan.treeSha !== request.treeSha || request.plan.digest !== (request.coverageDigest || request.planDigest)) return { state: 'failure', description: 'Coverage plan identity is inconsistent' };
  const verdict = verifyCoverage(request.plan, Object.values(request.results));
  if (!verdict.ok || request.draft) return { state: request.draft ? 'pending' : 'failure', description: request.draft ? 'Draft feedback is partial; ready validation is required' : 'Coverage receipt is incomplete' };
  return { state: 'success', description: 'Complete affected-test coverage passed for this integration tree' };
}

export function prepareAdmission(state, now, { dispatchBackoffMs = 120_000 } = {}) {
  if (!Number.isFinite(dispatchBackoffMs) || dispatchBackoffMs < 0) throw new Error('Invalid dispatch backoff');
  const producer = producerBackpressure(state, { now });
  if (state.mode !== 'active' || state.controls.validation) return { producer, waves: [] };
  let wave = Object.values(state.waves).filter(w => w.status === 'reserved' && !w.owner &&
    (!w.dispatchRequestedAt || timeMs(now) - timeMs(w.dispatchRequestedAt) >= dispatchBackoffMs))
    .sort((a, b) => timeMs(a.reservedAt) - timeMs(b.reservedAt) || a.id.localeCompare(b.id))[0];
  wave ||= admit(state, { now, waveSize: 8, maxWaves: 1 })[0];
  if (wave) {
    wave.dispatchRequestedAt = new Date(timeMs(now)).toISOString();
    wave.dispatchAttempts = (wave.dispatchAttempts || 0) + 1;
  }
  return { producer, waves: wave ? [wave] : [] };
}

/** A receipt file is data, never an executable artifact. */
export function readReceipt(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('Unsafe receipt file');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

export function collectObservations(state, { request, download, now = new Date().toISOString() }) {
  const observations = [];
  for (const wave of Object.values(state.waves).filter(w => w.owner && w.status === 'running')) {
    try {
      // Query the claimed attempt itself. A later native rerun does not obscure
      // the original owner's terminal status or acquire its permits.
      const attemptPath = `actions/runs/${wave.owner.runId}/attempts/${wave.owner.runAttempt}`;
      const run = requireResponse(request, attemptPath);
      if (Number(run.run_attempt) !== wave.owner.runAttempt || run.id !== undefined && String(run.id) !== String(wave.owner.runId)) throw new Error('Owner attempt response identity mismatch');
      const jobs = listAll(request, `${attemptPath}/jobs`, j => j.jobs);
      const entries = wave.tasks.filter(e => ['reserved', 'running'].includes(e.status));
      const matched = entries.map(entry => {
        const id = safeId({ waveId: wave.id, requestId: entry.requestId, taskId: entry.taskId });
        const candidates = jobs.filter(j => j.name === `Task ${id}` || j.name === `Trusted publisher ${id}` || j.name === `Admitted release ${id}`);
        if (candidates.length > 1) throw new Error('Ambiguous executor job identity');
        const job = candidates[0];
        if (!job) return null;
        if (job.run_attempt !== undefined && Number(job.run_attempt) !== wave.owner.runAttempt) throw new Error('Executor job attempt mismatch');
        return { entry, id, job };
      }).filter(Boolean);
      const artifacts = matched.some(({ job }) => job.status === 'completed')
        ? listAll(request, `actions/runs/${wave.owner.runId}/artifacts`, j => j.artifacts) : [];
      const mapped = matched.map(({ entry, id, job }) => {
        const result = { requestId: entry.requestId, taskId: entry.taskId, jobId: job.id, status: job.status,
          conclusion: job.conclusion, runAttempt: wave.owner.runAttempt, completedAt: job.completed_at };
        if (job.status !== 'completed') return result;
        const name = `actions-receipt-${id}-${wave.owner.runAttempt}`;
        const candidates = artifacts.filter(artifact => artifact.name === name && !artifact.expired);
        if (candidates.length > 1) { result.invalidReceipt = true; return result; }
        if (!candidates.length) return result;
        try {
          result.receipt = download(wave.owner.runId, name, id);
          if (!result.receipt || typeof result.receipt !== 'object' || Array.isArray(result.receipt)) result.invalidReceipt = true;
        } catch (error) {
          if (error instanceof SyntaxError || error.invalidReceipt) result.invalidReceipt = true;
          else result.receiptReadError = String(error.message || error);
        }
        return result;
      });
      observations.push({ waveId: wave.id, ...wave.owner, status: run.status === 'completed' ? 'completed' : 'in_progress', jobs: mapped, now });
    } catch (error) {
      observations.push({ waveId: wave.id, ...wave.owner, status: 'unknown', error: String(error.message || error), jobs: [], now });
    }
  }
  return observations;
}

export function downloadReceipt(runId, artifact, id, directory = path.resolve('artifacts/actions-receipts'), { run = execFileSync } = {}) {
  if (!/^\d+$/.test(String(runId)) || !/^[a-f0-9]{24}$/.test(id) || !new RegExp(`^actions-receipt-${id}-[1-9]\\d*$`).test(artifact)) throw new Error('Unsafe artifact identity');
  const base = path.resolve(directory, String(runId));
  fs.mkdirSync(base, { recursive: true });
  const root = fs.realpathSync(directory), realBase = fs.realpathSync(base);
  if (!realBase.startsWith(`${root}${path.sep}`)) throw new Error('Artifact directory escapes receipt root');
  // A fresh extraction prevents old files or malicious symlinks from being
  // reused after a failed download or across repeated reconciliation attempts.
  const dir = fs.mkdtempSync(path.join(realBase, `${artifact}-`));
  const realDir = fs.realpathSync(dir);
  if (!realDir.startsWith(`${root}${path.sep}`)) throw new Error('Artifact directory escapes receipt root');
  try {
    run('gh', ['run', 'download', String(runId), '--repo', 'brycejmurrin/f1-game', '--name', artifact, '--dir', dir], { stdio: 'pipe' });
    try {
      const filename = path.join(dir, `${id}.json`);
      if (fs.realpathSync(filename) !== path.join(realDir, `${id}.json`)) throw new Error('Unsafe receipt path');
      return readReceipt(filename);
    } catch (error) { error.invalidReceipt = true; throw error; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function writeOutputs(values, file = process.env.GITHUB_OUTPUT) {
  if (!file) return;
  for (const [key, value] of Object.entries(values)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || /[\r\n]/.test(text)) throw new Error('Outputs must be single-line JSON');
    fs.appendFileSync(file, `${key}=${text}\n`);
  }
}
