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
 * for the original direct lanes, with AST-proven indirect writers added. js/circuits/ is excluded
 * (circuit data writes no keys), as are *presets.js data tables.
 *
 * Run: node --test tests/unit/store-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

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

// Resolve only evidenced storage writes: lexical const aliases, parameters
// forwarded by local functions, and literal configuration properties. A helper
// NAME or a {key: ...} object alone is never proof of a persisted value.
function indirectWriters(src, file) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true });
  const scopes = new WeakMap(), functions = new Map(), calls = [], mutations = [];
  const childNodes = (node) => Object.entries(node).filter(([key]) => key !== "loc").flatMap(([, value]) =>
    Array.isArray(value) ? value.filter((x) => x && typeof x.type === "string") : value && typeof value.type === "string" ? [value] : []);
  function visit(node, parentScope) {
    if (node.type === "FunctionDeclaration" && node.id) parentScope.bindings.set(node.id.name, { kind: "function", node });
    let scope = parentScope;
    const fn = /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type);
    if (node.type === "Program" || node.type === "BlockStatement" || fn) scope = { parent: parentScope, bindings: new Map() };
    scopes.set(node, scope);
    if (fn) {
      functions.set(node, { node, scope, summaries: new Map() });
      node.params.forEach((param, index) => { if (param.type === "Identifier") scope.bindings.set(param.name, { kind: "param", fn: node, index }); });
    }
    if (node.type === "VariableDeclaration") for (const d of node.declarations) if (d.id.type === "Identifier")
      scope.bindings.set(d.id.name, { kind: node.kind === "const" ? "const" : "mutable", init: d.init, scope });
    if (node.type === "CallExpression") calls.push(node);
    if (node.type === "AssignmentExpression" || node.type === "UpdateExpression") mutations.push(node);
    for (const child of childNodes(node)) visit(child, scope);
  }
  visit(ast, null);
  function binding(scope, name) { for (let s = scope; s; s = s.parent) if (s.bindings.has(name)) return s.bindings.get(name); return null; }
  // Even a parameter's meaning is no longer proven after reassignment.
  for (const node of mutations) {
    const target = node.left || node.argument;
    let object = target;
    while (object.type === "MemberExpression") object = object.object;
    if (object.type === "Identifier") { const b = binding(scopes.get(node), object.name); if (b) b.changed = true; }
  }
  const property = (node) => node && !node.computed && node.property.type === "Identifier" ? node.property.name
    : node && node.computed && node.property.type === "Literal" ? node.property.value : null;
  function expression(node, scope, seen = new Set()) {
    if (!node) return null;
    if (node.type === "Literal" && typeof node.value === "string") return { kind: "key", key: node.value, complete: true };
    if (node.type === "Identifier") {
      const b = binding(scope, node.name); if (!b || b.changed || seen.has(b)) return null;
      if (b.kind === "param") return { kind: "param", fn: b.fn, index: b.index, path: [] };
      if (b.kind !== "const") return null;
      return expression(b.init, b.scope, new Set([...seen, b]));
    }
    if (node.type === "BinaryExpression" && node.operator === "+") {
      const left = expression(node.left, scope, seen), right = expression(node.right, scope, seen);
      if (!left || left.kind !== "key") return null;
      return { kind: "key", key: left.key + (left.complete && right && right.kind === "key" ? right.key : ""),
        complete: !!(left.complete && right && right.kind === "key" && right.complete) };
    }
    if (node.type === "MemberExpression") {
      const name = property(node), object = expression(node.object, scope, seen);
      if (name !== null && object && object.kind === "param") return { ...object, path: [...object.path, name] };
    }
    return null;
  }
  function functionOf(node, scope) {
    if (!node || node.type !== "Identifier") return null;
    const b = binding(scope, node.name); if (!b || b.changed) return null;
    return b.kind === "function" ? functions.get(b.node) : b.kind === "const" ? functions.get(b.init) : null;
  }
  function objectProperty(node, names, scope, seen = new Set()) {
    if (!names.length) return expression(node, scope);
    if (node && node.type === "Identifier") {
      const b = binding(scope, node.name);
      if (!b || b.kind !== "const" || b.changed || seen.has(b)) return null;
      return objectProperty(b.init, names, b.scope, new Set([...seen, b]));
    }
    if (!node || node.type !== "ObjectExpression" || node.properties.some((p) => p.type === "SpreadElement")) return null;
    const props = node.properties.filter((p) => p.type === "Property" && !p.computed && (p.key.name || p.key.value) === names[0]);
    if (props.length !== 1 || props[0].kind !== "init") return null;
    return objectProperty(props[0].value, names.slice(1), scope, seen);
  }
  const records = [], emitted = new Set();
  function evidence(value, call, lane, op) {
    if (!value) return false;
    if (value.kind === "param") {
      const info = functions.get(value.fn), id = JSON.stringify([value.index, value.path, lane, op]);
      if (!info || info.summaries.has(id)) return false;
      info.summaries.set(id, { index: value.index, path: value.path, lane, op }); return true;
    }
    if (!/^(?:apex26\.)?[A-Za-z0-9_.-]+$/.test(value.key)) return false;
    if (lane === "ls" && !value.key.startsWith("apex26.")) return false;
    const key = value.key.replace(/^apex26\./, ""), at = file + ":" + call.loc.start.line, id = JSON.stringify([key, at, lane, op]);
    if (!emitted.has(id)) { records.push({ key, lane, op, at, extra: "", proof: "AST storage-write forwarding" }); emitted.add(id); }
    return false;
  }
  function memberName(node) { return node.type === "Identifier" ? node.name : node.type === "MemberExpression" && property(node) !== null ? memberName(node.object) + "." + property(node) : ""; }
  for (const call of calls) {
    const name = memberName(call.callee), match = /^(store|G\.store|GameStore\.store|s|st|S|this\._store|_store)\.(set|write|rawSet)$/.exec(name);
    if (match) evidence(expression(call.arguments[0], scopes.get(call)), call, match[2] === "rawSet" ? "raw" : "json", match[2]);
    else if (name === "localStorage.setItem") evidence(expression(call.arguments[0], scopes.get(call)), call, "ls", "setItem");
  }
  // A finite fixed point handles wrappers forwarding to another local wrapper.
  for (let round = 0, changed = true; changed && round <= functions.size; round++) {
    changed = false;
    for (const call of calls) {
      const info = functionOf(call.callee, scopes.get(call)); if (!info) continue;
      for (const summary of info.summaries.values()) changed = evidence(objectProperty(call.arguments[summary.index], summary.path, scopes.get(call)), call, summary.lane, summary.op) || changed;
    }
  }
  return records;
}

