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

// sha256(JSON)[0:16] per scenario, recorded on 700f50c8 (pre-carve). Re-recorded for #6568, an intended AI change
// (Bryce #6565: HARD corners at the player's envelope, DIFF.hard.corner 1.072, plus the ERS defend floor 0.12):
// only the AI field's motion in the step(30) preamble moved; every reset(*) digest is unchanged.
const PIN = {
  "jump(undefined)": "fa8a375a6c5c482f",
  "park(undefined)": "9b764dc61217432f",
  "aiPlace(undefined)": "24297729d76d3b23",
  "reset(undefined)": "a9330b3062bc7706",
  "cinematic(undefined)": "ee5b67364c24f846",
  "jump(-0.25)": "8e1b6002f9e2bb34",
  "park(-0.25)": "25b34acfb43aac62",
  "aiPlace(-0.25)": "38e2e016310674c4",
  "reset(-0.25)": "54f6cdd37257a46c",
  "cinematic(-0.25)": "0b67ba503e3e286e",
  "jump(0)": "fa8a375a6c5c482f",
  "park(0)": "9b764dc61217432f",
  "aiPlace(0)": "24297729d76d3b23",
  "reset(0)": "a9330b3062bc7706",
  "cinematic(0)": "b67b2f60734fc088",
  "jump(0.5)": "012c6eb30c16a63b",
  "park(0.5)": "c296f21e09ea12d2",
  "aiPlace(0.5)": "6d7746a72d5d12f3",
  "reset(0.5)": "66010d8437595070",
  "cinematic(0.5)": "daedc3c7280e1c29",
  "jump(1.25)": "b7477297be0b4398",
  "park(1.25)": "4f46d633b3eba497",
  "aiPlace(1.25)": "45a7a5a7299c44f6",
  "reset(1.25)": "74383eda1c7e3bbf",
  "cinematic(1.25)": "74c93882735846f8",
  "pair()": "c882eee466986023",
  "pair(0.6,50)": "7e27c4bca3db4110",
  "jam()": "323ff1811eda4f97",
  "jam(3)": "b026ddf76e45b17e",
  "rival(12,1.5)": "09ee88125e938b23",
  "rival()": "0e3326ab7396fd81",
  "rivals": "c2b0f210e85323c1",
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
