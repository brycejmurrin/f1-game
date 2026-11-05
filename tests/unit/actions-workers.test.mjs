import test from "node:test";
import assert from "node:assert/strict";
import { newState, enqueue } from "../../tools/ci/actions/state.mjs";
import { planWorkerLaunches, executeWorkerLaunch, reconcileWorkers, verifyWorkerStartup, loadWorkerHostAdapter } from "../../tools/ci/actions/workers.mjs";

const NOW = "2026-11-05T12:00:00Z", SESSION = "session_abcdefghijklmno";
function setup(count = 1) {
  const state = newState({ mode: "active", now: NOW });
  state.workers = { capability: { supported: true } };
  for (let n = 1; n <= count; n++) enqueue(state, { id: `issue:${n}`, kind: "issue", number: n, acceptedAt: NOW, tasks: [] });
  return state;
}
function memoryStore(initial) {
  let state = structuredClone(initial), writes = 0;
  return {
    read: () => ({ state: structuredClone(state) }),
    update(fn) {
      const next = structuredClone(state), result = fn(next);
      if (this.failWrites) throw new Error("API denied write");
      state = next; writes++; return { state: structuredClone(state), result };
    },
    get state() { return state; }, get writes() { return writes; },
  };
}
const fresh = (request) => ({ issue: { number: request.number, state: "open", labels: ["queue:ready"] }, blockers: [] });

test("worker producer admission is pure, capped at eight and excludes batch members, blockers and pauses", () => {
  const state = setup(12);
  state.requests["issue:1"].members = [2, 3];
  state.requests["issue:4"].blockers = ["native:5"];
  state.requests["issue:5"].paused = true;
  const before = structuredClone(state), plan = planWorkerLaunches(state, { now: NOW });
  assert.deepEqual(state, before);
  assert.equal(plan.launches.length, 8);
  assert.ok(plan.launches.every((r) => !["issue:2", "issue:3", "issue:4", "issue:5"].includes(r.requestId)));
  state.controls.workers = true;
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
  state.controls.workers = false; state.producer.paused = true;
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
});

test('unverified legacy PR owners occupy capacity across head changes until host termination', () => {
  const state = setup(1);
  for (let number = 100; number < 108; number++) {
    enqueue(state, { id: `legacy-pr:${number}`, kind: 'pr', number, sourceSha: `${number}`.padStart(40, 'a'), tasks: [],
      owner: { kind: 'legacy-unverified', terminal: false, evidence: { snapshotDigest: 'snapshot' } } });
  }
  assert.equal(planWorkerLaunches(state, { now: NOW }).pressure.activeWorkers, 8);
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
  const copy = structuredClone(state.requests['legacy-pr:100']);
  copy.id = 'refreshed-pr:100'; state.requests[copy.id] = copy;
  assert.equal(planWorkerLaunches(state, { now: NOW }).pressure.activeWorkers, 8, 'one migrated PR owner is not counted once per validation head');
  state.requests['legacy-pr:100'].owner.terminal = true;
  state.requests[copy.id].owner.terminal = true;
  assert.equal(planWorkerLaunches(state, { now: NOW }).launches.length, 1);
});

test("fire happens only after durable reservation and firing ownership; duplicate attempts do not fire", async () => {
  const store = memoryStore(setup()); let calls = 0;
  const fire = async (address) => {
    calls++; assert.equal(address, "ISSUE 1\nLAUNCH issue:1:launch:1"); assert.equal(store.writes, 2);
    assert.equal(store.state.requests["issue:1"].workerLaunch.status, "firing");
    return { status: 200, session: SESSION };
  };
  const result = await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, fire, now: NOW });
  assert.equal(result.status, "accepted"); assert.equal(result.persisted, true);
  assert.equal(store.state.requests["issue:1"].owner.session, SESSION);
  assert.equal((await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, fire, now: NOW })).status, "accepted");
  assert.equal(calls, 1);
});

test("ledger/read errors, native blockers, changed membership and missing ready never fire", async () => {
  for (const read of [undefined, () => { throw new Error("rate limited"); }, () => ({ error: "403" }), () => ({ ...fresh({ number: 1 }), blockers: [2] }), () => ({ issue: { number: 1, state: "open", labels: [] }, blockers: [] })]) {
    const store = memoryStore(setup());
    assert.equal((await executeWorkerLaunch(store, { requestId: "issue:1", read, fire: () => assert.fail("must not fire"), now: NOW })).status, "deferred");
  }
  const state = setup(); state.requests["issue:1"].members = [2, 3];
  assert.equal((await executeWorkerLaunch(memoryStore(state), { requestId: "issue:1", read: fresh, fire: () => assert.fail("must not fire"), now: NOW })).status, "deferred");
  const failed = memoryStore(setup()); failed.failWrites = true;
  assert.equal((await executeWorkerLaunch(failed, { requestId: "issue:1", read: fresh, fire: () => assert.fail("must not fire"), now: NOW })).status, "deferred");
  assert.equal(failed.state.requests["issue:1"].owner, null);
});