function inventory(files = jsFiles("js")) {
  const recs = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    recs.push(...indirectWriters(src, f));
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
  digitalRate dragSmooth fieldLod forceMobileTier gfxDebug glErrDrain glxInstPerPass glxPerspScalar grLite haptics homeCamera homeScene iceRelayOnly
  inputDebug instCellCache marbleGrip mirrorInstEvery modelInst moonShadowCadence motion multiDraw musicStream nostrRelays padCurve
  padDeadzone padSaturation propsUnchunked r2Airborne r3Contact spatialUpscaleGather tiltCurve tlxArrayNearest
  tlxChunkMerge tlxChunkRelease tlxForceBatches tlxForceHw tlxInstPad tlxLampStatic tlxMirLampCap tlxMirrorSweep tlxMobile tlxPack
  tlxAoFold tlxBloom11 tlxMirFold tlxPostFixedMats tlxRoadNormalV2 tlxShadowOff tlxSharedUniforms tlxSkipBatches tlxSkyCache tlxTagLess tlxViz ssrDayGate tlxPartWrap tlxPoolRoot tlxSkyCache512 tlxCoalesce tlxSharedTex tlxAttrInst tlxDynUsage liveryAsync tlxCasterAttr tlxMirWarmLazy tlxPad4 tlxMirMips tlxDepthDiscard tlxDrawWarm tlxWarmFx tlxWarmPlus glxChunkAlign touchCurve touchDragSpeed touchRange gfxBootStepMs
  turn turnApi wgxInsetInPass wgxPackAsync wgxTransient carWarmSlice tlxWarmBeforePack`.split(/\s+/).filter(Boolean));
// Read with two defaults at 78cb4831b — mostly deliberate "is it set at all?"
// probes (null) beside the real default, but the scan cannot tell a probe from
// drift. Remove a name when its call sites agree.
const MIXED_DEFAULTS = new Set(["adaptiveButtons", "autoThrottle", "careerSlot", "gripSteer", "hudProfile", "pace",
  "throttleLatch", "tyreWear", "volMusic", "volSfx"]);

const inv = inventory();
const listDefaults = (keys) => keys.map((k) => `  apex26.${k}:\n    ` + inv.defaults.get(k).join("\n    ")).join("\n");

test("the scanner still sees the store (health floor, not a ceiling)", (t) => {
  t.diagnostic(`${inv.keys} keys / ${inv.sites} sites; ${inv.writerless.length} writer-less; ${inv.defaults.size} with mixed defaults`);
  assert.equal(WRITERLESS.size, 90);   // +touchDragSpeed (DRAG AT SPEED wireTune row, same lane as touchRange); +gfxBootStepMs (renderer-boot.js read-only cap raise for slow-CI specs; set in tests/specs/track-switch-memory.spec.js and tlx-probes.spec.js); +tlxWarmBeforePack (hunt 5 A kill switch: "0" restores the pack gate on the TLX race-entry warm); +carWarmSlice (PERF-HUNT-4 F3.3 kill switch, lane CAR: set by hand to restore the single-task race car warm and the menu prep without FieldLod steps); +tlxMirWarmLazy (PERF-HUNT-4 B-F3.1 A/B knob, lane TLX-H4); +tlxCasterAttr (PERF-HUNT-4 A-H4 A/B knob, lane TLX-H4); +glxChunkAlign (PERF-HUNT-4 C-P7, lane GLX-C); +wgxInsetInPass, wgxPackAsync, wgxTransient (PERF-HUNT-4 C-P2 / C-P4 / C-P6 A/B knobs, lane WGX); +liveryAsync (PERF-HUNT-4 C-P3 kill switch, lane CAR: set by hand to restore the synchronous canvas upload); +tlxPad4, tlxMirMips, tlxDepthDiscard, tlxDrawWarm (PERF-HUNT-4 A-W2 / A-H5 / A-P1 / A-W1 A/B knobs, lane TLX-W); +tlxDynUsage (PERF-HUNT-4 A-H1 kill switch, lane RENDER-S); +tlxCoalesce, tlxSharedTex, tlxAttrInst (PERF-HUNT-3 R1 / R2-B14 / R8-A2, lane TLX-2); +tlxTagLess, ssrDayGate, tlxPartWrap, tlxPoolRoot, tlxSkyCache512 (PERF-HUNT-3 R3 / R7 / R9 / R6 / R5 A/B levers); +tlxRoadNormalV2, tlxAoFold, tlxBloom11, tlxMirFold, moonShadowCadence (TLX-PERF-HUNT tier 2 A/B knobs); +glxPerspScalar, glxInstPerPass (PERF-HUNT-2 G11, G8)
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

test("indirect writers require a lexical path to a real storage write", () => {
  const code = `
    const KEY = "conditionCues";
    store.set(KEY, true);
    function identitySet(key, value) { return store.set(key, value); }
    function setIdentityValue(team, key, value) { return store.write(key, value); }
    function section(dev) { const save = () => store.set(dev.key, dev.get()); return save; }
    identitySet("customTeam", {});
    setIdentityValue(teamId, "livery.custom." + teamId, []);
    section({ key: "pad", get: () => ({}) });
  `;
  const got = indirectWriters(code, "fixture.js");
  for (const key of ["conditionCues", "customTeam", "livery.custom.", "pad"])
    assert.ok(got.some((r) => r.key === key && WRITE.has(r.op) && r.proof), key + " has a storage-write proof");
});

test("lookalike helpers, unused configs, comments and shadowing cannot hide unknown developer flags", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "sr-indirect-"));
  try {
    const file = path.relative(ROOT, path.join(dir, "probe.js"));
    fs.writeFileSync(path.join(ROOT, file), `
      store.get("unknownDev", false);
      store.get("readHelper", false);
      store.get("unusedConfig", false);
      store.get("wrongProperty", false);
      store.get("commentOnly", false);
      store.get("shadowed", false);
      store.get("outerAlias", false);
      store.get("mutatedConfig", false);
      function identitySet(key, value) { return store.get(key); }
      identitySet("readHelper", true);
      const unused = { key: "unusedConfig" };
      function section(dev) { store.set(dev.key, true); }
      section({ name: "wrongProperty" });
      // section({key:"commentOnly"});
      const text = 'section({key:"commentOnly"})';
      function writer(key, value) { store.set(key, value); }
      function nested() { function writer() {} writer("shadowed", true); }
      const KEY = "outerAlias";
      { const KEY = "innerOnly"; store.set(KEY, true); }
      const config = {key:"mutatedConfig"}; config.key = "changed"; section(config);
    `);
    assert.deepEqual(inventory([file]).writerless,
      ["commentOnly", "mutatedConfig", "outerAlias", "readHelper", "shadowed", "unknownDev", "unusedConfig", "wrongProperty"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("local forwarding chains resolve writers without treating a read-only wrapper as a writer", () => {
  const got = indirectWriters(`
    function writeValue(key, value) { return store.rawSet(key, value); }
    function forward(key, value) { return writeValue(key, value); }
    function readOnly(key) { return store.raw(key); }
    const CONFIG = { key: "configured" };
    function configured(options) { return forward(options.key, "1"); }
    configured(CONFIG); forward("forwarded", "1"); readOnly("not-written");
  `, "chain.js");
  assert.ok(got.some((r) => r.key === "configured" && r.op === "rawSet"));
  assert.ok(got.some((r) => r.key === "forwarded" && r.op === "rawSet"));
  assert.equal(got.some((r) => r.key === "not-written"), false);
});
