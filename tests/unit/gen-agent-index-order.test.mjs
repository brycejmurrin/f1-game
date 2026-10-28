/* gen-agent-index-order.test.mjs — agent-index / hook page / impact-map order is
 * locale-free and stable: two runs over shuffled input must be byte-identical,
 * and two PRs that each add a module (or a circuit) merge to the fresh file in
 * either landing order.
 *
 * Bus a2eb670 (Fleet A): docs/agent-index.json / AGENT-HOOKS.md / impact-map.json
 * churned between gen hosts when localeCompare / insertion order differed.
 * Fix: cmpStr / sortById in tools/docs/gen-agent-index.mjs (D·W22a).
 *
 * 2026-10-27: #4020 (ui/hud-radio-lane) and #3982
 * (share/share-card-chips) landed 3.5 min apart; each renumbered the
 * rows' sequential `order`, git merged both clean, and the tip's index was
 * stale (341 vs 342) until #4054. The merge tests replay that pair through
 * `git merge-tree` in a scratch repo under artifacts/.
 *
 * Run: node --test tests/unit/gen-agent-index-order.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rosterOf } from "../../tools/gen/gen-arch-table.mjs";
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
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");
const INDEX_FILE = "docs/agent-index.json";

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

// ---- insertion merges (2026-10-27, #4020 + #3982) ----

/** `list` without `drop`, keeping order: the merge base both PRs branched from. */
const without = (list, drop) => list.filter((x) => !drop.includes(x));
const rosterWithout = (roster, drop) => new Map([...roster].filter(([p]) => !drop.includes(p)));

/** The pre-fix shape: each row also stores its roster index as `order` (key position as it was). */
function legacyRender(index, roster, circuitIds) {
  const pos = new Map([...roster.keys()].map((p, i) => [p, i]));
  const cpos = new Map(circuitIds.map((id, i) => [id, i]));
  return renderIndex({
    ...index,
    circuits: index.circuits.map(({ id, file, classic }) => ({ id, file, order: cpos.get(id), classic })),
    modules: index.modules.map(({ path: p, global, roster: label }) => ({ path: p, global, order: pos.get(p), roster: label })),
  });
}

/** Scratch repo: `ship` carries `base` as docs/agent-index.json, branches `a` and `b` each
 *  replace it. Returns git's merge of a+b and of b+a ({ clean, text }) — the two landing orders. */
function mergeBothWays(t, base, a, b) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "agent-index-merge-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }));
  const run = (...args) => cp.execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  run("init", "-q", "-b", "ship");
  run("config", "user.email", "t@example.invalid");
  run("config", "user.name", "t");
  run("config", "commit.gpgsign", "false");
  run("config", "gc.auto", "0");
  run("config", "maintenance.auto", "false");
  const put = (text, msg) => {
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, INDEX_FILE), text);
    run("add", "-A");
    run("commit", "-qm", msg);
  };
  put(base, "base");
  run("checkout", "-q", "-b", "a", "ship");
  put(a, "a");
  run("checkout", "-q", "-b", "b", "ship");
  put(b, "b");
  const merge = (ours, theirs) => {
    const r = cp.spawnSync("git", ["merge-tree", "--write-tree", "--no-messages", ours, theirs], { cwd: dir, encoding: "utf8" });
    assert.ok(r.status === 0 || r.status === 1, `git merge-tree ${ours} ${theirs}: ${r.stderr}`);
    const tree = r.stdout.split("\n")[0].trim();
    return { clean: r.status === 0, text: run("show", `${tree}:${INDEX_FILE}`) };
  };
  return { ab: merge("a", "b"), ba: merge("b", "a") };
}

/** Two picks far apart in sorted order (never adjacent rows), preferring `wanted` when present. */
function pickPair(all, wanted) {
  const have = wanted.filter((x) => all.includes(x));
  if (have.length === 2) return have;
  const sorted = all.slice().sort(cmpStr);
  return [sorted[Math.floor(sorted.length / 4)], sorted[Math.floor((3 * sorted.length) / 4)]];
}

test("module and circuit rows carry no positional counter", () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, INDEX_FILE), "utf8"));
  assert.ok(index.modules.length > 100 && index.circuits.length > 10);
  for (const row of index.modules) assert.deepEqual(Object.keys(row), ["path", "global", "roster"], row.path);
  for (const row of index.circuits) assert.deepEqual(Object.keys(row), ["id", "file", "classic"], row.id);
});