test("timeout, transport errors, 5xx and malformed success stay ambiguous and occupy capacity", async () => {
  for (const fire of [async () => { throw new Error("timeout"); }, async () => ({ status: 0 }), async () => ({ status: 503 }), async () => ({ status: 200 })]) {
    const store = memoryStore(setup());
    assert.equal((await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, fire, now: NOW })).status, "ambiguous");
    assert.equal(planWorkerLaunches(store.state, { now: NOW }).pressure.activeWorkers, 1);
    assert.equal((await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, fire: () => assert.fail("ambiguous never retries"), now: NOW })).status, "ambiguous");
  }
});

test("accepted fire with failed result persistence retains firing reservation and never blind retries", async () => {
  const store = memoryStore(setup());
  const result = await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, now: NOW, fire: async () => { store.failWrites = true; return { status: 200, session: SESSION }; } });
  assert.equal(result.status, "ambiguous"); assert.equal(result.persisted, false);
  assert.equal(store.state.requests["issue:1"].workerLaunch.status, "firing");
  store.failWrites = false;
  assert.equal((await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, now: NOW, fire: () => assert.fail("no retry") })).status, "ambiguous");
});

test("explicit refusal releases capacity but requires a fresh authorized recovery intent before retry", async () => {
  const store = memoryStore(setup());
  assert.equal((await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, now: NOW, fire: async () => ({ status: 429 }) })).status, "rejected");
  assert.equal(planWorkerLaunches(store.state, { now: NOW }).pressure.activeWorkers, 0);
  assert.equal(planWorkerLaunches(store.state, { now: NOW }).launches.length, 0);
  store.update((state) => { state.requests["issue:1"].recoverRequested = true; });
  const recovered = await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, now: NOW, fire: async () => ({ status: 200, session: SESSION }) });
  assert.equal(recovered.status, "accepted"); assert.equal(recovered.launchId, "issue:1:launch:2");
});

test("reserved crash is recoverable; consumed firing reservation is not", async () => {
  const state = setup(); state.requests["issue:1"].workerLaunch = { id: "issue:1:launch:1", status: "reserved", attempt: 1 };
  state.requests["issue:1"].owner = { launchId: "issue:1:launch:1", terminal: false };
  const result = await executeWorkerLaunch(memoryStore(state), { requestId: "issue:1", read: fresh, now: NOW, fire: async () => ({ status: 200, session: SESSION }) });
  assert.equal(result.status, "accepted"); assert.equal(result.launchId, "issue:1:launch:1");
});

test("concurrent executors cannot both consume one launch reservation", async () => {
  const store = memoryStore(setup()); let fires = 0;
  const options = { requestId: "issue:1", read: async (request) => fresh(request), now: NOW, fire: async () => { fires++; return { status: 200, session: SESSION }; } };
  const results = await Promise.all([executeWorkerLaunch(store, options), executeWorkerLaunch(store, options)]);
  assert.equal(fires, 1);
  assert.equal(results.filter((r) => r.status === "accepted").length, 1);
});

const proof = (state = "terminated", session = SESSION) => ({ source: "host-api", authenticated: true, evidenceId: "provider-request-id", observedAt: NOW, launchId: "issue:1:launch:1", session, state });
const adapter = (probeSession, findLaunch = async () => null) => ({ capability: { schemaVersion: 1, provider: "claude-code", documentation: "https://platform.claude.com/docs/en/api/claude-code/routines-fire" }, probeSession, findLaunch });
async function acceptedStore() {
  const store = memoryStore(setup());
  await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, now: NOW, fire: async () => ({ status: 200, session: SESSION }) });
  return store;
}

test("missing provider capability disables only producer launches and never invents a session endpoint", async () => {
  const state = setup(); delete state.workers;
  assert.equal(planWorkerLaunches(state, { now: NOW }).launches.length, 0);
  const store = memoryStore(state);
  const reconciled = await reconcileWorkers(store, { adapter: null, now: NOW });
  assert.equal(reconciled.capability.supported, false);
  assert.match(store.state.workers.capability.reason, /sesn_ APIs are not compatible/);
  assert.equal(store.state.controls.validation, false);
  assert.equal(await loadWorkerHostAdapter({ env: { WORKER_HOST_ADAPTER: "../../source/untrusted.mjs" } }), null);
});

