// terrainYAt(x, z) is null off the rendered ribbon (docs/SCENERY-API.md). Used
// straight in arithmetic, `terrainYAt(x, z) - 1.5` reads null as 0: Dijon's two
// horizon ridges stood ~22 m above the floor slab and Mont-Tremblant's ski
// mountains sank 23 m into it (#7292). A circuit file must take the null branch
// first (an anchor height, the road height, pyMin) — never add to the bare call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/circuits/scenery");
// A terrainYAt(...) call (one level of nested parens) followed by + or -.
const BARE = /terrainYAt\((?:[^()]|\([^()]*\))*\)\s*[-+]/;

test("no circuit scenery adds to a bare terrainYAt() (null off the ribbon)", () => {
  const hits = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".js")).sort()) {
    readFileSync(path.join(DIR, f), "utf8").split("\n").forEach((line, i) => {
      if (!line.trim().startsWith("//") && BARE.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "fall back before the arithmetic:\n" + hits.join("\n"));
});

test("the pattern catches the shape it guards", () => {
  const lines = [
    "ridge(x, z, terrainYAt(x, z) - 1.5, ang)",
    "mountain(p[0], p[2], terrainYAt(p[0], p[2]) - 30, 2300)",
    "const y = terrainYAt(a.c[0], a.c[2]);",
    "(gy != null ? gy : a.c[1]) - 1.5",
  ];
  assert.deepEqual(lines.map((l) => BARE.exec(l) !== null), [true, true, false, false]);
});
