/* store-registry.test.mjs — a tripwire over every apex26.* key in js/ (R3-PERSISTENCE-8).
 *
 * There is no registry of storage keys (js/career/season-cal.js says so: "There
 * is no generic migration registry for store keys"). js/data/settings-defaults.js
 * names ~20 keys and SettingsExport's SPEC ~150: two partial lists. The round-3
 * persistence hunt measured the rest by scanning source, at 78cb4831b:
 *
 *   217 distinct keys / 515 call sites over three lanes — JSON store.get/set/write,
 *   raw store.raw/rawSet/rawDel, direct localStorage.*Item("apex26.…") — plus
 *   module-level `const K = "apex26.…"` aliases;
 *    57 keys with NO WRITER in code (dev/latch flags set by hand or through
 *       __apex, or written through a computed key the scan cannot see);
 *    10 keys READ WITH DIFFERENT DEFAULTS at different call sites.
 *
 * This file pins the two defect-shaped counts as a RATCHET: the writer-less and
 * mixed-default sets may shrink, never grow. A new key that is written and read
 * with one default passes untouched (totals are a scanner-health floor only —
 * a ceiling on them would turn every PR that adds a setting red). A new
 * writer-less key fails by name: give it a writer, or add it to WRITERLESS with
 * the reason it is set by hand (and document it in docs/DEBUG-HOOKS.md). A key
 * that grows a second default fails with every site listed.
 *
 * NOT IN SCOPE: the per-key schema-version table (`{k, lane, type, def, v,
 * migrate}`) the hunt proposed. That is a follow-up; this is its inventory.
 *
 * The scanner is the hunter's (scratch/hunt3-persistence/inventory.cjs), kept
 * line-for-line so the counts above stay comparable. js/circuits/ is excluded
 * (circuit data writes no keys), as are *presets.js data tables.
 *
 * Run: node --test tests/unit/store-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const STORE_RX = /\b(store|G\.store|GameStore\.store|s|st|S|this\._store|_store)\.(get|set|write|raw|rawSet|rawDel)\(\s*(["'`])([A-Za-z0-9_.\-]+)\3\s*(?:,\s*([^)]{0,80}))?/g;
const LS_RX = /localStorage\.(getItem|setItem|removeItem)\(\s*(["'`])(apex26\.[A-Za-z0-9_.\-]+)\2\s*(?:,\s*([^)]{0,60}))?/g;
const CONST_RX = /\b(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=\s*(["'])(apex26\.[A-Za-z0-9_.\-]+)\2/g;
const READ = new Set(["get", "raw", "getItem"]), WRITE = new Set(["set", "write", "rawSet", "setItem"]);

function jsFiles(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!/^js\/circuits$|vendor|three\/lib/.test(p)) jsFiles(p, out); }
    else if (e.name.endsWith(".js") && !e.name.endsWith("presets.js")) out.push(p);
  }
  return out;
}

function inventory(files = jsFiles("js")) {
  const recs = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    src.split("\n").forEach((ln, i) => {
      let m;
      STORE_RX.lastIndex = 0;
      while ((m = STORE_RX.exec(ln))) {
        if ((m[1] === "s" || m[1] === "st" || m[1] === "S") && !/store|Store|\bs\b/.test(src)) continue;
        const lane = m[2] === "raw" || m[2] === "rawSet" || m[2] === "rawDel" ? "raw" : "json";
        recs.push({ key: m[4].replace(/^apex26\./, ""), lane, op: m[2], at: `${f}:${i + 1}`, extra: (m[5] || "").trim() });
      }
      LS_RX.lastIndex = 0;
      while ((m = LS_RX.exec(ln))) recs.push({ key: m[3].replace(/^apex26\./, ""), lane: "ls", op: m[1], at: `${f}:${i + 1}`, extra: (m[4] || "").trim() });
      CONST_RX.lastIndex = 0;
      while ((m = CONST_RX.exec(ln))) recs.push({ key: m[3].replace(/^apex26\./, ""), lane: "const", op: m[1], at: `${f}:${i + 1}`, extra: "" });
    });
  }
  const by = new Map();
  for (const r of recs) { if (!by.has(r.key)) by.set(r.key, []); by.get(r.key).push(r); }
  const writerless = [], defaults = new Map();
  for (const [k, rs] of by) {
    if (!rs.some((r) => WRITE.has(r.op)) && !rs.some((r) => r.lane === "const")) writerless.push(k);
    const gets = rs.filter((r) => r.op === "get");
    const defs = new Set(gets.map((r) => r.extra.replace(/\s+/g, "")));
    if (defs.size > 1) defaults.set(k, gets.map((r) => `${r.extra.replace(/\s+/g, "") || "(none)"} @ ${r.at}`));
  }
  return { keys: by.size, sites: recs.length, writerless: writerless.sort(), defaults };
}

// Measured at 78cb4831b. Remove a name when its key gains a writer or goes away.
const WRITERLESS = new Set(`analogSpeedSteer backgroundMotion breakBarriers c1Pileup career debris debrisCap devApi
  digitalRate dragSmooth fieldLod forceMobileTier gfxDebug glErrDrain grLite haptics homeCamera homeScene iceRelayOnly
  inputDebug instCellCache marbleGrip mirrorInstEvery modelInst motion multiDraw musicStream nostrRelays padCurve
  padDeadzone padSaturation propsUnchunked r2Airborne r3Contact spatialUpscaleGather tiltCurve tlxArrayNearest
  tlxChunkMerge tlxChunkRelease tlxForceBatches tlxForceHw tlxInstPad tlxLampStatic tlxMirrorSweep tlxMobile tlxPack
  tlxPostFixedMats tlxShadowOff tlxSharedUniforms tlxSkipBatches tlxViz tlxWarmFx tlxWarmPlus touchCurve touchRange
  turn turnApi`.split(/\s+/).filter(Boolean));
// Read with two defaults at 78cb4831b — mostly deliberate "is it set at all?"
// probes (null) beside the real default, but the scan cannot tell a probe from
// drift. Remove a name when its call sites agree.
const MIXED_DEFAULTS = new Set(["adaptiveButtons", "autoThrottle", "careerSlot", "gripSteer", "hudProfile", "pace",
  "throttleLatch", "tyreWear", "volMusic", "volSfx"]);

const inv = inventory();
const listDefaults = (keys) => keys.map((k) => `  apex26.${k}:\n    ` + inv.defaults.get(k).join("\n    ")).join("\n");

test("the scanner still sees the store (health floor, not a ceiling)", (t) => {
  t.diagnostic(`${inv.keys} keys / ${inv.sites} sites; ${inv.writerless.length} writer-less; ${inv.defaults.size} with mixed defaults`);
  assert.equal(WRITERLESS.size, 57);
  assert.equal(MIXED_DEFAULTS.size, 10);
  assert.ok(inv.keys >= 200, `only ${inv.keys} apex26.* keys found (217 measured) — the scan has stopped seeing them`);
  assert.ok(inv.sites >= 480, `only ${inv.sites} call sites found (515 measured) — the scan has stopped seeing them`);
  assert.ok(inv.keys < inv.sites, "every key has at least one site");
});

test("RATCHET: no new apex26.* key without a writer in code", () => {
  const fresh = inv.writerless.filter((k) => !WRITERLESS.has(k));
  assert.deepEqual(fresh, [], `new writer-less key(s): ${fresh.map((k) => "apex26." + k).join(", ")} — nothing in js/ writes `
    + "them, so they are invisible except by grep. Add a writer, or add the name to WRITERLESS with why it is set by hand "
    + "(and list the flag in docs/DEBUG-HOOKS.md).");
  assert.ok(inv.writerless.length <= WRITERLESS.size, `${inv.writerless.length} writer-less keys > ${WRITERLESS.size}`);
});

test("RATCHET: no new key read with two different defaults", (t) => {
  const known = [...inv.defaults.keys()].filter((k) => MIXED_DEFAULTS.has(k)).sort();
  t.diagnostic(`known mixed defaults (ratcheted, ${known.length}):`);
  for (const k of known) t.diagnostic(`  apex26.${k}: ${inv.defaults.get(k).join("; ")}`);
  const fresh = [...inv.defaults.keys()].filter((k) => !MIXED_DEFAULTS.has(k)).sort();
  assert.deepEqual(fresh, [], `new key(s) read with different defaults at different sites:\n${listDefaults(fresh)}\n`
    + `make the sites agree (or name the probe). Already known, still to settle:\n${listDefaults(known)}`);
  assert.ok(inv.defaults.size <= MIXED_DEFAULTS.size);
});

// The scanner is the likeliest thing to be wrong, so it is asked a question it
// must get right, on a probe file holding one case of each lane.
test("the scanner sees a second default and a writer-less key in every lane", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "sr-"));
  try {
    const f = path.relative(ROOT, path.join(dir, "probe.js"));
    fs.writeFileSync(path.join(ROOT, f), [
      'const K_ALIAS = "apex26.aliased";',
      'const a = store.get("twoDefs", 0.6), b = G.store.get("twoDefs");',
      'const c = store.raw("rawFlag"), d = localStorage.getItem("apex26.lsFlag");',
      'store.set("paired", 1); store.get("paired", 1);',
    ].join("\n"));
    const got = inventory([f]);
    assert.deepEqual([...got.defaults.keys()], ["twoDefs"]);
    assert.deepEqual(got.writerless, ["lsFlag", "rawFlag", "twoDefs"], "an aliased const and a written key are not writer-less");
    assert.equal(got.keys, 5);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
