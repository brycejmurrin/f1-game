/* reach-score (UI layout program G5): zone table, primary pick, dead space, both input formats, CLI outputs. No browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = path.join(ROOT, "tests/fixtures/ui-reach");
const CLI = path.join(ROOT, "tools/ui/reach-score.mjs");
const R = await import("../../tools/ui/reach-score.mjs");
const VP = { w: 844, h: 390 };

test("zoneOf: side bands and bottom band are easy, top centre hard, the rest ok", () => {
  assert.equal(R.zoneOf(40, 300, VP), "easy");   // left thumb
  assert.equal(R.zoneOf(800, 200, VP), "easy");  // right thumb
  assert.equal(R.zoneOf(422, 370, VP), "easy");  // bottom band, centre
  assert.equal(R.zoneOf(422, 30, VP), "hard");   // top centre
  assert.equal(R.zoneOf(422, 200, VP), "ok");    // middle
  assert.equal(R.zoneOf(810, 20, VP), "ok");     // top corner: thumb stretch, not easy
});

test("ZONES is data: every band is a valid fraction rect", () => {
  for (const z of R.ZONE_ORDER) for (const b of R.ZONES[z]) {
    const [x0, y0, x1, y1] = b.rect;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 && x0 < x1 && y0 < y1, `${z}/${b.name}`);
  }
});

test("deadSpace: empty root is 1, full cover is 0, half cover is 0.5; clipped to the viewport", () => {
  const root = { x: 0, y: 0, w: 800, h: 400 };
  assert.equal(R.deadSpace(root, [], { w: 800, h: 400 }), 1);
  assert.equal(R.deadSpace(root, [root], { w: 800, h: 400 }), 0);
  assert.equal(R.deadSpace(root, [{ x: 0, y: 0, w: 400, h: 400 }, { x: 100, y: 0, w: 300, h: 400 }], { w: 800, h: 400 }), 0.5);
  assert.equal(R.deadSpace({ x: 0, y: 0, w: 1600, h: 400 }, [{ x: 0, y: 0, w: 800, h: 400 }], { w: 800, h: 400 }), 0);
  assert.equal(R.deadSpace({ x: 900, y: 0, w: 10, h: 10 }, [], { w: 800, h: 400 }), null);
});

test("pickPrimary: override > data-menu-default > action word > autofocus > focus > bigbtn; disabled never", () => {
  const t = (o) => ({ x: 0, y: 0, w: 50, h: 50, ...o });
  const back = t({ sel: "#back", text: "BACK", autofocus: true, cls: "bigbtn alt" });
  const go = t({ sel: "#go", text: "GO" });
  const def = t({ sel: "#def", text: "Career", menuDefault: true });
  const dead = t({ sel: "#dead", text: "START", disabled: true, y: 300 });
  assert.equal(R.pickPrimary("s", [back, go, def, dead]).by, "data-menu-default");
  assert.equal(R.pickPrimary("s", [back, go, dead]).tap.sel, "#go");
  assert.equal(R.pickPrimary("s", [back, dead]).by, "autofocus");
  assert.equal(R.pickPrimary("s", [back, go], { s: "#back" }).by, "override");
  assert.equal(R.pickPrimary("s#tab", [back, go], { s: "#back" }).tap.sel, "#back");
  assert.equal(R.pickPrimary("s", [t({ sel: "#f", focused: true })]).by, "focus");
  assert.equal(R.pickPrimary("s", [t({ sel: "#b", cls: "bigbtn" }), t({ sel: "#a", cls: "bigbtn alt" })]).tap.sel, "#b");
  assert.equal(R.pickPrimary("s", [dead]).tap, null);
});

test("audit dir: proposed-shape dumps score fully, today's shape is partial, skipped cells drop", () => {
  const screens = R.loadInput(path.join(FIX, "audit"));
  assert.deepEqual(screens.map((s) => s.screen), ["title", "select", "settings"]);
  const [title, select, settings] = screens.map((s) => R.scoreScreen(s, { viewport: VP }));

  assert.equal(title.partial, false);
  assert.deepEqual(title.primary, { sel: "#m-career", text: "CAREER", zone: "easy", by: "data-menu-default" });
  assert.deepEqual(title.share, { easy: 0.5, ok: 0.25, hard: 0.25 });
  assert.equal(title.underFloor, 1);
  assert.equal(title.verdict, "fair"); // 25 % of taps top-centre
  assert.ok(title.deadSpace > 0.6 && title.deadSpace < 0.75, String(title.deadSpace));

  assert.equal(select.primary.sel, "#sel-go");
  assert.equal(select.primary.by, "action-word");
  assert.equal(select.verdict, "move-primary");
  assert.equal(select.deadSpace, 0);

  assert.equal(settings.partial, true);
  assert.deepEqual(settings.missing, ["taps", "content"]);
  assert.equal(settings.viewportMismatch, true);
  assert.equal(settings.size, "852x393");
  assert.equal(settings.taps, 1); // hidden kid excluded
  assert.equal(settings.list, true);      // a menu of pages: no single primary judged
  assert.equal(settings.primary, null);
  assert.equal(settings.tapFloor, 52);
  assert.ok(settings.deadSpace > 0.25 && settings.deadSpace < 0.35, String(settings.deadSpace));
});

test("explorer inspection: controls as taps, root from layoutContexts, focus as primary", () => {
  const [s] = R.loadInput(path.join(FIX, "inspection.json"));
  const r = R.scoreScreen(s, { viewport: VP });
  assert.equal(r.screen, "datahub");
  assert.equal(r.taps, 3); // zero-size control dropped
  assert.equal(r.list, true);              // the data hub is a list screen
  assert.equal(r.primary, null);
  assert.equal(r.verdict, "fair");         // > maxHardShare of taps top-centre
  const { tap, by } = R.pickPrimary("popup", s.taps);   // the focus rule itself still holds
  assert.deepEqual([tap.sel, by], ["#dh-close", "focus"]);
  assert.equal(r.partial, true);
  assert.deepEqual(r.missing.slice(0, 1), ["content"]);
  assert.ok(r.share.hard > 0.6);
});

test("CLI writes reach.json, reach.md and SVGs; --json prints the report; bad args exit 2", () => {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const out = fs.mkdtempSync(path.join(ROOT, "artifacts", "ui-reach-test-"));
  try {
    const rel = path.relative(ROOT, out);
    const res = spawnSync(process.execPath, [CLI, "--in", path.join(FIX, "audit"), "--out", rel, "--svg", "--json",
      "--primary", "select=#sel-back"], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const rep = JSON.parse(res.stdout);
    assert.equal(rep.screens.length, 3);
    assert.equal(rep.screens.find((s) => s.screen === "select").primary.by, "override");
    assert.ok(fs.existsSync(path.join(out, "reach.json")));
    const md = fs.readFileSync(path.join(out, "reach.md"), "utf8");
    const row = md.split("\n").find((l) => l.startsWith("| title |")).split("|").map((c) => c.trim());
    assert.deepEqual(row.slice(1, 5), ["title", "ios-iphone-landscape", '#m-career "CAREER"', "easy"]);
    assert.equal(md.trimEnd().split("\n").at(-1), "Partial rows (1) lack: taps, content.");
    const svg = fs.readFileSync(path.join(out, "svg", "title__ios-iphone-landscape.svg"), "utf8");
    assert.equal(svg.slice(0, 120).split('viewBox="0 0 844 390"').length, 2);
    assert.equal(svg.split("#m-career (easy) PRIMARY").length, 2);
    assert.equal(spawnSync(process.execPath, [CLI], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync(process.execPath, [CLI, "--in", "x", "--viewport", "wide"], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" }).stdout.split("--viewport WxH").length, 2);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
