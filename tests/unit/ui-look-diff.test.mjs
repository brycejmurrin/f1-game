/* look-diff (tools/ui/look-diff.mjs) pure half — knob catalog read from the shipped modules, arg parsing, pixel/geometry diff, DEAD/SUBTLE/VISIBLE classification, report + contact-sheet rendering. No browser, < 1 s. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { CliArgError } from "../../tools/lib/cli-args.mjs";
import {
  ROOT, ROUTES, buildCatalog, knobValues, parseArgs, planCells, diffRaw, geometryDelta,
  classify, cropBox, tally, renderMarkdown, VISIBLE_PCT,
} from "../../tools/ui/look-diff/core.mjs";
import { renderSheet } from "../../tools/ui/look-diff.mjs";
import { getScreen } from "../../tools/ui/menu-screens.mjs";

const catalog = buildCatalog();

test("catalog: every ScreenLooks screen plus title, each reachable through a menu-screens route", () => {
  const ids = catalog.map((s) => s.id);
  assert.deepEqual(ids, ["pause", "datahub", "select", "race", "career", "garage", "designer", "popups", "title"]);
  for (const s of catalog) {
    assert.equal(s.route, ROUTES[s.id], s.id);
    assert.ok(getScreen(s.route), `${s.id} -> ${s.route} has an open()`);
    assert.ok(s.knobs.length > 0, s.id);
  }
});

test("catalog: pause carries PauseOpts layout/side/dim, title carries TitleLayout layout/side", () => {
  const pause = catalog.find((s) => s.id === "pause");
  const keys = pause.knobs.map((n) => n.key);
  assert.deepEqual(keys.slice(-3), ["pause.layout", "pause.side", "pause.dim"]);
  assert.deepEqual(keys.slice(0, 4), ["btn", "w", "gap", "corners"]);
  assert.deepEqual(pause.knobs.find((n) => n.key === "pause.layout").values, ["grid", "list", "compact", "wide", "sidebar"]);
  const title = catalog.find((s) => s.id === "title");
  assert.deepEqual(title.knobs.map((n) => n.key), ["title.layout", "title.side"]);
  assert.equal(title.knobs[0].def, "grid");
});

test("knobValues: cycle = every non-default value, range = min and max minus the default", () => {
  assert.deepEqual(knobValues({ kind: "cycle", values: ["a", "b", "c"], def: "b" }), ["a", "c"]);
  assert.deepEqual(knobValues({ kind: "range", min: 60, max: 140, def: 100 }), [60, 140]);
  assert.deepEqual(knobValues({ kind: "range", min: 100, max: 150, def: 100 }), [150]);
});

test("parseArgs: defaults, lists, viewport and threshold", () => {
  const o = parseArgs([], catalog);
  assert.deepEqual(o.viewport, { width: 844, height: 390 });
  assert.equal(o.threshold, 0.5);
  assert.equal(o.touch, false);
  assert.equal(o.outDir, path.join(ROOT, "artifacts", "look-diff"));
  const p = parseArgs(["--screens=select,career", "--knobs", "density,pause.layout", "--viewport=932x430", "--touch", "--threshold=1"], catalog);
  assert.deepEqual(p.screens, ["select", "career"]);
  assert.deepEqual(p.knobs, ["density", "pause.layout"]);
  assert.deepEqual(p.viewport, { width: 932, height: 430 });
  assert.equal(p.touch, true);
  assert.equal(p.threshold, 1);
});

test("parseArgs: typos and bad values throw CliArgError", () => {
  for (const argv of [["--screen=select"], ["--viewport=big"], ["--threshold=-1"], ["--screens=nope"], ["--knobs=nope"], ["--out=js/x"]]) {
    assert.throws(() => parseArgs(argv, catalog), CliArgError, argv.join(" "));
  }
  assert.doesNotThrow(() => parseArgs(["--out=scratch/ld"], catalog));
});

test("planCells: filters by screen and by knob id or family key", () => {
  const plan = planCells(catalog, { screens: ["pause", "title"], knobs: ["layout"] });
  assert.deepEqual(plan.map((s) => s.id), ["pause", "title"]);
  assert.deepEqual(plan[0].knobs.map((n) => n.key), ["pause.layout"]);
  assert.deepEqual(plan[0].knobs[0].test, ["list", "compact", "wide", "sidebar"]);
  assert.equal(planCells(catalog, { knobs: ["title.side"] }).length, 1);
});

const raster = (w, h, fill) => ({ width: w, height: h, channels: 4, data: Buffer.alloc(w * h * 4, fill) });

test("diffRaw: identical, a changed block with its box, sub-tolerance noise, size mismatch", () => {
  const a = raster(10, 10, 0);
  assert.deepEqual(diffRaw(a, raster(10, 10, 0)), { changed: 0, total: 100, pct: 0, box: null });
  const b = raster(10, 10, 0);
  for (let y = 2; y < 4; y++) for (let x = 5; x < 8; x++) b.data[(y * 10 + x) * 4 + 1] = 200;
  const d = diffRaw(a, b);
  assert.equal(d.changed, 6); assert.equal(d.pct, 6);
  assert.deepEqual(d.box, { x: 5, y: 2, w: 3, h: 2 });
  assert.equal(diffRaw(a, raster(10, 10, 10)).changed, 0, "a delta within CHANNEL_TOL is noise");
  assert.equal(diffRaw(raster(10, 10, 0), raster(10, 12, 0)).changed, 20, "rows only one image has count as changed");
});

test("geometryDelta: moved, resized, gone and appeared boxes; sub-pixel jitter ignored", () => {
  const before = [{ key: "root", x: 0, y: 0, w: 100, h: 50 }, { key: "0:div", x: 10, y: 10, w: 20, h: 20 }, { key: "1:p", x: 0, y: 0, w: 1, h: 1 }];
  assert.equal(geometryDelta(before, before.map((b) => ({ ...b, x: b.x + 0.4 }))).changed, false);
  const after = [{ key: "root", x: 0, y: 0, w: 120, h: 50 }, { key: "0:div", x: 10, y: 30, w: 20, h: 20 }, { key: "2:nav", x: 0, y: 0, w: 5, h: 5 }];
  const g = geometryDelta(before, after);
  assert.equal(g.changed, true);
  assert.deepEqual(g.moved.map((m) => m.key).sort(), ["0:div", "1:p", "2:nav", "root"]);
  assert.equal(g.moved.find((m) => m.key === "root").dw, 20);
  assert.equal(g.moved.find((m) => m.key === "0:div").dy, 20);
});

test("classify: DEAD / SUBTLE / VISIBLE, geometry rescues DEAD, noise floor subtracted", () => {
  assert.equal(classify({ pct: 0.1, geometryChanged: false, threshold: 0.5 }), "DEAD");
  assert.equal(classify({ pct: 0.1, geometryChanged: true, threshold: 0.5 }), "SUBTLE");
  assert.equal(classify({ pct: 1.2, geometryChanged: false, threshold: 0.5 }), "SUBTLE");
  assert.equal(classify({ pct: VISIBLE_PCT, geometryChanged: false }), "VISIBLE");
  assert.equal(classify({ pct: 0.9, geometryChanged: false, threshold: 0.5, noisePct: 0.6 }), "DEAD");
  assert.equal(classify({ pct: 3.5, geometryChanged: false, noisePct: 1 }), "SUBTLE");
});

test("cropBox: union of the knob's diff boxes, padded and clamped to the frame", () => {
  assert.equal(cropBox([null, null], { width: 100, height: 100 }), null);
  assert.deepEqual(cropBox([{ x: 10, y: 10, w: 5, h: 5 }, null, { x: 80, y: 40, w: 10, h: 10 }], { width: 100, height: 60 }, 8),
    { x: 2, y: 2, w: 96, h: 56 });
});

test("report.md and index.html: a table per screen, relative image paths, no inline data URIs", () => {
  const rows = [
    { screen: "select", key: "corners", label: "CORNERS", value: "sharp", def: "round", pct: 4.2, class: "VISIBLE",
      geometry: { changed: false, moved: [] }, shot: "select/full/corners__sharp.png", zoom: "select/zoom/corners__sharp.png", zoomDefault: "select/zoom/corners__default.png" },
    { screen: "select", key: "head", label: "HEADINGS", value: "centre", def: "left", pct: 0.1, class: "DEAD",
      geometry: { changed: false, moved: [] }, shot: "select/full/head__centre.png" },
    { screen: "select", key: "tile", label: "TILE SIZE", value: 70, def: 100, class: "ERROR", error: "timeout" },
  ];
  const report = { generated: "2026-10-30T00:00:00Z", viewport: { width: 844, height: 390 }, touch: true, threshold: 0.5,
    screens: [{ id: "select", title: "TRACK SELECTOR", noisePct: 0, default: "select/full/default.png" }, { id: "garage", title: "GARAGE", error: "boot" }], rows };
  assert.deepEqual(tally(rows), { DEAD: 1, SUBTLE: 0, VISIBLE: 1, ERROR: 1 });
  const md = renderMarkdown(report).split("\n");
  const at = md.indexOf("## select — TRACK SELECTOR");
  assert.deepEqual(md.slice(at + 6, at + 9), [
    "| corners | sharp | 4.2 | — | VISIBLE |",
    "| head | centre | 0.1 | — | DEAD |",
    "| tile | 70 | — | — | ERROR (timeout) |",
  ]);
  assert.equal(md[md.indexOf("## garage — GARAGE") + 2], "Screen not reached: boot");
  const html = renderSheet(report);
  // Every picture is a relative file next to the sheet, in knob-row order: default first.
  assert.deepEqual([...html.matchAll(/<img src="([^"]*)"/g)].map((m) => m[1]), [
    "select/zoom/corners__default.png", "select/zoom/corners__sharp.png",
    "select/full/default.png", "select/full/head__centre.png",
    "select/full/default.png",
  ]);
  assert.deepEqual([...html.matchAll(/class="capture-caption">([^<]*)</g)].map((m) => m[1]).slice(1, 2), ["4.2 % changed · VISIBLE"]);
});

test("CLI: --list runs offline, --help exits 0, a bad screen exits 2", () => {
  const cli = path.join(ROOT, "tools/ui/look-diff.mjs");
  const list = spawnSync(process.execPath, [cli, "--list", "--screens=title"], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(list.stdout.split("\n").slice(1, 3).map((l) => l.trim().split(/\s+/)),
    [["title.layout", "def", "grid", "test", "stack,", "row"], ["title.side", "def", "auto", "test", "swap"]]);
  assert.equal(spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, "--screens=x"], { encoding: "utf8" }).status, 2);
});
