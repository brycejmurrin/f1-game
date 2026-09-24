/* FLYBY SHOT EDITOR — the half that is data, not pixels.
 *
 * js/camera/flyby-panel.js is a DOM panel, and nothing here boots one: the
 * framing it authors can only be judged by looking, and this container has no
 * GPU. What IS checkable without a browser is the list algebra underneath —
 * add / duplicate / delete / reorder — and the validator that stands between a
 * pasted blob and js/camera/flyby-seq.js's shipped DEFAULT.
 *
 * That validator is the one worth a test. tools/gen/bake-flyby.mjs does a FULL
 * REPLACE of the DEFAULT array, so every rule it fails to enforce is a way to
 * delete the shipped sequence by pasting the wrong thing — which is exactly how
 * the lighting tuner's bake earned its own name interlock (see that tool's
 * header). The cases below are the four that cost something: a good blob, a
 * DELTA-named one, an unknown anchor, and durations that do not sum to 1.
 *
 * Run: node --test tests/unit/flyby-panel.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseBlob, readBlob, blobName, validateShots as bakeValidate, shotErrors as bakeShotErrors, bake, render, DEFAULT_RE, parseLiteral }
  from "../../tools/gen/bake-flyby.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** FlybyPanel's module surface, evaluated on its own. `const` at top level is
 *  rewritten to `var` so the IIFE's assignment lands on the sandbox, the same
 *  trick tests/unit/ui-improve-pass.test.mjs uses for the other UI modules. */
function loadPanel() {
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console };
  sb.window = sb;
  vm.runInNewContext(read("js/camera/flyby-panel.js").replace(/^const\b/gm, "var"), sb,
    { filename: "js/camera/flyby-panel.js" });
  assert.ok(sb.FlybyPanel, "js/camera/flyby-panel.js assigns the FlybyPanel global");
  return sb.FlybyPanel;
}

const FP = loadPanel();

/** A minimal list that passes everything, as the starting point for each case. */
function goodList() {
  const shot = (id, at) => ({
    id, dur: 0.5, ease: "inOut",
    eye: [{ at, off: -40, x: 8, y: 6 }, { at, off: 10, x: 6, y: 5 }],
    look: [{ at, off: 0, x: 0, y: 0.8 }, { at, off: 40, x: 0, y: 0.8 }],
    fov: [36, 40],
  });
  return [shot("one", "start"), shot("two", "corner")];
}

/* ── the list algebra ─────────────────────────────────────────────────────── */

test("the pickers reach every corner, a normalised one-shot list, and name the height offset", () => {
  for (let n = 1; n <= 18; n++) assert.ok(FP.CORNER_NS.includes(String(n)), `corner ${n} is pickable`);
  const one = FP.normaliseDurs([goodList()[0]]);
  assert.ok(one[0].dur <= FP.DUR.max, `a normalised single shot (dur ${one[0].dur}) fits the slider (max ${FP.DUR.max})`);
  assert.equal(FP.fieldLabel("centre", "y"), "HEIGHT OFFSET");
  assert.equal(FP.fieldLabel("landmark", "y"), "HEIGHT OFFSET");
  assert.equal(FP.fieldLabel("corner", "y"), FP.FIELD.y.label);
});

test("the module freezes and exports its pure operations", () => {
  assert.ok(Object.isFrozen(FP), "FlybyPanel is frozen");
  for (const fn of ["create", "addShot", "duplicateShot", "deleteShot", "moveShot",
                    "normaliseDurs", "shotErrors", "validateShots", "switchPoseAt", "toBlob"]) {
    assert.equal(typeof FP[fn], "function", `FlybyPanel.${fn} is exported`);
  }
});

test("add inserts AFTER the selection and never collides an id", () => {
  const before = goodList();
  const after = FP.addShot(before, 0);
  assert.equal(after.length, 3);
  assert.deepEqual(after.map((s) => s.id), ["one", "shot", "two"]);
  assert.deepEqual(before.map((s) => s.id), ["one", "two"], "the input list is not mutated");
  // The new shot must itself be valid, or ADD hands the author a list that
  // cannot be copied out until they find which field is missing.
  // Spread into a host array: the module is evaluated in its own VM realm, so
  // the array it returns has that realm's Array.prototype and deepStrictEqual
  // (rightly) calls it a different type.
  assert.deepEqual([...FP.validateShots(FP.normaliseDurs([after[1]]))], []);
});

