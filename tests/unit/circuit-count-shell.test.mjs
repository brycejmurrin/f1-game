// The shell's circuit numbers (index.html meta description, manifest.json) are
// copy, and copy drifts: both said 24 / "24-round season plus 16 classic" long
// after the roster reached 52 (24 season rounds + 28 classics). They are
// pinned here to Tracks.LIST, read from the booted game, so adding a circuit
// fails this test until the copy is updated.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const g = await createGame({});
const counts = JSON.parse(vm.runInContext(
  "JSON.stringify({ all: Tracks.LIST.length, classic: Tracks.LIST.filter((t) => t.classic).length, season: Tracks.SEASON.length })", g.ctx));

test("Tracks.LIST is season rounds plus classics", () => {
  assert.equal(counts.all, counts.season + counts.classic);
  assert.ok(counts.all >= 52, `roster shrank to ${counts.all}`);
});

test("index.html meta description states the real circuit count", () => {
  const m = read("index.html").match(/<meta name="description" content="([^"]*)"/);
  assert.ok(m, "meta description missing");
  assert.match(m[1], new RegExp(`\\bDrive ${counts.all} real circuits\\b`), `description: ${m[1]}`);
});

test("manifest.json description states the season and classic counts", () => {
  const d = JSON.parse(read("manifest.json")).description;
  assert.match(d, new RegExp(`\\ba ${counts.season}-round season plus ${counts.classic} classic circuits\\b`), `description: ${d}`);
});
