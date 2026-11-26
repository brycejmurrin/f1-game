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
// in below vStd 10, so the from-rest pre-roll field moves; the reset(*) rows are unchanged); re-recorded on top for
// #6568 (Bryce #6565: HARD corners at the player's envelope, DIFF.hard.corner 1.072, + ERS defend floor 0.12 move
// the AI field in the same pre-roll; the reset(*) rows are unchanged again).
const PIN = {
  "jump(undefined)": "0090476ba8ec741e",
  "park(undefined)": "27f68caaa6868a99",
  "aiPlace(undefined)": "ffe7f79ea60035bb",
  "reset(undefined)": "a9330b3062bc7706",
  "cinematic(undefined)": "39092fd66e13a4ba",
  "jump(-0.25)": "84d93794b1427783",
  "park(-0.25)": "7a4d5d1c1e5c2595",
  "aiPlace(-0.25)": "10ff6063a7b74d56",
  "reset(-0.25)": "54f6cdd37257a46c",
  "cinematic(-0.25)": "93c7ac87e2e48f04",
  "jump(0)": "0090476ba8ec741e",
  "park(0)": "27f68caaa6868a99",
  "aiPlace(0)": "ffe7f79ea60035bb",
  "reset(0)": "a9330b3062bc7706",
  "cinematic(0)": "b62d7485388c875b",
  "jump(0.5)": "e39e791f24397b3d",
  "park(0.5)": "7f2f39158f867a65",
  "aiPlace(0.5)": "7dc6c19973896cdc",
  "reset(0.5)": "66010d8437595070",
  "cinematic(0.5)": "c349e121f2f5f20d",
  "jump(1.25)": "3e556ba547a5105c",
  "park(1.25)": "1cb4301064a16444",
  "aiPlace(1.25)": "2c209078e5a9ac29",
  "reset(1.25)": "74383eda1c7e3bbf",
  "cinematic(1.25)": "1142463446a478a6",
  "pair()": "630b29f960126233",
  "pair(0.6,50)": "1a421a07193c53ff",
  "jam()": "8a912028459e2b85",
  "jam(3)": "055f867cd5d12832",
  "rival(12,1.5)": "ed5aa77db71bb8a9",
  "rival()": "7ec22b69ab527b17",
  "rivals": "cc78cc1e1a7f9f7f",
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
