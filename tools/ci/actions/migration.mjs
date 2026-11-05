// @doc Export legacy labels and import explicit, idempotent queue and batch migration state.
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
  for (const item of items.filter(i => i.state === 'open' || i.number === 3899)) {
    item.controlEvents = await pages(request, `issues/${item.number}/events`);
    item.ownershipComments = await pages(request, `issues/${item.number}/comments`);
    if (item.pull_request) item.pullRequest = await read(request, `pulls/${item.number}`);
    else item.nativeBlockedBy = await pages(request, `issues/${item.number}/dependencies/blocked_by`);
  }
  const snapshot = { schema: MIGRATION_SCHEMA, repo, capturedAt: now, complete: true, nativeDependenciesComplete: true, labels, items, expectedCounts };
  // Avoid undefined fields in the digest: persisted JSON and in-memory exports must have identical identity.
  const serializable = JSON.parse(JSON.stringify(snapshot));
  serializable.digest = snapshotDigest(serializable);
  validateSnapshot(serializable);
  return serializable;
}

/** Full read-only refresh before any delete; a stale export must be redone, not silently accepted. */
export async function verifySnapshotCurrent({ request, snapshot } = {}) {
  validateSnapshot(snapshot);
  if (!snapshot.nativeDependenciesComplete) throw new Error('Snapshot lacks complete native dependency evidence; export again');
  const current = await exportSnapshot({ request, repo: snapshot.repo });
  const normalize = source => ({
    repo: source.repo,
    labels: [...source.labels].sort((a, b) => a.name.localeCompare(b.name)),
    items: source.items.map(item => ({
      number: item.number, state: item.state, body: item.body || '', title: item.title || '',
      labels: names(item).sort(), assignees: (item.assignees || []).map(a => a.login).sort(),
      controlEvents: [...(item.controlEvents || [])].sort((a, b) => (a.id || 0) - (b.id || 0)),
      ownershipComments: [...(item.ownershipComments || [])].sort((a, b) => (a.id || 0) - (b.id || 0)),
      nativeBlockedBy: [...(item.nativeBlockedBy || [])].map(d => ({ number: d.number, state: d.state, repository_url: d.repository_url || null })).sort((a, b) => a.number - b.number),
      pullRequest: item.pull_request ? { head: item.pullRequest?.head?.sha || null, base: item.pullRequest?.base?.sha || null, draft: item.pullRequest?.draft ?? null } : null,
    })).sort((a, b) => a.number - b.number),
  });
  if (JSON.stringify(canonical(normalize(snapshot))) !== JSON.stringify(canonical(normalize(current)))) throw new Error('Snapshot stale: labels, attachments, active controls, ownership or native dependencies changed; export again before deletion');
  return { verified: true, snapshotDigest: snapshot.digest, checkedAt: current.capturedAt, currentDigest: current.digest };
}

