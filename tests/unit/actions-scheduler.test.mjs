import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newState, enqueue, admit, claimWave, completeTask, reconcileOwner,
  capacityUsage, requestComplete, producerBackpressure, pendingMetrics, retryTask, releaseLaneOwner, validateState,
} from "../../tools/ci/actions/scheduler.mjs";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const active = (options = {}) => newState({ mode: "active", now: NOW, ...options });
const task = (id, overrides = {}) => ({ id, kind: "browser", runner: "ubuntu-latest", expectedSeconds: 360,
  setupSeconds: 120, prerequisites: [], coverageIds: [id], environment: { backend: "llvmpipe" }, ...overrides });
const request = (id, tasks = [task(`${id}-test`)], overrides = {}) => ({ id, kind: "pr", number: Number(id.replace(/\D/g, "")) || 1,
  sourceSha: `head-${id}`, baseSha: "base", treeSha: `tree-${id}`, coverageDigest: `plan-${id}`, acceptedAt: NOW, tasks, ...overrides });
function receipt(r, t, overrides = {}) {
  return { status: "success", complete: true, sourceSha: r.sourceSha, baseSha: r.baseSha, treeSha: r.treeSha,
    planDigest: r.coverageDigest, coverageIds: [...t.coverageIds], environment: t.environment, ...overrides };
}
function claim(state, wave, runId = "100") {
  assert.equal(claimWave(state, wave.id, { runId, runAttempt: 1, now: NOW }).claimed, true);
  return { waveId: wave.id, runId, runAttempt: 1 };
}

test("shadow mode and independent global pause controls never admit validation", () => {
  const s = newState({ now: NOW }); enqueue(s, request("p1"));
  assert.deepEqual(admit(s), []);
  s.mode = "active"; s.controls.validation = true;
  assert.deepEqual(admit(s), []);
  s.controls.validation = false; s.controls.workers = true;
  assert.equal(admit(s).length, 1, "worker pause does not pause validation");
});

test("all executor types share bounded pools and Linux PR usage never exceeds four", () => {
  const s = active();
  for (let i = 1; i <= 10; i++) enqueue(s, request(`p${i}`, Array.from({ length: 8 }, (_, j) => task(`p${i}-${j}`))));
  enqueue(s, request("other", [task("mac1", { runner: "macOS-latest" }), task("mac2", { runner: "macOS-latest" }),
    task("mac3", { runner: "macOS-latest" }), task("win1", { runner: "windows-latest" }),
    task("win2", { runner: "windows-latest" }), task("win3", { runner: "windows-latest" })], { kind: "experiment" }));
  const waves = admit(s, { now: NOW, maxWaves: 10 });
  const used = capacityUsage(s);
  assert.equal(used.linux, 24); assert.equal(used.macos, 2); assert.equal(used.windows, 2);
  assert.ok(Object.values(used.perPr).every((n) => n <= 4));
  assert.ok(waves.every((w) => w.tasks.length <= 8));
  assert.equal(admit(s, { maxWaves: 10 }).length, 0, "reservations count before dispatch");
});

test("priority gets two turns to one normal turn while requests round robin within a tier", () => {
  const s = active();
  for (const [id, priority] of [["p1", true], ["p2", true], ["p3", false]]) {
    enqueue(s, request(id, Array.from({ length: 12 }, (_, i) => task(`${id}-${i}`)), { priority }));
  }
  const tasks = admit(s, { now: NOW, waveSize: 4, maxWaves: 3 }).flatMap((w) => w.tasks);
  const counts = Object.fromEntries(["p1", "p2", "p3"].map((id) => [id, tasks.filter((t) => t.requestId === id).length]));
  assert.deepEqual(counts, { p1: 4, p2: 4, p3: 4 });
  assert.deepEqual(tasks.slice(0, 3).map((t) => t.requestId), ["p1", "p2", "p3"]);
});