test("two PRs that each add a js/ module merge to the fresh index in either order", (t) => {
  const help = agentHelpFromSource();
  const full = rosterOf();
  const pair = pickPair([...full.keys()], [["js", "ui", "hud-radio-lane.js"], ["js", "share", "share-card-chips.js"]].map((p) => p.join("/")));
  const roster = {
    base: rosterWithout(full, pair),
    a: rosterWithout(full, [pair[1]]),
    b: rosterWithout(full, [pair[0]]),
    merged: full,
  };
  const idx = Object.fromEntries(Object.entries(roster).map(([k, r]) => [k, buildIndex(help, { roster: r })]));
  // One insertion adds one row and rewrites no other row.
  const baseRows = new Set(idx.base.modules.map((r) => JSON.stringify(r)));
  const added = idx.a.modules.filter((r) => !baseRows.has(JSON.stringify(r)));
  assert.deepEqual(added.map((r) => r.path), [pair[0]], "adding one module changes exactly its own row");
  assert.equal(idx.a.modules.length, idx.base.modules.length + 1);

  const fresh = renderIndex(idx.merged);
  const m = mergeBothWays(t, renderIndex(idx.base), renderIndex(idx.a), renderIndex(idx.b));
  assert.ok(m.ab.clean && m.ba.clean, `insertions of ${pair.join(" + ")} conflict`);
  assert.equal(m.ab.text, fresh, "A lands first: the tip must equal a fresh render");
  assert.equal(m.ba.text, fresh, "B lands first: the tip must equal a fresh render");

  // Witness: the pre-fix `order` counter cannot pass this test (the 2026-10-27 stale tip).
  const ids = MANIFEST.CIRCUITS;
  const legacy = mergeBothWays(t, legacyRender(idx.base, roster.base, ids), legacyRender(idx.a, roster.a, ids),
    legacyRender(idx.b, roster.b, ids));
  const legacyFresh = legacyRender(idx.merged, full, ids);
  assert.ok(!(legacy.ab.clean && legacy.ab.text === legacyFresh), "the sequential order counter merged to a fresh file: the witness is broken");
});

test("two PRs that each add a circuit merge to the fresh index in either order", (t) => {
  const help = agentHelpFromSource();
  const full = MANIFEST.CIRCUITS.slice();
  const pair = pickPair(full, []);
  // A new circuit is a circuits row plus its LAZY_CIRCUIT def and LAZY_SCENERY module rows.
  const fullRoster = rosterOf();
  const filesOf = (id) => [...fullRoster].filter(([p, label]) => /^LAZY_(CIRCUIT|SCENERY)$/.test(label) && path.basename(p) === `${id}.js`).map(([p]) => p);
  for (const id of pair) assert.equal(filesOf(id).length, 2, `${id}: def + scenery module rows`);
  const sides = {
    base: [without(full, pair), rosterWithout(fullRoster, pair.flatMap(filesOf))],
    a: [without(full, [pair[1]]), rosterWithout(fullRoster, filesOf(pair[1]))],
    b: [without(full, [pair[0]]), rosterWithout(fullRoster, filesOf(pair[0]))],
    merged: [full, fullRoster],
  };
  const idx = Object.fromEntries(Object.entries(sides).map(([k, [c, r]]) => [k, buildIndex(help, { circuits: c, roster: r })]));
  const baseRows = new Set(idx.base.circuits.map((r) => JSON.stringify(r)));
  assert.deepEqual(idx.a.circuits.filter((r) => !baseRows.has(JSON.stringify(r))).map((r) => r.id), [pair[0]]);

  const fresh = renderIndex(idx.merged);
  const m = mergeBothWays(t, renderIndex(idx.base), renderIndex(idx.a), renderIndex(idx.b));
  assert.ok(m.ab.clean && m.ba.clean, `insertions of ${pair.join(" + ")} conflict`);
  assert.equal(m.ab.text, fresh, "A lands first: the tip must equal a fresh render");
  assert.equal(m.ba.text, fresh, "B lands first: the tip must equal a fresh render");

  const legacy = mergeBothWays(t, ...["base", "a", "b"].map((k) => legacyRender(idx[k], sides[k][1], sides[k][0])));
  assert.ok(!(legacy.ab.clean && legacy.ab.text === legacyRender(idx.merged, fullRoster, full)), "the circuit order witness is broken");
});
