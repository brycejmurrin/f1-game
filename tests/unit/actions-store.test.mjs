import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, compactHistory, readArchivedRequest } from "../../tools/ci/actions/store.mjs";
import { newState, enqueue, claimWave, completeTask, reconcileOwner, capacityUsage, archiveKey } from "../../tools/ci/actions/state.mjs";
import { admit } from "../../tools/ci/actions/scheduler.mjs";
import { prepareRequest, ingest, POLICY_VERSION } from "../../tools/ci/actions/controller.mjs";

const state = () => newState({ mode: "active", now: 0 });
const req = (id) => ({ id, kind: "experiment", sourceSha: "head", treeSha: "tree", baseSha: "base", acceptedAt: 0,
  tasks: [{ id: `${id}-task`, runner: "ubuntu-latest", kind: "guard", expectedSeconds: 10, setupSeconds: 0 }] });
function fake(initial = state()) {
  let current = initial, revision = initial ? 1 : 0;
  const calls = [];
  const api = (path, options) => {
    calls.push({ path, ...options });
    if (options.method === "GET") return current ? { status: 200, json: { sha: `sha${revision}`, encoding: "base64", content: Buffer.from(JSON.stringify(current)).toString("base64") } } : { status: 404 };
    if (options.method === "PUT") {
      const wanted = current ? `sha${revision}` : undefined;
      if (options.body.sha !== wanted) return { status: 409, json: { message: "sha does not match" } };
      current = JSON.parse(Buffer.from(options.body.content, "base64").toString("utf8")); revision++;
      return { status: wanted ? 200 : 201, json: { content: { sha: `sha${revision}` } } };
    }
    throw new Error("Unexpected method");
  };
  return { api, calls, get current() { return current; }, replace(next) { current = next; revision++; } };
}

test("state round trips with expected content SHA on a non-default branch", () => {
  const f = fake(), store = createStore({ request: f.api });
  const read = store.read(); assert.equal(read.sha, "sha1");
  const result = store.update((s) => enqueue(s, req("one")));
  assert.equal(result.state.requests.one.id, "one"); assert.equal(result.result.id, "one");
  const put = f.calls.find((c) => c.method === "PUT");
  assert.equal(put.body.branch, "bot/actions-state"); assert.equal(put.body.sha, "sha1");
  assert.match(f.calls[0].path, /ref=bot%2Factions-state/);
  assert.equal(result.sha, "sha2");
});

test("a racing reservation retries against the winner without losing unrelated state or double-admitting", () => {
  const initial = state(); enqueue(initial, req("one")); const f = fake(initial);
  let raced = false;
  const store = createStore({ request(path, options) {
    if (options.method === "PUT" && !raced) {
      raced = true; const winner = structuredClone(f.current);
      enqueue(winner, req("two")); admit(winner); f.replace(winner);
    }
    return f.api(path, options);
  } });
  const result = store.update((s) => admit(s));
  assert.equal(result.attempts, 2); assert.equal(Object.keys(result.state.requests).length, 2);
  assert.equal(Object.keys(result.state.waves).length, 1);
  assert.deepEqual(result.result, [], "both tasks already reserved by the winning writer");
});

test("a winning trusted claim cannot be revoked by a racing pending-release coalesce", () => {
  const initial = state(); enqueue(initial, { ...req("old-release"), kind: "release", acceptedAt: 0 });
  const [wave] = admit(initial), f = fake(initial); let raced = false;
  const store = createStore({ request(path, options) {
    if (options.method === "PUT" && !raced) {
      raced = true; const winner = structuredClone(f.current);
      assert.equal(claimWave(winner, wave.id, { runId: "owner", runAttempt: 1, now: 0 }).claimed, true);
      f.replace(winner);
    }
    return f.api(path, options);
  } });
  const result = store.update(s => enqueue(s, { ...req("latest-release"), kind: "release", acceptedAt: 1000 }));
  assert.equal(result.attempts, 2); assert.equal(result.state.requests["old-release"].superseded, false);
  assert.equal(result.state.waves[wave.id].owner.runId, "owner"); assert.equal(capacityUsage(result.state).linux, 1);
  assert.equal(result.state.requests["latest-release"].tasks[0].status, "queued");
});

