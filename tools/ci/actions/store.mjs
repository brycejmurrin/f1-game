// @doc Read and compare-and-swap the GitHub branch ledger with bounded conflict recovery.
import crypto from "node:crypto";
import { clone, newState, validateState, archiveKey, ArchiveLookupRequired, withArchiveContext, ACTIVE_TASK_STATUSES, requestComplete } from "./state.mjs";

const encode = value => `${JSON.stringify(value)}\n`;
const hash = text => crypto.createHash("sha256").update(text).digest("hex");
const bytes = value => Buffer.byteLength(encode(value));
const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
function archiveIO({ request, branch = "bot/actions-state", repo = null, lookups = null }) {
  const prefix = repo ? `/repos/${repo}/` : "";
  const endpoint = path => `${prefix}contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  function read(descriptor, kind) {
    if (!/^[a-f0-9]{64}$/.test(descriptor?.digest || "") || descriptor.path !== `archives/${kind === "index" ? "index" : "pages"}/${descriptor.digest}.json`) throw new Error("Invalid archive descriptor");
    const response = request(`${endpoint(descriptor.path)}?ref=${encodeURIComponent(branch)}`, { method: "GET" });
    if (response?.error || response?.status !== 200) throw new Error(`Archive read failed: ${response?.error || response?.status}`);
    let document = response.json;
    if (document?.encoding === "none" && document.sha) {
      const blob = request(`${prefix}git/blobs/${encodeURIComponent(document.sha)}`, { method: "GET" });
      if (blob?.error || blob?.status !== 200 || blob.json?.sha !== document.sha) throw new Error("Archive blob read failed");
      document = blob.json;
    }
    if (document?.encoding !== "base64" || typeof document.content !== "string" || document.truncated || document.size > MAX_DOCUMENT_BYTES || document.content.length > 96 * 1024 * 1024) throw new Error("Invalid archive document");
    const text = Buffer.from(document.content, "base64").toString("utf8");
    if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) throw new Error("Archive document exceeds safety limit");
    if (hash(text) !== descriptor.digest) throw new Error("Archive digest mismatch");
    const value = JSON.parse(text);
    if (value.schemaVersion !== 1 || value.type !== kind || !value.records || Array.isArray(value.records)) throw new Error("Invalid archive page schema");
    if (lookups) lookups.set(descriptor.digest, clone(value));
    return value;
  }
  function write(value, kind) {
    const text = encode(value), digest = hash(text), descriptor = { digest, path: `archives/${kind === "index" ? "index" : "pages"}/${digest}.json` };
    if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) throw new Error("Archive page exceeds safety limit");
    const response = request(endpoint(descriptor.path), { method: "PUT", body: { branch,
      message: "chore(actions): preserve immutable request history", content: Buffer.from(text).toString("base64") } });
    if (![200, 201, 409, 422].includes(response?.status)) throw new Error(`Archive write failed: ${response?.error || response?.status}`);
    // An existing content-addressed file is accepted only after exact readback.
    read(descriptor, kind);
    return descriptor;
  }
  return { read, write };
}

/** Resolve a durable tombstone through a bounded live manifest. Payload and
 * index pages are immutable, so an unrelated compaction cannot change proof. */
export function readArchivedRequest({ state, request, id, branch = "bot/actions-state", repo = null, lookups = null } = {}) {
  const shard = state.archives?.shards?.[archiveKey(id)];
  if (!shard) return null;
  const io = archiveIO({ request, branch, repo, lookups }), index = io.read(shard, "index");
  if (!Object.hasOwn(index.records, id)) return null;
  const descriptor = index.records[id], page = io.read(descriptor, "page"), record = page.records[id];
  if (!record || record.request?.id !== id || record.request.tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status))) throw new Error("Invalid archived request identity");
  return { ...clone(record), proof: { ...descriptor, epoch: state.archives.epoch, indexDigest: shard.digest } };
}

function eligibleHistory(state, record) {
  if (record.recoverRequested || record.tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status))) return false;
  const landing = state.landing?.requestId === record.id ? state.landing : record.landing;
  if (landing && landing.status !== "rejected" && !(landing.status === "merged" && landing.publication === "dispatched")) return false;
  if (record.kind === "pr") return record.superseded === true;
  if (["experiment", "maintenance"].includes(record.kind)) return record.tasks.length > 0 &&
    (record.tasks.every(task => ["success", "failure", "incomplete", "cancelled"].includes(task.status)) || Object.values(record.results).some(result => result.status !== "success"));
  if (record.kind === "release") {
    const newest = Object.values(state.requests).filter(other => other.kind === "release").sort((a, b) => Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt))[0];
    return newest?.id !== record.id && (record.superseded || requestComplete(state, record.id) || Object.values(record.results).some(result => result.status !== "success"));
  }
  return false;
}

/** Archive at most two inactive requests. Write/read failures and CAS races
 * leave live records intact; orphan immutable pages are safe and reusable. */
export function compactHistory({ store, request, maxArchives = 2, thresholdBytes = 4 * 1024 * 1024, now = Date.now() } = {}) {
  if (!store || typeof request !== "function" || !Number.isInteger(maxArchives) || maxArchives < 1 || maxArchives > 2 || !Number.isFinite(thresholdBytes) || thresholdBytes < 0) throw new Error("Invalid history compaction bounds");
  const snapshot = store.read().state, before = bytes(snapshot);
  if (before < thresholdBytes) return { archived: [], bytesBefore: before, bytesAfter: before };
  const records = Object.values(snapshot.requests).filter(record => eligibleHistory(snapshot, record))
    .sort((a, b) => Date.parse(a.acceptedAt) - Date.parse(b.acceptedAt) || a.id.localeCompare(b.id)).slice(0, maxArchives);
  if (!records.length) return { archived: [], bytesBefore: before, bytesAfter: before };
  const io = archiveIO({ request, branch: store.branch, repo: store.repo }), contents = {};
  for (const record of records) {
    const ids = new Set([...record.tasks.map(task => task.waveId), ...Object.values(record.results).map(result => result.waveId)].filter(Boolean));
    contents[record.id] = { request: clone(record), waves: Object.fromEntries([...ids].filter(id => snapshot.waves[id]).map(id => [id, clone(snapshot.waves[id])])) };
  }
  const page = io.write({ schemaVersion: 1, type: "page", archivedAt: new Date(now).toISOString(), records: contents }, "page");
  const shards = clone(snapshot.archives?.shards || {});
  for (const key of new Set(records.map(record => archiveKey(record.id)))) {
    const index = shards[key] ? io.read(shards[key], "index") : { schemaVersion: 1, type: "index", records: {} };
    for (const record of records.filter(record => archiveKey(record.id) === key)) index.records[record.id] = page;
    shards[key] = { ...io.write(index, "index"), count: Object.keys(index.records).length };
  }
  const epoch = snapshot.archives?.epoch || 0;
  try {
    const saved = store.update(state => {
      if ((state.archives?.epoch || 0) !== epoch || hash(encode(state.archives?.shards || {})) !== hash(encode(snapshot.archives?.shards || {})) || records.some(record => !state.requests[record.id] ||
        hash(encode(state.requests[record.id])) !== hash(encode(record)) || !eligibleHistory(state, state.requests[record.id]))) throw new Error("Archive snapshot changed before removal");
      state.archives = { version: 1, epoch: epoch + 1, shards };
      for (const record of records) {
        if (state.landing?.requestId === record.id) delete state.landing;
        delete state.requests[record.id];
      }
      const referenced = new Set(Object.values(state.requests).flatMap(record => [...record.tasks.map(task => task.waveId), ...Object.values(record.results).map(result => result.waveId)]).filter(Boolean));
      for (const [id, wave] of Object.entries(state.waves)) if (!referenced.has(id) && wave.status === "completed" && !wave.tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status))) delete state.waves[id];
      return { archived: records.map(record => record.id), bytesBefore: before, bytesAfter: bytes(state), epoch: epoch + 1 };
    });
    return saved.result;
  } catch (error) {
    if (/Archive snapshot changed/.test(error.message)) return { archived: [], bytesBefore: before, bytesAfter: bytes(store.read().state), deferred: true };
    throw error;
  }
}

/** A missing document is an explicit bootstrap case; authentication/rate-limit
 * failures and malformed state are never converted into an empty queue. */
export function createStore({ request, repo = null, branch = "bot/actions-state", path = "state.json", retries = 3,
  initialState = () => newState(), message = "chore(actions): update durable coordinator state" } = {}) {
  if (typeof request !== "function") throw new Error("A synchronous GitHub request adapter is required");
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new Error("Invalid CAS retry limit");
  const prefix = repo ? `/repos/${repo}/` : "";
  const documentPath = `${prefix}contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  function call(endpoint, options) {
    const response = request(endpoint, options);
    if (response && typeof response.then === "function") throw new Error("Store adapter must be synchronous");
    if (!response || !Number.isInteger(response.status)) throw new Error("GitHub adapter returned no HTTP status");
    return response;
  }
  function error(response, operation) {
    const e = new Error(`${operation}: ${response.error || response.json?.message || `HTTP ${response.status}`}`);
    e.status = response.status; return e;
  }
  function read() {
    const response = call(`${documentPath}?ref=${encodeURIComponent(branch)}`, { method: "GET", storeRead: true, bypassCooldown: true });
    if (response.status === 404) return { state: initialState(), sha: null, missing: true };
    if (response.error || response.status < 200 || response.status >= 300) throw error(response, "Read Actions state");
    let document = response.json;
    if (!document || !document.sha) throw new Error("Malformed Actions state document");
    const sha = document.sha;
    // Contents omits base64 content for files above 1 MB. The same blob SHA
    // remains the CAS identity; fetch that immutable blob instead of starting
    // with an empty ledger when accumulated plans/receipts cross the threshold.
    if (document.encoding === "none") {
      const blob = call(`${prefix}git/blobs/${encodeURIComponent(sha)}`, { method: "GET", storeRead: true, bypassCooldown: true });
      if (blob.error || blob.status < 200 || blob.status >= 300) throw error(blob, "Read Actions state blob");
      document = blob.json;
      if (document?.sha !== sha) throw new Error("Actions state blob identity changed");
    }
    if (document.encoding !== "base64" || typeof document.content !== "string" || document.truncated ||
      document.size > MAX_DOCUMENT_BYTES || document.content.length > 96 * 1024 * 1024) throw new Error("Malformed or oversized Actions state document");
    let state;
    try {
      const decoded = Buffer.from(document.content, "base64");
      if (decoded.length > MAX_DOCUMENT_BYTES) throw new Error("oversized");
      state = JSON.parse(decoded.toString("utf8"));
    }
    catch { throw new Error("Actions state is not valid JSON"); }
    validateState(state);
    return { state, sha, missing: false };
  }
  function write(state, expectedSha) {
    validateState(state);
    if (bytes(state) > MAX_DOCUMENT_BYTES) throw new Error("Actions state exceeds safety limit; compact history before admission");
    const body = { branch, message, content: Buffer.from(encode(state)).toString("base64") };
    if (expectedSha) body.sha = expectedSha;
    const response = call(documentPath, { method: "PUT", body });
    if (response.error || response.status < 200 || response.status >= 300) {
      const e = error(response, "Write Actions state");
      // 409 is a concurrent update; 422 can be a competing create but must not
      // retry arbitrary invalid requests. Confirm a changed SHA in update().
      e.conflict = response.status === 409 || response.status === 422;
      throw e;
    }
    const sha = response.json?.content?.sha;
    if (!sha) throw new Error("Actions state write returned no content SHA; reconcile before dispatch");
    return { state, sha };
  }
  function update(mutator) {
    if (typeof mutator !== "function") throw new Error("State update needs a mutator");
    let snapshot = read();
    const archives = new Map(), io = archiveIO({ request, branch, repo }); let lookups = 0;
    for (let attempt = 0; ; attempt++) {
      let state, result;
      for (;;) {
        state = clone(snapshot.state);
        try { result = withArchiveContext(archives, () => mutator(state)); break; }
        catch (error) {
          if (!(error instanceof ArchiveLookupRequired)) throw error;
          if (++lookups > 128) throw new Error("Archive lookup budget exceeded");
          archives.set(error.descriptor.digest, io.read(error.descriptor, error.kind));
        }
      }
      if (result && typeof result.then === "function") throw new Error("State mutator must be synchronous and side-effect free");
      try { return { ...write(state, snapshot.sha), result, attempts: attempt + 1 }; }
      catch (e) {
        if (!e.conflict || attempt >= retries) throw e;
        const latest = read();
        if (latest.sha === snapshot.sha) throw e;
        snapshot = latest;
      }
    }
  }
  /** Explicit bootstrap only: caller supplies a previously verified protected
   * branch commit. Existing branches are read, never reset or force-updated. */
  function initialize({ baseSha, state = initialState() } = {}) {
    if (!baseSha) throw new Error("Bootstrap requires a verified base commit SHA");
    const ref = call(`${prefix}git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`, { method: "GET" });
    if (ref.status === 404) {
      const created = call(`${prefix}git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: baseSha } });
      if (created.error || created.status < 200 || created.status >= 300) {
        if (created.status !== 422) throw error(created, "Create Actions state branch");
        const raced = call(`${prefix}git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`, { method: "GET" });
        if (raced.error || raced.status !== 200) throw error(created, "Create Actions state branch");
      }
    } else if (ref.error || ref.status !== 200) throw error(ref, "Read Actions state branch");
    const snapshot = read();
    return snapshot.missing ? write(state, null) : snapshot;
  }
  return { read, write, update, initialize, branch, path, repo };
}
