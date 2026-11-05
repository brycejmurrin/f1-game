// @doc Maintain immutable requests, runner reservations, ownership, results and verified archive restoration.
/** Durable Actions ledger. Mutators are synchronous: persist their result with a
 * compare-and-swap before performing any dispatch or other external side effect. */
import crypto from "node:crypto";
export const SCHEMA_VERSION = 1;
export const DEFAULT_LIMITS = Object.freeze({ linux: 24, macos: 2, windows: 2, perPrLinux: 4 });
const KINDS = new Set(["pr", "release", "experiment", "maintenance"]);
const UNSUPPORTED_REQUEST_FIELDS = ["owner", "workerLaunch", "members", "batch", "batchParent", "intakeWithdrawn", "agentHost", "codingHost", "workerHost"];
export const ACTIVE_TASK_STATUSES = new Set(["reserved", "running"]);
export const clone = (value) => structuredClone(value);
export const archiveKey = id => crypto.createHash("sha256").update(id).digest("hex").slice(0, 2);
let archiveContext = null;
export class ArchiveLookupRequired extends Error {
  constructor(descriptor, kind) { super("Verified archive lookup required before enqueue"); this.descriptor = descriptor; this.kind = kind; }
}
export function withArchiveContext(context, run) {
  const previous = archiveContext;
  archiveContext = previous ? { get: key => context.get(key) || previous.get(key) } : context;
  try { return run(); } finally { archiveContext = previous; }
}
function archivedRecord(state, id) {
  const shard = state.archives?.shards?.[archiveKey(id)];
  if (!shard) return null;
  const index = archiveContext?.get(shard.digest);
  if (!index) throw new ArchiveLookupRequired(shard, "index");
  const entry = Object.hasOwn(index.records, id) ? index.records[id] : null;
  if (!entry) return null;
  const page = archiveContext?.get(entry.digest);
  if (!page) throw new ArchiveLookupRequired(entry, "page");
  if (!page.records[id] || page.records[id].request?.id !== id) throw new Error("Archive index points to a missing request");
  return { ...page.records[id], descriptor: entry };
}
function restoreRecord(state, record) {
  const request = clone(record.request);
  if (request.tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status))) throw new Error("Archive contains active work");
  for (const [id, proof] of Object.entries(record.waves || {})) {
    if (state.waves[id]) continue;
    const tasks = proof.tasks.filter(task => task.requestId === request.id);
    if (tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status))) throw new Error("Archive contains active wave entries");
    state.waves[id] = { ...clone(proof), archivedStatus: proof.status, status: "completed", tasks };
    state.scheduling.sequence = Math.max(state.scheduling.sequence, Number(id.slice(5)));
  }
  request.restoredFrom = clone(record.descriptor);
  state.requests[request.id] = request;
  return request;
}
export const timeMs = (value = Date.now()) => {
  const n = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid timestamp: ${value}`);
  return n;
};
export const isoTime = (value) => new Date(timeMs(value)).toISOString();
export function runnerPool(runner) {
  if (/^ubuntu(?:-|$)/i.test(runner)) return "linux";
  if (/^macos(?:-|$)/i.test(runner)) return "macos";
  if (/^windows(?:-|$)/i.test(runner)) return "windows";
  throw new Error(`Unsupported runner: ${runner}`);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }

export function newState({ mode = "shadow", limits = {}, controls = {}, now = Date.now() } = {}) {
  const state = {
    schemaVersion: SCHEMA_VERSION, mode, createdAt: isoTime(now),
    // A true control is a pause. Shadow mode independently prevents admission.
    controls: { validation: false, merges: false, ...controls },
    limits: { ...DEFAULT_LIMITS, ...limits }, requests: {}, waves: {},
    scheduling: { sequence: 0, priorityTurn: 0, priorityTurns: { release: 0, shared: 0 }, lastRequestByTier: {}, releaseTurn: 0 },
  };
  validateState(state);
  return state;
}

export function validateState(state) {
  if (!object(state) || state.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported Actions state schema");
  if (!["shadow", "paused", "active"].includes(state.mode)) throw new Error("Invalid Actions mode");
  if (!object(state.requests) || !object(state.waves) || !object(state.controls) || !object(state.limits)) throw new Error("Malformed Actions state");
  for (const name of ["validation", "merges"]) if (typeof state.controls[name] !== "boolean") throw new Error(`Invalid control: ${name}`);
  if (Object.hasOwn(state, "producer") || Object.hasOwn(state.controls, "workers") || Object.hasOwn(state.limits, "maxWorkers")) throw new Error("Unsupported implementation admission state");
  for (const [name, max] of Object.entries(DEFAULT_LIMITS)) {
    if (!Number.isInteger(state.limits[name]) || state.limits[name] < 0 || state.limits[name] > max) throw new Error(`Invalid capacity: ${name}`);
  }
  if (state.archives) {
    if (state.archives.version !== 1 || !Number.isSafeInteger(state.archives.epoch) || state.archives.epoch < 0 || !object(state.archives.shards) || Object.keys(state.archives.shards).length > 256) throw new Error("Malformed archive manifest");
    for (const [key, shard] of Object.entries(state.archives.shards)) if (!/^[a-f0-9]{2}$/.test(key) || !/^[a-f0-9]{64}$/.test(shard.digest || "") || shard.path !== `archives/index/${shard.digest}.json`) throw new Error("Malformed archive shard");
  }
  if (!object(state.scheduling) || !Number.isInteger(state.scheduling.sequence) || state.scheduling.sequence < 0 ||
    !Number.isInteger(state.scheduling.priorityTurn) || !Number.isInteger(state.scheduling.releaseTurn) ||
    !object(state.scheduling.priorityTurns) || !["release", "shared"].every((key) => Number.isInteger(state.scheduling.priorityTurns[key])) ||
    !object(state.scheduling.lastRequestByTier)) throw new Error("Malformed scheduling state");
  for (const [id, request] of Object.entries(state.requests)) {
    if (request.id !== id || !KINDS.has(request.kind) || !Array.isArray(request.tasks) || !object(request.results) ||
      !Array.isArray(request.blockers) || typeof request.paused !== "boolean" ||
      typeof request.superseded !== "boolean") throw new Error(`Malformed request: ${id}`);
    if (UNSUPPORTED_REQUEST_FIELDS.some(field => Object.hasOwn(request, field))) throw new Error(`Unsupported implementation request fields: ${id}`);
    timeMs(request.acceptedAt);
    const ids = new Set();
    for (const task of request.tasks) {
      if (!task.id || ids.has(task.id)) throw new Error(`Duplicate task in ${id}`);
      ids.add(task.id); runnerPool(task.runner);
      if (!["queued", "reserved", "running", "success", "failure", "cancelled", "incomplete"].includes(task.status)) throw new Error(`Invalid task status: ${task.id}`);
      if (!Array.isArray(task.prerequisites)) throw new Error(`Invalid task prerequisites: ${task.id}`);
      if (ACTIVE_TASK_STATUSES.has(task.status)) {
        const wave = state.waves[task.waveId];
        if (!wave || !wave.tasks.some((entry) => entry.requestId === id && entry.taskId === task.id && entry.status === task.status)) throw new Error(`Orphan task reservation: ${task.id}`);
      }
      if (task.status === "success" && (request.results[task.id]?.status !== "success" || request.results[task.id]?.complete !== true)) throw new Error(`Success missing evidence: ${task.id}`);
    }
  }
  for (const [id, wave] of Object.entries(state.waves)) {
    if (id !== wave.id || !Array.isArray(wave.tasks) || !["reserved", "running", "completed"].includes(wave.status) ||
      !/^wave-\d+$/.test(id) || Number(id.slice(5)) > state.scheduling.sequence) throw new Error(`Malformed wave: ${id}`);
    if (wave.owner && (!wave.owner.runId || !Number.isInteger(wave.owner.runAttempt) || wave.owner.runAttempt < 1)) throw new Error(`Malformed wave owner: ${id}`);
    if (wave.status === "running" && !wave.owner) throw new Error(`Missing wave owner: ${id}`);
    for (const entry of wave.tasks) {
      if (!ACTIVE_TASK_STATUSES.has(entry.status)) continue;
      const task = state.requests[entry.requestId]?.tasks.find((t) => t.id === entry.taskId);
      if (!task || task.waveId !== id || task.status !== entry.status || wave.status === "completed") throw new Error(`Orphan wave reservation: ${id}`);
    }
  }
  return state;
}

function immutableTask(task) {
  const { status, waveId, attempt, reservedAt, startedAt, completedAt, owner, ...definition } = task;
  return definition;
}
function definition(request) {
  return { kind: request.kind, number: request.number ?? null, headSha: request.headSha ?? null, sourceSha: request.sourceSha ?? null,
    baseSha: request.baseSha ?? null, treeSha: request.treeSha ?? null,
    coverageDigest: request.coverageDigest ?? request.planDigest ?? null, requiredCoverage: request.requiredCoverage || [],
    draft: Boolean(request.draft), tasks: request.tasks.map(immutableTask) };
}
function compareReleaseOrder(a, b) {
  if (Number.isFinite(a.releaseOrder) && Number.isFinite(b.releaseOrder) && a.releaseOrder !== b.releaseOrder) return a.releaseOrder - b.releaseOrder;
  return timeMs(a.acceptedAt) - timeMs(b.acceptedAt);
}
export function releaseStarted(state, request) {
  return Boolean(request.startedAt || Object.keys(request.results).length || request.tasks.some(task =>
    task.status === "running" || task.waveId && state.waves[task.waveId]?.owner));
}
/** A release keeps its lane between validation waves, including the quiet gap
 * after guards finish. A failing release keeps it until every live job ends. */
export function releaseLaneOwner(state) {
  const releases = Object.values(state.requests).filter(request => request.kind === "release" && !request.superseded);
  const started = releases.filter(request => releaseStarted(state, request) &&
    (request.tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status)) ||
      !Object.values(request.results).some(result => result.status !== "success") && !requestComplete(state, request.id)));
  if (started.length) return started.sort((a, b) => timeMs(a.startedAt || a.acceptedAt) - timeMs(b.startedAt || b.acceptedAt) || a.id.localeCompare(b.id))[0].id;
  const reserved = releases.filter(request => request.tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status)));
  return reserved.sort((a, b) => compareReleaseOrder(b, a) || b.id.localeCompare(a.id))[0]?.id || null;
}
function supersedePendingRelease(state, request) {
  request.superseded = true;
  for (const task of request.tasks) {
    if (!ACTIVE_TASK_STATUSES.has(task.status)) continue;
    const wave = state.waves[task.waveId];
    // This transition races atomically with the trusted claim CAS. If the
    // claim already won, preserve its owner and permit until terminal proof.
    if (!wave || wave.owner) continue;
    const entry = wave.tasks.find(member => member.requestId === request.id && member.taskId === task.id);
    if (entry) { entry.status = "cancelled"; entry.reason = "superseded-release"; }
    task.status = "queued"; delete task.waveId; delete task.owner;
    if (wave.tasks.every(member => !ACTIVE_TASK_STATUSES.has(member.status))) wave.status = "completed";
  }
}
/** Same ID means the same immutable plan. Label churn can update scheduling
 * metadata, but cannot reset queue age, tasks, receipts, or ownership. */
export function enqueue(state, input) {
  if (!object(input) || typeof input.id !== "string" || !input.id || !KINDS.has(input.kind)) throw new Error("Request needs an immutable id and supported kind");
  if (UNSUPPORTED_REQUEST_FIELDS.some(field => Object.hasOwn(input, field))) throw new Error("Unsupported implementation request fields");
  let restored = false;
  if (!Object.hasOwn(state.requests, input.id)) {
    const record = archivedRecord(state, input.id);
    if (record) { restoreRecord(state, record); restored = true; }
  }
  const tasks = (input.tasks || []).map((task) => {
    if (!task.id || typeof task.id !== "string") throw new Error("Task needs an id");
    runnerPool(task.runner);
    if (task.prerequisites !== undefined && !Array.isArray(task.prerequisites)) throw new Error("Invalid task prerequisites");
    for (const field of ["expectedSeconds", "setupSeconds"]) if (task[field] !== undefined && (!Number.isFinite(task[field]) || task[field] < 0)) throw new Error(`Invalid ${field}`);
    for (const field of ["sourceSha", "baseSha", "treeSha", "requestId"]) {
      const expected = field === "requestId" ? input.id : input[field] ?? null;
      if (task[field] !== undefined && task[field] !== expected) throw new Error(`Task ${field} disagrees with request`);
    }
    if (task.planDigest && (input.coverageDigest ?? input.planDigest) && task.planDigest !== (input.coverageDigest ?? input.planDigest)) throw new Error("Task digest disagrees with request");
    return { ...clone(task), prerequisites: [...(task.prerequisites || [])], status: "queued" };
  });
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) throw new Error("Duplicate task id");
  for (const task of tasks) for (const id of task.prerequisites) if (!ids.has(id)) throw new Error(`Unknown prerequisite: ${id}`);
  // Reject cycles: a permanently blocked plan must never be presented as queued.
  const visiting = new Set(), visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error("Cyclic task prerequisites");
    if (visited.has(id)) return;
    visiting.add(id); tasks.find((t) => t.id === id).prerequisites.forEach(visit); visiting.delete(id); visited.add(id);
  };
  ids.forEach(visit);
  const existing = state.requests[input.id];
  if (existing) {
    if (!same(definition(existing), definition({ ...input, tasks }))) throw new Error(`Immutable request changed: ${input.id}`);
    for (const key of ["priority", "paused", "blockers"]) if (Object.hasOwn(input, key)) existing[key] = clone(input[key]);
    if (restored && existing.kind === "pr" && input.sourceObservedAt && input.superseded === false) {
      existing.sourceObservedAt = input.sourceObservedAt; existing.superseded = false;
      if (input.closed === false) existing.closed = false;
      if (Object.hasOwn(input, "pauseOwner")) existing.pauseOwner = input.pauseOwner;
      for (const other of Object.values(state.requests)) if (other.kind === "pr" && other.number === existing.number && other.id !== existing.id && !other.superseded) {
        if (timeMs(other.sourceObservedAt || other.acceptedAt) > timeMs(existing.sourceObservedAt)) existing.superseded = true;
        else other.superseded = true;
      }
    }
    return existing;
  }
  const request = {
    ...clone(input), id: input.id, number: input.number ?? null,
    sourceSha: input.sourceSha ?? null, baseSha: input.baseSha ?? null, treeSha: input.treeSha ?? null,
    acceptedAt: isoTime(input.acceptedAt ?? Date.now()), priority: Boolean(input.priority), paused: Boolean(input.paused),
    blockers: clone(input.blockers || []),
    tasks, results: {}, superseded: false,
  };
  if (!Array.isArray(request.blockers)) throw new Error("Invalid request blockers");
  if (request.kind === "pr") {
    const siblings = Object.values(state.requests).filter((r) => r.kind === "pr" && r.number === request.number && !r.superseded);
    for (const sibling of siblings) {
      if (sibling.sourceSha === request.sourceSha && sibling.baseSha === request.baseSha && sibling.treeSha === request.treeSha &&
        (sibling.coverageDigest ?? sibling.planDigest ?? null) === (request.coverageDigest ?? request.planDigest ?? null)) throw new Error(`Duplicate PR validation under another request id: ${request.number}`);
      if (timeMs(sibling.acceptedAt) > timeMs(request.acceptedAt)) request.superseded = true;
    }
    if (!request.superseded) for (const sibling of siblings) sibling.superseded = true;
  }
  if (request.kind === "release") {
    const releases = Object.values(state.requests).filter(sibling => sibling.kind === "release");
    if (releases.some(sibling => compareReleaseOrder(sibling, request) > 0)) request.superseded = true;
    if (!request.superseded) for (const sibling of releases) {
      if (!sibling.superseded && !releaseStarted(state, sibling)) supersedePendingRelease(state, sibling);
    }
  }
  state.requests[request.id] = request;
  return request;
}

export function capacityUsage(state) {
  const used = { linux: 0, macos: 0, windows: 0, perPr: {} };
  for (const request of Object.values(state.requests)) for (const task of request.tasks) {
    if (!ACTIVE_TASK_STATUSES.has(task.status)) continue;
    const pool = runnerPool(task.runner); used[pool]++;
    if (request.kind === "pr" && pool === "linux") used.perPr[request.number] = (used.perPr[request.number] || 0) + 1;
  }
  return used;
}

function ownerMatches(wave, { runId, runAttempt }) {
  return wave.owner && String(wave.owner.runId) === String(runId) && wave.owner.runAttempt === Number(runAttempt);
}
export function claimWave(state, waveId, { runId, runAttempt = 1, now = Date.now() } = {}) {
  const wave = state.waves[waveId];
  if (!wave) return { claimed: false, reason: "unknown-wave" };
  if (!runId || !Number.isInteger(Number(runAttempt)) || Number(runAttempt) < 1) return { claimed: false, reason: "invalid-owner" };
  if (wave.owner) return { claimed: Boolean(ownerMatches(wave, { runId, runAttempt }) && wave.status === "running"), reason: "already-owned", wave };
  if (wave.status !== "reserved") return { claimed: false, reason: "not-reserved", wave };
  wave.owner = { runId: String(runId), runAttempt: Number(runAttempt) };
  wave.status = "running"; wave.claimedAt = isoTime(now);
  const executable = [], deferred = [];
  for (const entry of wave.tasks) {
    const request = state.requests[entry.requestId];
    const task = request.tasks.find((t) => t.id === entry.taskId);
    const blocked = state.mode !== "active" || state.controls.validation || request.paused || request.superseded || request.blockers.length || Object.values(request.results).some((r) => r.status !== "success");
    if (blocked) {
      // The unique trusted claimant has not started any executors. It can safely
      // return excluded members to the internal queue without lease guessing.
      task.status = "queued"; delete task.waveId; delete task.owner;
      deferred.push({ ...entry, status: "cancelled" });
      continue;
    }
    if (task.waveId === wave.id && task.status === "reserved") {
      task.status = "running"; task.startedAt = wave.claimedAt;
      if (request.kind === "release") request.startedAt ||= wave.claimedAt;
      task.owner = { ...wave.owner, taskId: task.id, sourceSha: request.sourceSha, planDigest: request.coverageDigest ?? request.planDigest ?? task.planDigest ?? null };
      entry.status = "running"; executable.push(entry);
    }
  }
  wave.tasks = executable; wave.deferredTasks = deferred;
  if (!wave.tasks.length) wave.status = "completed";
  return { claimed: Boolean(wave.tasks.length), reason: wave.tasks.length ? "claimed" : "no-eligible-tasks", wave };
}

export function requestComplete(state, requestId) {
  const request = typeof requestId === "object" ? requestId : state.requests[requestId];
  if (!request || request.superseded || !request.tasks.length || !request.tasks.every((task) => task.status === "success" && request.results[task.id]?.complete === true)) return false;
  const coverage = new Set(Object.values(request.results).flatMap((r) => r.coverageIds || r.coverage || []));
  return (request.requiredCoverage || []).every((id) => coverage.has(id));
}
function waveSettled(wave) { return wave.tasks.every((entry) => !ACTIVE_TASK_STATUSES.has(entry.status)); }

export function completeTask(state, identity, receipt) {
  const wave = state.waves[identity.waveId];
  if (!wave || !ownerMatches(wave, identity)) return { accepted: false, reason: "stale-owner" };
  const candidates = wave.tasks.filter((e) => e.taskId === identity.taskId && (!identity.requestId || e.requestId === identity.requestId));
  if (candidates.length !== 1) return { accepted: false, reason: "unknown-or-ambiguous-task" };
  const entry = candidates[0], request = state.requests[entry.requestId];
  const task = request.tasks.find((t) => t.id === entry.taskId);
  if (!task || task.waveId !== wave.id || !ACTIVE_TASK_STATUSES.has(task.status) || !ACTIVE_TASK_STATUSES.has(entry.status)) return { accepted: false, reason: "task-not-owned" };
  if (task.owner?.jobId && String(task.owner.jobId) !== String(identity.jobId)) return { accepted: false, reason: "stale-job" };
  if (!receipt || !["success", "failure", "cancelled", "incomplete"].includes(receipt.status)) return { accepted: false, reason: "invalid-receipt" };
  if (receipt.runId !== undefined && String(receipt.runId) !== String(identity.runId) ||
    receipt.runAttempt !== undefined && Number(receipt.runAttempt) !== Number(identity.runAttempt) ||
    receipt.requestId !== undefined && receipt.requestId !== request.id) return { accepted: false, reason: "mismatched-receipt-owner" };
  for (const key of ["sourceSha", "baseSha", "treeSha"]) if (receipt[key] !== request[key]) return { accepted: false, reason: `mismatched-${key}` };
  if (!request.sourceSha || !request.treeSha) return { accepted: false, reason: "missing-tree-identity" };
  if (receipt.taskId !== undefined && receipt.taskId !== task.id) return { accepted: false, reason: "mismatched-task" };
  const digest = request.coverageDigest ?? request.planDigest ?? task.planDigest;
  if (digest && (receipt.planDigest === undefined && receipt.coverageDigest === undefined ||
    receipt.planDigest !== undefined && receipt.planDigest !== digest || receipt.coverageDigest !== undefined && receipt.coverageDigest !== digest)) return { accepted: false, reason: "mismatched-plan" };
  if (task.environment && !same(task.environment, receipt.environment)) return { accepted: false, reason: "mismatched-environment" };
  const expected = task.coverageIds || task.coverage || [];
  const actual = receipt.coverageIds || receipt.coverage || [];
  if (receipt.status === "success" && (receipt.complete !== true || !Array.isArray(actual) || expected.some((id) => !actual.includes(id)) ||
    receipt.retried === true || receipt.retries > 0 || receipt.exitCode !== undefined && receipt.exitCode !== 0)) return { accepted: false, reason: "incomplete-coverage" };
  const result = { ...clone(receipt), waveId: wave.id, runId: wave.owner.runId, runAttempt: wave.owner.runAttempt,
    ...(identity.jobId ? { jobId: String(identity.jobId) } : {}), taskId: task.id, complete: receipt.status === "success" && receipt.complete === true };
  request.results[task.id] = result; task.status = receipt.status; task.completedAt = receipt.completedAt || null;
  entry.status = task.status; if (waveSettled(wave)) wave.status = "completed";
  return { accepted: true, requestId: request.id, requestComplete: requestComplete(state, request.id) };
}

/** Lease age is intentionally absent. Only the actual owner's conclusive
 * terminal status can free work lacking a receipt. Failed work remains red. */
export function reconcileOwner(state, waveId, observation = {}) {
  const wave = state.waves[waveId];
  if (!wave || !ownerMatches(wave, observation)) return { reconciled: false, reason: "stale-owner", released: [] };
  if (observation.error) return { reconciled: false, reason: "owner-unreadable", released: [] };
  if (observation.status !== "completed" && !Array.isArray(observation.jobs)) return { reconciled: false, reason: "owner-not-terminal", released: [] };
  const released = [];
  for (const entry of wave.tasks) {
    if (!ACTIVE_TASK_STATUSES.has(entry.status)) continue;
    const task = state.requests[entry.requestId].tasks.find((t) => t.id === entry.taskId);
    const sameNameCount = wave.tasks.filter((candidate) => candidate.taskId === entry.taskId).length;
    const job = (observation.jobs || []).find((j) => j.taskId === entry.taskId && (j.requestId === entry.requestId || !j.requestId && sameNameCount === 1));
    if (observation.status !== "completed" && job?.status !== "completed") continue;
    if (job?.runAttempt !== undefined && Number(job.runAttempt) !== wave.owner.runAttempt) continue;
    if (job?.runId !== undefined && String(job.runId) !== String(wave.owner.runId)) continue;
    if (job?.error) continue;
    // Terminal success without validated evidence is incomplete, never green.
    task.status = "incomplete"; task.completedAt = isoTime(observation.now ?? Date.now()); entry.status = "incomplete";
    state.requests[entry.requestId].results[task.id] = { status: "incomplete", complete: false,
      reason: "terminal-owner-without-valid-receipt", waveId, ...clone(wave.owner), taskId: task.id };
    released.push({ requestId: entry.requestId, taskId: entry.taskId });
  }
  if (waveSettled(wave)) wave.status = "completed";
  return { reconciled: true, released };
}

/** Retrying infrastructure needs an explicit command and authoritative terminal
 * owner proof. A failed assertion is not an infrastructure retry candidate. */
export function retryTask(state, requestId, taskId, observation = {}) {
  const request = state.requests[requestId], task = request?.tasks.find((t) => t.id === taskId);
  if (!task || !["failure", "incomplete", "cancelled"].includes(task.status)) return { retried: false, reason: "task-not-retryable" };
  if (observation.authorized !== true || observation.infrastructure !== true || typeof observation.reason !== "string" || !observation.reason.trim()) return { retried: false, reason: "explicit-infrastructure-authorization-required" };
  const wave = state.waves[task.waveId], result = request.results[task.id];
  if (!wave || !ownerMatches(wave, observation) || observation.status !== "completed" || observation.error) return { retried: false, reason: "owner-not-terminal" };
  if (task.status === "failure" && result?.failureKind !== "infrastructure") return { retried: false, reason: "test-failure-not-infrastructure" };
  if (request.superseded) return { retried: false, reason: "request-superseded" };
  if (request.kind === "release" && Object.values(state.requests).some(other => other.kind === "release" && other.id !== request.id &&
    !other.superseded && compareReleaseOrder(other, request) > 0)) return { retried: false, reason: "newer-release-present" };
  request.resultHistory ||= {};
  request.resultHistory[taskId] ||= [];
  request.resultHistory[taskId].push({ ...clone(result), retry: { reason: observation.reason, authorizedAt: isoTime(observation.now ?? Date.now()) } });
  delete request.results[taskId];
  task.status = "queued"; delete task.waveId; delete task.owner; delete task.startedAt; delete task.completedAt;
  return { retried: true, requestId, taskId };
}
