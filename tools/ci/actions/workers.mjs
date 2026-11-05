// @doc Reserve implementation launches before firing and retain ambiguous ownership until recovery.
import { fireWorker } from "../dispatch.mjs";
import { clone, isoTime, timeMs, implementationWorkerCount } from "./state.mjs";
import { producerBackpressure } from "./scheduler.mjs";
import { LABELS, namesOf } from "./policy.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export const WORKER_HOST_DOCUMENTATION = "https://platform.claude.com/docs/en/api/claude-code/routines-fire";
const SESSION = /^session_[A-Za-z0-9]{12,}$/;
function capability(adapter, now) {
  const declared = adapter?.capability;
  const supported = declared?.schemaVersion === 1 && declared.provider === "claude-code"
    && /^https:\/\/(?:platform|code)\.claude\.com\/docs\//.test(declared.documentation || "")
    && typeof adapter.probeSession === "function" && typeof adapter.findLaunch === "function";
  return { supported, provider: "claude-code", observedAt: isoTime(now),
    documentation: supported ? declared.documentation : WORKER_HOST_DOCUMENTATION,
    reason: supported ? "protected host adapter supports exact-session reads and launch correlation" : "A verified Claude Code routine session reader and launch-correlation adapter is required; Managed Agents sesn_ APIs are not compatible",
    ...(supported && adapter.protectedModuleSha ? { moduleSha: adapter.protectedModuleSha } : {}) };
}

/** Only installed protected controller code may implement the provider protocol.
 * No endpoint is guessed and no routine token is sent to the unrelated Managed
 * Agents API. Unsupported/missing configuration disables producers alone. */
export async function loadWorkerHostAdapter({ env = process.env } = {}) {
  const name = env.WORKER_HOST_ADAPTER;
  if (!/^[a-z][a-z0-9-]{0,63}\.mjs$/.test(name || "")) return null;
  try {
    const directory = fs.realpathSync(path.join(import.meta.dirname, "hosts"));
    const filename = fs.realpathSync(path.join(directory, name));
    if (path.dirname(filename) !== directory) return null;
    const module = await import(pathToFileURL(filename).href);
    const adapter = module.default;
    if (!capability(adapter, Date.now()).supported) return null;
    return { ...adapter, protectedModuleSha: crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex") };
  } catch { return null; }
}

const LIVE = new Set(["reserved", "firing", "accepted", "ambiguous"]);
function activeWorkers(state) {
  return implementationWorkerCount(state);
}
function activeBatchScope(request) {
  return !request.superseded && (!request.closed || (request.owner && !request.owner.terminal)
    || (LIVE.has(request.workerLaunch?.status) && !request.owner?.terminal));
}
function memberNumbers(state) {
  return new Set(Object.values(state.requests).filter((r) => r.kind === "issue" && activeBatchScope(r))
    .flatMap((r) => r.members || []).map(Number));
}
function batchMemberProblem(state, request) {
  const scope = new Set((request.members || []).map(Number));
  if (scope.size && Object.values(state.requests).some(parent => parent.id !== request.id && parent.kind === "issue"
    && activeBatchScope(parent) && (parent.members || []).some(number => scope.has(Number(number))))) return "batch membership overlaps another active parent";
  for (const number of request.members || []) {
    const members = Object.values(state.requests).filter(record => Number(record.number) === Number(number) && !record.superseded);
    if (!members.length) {
      if (request.memberStates?.[number] === 'closed') continue;
      return `batch member ${number} has no current ownership evidence`;
    }
    if (members.every(member => member.closed && (!member.owner || member.owner.terminal) && (!LIVE.has(member.workerLaunch?.status) || member.owner?.terminal))) continue;
    if (members.some(member => member.paused || member.pauseOwner || member.pauseProvenance?.paused || member.blockers?.length
      || (member.owner && !member.owner.terminal) || (LIVE.has(member.workerLaunch?.status) && !member.owner?.terminal))) return `batch member ${number} is paused, blocked or owned`;
  }
  return null;
}
function eligible(state, request, { allowReserved = false } = {}) {
  if (!request || request.kind !== "issue" || request.closed || request.paused || request.superseded || request.intakeWithdrawn || request.blockers?.length) return false;
  if (request.owner && !request.owner.terminal && !(allowReserved && request.workerLaunch?.status === "reserved")) return false;
  if (memberNumbers(state).has(Number(request.number)) || batchMemberProblem(state, request)) return false;
  if (LIVE.has(request.workerLaunch?.status) && !(allowReserved && request.workerLaunch.status === "reserved")
    && !(request.workerLaunch.status === "accepted" && request.owner?.terminal && request.recoverRequested)) return false;
  if (request.workerLaunch && request.workerLaunch.status !== "reserved" && !request.recoverRequested) return false;
  return true;
}

/** Pure producer admission. Reservations and ambiguous fires occupy worker capacity. */
export function planWorkerLaunches(state, { now = Date.now() } = {}) {
  const copy = clone(state);
  const pressure = producerBackpressure(copy, { now, activeWorkers: activeWorkers(copy) });
  const candidates = Object.values(copy.requests).filter((r) => eligible(copy, r))
    .sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || timeMs(a.acceptedAt) - timeMs(b.acceptedAt) || a.id.localeCompare(b.id));
  const count = Math.min(8, pressure.availableWorkers);
  const hostReady = state.workers?.capability?.supported === true;
  return { launches: pressure.allowed && hostReady ? candidates.slice(0, count).map((r) => ({ requestId: r.id, address: `ISSUE ${r.number}` })) : [], pressure: { ...pressure, allowed: pressure.allowed && hostReady, hostReady }, producer: copy.producer };
}