test("release preference cannot starve other work and unused allocations are borrowed", () => {
  const s = active();
  enqueue(s, request("release", Array.from({ length: 24 }, (_, i) => task(`r${i}`)), { kind: "release" }));
  enqueue(s, request("normal", Array.from({ length: 24 }, (_, i) => task(`n${i}`)), { kind: "experiment" }));
  const tasks = admit(s, { waveSize: 8, maxWaves: 3 }).flatMap((w) => w.tasks);
  assert.equal(tasks.filter((t) => t.requestId === "normal").length, 8);
  const onlyNormal = active();
  enqueue(onlyNormal, request("normal", Array.from({ length: 24 }, (_, i) => task(`n${i}`)), { kind: "experiment" }));
  admit(onlyNormal, { maxWaves: 3 }); assert.equal(capacityUsage(onlyNormal).linux, 24);
});

test("release and priority policies cannot phase-lock and starve either category", () => {
  const s = active();
  for (const [id, kind, priority] of [["rp", "release", true], ["sp", "maintenance", true], ["sn", "maintenance", false]]) {
    enqueue(s, request(id, Array.from({ length: 12 }, (_, i) => task(`${id}-${i}`)), { kind, priority }));
  }
  const entries = admit(s, { waveSize: 4, maxWaves: 3 }).flatMap((w) => w.tasks);
  for (const id of ["rp", "sp", "sn"]) assert.ok(entries.some((entry) => entry.requestId === id), `${id} receives turns under continuous mixed demand`);
});

test("newest pending release coalesces older tips without letting delayed events roll back the frontier", () => {
  const s = active();
  enqueue(s, request("release1", [task("one")], { kind: "release", acceptedAt: NOW }));
  enqueue(s, request("release3", [task("three")], { kind: "release", acceptedAt: NOW + 3000 }));
  enqueue(s, request("release2", [task("two")], { kind: "release", acceptedAt: NOW + 2000 }));
  assert.equal(s.requests.release1.superseded, true); assert.equal(s.requests.release2.superseded, true);
  assert.equal(s.requests.release3.superseded, false);
  assert.deepEqual(admit(s)[0].tasks.map(entry => entry.requestId), ["release3"]);
});

test("superseding an unclaimed release revokes its reservation and fences an already dispatched old wave", () => {
  const s = active();
  enqueue(s, request("release1", [task("old")], { kind: "release", acceptedAt: NOW }));
  const [oldWave] = admit(s); assert.equal(capacityUsage(s).linux, 1);
  enqueue(s, request("release2", [task("latest")], { kind: "release", acceptedAt: NOW + 1000 }));
  assert.equal(capacityUsage(s).linux, 0); assert.equal(oldWave.status, "completed");
  assert.equal(claimWave(s, oldWave.id, { runId: "old-dispatch", runAttempt: 1 }).claimed, false);
  const [latestWave] = admit(s);
  assert.notEqual(latestWave.id, oldWave.id); assert.equal(latestWave.tasks[0].requestId, "release2");
  validateState(s);
});

test("release coalescing preserves healthy PR reservations in the same unclaimed wave", () => {
  const s = active();
  enqueue(s, request("release1", [task("old")], { kind: "release", acceptedAt: NOW }));
  enqueue(s, request("p1", [task("pr")]));
  const [mixed] = admit(s); assert.equal(capacityUsage(s).linux, 2);
  enqueue(s, request("release2", [task("latest")], { kind: "release", acceptedAt: NOW + 1000 }));
  assert.equal(capacityUsage(s).linux, 1); assert.equal(mixed.status, "reserved");
  assert.equal(claimWave(s, mixed.id, { runId: "mixed" }).claimed, true);
  assert.deepEqual(mixed.tasks.map(entry => entry.requestId), ["p1"]);
  validateState(s);
});

