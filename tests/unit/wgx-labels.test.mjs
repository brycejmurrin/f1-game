/* wgx-labels.test.mjs — every WGX GPU object gets a label; passes push/pop
 * debug groups; a validation-shaped message names the labelled object (#2964).
 *
 * Run: node --test tests/unit/wgx-labels.test.mjs   (test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadLabels() {
  const sb = { window: {}, console };
  vm.createContext(sb);
  vm.runInContext(read("js/render/webgpu/wgx-debug-labels.js") + "\nthis.L = WGXDebugLabels;", sb);
  sb.L._resetCounters();
  return sb.L;
}

function mockDevice() {
  const created = { buffers: [], textures: [], pipelines: [], groups: [], encoders: [] };
  const debugGroups = [];
  const device = {
    createBuffer(desc) {
      const buf = { desc: { ...desc }, label: desc && desc.label };
      created.buffers.push(buf);
      return buf;
    },
    createTexture(desc) {
      const tex = { desc: { ...desc }, label: desc && desc.label };
      created.textures.push(tex);
      return tex;
    },
    createSampler(desc) { return { desc: { ...desc }, label: desc && desc.label }; },
    createBindGroup(desc) {
      const g = { desc: { ...desc }, label: desc && desc.label };
      created.groups.push(g);
      return g;
    },
    createBindGroupLayout(desc) { return { desc: { ...desc }, label: desc && desc.label }; },
    createPipelineLayout(desc) { return { desc: { ...desc }, label: desc && desc.label }; },
    createRenderPipeline(desc) {
      const p = { desc: { ...desc }, label: desc && desc.label };
      created.pipelines.push(p);
      return p;
    },
    createShaderModule(desc) { return { desc: { ...desc }, label: desc && desc.label }; },
    createQuerySet(desc) { return { desc: { ...desc }, label: desc && desc.label }; },
    createCommandEncoder(desc) {
      const enc = {
        desc,
        pushDebugGroup(label) { debugGroups.push(["push", label]); },
        popDebugGroup() { debugGroups.push(["pop"]); },
        beginRenderPass(desc) {
          let ended = false;
          return {
            end() {
              if (ended) return;
              ended = true;
            },
          };
        },
        beginComputePass(desc) {
          return { end() {} };
        },
        finish() { return {}; },
      };
      created.encoders.push(enc);
      return enc;
    },
  };
  return { device, created, debugGroups };
}

test("WGXDebugLabels.install stamps labels on every create* descriptor", () => {
  const L = loadLabels();
  const { device, created } = mockDevice();
  L.install(device);

  device.createBuffer({ size: 64, usage: 0x40 });
  device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: 0x10 });
  device.createRenderPipeline({ layout: "auto", vertex: { module: {}, entryPoint: "main" } });
  device.createBindGroup({ layout: {}, entries: [] });

  assert.equal(created.buffers[0].desc.label, "wgx-buffer-1");
  assert.equal(created.textures[0].desc.label, "wgx-texture-1");
  assert.equal(created.pipelines[0].desc.label, "wgx-render-pipeline-1");
  assert.equal(created.groups[0].desc.label, "wgx-bind-group-1");
});

test("install preserves an author-supplied label", () => {
  const L = loadLabels();
  const { device, created } = mockDevice();
  L.install(device);
  device.createBuffer({ size: 16, usage: 0x40, label: "frame-ubo" });
  assert.equal(created.buffers[0].desc.label, "frame-ubo");
});

test("beginRenderPass push/popDebugGroup names the pass label", () => {
  const L = loadLabels();
  const { device, debugGroups } = mockDevice();
  L.install(device);
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [] });
  pass.end();
  assert.deepEqual(debugGroups, [
    ["push", "wgx-render-pass-1"],
    ["pop"],
  ]);
});

test("a WGX validation-shaped message names the labelled object", () => {
  const L = loadLabels();
  const { device, created } = mockDevice();
  L.install(device);
  device.createBuffer({ size: 32, usage: 0x40 });
  const label = created.buffers[0].desc.label;
  const msg = L.validationMessage("Buffer", label, "used in submit after destroy.");
  assert.match(msg, /\[Invalid Buffer \(wgx-buffer-1\)\]/);
  assert.match(msg, /used in submit after destroy/);
  // Prove the labelled name is what an agent greps out of a Dawn-style dump.
  assert.ok(msg.includes(label), "validation message must carry the object label");
});

test("wgx.js installs labels after a healthy requestDevice", () => {
  const src = read("js/render/webgpu/wgx.js");
  assert.match(src, /WGXDebugLabels\.install\(device\)/);
  assert.match(read("tools/manifest.cjs"), /wgx-debug-labels\.js/);
});

test("apex-gpu-capture is off by default and registered with one apex.js line", () => {
  const cap = read("js/agent/apex-gpu-capture.js");
  assert.match(cap, /apex26\.gpuCapture/);
  assert.match(cap, /Off by default/);
  assert.match(cap, /spector\.bundle\.js/);
  assert.match(cap, /webgl-lint\.js/);
  // Zero cost when off: no top-level script injection — only loadScript on enable.
  assert.doesNotMatch(cap, /loadScript\([^)]+\)\s*;\s*$/m);
  const apex = read("js/agent/apex.js");
  const hits = apex.match(/gpuCapture:/g) || [];
  assert.equal(hits.length, 1, "exactly one registration line in apex.js");
  assert.match(read("tools/manifest.cjs"), /apex-gpu-capture\.js/);
});

test("vendored Spector + webgl-lint are hash-pinned and licensed", () => {
  const m = JSON.parse(read("vendor/gpu-capture/MANIFEST.json"));
  for (const f of Object.keys(m.files)) {
    const buf = fs.readFileSync(path.join(ROOT, "vendor/gpu-capture", f));
    assert.equal(
      crypto.createHash("sha256").update(buf).digest("hex"),
      m.files[f].sha256,
      f,
    );
  }
  assert.ok(m.files["spector.bundle.js"]);
  assert.ok(m.files["webgl-lint.js"]);
  assert.ok(m.files["SPECTOR-LICENSE.txt"]);
  assert.ok(m.files["WEBGL-LINT-LICENSE.md"]);
});
