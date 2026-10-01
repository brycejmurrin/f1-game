/* photo-kit.test.mjs — composition grids, DoF hint, freecam bookmarks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = { Log: { info() {} } };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/photo-kit.js"), "utf8") + "\nthis.exported = PhotoKit;",
    ctx);
  return ctx.exported;
}

function memStore() {
  const disk = new Map();
  return {
    get(k, d) { return disk.has(k) ? disk.get(k) : d; },
    set(k, v) { disk.set(k, v); return true; },
    _disk: disk,
  };
}

test("nextGrid cycles off → thirds → golden → off", () => {
  const PK = load();
  assert.equal(PK.nextGrid("off"), "thirds");
  assert.equal(PK.nextGrid("thirds"), "golden");
  assert.equal(PK.nextGrid("golden"), "off");
});

test("saveMark / marksFor round-trip per track, capped at MAX_MARKS", () => {
  const PK = load();
  const store = memStore();
  for (let i = 0; i < PK.MAX_MARKS + 3; i++) {
    PK.saveMark(store, "monza", {
      name: "m" + i,
      eye: [i, 2, 0],
      target: [i, 1, 10],
      fov: 50,
      roll: 0,
    });
  }
  const list = PK.marksFor(store, "monza");
  assert.equal(list.length, PK.MAX_MARKS);
  assert.equal(list[0].name, "m3", "oldest dropped");
  assert.equal(PK.marksFor(store, "spa").length, 0, "other tracks untouched");
});

test("applyDof writes cam.dof and drives overlay CSS vars", () => {
  const PK = load();
  const cam = {};
  const style = new Map();
  const overlay = {
    hidden: true,
    style: { setProperty(k, v) { style.set(k, v); } },
    setAttribute() {},
  };
  const r = PK.applyDof(cam, 0.5, 0.5, overlay);
  assert.equal(cam.dof.focus, 0.5);
  assert.equal(cam.dof.blur, 0.5);
  assert.equal(r.blur, 0.5);
  assert.equal(overlay.hidden, false);
  assert.ok(style.get("--fc-dof-blur").endsWith("px"));
  PK.applyDof(cam, 0.5, 0, overlay);
  assert.equal(overlay.hidden, true, "blur ~0 hides the overlay");
});

test("free-cam.js wires GRID / SAVE MARK / DoF controls", () => {
  const fc = fs.readFileSync(path.join(ROOT, "js/camera/free-cam.js"), "utf8");
  assert.match(fc, /fc-grid/);
  assert.match(fc, /fc-mark-save/);
  assert.match(fc, /fc-dof-blur/);
  assert.match(fc, /PhotoKit/);
});