test("an active release owns the lane across waves while only the newest next release waits", () => {
  const s = active(), old = enqueue(s, request("release1", [task("guard"), task("publish", { prerequisites: ["guard"] })], { kind: "release", acceptedAt: NOW }));
  const [guardWave] = admit(s), oldOwner = claim(s, guardWave);
  enqueue(s, request("release2", [task("middle")], { kind: "release", acceptedAt: NOW + 1000 }));
  enqueue(s, request("release3", [task("latest")], { kind: "release", acceptedAt: NOW + 2000 }));
  assert.equal(s.requests.release1.superseded, false); assert.equal(s.requests.release2.superseded, true);
  assert.equal(releaseLaneOwner(s), "release1"); assert.deepEqual(admit(s), []);
  completeTask(s, { ...oldOwner, taskId: "guard" }, receipt(old, old.tasks[0]));
  assert.equal(capacityUsage(s).linux, 0); assert.equal(releaseLaneOwner(s), "release1", "between-wave gap does not relinquish the release lane");
  const [publishWave] = admit(s); assert.equal(publishWave.tasks[0].requestId, "release1");
  const publisher = claim(s, publishWave, "101");
  completeTask(s, { ...publisher, taskId: "publish" }, receipt(old, old.tasks[1]));
  assert.equal(requestComplete(s, old.id), true);
  assert.equal(admit(s)[0].tasks[0].requestId, "release3");
});

test("a failed release retains its lane until live siblings are conclusively terminal", () => {
  const s = active(), old = enqueue(s, request("release1", [task("failed"), task("live")], { kind: "release", acceptedAt: NOW }));
  const [wave] = admit(s), oldOwner = claim(s, wave);
  completeTask(s, { ...oldOwner, taskId: "failed" }, receipt(old, old.tasks[0], { status: "failure", complete: false }));
  enqueue(s, request("release2", [task("latest")], { kind: "release", acceptedAt: NOW + 1000 }));
  assert.deepEqual(admit(s), []); assert.equal(capacityUsage(s).linux, 1);
  reconcileOwner(s, wave.id, { ...oldOwner, status: "unknown", error: "API unavailable" });
  assert.deepEqual(admit(s), []); assert.equal(releaseLaneOwner(s), "release1");
  reconcileOwner(s, wave.id, { ...oldOwner, status: "completed", now: NOW + 2000 });
  assert.equal(admit(s)[0].tasks[0].requestId, "release2"); assert.equal(requestComplete(s, old.id), false);
  assert.equal(retryTask(s, old.id, "live", { ...oldOwner, status: "completed", authorized: true,
    infrastructure: true, reason: "recover old artifact", now: NOW + 3000 }).reason, "newer-release-present");
});

test("trusted guard prerequisites gate expensive work without a separate rollup task", () => {
  const s = active(), r = enqueue(s, request("p1", [task("guard", { kind: "guard" }), task("browser", { prerequisites: ["guard"] })]));
  const [wave] = admit(s, { now: NOW }); assert.equal(wave.tasks.length, 1);
  const owner = claim(s, wave);
  assert.equal(completeTask(s, { ...owner, taskId: "guard" }, receipt(r, r.tasks[0])).accepted, true);
  assert.equal(admit(s, { now: NOW })[0].tasks[0].taskId, "browser");
});

test("a decisive failure stops new expensive work without declaring absent coverage green", () => {
  const s = active(), r = enqueue(s, request("p1", [task("guard"), task("browser", { prerequisites: ["guard"] })]));
  const [wave] = admit(s), owner = claim(s, wave);
  assert.equal(completeTask(s, { ...owner, taskId: "guard" }, receipt(r, r.tasks[0], { status: "failure", complete: false })).accepted, true);
  assert.deepEqual(admit(s), []); assert.equal(requestComplete(s, r.id), false);
  assert.equal(r.tasks[1].status, "queued");
});

