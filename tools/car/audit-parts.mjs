// @doc Capture every catalog part, body style and finish with validated selection and resumable evidence.
// @skill garage-parts-livery
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { exitIfHelp, parseFlags } from '../lib/cli-args.mjs';
import { launchChromium, startStaticServer, shutdown } from '../lib/harness.mjs';
import { chromiumArgsForBackend, mutateCaptureScene, awaitCaptureReady, screenshotPresentedCanvas } from '../shot/probe-page.mjs';
import { customizationCatalog, planCustomization } from './lib/customization-plan.mjs';
import { installCarviewCapture } from './lib/carview-capture.mjs';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2);
exitIfHelp(argv, `usage: node tools/car/audit-parts.mjs [--cats=engine,aero|none] [--team=mclaren]
  [--bodyStyle=needle] [--finish=pearl] [--aero=style_aero_spoon] [--styles-only]
  [--bodies] [--finishes] [--plan] [--resume] [--out=artifacts/car-survey]
  [--w=640 --h=448] [--url=http://127.0.0.1:3456]
  One browser; every eligible catalog option, plus front-wing views for aero.
  --bodies adds every canonical body in side and quarter views; --finishes adds every finish.
  Captures include resolved IDs, geometry, frame freshness and source identity.`);
const M = customizationCatalog();
const flags = parseFlags(argv, ['--cats', '--team', '--bodyStyle', '--finish', '--styles-only', '--bodies', '--finishes', '--plan', '--resume', '--out', '--w', '--h', '--url', ...M.Parts.CATALOG.map(c => '--' + c.id), ...M.Liveries.FIELDS.map(f => '--' + f)]);
const parts = Object.fromEntries(M.Parts.CATALOG.filter(c => flags.has('--' + c.id)).map(c => [c.id, flags.flag('--' + c.id)]));
const livery = Object.fromEntries(M.Liveries.FIELDS.filter(f => !['bodyStyle', 'finish'].includes(f) && flags.has('--' + f)).map(f => {
  const raw = flags.flag('--' + f), hex = /^#?([0-9a-f]{6})$/i.exec(String(raw));
  return [f, hex ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255) : raw];
}));
const plan = planCustomization({ M, categories: flags.has('--cats') ? flags.flag('--cats') === 'none' ? [] : flags.list('--cats') : undefined,
  team: flags.flag('--team', 'mclaren'), bodyStyle: flags.flag('--bodyStyle', 'team'), finish: flags.flag('--finish', 'gloss'), parts, livery,
  stylesOnly: flags.has('--styles-only'), bodies: flags.has('--bodies'), finishes: flags.has('--finishes') });
