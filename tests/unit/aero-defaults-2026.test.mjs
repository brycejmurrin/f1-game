/* 2026 aero defaults for non-factory parts — catalog options that omit
   beam/drs/board inherit regulation defaults (no beam, active flaps,
   bargeboard). Factory SIGNATURE recipes stay explicit and unchanged.
   Run: node --test tests/unit/aero-defaults-2026.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  for (const f of [
    "js/core/mat4.js",
    "js/data/teams.js",
    "js/car/parts.js",
    "js/car/helmets.js",
    "js/car/car-geometry.js",
    "js/car/car-wheels.js",
    "js/car/car-materials.js",
    "js/car/car-body-geom.js",
    "js/car/car3d.js",
  ]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("({ Car3D, Parts, Teams })", ctx);
}

const { Car3D, Parts, Teams } = load();

const FACTORY_AERO = Object.freeze({
  mercedes: { beam: 0, drs: 1, board: 1 },
  ferrari: { beam: 0, drs: 1, board: 2 },
  mclaren: { beam: 0, drs: 1, board: 1 },
  redbull: { beam: 0, drs: 1, board: 2 },
  alpine: { beam: 0, drs: 1, board: 2 },
  racingbulls: { beam: 0, drs: 1, board: 1 },
  haas: { beam: 0, drs: 1, board: 1 },
  williams: { beam: 0, drs: 1, board: 1 },
  audi: { beam: 0, drs: 1, board: 1 },
  astonmartin: { beam: 0, drs: 1, board: 2 },
  cadillac: { beam: 0, drs: 1, board: 1 },
});

test("buildAeroParts defaults are 2026 regulation (no beam, flaps, bargeboard)", () => {
  const style = Car3D.aeroStyleOf({});
  assert.equal(style.beam, 0, "default beam must be 0");
  assert.equal(style.drs, 1, "default drs must be 1");
  assert.equal(style.board, 1, "default board must be >= 1");
  const tier2 = Car3D.aeroStyleOf({ aero: 2 });
  assert.equal(tier2.beam, 0, "tier-2 must no longer imply a beam wing");
  assert.equal(tier2.drs, 1);
  assert.equal(tier2.board, 1);
});

test("every non-beam_wing catalog aero resolves to 2026 regulation flags", () => {
  const aero = Parts.CATALOG.find((c) => c.id === "aero");
  for (const opt of aero.options) {
    const style = Car3D.aeroStyleOf({
      aero: opt.visualTier != null ? opt.visualTier : 1,
      _visual: { aero: Object.assign({ id: opt.id, tier: opt.visualTier }, opt.visual || {}) },
    });
    if (opt.id === "beam_wing") {
      assert.equal(style.beam, 1, "beam_wing keeps the fantasy beam");
      assert.ok(style.drs >= 1, "beam_wing still gets active flaps");
      assert.ok(style.board >= 1, "beam_wing still gets a bargeboard");
      continue;
    }
    assert.equal(style.beam, 0, `${opt.id} beam`);
    assert.ok(style.drs >= 1, `${opt.id} drs`);
    assert.ok(style.board >= 1, `${opt.id} board`);
  }
});

test("all 11 factory SIGNATURE aero recipes stay on their #1198 stamps", () => {
  assert.equal(Teams.LIST.length, 11);
  for (const team of Teams.LIST) {
    const expect = FACTORY_AERO[team.id];
    assert.ok(expect, `missing factory pin for ${team.id}`);
    const setup = Parts.getFactorySetup(team);
    const resolved = Parts.resolveSetup(setup, team);
    const vis = resolved.visual.aero;
    assert.equal(vis.beam, expect.beam, `${team.id} factory beam`);
    assert.equal(vis.drs, expect.drs, `${team.id} factory drs`);
    assert.equal(vis.board, expect.board, `${team.id} factory board`);
  }
});

test("factory body mesh uses the stamped 2026 flags (defaults do not override)", () => {
  const C1 = [0.86, 0.0, 0.0], C2 = [0.1, 0.1, 0.1];
  for (const team of Teams.LIST) {
    const tiers = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
    const mesh = Car3D.build(C1, C2, { noWheels: true, parts: tiers });
    const tris = mesh.idx.length / 3;
    assert.ok(tris > 1000, `${team.id} built a body (${tris} tris)`);
    const style = Car3D.aeroStyleOf(tiers);
    const expect = FACTORY_AERO[team.id];
    assert.equal(style.beam, expect.beam, `${team.id} style beam`);
    assert.equal(style.drs, expect.drs, `${team.id} style drs`);
    assert.equal(style.board, expect.board, `${team.id} style board`);
  }
});
