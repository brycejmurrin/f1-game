// @doc Export every legacy label attachment and import only PR test/merge queue controls.
/** Label reset: pure planning and injected, checkpointed transport. Never mutates on export or plan. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const MIGRATION_SCHEMA = 1;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const snapshotDigest = snapshot => createHash('sha256').update(JSON.stringify(canonical(Object.fromEntries(Object.entries(snapshot).filter(([k]) => k !== 'digest'))))).digest('hex');
const names = item => (item.labels || []).map(l => typeof l === 'string' ? l : l.name);
const ok = response => response && !response.error && response.status >= 200 && response.status < 300;
async function read(request, path) {
  const response = await request(path, { method: 'GET' });
  if (!ok(response)) throw new Error(`Snapshot incomplete: GET ${path}: ${response?.status || response?.error || 'no response'}`);
  return response.json;
}
async function pages(request, path) {
  const all = [];
  for (let page = 1; ; page++) {
    const rows = await read(request, `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error(`Expected complete array at ${path}`);
    all.push(...rows);
    if (rows.length < 100) return all;
  }
}

/** Capture every label and attachment, including closed issues/PRs; active controls retain provenance. */
export async function exportSnapshot({ request, repo = 'brycejmurrin/f1-game', now = new Date().toISOString(), expectedCounts } = {}) {
  if (typeof request !== 'function') throw new Error('request adapter required');
  const labels = await pages(request, 'labels');
  const items = await pages(request, 'issues?state=all&sort=created&direction=asc');
  if (new Set(labels.map(l => l.name)).size !== labels.length || new Set(items.map(i => i.number)).size !== items.length) throw new Error('Duplicate pagination entries; snapshot cannot be complete');
  for (const item of items.filter(i => (i.state === 'open' && i.pull_request) || i.number === 3899)) {
    item.controlEvents = await pages(request, `issues/${item.number}/events`);
    item.controlComments = await pages(request, `issues/${item.number}/comments`);
    if (item.pull_request) item.pullRequest = await read(request, `pulls/${item.number}`);

  }
  const snapshot = { schema: MIGRATION_SCHEMA, repo, capturedAt: now, complete: true, labels, items, expectedCounts };
  // Avoid undefined fields in the digest: persisted JSON and in-memory exports must have identical identity.
  const serializable = JSON.parse(JSON.stringify(snapshot));
  serializable.digest = snapshotDigest(serializable);
  validateSnapshot(serializable);
  return serializable;
}

/** Full read-only refresh before any delete; a stale export must be redone, not silently accepted. */
export async function verifySnapshotCurrent({ request, snapshot } = {}) {
  validateSnapshot(snapshot);
  const current = await exportSnapshot({ request, repo: snapshot.repo });
  const normalize = source => ({
    repo: source.repo,
    labels: [...source.labels].sort((a, b) => a.name.localeCompare(b.name)),
    items: source.items.map(item => ({
      number: item.number, state: item.state, body: item.body || '', title: item.title || '',
      labels: names(item).sort(), assignees: (item.assignees || []).map(a => a.login).sort(),
      controlEvents: [...(item.controlEvents || [])].sort((a, b) => (a.id || 0) - (b.id || 0)),
      controlComments: [...(item.controlComments || [])].sort((a, b) => (a.id || 0) - (b.id || 0)),
      pullRequest: item.pull_request ? { head: item.pullRequest?.head?.sha || null, base: item.pullRequest?.base?.sha || null, draft: item.pullRequest?.draft ?? null } : null,
    })).sort((a, b) => a.number - b.number),
  });
  if (JSON.stringify(canonical(normalize(snapshot))) !== JSON.stringify(canonical(normalize(current)))) throw new Error('Snapshot stale: labels, attachments, active PR controls or source metadata changed; export again before deletion');
  return { verified: true, snapshotDigest: snapshot.digest, checkedAt: current.capturedAt, currentDigest: current.digest };
}

export function importSnapshot(input) {
  const snapshot = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
  validateSnapshot(snapshot);
  return snapshot;
}

