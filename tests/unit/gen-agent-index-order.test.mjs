/* gen-agent-index-order.test.mjs — agent-index / hook page / impact-map order is
 * locale-free and stable: two runs over shuffled input must be byte-identical.
 *
 * Bus a2eb670 (Fleet A): docs/agent-index.json / AGENT-HOOKS.md / impact-map.json
 * churned between gen hosts when localeCompare / insertion order differed.
 * Fix: cmpStr / sortById in tools/docs/gen-agent-index.mjs (D·W22a).
 *
 * Run: node --test tests/unit/gen-agent-index-order.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentHelpFromSource,
  buildImpactMap,
  buildIndex,
  cmpIdThenPath,
  cmpStr,
  flattenHooks,
  renderHookPage,
  renderImpact,
  renderIndex,
  sortById,
  sortImpactMap,
} from "../../tools/docs/gen-agent-index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function shuffleInPlace(arr, seed = 1) {
  // Deterministic LCG shuffle so the test itself does not flake.
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Rebuild a plain object with keys inserted in `order`. */
function reorderKeys(obj, order) {
  const out = {};
  for (const k of order) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  for (const k of Object.keys(obj)) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = obj[k];
  }
  return out;
}

/** Shuffle every string-keyed table inside an agentHelp() manifest. */
function shuffleManifest(manifest, seed) {
  const out = { ...manifest };
  for (const group of Object.keys(manifest)) {
    const table = manifest[group];
    if (!table || typeof table !== "object" || Array.isArray(table)) continue;
    const keys = Object.keys(table);
    shuffleInPlace(keys, seed + keys.length);
    out[group] = reorderKeys(table, keys);
  }
  return out;
}

function listSpecFiles() {
  const listed = [];
  for (const [dir, re] of [["tests/specs", /\.spec\.js$/], ["tests/unit", /\.test\.(mjs|cjs)$/]]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).filter((n) => re.test(n))) listed.push(`${dir}/${name}`);
  }
  return listed;
}

test("cmpStr is locale-free plain < (not localeCompare)", () => {
  assert.equal(cmpStr("a", "b"), -1);
  assert.equal(cmpStr("b", "a"), 1);
  assert.equal(cmpStr("same", "same"), 0);
  // Underscore / ASCII ordering must not depend on locale.
  assert.equal(cmpStr("Z", "a"), -1); // 'Z' < 'a' in UTF-16
  assert.equal(cmpIdThenPath("hook", "hook", "a()", "b()"), -1);
  assert.equal(cmpIdThenPath("a", "b", "z", "a"), -1);
});

test("sortById is stable on equal ids (ties by path)", () => {
  const items = [
    { id: "b", path: "z" },
    { id: "a", path: "m" },
    { id: "b", path: "a" },
    { id: "a", path: "a" },
  ];
  shuffleInPlace(items, 9);
  const sorted = sortById(items, (x) => x.id, (x) => x.path);
  assert.deepEqual(sorted.map((x) => `${x.id}:${x.path}`), [
    "a:a", "a:m", "b:a", "b:z",
  ]);
});

test("flattenHooks / buildIndex are byte-identical across shuffled manifests", () => {
  const base = agentHelpFromSource();
  const a = renderIndex(buildIndex(shuffleManifest(base, 11)));
  const b = renderIndex(buildIndex(shuffleManifest(base, 99)));
  const c = renderIndex(buildIndex(base));
  assert.equal(a, b, "two shuffled manifests must render the same index");
  assert.equal(a, c, "shuffled input must match canonical buildIndex()");
  const ha = renderHookPage(buildIndex(shuffleManifest(base, 3)));
  const hb = renderHookPage(buildIndex(shuffleManifest(base, 77)));
  assert.equal(ha, hb);
  assert.equal(ha, renderHookPage(buildIndex(base)));
  // Hook name order within a group is by id, not insertion order.
  const hooks = flattenHooks(shuffleManifest(base, 42));
  for (let i = 1; i < hooks.length; i++) {
    const prev = hooks[i - 1];
    const cur = hooks[i];
    if (prev.group === cur.group) {
      assert.ok(
        cmpIdThenPath(prev.name, cur.name, prev.signature, cur.signature) <= 0,
        `${prev.name} before ${cur.name}`,
      );
    }
  }
});

test("buildImpactMap is byte-identical across shuffled spec lists", () => {
  const canonical = renderImpact(buildImpactMap());
  const listed = listSpecFiles();
  const listA = listed.slice();
  const listB = listed.slice();
  shuffleInPlace(listA, 5);
  shuffleInPlace(listB, 21);
  const outA = renderImpact(buildImpactMap(listA));
  const outB = renderImpact(buildImpactMap(listB));
  assert.equal(outA, outB, "shuffled spec walk must not change impact-map bytes");
  assert.equal(outA, canonical);
  // Top-level map keys stay sorted by id.
  const keys = Object.keys(JSON.parse(outA).map);
  const sorted = keys.slice().sort(cmpStr);
  assert.deepEqual(keys, sorted);
  // sortImpactMap is idempotent.
  assert.deepEqual(sortImpactMap(JSON.parse(outA).map), JSON.parse(outA).map);
});
