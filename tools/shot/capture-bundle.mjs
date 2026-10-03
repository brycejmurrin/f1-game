#!/usr/bin/env node
// @doc Capture one backend-aware evidence bundle: identity, camera, actual renderer, pixels, console and viewport.
// @skill playwright-probe
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCaptureArgs, usage, invoked } from './capture-contract.mjs';
import { withCapturePage, stageRace, recordCapture } from './capture-runtime.mjs';
export async function captureBundle(opts) {
  mkdirSync(opts.out, { recursive: true });
  let result;
  try {
    result = await withCapturePage(opts, async (page, context) => {
      context.phase = "race-entry";
      await stageRace(page, opts.track);
      context.phase = "scene";
      const evidence = await recordCapture(page, resolve(opts.out, 'scene.png'), opts.backend, context);
      return { schemaVersion: 1, ok: evidence.screen.errorOverlay == null && evidence.renderer.positive && !context.consoleEvents.some((e) => e.type === 'pageerror'), ...context, evidence };
    });
    result.teardown = { complete: true };
  } catch (err) { result = { schemaVersion: 1, ok: false, ...err.captureContext, error: err.message, teardown: { complete: !err.captureContext?.teardownError && !err.message.startsWith('capture teardown failed:') } }; }
  writeFileSync(resolve(opts.out, 'bundle.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (invoked(import.meta.url)) {
  try {
    const opts = parseCaptureArgs(process.argv.slice(2), 'capture-bundle', ['--timeout-ms', '--backend', '--viewport']);
    if (opts.help) console.log(usage('capture-bundle', '--backend three|webgl2|webgpu --viewport WxH --timeout-ms 1000..900000'));
    else if (opts.plan) console.log(JSON.stringify(opts, null, 2));
    else { const result = await captureBundle(opts); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
  } catch (err) { console.error(err.message); process.exitCode = 2; }
}