test("duplicate copies the shot and renames the copy", () => {
  const out = FP.duplicateShot(goodList(), 0);
  assert.deepEqual(out.map((s) => s.id), ["one", "one-2", "two"]);
  assert.deepEqual(out[1].eye, out[0].eye, "the copy carries the framing");
  out[1].eye[0].x = 99;
  assert.notEqual(out[0].eye[0].x, 99, "…as a deep copy, not a shared reference");
});

/* THE LIST MAY NOT BE EMPTIED. FlybySeq.solve() falls back to its own DEFAULT
   when handed an empty array, so a zero-shot editor would preview the SHIPPED
   sequence while claiming to preview the edit — the one state in which the live
   preview lies about what it is showing. */
test("delete removes one shot and refuses the last", () => {
  const out = FP.deleteShot(goodList(), 0);
  assert.deepEqual(out.map((s) => s.id), ["two"]);
  const kept = FP.deleteShot(out, 0);
  assert.deepEqual(kept.map((s) => s.id), ["two"], "the final shot survives DELETE");
});

test("reorder moves a shot and ignores a move off either end", () => {
  const list = goodList();
  assert.deepEqual(FP.moveShot(list, 1, -1).map((s) => s.id), ["two", "one"]);
  assert.deepEqual(FP.moveShot(list, 0, -1).map((s) => s.id), ["one", "two"], "already first");
  assert.deepEqual(FP.moveShot(list, 1, 1).map((s) => s.id), ["one", "two"], "already last");
});

test("normalise rescales durations to sum to exactly 1", () => {
  const list = goodList().map((s) => ({ ...s, dur: 0.4 }));       // sums to 0.8
  const out = FP.normaliseDurs(list);
  const sum = out.reduce((a, s) => a + s.dur, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `durations sum to ${sum}`);
  assert.ok(Math.abs(out[0].dur - out[1].dur) < 1e-6, "…keeping their relative weights");
});

test("switching a pose's anchor carries what the new anchor can still use", () => {
  const pose = { at: "corner", n: "first", off: -40, x: 8, y: 6 };
  const centre = FP.switchPoseAt(pose, "centre");
  assert.equal(centre.at, "centre");
  assert.equal(centre.y, 6, "height survives the switch");
  assert.equal(centre.off, undefined, "an arc offset means nothing around the lap's centroid");
  assert.equal(typeof centre.distR, "number", "and the new anchor's own fields arrive with defaults");
  assert.equal(FP.switchPoseAt(pose, "nonsense").at, "corner", "an unknown anchor changes nothing");
});

/* ── the export, and the bake it is aimed at ──────────────────────────────── */

test("COPY VALUES emits the one name bake-flyby.mjs accepts", () => {
  const blob = FP.toBlob(FP.normaliseDurs(goodList()));
  assert.match(blob, /^window\.FlybyShots = \[/,
    "the name is the interlock: bake-flyby.mjs does a FULL REPLACE and refuses every other name");
  const round = parseBlob(blob);
  assert.deepEqual(round.map((s) => s.id), ["one", "two"], "…and the blob parses back to the list");
});

test("the panel's validator and the bake tool's validator agree", () => {
  const cases = [
    FP.normaliseDurs(goodList()),
    (() => { const l = FP.normaliseDurs(goodList()); l[0].eye[0].at = "somewhere"; return l; })(),
    (() => { const l = FP.normaliseDurs(goodList()); l[0].dur = 0.9; return l; })(),
    (() => { const l = FP.normaliseDurs(goodList()); l[1].ease = "bounce"; return l; })(),
  ];
  // Compared on the CLAIM, not the prose: both ends carry the same rules, but
  // the bake's duration message goes on to explain what a fraction of a run is
  // (a CLI has room to; a panel row does not). The part before the dash is the
  // finding, and THAT may not drift.
  const claims = (l) => l.map((s) => String(s).split(" \u2014 ")[0]);
  for (const list of cases) {
    assert.deepEqual(claims([...FP.validateShots(list)]), claims(bakeValidate(list)),
      "two copies of one rule set, so neither end is the only guard — they may not drift");
  }
});

test("a good blob validates", () => {
  assert.deepEqual(bakeValidate(FP.normaliseDurs(goodList())), []);
  // And the shipped DEFAULT itself — the sequence this tool would replace —
  // must pass its own validator, or the bake refuses a round trip of no change.
  const src = read("js/camera/flyby-seq.js");
  const m = src.match(/^ {2}const DEFAULT = \[[\s\S]*?^ {2}\];/m);
  assert.ok(m, "flyby-seq.js's DEFAULT array is where bake-flyby.mjs's anchored regex expects it");
  const shipped = vm.runInNewContext("(" + m[0].replace(/^ {2}const DEFAULT = /, "").replace(/;$/, "") + ")");
  assert.deepEqual(bakeValidate(shipped), [], "the shipped sequence passes the rules the editor enforces");
});

test("a DELTA-named blob is refused, with the reason", () => {
  const blob = FP.toBlob(FP.normaliseDurs(goodList())).replace("window.FlybyShots", "window.FlybyEdits");
  assert.throws(() => parseBlob(blob), (e) => {
    assert.match(e.message, /FlybyEdits/, "the refusal names the blob it was handed");
    assert.match(e.message, /FlybyShots/, "…and the name it wanted");
    assert.match(e.message, /REPLACES|delete/i, "…and why: this is a full replace, not a merge");
    return true;
  });
});

test("an unknown pose anchor is refused", () => {
  const list = FP.normaliseDurs(goodList());
  list[1].look[1] = { at: "landmarks", rank: 0 };      // plural: a real typo, not a fantasy one
  const bad = bakeValidate(list);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /unknown at: "landmarks"/);
  assert.throws(() => parseBlob(FP.toBlob(list)), /will not bake/);
});