function freshProblem(request, snapshot) {
  if (!snapshot || snapshot.error || !snapshot.issue || !Array.isArray(snapshot.blockers)) return "authoritative issue/blocker reads unavailable";
  if (snapshot.issue.number !== request.number || snapshot.issue.pull_request || snapshot.issue.state !== "open") return "issue is not open";
  if (!namesOf(snapshot.issue).includes(LABELS.ready)) return "intake withdrawn";
  if (snapshot.paused || namesOf(snapshot.issue).includes(LABELS.paused)) return "issue paused";
  if (snapshot.blockers.length || snapshot.batchParent) return "issue blocked or owned by a batch";
  if (snapshot.owner || snapshot.linkedPrs?.length) return "issue already owned";
  if (request.members?.length && (!Array.isArray(snapshot.members)
    || JSON.stringify([...request.members].sort((a, b) => a - b)) !== JSON.stringify([...snapshot.members].sort((a, b) => a - b)))) return "batch membership unreadable or changed";
  return null;
}

/** All external fire calls follow a successful durable firing transition. A lost
 * fire response is ambiguous forever until authoritative recovery, never retryable by age. */
export async function executeWorkerLaunch(store, { requestId, fire = fireWorker, read, now = Date.now(), timeoutMs = 30_000 } = {}) {
  const at = isoTime(now);
  let request;
  try { request = store.read().state.requests[requestId]; }
  catch { return { status: "deferred", requestId, reason: "ledger unavailable" }; }
  if (!request) return { status: "deferred", requestId, reason: "unknown request" };
  if (["firing", "ambiguous"].includes(request.workerLaunch?.status) || (request.workerLaunch?.status === "accepted" && (!request.owner?.terminal || !request.recoverRequested))) return { status: request.workerLaunch.status === "firing" ? "ambiguous" : request.workerLaunch.status, requestId, launchId: request.workerLaunch.id, reason: "existing attempt is authoritative" };
  if (typeof read !== "function") return { status: "deferred", requestId, reason: "fresh reader required" };
  let fresh;
  try { fresh = await read(clone(request)); }
  catch { return { status: "deferred", requestId, reason: "authoritative reads failed" }; }
  const problem = freshProblem(request, fresh);
  if (problem) return { status: "deferred", requestId, reason: problem };
  let reservation;
  try {
    reservation = store.update((state) => {
      const current = state.requests[requestId];
      if (state.workers?.capability?.supported !== true) return null;
      if (!eligible(state, current, { allowReserved: true })) return null;
      const pressure = producerBackpressure(state, { now, activeWorkers: activeWorkers(state) - (current.workerLaunch?.status === "reserved" ? 1 : 0) });
      if (!pressure.allowed) return null;
      if (current.workerLaunch?.status === "reserved") return { ...current.workerLaunch };
      const attempt = (current.workerLaunch?.attempt || 0) + 1;
      current.workerLaunch = { id: `${requestId}:launch:${attempt}`, attempt, status: "reserved", reservedAt: at, address: `ISSUE ${current.number}` };
      current.owner = { launchId: current.workerLaunch.id, terminal: false };
      current.recoverRequested = false;
      return { ...current.workerLaunch };
    }).result;
  } catch { return { status: "deferred", requestId, reason: "reservation not persisted" }; }
  if (!reservation) return { status: "deferred", requestId, reason: "admission changed" };
  let ownsFire;
  try {
    ownsFire = store.update((state) => {
      const current = state.requests[requestId];
      if (!eligible(state, current, { allowReserved: true }) || state.mode !== "active" || state.workers?.capability?.supported !== true || state.controls.workers || state.producer.paused || current?.paused || current?.superseded || current?.intakeWithdrawn || current?.blockers?.length || current?.workerLaunch?.id !== reservation.id || current.workerLaunch.status !== "reserved") return false;
      current.workerLaunch.status = "firing"; current.workerLaunch.firedAt = at;
      return true;
    }).result;
  } catch { return { status: "deferred", requestId, launchId: reservation.id, reason: "firing transition not persisted" }; }
  if (!ownsFire) return { status: "deferred", requestId, launchId: reservation.id, reason: "attempt already claimed or paused" };
  let response, timer;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => fire(`ISSUE ${request.number}\nLAUNCH ${reservation.id}`)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("worker fire timeout")), timeoutMs); }),
    ]);
  } catch { response = { status: 0, error: "worker fire response unavailable" }; }
  finally { clearTimeout(timer); }
  const accepted = response?.status === 200 && /^session_[A-Za-z0-9]{12,}$/.test(String(response.session || ""));
  // A server error can happen after accepting work. Only explicit client refusal
  // or a pre-fire configuration skip is a safely retryable rejection.
  const rejected = !!response?.skipped || (Number.isInteger(response?.status) && response.status >= 400 && response.status < 500);
  const status = accepted ? "accepted" : rejected ? "rejected" : "ambiguous";
  const result = { status, requestId, launchId: reservation.id, ...(accepted ? { session: response.session } : {}), reason: response?.skipped || response?.error || null };
  try {
    store.update((state) => {
      const current = state.requests[requestId];
      if (current?.workerLaunch?.id !== reservation.id || current.workerLaunch.status !== "firing") throw new Error("worker attempt changed");
      Object.assign(current.workerLaunch, { status, completedAt: at, ...(accepted ? { session: response.session, startup: { status: "bound", pendingResume: true, at } } : {}), reason: result.reason });
      current.owner = { launchId: reservation.id, ...(accepted ? { session: response.session } : {}), terminal: rejected };
    });
  } catch { return { ...result, status: "ambiguous", persisted: false, reason: "fire result not persisted; do not retry" }; }
  return { ...result, persisted: true };
}

