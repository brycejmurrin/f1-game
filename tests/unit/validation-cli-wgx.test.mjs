// validation-cli-wgx.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/gfx/wgx-validate.mjs: the sky depth gate and the lastFailure diagnostic.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-wgx.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { skyDepthErrors } from "../../tools/gfx/wgx-validate.mjs";
import { ROOT } from "../helpers/validation-cli.mjs";

test("WGX sky gate requires both descriptors and exact comparison/write state", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  assert.deepEqual(skyDepthErrors(source), []);
  for (const name of ["skyPipeline", "skyPipelineMS"]) {
    const assignment = new RegExp(`${name} = device\\.createRenderPipeline\\(\\{[\\s\\S]*?depthStencil: \\{[^}]+\\}`);
    for (const [from, to] of [['depthCompare: "less-equal"', 'depthCompare: "less"'], ["depthWriteEnabled: false", "depthWriteEnabled: true"]]) {
      const changed = source.replace(assignment, (block) => block.replace(from, to));
      assert.ok(skyDepthErrors(changed).some((e) => e.startsWith(name)), `${name} ${to} must fail`);
    }
    assert.ok(skyDepthErrors(source.replace(`${name} = device.createRenderPipeline`, `${name} = device.notAPipeline`)).length > 0);
  }
  assert.ok(skyDepthErrors("// skyPipeline depthCompare: less-equal depthWriteEnabled: false").length > 0);
});

test("WGX diagnostic invokes lastFailure and serializes the returned record", () => {
  const source = fs.readFileSync(path.join(ROOT, "tools/gfx/wgx-validate.mjs"), "utf8");
  const expression = source.match(/out\.lastFailure = ([^;\n]+);/);
  assert.ok(expression, "page diagnostic must collect lastFailure");
  let calls = 0;
  const WGX = { lastFailure() { calls++; return { reason: "adapter denied", at: 42 }; } };
  const record = vm.runInNewContext(`(() => { const out = {}; ${expression[0]} return JSON.stringify(out); })()`, { window: { WGX }, WGX });
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(record), { lastFailure: { reason: "adapter denied", at: 42 } });
  assert.match(source, /lastFailure: state\.lastFailure/, "final report must expose the collected reason");
});

// #2186: sync-pr ran tooling-fast at --jobs=1 and every ci.yml node suite with
// no timeout, and outran a 30-min background ceiling.