if (flags.has('--plan')) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
const out = resolve(ROOT, flags.flag('--out', 'artifacts/car-survey'));
if (!out.startsWith(resolve(ROOT, 'artifacts') + sep) && !out.startsWith(resolve(ROOT, 'scratch') + sep)) throw new Error('Output must be inside artifacts/ or scratch/');
const viewport = { width: Number(flags.flag('--w', '640')), height: Number(flags.flag('--h', '448')) };
if (Object.values(viewport).some(v => !Number.isInteger(v) || v < 240 || v > 1920)) throw new Error('Viewport dimensions must be integers 240..1920');
mkdirSync(out, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const source = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  diffHash: hash(execFileSync('git', ['diff', 'HEAD', '--', 'tools', 'js'], { cwd: ROOT })), viewport };
const planHash = hash(JSON.stringify({ plan, source }));
let manifest = { version: 1, source, planHash, viewport, counts: plan.counts, shots: [], errors: [] };
const manifestPath = resolve(out, 'manifest.json');
if (flags.has('--resume') && existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.planHash !== planHash) throw new Error('Resume refused: source, selection or viewport changed');
} else if (existsSync(manifestPath)) throw new Error('Output already has a manifest; use --resume or a new directory');
writeFileSync(resolve(out, 'plan.json'), JSON.stringify(plan, null, 2));
const save = () => { writeFileSync(manifestPath + '.tmp', JSON.stringify(manifest, null, 2)); renameSync(manifestPath + '.tmp', manifestPath); };
try {
  const server = flags.has('--url') ? null : await startStaticServer(ROOT);
  const browser = await launchChromium({ args: chromiumArgsForBackend('webgl2') });
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('pageerror', e => { manifest.errors.push(e.message); console.error('PAGEERROR', e.message); });
  const pageUrl = new URL('/tools/carview.html?team=mclaren&hud=0', server?.url || flags.flag('--url')).href;
  const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`Car viewer HTTP ${response?.status()} at ${pageUrl}`);
  await page.waitForFunction(() => window.CARVIEW?.ready, null, { polling: 100, timeout: 240000 }).catch(async error => {
    console.error('BOOT_DIAGNOSTIC', JSON.stringify(await page.evaluate(() => ({ url: location.href, title: document.title, viewer: typeof CARVIEW, frame: window.CARVIEW?.frame, glx: typeof GLX, text: document.body.innerText.slice(0, 500) }))));
    throw error;
  });
  await installCarviewCapture(page);
  manifest.browser = browser.version();
  manifest.renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { backend: 'webgl2', renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  for (const job of plan.jobs) {
    if (manifest.shots.some(s => s.key === job.key && s.ok && existsSync(resolve(out, s.file)) && s.sha256 === hash(readFileSync(resolve(out, s.file))))) continue;
    const begin = Date.now();
    const file = job.key + '.jpg';
    mkdirSync(resolve(out, job.kind, job.category), { recursive: true });
    try {
      await mutateCaptureScene(page, state => CARVIEW.set(state), {
        look: 0, lookX: 0, lookY: 0, spin: false, sweep: false, colors: [[0.50, 0.56, 0.65], [0.12, 0.23, 0.34]],
        tod: 'day', rig: '3point', intensity: 2.0, exp: 1.2, refl: 0.85, ...job.state,
      });
      const resolved = await page.evaluate(request => {
        const team = Teams.LIST.find(t => t.id === request.team);
        const resolved = Parts.resolveSetup(request.parts, team);
        for (const [cat, id] of Object.entries(request.parts)) if (resolved.ids[cat] !== id) throw new Error(cat + ' resolved to ' + resolved.ids[cat] + ', requested ' + id);
        return { team: team.id, ids: resolved.ids, cost: resolved.cost, mods: resolved.mods, mesh: window.__carCapture.mesh, livery: window.__carCapture.livery };
      }, job.state);
      const readiness = await awaitCaptureReady(page, { timeoutMs: 90000 });
      const capture = await screenshotPresentedCanvas(page, { path: resolve(out, file), preferView: true, skipAwait: true, type: 'jpeg', quality: 87, timeout: 90000 });
      const stats = await sharp(resolve(out, file)).stats();
      const ok = stats.channels.slice(0, 3).some(c => c.stdev > 12);
      if (!ok) throw new Error('Rendered image is blank or lacks contrast');
      manifest.shots = manifest.shots.filter(s => s.key !== job.key);
      manifest.shots.push({ ...job, file, sha256: hash(capture.buf), resolved, readiness, via: capture.via, ok, elapsedMs: Date.now() - begin });
      console.log('CAPTURE', manifest.shots.filter(s => s.ok).length + '/' + plan.jobs.length, job.key, Date.now() - begin + 'ms');
    } catch (e) {
      manifest.shots.push({ ...job, file, ok: false, error: e.message });
      console.error('FAILED', job.key, e.message);
    }
    save();
  }
  const failed = plan.jobs.filter(j => !manifest.shots.some(s => s.key === j.key && s.ok));
  manifest.finishedAt = new Date().toISOString(); manifest.failed = failed.map(j => j.key); save();
  console.log(JSON.stringify({ out, captured: plan.jobs.length - failed.length, failed: manifest.failed, pageErrors: manifest.errors }));
  if (failed.length || manifest.errors.length) process.exitCode = 1;
} finally { await shutdown(); }
