// Locked SIGNATURE / supplier options must resolve to their catalog
// `equivalent` (mesh, band, stats, label), not the category DEFAULT.
//
// Trap: DEFAULTS.tyres is `medium`. A McLaren save that asks for
// sig_mercedes_tyre (equivalent medium) or sig_rb_street (equivalent
// supersoft) used to fall straight to medium, so Faenza Street photographed
// as the yellow medium ring. parts-visual-distinctness already treats the
// equivalent as the visual peer; this file pins the resolve path.
//
// Run: node --test tests/unit/parts-locked-equivalent.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const mclaren = M.Teams.LIST.find((t) => t.id === "mclaren");
assert.ok(mclaren, "mclaren roster entry");

function tyreVisual(setup) {
  const r = M.Parts.resolveSetup({ ...M.Parts.DEFAULTS, ...setup }, mclaren);
  return r.visual.tyres;
}

function tyreOpt(setup) {
  return M.Parts.resolveSetup({ ...M.Parts.DEFAULTS, ...setup }, mclaren).options.tyres;
}

const bandKey = (b) => JSON.stringify(b);

test("a legal McLaren signature still resolves to itself", () => {
  const v = tyreVisual({ tyres: "sig_mclaren_tyre" });
  assert.equal(v.id, "sig_mclaren_tyre");
  assert.equal(bandKey(v.band), bandKey([1, 0.47, 0]));
});

test("locked sig_mercedes_tyre draws its equivalent (medium), not a foreign band", () => {
  // equivalent === DEFAULTS.tyres for this row — the point is the path, and
  // that McLaren does not receive the teal Brackley sidewall.
  const asked = M.Parts.CATALOG.find((c) => c.id === "tyres")
    .options.find((o) => o.id === "sig_mercedes_tyre");
  assert.equal(asked.equivalent, "medium");
  assert.equal(M.Parts.isOptionAvailable(asked, mclaren), false);

  const opt = tyreOpt({ tyres: "sig_mercedes_tyre" });
  const v = tyreVisual({ tyres: "sig_mercedes_tyre" });
  const med = tyreVisual({ tyres: "medium" });
  assert.equal(opt.id, "medium");
  assert.equal(opt.label, "Medium");
  assert.equal(v.id, "medium");
  assert.equal(bandKey(v.band), bandKey(med.band));
  assert.notEqual(bandKey(v.band), bandKey(asked.visual.band));
});

test("locked sig_rb_street draws supersoft, not the medium default", () => {
  const asked = M.Parts.CATALOG.find((c) => c.id === "tyres")
    .options.find((o) => o.id === "sig_rb_street");
  assert.equal(asked.equivalent, "supersoft");
  assert.equal(M.Parts.isOptionAvailable(asked, mclaren), false);

  const v = tyreVisual({ tyres: "sig_rb_street" });
  const soft = tyreVisual({ tyres: "supersoft" });
  const med = tyreVisual({ tyres: "medium" });
  assert.equal(v.id, "supersoft");
  assert.equal(bandKey(v.band), bandKey(soft.band));
  assert.notEqual(bandKey(v.band), bandKey(med.band));
});

test("getVisualTiers agrees with resolveSetup for a locked signature", () => {
  const setup = { ...M.Parts.DEFAULTS, tyres: "sig_rb_street" };
  const tiers = M.Parts.getVisualTiers(setup, mclaren);
  assert.equal(tiers._ids.tyres, "supersoft");
  assert.equal(tiers._visual.tyres.id, "supersoft");
  assert.equal(bandKey(tiers._visual.tyres.band), bandKey([0.88, 0.1, 0.3]));
});
