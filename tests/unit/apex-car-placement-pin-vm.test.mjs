/* apex-car-placement-pin-vm.test.mjs — characterization pin for js/agent/apex.js car placement (#6502).
 * jump / park / aiPlace / reset / cinematic / pair / jam / rival / rivals each run from the same
 * seeded reset; every car's placement fields plus the hook's return value are digested. The digests were
 * recorded on the tree BEFORE the carve (700f50c8), so a helper extraction that changes any
 * car's s/prog/x/xVis/vLat/launchOn — or a frac normalisation (undefined, −0.25, 0, 0.5, 1.25) — fails here.
 * Re-record ONLY for an intended behaviour change: APEX_PIN_PRINT=1 node --test <this file>. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

const FRACS = [undefined, -0.25, 0, 0.5, 1.25];
const FIELDS = ["s", "prog", "x", "xVis", "vLat", "launchOn", "speed", "lap", "finished", "_prevS", "px", "pz", "head", "rescueT"];
const r6 = (v) => typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v)) : v;
const round = (v) => JSON.parse(JSON.stringify(v, (_k, x) => r6(x)));

const SCENARIOS = {};
for (const f of FRACS) {
  const k = String(f);
  SCENARIOS[`jump(${k})`] = (A) => A.jump(f, 40, 1.2);
  SCENARIOS[`park(${k})`] = (A) => A.park(f);
  SCENARIOS[`aiPlace(${k})`] = (A) => A.aiPlace(3, f, 40, 0.5);
  SCENARIOS[`reset(${k})`] = (A) => A.reset(f, 30, 0.4, 42);
  SCENARIOS[`cinematic(${k})`] = (A) => { const r = A.cinematic(f); return r && { eye: r.eye, target: r.target, k: r.k }; };
}
SCENARIOS["pair()"] = (A) => A.pair();
SCENARIOS["pair(0.6,50)"] = (A) => A.pair(0.6, 50);
SCENARIOS["jam()"] = (A) => A.jam();
SCENARIOS["jam(3)"] = (A) => A.jam(3);
SCENARIOS["rival(12,1.5)"] = (A) => A.rival(12, 1.5);
SCENARIOS["rival()"] = (A) => A.rival();
SCENARIOS["rivals"] = (A) => A.rivals([{ dProg: 8, dx: -1 }, { dProg: -6, dx: 1.5, speed: 20 }, {}]);

// sha256(JSON)[0:16] per scenario, recorded on 700f50c8 (pre-carve); re-recorded for #6481 (the kerb cut fades
// in below vStd 10, so the from-rest pre-roll field moves; the reset(*) rows are unchanged).
const PIN = {
  "jump(undefined)": "f361ad36cc749491",
  "park(undefined)": "347ff4a301c3d22f",
  "aiPlace(undefined)": "ceba1b920af455e1",
  "reset(undefined)": "a9330b3062bc7706",
  "cinematic(undefined)": "c448de84bc07aa92",
  "jump(-0.25)": "c61dc4aa5a1e5f84",
  "park(-0.25)": "417a19f079d44ab9",
  "aiPlace(-0.25)": "6965221f452224f7",
  "reset(-0.25)": "54f6cdd37257a46c",
  "cinematic(-0.25)": "2e1ead1400c71abd",
  "jump(0)": "f361ad36cc749491",
  "park(0)": "347ff4a301c3d22f",
  "aiPlace(0)": "ceba1b920af455e1",
  "reset(0)": "a9330b3062bc7706",
  "cinematic(0)": "98ef0ee922b187f8",
  "jump(0.5)": "15d134961e7e4095",
  "park(0.5)": "ba33aa99d8ae06c2",
  "aiPlace(0.5)": "9447256ee22aa3c0",
  "reset(0.5)": "66010d8437595070",
  "cinematic(0.5)": "9d38920c6ca08783",
  "jump(1.25)": "c841d0d28cb87730",
  "park(1.25)": "ef716c7a73118ecd",
  "aiPlace(1.25)": "cd8ecedec6486e3d",
  "reset(1.25)": "74383eda1c7e3bbf",
  "cinematic(1.25)": "e6b2ac794fe3c2fc",
  "pair()": "c4a698049a72889c",
  "pair(0.6,50)": "910f2f62016ce7af",
  "jam()": "6afeee539d30b81e",
  "jam(3)": "fc8f229ab8f5cf98",
  "rival(12,1.5)": "8e009628107117d9",
  "rival()": "931c61ce21af699f",
  "rivals": "c23c344288249ef3",
};

test("car-placement hooks: every car's placement and the return value match the pre-carve pin", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex, G = g.G;
    A.headless(true);
    const got = {};
    for (const [name, run] of Object.entries(SCENARIOS)) {
      A.reset(0.1, 0, 0, 42); A.step(30);   // a moving field, the same for every scenario
      G.frozen = false;
      const ret = run(A);
      const cars = G.cars.map((c) => FIELDS.map((f) => c[f]));
      got[name] = createHash("sha256").update(JSON.stringify(round({ ret, cars }))).digest("hex").slice(0, 16);
    }
    if (process.env.APEX_PIN_PRINT) { console.log(JSON.stringify(got, null, 2)); return; }
    assert.deepEqual(got, PIN);
  } finally { g.close(); }
});