test("claim is idempotent for the winning identity and fences all other dispatches/attempts", () => {
  const s = active(); enqueue(s, request("p1")); const [wave] = admit(s);
  assert.equal(claimWave(s, wave.id, { runId: 123, runAttempt: 1 }).claimed, true);
  assert.equal(claimWave(s, wave.id, { runId: "123", runAttempt: 1 }).claimed, true);
  assert.equal(claimWave(s, wave.id, { runId: "124", runAttempt: 1 }).claimed, false);
  assert.equal(claimWave(s, wave.id, { runId: "123", runAttempt: 2 }).claimed, false);
  assert.equal(capacityUsage(s).linux, 1);
});

test("a paused member does not strand a mixed wave or execute when another PR claims", () => {
  const s = active(); enqueue(s, request("p1")); enqueue(s, request("p2"));
  const [wave] = admit(s); s.requests.p1.paused = true;
  assert.equal(claimWave(s, wave.id, { runId: "1" }).claimed, true);
  assert.deepEqual(wave.tasks.map((t) => t.requestId), ["p2"]);
  assert.equal(s.requests.p1.tasks[0].status, "queued");
  assert.equal(capacityUsage(s).linux, 1);
  const paused = active(); enqueue(paused, request("p1")); const [w] = admit(paused); paused.controls.validation = true;
  assert.equal(claimWave(paused, w.id, { runId: "2" }).claimed, false);
  assert.equal(capacityUsage(paused).linux, 0);
});

test("partial, stale-head, wrong-plan and wrong-environment successes cannot release a permit", () => {
  const s = active(), r = enqueue(s, request("p1", [task("t", { coverageIds: ["a", "b"] })]));
  const [wave] = admit(s), owner = claim(s, wave), identity = { ...owner, taskId: "t" };
  for (const overrides of [{ complete: false }, { coverageIds: ["a"] }, { sourceSha: "old" }, { treeSha: "old-tree" },
    { baseSha: "old-base" }, { planDigest: "different" }, { environment: { backend: "metal" } },
    { runId: "another-run" }, { runAttempt: 2 }, { requestId: "another-request" }, { retries: 1 }, { exitCode: 1 }]) {
    assert.equal(completeTask(s, identity, receipt(r, r.tasks[0], overrides)).accepted, false);
    assert.equal(capacityUsage(s).linux, 1);
  }
  assert.equal(completeTask(s, { ...identity, runAttempt: 2 }, receipt(r, r.tasks[0])).accepted, false);
  assert.equal(completeTask(s, identity, receipt(r, r.tasks[0])).accepted, true);
  assert.equal(requestComplete(s, r.id), true); assert.equal(capacityUsage(s).linux, 0);
  assert.equal(completeTask(s, identity, receipt(r, r.tasks[0])).accepted, false, "late replay cannot change final evidence");
});

test("ambiguous same-name tasks in a mixed wave require requestId in the receipt identity", () => {
  const s = active(), r1 = enqueue(s, request("p1", [task("guard")])); enqueue(s, request("p2", [task("guard")]));
  const [wave] = admit(s), owner = claim(s, wave);
  assert.equal(completeTask(s, { ...owner, taskId: "guard" }, receipt(r1, r1.tasks[0])).accepted, false);
  assert.equal(completeTask(s, { ...owner, requestId: r1.id, taskId: "guard" }, receipt(r1, r1.tasks[0])).accepted, true);
  assert.equal(capacityUsage(s).linux, 1); assert.equal(wave.status, "running");
});

