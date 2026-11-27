/* livery-sanitiser-pin.test.mjs — #7052 (gardener js/ui 1, #6548 item 7).
 * Two copies of cleanLivery guarded the same hostile input: SettingsExport's
 * (garage file import, strict enum) and ShareCode's (pasted APXL code, lax).
 * Bryce chose the stricter one (7b). This table runs the SAME inputs through both
 * doors: the file door (SettingsExport.garageValue) and the code door
 * (ShareCode.encode livery). After the re-point they must agree on every row.
 * Run: node --test tests/unit/livery-sanitiser-pin.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = (ctx, rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: absSrc(rel) });
const j = (v) => JSON.parse(JSON.stringify(v));

function boot() {
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, Blob, TextEncoder, TextDecoder, Uint8Array, btoa, atob, URL,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    module: { exports: {} },
    location: { origin: "https://x.test", pathname: "/", href: "https://x.test/", hash: "" },
    history: { state: null, replaceState() {} },
    Teams: { LIST: [{ id: "ferrari" }], liveryEnumOk: (k, v) => (k === "finish" ? ["matte", "gloss"].includes(v) : !(v in Object.prototype)) },
    Liveries: { FIELDS: new Array(40).fill(0) },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  run(ctx, "js/ui/settings-export.js");
  run(ctx, "js/ui/share-code.js");
  const SE = vm.runInContext("SettingsExport", ctx);
  const SC = sb.module.exports;
  const viaFile = (l) => { const r = SE.garageValue("livery.custom.ferrari", [l]); return r && r[0] ? j(r[0]) : null; };
  const viaCode = (l) => { const e = SC.encode("livery", { team: "ferrari", id: "mine", livery: l }); return e.ok ? j(SC.decode(e.code).livery) : null; };
  return { viaFile, viaCode };
}
const base = { id: "mine", c1: [1, 0, 0], c2: [0, 0, 1] };
const ROWS = [
  ["clean livery", { ...base, name: "N", finish: "matte" }],
  ["colour clamp 1e9/-5", { ...base, c1: [1e9, -5, 3] }],
  ["bad enum string", { ...base, finish: "constructor" }],
  ["unknown pill value", { ...base, finish: "chrome" }],
  ["over-64 id", { ...base, id: "x".repeat(65) }],
  ["64-char id", { ...base, id: "x".repeat(64) }],
  ["proto key", JSON.parse('{"id":"mine","c1":[1,0,0],"c2":[0,0,1],"__proto__":[1,1,1]}')],
  ["non-finite colour", { ...base, c1: [NaN, 0, 0] }],
  ["array", [base]],
];
for (const [label, livery] of ROWS) {
  test(`both doors agree: ${label}`, () => {
    const { viaFile, viaCode } = boot();
    assert.deepEqual(viaCode(livery), viaFile(livery));
  });
}
test("strict enum: an unknown pill is dropped through both doors", () => {
  const { viaFile, viaCode } = boot();
  const l = { ...base, finish: "chrome" };
  assert.equal("finish" in viaFile(l), false);
  assert.equal("finish" in viaCode(l), false);
});
test("clamps 1e9 / -5 to the unit cube; an over-64 id is refused", () => {
  const { viaFile, viaCode } = boot();
  const l = { ...base, c1: [1e9, -5, 3] };
  assert.deepEqual(viaFile(l).c1, [1, 0, 1]);
  assert.deepEqual(viaCode(l).c1, [1, 0, 1]);
  assert.equal(viaFile({ ...base, id: "x".repeat(65) }), null);
  assert.equal(viaCode({ ...base, id: "x".repeat(65) }), null);
});