test("durations that do not sum to 1 are refused", () => {
  const list = goodList();                  // two shots at 0.5 each -> 1.0
  list[0].dur = 0.9;                        // …now 1.4
  const bad = bakeValidate(list);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /sum to 1\.4000, not 1/);
  // Just inside the tolerance is fine: the editor's sliders step in 0.005 and a
  // hand-rounded list should not be rejected for a thousandth.
  const near = goodList();
  near[0].dur = 0.505;
  assert.deepEqual(bakeValidate(near), []);
});

/* ── the write ────────────────────────────────────────────────────────────── */

test("the bake replaces the DEFAULT literal and nothing else", () => {
  const src = read("js/camera/flyby-seq.js");
  const list = FP.normaliseDurs(goodList());
  const out = bake(src, list);
  assert.notEqual(out, src);
  assert.ok(out.includes(render(list)), "the new literal is written verbatim");
  assert.ok(out.includes("const FlybySeq = (function () {"), "the module survives");
  assert.ok(out.includes("Object.freeze(FlybySeq);"), "…including its tail");
  // The header comment documents the pose shape with the same words; an
  // unanchored regex would have eaten the documentation instead of the data.
  assert.ok(out.includes('{ at: "start"|"pole"|"grid"|"corner", n, off, x, y }'),
    "the header comment is untouched — the regex is anchored at two-space indent for this reason");
  assert.equal(out.match(/^ {2}const DEFAULT = \[/gm).length, 1, "still exactly one DEFAULT");
});

test("a bake keeps DEFAULT's rationale comments", () => {
  // Rebaking the shipped list as data used to delete every comment inside
  // DEFAULT — the "why" of each shot. Same list in, every comment line out.
  const src = read("js/camera/flyby-seq.js");
  const lit = DEFAULT_RE.exec(src)[0];
  const list = parseLiteral(lit.replace(/^ {2}const DEFAULT = /, "").replace(/;\s*$/, ""));
  assert.ok(list.length > 3, "parsed the shipped DEFAULT");
  const out = DEFAULT_RE.exec(bake(src, list))[0];
  const comments = lit.split("\n").filter((l) => l.trim().startsWith("//"));
  assert.ok(comments.length > 5, "DEFAULT carries comments to keep");
  for (const c of comments) assert.ok(out.includes(c), "lost in the bake: " + c.trim());
  // A dropped shot takes its own comments; the others stay.
  const out2 = DEFAULT_RE.exec(bake(src, list.filter((s) => s.id !== "turn-mid")))[0];
  assert.ok(!/Held on the APEX/.test(out2), "turn-mid's own note leaves with it");
  assert.ok(/and then the grid you start from/.test(out2), "a section comment before a surviving shot stays");
});

/* ── DO THE EDITS REACH THE FLYBY? ────────────────────────────────────────────
 *
 * Reported 2026-09-18: "once I hit done in the editor it doesn't actually change
 * the start shots." They did not. DONE only closed the sheet — the edited list
 * lived in the panel's closure, nothing wrote it anywhere, and js/game.js called
 * FlybySeq.solve(track, progress) with NO third argument, so the pre-race flyby
 * played the shipped DEFAULT however long the author spent framing it. The
 * preview was honest and everything after it was thrown away.
 *
 * Source guards, because the thing they protect is a WIRE between two files that
 * no data test can see: the panel's own persistence lives behind create(G) and a
 * DOM this container cannot boot, and the flyby itself needs a GPU to look at.
 */

/** Every `FlybySeq.solve(...)` call in `src`, paren-balanced. A `[^)]*` match
 *  stops at the first `)`, which here is `flybyProgress()`'s — it would report a
 *  correct three-argument call as a two-argument one. */
function solveCalls(src) {
  const out = [];
  for (let at = src.indexOf("FlybySeq.solve("); at >= 0; at = src.indexOf("FlybySeq.solve(", at + 1)) {
    let depth = 0;
    for (let i = src.indexOf("(", at); i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) { out.push(src.slice(at, i + 1)); break; }
    }
  }
  return out;
}