test("leases never reassign live/unreadable owners and terminal success without evidence remains incomplete", () => {
  const s = active(); enqueue(s, request("p1", [task("t1"), task("t2")])); const [wave] = admit(s), owner = claim(s, wave);
  for (const observation of [{ status: "in_progress" }, { status: "unknown", error: "403" }, { status: "completed", runAttempt: 2 }]) {
    reconcileOwner(s, wave.id, { ...owner, now: NOW + 86400000, ...observation });
    assert.equal(capacityUsage(s).linux, 2);
  }
  const r = reconcileOwner(s, wave.id, { ...owner, status: "in_progress", jobs: [{ taskId: "t1", status: "completed", runAttempt: 1 }], now: NOW });
  assert.equal(r.released.length, 1); assert.equal(capacityUsage(s).linux, 1);
  assert.equal(s.requests.p1.results.t1.status, "incomplete"); assert.equal(wave.status, "running");
  reconcileOwner(s, wave.id, { ...owner, status: "completed", conclusion: "success", now: NOW });
  assert.equal(capacityUsage(s).linux, 0); assert.equal(requestComplete(s, "p1"), false);
});

test("new PR heads supersede unstarted old work while retaining live reservations and durable experiments", () => {
  const s = active(), old = request("old", [task("old1"), task("old2", { prerequisites: ["old1"] })], { number: 77, acceptedAt: NOW - 1000 });
  enqueue(s, old); const [wave] = admit(s); claim(s, wave);
  enqueue(s, request("new", [task("new1")], { number: 77, acceptedAt: NOW }));
  assert.equal(s.requests.old.superseded, true); assert.equal(capacityUsage(s).linux, 1);
  enqueue(s, request("stale", [task("stale1")], { number: 77, acceptedAt: NOW - 2000 }));
  assert.equal(s.requests.stale.superseded, true); assert.equal(s.requests.new.superseded, false);
  enqueue(s, request("experiment1", [task("e1")], { kind: "experiment", number: 77 }));
  enqueue(s, request("experiment2", [task("e2")], { kind: "experiment", number: 77 }));
  const ids = admit(s).flatMap((w) => w.tasks).map((t) => t.requestId);
  assert.deepEqual(new Set(ids), new Set(["new", "experiment1", "experiment2"]));
});

test("event replay preserves enqueue time, ownership and receipts and cannot mutate a plan", () => {
  const s = active(), input = request("p1"); enqueue(s, input); const [wave] = admit(s); claim(s, wave);
  enqueue(s, { ...input, acceptedAt: NOW + 1000, priority: true });
  assert.equal(s.requests.p1.acceptedAt, new Date(NOW).toISOString());
  assert.equal(s.requests.p1.tasks[0].status, "running");
  assert.throws(() => enqueue(s, { ...input, treeSha: "different" }), /Immutable/);
  assert.throws(() => enqueue(s, { ...input, tasks: [task("new-test")] }), /Immutable/);
  assert.throws(() => enqueue(s, request("cycle", [task("a", { prerequisites: ["b"] }), task("b", { prerequisites: ["a"] })])), /Cyclic/);
});

test("a changed base/candidate tree requires a new immutable request even when PR head is unchanged", () => {
  const s = active(), original = request("old", [task("test")], { number: 9 }); enqueue(s, original);
  const replacement = request("new", [task("test")], { number: 9, sourceSha: original.sourceSha, baseSha: "new-base", treeSha: "new-tree", acceptedAt: NOW + 1 });
  enqueue(s, replacement);
  assert.equal(s.requests.old.superseded, true); assert.equal(s.requests.new.superseded, false);
  assert.deepEqual(admit(s)[0].tasks.map((t) => t.requestId), ["new"]);
});

test("declared full coverage cannot pass when individually successful tasks omit a required item", () => {
  const s = active(), r = enqueue(s, request("p1", [task("one")], { requiredCoverage: ["one", "missing"] }));
  const [wave] = admit(s), owner = claim(s, wave);
  assert.equal(completeTask(s, { ...owner, taskId: "one" }, receipt(r, r.tasks[0])).accepted, true);
  assert.equal(requestComplete(s, r.id), false);
});

