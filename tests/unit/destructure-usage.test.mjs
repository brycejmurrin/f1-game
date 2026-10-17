// destructure-usage.test.mjs — a destructured script-global name that its provider no longer
// exports fails the structural guards instead of failing 30+ downstream tests (#2427).
// Run: node --test tests/unit/destructure-usage.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import { check, rosteredFiles } from "../../tools/check/destructure-usage.mjs";

const provider = { rel: "fixture:prov", src: 'const Prov = (function () {\n  "use strict";\n  return { alpha, beta };\n})();\n' };

test("a file destructuring a name the provider does not export fails, naming file, line and name", () => {
  const r = check([provider, { rel: "fixture:use", src: 'const { alpha, camVantage } = Prov;\n' }]);
  assert.deepEqual(r.missing.map((m) => [m.file, m.line, m.global, m.name, m.provider]), [["fixture:use", 1, "Prov", "camVantage", "fixture:prov"]]);
});

test("exported names, defaults, local shadows, expandos and unreadable exports all pass", () => {
  assert.equal(check([provider, { rel: "fixture:use", src: "const { alpha, beta } = Prov;\n" }]).missing.length, 0);
  assert.equal(check([provider, { rel: "fixture:use", src: "const { gone = 1 } = Prov;\n" }]).missing.length, 0, "a default tolerates a miss");
  assert.equal(check([provider, { rel: "fixture:use", src: "function f(Prov) { const { gone } = Prov; }\n" }]).missing.length, 0, "a parameter shadows the global");
  assert.equal(check([provider, { rel: "fixture:add", src: "Prov.gamma = 1;\n" }, { rel: "fixture:use", src: "const { gamma } = Prov;\n" }]).missing.length, 0, "an expando provides");
  const open = { rel: "fixture:open", src: "const Open = (function () { return { ...base }; })();\n" };
  assert.equal(check([open, { rel: "fixture:use", src: "const { anything } = Open;\n" }]).missing.length, 0, "a spread export is skipped, not guessed");
  assert.equal(check([provider, { rel: "fixture:ext", src: "Object.assign(Prov, mixin);\n" }, { rel: "fixture:use", src: "const { x } = Prov;\n" }]).missing.length, 0);
});

test("the current tree passes, and the check really looked at destructures", () => {
  const r = check(rosteredFiles());
  assert.deepEqual(r.missing, [], r.missing.map((m) => `${m.file}:${m.line} ${m.name} from ${m.global}`).join("\n"));
  assert.ok(r.checked > 20, `only ${r.checked} destructures resolved — the provider scan regressed`);
});