/** The top-level arguments of one such call. */
function argsOf(call) {
  const inner = call.slice(call.indexOf("(") + 1, -1);
  const args = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) { args.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  args.push(inner.slice(start).trim());
  return args;
}

test("solve() is handed the saved list, not just a track and a progress", () => {
  const calls = solveCalls(read("js/game.js"));
  assert.ok(calls.length, "js/game.js no longer solves the flyby — this guard is reading the wrong file");
  for (const call of calls) {
    assert.equal(argsOf(call).length, 3,
      "FlybySeq.solve() falls back to the shipped DEFAULT when it is handed no shot list, so a two-argument " +
      "call here means the editor's saved shots are silently ignored: " + call);
  }
});

test("the panel saves on every edit, and a pristine list clears the key", () => {
  const src = read("js/camera/flyby-panel.js");
  assert.match(src, /function edited\(\)\s*\{\s*persist\(\);/,
    "edited() is the one funnel every mutation goes through — persisting anywhere else means DONE, ESCAPE or " +
    "QUIT can still lose an afternoon of framing");
  assert.match(src, /store\.set\("flybyShots", pristine \? null : savedForm\(list\)\)/,
    "storing a COPY of the shipped default would pin this player to today's shots and ignore every later " +
    "change to them — an unedited list has to clear the key instead");
});

test("a saved list is read back through shotErrors, not the bake's sum rule", () => {
  // solve() normalises by the durations' own total, so a list nobody pressed
  // NORMALISE on plays exactly as the editor previewed it. Holding a SAVED list
  // to the bake rule would throw the edit away and fall back to the shipped
  // sequence — the very defect this pass fixed, one layer down.
  const loose = FP.normaliseDurs(goodList()).map((s) => ({ ...s, dur: s.dur * 3 }));
  // Spread both: the panel is evaluated in a vm sandbox, so its arrays carry the
  // SANDBOX's Array.prototype and deepStrictEqual compares prototypes.
  assert.deepEqual([...FP.shotErrors(loose)], [], "an un-normalised but structurally sound list is playable");
  assert.ok([...FP.validateShots(loose)].some((m) => /sum/.test(m)),
    "...and still refused by the BAKE validator");
  // Behaviourally, through the real loadSaved() (panelWith below).
  assert.ok(panelWith(FP.savedForm(loose)).panel.loadSaved(),
    "loadSaved() must use the playable rule set, not the bake one");
});

/* ── the saved list, read back through a real create(G) ───────────────────── */

/** create(G) against a stub G: every $() is an inert object (the panel only
 *  assigns handlers at create time), and `store` is a Map, so loadSaved() — the
 *  function game.js calls at every run start — runs for real. */
function panelWith(saved) {
  const warned = [];
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console,
    Log: { info() {}, warn: (_t, m) => warned.push(String(m)) } };
  sb.window = sb;
  vm.runInNewContext(read("js/camera/flyby-panel.js").replace(/^const\b/gm, "var"), sb);
  const map = new Map([["flybyShots", saved]]);
  const G = { $: () => ({ style: {}, dataset: {} }), els: {},
    store: { get: (k, d) => (map.has(k) ? map.get(k) : d), set: (k, v) => { map.set(k, v); return true; } } };
  return { panel: sb.FlybyPanel.create(G), warned, map };
}