function validateSnapshot(snapshot) {
  if (snapshot.schema !== MIGRATION_SCHEMA || !snapshot.complete || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.labels)) throw new Error('Complete versioned snapshot required');
  if (snapshot.digest !== snapshotDigest(snapshot)) throw new Error('Snapshot digest mismatch');
  if (new Set(snapshot.labels.map(l => l.name)).size !== snapshot.labels.length || new Set(snapshot.items.map(i => i.number)).size !== snapshot.items.length) throw new Error('Duplicate snapshot entries');
  const defined = new Set(snapshot.labels.map(l => l.name));
  for (const item of snapshot.items) for (const label of names(item)) if (!defined.has(label)) throw new Error(`Unknown attached label ${label}`);
}

/** Import only PR queue/control intent. Legacy implementation metadata stays solely in the backup. */
export function planMigration(snapshot, { labels = JSON.parse(readFileSync(new URL('../../../.github/labels.json', import.meta.url), 'utf8')), expectedCounts = snapshot.expectedCounts, owner = snapshot.repo.split('/')[0] } = {}) {
  validateSnapshot(snapshot);
  const required = ['queue:paused', 'queue:priority'];
  if (labels.length !== 2 || required.some(name => !labels.some(label => label.name === name))) throw new Error('Policy must define exactly the two PR queue labels');
  const controls = { validation: false, merges: false }, controlProvenance = {};
  const controlIssue = snapshot.items.find(item => item.number === 3899);
  const mergeEvents = (controlIssue?.controlEvents || []).filter(event => ['labeled', 'unlabeled'].includes(event.event) && event.label?.name === 'dispatch:merge-pause');
  let mergePause = names(controlIssue || {}).includes('dispatch:merge-pause');
  for (const event of mergeEvents) {
    if (event.event === 'labeled') mergePause = true;
    else if (event.actor?.login === owner && Object.hasOwn(event, 'performed_via_github_app') && event.performed_via_github_app === null) mergePause = false;
  }
  controls.merges = mergePause;
  if (mergePause) controlProvenance.merges = { source: 'legacy-label', issue: 3899, label: 'dispatch:merge-pause', paused: true, event: mergeEvents.at(-1) || null };
  const records = snapshot.items.filter(item => item.state === 'open' && item.pull_request).map(item => {
    const legacyLabels = names(item), events = item.controlEvents || [];
    let held = legacyLabels.includes('hold');
    for (const event of events.filter(event => ['labeled', 'unlabeled'].includes(event.event) && event.label?.name === 'hold')) {
      if (event.event === 'labeled') held = true;
      else if (event.actor?.login === owner && Object.hasOwn(event, 'performed_via_github_app') && event.performed_via_github_app === null) held = false;
    }
    const paused = held || legacyLabels.includes('needs-decision') || legacyLabels.includes('queue:paused');
    const priorityEvent = events.filter(event => ['labeled', 'unlabeled'].includes(event.event) && ['priority', 'queue:priority'].includes(event.label?.name)).at(-1);
    const priority = legacyLabels.some(name => ['priority', 'queue:priority'].includes(name)) && priorityEvent?.event === 'labeled' && priorityEvent.actor?.login === owner && Object.hasOwn(priorityEvent, 'performed_via_github_app') && priorityEvent.performed_via_github_app === null;
    const draft = item.pullRequest?.draft ?? item.draft ?? true;
    return { number: item.number, kind: 'pr', state: 'open', intended: true, draft, paused,
      pauseOwner: held || legacyLabels.includes('needs-decision'), priority, legacyLabels,
      legacyLand: legacyLabels.includes('land'), ready: !draft, mergeRequested: legacyLabels.includes('land'),
      controlEvents: events, pauseReasons: [...(held ? ['sticky-hold'] : []), ...(legacyLabels.includes('needs-decision') ? ['legacy:needs-decision'] : [])],
      acceptedAt: events.find(event => event.event === 'ready_for_review')?.created_at || item.created_at || snapshot.capturedAt,
      sourceSha: item.pullRequest?.head?.sha || null, baseSha: item.pullRequest?.base?.sha || null,
      queueLabels: [...(paused ? ['queue:paused'] : []), ...(priority ? ['queue:priority'] : [])] };
  });
  const requests = records.map(record => ({
    id: `pr:${record.number}:${record.sourceSha || 'unverified'}`, kind: 'pr', number: record.number,
    sourceSha: record.sourceSha, headSha: record.sourceSha, baseSha: record.baseSha, treeSha: null,
    acceptedAt: record.acceptedAt, priority: record.priority, paused: true, pauseOwner: record.pauseOwner, draft: record.draft, ready: record.ready,
    tasks: [], results: {}, mergeRequested: record.mergeRequested,
    blockers: [...record.pauseReasons, ...(!record.sourceSha ? ['pr-head-unverified'] : [])],
  }));
  const counts = { labels: snapshot.labels.length, prs: records.length };
  for (const [key, value] of Object.entries(expectedCounts || {})) if (counts[key] !== value) throw new Error(`Expected ${key}=${value}, observed ${counts[key]}`);
  const plan = { schema: MIGRATION_SCHEMA, repo: snapshot.repo, snapshotDigest: snapshot.digest, counts, complete: true, stage: 'paused', controls, controlProvenance, records, requests, deleteLabels: snapshot.labels.map(label => label.name), createLabels: labels };
  plan.digest = snapshotDigest(plan);
  return plan;
}

