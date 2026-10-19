// The track-switch growth verdict (tools/lib/mem-census.mjs sustainedGrowthMB), replayed on the
// numbers that motivated it. The bound is read from the spec so the two cannot drift, and it must
// stay 10 MiB: the five-visit policy uses the median of warmed intervals, never a wider bound.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sustainedGrowthMB } from "../../tools/lib/mem-census.mjs";

const GROWTH_MB = +/const GROWTH_MB = (\d+);/.exec(readFileSync(new URL("../specs/track-switch-memory.spec.js", import.meta.url), "utf8"))[1];
const leaks = (heaps) => sustainedGrowthMB(heaps).median > GROWTH_MB;
// What the spec asserted before: the third visit against the second.
const oldVerdictFails = (heaps) => heaps[2] - heaps[1] > GROWTH_MB;

test("the bound stays 10 MB", () => assert.equal(GROWTH_MB, 10));

test("the leaks this spec was written for still fail it, every interval over the bound", () => {
  // #773 (docs/notes/TRACK-SWITCH-LEAKS-2026-10-02.md): monza 100 -> 151 -> 203 MB a cycle, continuing.
  assert.ok(leaks([100, 151, 203, 254, 306]), "#773 monza");
  // 2026-10-04 nodeBuilderCache key mismatch: +14 MB a round (14-26 measured).
  assert.ok(leaks([100, 114, 128, 142, 156]), "+14 MB a round");
  assert.ok(leaks([100, 126, 152, 178, 204]), "+26 MB a round");
  // The smallest leak the old assertion could see (just over the bound) fails both ways.
  assert.ok(leaks([100, 111, 122, 133, 144]), "11 MB a pick");
  assert.ok(oldVerdictFails([100, 111, 122, 133, 144]));
});

test("a Metal one-time warm-up step does not fail it, wherever the step lands", () => {
  // macos-latest, WebGPU, monza visits 1..5: run 39018575798 attempt 1 (step at 2) and attempt 2 (steps at 2 and 3).
  assert.ok(!leaks([133.1, 148.6, 149.9, 150.5, 151.2]), "step at visit 2");
  assert.ok(!leaks([134.2, 151.5, 165.8, 166.4, 167.1]), "steps at visits 2 and 3");
  assert.ok(!leaks([134.7, 148.7, 149.4, 150.0, 150.9]), "monaco");
  // The original red (#2604 run 39012574309): 133 -> 150.4 -> 164.8, the step at visit 3; the old check failed it.
  assert.ok(oldVerdictFails([133, 150.4, 164.8]), "the old verdict failed on timing alone");
  assert.ok(!leaks([133, 150.4, 164.8, 165.4, 166.1]), "the same readings with the plateau that follows");
});

test("a step cannot hide a leak: growth in every later interval still fails", () => {
  assert.ok(leaks([133, 150, 165, 180, 195]), "a 15 MB step followed by 15 MB a pick");
});

test("fewer than three readings is an error, not a pass", () => {
  assert.throws(() => sustainedGrowthMB([100, 101]));
  assert.throws(() => sustainedGrowthMB([100, NaN, 102]));
});