test("a saved list round-trips only in the current pose meaning", () => {
  const list = FP.normaliseDurs(goodList());
  const cur = panelWith(FP.savedForm(list));
  assert.deepEqual(JSON.parse(JSON.stringify(cur.panel.loadSaved())), JSON.parse(JSON.stringify(list)));
  // A BARE ARRAY is what the editor saved while bearings were world bearings and
  // a corner's +x was its right. Structurally it is perfect, which is exactly
  // why it needs refusing by version: loaded, every such shot plays mirrored.
  const legacy = panelWith(list);
  assert.equal(legacy.panel.loadSaved(), null, "a pre-version (bare array) list is not played");
  assert.match(legacy.warned.join("\n"), /predate/, "…and the log says why");
  assert.ok(legacy.map.get("flybyShots"), "…nor deleted: the next edit overwrites it");
  assert.equal(panelWith({ v: FP.SHOTS_VERSION + 1, shots: list }).panel.loadSaved(), null,
    "a list from a NEWER build is not guessed at either");
  assert.equal(panelWith({ v: FP.SHOTS_VERSION, shots: [{ id: "x" }] }).panel.loadSaved(), null,
    "the version is not a pass: the list is still held to shotErrors");
  assert.equal(panelWith(null).panel.loadSaved(), null, "nothing saved -> the shipped sequence");
});

test("loadSaved hands out a copy, not the store's cached object", () => {
  // store.get() returns its cache entry; game.js keeps the result as the list
  // the render path flies, and the panel edits ITS list in place. Shared, every
  // slider drag moved the live sequence and the store cache without a save.
  const saved = FP.savedForm(FP.normaliseDurs(goodList()));
  const { panel } = panelWith(saved);
  const a = panel.loadSaved();
  a[0].eye[0].x = 999;
  assert.notEqual(saved.shots[0].eye[0].x, 999);
  assert.notEqual(panel.loadSaved()[0].eye[0].x, 999);
});

/* ── the blob as COPY VALUES actually emits it ────────────────────────────── */

test("an invalid copy's warning header does not hide the reasons", () => {
  // COPY VALUES prefixes a list that will not bake with `// THIS LIST WILL NOT
  // BAKE:` lines. Those lines used to hide the assignment name, so the bake
  // reported a parse error about `window` instead of the rule that failed, and
  // tools/shot/flyby.mjs --shots could not preview the blob at all.
  const loose = goodList();                                   // sums to 1 …
  loose[0].dur = 0.9;                                         // … now 1.4
  const bad = [...FP.validateShots(loose)];
  const blob = "// THIS LIST WILL NOT BAKE:\n// " + bad.join("\n// ") + "\n" + FP.toBlob(loose);
  assert.equal(blobName(blob), "FlybyShots", "the name is found under the header");
  assert.deepEqual(readBlob(blob).map((s) => s.id), ["one", "two"], "…and the list still reads, for a preview");
  assert.throws(() => parseBlob(blob), /sum to 1\.4000/, "the bake names the rule, not a parse error");
});

test("the literal fallback is data only: no process, no hang", () => {
  assert.throws(() => readBlob("[process.exit(3)]"), /Could not parse/);
  assert.throws(() => readBlob("[globalThis.require('fs')]"), /Could not parse/);
  assert.throws(() => readBlob("[(() => { for (;;); })()]"), /Could not parse/, "a runaway literal times out");
  // Unquoted keys — the shape the panel emits — still parse, into HOST arrays.
  const v = readBlob('[{ id: "a", eye: [1, 2] }]');
  assert.ok(Array.isArray(v) && Array.isArray(v[0].eye), "host-realm arrays after the round trip");
});

test("the structural half agrees too — what a PREVIEW is held to", () => {
  const cases = [
    goodList().map((s) => ({ ...s, dur: s.dur * 3 })),      // loose sum: playable
    (() => { const l = goodList(); l[0].fov = [40]; return l; })(),
    (() => { const l = goodList(); l[1].look = [{ at: "start" }]; return l; })(),
    [],
  ];
  for (const list of cases) {
    assert.deepEqual([...FP.shotErrors(list)], bakeShotErrors(list),
      "tools/shot/flyby.mjs --shots uses the bake's copy; the panel's saved list uses its own");
  }
});

test("the preview flies a COPY re-taken when the list's contents change", () => {
  // FlybySeq caches plans and corner bindings per shot/list object, and the
  // sliders edit the list in place: passing it straight to flybyCam previewed
  // the first plan forever (a corner shot's x/y/off/corner did nothing).
  const src = read("js/camera/flyby-panel.js");
  assert.ok(!/flybyCam\(u, ensure\(\)\)/.test(src), "preview does not hand FlybySeq the list it edits in place");
  assert.match(src, /flybyCam\(u, playable\(\)\)/, "preview flies playable()");
  assert.match(src, /JSON\.stringify\(ensure\(\)\)/, "playable() keys its copy on the list's contents");
});
