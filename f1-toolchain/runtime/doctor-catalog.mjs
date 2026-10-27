import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const hostToolNamesSchema = {
  type: 'array', maxItems: 2000,
  items: {type: 'string', minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9_.:-]+$'},
  description: 'Current tool names actually exposed by the calling host. Session evidence only; not gateway configuration or proof of tool execution.'
};

export async function doctorWithCatalog(root, args) {
  const names = args.hostToolNames;
  if (!Array.isArray(names) || names.length > 2000 || names.some(n =>
    typeof n !== 'string' || n.length > 256 || !/^[A-Za-z0-9_.:-]+$/.test(n))) {
    throw new Error('hostToolNames must contain at most 2000 bounded tool names');
  }
  for (const key of Object.keys(args)) if (!['hostToolNames', 'full', 'dryRun', 'outputLevel'].includes(key)) {
    throw new Error('Unknown doctor argument: ' + key);
  }
  for (const key of ['full', 'dryRun']) if (args[key] !== undefined && typeof args[key] !== 'boolean') {
    throw new Error(key + ' must be boolean');
  }
  if (args.outputLevel !== undefined && !['compact', 'diagnostic', 'full'].includes(args.outputLevel)) throw new Error('Invalid outputLevel');
  if (args.dryRun) return {ok: true, dryRun: true, catalogSource: 'caller-supplied-host-tool-names'};
  const {diagnose} = await import(pathToFileURL(path.join(root, 'tools/check/doctor.mjs')).href);
  const out = diagnose({root, catalog: {tools: names.map(name => ({name}))}});
  if (!args.full && args.outputLevel !== 'full') {
    out.passed = out.checks.filter(c => c.status === 'pass').length;
    out.checks = out.checks.filter(c => c.status !== 'pass' || c.id === 'session.catalog');
  }
  return {ok: out.ok, exit: out.ok ? 0 : 1, out,
    catalogSource: 'caller-supplied-host-tool-names', catalogCapturedAt: new Date().toISOString(),
    checkout: root};
}