// Presentation controls deliberately avoid a browser/GPU: exercise source identity,
// fixed targets and the Node watchdog independently of software-adapter timing.
import { presentationDeadline, installPickerReceipt, pickerReceiptStatus } from '../../tools/lib/presentation.mjs';
test('presentation wall deadline bounds a page operation that never resolves', async () => {
  await assert.rejects(presentationDeadline(20)('stopped rAF', () => new Promise(() => {})), /wall deadline.*stopped rAF/);
});
function pickerControl(run) {
  const saved = Object.fromEntries(['window', 'GLX', 'Log'].map((k) => [k, globalThis[k]]));
  const logs = [{ id: 1, msg: 'build done monza old' }, { id: 2, msg: 'menu warm drawn monza' }];
  const state = { submittedGen: 10, shownGen: 9, epoch: 1, display: [320, 180] };
  globalThis.window = {};
  globalThis.Log = { records: () => logs };
  globalThis.GLX = { softPresent: () => true, softPresentState: () => ({ ...state }),
    present() { state.submittedGen++; } };
  try { run({ logs, state, gfx: globalThis.GLX }); }
  finally { for (const [k, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[k]; else globalThis[k] = value; } }
}
test('picker receipt rejects stale same-track warm and freezes the final submission target', () => pickerControl(({ logs, state, gfx }) => {
  installPickerReceipt('monza');
  gfx.present();
  state.shownGen = 11;
  assert.equal(pickerReceiptStatus('monza').ok, false);
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present();
  assert.equal(pickerReceiptStatus('monza').target, 12);
  for (let n = 0; n < 8; n++) gfx.present();
  assert.equal(pickerReceiptStatus('monza').target, 12);
  assert.equal(pickerReceiptStatus('monza').ok, false);
  state.shownGen = 12;
  assert.equal(pickerReceiptStatus('monza').ok, true);
  state.display = [640, 360];
  assert.match(pickerReceiptStatus('monza').error, /resized/);
}));
test('warm log with failed/no submission is incomplete, even if an old read completes', () => pickerControl(({ logs, state, gfx }) => {
  gfx.present = () => {};
  installPickerReceipt('monza');
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present(); state.shownGen = 99;
  assert.equal(pickerReceiptStatus('monza').ok, false);
  assert.match(pickerReceiptStatus('monza').error, /no proven submission/);
}));
test('WGX invalidates once and excludes an old-generation read while preserving pending', () => pickerControl(({ logs, state, gfx }) => {
  delete state.submittedGen;
  Object.assign(state, { seq: 4, shown: 3, sceneGen: 6, shownGen: 6, pending: true });
  let invalidations = 0;
  gfx.invalidateSoftPresent = () => { invalidations++; state.sceneGen++; };
  gfx.present = () => { state.seq++; };
  installPickerReceipt('monza');
  assert.equal(state.pending, true);
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present(); state.shown++;
  assert.equal(pickerReceiptStatus('monza').ok, false);
  state.shownGen = 7;
  assert.equal(pickerReceiptStatus('monza').ok, false, 'same scene generation cannot substitute for final copy completion');
  state.shown = state.seq;
  assert.equal(pickerReceiptStatus('monza').ok, true);
  assert.equal(invalidations, 1);
  state.hold = true;
  assert.equal(pickerReceiptStatus('monza').ok, false);
}));
test('native receipt registers before the final warm draw and requires its success notification', async () => {
  let complete, receipt;
  pickerControl(({ logs, gfx }) => {
    gfx.softPresent = () => false;
    gfx.awaitSoftPresent = (_ms, mode) => {
      assert.equal(mode, 'frame');
      return new Promise((resolve) => { complete = resolve; });
    };
    gfx.present = () => { assert.equal(typeof complete, 'function'); complete('frame'); };
    installPickerReceipt('monza');
    logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
    gfx.present();
    assert.equal(pickerReceiptStatus('monza').mode, 'native-frame');
    assert.equal(pickerReceiptStatus('monza').ok, false);
    receipt = window.__pickerPresentation;
  });
  await Promise.resolve();
  assert.equal(receipt.nativeShown, 1);
});

import { waitUntilDrawn } from '../../tools/lib/mem-census.mjs';
import { presentationDiagnostics } from '../../tools/lib/presentation.mjs';
import { runInNewContext } from 'node:vm';
test('picker timeout stops polling before cleanup even when its in-flight status resolves later', async () => {
  let statusReads = 0, release;
  const page = {
    evaluate(fn) {
      if (fn === pickerReceiptStatus) {
        statusReads++;
        return new Promise((resolve) => { release = resolve; });
      }
      return Promise.resolve(null); // failure diagnostics and restoration
    },
    waitForTimeout: () => Promise.resolve(),
  };
  await assert.rejects(waitUntilDrawn(page, 'monza', 20), /deadline/);
  release({ ok: false });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(statusReads, 1, 'late evaluation must not restart the poll loop');
});
test('picker observer detects replacement inside the stable GLX facade', () => pickerControl(({ gfx }) => {
  installPickerReceipt('monza');
  gfx.present = () => {};
  assert.match(pickerReceiptStatus('monza').error, /renderer replaced/);
  installPickerReceipt('monza');
  gfx.__tlx = { renderer: {} };
  assert.match(pickerReceiptStatus('monza').error, /renderer replaced/);
  installPickerReceipt('monza');
  gfx.__tlx.renderer = {};
  assert.match(pickerReceiptStatus('monza').error, /renderer replaced/);
}));
test('diagnostics retain both surfaces and select visible WGX canvas over hidden stale overlay', () => pickerControl(({ state }) => {
  const savedDocument = globalThis.document, savedStyle = globalThis.getComputedStyle;
  const nodes = Object.fromEntries(['game', 'game-soft'].map((id) => [id, {
    id, width: 320, height: 180, getBoundingClientRect: () => ({ width: 320, height: 180 }),
  }]));
  globalThis.document = { getElementById: (id) => nodes[id] };
  globalThis.getComputedStyle = (node) => ({ display: 'block', visibility: node.id === 'game-soft' ? 'hidden' : 'visible', opacity: '1' });
  state.sceneGen = 1;
  try {
    const result = presentationDiagnostics();
    assert.equal(result.canvas.id, 'game');
    assert.equal(result.canvases.length, 2);
    assert.equal(result.canvases.find((c) => c.id === 'game-soft').visible, false);
    globalThis.getComputedStyle = () => ({ display: 'none', visibility: 'visible', opacity: '1' });
    assert.equal(presentationDiagnostics().canvas, null);
  } finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = savedStyle;
  }
}));
test('shipped TLX and GLX native waiters resolve literal frame from their actual present notifications', async () => {
  for (const [name, path] of [['tlx', '../../js/render/three/tlx.js'], ['glx', '../../js/render/glx/glx.js']]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const helper = name === 'tlx'
      ? source.match(/const _awaitFrame = \(ms\) => new Promise\(\(resolve\) => \{[\s\S]*?\n      \}\);/)[0]
      : source.match(/function _awaitFrame\(ms\) \{[\s\S]*?\n  \}/)[0];
    const notification = source.match(/if \((?:painted && )?_frameWaiters.length\) _frameWaiters.splice\(0\).forEach\([^\n]+/)[0];
    if (name === 'tlx') assert.match(notification, /painted &&/, 'TLX notification requires successful painting');
    const context = { setTimeout, clearTimeout };
    runInNewContext('const _frameWaiters = []; let painted = true;\n' + helper + '\nthis.wait = _awaitFrame; this.notify = () => { ' + notification + ' };', context);
    const result = context.wait(1000);
    context.notify();
    assert.equal(await result, 'frame', name + ' actual native notification');
    assert.match(source, /arguments\[1\] === "frame" \? _awaitFrame/, name + ' public native API routes to verified helper');
  }
});

test('median catches intermittent warmed drift without weakening the previous minimum policy', () => {
  const growth = sustainedGrowthMB([100, 100, 120, 119, 139]);
  assert.deepEqual(growth.intervals, [20, -1, 20]);
  assert.deepEqual(growth.rawIntervals, [20, -1, 20]);
  assert.equal(growth.min, -1);
  assert.equal(growth.median, 20);
  assert.equal(growth.netAfterWarmupMB, 39);
  assert.equal(growth.policyReady, true);
  assert.ok(leaks([100, 100, 120, 119, 139]));
  for (const values of [[100, 151, 203, 254, 306], [100, 114, 128, 142, 156], [100, 126, 152, 178, 204], [100, 111, 122, 133, 144]]) {
    const result = sustainedGrowthMB(values);
    assert.ok(result.median >= result.min);
    assert.ok(result.median > GROWTH_MB);
  }
});
test('all documented complete warm-up series stay within median budget; short records remain insufficient', () => {
  // Every complete series in TRACK-SWITCH-METAL-2026-10-17.md, plus recorded monaco.
  for (const series of [
    [133.1, 148.6, 149.9, 150.5, 151.2], [134.2, 151.5, 165.8, 166.4, 167.1],
    [133.2, 148.7, 150.0, 150.6, 151.3], [136.0, 151.6, 153.0, 153.5, 154.2],
    [138.6, 155.4, 157.1, 157.0, 158.0], [142.1, 158.6, 159.6, 160.9, 160.5],
    [134.7, 148.7, 149.4, 150.0, 150.9], [133, 150.4, 164.8, 165.4, 166.1],
  ]) {
    const result = sustainedGrowthMB(series);
    assert.equal(result.policyReady, true);
    assert.ok(result.median <= GROWTH_MB, JSON.stringify(series));
  }
  for (const series of [[133.1, 148.5, 150.0], [136.2, 151.4, 152.9], [133, 150.4, 164.8]]) {
    assert.equal(sustainedGrowthMB(series).policyReady, false, 'historical three-visit records cannot establish the five-visit verdict');
  }
  assert.equal(sustainedGrowthMB([100, 100, 101, 102]).policyReady, false);
});

import { acquirePresentationResource } from '../../tools/lib/presentation.mjs';
test('resource acquisition disposes a server or browser that resolves after its wall timeout', async () => {
  for (const kind of ['server', 'browser']) {
    let release, disposed = 0;
    const resource = { kind };
    const operation = acquirePresentationResource(presentationDeadline(15), kind,
      () => new Promise((resolve) => { release = resolve; }), async (late) => {
        assert.equal(late, resource); disposed++;
      });
    await assert.rejects(operation, /wall deadline/);
    release(resource);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disposed, 1);
  }
});
test('successful acquisition retains ownership until caller teardown', async () => {
  const resource = {};
  let disposed = false;
  const got = await acquirePresentationResource(presentationDeadline(100), 'browser',
    () => resource, () => { disposed = true; });
  assert.equal(got, resource);
  assert.equal(disposed, false);
});
test('WGX final copy remains incomplete when the preceding same-scene copy is already shown', () => pickerControl(({ logs, state, gfx }) => {
  delete state.submittedGen;
  Object.assign(state, { seq: 5, shown: 5, sceneGen: 6, shownGen: 7, pending: true });
  gfx.invalidateSoftPresent = () => { state.sceneGen++; };
  gfx.present = () => { state.seq++; };
  installPickerReceipt('monza');
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present();
  const pending = pickerReceiptStatus('monza');
  assert.equal(pending.requiredSeq, 6);
  assert.equal(pending.ok, false);
  state.shown = 6;
  assert.equal(pickerReceiptStatus('monza').ok, true);
}));
test('GLX soft picker arms its final warm copy on demand exactly once', () => pickerControl(({ logs, state, gfx }) => {
  delete state.submittedGen; delete state.shownGen;
  Object.assign(state, { gen: 3, maxPx: 255, post: 'glx' });
  let armed = false, invalidations = 0;
  gfx.invalidateSoftPresent = () => { armed = true; invalidations++; };
  gfx.present = () => { if (armed) { state.gen++; armed = false; } };
  installPickerReceipt('monza');
  gfx.present();
  assert.equal(invalidations, 0, 'do not request an old-scene copy');
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present();
  assert.equal(pickerReceiptStatus('monza').ok, true);
  gfx.present();
  assert.equal(invalidations, 1);
}));
test('raw median enforces unchanged 10 MiB boundary before display rounding', () => {
  const result = sustainedGrowthMB([100, 100, 110.04, 120.08, 130.12]);
  assert.deepEqual(result.intervals, [10, 10, 10]);
  assert.equal(result.min, 10, 'legacy rounded minimum is compatible');
  assert.ok(result.median > GROWTH_MB, '10.04 MiB must exceed 10 MiB');
  assert.ok(leaks([100, 100, 110.04, 120.08, 130.12]));
  assert.equal(leaks([100, 100, 110, 120, 130]), false);
});
test('picker permits display and epoch changes before final submission but rejects later changes', () => pickerControl(({ logs, state, gfx }) => {
  installPickerReceipt('monza');
  state.display = [960, 540]; state.epoch = 2;
  assert.equal(pickerReceiptStatus('monza').error, null, 'build-time resize has no frozen target to invalidate');
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present();
  state.shownGen = state.submittedGen;
  assert.equal(pickerReceiptStatus('monza').ok, true);
  state.display = [1280, 720];
  assert.match(pickerReceiptStatus('monza').error, /resized/);
  state.display = [960, 540]; state.epoch = 3;
  assert.match(pickerReceiptStatus('monza').error, /epoch changed/);
}));
test('native receipt freezes dimensions after present synchronously resizes the final warm draw', async () => {
  let receipt;
  pickerControl(({ logs, state, gfx }) => {
    let notify;
    gfx.softPresent = () => false;
    gfx.awaitSoftPresent = () => new Promise((resolve) => { notify = resolve; });
    gfx.present = () => { state.display = [960, 540]; state.epoch = 4; notify('frame'); };
    installPickerReceipt('monza');
    logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
    gfx.present();
    receipt = window.__pickerPresentation;
    assert.deepEqual(receipt.display, [960, 540]);
    assert.equal(receipt.epoch, 4);
    assert.equal(pickerReceiptStatus('monza').error, null);
    state.display = [844, 390];
    assert.match(pickerReceiptStatus('monza').error, /resized/);
  });
  await Promise.resolve();
  assert.equal(receipt.nativeShown, 1);
});
test('final warm backpressure accepts only the completed submission observed after the matching build', () => pickerControl(({ logs, state, gfx }) => {
  let pending = false;
  gfx.present = () => { if (!pending) { state.submittedGen++; pending = true; } };
  installPickerReceipt('monza');
  logs.push({ id: 3, msg: 'build done monza new' });
  gfx.present(); // first warm submits the current world
  logs.push({ id: 4, msg: 'menu warm drawn monza' });
  gfx.present(); // final warm is intentionally backpressured
  const receipt = pickerReceiptStatus('monza');
  assert.equal(receipt.error, null);
  assert.equal(receipt.target, 11);
  assert.equal(receipt.submissionBuilt, 3);
  assert.equal(receipt.phase, 'earlier-warm');
  assert.equal(receipt.ok, false, 'a pending same-build submission is not completion');
  state.shownGen = 11;
  assert.equal(pickerReceiptStatus('monza').ok, true);
}));
test('pre-build pending submission cannot satisfy a later final warm no-op', () => pickerControl(({ logs, state, gfx }) => {
  let pending = false;
  gfx.present = () => { if (!pending) { state.submittedGen++; pending = true; } };
  installPickerReceipt('monza');
  gfx.present(); // still the preceding world
  logs.push({ id: 3, msg: 'build done monza new' }, { id: 4, msg: 'menu warm drawn monza' });
  gfx.present(); state.shownGen = 11;
  assert.equal(pickerReceiptStatus('monza').ok, false);
  assert.match(pickerReceiptStatus('monza').error, /no proven submission/);
}));
test('repeated same-track builds cannot reuse an earlier build submission receipt', () => pickerControl(({ logs, state, gfx }) => {
  let pending = false;
  gfx.present = () => { if (!pending) { state.submittedGen++; pending = true; } };
  installPickerReceipt('monza');
  logs.push({ id: 3, msg: 'build done monza earlier' });
  gfx.present();
  logs.push({ id: 4, msg: 'build done monza newest' }, { id: 5, msg: 'menu warm drawn monza' });
  gfx.present(); state.shownGen = 11;
  assert.equal(pickerReceiptStatus('monza').ok, false);
  assert.match(pickerReceiptStatus('monza').error, /no proven submission/);
}));