/** A worker may retry a pending startup check on a native host wake, but cannot
 * claim its own identity, edit the ledger, or refire a reservation. */
export function verifyWorkerStartup(state, { requestId, launchId, sessionId } = {}) {
  const record = state.requests?.[requestId], launch = record?.workerLaunch;
  if (!record || !launch || launch.id !== launchId || !SESSION.test(sessionId || "")) return { ready: false, retryable: false, reason: "identity mismatch" };
  if (["reserved", "firing", "ambiguous"].includes(launch.status)) return { ready: false, retryable: true, reason: "awaiting trusted session binding", launchId };
  if (state.mode !== "active" || state.controls.workers || record.paused || record.superseded || record.intakeWithdrawn || record.blockers?.length) return { ready: false, retryable: true, reason: "scope paused or unavailable", launchId };
  if (launch.status !== "accepted" || launch.session !== sessionId || record.owner?.session !== sessionId || record.owner.terminal) return { ready: false, retryable: false, reason: "session is not the active bound owner", launchId };
  return { ready: true, retryable: false, requestId, launchId, sessionId };
}

function hostProof(observation, launch, session, now) {
  const observed = Date.parse(observation?.observedAt || "");
  return observation?.source === "host-api" && observation.authenticated === true && observation.launchId === launch.id
    && observation.session === session && SESSION.test(session || "") && typeof observation.evidenceId === "string" && !!observation.evidenceId
    && Number.isFinite(observed) && observed <= timeMs(now) + 60_000 && observed >= timeMs(launch.firedAt || launch.reservedAt)
    && ["running", "idle", "terminated"].includes(observation.state);
}

