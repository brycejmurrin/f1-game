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
// the AI field in the same pre-roll; the reset(*) rows are unchanged again); re-recorded for #7155 (wall and side-rub scrubs scale with PACE, so the
// pre-roll field moves; the reset(*) rows are unchanged).
const PIN = {
  "jump(undefined)": "5445709b55bc2ad5",
  "park(undefined)": "c53a6bd2bae621f6",
  "aiPlace(undefined)": "d6359454867a8665",
  "reset(undefined)": "a9330b3062bc7706",
  "cinematic(undefined)": "de65635f33a712d8",
  "jump(-0.25)": "ca0bea5eadd7abe8",
  "park(-0.25)": "f34b38a748d75160",
  "aiPlace(-0.25)": "cddb9613244256fa",
  "reset(-0.25)": "54f6cdd37257a46c",
  "cinematic(-0.25)": "48de695ca35c610b",
  "jump(0)": "5445709b55bc2ad5",
  "park(0)": "c53a6bd2bae621f6",
  "aiPlace(0)": "d6359454867a8665",
  "reset(0)": "a9330b3062bc7706",
  "cinematic(0)": "f3997b75ca5944e7",
  "jump(0.5)": "1de9acd45fa17c1a",
  "park(0.5)": "7d3548f13986bc8f",
  "aiPlace(0.5)": "5bbaa18b7019a6c0",
  "reset(0.5)": "66010d8437595070",
  "cinematic(0.5)": "5d9cb650c9b863ed",
  "jump(1.25)": "26a9f541ca6621d0",
  "park(1.25)": "abf48ead06c46f98",
  "aiPlace(1.25)": "5758508511534af9",
  "reset(1.25)": "74383eda1c7e3bbf",
  "cinematic(1.25)": "e2b83534f334695b",
  "pair()": "45ee44665522695b",
  "pair(0.6,50)": "ecea7cd67ee1acb5",
  "jam()": "fcf91576b11752a9",
  "jam(3)": "9ba205ee101bc6ad",
  "rival(12,1.5)": "d6251e8e1e7d02a7",
  "rival()": "b798e5103561d07f",
  "rivals": "fbaad23462128be0",
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
