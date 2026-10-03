// @doc Shared bounded input/output and pixel evidence contracts for capture CLIs.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync } from 'node:fs';
import { assertContainedPath, assertSafePathToken } from '../lib/output-paths.mjs';
import sharp from 'sharp';
import { createRequire } from 'node:module';
const { CIRCUITS } = createRequire(import.meta.url)('../manifest.cjs');
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export function parseCaptureArgs(argv, name, extras = []) {
  const out = { track: name === 'replay-camera-probe' ? 'baku' : 'monza', seed: 1, backend: 'three', viewport: { width: 1280, height: 720 }, frames: 3, timeoutMs: 300000, fixture: 'default', out: resolve(ROOT, 'artifacts', name) };
  for (let i = 0; i < argv.length; i++) {
    const [key, ...rhs] = argv[i].split('=');
    if (key === '--help' || key === '-h') { out.help = true; continue; }
    if (key === '--plan') { out.plan = true; continue; }
    if (!['--track', '--seed', '--out', ...extras].includes(key)) throw new Error(`unknown flag: ${key}`);
    const value = rhs.length ? rhs.join('=') : argv[++i];
    if (value == null || value.startsWith('--')) throw new Error(`missing value: ${key}`);
    const prop = key === '--timeout-ms' ? 'timeoutMs' : key.slice(2);
    if (prop === 'seed' || prop === 'frames' || prop === 'timeoutMs') out[prop] = Number(value);
    else if (prop === 'viewport') {
      if (!/^\d+x\d+$/.test(value)) throw new Error('viewport must be WxH');
      const [width, height] = value.split('x').map(Number); out.viewport = { width, height };
    } else out[prop] = value;
  }
  assertSafePathToken(out.track, 'track');
  if (!CIRCUITS.includes(out.track)) throw new Error(`unknown track: ${out.track}; fixture track must use a catalog circuit`);
  if (!Number.isInteger(out.seed) || out.seed < 0 || out.seed > 0xffffffff) throw new Error('seed must be uint32');
  if (!['three', 'webgl2', 'webgpu'].includes(out.backend)) throw new Error('backend must be three|webgl2|webgpu');
  if (!Object.values(out.viewport).every((n) => Number.isInteger(n) && n >= 64 && n <= 4096)) throw new Error('viewport bounds: 64..4096');
  if (!Number.isInteger(out.frames) || out.frames < 1 || out.frames > 120) throw new Error('frames bounds: 1..120');
  if (!Number.isInteger(out.timeoutMs) || out.timeoutMs < 1000 || out.timeoutMs > 900000) throw new Error('timeout-ms bounds: 1000..900000');
  out.out = resolve(ROOT, out.out);
  const bases = ['artifacts', 'scratch'].map((p) => resolve(ROOT, p));
  const base = bases.find((p) => { try { assertContainedPath(p, out.out); return out.out !== p; } catch { return false; } });
  if (!base) throw new Error('out must be a child of artifacts/ or scratch/');
  let ancestor = out.out; while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  let baseAncestor = base; while (!existsSync(baseAncestor)) baseAncestor = dirname(baseAncestor);
  const realBase = existsSync(base) ? realpathSync(base) : resolve(realpathSync(baseAncestor), base.slice(baseAncestor.length + 1));
  assertContainedPath(realBase, resolve(realpathSync(ancestor), out.out.slice(ancestor.length + 1)), 'out real path');
  return out;
}
export function usage(name, extra = '') {
  return `usage: node tools/${name === 'lifecycle-census' ? 'check' : 'shot'}/${name}.mjs --track ID --seed uint32 --out DIR ${extra} [--help|--plan]\nOutput must be under artifacts/ or scratch/. Plan validates inputs without booting or writing.\n`;
}
export function invoked(url) { return process.argv[1] && fileURLToPath(url) === resolve(process.argv[1]); }
export async function pixelEvidence(buf) {
  const { data, info } = await sharp(buf).resize(96, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let lit = 0, centralLit = 0, centralN = 0, sum = 0, sum2 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum > 12) lit++; sum += lum; sum2 += lum * lum;
    if (x >= 16 && x < 80 && y >= 12 && y < 50) { centralN++; if (lum > 12) centralLit++; }
  }
  const n = info.width * info.height, brightFraction = lit / n, centerBrightFraction = centralLit / centralN;
  const variance = sum2 / n - (sum / n) ** 2;
  const black = brightFraction < 0.01, blackHudOnly = !black && centerBrightFraction < 0.015;
  return { brightFraction, centerBrightFraction, variance, black, blackHudOnly, meaningful: !black && !blackHudOnly && variance > 2, classification: black ? 'black' : blackHudOnly ? 'black-scene-with-edge-content' : variance <= 2 ? 'uniform' : 'scene-content' };
}
export function rendererEvidence(diag, pixels, requestedBackend) {
  const state = diag?.env?.backendState;
  const actual = diag?.env?.backend;
  const matchesRequested = requestedBackend == null || actual === requestedBackend;
  const positive = matchesRequested && state && ['webgl2', 'webgpu'].includes(state.api) && !state.ctxLost && !state.lost && (state.gpuErrors ?? diag.env.gpuErrors ?? 0) === 0 && pixels.meaningful;
  return { requested: requestedBackend || null, matchesRequested, actual, api: state?.api || null, state, positive: !!positive, signal: positive ? 'live-backend-state-and-presented-scene-pixels' : 'unproven' };
}
