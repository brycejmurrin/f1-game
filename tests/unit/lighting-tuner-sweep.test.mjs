/* lighting-tuner-sweep pure helpers — no browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONDS,
  FLOOR,
  KNOB_OPEN,
  knobGateReason,
  pushExtreme,
  verdict,
} from "../../tools/lighting/lighting-tuner-sweep.mjs";

test("pushExtreme uses min for sunElev on day conditions", () => {
  const def = { id: "sunElev", min: -50, max: 50, def: 0 };
  assert.equal(pushExtreme(def, "day-dry"), -50);
  assert.equal(pushExtreme(def, "night-dry"), 50);
});

test("knobGateReason marks night-only and lamp knobs on day-dry", () => {
  const c = CONDS["day-dry"];
  assert.equal(knobGateReason("moonBright", "day-dry", c), "night-only");
  assert.equal(knobGateReason("nightAmbLift", "day-dry", c), "night-only");
  assert.equal(knobGateReason("bounceK", "day-dry", c), "lamps-off");
  assert.equal(knobGateReason("pcssPen", "day-dry", c), "software-gl2-no-pcss");
  assert.equal(knobGateReason("ambientMul", "day-dry", c), null);
});

test("verdict treats gated rows separately from inert", () => {
  assert.equal(verdict({ gated: "night-only", signal: 0, noise: 0 }), "gated");
  assert.equal(verdict({ signal: 10, noise: 1 }), "live");
  assert.equal(verdict({ signal: 0.5, noise: 0.4 }), "inert");
  assert.equal(verdict({ signal: 5, noise: 4 }), "noisy");
});

test("KNOB_OPEN fog and overcast gates match wx", () => {
  assert.ok(KNOB_OPEN.overcastFogMul(CONDS["day-overcast"]));
  assert.ok(!KNOB_OPEN.overcastFogMul(CONDS["day-dry"]));
  assert.ok(KNOB_OPEN.fogWxMul(CONDS["day-fog"]));
  assert.ok(!KNOB_OPEN.fogWxMul(CONDS["day-dry"]));
});

test("FLOOR stays above measured idle noise", () => {
  assert.ok(FLOOR >= 2.0);
});