test("terminal observations with API errors or ambiguous task names cannot free live siblings", () => {
  const s = active(); enqueue(s, request("p1", [task("guard")])); enqueue(s, request("p2", [task("guard")]));
  const [wave] = admit(s), owner = claim(s, wave);
  reconcileOwner(s, wave.id, { ...owner, status: "completed", error: "API response incomplete" });
  assert.equal(capacityUsage(s).linux, 2);
  reconcileOwner(s, wave.id, { ...owner, status: "in_progress", jobs: [{ taskId: "guard", status: "completed" }] });
  assert.equal(capacityUsage(s).linux, 2);
  reconcileOwner(s, wave.id, { ...owner, status: "in_progress", jobs: [{ taskId: "guard", requestId: "p1", status: "completed", runAttempt: 1 }] });
  assert.equal(capacityUsage(s).linux, 1);
});

test("explicit infrastructure recovery fences the terminal owner and preserves successful siblings", () => {
  const s = active(), r = enqueue(s, request("p1", [task("good"), task("lost")]));
  const [wave] = admit(s), owner = claim(s, wave);
  completeTask(s, { ...owner, taskId: "good" }, receipt(r, r.tasks[0]));
  reconcileOwner(s, wave.id, { ...owner, status: "completed", now: NOW });
  const authorization = { ...owner, authorized: true, infrastructure: true, reason: "Artifact service failed", status: "completed", now: NOW };
  assert.equal(retryTask(s, r.id, "lost", { ...authorization, authorized: false }).retried, false);
  assert.equal(retryTask(s, r.id, "lost", { ...authorization, status: "in_progress" }).retried, false);
  assert.equal(retryTask(s, r.id, "lost", { ...authorization, runAttempt: 2 }).retried, false);
  assert.equal(retryTask(s, r.id, "lost", authorization).retried, true);
  assert.equal(r.tasks[0].status, "success"); assert.equal(r.resultHistory.lost.length, 1);
  const [retryWave] = admit(s); const newOwner = claim(s, retryWave, "101");
  assert.equal(completeTask(s, { ...owner, taskId: "lost" }, receipt(r, r.tasks[1])).accepted, false);
  assert.equal(completeTask(s, { ...newOwner, taskId: "lost" }, receipt(r, r.tasks[1])).accepted, true);
  assert.equal(requestComplete(s, r.id), true);
});

test("an assertion failure cannot be retried into green as infrastructure", () => {
  const s = active(), r = enqueue(s, request("p1")); const [wave] = admit(s), owner = claim(s, wave);
  completeTask(s, { ...owner, taskId: r.tasks[0].id }, receipt(r, r.tasks[0], { status: "failure", complete: false }));
  const result = retryTask(s, r.id, r.tasks[0].id, { ...owner, status: "completed", authorized: true, infrastructure: true, reason: "try again" });
  assert.equal(result.retried, false); assert.equal(result.reason, "test-failure-not-infrastructure");
  assert.equal(requestComplete(s, r.id), false);
});

test("producer backpressure uses work and age, requires two distinct healthy samples, and enforces eight workers", () => {
  const s = active();
  assert.equal(producerBackpressure(s, { now: NOW, drainMinutes: 31, oldestWaitMinutes: 0 }).allowed, false);
  assert.equal(producerBackpressure(s, { now: NOW + 1, drainMinutes: 14, oldestWaitMinutes: 4 }).paused, true);
  assert.equal(producerBackpressure(s, { now: NOW + 1, drainMinutes: 14, oldestWaitMinutes: 4 }).paused, true, "same observation cannot count twice");
  assert.equal(producerBackpressure(s, { now: NOW + 2, drainMinutes: 14, oldestWaitMinutes: 4 }).allowed, true);
  assert.equal(producerBackpressure(s, { now: NOW + 3, activeWorkers: 8 }).allowed, false);
  assert.equal(producerBackpressure(s, { now: NOW + 4, drainMinutes: 0, oldestWaitMinutes: 11 }).paused, true);
});

