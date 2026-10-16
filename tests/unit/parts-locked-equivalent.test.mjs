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

test("Audi factory Neuburg Compound band is team color2 (not supersoft magenta)", () => {
  const audi = M.Teams.LIST.find((t) => t.id === "audi");
  assert.ok(audi, "audi roster entry");
  const asked = M.Parts.CATALOG.find((c) => c.id === "tyres")
    .options.find((o) => o.id === "sig_audi_tyre");
  assert.equal(asked.equivalent, "compound_c4");
  assert.equal(bandKey(asked.visual.band), bandKey(audi.color2));
  assert.notEqual(bandKey(asked.visual.band), bandKey([0.75, 0.1, 0.3]));
  const tiers = M.Parts.getVisualTiers(M.Parts.FACTORY_PRESETS.audi, audi);
  assert.equal(tiers._ids.tyres, "sig_audi_tyre");
  assert.equal(bandKey(tiers._visual.tyres.band), bandKey(audi.color2));
});

// bug-hunt 9.9: factoryCache was keyed id|engine|ruleset, but every legend is
// id "legends" with its own `factory` (legends.js raceTeam / custom-team.js swap
// the team object on a legend switch), so the slot kept the FIRST legend's build.
test("two teams of one id with different `factory` resolve their own factory build", () => {
  const base = M.Teams.LIST.find((t) => t.id === "mclaren");
  const fa = { engine: "stock", aero: "minimal", tyres: "medium" };
  const fb = { engine: "stock", aero: "extreme", tyres: "medium" };
  const a = { id: "legends", engine: "stock", color: base.color, color2: base.color2, factory: fa };
  const b = { id: "legends", engine: "stock", color: base.color, color2: base.color2, factory: fb };
  assert.equal(M.Parts.getFactorySetup(a).aero, "minimal");
  assert.equal(M.Parts.getFactorySetup(b).aero, "extreme", "second legend must not be served the first legend's build");
  assert.notEqual(M.Parts.factoryKey(a), M.Parts.factoryKey(b));
  assert.equal(M.Parts.getFactorySetup(a).aero, "minimal", "and the first still resolves to its own");
  // A team with no factory object keeps the string-keyed (preset / DEFAULTS) path.
  assert.equal(M.Parts.getFactorySetup({ id: "legends", engine: "stock" }).aero, M.Parts.getFactorySetup({ id: "legends", engine: "stock" }).aero);
});
