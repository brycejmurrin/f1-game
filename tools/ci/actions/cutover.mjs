// @doc Validate reviewed migration, runner and publication prerequisites before activating coordination.
/** Activation uses live evidence, never caller-supplied permission assertions. */
import { importSnapshot } from './migration.mjs';
const WORKFLOWS = ['actions-coordinator.yml', 'actions-worker.yml', 'actions-validation.yml'];
const SCOPES = ['validation', 'merges'];
const SHA = /^[a-f0-9]{40}$/i;
async function get(request, path, options = { method: 'GET' }) {
  const r = await request(path, options);
  if (!r || r.error || r.status < 200 || r.status >= 300) throw new Error(`${options.method || 'GET'} ${path}: ${r?.error || r?.json?.message || r?.status || 'no response'}`);
  return r.json;
}
async function collection(request, path, key) {
  const rows = [];
  for (let page = 1; ; page++) {
    const d = await get(request, `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const current = key ? d?.[key] : d;
    if (!Array.isArray(current)) throw new Error(`Malformed paginated ${path}`);
    rows.push(...current);
    if (current.length < 100) return rows;
  }
}

/** Read-only preflight: source, workflow availability, variable permission and current validation proof. */
export async function verifyInstallation({ request, validationRunId, validationJobName = 'Actions validation' } = {}) {
  if (typeof request !== 'function' || !/^[1-9]\d*$/.test(String(validationRunId))) throw new Error('Transport and explicit validation run ID required');
  const repo = await get(request, '');
  if (!repo?.default_branch || !repo.full_name) throw new Error('Repository default branch unavailable');
  const branch = await get(request, `branches/${encodeURIComponent(repo.default_branch)}`);
  if (!branch.protected || !SHA.test(branch.commit?.sha || '')) throw new Error('Protected default tip required');
  const tip = branch.commit.sha;
  const commit = await get(request, `git/commits/${tip}`);
  if (!SHA.test(commit.tree?.sha || '')) throw new Error('Protected source tree missing');
  const workflows = [];
  for (const name of WORKFLOWS) {
    const workflow = await get(request, `actions/workflows/${name}`);
    if (workflow.state !== 'active' || workflow.path !== `.github/workflows/${name}`) throw new Error(`Replacement workflow unavailable: ${name}`);
    const file = await get(request, `contents/.github/workflows/${name}?ref=${tip}`);
    if (!SHA.test(file.sha || '') || file.type !== 'file') throw new Error(`Workflow absent from protected source: ${name}`);
    workflows.push({ name, id: workflow.id, sha: file.sha });
  }
  // A forbidden variables API must stop export/cutover rather than silently infer permissions.
  const variables = await collection(request, 'actions/variables', 'variables');
  const run = await get(request, `actions/runs/${validationRunId}`);
  if (run.workflow_id !== workflows.find(w => w.name === 'actions-validation.yml').id || run.status !== 'completed' || run.conclusion !== 'success' || run.path?.split('@')[0] !== '.github/workflows/actions-validation.yml' || !SHA.test(run.head_sha || '') || run.head_repository?.full_name !== repo.full_name) throw new Error('Successful installed validation run required');
  const attempt = await get(request, `actions/runs/${validationRunId}/attempts/${run.run_attempt}`);
  if (attempt.status !== 'completed' || attempt.conclusion !== 'success' || attempt.head_sha !== run.head_sha) throw new Error('Validation attempt is not terminal and successful');
  const source = await get(request, `git/commits/${run.head_sha}`);
  if (source.tree?.sha !== commit.tree.sha) throw new Error('Validation source tree differs from protected tip');
  const jobs = await collection(request, `actions/runs/${validationRunId}/attempts/${run.run_attempt}/jobs`, 'jobs');
  if (jobs.some(j => j.status !== 'completed') || !jobs.some(j => j.name === validationJobName && j.status === 'completed' && j.conclusion === 'success')) throw new Error('Validation test job did not complete successfully');
  return { repo: repo.full_name, defaultBranch: repo.default_branch, sourceSha: tip, treeSha: commit.tree.sha, validationRunId: Number(validationRunId), attempt: run.run_attempt, workflows, variable: variables.find(v => v.name === 'ACTIONS_COORDINATOR_MODE') || null };
}

async function verifyMigration(request, state) {
  const migration = state.migration, checkpoint = migration?.checkpoint;
  if (SCOPES.some(scope => typeof migration?.controlsBeforeFreeze?.[scope] !== 'boolean')) throw new Error('Pre-freeze controls must be preserved before activation');
  if (migration?.stage !== 'complete' || checkpoint?.stage !== 'complete' || !checkpoint.snapshotDigest || !checkpoint.backupReceipt) throw new Error('Completed durable migration required');
  const match = /^(.+)@([a-f0-9]{40})$/i.exec(checkpoint.backupReceipt);
  if (!match) throw new Error('Durable backup remote SHA required');
  const backup = await get(request, `contents/${match[1]}?ref=bot%2Factions-state`);
  if (backup.sha !== match[2] || !['base64', 'none'].includes(backup.encoding) || backup.truncated) throw new Error('Durable backup identity changed');
  let document = backup;
  if (backup.encoding === 'none') {
    document = await get(request, `git/blobs/${backup.sha}`);
    if (document.sha !== backup.sha) throw new Error('Durable backup blob identity changed');
  }
  if (document.encoding !== 'base64' || typeof document.content !== 'string' || document.truncated) throw new Error('Durable backup content unavailable');
  const snapshot = importSnapshot(Buffer.from(document.content, 'base64').toString('utf8'));
  if (snapshot.digest !== checkpoint.snapshotDigest || snapshot.digest !== migration.snapshotDigest) throw new Error('Durable backup digest differs from migration');
  const labels = await collection(request, 'labels');
  const expected = ['queue:paused', 'queue:priority'];
  if (labels.length !== 2 || labels.map(l => l.name).sort().join('|') !== expected.join('|')) throw new Error('Live repository must contain exactly the two PR queue labels');
  for (const name of ['dispatch.yml', 'land.yml']) {
    const workflow = await get(request, `actions/workflows/${name}`);
    if (workflow.state !== 'disabled_manually') throw new Error(`Old consumer remains enabled: ${name}`);
  }
  return { snapshotDigest: snapshot.digest, backupSha: backup.sha, planDigest: migration.planDigest };
}

/** Variable first: a crash leaves a paused ledger; replay safely completes the ledger CAS. */
export async function activate({ request, store, validationRunId, now = new Date().toISOString(), validationJobName } = {}) {
  if (!store?.read || !store?.update) throw new Error('Durable state store required');
  const before = store.read();
  if (before.missing || !['paused', 'active'].includes(before.state.mode)) throw new Error('Existing paused migration ledger required');
  const installation = await verifyInstallation({ request, validationRunId, validationJobName });
  const migration = await verifyMigration(request, before.state);
  const variable = installation.variable;
  if (variable?.value !== 'active') {
    await get(request, variable ? 'actions/variables/ACTIONS_COORDINATOR_MODE' : 'actions/variables', {
      method: variable ? 'PATCH' : 'POST', body: { name: 'ACTIONS_COORDINATOR_MODE', value: 'active' },
    });
  }
  const observed = await get(request, 'actions/variables/ACTIONS_COORDINATOR_MODE');
  if (observed.value !== 'active') throw new Error('Active mode variable readback failed; ledger remains paused');
  // Re-check tip after variable mutation: a concurrent deploy must be revalidated before activation.
  const branch = await get(request, `branches/${encodeURIComponent(installation.defaultBranch)}`);
  if (branch.commit?.sha !== installation.sourceSha) throw new Error('Protected tip moved during activation; ledger remains paused');
  return store.update(state => {
    if (state.migration?.stage !== 'complete' || state.migration?.planDigest !== migration.planDigest || state.migration?.snapshotDigest !== migration.snapshotDigest) throw new Error('Migration changed during activation');
    if (state.mode === 'active') return { alreadyActive: true };
    if (state.mode !== 'paused') throw new Error('Ledger mode changed during activation');
    const records = state.migration.checkpoint.records || [];
    for (const request of Object.values(state.requests)) {
      const record = records.find(r => r.number === request.number && r.kind === request.kind);
      // Only migration staging is lifted; manual PR pause provenance remains authoritative.
      if (record && !record.paused && !request.pauseOwner && !request.pauseProvenance?.paused && !(request.blockers || []).length) request.paused = false;
    }
    for (const scope of SCOPES) {
      const provenance = state.controlProvenance?.[scope];
      // A durable post-freeze manual event supersedes staging, even when both booleans were already true.
      const freezeAt = Date.parse(state.migration.frozenAt), eventAt = Date.parse(provenance?.at);
      const laterOwnerControl = provenance?.source === 'owner' && typeof provenance.paused === 'boolean'
        && Number.isFinite(freezeAt) && Number.isFinite(eventAt) && eventAt >= freezeAt;
      const manualPause = provenance?.paused === true && (!Number.isFinite(freezeAt) || !Number.isFinite(eventAt) || eventAt >= freezeAt);
      state.controls[scope] = laterOwnerControl ? provenance.paused : manualPause ? true : state.migration.controlsBeforeFreeze[scope];
    }
    state.mode = 'active';
    state.migration.activation = { at: now, ...installation, ...migration };
    return { activated: true };
  });
}


/** Operational rollback freezes the replacement system. It never recreates legacy labels or enables old consumers. */
export async function rollback({ request, store, now = new Date().toISOString(), reason = 'Operator rollback' } = {}) {
  if (typeof request !== 'function' || !store?.read || !store?.update || store.read().missing) throw new Error('Existing durable ledger and transport required');
  const current = await request('actions/variables/ACTIONS_COORDINATOR_MODE', { method: 'GET' });
  if (!current || current.error || (current.status !== 404 && (current.status < 200 || current.status >= 300))) throw new Error('Cannot inspect coordinator mode for rollback');
  if (current.status === 404 || current.json?.value !== 'paused') {
    await get(request, current.status === 404 ? 'actions/variables' : 'actions/variables/ACTIONS_COORDINATOR_MODE', {
      method: current.status === 404 ? 'POST' : 'PATCH', body: { name: 'ACTIONS_COORDINATOR_MODE', value: 'paused' },
    });
  }
  const observed = await get(request, 'actions/variables/ACTIONS_COORDINATOR_MODE');
  if (observed.value !== 'paused') throw new Error('Rollback variable readback failed');
  return store.update(state => {
    state.mode = 'paused';
    state.controlProvenance ||= {};
    for (const scope of SCOPES) {
      state.controls[scope] = true;
      state.controlProvenance[scope] = { at: now, paused: true, source: 'rollback', reason };
    }
    state.migration ||= {};
    state.migration.rollback = { at: now, reason, mode: 'paused', labelsRestored: false };
    return { paused: true, labelsRestored: false };
  });
}
