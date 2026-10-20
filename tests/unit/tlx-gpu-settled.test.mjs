/* tlx-gpu-settled.test.mjs — the program warm's GPU settle says how it ended
 * (js/render/three/tlx.js _gpuSettled): "done" when the GPU answered, "cap" when
 * capMs ran out first, "none" on a backend with no settle. The warm records it
 * as memState().warm.settle { ms, how }, so the census can tell a slow GPU from
 * a wait that never resolves (B·H8: the draw stage took ~5 s in every warm of
 * census 39515338326, against a 5 s cap). The real function is cut out of
 * tlx.js and run against fake backends.
 *
 * Run: node --test tests/unit/tlx-gpu-settled.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");

function settled(backend) {
  const a = SRC.indexOf("function _gpuSettled(capMs) {");
  assert.ok(a > 0, "_gpuSettled is in tlx.js");
  const b = SRC.indexOf("\n      }\n", a) + 8;
  const ctx = { renderer: { backend }, performance, setTimeout, clearTimeout, Promise };
  vm.runInNewContext(SRC.slice(a, b), ctx);
  return ctx._gpuSettled;
}

test("WebGPU: the queue answers first -> done", async () => {
  const f = settled({ device: { queue: { onSubmittedWorkDone: () => Promise.resolve() } } });
  assert.equal(await f(1000), "done");
});

test("WebGPU: the queue never answers -> cap, after capMs", async () => {
  const f = settled({ device: { queue: { onSubmittedWorkDone: () => new Promise(() => {}) } } });
  const t0 = performance.now();
  assert.equal(await f(40), "cap");
  assert.ok(performance.now() - t0 >= 35, "it waited for the cap");
});

test("WebGL2: a fence that signals -> done; one that never does -> cap", async () => {
  const gl = (signalAfter) => {
    let polls = 0;
    return { SYNC_GPU_COMMANDS_COMPLETE: 1, TIMEOUT_EXPIRED: 0x911b, CONDITION_SATISFIED: 0x911c, WAIT_FAILED: 0x911d,
      fenceSync: () => ({}), flush() {}, deleteSync() {},
      clientWaitSync() { polls++; return polls > signalAfter ? 0x911c : 0x911b; } };
  };
  assert.equal(await settled({ gl: gl(2) })(1000), "done");
  assert.equal(await settled({ gl: gl(Infinity) })(30), "cap");
});

test("no queue and no fence -> none", async () => {
  assert.equal(await settled({})(1000), "none");
});
