/* apex-surface-pin-vm.test.mjs — pins the __apex method set before the apex.js carves.
 * @doc Boots the game VM and compares Object.keys(__apex), sorted, with tests/data/apex-surface.json; every agentHelp() manifest entry must name a real hook (#6635 item 0).
 * A carve that silently drops (or adds) a hook fails here. An intentional change
 * edits tests/data/apex-surface.json in the same PR. ~3 s (one VM boot).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const PIN = new URL("../data/apex-surface.json", import.meta.url);
const PINNED = JSON.parse(fs.readFileSync(PIN, "utf8"));
const pinned = PINNED.keys;

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

test("the pinned list is sorted and has no duplicates", () => {
  assert.deepEqual(pinned, [...new Set(pinned)].sort());
});

test("Object.keys(__apex) matches tests/data/apex-surface.json", () => {
  const live = Object.keys(g.apex).sort();
  const have = new Set(live), want = new Set(pinned);
  const added = live.filter(k => !want.has(k));
  const dropped = pinned.filter(k => !have.has(k));
  assert.deepEqual({ added, dropped }, { added: [], dropped: [] },
    "__apex surface changed: edit tests/data/apex-surface.json in the same PR if it is intended");
});

test("every __apex member is a function, except the pinned namespaces", () => {
  const notFn = Object.keys(g.apex).filter(k => typeof g.apex[k] !== "function").sort();
  assert.deepEqual(notFn, PINNED.namespaces);
});

test("every agentHelp() manifest entry names a pinned hook", () => {
  const h = g.apex.agentHelp();
  const want = new Set(pinned);
  const entries = ["perceive", "know", "act", "detail"].flatMap(sec => Object.keys(h[sec] || {}));
  assert.ok(entries.length > 10, "manifest sections missing");
  const ghosts = entries.map(e => e.split("(")[0]).filter(n => !want.has(n));
  assert.deepEqual(ghosts, [], "agentHelp() lists a hook __apex does not have");
});