test("only authenticated exact-session permanent termination frees worker capacity", async () => {
  const store = await acceptedStore();
  await reconcileWorkers(store, { adapter: adapter(async () => proof("idle")), now: NOW });
  assert.equal(store.state.requests["issue:1"].owner.terminal, false);
  for (const invalid of [{ ...proof(), authenticated: false }, { ...proof(), session: "session_otherabcdefgh" }, { ...proof(), launchId: "wrong" }, { ...proof(), source: "issue-comment" }]) {
    await reconcileWorkers(store, { adapter: adapter(async () => invalid), now: NOW });
    assert.equal(store.state.requests["issue:1"].owner.terminal, false);
  }
  await reconcileWorkers(store, { adapter: adapter(async () => proof()), now: NOW });
  assert.equal(store.state.requests["issue:1"].owner.terminal, true);
  assert.equal(planWorkerLaunches(store.state, { now: NOW }).pressure.activeWorkers, 0);
});

test("old sessions, closed issues, provider 404s and unreadable permissions never imply termination", async () => {
  const store = await acceptedStore();
  store.update(state => { state.requests["issue:1"].closed = true; });
  await reconcileWorkers(store, { adapter: adapter(async () => { throw new Error("HTTP 404"); }), now: "2099-01-01T00:00:00Z" });
  assert.equal(store.state.requests["issue:1"].owner.terminal, false);
});

test("ambiguous fire needs one complete exact host correlation and session proof before binding", async () => {
  const store = memoryStore(setup());
  await executeWorkerLaunch(store, { requestId: "issue:1", read: fresh, now: NOW, fire: async () => ({ status: 0 }) });
  const found = { source: "host-api", authenticated: true, complete: true, launchId: "issue:1:launch:1", sessions: [{ session: SESSION }] };
  await reconcileWorkers(store, { adapter: adapter(async () => proof("running"), async () => ({ ...found, complete: false })), now: NOW });
  assert.equal(store.state.requests["issue:1"].workerLaunch.status, "ambiguous");
  await reconcileWorkers(store, { adapter: adapter(async () => proof("running"), async () => found), now: NOW });
  assert.equal(store.state.requests["issue:1"].workerLaunch.status, "accepted");
  assert.equal(store.state.requests["issue:1"].owner.session, SESSION);
});

test("startup firing race is retryable and native resume occurs once after trusted binding", async () => {
  const store = memoryStore(setup());
  store.update(state => {
    state.requests["issue:1"].workerLaunch = { id: "issue:1:launch:1", status: "firing", firedAt: NOW };
    state.requests["issue:1"].owner = { launchId: "issue:1:launch:1", terminal: false };
  });
  const identity = { requestId: "issue:1", launchId: "issue:1:launch:1", sessionId: SESSION };
  assert.equal(verifyWorkerStartup(store.state, identity).retryable, true);
  let resumes = 0;
  const host = adapter(async () => proof("idle"), async () => ({ source: "host-api", authenticated: true, complete: true, launchId: identity.launchId, sessions: [{ session: SESSION }] }));
  host.resumeStartup = async () => { resumes++; return { source: "host-api", authenticated: true, accepted: true, session: SESSION, launchId: identity.launchId }; };
  await reconcileWorkers(store, { adapter: host, now: NOW });
  assert.equal(verifyWorkerStartup(store.state, identity).ready, true);
  await reconcileWorkers(store, { adapter: host, now: NOW });
  assert.equal(resumes, 1); assert.equal(store.state.requests["issue:1"].workerLaunch.startup.status, "resume-confirmed");
  assert.equal(verifyWorkerStartup(store.state, { ...identity, sessionId: "session_otherabcdefgh" }).ready, false);
});

test("accepted binding can wake an idle startup once, while an ambiguous wake is never blindly repeated", async () => {
  const store = await acceptedStore(); let wakes = 0;
  const host = adapter(async () => proof("idle"));
  host.resumeStartup = async () => { wakes++; throw new Error("native wake response lost"); };
  await reconcileWorkers(store, { adapter: host, now: NOW });
  assert.equal(wakes, 1);
  assert.equal(store.state.requests["issue:1"].workerLaunch.startup.status, "resume-requested");
  await reconcileWorkers(store, { adapter: host, now: NOW });
  assert.equal(wakes, 1);
  assert.equal(store.state.requests["issue:1"].workerLaunch.status, "accepted");
});