/** Read-only host probes plus durable ledger reconciliation. Termination is
 * never inferred from age, a comment, a closed issue, idle state, or a 404. */
export async function reconcileWorkers(store, { adapter, now = Date.now(), maxProbes = 8 } = {}) {
  if (adapter === undefined) adapter = await loadWorkerHostAdapter();
  const support = capability(adapter, now);
  store.update(state => { state.workers = { ...state.workers, capability: support }; });
  if (!support.supported) return { capability: support, observations: [], pending: "provider capability unavailable" };
  if (!Number.isInteger(maxProbes) || maxProbes < 0 || maxProbes > 8) throw new Error("Invalid worker probe budget");
  const records = Object.values(store.read().state.requests).filter(r => r.kind === "issue" && r.workerLaunch
    && ["firing", "ambiguous", "accepted"].includes(r.workerLaunch.status) && !r.owner?.terminal)
    .sort((a, b) => a.id.localeCompare(b.id));
  const observations = [];
  for (const record of records.slice(0, maxProbes)) {
    const launch = record.workerLaunch;
    let session = launch.session || record.owner?.session, proof;
    try {
      if (!session) {
        const found = await adapter.findLaunch({ requestId: record.id, launchId: launch.id, address: launch.address || `ISSUE ${record.number}`, firedAt: launch.firedAt, reservedAt: launch.reservedAt });
        if (found?.source !== "host-api" || found.authenticated !== true || found.launchId !== launch.id || found.complete !== true || !Array.isArray(found.sessions) || found.sessions.length !== 1) {
          observations.push({ requestId: record.id, status: "unresolved", reason: "exact launch correlation unavailable" }); continue;
        }
        session = found.sessions[0]?.session;
      }
      proof = await adapter.probeSession({ requestId: record.id, launchId: launch.id, session });
    } catch { observations.push({ requestId: record.id, status: "unresolved", reason: "host probe unavailable" }); continue; }
    if (!hostProof(proof, launch, session, now)) { observations.push({ requestId: record.id, status: "unresolved", reason: "host identity or provenance mismatch" }); continue; }
    const saved = store.update(state => {
      const current = state.requests[record.id];
      if (current?.workerLaunch?.id !== launch.id || current.owner?.terminal || (current.workerLaunch.session && current.workerLaunch.session !== session)) return false;
      current.workerLaunch.session = session;
      current.workerLaunch.status = proof.state === "terminated" ? "terminated" : "accepted";
      current.workerLaunch.hostProof = clone(proof);
      current.owner = { launchId: launch.id, session, terminal: proof.state === "terminated", hostProof: clone(proof) };
      if (proof.state === "terminated") current.workerLaunch.terminalAt = proof.observedAt;
      else if (launch.status !== "accepted") current.workerLaunch.startup = { status: "bound", at: isoTime(now), pendingResume: true };
      return true;
    });
    observations.push({ requestId: record.id, status: proof.state, persisted: saved.result === true, session });
    // A resume is not another fire and never creates a new worker. The adapter
    // must implement a documented native wake for this exact bound session.
    if (saved.result && proof.state === "idle" && (launch.status !== "accepted" || launch.startup?.pendingResume) && typeof adapter.resumeStartup === "function") {
      try {
        const wake = store.update(state => {
          const current = state.requests[record.id];
          if (current?.workerLaunch?.id !== launch.id || current.owner?.session !== session || !current.workerLaunch.startup?.pendingResume) return false;
          current.workerLaunch.startup = { status: "resume-requested", id: `${launch.id}:startup`, at: isoTime(now), pendingResume: false };
          return true;
        });
        if (!wake.result) continue;
        const resumed = await adapter.resumeStartup({ requestId: record.id, launchId: launch.id, session });
        if (resumed?.source === "host-api" && resumed.authenticated === true && resumed.session === session && resumed.launchId === launch.id && resumed.accepted === true) {
          store.update(state => {
            const current = state.requests[record.id];
            if (current?.workerLaunch?.id === launch.id && current.owner?.session === session) current.workerLaunch.startup = { status: "resume-confirmed", at: isoTime(now), pendingResume: false };
          });
        }
      } catch { /* wake outcome stays visible and is not blindly repeated or refired */ }
    }
  }
  return { capability: support, observations };
}
