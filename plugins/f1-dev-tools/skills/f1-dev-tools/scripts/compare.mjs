import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export function summarize(trace) {
  if (trace?.schema !== 'f1-dev-trace/v1' || !Array.isArray(trace.samples) || trace.samples.length < 2) throw new Error('Expected a trace with at least two rendered frames.');
  let maxEyeStep = 0, maxTargetStep = 0, maxFovStep = 0, maxFrameMs = 0;
  for (let i = 0; i < trace.samples.length; i++) {
    const s = trace.samples[i], d = s.damping;
    if (!d || ![d.eye, d.target].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) || ![d.fov, d.renderFrame, s.wallTime].every(Number.isFinite)) throw new Error('Trace contains invalid camera data.');
    if (!i) continue;
    const p = trace.samples[i - 1];
    if (d.renderFrame <= p.damping.renderFrame || s.wallTime <= p.wallTime) throw new Error('Trace does not contain advancing render frames and timestamps.');
    maxEyeStep = Math.max(maxEyeStep, distance(d.eye, p.damping.eye));
    maxTargetStep = Math.max(maxTargetStep, distance(d.target, p.damping.target));
    maxFovStep = Math.max(maxFovStep, Math.abs(d.fov - p.damping.fov));
    maxFrameMs = Math.max(maxFrameMs, s.wallTime - p.wallTime);
  }
  return { frames: trace.samples.length, maxEyeStep, maxTargetStep, maxFovStep, maxFrameMs,
    elapsedMs: trace.samples.at(-1).wallTime - trace.samples[0].wallTime };
}
export function compare(before, after) {
  const b = summarize(before), a = summarize(after), mismatches = [];
  const checks = {
    track: t => t.before?.info?.track,
    viewport: t => {
      const v = t.before?.viewport;
      return v && [v.width, v.height].every(n => Number.isFinite(n) && n > 0) ? v : null;
    },
    camera: t => t.before?.camera?.mode,
    renderer: t => t.before?.renderer?.backend ? t.before.renderer : null,
    reducedMotion: t => t.before?.reducedMotion,
    label: t => t.label,
    frames: t => t.samples.length,
  };
  for (const [key, read] of Object.entries(checks)) {
    const left = read(before), right = read(after);
    if (left == null || right == null || JSON.stringify(left) !== JSON.stringify(right)) mismatches.push(key);
  }
  // Timing and raw movement are observations, not a smoothness verdict: legitimate shot cuts can jump.
  return { schema: 'f1-dev-comparison/v1', comparable: !mismatches.length, mismatches,
    before: b, after: a, delta: Object.fromEntries(Object.keys(a).map(k => [k, a[k] - b[k]])),
    interpretation: 'Inspect the sequence and shot context. These metrics alone do not prove smooth motion or a visual regression.' };
}
function outputPath(file) {
  const resolved = path.resolve(file), roots = ['artifacts', 'scratch'].map(d => path.resolve(d) + path.sep);
  if (!roots.some(root => resolved.startsWith(root))) throw new Error('Write reports under artifacts/ or scratch/ in the working checkout.');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const parent = fs.realpathSync(path.dirname(resolved));
  if (!roots.some(root => (parent + path.sep).startsWith(root))) throw new Error('Report parent must not escape through a symlink.');
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) throw new Error('Refusing symlink output.');
  return resolved;
}
const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function imageData(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Gallery inputs must be PNG files of at most 20 MiB.');
  return 'data:image/png;base64,' + bytes.toString('base64');
}
export function main(args) {
  const [command, beforeFile, afterFile, option, out] = args;
  if (!['compare', 'gallery'].includes(command) || !beforeFile || !afterFile || option !== '--out' || !out || args.length !== 5) throw new Error('Usage: node compare.mjs compare|gallery before after --out artifacts/report.json|comparison.html');
  const target = outputPath(out);
  if ([beforeFile, afterFile].some(file => fs.realpathSync(file) === target)) throw new Error('Output must differ from both inputs.');
  if (command === 'compare') {
    const result = compare(JSON.parse(fs.readFileSync(beforeFile, 'utf8')), JSON.parse(fs.readFileSync(afterFile, 'utf8')));
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
    return result.comparable ? 0 : 2;
  }
  const images = [beforeFile, afterFile].map((file, i) => `<figure><figcaption>${i ? 'After' : 'Before'}: ${escape(path.basename(file))}</figcaption><img alt="${i ? 'After' : 'Before'} game frame" src="${imageData(file)}"></figure>`).join('');
  fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>F1 frame comparison</title><style>body{font:16px system-ui;background:#10141b;color:#eee;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}figure{margin:0}img{width:100%;height:auto}figcaption{padding:12px 0}</style><h1>F1 frame comparison</h1><p>A still frame comparison does not prove smooth motion. Review the matching traces and opening, middle and end frames.</p><main>${images}</main>`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