/** Default is a pure dry run. Controller verifies backup and freeze, then supplies verifiable receipts. */
export async function applyMigration(plan, { request, checkpoint, dryRun = true, durableBackup, oldConsumersDisabled, activeCutover = false, resume } = {}) {
  if (plan.digest !== snapshotDigest(plan) || !plan.complete || plan.stage !== 'paused') throw new Error('Invalid migration plan');
  if (dryRun) return { dryRun: true, plan };
  if (!activeCutover || !durableBackup?.verified || durableBackup.snapshotDigest !== plan.snapshotDigest || !durableBackup.receipt || !oldConsumersDisabled?.verified || !oldConsumersDisabled.receipt) throw new Error('Verified durable backup, verified old-consumer freeze and explicit active cutover required');
  if (typeof request !== 'function' || typeof checkpoint !== 'function') throw new Error('Transport and durable checkpoint required');
  const state = resume ? JSON.parse(JSON.stringify(resume)) : { schema: MIGRATION_SCHEMA, planDigest: plan.digest, snapshotDigest: plan.snapshotDigest, backupReceipt: durableBackup.receipt, freezeReceipt: oldConsumersDisabled.receipt, stage: 'paused', records: plan.records, requests: plan.requests, completed: [] };
  if (state.planDigest !== plan.digest || state.snapshotDigest !== plan.snapshotDigest || state.backupReceipt !== durableBackup.receipt || state.freezeReceipt !== oldConsumersDisabled.receipt) throw new Error('Resume checkpoint identity mismatch');
  await checkpoint(JSON.parse(JSON.stringify(state))); // Must durably preserve all active intent and backup provenance BEFORE first DELETE.
  async function mutation(key, path, method, body) {
    if (state.completed.includes(key)) return;
    const response = await request(path, { method, ...(body ? { body } : {}) });
    if (!ok(response) && !(method === 'DELETE' && response?.status === 404)) throw new Error(`Migration stopped at ${key}: ${response?.status || response?.error}`);
    state.completed.push(key);
    await checkpoint(JSON.parse(JSON.stringify(state)));
  }
  for (const name of plan.deleteLabels) await mutation(`delete:${name}`, `labels/${encodeURIComponent(name)}`, 'DELETE');
  for (const label of plan.createLabels) {
    const key = `create:${label.name}`;
    if (state.completed.includes(key)) continue;
    const existing = await request(`labels/${encodeURIComponent(label.name)}`, { method: 'GET' });
    if (ok(existing)) await mutation(key, `labels/${encodeURIComponent(label.name)}`, 'PATCH', label);
    else if (existing?.status === 404) await mutation(key, 'labels', 'POST', label);
    else throw new Error(`Cannot inspect label ${label.name}`);
  }
  for (const record of plan.records.filter(record => record.kind === 'pr' && record.queueLabels.length)) {
    const live = await read(request, `issues/${record.number}`);
    if (live.state !== 'open') continue;
    await mutation(`attach:${record.number}`, `issues/${record.number}/labels`, 'POST', { labels: record.queueLabels });
  }
  state.stage = 'complete';
  await checkpoint(JSON.parse(JSON.stringify(state)));
  return state;
}