test("a competing document creation is retried only when the stored SHA changed", () => {
  const f = fake(null); let raced = false;
  const store = createStore({ request(path, options) {
    if (options.method === "PUT" && !raced) { raced = true; const other = state(); enqueue(other, req("other")); f.replace(other); return { status: 422 }; }
    return f.api(path, options);
  } });
  const result = store.update((s) => enqueue(s, req("ours")));
  assert.equal(result.attempts, 2); assert.deepEqual(Object.keys(result.state.requests).sort(), ["other", "ours"]);
});

test("unchanged-SHA 422 and API exhaustion fail closed rather than looping", () => {
  for (const status of [403, 429, 500, 422]) {
    const f = fake(); let puts = 0;
    const store = createStore({ request(path, options) {
      if (options.method === "PUT") { puts++; return { status, error: `HTTP ${status}` }; }
      return f.api(path, options);
    } });
    assert.throws(() => store.update((s) => enqueue(s, req("one"))), new RegExp(`HTTP ${status}`));
    assert.equal(puts, 1); assert.equal(Object.keys(f.current.requests).length, 0);
  }
});

test("read failures and malformed state never become an empty active queue", () => {
  for (const status of [401, 403, 429, 500]) assert.throws(() => createStore({ request: () => ({ status }) }).read(), new RegExp(`HTTP ${status}`));
  assert.throws(() => createStore({ request: () => ({ status: 200, json: { sha: "sha", encoding: "base64", content: Buffer.from("not json").toString("base64") } }) }).read(), /valid JSON/);
  assert.throws(() => createStore({ request: () => ({ status: 200, json: { sha: "sha", encoding: "base64", content: Buffer.from('{"schemaVersion":99}').toString("base64") } }) }).read(), /schema/);
  const missing = createStore({ request: () => ({ status: 404 }) }).read();
  assert.equal(missing.missing, true); assert.equal(missing.state.mode, "shadow");
});

test("orphan reservations and false success rows are rejected before they can free or reuse capacity", () => {
  for (const status of ["reserved", "success"]) {
    const initial = state(); enqueue(initial, req("one")); initial.requests.one.tasks[0].status = status;
    const f = fake(initial);
    assert.throws(() => createStore({ request: f.api }).read(), /Orphan task|Success missing evidence/);
  }
});

test("large ledgers use an immutable blob fetch without changing the expected content SHA", () => {
  const initial = state(), calls = [];
  const store = createStore({ request(path, options) {
    calls.push({ path, ...options });
    return path.startsWith("contents/") ? { status: 200, json: { encoding: "none", sha: "large-blob" } } :
      { status: 200, json: { sha: "large-blob", encoding: "base64", content: Buffer.from(JSON.stringify(initial)).toString("base64") } };
  } });
  const read = store.read(); assert.equal(read.sha, "large-blob"); assert.equal(read.state.schemaVersion, 1);
  assert.equal(calls[1].path, "git/blobs/large-blob");
});

test("CAS retries are bounded under persistent contention", () => {
  const f = fake(); let puts = 0;
  const store = createStore({ retries: 2, request(path, options) {
    if (options.method === "PUT") { puts++; f.replace(structuredClone(f.current)); return { status: 409 }; }
    return f.api(path, options);
  } });
  assert.throws(() => store.update((s) => enqueue(s, req("one"))), /HTTP 409/);
  assert.equal(puts, 3);
});

test("async adapters and mutators are rejected before remote writes", () => {
  assert.throws(() => createStore({ request: async () => ({ status: 200 }) }).read(), /synchronous/);
  const f = fake(); assert.throws(() => createStore({ request: f.api }).update(async () => {}), /synchronous/);
  assert.equal(f.calls.filter((c) => c.method === "PUT").length, 0);
});

test("ambiguous accepted writes with missing response SHA cannot authorize dispatch", () => {
  const f = fake(); const store = createStore({ request(path, options) {
    const response = f.api(path, options);
    return options.method === "PUT" ? { status: 200, json: {} } : response;
  } });
  assert.throws(() => store.update((s) => admit(s)), /reconcile before dispatch/);
});

