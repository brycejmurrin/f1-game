import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "js/race/real-race-boot.js": 1, "js/render/shared/driving-line.js": 5, "js/track/core/mesh.js": 3,
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
    assert.ok(readsCurvature(fs.readFileSync(p, "utf8")),
      `table row names ${f}, which no longer reads curvature — drop the row`);
  }
});

// TOKEN LEDGER (#7251). SITES above counts `.curvature(` CALLS only, so a player-path read
// that takes another route passed it: the cached field `c.kCur`, a racing-line read
// (`TrackLine.at/attackAt/pathK`), a direct LUT index (`track.curv[i]`, `lineRoadK`, `lineK`,
// `kPath`) or a bound alias (`const f = Tracks.curvature; f(s)`). TOKENS pins the bare-token
// count per file on comment-stripped source; every file with hits must be a table row or a
// bullet of docs/PHYSICS.md §Curvature channels "Token ledger", and a raised count is a red
// test until the new hit is classified there and the number raised HERE.
const TOKEN_RE = /\bkCur\b|\bkPath\b|\blineRoadK\b|\blineK\b|\bTrackLine\.|\.curv\[|\bcurvature\b/g;
const tokenHits = (src) => (codeOnly(src).match(TOKEN_RE) || []).length;
const TOKENS = {
  "js/agent/agentview-corners.js": 1, "js/agent/agentview.js": 3, "js/agent/apex.js": 10,
  "js/audio/driving-cues.js": 4, "js/camera/extra-rigs.js": 3, "js/camera/flyby-seq.js": 2,
  "js/camera/vantage.js": 3, "js/car/car-draw.js": 1, "js/circuits/scenery/indianapolis.js": 3,
  "js/editor/insight.js": 6, "js/editor/scenery-preview.js": 1, "js/editor/validate.js": 8, "js/game.js": 25,
  "js/garage/exterior-geometry.js": 3, "js/learn-drills/aero.js": 2, "js/learn-drills/charge.js": 1, "js/learn-drills/dive.js": 1,
  "js/learn-drills/grip.js": 1, "js/learn-drills/harvest.js": 1, "js/learn-drills/lines.js": 1,
  "js/learn-drills/taper.js": 1, "js/learn-drills/telemetry.js": 1, "js/learn-drills/torque.js": 1,
  "js/learn-drills/tyre-heat.js": 1, "js/learn-drills/wake.js": 1, "js/perf/soak-run.js": 2,
  "js/physics/aero-zones.js": 1, "js/physics/body-attitude.js": 1, "js/physics/brake-cue.js": 1,
  "js/physics/debris-world.js": 1, "js/race/car-fields.js": 6, "js/race/pit-geom.js": 2, "js/race/quali-model.js": 1,
  "js/race/real-race-boot.js": 2, "js/render/glx/glx.js": 5, "js/render/shared/driving-line.js": 5,
  "js/track/core/line.js": 9, "js/track/core/mesh.js": 4, "js/track/core/pit.js": 13, "js/track/core/spline.js": 2,
  "js/track/scenery/build-props.js": 5, "js/track/scenery/pits.js": 4, "js/track/tracks.js": 6,
  "js/ui/track-maps.js": 5,
};
const ledgerBullets = () => {
  const section = fs.readFileSync(path.join(ROOT, "docs/PHYSICS.md"), "utf8").split("### Token ledger")[1];
  assert.ok(section, "docs/PHYSICS.md §Curvature channels must carry the ### Token ledger list");
  return [...section.matchAll(/^- `(js\/[^`]+\.js)` — \*\*/gm)].map((m) => m[1]);
};
// The player-force path: no curvature by any route, comments excepted (player-forces.js
// names kPath and curvature in prose only).
const PLAYER_PATH = ["js/physics/player-forces.js", "js/physics/grip-steer.js", "js/physics/wheel-state.js"];

test("token ledger: every file's curvature-token count is pinned and classified", () => {
  const found = {};
  for (const p of walk(path.join(ROOT, "js"))) {
    const n = tokenHits(fs.readFileSync(p, "utf8"));
    if (n) found[path.relative(ROOT, p).split(path.sep).join("/")] = n;
  }
  assert.ok(Object.keys(found).length >= 30, "token extraction looks broken");
  assert.deepEqual(found, TOKENS,
    "curvature-token counts (kCur/kPath/lineRoadK/lineK/TrackLine./.curv[/curvature) changed — classify the " +
    "new hit in docs/PHYSICS.md §Curvature channels (a table row or a Token ledger bullet), then update TOKENS");
  const classified = new Set([...tableRows(), ...ledgerBullets()]);
  const unclassified = Object.keys(found).filter((f) => !classified.has(f));
  assert.deepEqual(unclassified, [], "files with curvature tokens and no PHYSICS.md row or bullet: " + unclassified.join(", "));
});

test("token ledger: no bullet names a file without tokens, and no file is both a row and a bullet", () => {
  const bullets = ledgerBullets(), rows = new Set(tableRows());
  assert.ok(bullets.length >= 10, `only ${bullets.length} ledger bullets parsed — the list shape changed?`);
  for (const f of bullets) {
    const p = path.join(ROOT, f);
    assert.ok(fs.existsSync(p), `ledger bullet names ${f}, which does not exist`);
    assert.ok(tokenHits(fs.readFileSync(p, "utf8")) > 0, `ledger bullet names ${f}, which carries no token — drop it`);
    assert.ok(!rows.has(f), `${f} is a table row AND a ledger bullet — keep one`);
  }
});

test("player-force path carries zero curvature tokens (comment-stripped)", () => {
  for (const f of PLAYER_PATH) {
    const p = path.join(ROOT, f);
    assert.ok(fs.existsSync(p), `${f} moved — update PLAYER_PATH`);
    assert.equal(tokenHits(fs.readFileSync(p, "utf8")), 0, `${f} reads curvature by some route: the arc reaches the driver`);
  }
});

test("fixture: each curvature route injected into player-forces.js is red on both guards", () => {
  const base = fs.readFileSync(path.join(ROOT, "js/physics/player-forces.js"), "utf8");
  assert.equal(tokenHits(base), 0);
  const ROUTES = {
    cachedField: "\nconst __k = c.kCur || 0;\n",
    racingLine: "\nconst __x = TrackLine.at(G.track, c.s).x;\n",
    lutIndex: "\nconst __k = track.curv[i];\n",
    boundAlias: "\nconst f = Tracks.curvature; const __k = f(s);\n",
  };
  for (const [name, inj] of Object.entries(ROUTES)) {
    const src = base + inj;   // appended: always code, never inside a block comment
    assert.ok(tokenHits(src) > 0, `${name}: the player-path guard missed ${inj.trim()}`);
    const ledger = { ...TOKENS, "js/physics/player-forces.js": tokenHits(src) };
    assert.notDeepEqual(ledger, TOKENS, `${name}: the token ledger missed ${inj.trim()}`);
  }
  // A mention in a comment is not a read: the guard must stay green on prose.
  assert.equal(tokenHits(base + "\n// c.kCur, TrackLine.at, track.curv[i], Tracks.curvature\n"), 0);
});
