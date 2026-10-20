// The livery editor skips the turntable's Car3D.build for a draft change that
// touches only MESH_FREE_DRAFT fields (js/garage/setup-sheet.js draftSkipsMesh):
// the decal atlas repaints, the preview mesh stays. That skip is only correct
// while every listed field leaves Car3D.build's output byte-identical — a field
// that recolours a vertex or moves one would leave the turntable on the old car.
//
// So this test does not trust the list: it builds the car, changes EVERY listed
// field at once to a non-default value, builds again and compares every
// attribute array. Two contexts — a plain team car, and one with the optional
// strips, a fin, a body style, a styled helmet and a design — because a field
// can be dormant on a plain car (helmet colours under the TEAM helmet).
//
// Why it matters for perf (B·L24 garage census, docs/notes/garage-perf-2026-10-20.md):
// a crest pill tap paid a full Car3D.build (~55-100 ms in SwiftShader here, several
// times that on a phone) for an atlas-only change.
//
// Pure Node (tools/car/parts-sweep.mjs loadParts runs car3d.js in a VM).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function meshFreeFields() {
  const src = readFileSync(path.join(ROOT, "js/garage/setup-sheet.js"), "utf8");
  const m = /const MESH_FREE_DRAFT = \{([^}]*)\}/.exec(src);
  assert.ok(m, "MESH_FREE_DRAFT not found — livePreviewDraft moved");
  return [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
}

const M = loadParts();
const LT = M.LiveryTex;
const alt = (ids, dflt) => (ids || []).find((v) => v !== dflt);
// A non-default value per draft field. A listed field with no entry here fails
// the test, so a new skip cannot land without being exercised.
const COLOUR = [0.12, 0.62, 0.34];
const VALUES = {
  logo: COLOUR, logo2: [0.9, 0.8, 0.1], logo3: [0.1, 0.1, 0.8], name: "TEST",
  sponsors: alt(LT && LT.SPONSOR_PACK_IDS, "default"), numFont: alt(LT && LT.NUM_FONT_IDS, "default"),
  finStyle: alt(LT && LT.TAIL_STYLE_IDS, "team"), finBadge: alt(LT && LT.FIN_BADGE_IDS, "logo"),
  crestStyle: alt(LT && LT.CREST_STYLE_IDS, "team"), crestTone: alt(LT && LT.CREST_TONE_IDS, "team"),
  crestFrame: alt(LT && LT.CREST_FRAME_IDS, "none"),
  coverBind: "saddleWrap", finArt: [0.8, 0.2, 0.6], finHandoff: "hardCut", gripTint: [0.7, 0.1, 0.1],
  patternTint: COLOUR, patternSecond: [0.2, 0.2, 0.9], patternPlacement: "wrap", patternSide: "left",
  patternWidth: 0.7, patternRepeat: 3, patternOffset: 0.2, patternTaper: 0.4, patternOpacity: 0.6,
  patternRotation: 15, patternStretch: 1.4, patternWeight: 0.8, patternKey: "accent",
  decalNoseTip: "off", decalCockpit: "off", decalPodTop: "off", decalHalo: "off",
};
const parts = (team) => M.Parts.getVisualTiers(M.Parts.DEFAULTS, team);
const build = (team, liv) => M.Car3D.build(liv.c1, liv.c2, { livery: liv, teamId: team.id, num: 7, parts: parts(team) });
const CONTEXTS = [
  { team: M.Teams.LIST[0], liv: { id: "custom_draft", c1: [0.9, 0.1, 0.1], c2: [1, 1, 1] } },
  { team: M.Teams.LIST[3] || M.Teams.LIST[1], liv: { id: "custom_draft", c1: [0.1, 0.2, 0.7], c2: [0.95, 0.8, 0.1],
    stripe: [1, 1, 1], noseStripe: [0.1, 0.1, 0.1], fin: [0.9, 0.9, 0.2], pod: [0.3, 0.3, 0.3], halo: [0.2, 0.2, 0.2],
    finShape: (M.Car3D.FIN_SHAPE_IDS || [])[1], bodyStyle: (M.Car3D.BODY_STYLE_IDS || [])[0],
    helmetStyle: "solid", helmetBase: [0.4, 0.1, 0.5], spineLogo: "tricolour", bodySplit: "lr" } },
];
const ATTRS = (d) => Object.keys(d).filter((k) => d[k] && typeof d[k] === "object" && typeof d[k].length === "number");

test("every MESH_FREE_DRAFT field has a probe value", () => {
  const missing = meshFreeFields().filter((k) => VALUES[k] === undefined);
  assert.deepEqual(missing, [], "add a non-default value to VALUES for each new MESH_FREE_DRAFT field");
});

for (const [i, c] of CONTEXTS.entries()) {
  test(`MESH_FREE_DRAFT fields leave Car3D.build byte-identical (context ${i}: ${c.team.id})`, () => {
    const base = build(c.team, c.liv);
    const changed = Object.assign({}, c.liv);
    for (const k of meshFreeFields()) if (VALUES[k] !== undefined) changed[k] = VALUES[k];
    const next = build(c.team, changed);
    const keys = ATTRS(base);
    assert.ok(keys.includes("pos") && keys.includes("col"), "Car3D.build returns pos/col arrays");
    assert.deepEqual(ATTRS(next), keys, "same attribute set");
    for (const k of keys) {
      const a = base[k], b = next[k];
      assert.equal(b.length, a.length, `${k} length`);
      let diff = -1;
      for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) { diff = j; break; }
      assert.equal(diff, -1, `${k}[${diff}] changed — a MESH_FREE_DRAFT field reaches the mesh`);
    }
  });
}