test("explicit initialization creates a missing state branch without forcing an existing ref", () => {
  const f = fake(null), calls = []; let branchExists = false;
  const store = createStore({ request(path, options) {
    calls.push({ path, ...options });
    if (path.startsWith("git/ref/")) return { status: branchExists ? 200 : 404, json: { object: { sha: "base" } } };
    if (path === "git/refs") { branchExists = true; return { status: 201 }; }
    return f.api(path, options);
  } });
  assert.throws(() => store.initialize(), /verified base/);
  assert.equal(store.initialize({ baseSha: "verified-base" }).state.mode, "shadow");
  const creation = calls.find((c) => c.method === "POST");
  assert.deepEqual(creation.body, { ref: "refs/heads/bot/actions-state", sha: "verified-base" });
  store.initialize({ baseSha: "some-new-base" });
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
});

function archiveFake(initial) {
  let sequence = 0;
  const files = new Map(), calls = [];
  function put(path, text) { files.set(path, { sha: `file-${++sequence}`, text }); }
  put('state.json', `${JSON.stringify(initial)}\n`);
  const f = { files, calls, hook: null, replace(next) { put('state.json', `${JSON.stringify(next)}\n`); },
    get current() { return JSON.parse(files.get('state.json').text); } };
  f.api = (endpoint, options = {}) => {
    const path = decodeURIComponent(endpoint.split('?')[0].replace(/^contents\//, ''));
    calls.push({ path, ...options });
    const intercepted = f.hook?.(path, options); if (intercepted) return intercepted;
    const current = files.get(path);
    if (options.method === 'GET') return current ? { status: 200, json: { sha: current.sha, encoding: 'base64', content: Buffer.from(current.text).toString('base64') } } : { status: 404 };
    if (options.method === 'PUT') {
      if (current && options.body.sha !== current.sha || !current && options.body.sha) return { status: 409 };
      put(path, Buffer.from(options.body.content, 'base64').toString('utf8'));
      return { status: current ? 200 : 201, json: { content: { sha: files.get(path).sha } } };
    }
    throw new Error('Unexpected archive API method');
  };
  return f;
}
function terminalExperiment(id = 'old') {
  const s = state(), r = enqueue(s, req(id)), [wave] = admit(s);
  claimWave(s, wave.id, { runId: '123', runAttempt: 1, now: 0 });
  completeTask(s, { waveId: wave.id, runId: '123', runAttempt: 1, taskId: r.tasks[0].id },
    { status: 'failure', complete: false, sourceSha: r.sourceSha, baseSha: r.baseSha, treeSha: r.treeSha, taskId: r.tasks[0].id, exitCode: 1 });
  r.plan = { retainedFailureEvidence: 'assertion failed', padding: 'history'.repeat(1000) };
  return s;
}

test('compaction verifies immutable pages before removing history and replays archived experiments without relaunching', () => {
  const initial = terminalExperiment(), original = structuredClone(initial.requests.old), f = archiveFake(initial), store = createStore({ request: f.api });
  const compacted = compactHistory({ store, request: f.api, thresholdBytes: 0, now: 1000 });
  assert.deepEqual(compacted.archived, ['old']); assert.ok(compacted.bytesAfter < compacted.bytesBefore);
  assert.equal(f.current.requests.old, undefined); assert.equal(Object.keys(f.current.archives.shards).length, 1);
  const archived = readArchivedRequest({ state: f.current, request: f.api, id: 'old' });
  assert.deepEqual(archived.request, original); assert.equal(archived.waves['wave-1'].owner.runId, '123');
  const replay = store.update(s => enqueue(s, req('old')));
  assert.equal(replay.state.requests.old.tasks[0].status, 'failure');
  assert.deepEqual(replay.state.requests.old.results, original.results);
  assert.equal(replay.state.requests.old.acceptedAt, original.acceptedAt);
  assert.deepEqual(admit(replay.state), [], 'a tombstoned experiment never starts the same work again');
  const writes = f.calls.filter(call => call.method === 'PUT');
  assert.ok(writes.findIndex(call => call.path === 'state.json') > writes.findIndex(call => call.path.startsWith('archives/index/')));
});

test('verified negative archive lookup permits new IDs in an occupied index shard', () => {
  const f = archiveFake(terminalExperiment()), store = createStore({ request: f.api });
  compactHistory({ store, request: f.api, thresholdBytes: 0 });
  let id; for (let i = 0; i < 10000; i++) if (archiveKey(`new-${i}`) === archiveKey('old')) { id = `new-${i}`; break; }
  assert.ok(id);
  const saved = store.update(s => enqueue(s, req(id)));
  assert.equal(saved.state.requests[id].tasks[0].status, 'queued'); assert.equal(saved.state.requests.old, undefined);
});

test('the pure planning prepass carries verified negative archive proof without persisting runtime lookup data', async () => {
  const f = archiveFake(terminalExperiment()), store = createStore({ request: f.api });
  compactHistory({ store, request: f.api, thresholdBytes: 0 });
  const head = '1'.repeat(40), base = '2'.repeat(40);
  const requestId = number => `pr:${number}:${head}:${base}:${POLICY_VERSION}:ready:blocked`;
  let number; for (let i = 1; i < 10000; i++) if (archiveKey(requestId(i)) === archiveKey('old')) { number = i; break; }
  assert.ok(number);
  const issue = { number, state: 'open', pull_request: {}, labels: [] };
  const pr = { number, state: 'open', draft: false, mergeable: false, head: { sha: head }, base: { sha: base } };
  const context = { eventName: 'pull_request_target', issue, pr, events: [], now: new Date(1000).toISOString(),
    payload: { action: 'opened', pull_request: pr, sender: { login: 'person' } } };
  const current = f.current;
  const prepared = await prepareRequest(context, current, { readBase: () => base, request: f.api });
  assert.equal(JSON.stringify(prepared).includes('__archiveLookups'), false);
  const preview = ingest(current, context, prepared);
  assert.equal(preview.requests[requestId(number)].kind, 'pr');
  assert.equal(JSON.stringify(preview).includes('__archiveLookups'), false);
});

test('corrupted archived evidence fails closed and cannot make a replay start new work', () => {
  const f = archiveFake(terminalExperiment()), store = createStore({ request: f.api });
  compactHistory({ store, request: f.api, thresholdBytes: 0 });
  const page = [...f.files.keys()].find(path => path.startsWith('archives/pages/'));
  f.files.get(page).text = '{"schemaVersion":1,"type":"page","records":{}}\n';
  assert.throws(() => readArchivedRequest({ state: f.current, request: f.api, id: 'old' }), /digest mismatch/);
  assert.throws(() => store.update(s => enqueue(s, req('old'))), /digest mismatch/);
  assert.equal(f.current.requests.old, undefined);
});

test('archive write, readback and hash verification failures leave live history intact', () => {
  for (const failure of ['write', 'read', 'corrupt']) {
    const initial = terminalExperiment(), f = archiveFake(initial), store = createStore({ request: f.api });
    f.hook = (path, options) => {
      if (!path.startsWith('archives/')) return null;
      if (failure === 'write' && options.method === 'PUT') return { status: 403, error: 'HTTP 403' };
      if (failure === 'read' && options.method === 'GET') return { status: 500 };
      if (failure === 'corrupt' && options.method === 'GET') return { status: 200, json: { encoding: 'base64', content: Buffer.from('{}').toString('base64') } };
      return null;
    };
    assert.throws(() => compactHistory({ store, request: f.api, thresholdBytes: 0 }), /Archive/);
    assert.deepEqual(f.current.requests.old, initial.requests.old); assert.equal(f.current.archives, undefined);
  }
});

test('a CAS conflict with changed request or archive epoch cannot remove newly live evidence', () => {
  for (const race of ['request', 'epoch']) {
    const f = archiveFake(terminalExperiment()), store = createStore({ request: f.api }); let raced = false;
    f.hook = (path, options) => {
      if (path === 'state.json' && options.method === 'PUT' && !raced) {
        raced = true; const winner = f.current;
        if (race === 'request') winner.requests.old.recoverRequested = true;
        else winner.archives = { version: 1, epoch: 1, shards: {} };
        f.replace(winner);
      }
      return null;
    };
    const result = compactHistory({ store, request: f.api, thresholdBytes: 0 });
    assert.deepEqual(result.archived, []); assert.equal(result.deferred, true); assert.ok(f.current.requests.old);
  }
});

test('restoring an archived PR preserves age and evidence while reopening its current scope', () => {
  const initial = state(), old = { ...req('old-pr'), kind: 'pr', number: 9, headSha: 'old-head', sourceSha: 'old-source' };
  enqueue(initial, old); initial.requests['old-pr'].closed = true; initial.requests['old-pr'].pauseOwner = true;
  enqueue(initial, { ...req('new-pr'), kind: 'pr', number: 9, headSha: 'new-head', sourceSha: 'new-source', acceptedAt: 1000 });
  const original = structuredClone(initial.requests['old-pr']), f = archiveFake(initial), store = createStore({ request: f.api });
  compactHistory({ store, request: f.api, thresholdBytes: 0 });
  const restored = store.update(s => enqueue(s, { ...original, closed: false, paused: false, pauseOwner: false, superseded: false, sourceObservedAt: new Date(2000).toISOString() }));
  assert.equal(restored.state.requests['old-pr'].closed, false); assert.equal(restored.state.requests['old-pr'].superseded, false);
  assert.equal(restored.state.requests['old-pr'].acceptedAt, original.acceptedAt); assert.equal(restored.state.requests['old-pr'].pauseOwner, false);
  assert.equal(restored.state.requests['new-pr'].superseded, true);
});

test('active executor tasks, current PRs and pending landing publication are retained', () => {
  const initial = state(), old = enqueue(initial, { ...req('old'), tasks: [...req('old').tasks,
    { id: 'old-live', runner: 'ubuntu-latest', kind: 'guard', expectedSeconds: 10, setupSeconds: 0 }] });
  const [wave] = admit(initial); claimWave(initial, wave.id, { runId: '123', runAttempt: 1, now: 0 });
  completeTask(initial, { waveId: wave.id, runId: '123', runAttempt: 1, taskId: old.tasks[0].id },
    { status: 'failure', complete: false, sourceSha: old.sourceSha, baseSha: old.baseSha, treeSha: old.treeSha, exitCode: 1 });
  enqueue(initial, { ...req('current-pr'), kind: 'pr', number: 9 });
  const f = archiveFake(initial), store = createStore({ request: f.api });
  assert.deepEqual(compactHistory({ store, request: f.api, thresholdBytes: 0 }).archived, []);
  const next = f.current;
  reconcileOwner(next, wave.id, { runId: '123', runAttempt: 1, status: 'completed', now: 1000 });
  next.requests.old.landing = { status: 'merged', publication: 'pending' }; next.landing = { requestId: 'old', ...next.requests.old.landing }; f.replace(next);
  assert.deepEqual(compactHistory({ store, request: f.api, thresholdBytes: 0 }).archived, []);
  const ready = f.current; ready.landing.publication = 'dispatched'; ready.requests.old.landing.publication = 'dispatched'; f.replace(ready);
  assert.deepEqual(compactHistory({ store, request: f.api, thresholdBytes: 0 }).archived, ['old']); assert.equal(f.current.landing, undefined);
});

test('coalesced terminal release intent archives safely while the newest pending release remains live', () => {
  const initial = state();
  enqueue(initial, { ...req('release-old'), kind: 'release', acceptedAt: 0 });
  enqueue(initial, { ...req('release-latest'), kind: 'release', acceptedAt: 1000 });
  const f = archiveFake(initial), store = createStore({ request: f.api });
  assert.deepEqual(compactHistory({ store, request: f.api, thresholdBytes: 0 }).archived, ['release-old']);
  assert.ok(f.current.requests['release-latest']);
  const replay = store.update(s => enqueue(s, { ...req('release-old'), kind: 'release', acceptedAt: 0 }));
  assert.equal(replay.state.requests['release-old'].superseded, true);
});
