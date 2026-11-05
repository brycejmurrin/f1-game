// @doc Admit bounded fair validation waves and report queue work by runner pool.
import { ACTIVE_TASK_STATUSES, capacityUsage, isoTime, runnerPool, timeMs, releaseLaneOwner } from "./state.mjs";
export { newState, enqueue, claimWave, completeTask, reconcileOwner, retryTask, requestComplete, capacityUsage, validateState, releaseStarted, releaseLaneOwner } from "./state.mjs";

function eligibleRequest(request) {
  return !request.paused && !request.superseded && !request.blockers.length && !Object.values(request.results).some((r) => r.status !== "success");
}
function pending(request) {
  return request.tasks.filter((task) => task.status === "queued" && task.prerequisites.every((id) => request.results[id]?.status === "success"));
}
function fits(state, used, request, task) {
  const pool = runnerPool(task.runner);
  return used[pool] < state.limits[pool] && !(request.kind === "pr" && pool === "linux" && (used.perPr[request.number] || 0) >= state.limits.perPrLinux);
}
function rotate(requests, lastId) {
  const index = requests.findIndex((r) => r.id === lastId);
  return index < 0 ? requests : [...requests.slice(index + 1), ...requests.slice(0, index + 1)];
}
function next(state, used) {
  const scheduling = state.scheduling;
  const releaseOwner = releaseLaneOwner(state);
  const eligible = Object.values(state.requests).filter(eligibleRequest)
    .sort((a, b) => timeMs(a.acceptedAt) - timeMs(b.acceptedAt) || a.id.localeCompare(b.id));
  // Experiments are durable FIFO admission within each runner pool. Once all
  // eligible tasks of an older experiment are reserved/running, a later one
  // can overlap it. A blocked Mac pool never blocks unrelated Linux admission.
  const experimentFrontier = new Map();
  for (const request of eligible.filter(r => r.kind === "experiment")) for (const task of pending(request)) {
    const pool = runnerPool(task.runner);
    if (!experimentFrontier.has(pool)) experimentFrontier.set(pool, request.id);
  }
  const admissible = request => pending(request).filter(task => request.kind !== "experiment"
    || experimentFrontier.get(runnerPool(task.runner)) === request.id);
  const candidates = eligible
    .filter(request => request.kind !== "release" || !releaseOwner || request.id === releaseOwner)
    .filter((r) => admissible(r).some((t) => fits(state, used, r, t)));
  if (!candidates.length) return null;
  // Release preference is borrowed immediately when there is no release work.
  // Every third turn belongs to other work, even under a continuous release stream.
  const preferRelease = scheduling.releaseTurn % 3 !== 2;
  const releases = candidates.filter((r) => r.kind === "release");
  const others = candidates.filter((r) => r.kind !== "release");
  let pool = preferRelease ? (releases.length ? releases : others) : (others.length ? others : releases);
  // Independent priority counters avoid phase-locking two 2:1 policies: a
  // shared priority request must not lose every turn to normal shared work.
  const category = pool[0].kind === "release" ? "release" : "shared";
  const wantPriority = scheduling.priorityTurns[category] % 3 !== 2;
  const preferred = pool.filter((r) => Boolean(r.priority) === wantPriority);
  if (preferred.length) pool = preferred;
  const tier = `${category}:${Boolean(pool[0].priority)}`;
  const request = rotate(pool, scheduling.lastRequestByTier[tier])[0];
  const task = admissible(request).find((t) => fits(state, used, request, t));
  scheduling.lastRequestByTier[tier] = request.id;
  scheduling.priorityTurn = (scheduling.priorityTurn + 1) % 3;
  scheduling.priorityTurns[category] = (scheduling.priorityTurns[category] + 1) % 3;
  scheduling.releaseTurn = (scheduling.releaseTurn + 1) % 3;
  return { request, task };
}

/** Reserves work only. The caller must commit this state successfully BEFORE
 * dispatching wave IDs. A failed dispatch stays reserved for reconciliation. */
export function admit(state, { now = Date.now(), waveSize = 8, maxWaves = 1 } = {}) {
  if (state.mode !== "active" || state.controls.validation) return [];
  if (!Number.isInteger(waveSize) || waveSize < 4 || waveSize > 8 || !Number.isInteger(maxWaves) || maxWaves < 0) throw new Error("Invalid wave bounds");
  const waves = [], used = capacityUsage(state);
  for (let i = 0; i < maxWaves; i++) {
    const entries = [];
    for (let j = 0; j < waveSize; j++) {
      const selected = next(state, used);
      if (!selected) break;
      const { request, task } = selected, pool = runnerPool(task.runner);
      task.status = "reserved"; task.reservedAt = isoTime(now); task.attempt = (task.attempt || 0) + 1;
      used[pool]++; if (request.kind === "pr" && pool === "linux") used.perPr[request.number] = (used.perPr[request.number] || 0) + 1;
      entries.push({ requestId: request.id, taskId: task.id, runner: task.runner, status: "reserved" });
    }
    if (!entries.length) break;
    const id = `wave-${++state.scheduling.sequence}`;
    const wave = { id, status: "reserved", reservedAt: isoTime(now), owner: null, tasks: entries };
    state.waves[id] = wave;
    for (const entry of entries) state.requests[entry.requestId].tasks.find((t) => t.id === entry.taskId).waveId = id;
    waves.push(wave);
  }
  return waves;
}

export function pendingMetrics(state, { now = Date.now() } = {}) {
  const seconds = { linux: 0, macos: 0, windows: 0 };
  let oldestWaitSeconds = 0, tasks = 0;
  for (const request of Object.values(state.requests)) {
    if (!eligibleRequest(request)) continue;
    for (const task of request.tasks) {
      if (task.status !== "queued" && !ACTIVE_TASK_STATUSES.has(task.status)) continue;
      seconds[runnerPool(task.runner)] += (task.expectedSeconds || 0) + (task.setupSeconds || 0);
      tasks++;
      if (task.status === "queued" || task.status === "reserved") oldestWaitSeconds = Math.max(oldestWaitSeconds, Math.max(0, (timeMs(now) - timeMs(task.reservedAt || request.acceptedAt)) / 1000));
    }
  }
  const drainMinutesByPool = Object.fromEntries(Object.entries(seconds).map(([pool, value]) => [pool, value ? (state.limits[pool] ? value / state.limits[pool] / 60 : Infinity) : 0]));
  return { tasks, seconds, drainMinutesByPool, drainMinutes: Math.max(...Object.values(drainMinutesByPool)), oldestWaitMinutes: oldestWaitSeconds / 60 };
}