test('an unowned batch launches only its parent as one implementation scope', async () => {
  const state = setup(3); state.requests['issue:1'].members = [2, 3];
  const plan = planWorkerLaunches(state, { now: NOW });
  assert.deepEqual(plan.launches.map(r => r.requestId), ['issue:1']);
  const store = memoryStore(state); let fires = 0;
  const result = await executeWorkerLaunch(store, { requestId: 'issue:1', now: NOW,
    read: r => ({ ...fresh(r), members: [2, 3] }), fire: async () => { fires++; return { status: 200, session: SESSION }; } });
  assert.equal(result.status, 'accepted'); assert.equal(fires, 1);
  assert.deepEqual(planWorkerLaunches(store.state, { now: NOW }).launches, []);
});

test('live or unverified child ownership, pause or dependency blocks parent and prevents member fan-out', async () => {
  for (const mutate of [
    member => { member.owner = { session: SESSION, terminal: false }; },
    member => { member.blockers = ['live-ownership-unverified']; },
    member => { member.blockers = ['native:4']; },
    member => { member.paused = true; member.pauseOwner = true; },
  ]) {
    const state = setup(3); state.requests['issue:1'].members = [2, 3]; mutate(state.requests['issue:2']);
    assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
    const result = await executeWorkerLaunch(memoryStore(state), { requestId: 'issue:1', now: NOW,
      read: r => ({ ...fresh(r), members: [2, 3] }), fire: () => assert.fail('must preserve child scope') });
    assert.equal(result.status, 'deferred');
  }
});

test('a child claim acquired between parent reservation and firing prevents fire', async () => {
  const state = setup(2); state.requests['issue:1'].members = [2];
  const store = memoryStore(state), update = store.update;
  let updates = 0;
  store.update = function (fn) {
    if (++updates === 2) update.call(store, live => { live.requests['issue:2'].owner = { session: SESSION, terminal: false }; });
    return update.call(store, fn);
  };
  const result = await executeWorkerLaunch(store, { requestId: 'issue:1', now: NOW,
    read: r => ({ ...fresh(r), members: [2] }), fire: () => assert.fail('late child ownership must prevent firing') });
  assert.equal(result.status, 'deferred'); assert.equal(store.state.requests['issue:1'].workerLaunch.status, 'reserved');
});

test('closed archived batch members need no worker, but unknown members fail closed', () => {
  const state = setup(); state.requests['issue:1'].members = [2];
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
  state.requests['issue:1'].memberStates = { 2: 'closed' };
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches.map(r => r.requestId), ['issue:1']);
});

test('overlapping unowned batch parents cannot fire or fan out a shared child', async () => {
  const state = setup(3); state.requests['issue:1'].members = [3]; state.requests['issue:2'].members = [3];
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
  const store = memoryStore(state);
  for (const requestId of ['issue:1', 'issue:2']) {
    const result = await executeWorkerLaunch(store, { requestId, now: NOW,
      read: r => ({ ...fresh(r), members: [3] }), fire: () => assert.fail('overlapping parent must not fire') });
    assert.equal(result.status, 'deferred');
  }
});

test('existing owner scope survives overlap and another parent cannot acquire the shared member', async () => {
  const state = setup(3); state.requests['issue:1'].members = [3];
  state.requests['issue:1'].owner = { session: SESSION, terminal: false };
  state.requests['issue:2'].members = [3];
  const store = memoryStore(state);
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
  const result = await executeWorkerLaunch(store, { requestId: 'issue:2', now: NOW,
    read: r => ({ ...fresh(r), members: [3] }), fire: () => assert.fail('must not steal owned scope') });
  assert.equal(result.status, 'deferred'); assert.equal(store.state.requests['issue:1'].owner.session, SESSION);
});

test('a competing batch introduced after reservation prevents parent firing', async () => {
  const state = setup(3); state.requests['issue:1'].members = [3]; state.requests['issue:2'].paused = true;
  const store = memoryStore(state), update = store.update; let updates = 0;
  store.update = function(fn) {
    if (++updates === 2) update.call(store, live => { live.requests['issue:2'].members = [3]; });
    return update.call(store, fn);
  };
  const result = await executeWorkerLaunch(store, { requestId: 'issue:1', now: NOW,
    read: r => ({ ...fresh(r), members: [3] }), fire: () => assert.fail('CAS must recheck overlapping scope') });
  assert.equal(result.status, 'deferred'); assert.equal(store.state.requests['issue:1'].workerLaunch.status, 'reserved');
});

test('closing an owned parent does not release its implementation scope before host termination', () => {
  const state = setup(3); state.requests['issue:1'].members = [3]; state.requests['issue:1'].closed = true;
  state.requests['issue:1'].owner = { session: SESSION, terminal: false }; state.requests['issue:2'].members = [3];
  assert.deepEqual(planWorkerLaunches(state, { now: NOW }).launches, []);
});
