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
// the AI field in the same pre-roll; the reset(*) rows are unchanged again); re-recorded for #6575 (a chaser past 0.25 s no longer drops laneClr, so the AI field moves in the pre-roll).
const PIN = {
  "jump(undefined)": "62cfcfb9ae82680b",
  "park(undefined)": "e615173eca0a3c8e",
  "aiPlace(undefined)": "99db78ab6cb29c19",
  "reset(undefined)": "a9330b3062bc7706",
  "cinematic(undefined)": "b6a9582b78841d34",
  "jump(-0.25)": "a53d625056fe63fa",
  "park(-0.25)": "d353fe5a7f5ced17",
  "aiPlace(-0.25)": "b8569a4f2eab85b4",
  "reset(-0.25)": "54f6cdd37257a46c",
  "cinematic(-0.25)": "747950c3855c8d62",
  "jump(0)": "62cfcfb9ae82680b",
  "park(0)": "e615173eca0a3c8e",
  "aiPlace(0)": "99db78ab6cb29c19",
  "reset(0)": "a9330b3062bc7706",
  "cinematic(0)": "1a227e895c3d0bde",
  "jump(0.5)": "b33304a19c69df53",
  "park(0.5)": "bc4dab67f210007b",
  "aiPlace(0.5)": "df080534246f14dd",
  "reset(0.5)": "66010d8437595070",
  "cinematic(0.5)": "459c0da3e8b529a3",
  "jump(1.25)": "40bb7339dc4e9f2a",
  "park(1.25)": "5a3cd78d37092344",
  "aiPlace(1.25)": "662e0fcc19730cb9",
  "reset(1.25)": "74383eda1c7e3bbf",
  "cinematic(1.25)": "75eb5a997c8c8c77",
  "pair()": "023f603a212e05e9",
  "pair(0.6,50)": "e1492e3c725933d5",
  "jam()": "c3c20a8d571e6c9f",
  "jam(3)": "49c0468d15ae5935",
  "rival(12,1.5)": "620a143b84d5ca2f",
  "rival()": "7ff9ccd4cacb68cb",
  "rivals": "05632436079786bc",
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
      G.agentCtl.freeze(false);
      const ret = run(A);
      const cars = G.cars.map((c) => FIELDS.map((f) => c[f]));
      got[name] = createHash("sha256").update(JSON.stringify(round({ ret, cars }))).digest("hex").slice(0, 16);
    }
    if (process.env.APEX_PIN_PRINT) { console.log(JSON.stringify(got, null, 2)); return; }
    assert.deepEqual(got, PIN);
  } finally { g.close(); }
});
