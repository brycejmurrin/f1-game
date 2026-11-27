/* track-maps-drs-labels.test.mjs — pin for #7052 (gardener js/ui 1, #6548 item 2).
 * The DRS metre-label helpers and drawElevProfile moved from select-screen.js
 * into TrackMaps. The table below passed against the old Menus.* helpers before
 * the move; it now runs through TrackMaps, and Menus keeps forwarders.
 * Run: node --test tests/unit/track-maps-drs-labels.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rel = "js/ui/track-maps.js";
const sb = { Math, Array, Object, JSON, Number, String, Map, Set, isFinite, isNaN, console, devicePixelRatio: 1 };
sb.window = sb;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var"), sb, { filename: absSrc(rel) });
const TM = sb.TrackMaps;

test("drsZoneWraps: wrap flag, end past one lap, or folded end", () => {
  const rows = [
    [{ a: 0.5, b: 0.4 }, true], [{ a: 0.2, b: 0.8 }, false], [{ a: 0.9, b: 1.05 }, true],
    [{ a: 0.9, b: 1 }, false], [{ a: 0.1, b: 0.2, wrap: true }, true], [{ a: 0.3, b: 0.3 }, false],
  ];
  for (const [z, want] of rows) assert.equal(TM.drsZoneWraps(z), want, JSON.stringify(z));
});

test("drsZoneLapMetre: rounds and folds past one lap", () => {
  const rows = [[0, 5771, 0], [0.93, 5771, 5367], [0.09, 5771, 519], [1, 5771, 5771], [1.1, 5000, 500], [0.5, 4999, 2500]];
  for (const [f, len, want] of rows) assert.equal(TM.drsZoneLapMetre(f, len), want, f + "/" + len);
});

test("drsZoneRangeHtml: plain range vs S/F wrap", () => {
  assert.equal(TM.drsZoneRangeHtml({ a: 0.2, b: 0.4 }, 5000), "1000 m &ndash; 2000 m");
  assert.equal(TM.drsZoneRangeHtml({ a: 0.93, b: 0.09, wrap: true }, 5771),
    "5367 m <span aria-label=\"crossing start/finish\">&rarr; S/F &rarr;</span> 519 m");
});

test("drawElevProfile: no profile hides the target and paints nothing", () => {
  const cv = { hidden: false, clientWidth: 100, clientHeight: 30, getContext() { throw new Error("must not paint"); } };
  const def = { id: "nope-elev" };
  assert.equal(TM.drawElevProfile(cv, def), false);
  assert.equal(cv.hidden, true);
  const cv2 = { hidden: false }, wrap = { hidden: false };
  assert.equal(TM.drawElevProfile(cv2, def, wrap), false);
  assert.equal(wrap.hidden, true);
  assert.equal(TM.drawElevProfile(null, def), false);
});
