import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_PATH } from "../helpers/game-source.mjs";

// THE ARC MUST NOT REACH THE DRIVER (AGENTS.md §Physics). Nothing derived from
// track curvature may affect the player with assists off, and every consumer
// must sit in a legitimate channel: AI-only / assist-gated / broadcast-only /
// surface. The channel table lives in docs/PHYSICS.md §Curvature channels —
// for years AGENTS.md and PHYSICS.md each deferred it to the other and it
// existed NOWHERE, so nothing forced a new consumer to be classified. This
// guard closes that: every file that reads curvature (direct call or the
// destructured aliases) must appear in the table, so adding a consumer without
// classifying it is a red test, not a silent physics-contract erosion.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// A file "reads curvature" when it calls Tracks.curvature( directly, or when
// it destructures/aliases `curvature` out of Tracks/TrackSpline and calls the
// alias. The alias detection is deliberately simple (a `curvature` identifier
// appearing in a destructure plus a bare `curvature(` call) — both current
// aliases (js/track/core/mesh.js, js/track/tracks.js) match it, and a new exotic
// aliasing scheme showing up here should be a conversation anyway.
function readsCurvature(src) {
  if (/\bTracks\.curvature\s*\(/.test(src)) return true;
  // An INJECTED api is the third form, and it escaped this guard until
  // 2026-09-22: js/render/shared/driving-line.js reads `api.curvature(s)` and
  // js/track/scenery/pits.js reads `ctx.curvature(box.s)`, neither destructured
  // nor called on Tracks, so a bare-identifier alias test cannot see them. The
  // driving line's `cue()` is audible to the PLAYER (game.js `GameAudio.brakeCue`),
  // which is exactly the kind of consumer this table exists to classify.
  if (/\b[A-Za-z_$][\w$]*\.curvature\s*\(/.test(src)) return true;
  // T2-25: forms the alias regex missed — bracket access and a RENAMING destructure
  // (`{ curvature: c } = Tracks`, whose alias `c(` the bare-identifier test cannot see).
  if (/\[\s*["'`]curvature["'`]\s*\]\s*\(/.test(src)) return true;
  if (/(?:const|let|var)\s*\{[^}]*\bcurvature\s*:\s*[A-Za-z_$][\w$]*[^}]*\}\s*=\s*[A-Za-z_$][\w$.]*/.test(codeOnly(src))) return true;
  const destructured = /(?:const|let|var)\s*\{[^}]*\bcurvature\b[^}]*\}\s*=/.test(src);
  return destructured && /(?<![.\w])curvature\s*\(/.test(src);
}

// Call-site ledger. A file-level table cannot see a 10th read inside a file that is
// already classified (game.js has the player-path AND the AI-only reads in one
// file: a new Tracks.curvature() feeding steering would sit under the existing
// row). Every consumer therefore also pins how many call sites it has; adding
// one is a red test until the author raises the number HERE and classifies the
// new site in the docs/PHYSICS.md row. Counted on comment-stripped source.
const SITES = {
  "js/garage/exterior-geometry.js": 1,
  "js/agent/agentview.js": 2, "js/agent/apex.js": 9, "js/audio/driving-cues.js": 4,
  "js/camera/extra-rigs.js": 2, "js/camera/vantage.js": 3, "js/editor/validate.js": 1,
  "js/game.js": 10, "js/physics/aero-zones.js": 1, "js/physics/brake-cue.js": 1,
  "js/perf/soak-run.js": 2, "js/physics/debris-world.js": 1, "js/race/pit-geom.js": 1, "js/race/quali-model.js": 1,
  "js/race/real-race.js": 1, "js/render/shared/driving-line.js": 5, "js/track/core/mesh.js": 3,
  "js/track/scenery/build-props.js": 3, "js/track/scenery/pits.js": 2, "js/track/tracks.js": 3,
  "js/ui/track-maps.js": 5,
};
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\w"'`])\/\/.*$/gm, "$1");
}
function callSites(src) {
  const code = codeOnly(src);
  const direct = (code.match(/\b[A-Za-z_$][\w$]*\.curvature\s*\(/g) || []).length;
  // An aliased file: every use of the bare identifier (a call, or handing it on
  // to a helper) except the destructure itself and an object key.
  const destructure = /(?:const|let|var)\s*\{[^}]*\bcurvature\b[^}]*\}\s*=/;
  const aliased = destructure.test(code)
    ? (code.replace(destructure, "").match(/(?<![.\w])curvature\b(?!\s*:)/g) || []).length : 0;
  return direct + aliased;
}
const tableRows = () => {
  const table = fs.readFileSync(path.join(ROOT, "docs/PHYSICS.md"), "utf8");
  const section = table.split("## Curvature channels")[1];
  assert.ok(section, "docs/PHYSICS.md must carry the §Curvature channels table");
  // ROWS only: a file merely NAMED in the prose around the table (incident-sim,
  // grip-steer, onboard...) is not a classification.
  return [...section.matchAll(/^\| `([^`]+\.js)` \|/gm)].map((m) => m[1]);
};

test("every curvature consumer file appears as a row of the PHYSICS.md channel table", () => {
  const rows = new Set(tableRows());
  const consumers = walk(path.join(ROOT, "js"))
    .filter((p) => readsCurvature(fs.readFileSync(p, "utf8")))
    .map((p) => path.relative(ROOT, p).split(path.sep).join("/"));
  assert.ok(consumers.length >= 8,
    `only ${consumers.length} curvature consumers found — the extraction looks broken`);
  const missing = consumers.filter((f) => !rows.has(f));
  assert.deepEqual(missing, [],
    "curvature consumers with no ROW in docs/PHYSICS.md §Curvature channels — " +
    "classify each into AI-only / assist-gated / broadcast-only / surface " +
    "(and if none fits, the change violates the physics contract): " + missing.join(", "));
});

test("every curvature call site is on the ledger: a new read in a classified file is a red test", () => {
  const found = {};
  for (const p of walk(path.join(ROOT, "js"))) {
    const n = callSites(fs.readFileSync(p, "utf8"));
    if (n) found[path.relative(ROOT, p).split(path.sep).join("/")] = n;
  }
  assert.deepEqual(found, SITES,
    "curvature call-site counts changed — classify the new/removed site in docs/PHYSICS.md §Curvature channels, then update SITES");
  assert.equal(found["js/game.js"], 10, "game.js: 1 driving-line adapter + the player-path/AI-only reads, all classified");
});

test("no table row names a file that no longer reads curvature (no ghosts)", () => {
  const rows = tableRows();
  assert.ok(rows.length >= 8, `only ${rows.length} table rows parsed — the table shape changed?`);
  for (const f of new Set(rows)) {
    const p = path.join(ROOT, f);
    assert.ok(fs.existsSync(p), `table row names ${f}, which does not exist`);
    // #4950: a row may also classify a WIDE_SITES file (kTurn / TrackLine reads).
    assert.ok(readsCurvature(fs.readFileSync(p, "utf8")) || f in WIDE_SITES,
      `table row names ${f}, which no longer reads curvature — drop the row`);
  }
});

// ---------------------------------------------------------------------------
// #4950 — the ledger above only sees `X.curvature(`. The arc also reaches code
// through the per-car caches (`kCur`, `kTurn`), the baked line (`TrackLine.`),
// the path curvature (`kPath`) and `bankAngle`. Same rule: every file that
// reads one is pinned by count, so a new read is a red test until classified.
const WIDE = /\bTrackLine\.|\bkCur\b|\bkTurn\b|\bkPath\b|\bbankAngle\b/g;
// Files that carry these identifiers and the channel that makes each legitimate
// (rows live in docs/PHYSICS.md §Curvature channels; shape-only files are noted).
const WIDE_SITES = {
  "js/agent/agentview-corners.js": 2, "js/agent/apex.js": 3, "js/camera/flyby-seq.js": 2,
  "js/car/car-draw.js": 1, "js/game.js": 24, "js/physics/ai-drive.js": 7,
  "js/physics/body-attitude.js": 1, "js/physics/collide.js": 2, "js/race/car-fields.js": 8,
  "js/track/core/mesh.js": 2, "js/track/tracks.js": 3,
};
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

test("every kCur/kTurn/kPath/TrackLine/bankAngle read is on the wide ledger", () => {
  const found = {};
  for (const p of walk(path.join(ROOT, "js"))) {
    const n = (codeOnly(fs.readFileSync(p, "utf8")).match(WIDE) || []).length;
    if (n) found[rel(p)] = n;
  }
  assert.deepEqual(found, WIDE_SITES,
    "kCur/kTurn/kPath/TrackLine/bankAngle counts changed — classify the new/removed read in docs/PHYSICS.md §Curvature channels, then update WIDE_SITES");
});

test("the two ledgered cross-file reads are classified in the PHYSICS.md table", () => {
  const rows = new Set(tableRows());
  for (const f of ["js/camera/flyby-seq.js", "js/physics/collide.js"])
    assert.ok(rows.has(f), `${f} reads the arc-derived line/kTurn and needs a §Curvature channels row`);
});

// Branch awareness. The human arm of the player-path functions must hold none of
// the arc identifiers except through the two assists that default to 0.
function humanArm(src, fn) {
  const code = codeOnly(src);
  const at = code.indexOf(`function ${fn}(`);
  assert.ok(at >= 0, `${fn} not found in js/game.js`);
  const start = code.indexOf("if (c.human) {", at);
  assert.ok(start >= 0, `${fn} has no \`if (c.human) {\` arm`);
  let depth = 0;
  for (let i = code.indexOf("{", start); i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`${fn}: unbalanced human arm`);
}
// Lines in the human arm that may carry an arc identifier, and why.
const ARM_ALLOW = {
  updateCarBrakePlan: [],
  updateCarLateral: [],
  // ROAD_FOLLOW (def 0) scales kPath; yawEase/rNeed only feed that product; the
  // TrackLine read sits under `raceLineAssist !== 0` (def 0).
  updateCarBicycle: [/const kPath =/, /const rNeed = c\.speed \* kPath/, /driveTune\.ROAD_FOLLOW[^;]*kPath/, /TrackLine\.at\(track, wrapS\(c\.s \+ look\)\)/],
};
const ARM_IDS = /\bTrackLine\.|\bkCur\b|\bkTurn\b|\bkPath\b|\bbankAngle\b|\.curvature\s*\(/;
function armViolations(src) {
  const bad = [];
  for (const [fn, allow] of Object.entries(ARM_ALLOW))
    for (const line of humanArm(src, fn).split("\n"))
      if (ARM_IDS.test(line) && !allow.some((re) => re.test(line))) bad.push(`${fn}: ${line.trim()}`);
  return bad;
}

test("js/game.js: the human arms read no arc identifier outside ROAD_FOLLOW / raceLineAssist", () => {
  assert.deepEqual(armViolations(fs.readFileSync(GAME_PATH, "utf8")), []);
});

test("the branch-aware gate fails on a game.js with one kCur read added to a human arm", () => {
  const src = fs.readFileSync(GAME_PATH, "utf8");
  const needle = "steer = inp ? (inp.steer ?? 0) : Input.steer(dt);";
  assert.ok(src.includes(needle), "mutation anchor moved — re-point this test at the updateCarLateral human arm");
  const mutated = src.replace(needle, needle + " steer += c.kCur * 0;");
  const bad = armViolations(mutated);
  assert.equal(bad.length, 1, bad.join("\n"));
  assert.match(bad[0], /updateCarLateral/);
});
