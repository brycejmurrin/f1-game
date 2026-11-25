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

// sha256(JSON)[0:16] per scenario, recorded on 700f50c8 (pre-carve).
const PIN = {
  "jump(undefined)": "b11fd5bff7dda52a",
  "park(undefined)": "c8d818d60c297997",
  "aiPlace(undefined)": "90f9ea0d912a03e4",
  "reset(undefined)": "a9330b3062bc7706",
  "cinematic(undefined)": "5bc0e513b7a6ffc2",
  "jump(-0.25)": "e5434a1528d8bb83",
  "park(-0.25)": "79fff4287fd8e5f7",
  "aiPlace(-0.25)": "ed8836fb66bc5a5c",
  "reset(-0.25)": "54f6cdd37257a46c",
  "cinematic(-0.25)": "00e8aef367504e34",
  "jump(0)": "b11fd5bff7dda52a",
  "park(0)": "c8d818d60c297997",
  "aiPlace(0)": "90f9ea0d912a03e4",
  "reset(0)": "a9330b3062bc7706",
  "cinematic(0)": "79a0c848bd48f96f",
  "jump(0.5)": "ba53f3f5a6898f50",
  "park(0.5)": "584e671c0d4a92e3",
  "aiPlace(0.5)": "0bef5c6def10853d",
  "reset(0.5)": "66010d8437595070",
  "cinematic(0.5)": "5c61f1ddadfdb4b6",
  "jump(1.25)": "5124a13b3f332031",
  "park(1.25)": "b738584b5c5bd1f4",
  "aiPlace(1.25)": "c694e849bc5c4566",
  "reset(1.25)": "74383eda1c7e3bbf",
  "cinematic(1.25)": "9800c83a0518f348",
  "pair()": "f9dfd848429c7529",
  "pair(0.6,50)": "35844fd89cdd1737",
  "jam()": "c3556dd7e2d6158c",
  "jam(3)": "0ef2fa7e4ae39bf0",
  "rival(12,1.5)": "3be6eb993db015e9",
  "rival()": "857b6eca75689d56",
  "rivals": "d85d05e0d7171d54",
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