test("pressure includes setup and every runner class rather than browser-job counts", () => {
  const s = active(); enqueue(s, request("p1", [task("guard", { kind: "guard", expectedSeconds: 60, setupSeconds: 30 }),
    task("mac", { runner: "macOS-latest", expectedSeconds: 600, setupSeconds: 120 })], { acceptedAt: NOW - 600000 }));
  const metrics = pendingMetrics(s, { now: NOW });
  assert.equal(metrics.seconds.linux, 90); assert.equal(metrics.seconds.macos, 720);
  assert.equal(metrics.drainMinutes, 6); assert.equal(metrics.oldestWaitMinutes, 10);
});

test("experiment FIFO admits all older eligible tasks in a pool before any later experiment, even priority", () => {
  const s = active();
  enqueue(s, request("older", Array.from({ length: 5 }, (_, i) => task(`old-${i}`)), { kind: "experiment", acceptedAt: NOW - 1000 }));
  enqueue(s, request("newer", Array.from({ length: 5 }, (_, i) => task(`new-${i}`)), { kind: "experiment", acceptedAt: NOW, priority: true }));
  const admitted = admit(s, { now: NOW, waveSize: 8 }).flatMap(w => w.tasks);
  assert.deepEqual(admitted.map(entry => entry.requestId), ["older", "older", "older", "older", "older", "newer", "newer", "newer"]);
  assert.equal(s.requests.older.tasks.every(t => t.status === "reserved"), true);
  assert.equal(s.requests.newer.tasks.some(t => t.status === "reserved"), true, "a later experiment overlaps admitted older work; this is not a completion barrier");
});

test("equal-age experiments use request ID order without changing physical runner-start guarantees", () => {
  const s = active();
  enqueue(s, request("z", [task("z-1"), task("z-2")], { kind: "experiment" }));
  enqueue(s, request("a", [task("a-1"), task("a-2")], { kind: "experiment" }));
  assert.deepEqual(admit(s, { now: NOW }).flatMap(w => w.tasks).map(entry => entry.requestId), ["a", "a", "z", "z"]);
});

test("experiment FIFO is independent per runner pool and ignores already running tasks", () => {
  const s = active({ limits: { macos: 0 } });
  enqueue(s, request("old-mac", [task("mac", { runner: "macos-latest" })], { kind: "experiment", acceptedAt: NOW - 2000 }));
  enqueue(s, request("old-linux", [task("linux-old")], { kind: "experiment", acceptedAt: NOW - 1000 }));
  const [running] = admit(s, { now: NOW }); claim(s, running);
  enqueue(s, request("new-linux", [task("linux-new")], { kind: "experiment", acceptedAt: NOW }));
  const entries = admit(s, { now: NOW }).flatMap(w => w.tasks);
  assert.deepEqual(entries.map(entry => entry.requestId), ["new-linux"]);
  assert.equal(s.requests["old-mac"].tasks[0].status, "queued");
  assert.equal(s.requests["old-linux"].tasks[0].status, "running");
});

test("FIFO experiment admission does not displace fair PR turns", () => {
  const s = active();
  enqueue(s, request("exp-old", Array.from({ length: 12 }, (_, i) => task(`old-${i}`)), { kind: "experiment", acceptedAt: NOW - 2000 }));
  enqueue(s, request("exp-new", [task("new")], { kind: "experiment", acceptedAt: NOW - 1000 }));
  enqueue(s, request("p1", Array.from({ length: 4 }, (_, i) => task(`p1-${i}`))));
  enqueue(s, request("p2", Array.from({ length: 4 }, (_, i) => task(`p2-${i}`))));
  const entries = admit(s, { now: NOW, waveSize: 8 }).flatMap(w => w.tasks);
  assert.ok(entries.some(entry => entry.requestId === "p1")); assert.ok(entries.some(entry => entry.requestId === "p2"));
  assert.ok(!entries.some(entry => entry.requestId === "exp-new"));
  assert.ok(Object.values(capacityUsage(s).perPr).every(count => count <= 4));
});
