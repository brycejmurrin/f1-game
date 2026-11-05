// @doc Normalize diagnostic workflow inputs into immutable, deduplicated admission requests.
/** Admission metadata for existing workflow entry points; never shell commands. */
import crypto from 'node:crypto';

export const DIAGNOSTIC_WORKFLOWS = Object.freeze({
  'pages.yml': { suite: 'release', runner: 'ubuntu-latest', resource_class: 'linux', release: true },
  'ci.yml': { suite: 'full-validation', runner: 'ubuntu-latest', resource_class: 'linux' },
  'browser-group.yml': { suite: 'browser-group', runner: 'ubuntu-latest', resource_class: 'linux' },
  'gpu-census.yml': { suite: 'gpu-census', runner: 'macos-latest', resource_class: 'macos' },
  'garage-before.yml': { suite: 'garage-before', runner: 'macos-latest', resource_class: 'macos' },
  'capture-gallery.yml': { suite: 'capture-gallery', runner: 'macos-latest', resource_class: 'macos' },
  'car-shot.yml': { suite: 'car-shot', runner: 'macos-latest', resource_class: 'macos' },
  'lit-wgsl-advisory.yml': { suite: 'lit-wgsl', runner: 'ubuntu-latest', resource_class: 'linux', advisory: true },
  'perf-census-webgpu.yml': { suite: 'perf-census-webgpu', runner: 'ubuntu-latest', resource_class: 'linux', advisory: true },
  'desktop.yml': { suite: 'desktop', runner: 'ubuntu-latest', resource_class: 'linux' },
  'archive-evidence.yml': { suite: 'archive-evidence', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'import-models.yml': { suite: 'import-models', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'spec-timings.yml': { suite: 'spec-timings', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'flake-tally.yml': { suite: 'flake-tally', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'process-dashboard.yml': { suite: 'process-dashboard', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'changelog-fold.yml': { suite: 'changelog-fold', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'ratchets-fold.yml': { suite: 'ratchets-fold', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'knowledge-gc.yml': { suite: 'knowledge-gc', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'prune-branches.yml': { suite: 'prune-branches', runner: 'ubuntu-latest', resource_class: 'control', publisher: true },
  'repo-size.yml': { suite: 'repo-size', runner: 'ubuntu-latest', resource_class: 'linux' },
});
const SHA = /^[a-f0-9]{40}$/;
const IMAGES = new Set(['ubuntu-latest', 'ubuntu-24.04', 'macos-latest', 'macos-15', 'macos-14', 'windows-latest', 'windows-2022']);

/** Event payload + immutable Actions context supplied by the CLI. */
export function buildDiagnosticRequest(workflow, event = {}, context = {}) {
  if (!Object.hasOwn(DIAGNOSTIC_WORKFLOWS, workflow)) throw new Error(`unsupported admission workflow: ${workflow}`);
  const source_sha = context.source_sha || event._actions?.source_sha || event.pull_request?.head?.sha || event.workflow_run?.head_sha || event.after || event.sha;
  if (!SHA.test(source_sha || '')) throw new Error('diagnostic source_sha must be a full immutable commit SHA');
  const raw = event.inputs || {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 30) throw new Error('invalid workflow inputs');
  const inputs = {};
  for (const key of Object.keys(raw).sort()) {
    const value = raw[key];
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 32768 || String(value).includes('\0')) throw new Error(`invalid workflow input: ${key}`);
    inputs[key] = value;
  }
  const config = DIAGNOSTIC_WORKFLOWS[workflow];
  if (inputs.image && !IMAGES.has(inputs.image)) throw new Error('unsupported runner image');
  if (inputs.images && String(inputs.images).split(',').some(i => !IMAGES.has(i.trim()))) throw new Error('unsupported runner images');
  const event_name = context.event_name || event._actions?.event_name || (event.pull_request ? 'pull_request' : event.workflow_run ? 'workflow_run' : event.schedule ? 'schedule' : 'workflow_dispatch');
  const request = { request_run_id: context.run_id || event._actions?.run_id || null, producer_run_id: event.workflow_run?.id || null, base_sha: event.pull_request?.base?.sha || null, schedule: event.schedule || '', kind: 'diagnostic', workflow, source_sha, event_name, inputs, ...config, advisory: !!config.advisory, publisher: !!config.publisher };
  // Same tree with different GL/experiment parameters is separate evidence.
  request.request_id = workflow === 'pages.yml' ? `release:${source_sha}:actions-v1` : `diagnostic-${crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 32)}`;
  return request;
}