export function parseMembers(body = '') {
  const match = /^##\s+Members\s*\r?\n([\s\S]*?)(?=^#{1,2}\s|$(?![\s\S]))/im.exec(body);
  if (!match) return null;
  const members = [];
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(?:\[[ xX]\]\s*)?(?:#(\d+)\b|\[[^\]]*\]\(https:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)\))/.exec(line);
    if (m) members.push(Number(m[1] || m[2]));
  }
  if (new Set(members).size !== members.length) throw new Error('Duplicate Members entry');
  return members;
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

/** Consume only explicit Members lists. References elsewhere never imply membership or hard dependencies. */
export function planMigration(snapshot, { labels = JSON.parse(readFileSync(new URL('../../../.github/labels.json', import.meta.url), 'utf8')), expectedCounts = snapshot.expectedCounts, owner = snapshot.repo.split('/')[0], parentNumbers = [] } = {}) {
  validateSnapshot(snapshot);
  const required = ['queue:ready', 'queue:paused', 'queue:priority'];
  if (labels.length !== 3 || required.some(n => !labels.some(l => l.name === n))) throw new Error('Policy must define exactly the three queue labels');
  const byNumber = new Map(snapshot.items.map(i => [i.number, i]));
  const parents = [], membership = new Map();
  for (const item of snapshot.items) {
    if (item.number === 4915 || item.state !== 'open' || (!names(item).includes('batch') && !parentNumbers.includes(item.number))) continue; // archive historical sections; only registered active batches define work
    const members = parseMembers(item.body);
    if (members === null) continue;
    if (!members.length) throw new Error(`Empty Members section #${item.number}`);
    parents.push(item.number);
    for (const member of members) {
      if (!byNumber.has(member) || member === 4915 || member === item.number || membership.has(member)) throw new Error(`Invalid or duplicate member #${member}`);
      membership.set(member, item.number);
    }
  }
  if (parents.some(n => membership.has(n))) throw new Error('Parent cannot also be a member');
  const counts = { labels: snapshot.labels.length, parents: parents.length, members: membership.size };
  for (const [key, value] of Object.entries(expectedCounts || {})) if (counts[key] !== value) throw new Error(`Expected ${key}=${value}, observed ${counts[key]}`);
  // Legacy global controls outlive removal by automation or another worker.
  // Missing provenance can retain a pause, but can never authorize clearing one.
  const controlIssue = snapshot.items.find(item => item.number === 3899);
  const controls = { workers: false, validation: false, merges: false };
  const controlProvenance = {};
  for (const [label, scope] of [['dispatch:pause', 'workers'], ['dispatch:merge-pause', 'merges']]) {
    let paused = names(controlIssue || {}).includes(label);
    const events = (controlIssue?.controlEvents || []).filter(event => ['labeled', 'unlabeled'].includes(event.event) && event.label?.name === label);
    for (const event of events) {
      if (event.event === 'labeled') paused = true;
      else if (event.actor?.login === owner && Object.hasOwn(event, 'performed_via_github_app') && event.performed_via_github_app === null) paused = false;
    }
    controls[scope] = paused;
    if (paused) controlProvenance[scope] = { source: 'legacy-label', issue: 3899, label, paused: true, event: events.at(-1) || null };
  }
  const records = snapshot.items.filter(i => i.state === 'open' && i.number !== 4915).map(item => {
    const legacyLabels = names(item), comments = item.ownershipComments || [], events = item.controlEvents || [];
    const claims = comments.filter(c => /\bclaims\s+#\d+\b/i.test(c.body || ''));
    const claimed = legacyLabels.includes('claimed') || claims.length > 0 || (item.assignees || []).length > 0 || legacyLabels.some(l => l.startsWith('lane:'));
    const holdEvents = events.filter(e => ['labeled', 'unlabeled'].includes(e.event) && e.label?.name === 'hold');
    let held = legacyLabels.includes('hold');
    for (const e of holdEvents) if (e.event === 'labeled') held = true; else if (e.actor?.login === owner && Object.hasOwn(e, 'performed_via_github_app') && e.performed_via_github_app === null) held = false;
    const conditional = /(?:\bonly\s+if\b|\bconditional\s+(?:on|merge|dependency|prerequisite)\b|\bif\s+#\d+[^\n]*(?:merges?|lands?)\b|\bmerge\s+order[^\n]*(?:unclear|undecided|conditional)\b)/i.test(item.body || '');
    const nativeBlockedBy = item.nativeBlockedBy || [];
    const textDependencies = [...(item.body || '').matchAll(/^\s*(?:[-*]\s*)?Blocked by\s+#(\d+)\s*\.?\s*$/gim)].map(m => Number(m[1]));
    const dependencies = [...new Set([...textDependencies, ...nativeBlockedBy.map(d => d.number)])];
    const foreignDependency = nativeBlockedBy.some(d => d.repository_url && !d.repository_url.endsWith(`/repos/${snapshot.repo}`));
    const unknownDependency = foreignDependency || dependencies.some(n => !byNumber.has(n));
    const blocked = foreignDependency || dependencies.some(n => byNumber.get(n)?.state !== 'closed');
    const priorityEvent = events.filter(e => ['labeled', 'unlabeled'].includes(e.event) && e.label?.name === 'priority').at(-1);
    const priority = legacyLabels.includes('priority') && priorityEvent?.event === 'labeled' && priorityEvent.actor?.login === owner && Object.hasOwn(priorityEvent, 'performed_via_github_app') && priorityEvent.performed_via_github_app === null;
    const reasons = [...(held ? ['sticky-hold'] : []), ...(claimed ? ['existing-owner'] : []), ...(conditional || unknownDependency ? ['migration-review'] : []), ...(blocked ? ['dependency'] : []), ...legacyLabels.filter(l => ['blocked', 'needs-decision', 'dispatch:pause', 'dispatch:merge-pause'].includes(l)).map(l => `legacy:${l}`)];
    const intended = membership.has(item.number) || parents.includes(item.number) || !!item.pull_request || legacyLabels.includes('ready') || claimed;
    const paused = reasons.length > 0 || legacyLabels.some(l => ['blocked', 'needs-decision', 'dispatch:pause', 'dispatch:merge-pause'].includes(l));
    return { number: item.number, kind: item.pull_request ? 'pr' : 'issue', state: item.state, parent: membership.get(item.number) || null, isParent: parents.includes(item.number), intended, claimed, pauseOwner: held || legacyLabels.includes('needs-decision'), owners: (item.assignees || []).map(a => a.login), ownershipComments: claims, legacyLabels, legacyLand: legacyLabels.includes('land'), controlEvents: events,
      acceptedAt: events.find(e => e.event === 'labeled' && e.label?.name === 'ready')?.created_at || item.created_at || snapshot.capturedAt,
      sourceSha: item.pullRequest?.head?.sha || null, baseSha: item.pullRequest?.base?.sha || null,
      nativeBlockedBy, priorityProvenance: priorityEvent || null, dependencies, paused, pauseReasons: reasons, queueLabels: intended ? [paused ? 'queue:paused' : 'queue:ready', ...(priority ? ['queue:priority'] : [])] : [] };
  });
  for (const parent of records.filter(record => record.isParent)) {
    const members = [...membership].filter(([, number]) => number === parent.number).map(([member]) => member);
    parent.memberStates = Object.fromEntries(members.map(number => [number, byNumber.get(number).state]));
    const blockedMembers = records.filter(record => members.includes(record.number) && (record.claimed || record.paused));
    if (blockedMembers.length) {
      parent.paused = true;
      parent.pauseReasons.push(...blockedMembers.map(member => `batch-member:${member.number}`));
      parent.queueLabels = parent.queueLabels.map(label => label === 'queue:ready' ? 'queue:paused' : label);
    }
  }
  const requests = records.filter(r => r.intended).map(record => ({
    id: record.kind === 'pr' ? `pr:${record.number}:${record.sourceSha || 'unverified'}` : `issue:${record.number}`,
    kind: record.kind, number: record.number, sourceSha: record.sourceSha, baseSha: record.baseSha, treeSha: null,
    acceptedAt: record.acceptedAt, priority: record.queueLabels.includes('queue:priority'), paused: true,
    tasks: [], results: {}, members: [...membership].filter(([, parent]) => parent === record.number).map(([member]) => member),
    owner: record.claimed ? { kind: 'legacy-unverified', terminal: false, evidence: { snapshotDigest: snapshot.digest, labels: record.legacyLabels, commentIds: record.ownershipComments.map(comment => comment.id).filter(Boolean), assignees: record.owners } } : null, pauseOwner: record.pauseOwner, mergeRequested: record.legacyLand, memberStates: record.memberStates || {},
    blockers: [...record.pauseReasons, ...(record.claimed ? ['live-ownership-unverified'] : []), ...(record.kind === 'pr' && !record.sourceSha ? ['pr-head-unverified'] : [])],
  }));
  const plan = { schema: MIGRATION_SCHEMA, repo: snapshot.repo, snapshotDigest: snapshot.digest, counts, complete: true, stage: 'paused', controls, controlProvenance, parents, records, requests, deleteLabels: snapshot.labels.map(l => l.name), createLabels: labels };
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
  for (const record of plan.records.filter(r => r.intended)) {
    const live = await read(request, `issues/${record.number}`);
    if (live.state !== 'open') continue;
    await mutation(`attach:${record.number}`, `issues/${record.number}/labels`, 'POST', { labels: record.queueLabels });
  }
  state.stage = 'complete';
  await checkpoint(JSON.parse(JSON.stringify(state)));
  return state;
}
