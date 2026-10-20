// livery-finish-contract — the shared contract of the garage finishes/parts slices
// (docs/notes/GARAGE-FINISHES-PARTS-2026-10-17.md): reserved finish ids, the new livery
// fields in every field list, and the zone-finish map in applyFinish.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadParts } from "../../tools/car/parts-sweep.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const cx = { console, Math, Object, Array, Map, Set, JSON, Number, String, Boolean };
cx.globalThis = cx;
vm.createContext(cx);
vm.runInContext(read("js/car/car-material-shade.js"), cx, { filename: absSrc("js/car/car-material-shade.js") });
vm.runInContext(read("js/car/car-materials.js"), cx, { filename: absSrc("js/car/car-materials.js") });
const CM = vm.runInContext("CarMaterials", cx);

const COLOURS = ["mirrorTint", "rimTint", "caliperTint", "sidewallInk", "helmetBase", "helmetAccent"];
const PILLS = ["podFinish", "finFinish", "mirrorFinish", "helmetStyle", "crestTone", "crestFrame"];

test("reserved finish ids are unique, past the shipped chain, and disjoint from FINISH_SURFACE", () => {
  const reserved = Object.values(CM.FINISH_RESERVED);
  assert.equal(new Set(reserved).size, reserved.length);
  assert.ok(reserved.every((id) => id > 33), "34+ only: 20-33 are shipped surface ids");
  // A reserved id may be taken by its OWN finish row once the branch exists in all three shaders (the row's id must equal
  // the reservation, checked below); it may never collide with a non-finish SURFACES id.
  const used = new Set(Object.values(CM.SURFACES));
  for (const id of reserved) assert.ok(!used.has(id), `reserved id ${id} is already a surface`);
  for (const [name, id] of Object.entries(CM.FINISH_SURFACE)) if (id > 33) assert.equal(CM.FINISH_RESERVED[name], id, `${name} -> ${id} is not its reserved id`);
  for (const name of Object.keys(CM.FINISH_RESERVED)) assert.ok(!(name in CM.FINISH_SURFACE) || CM.FINISH_SURFACE[name] === CM.FINISH_RESERVED[name]);
  for (const [name, id] of Object.entries(CM.FINISH_SURFACE)) assert.ok(id <= 33 || Object.values(CM.FINISH_RESERVED).includes(id), `${name} -> ${id} is neither shipped nor reserved`);
});

test("every new livery field is in every field list the game keeps", () => {
  const lists = {
    "Liveries.FIELDS": /const FIELDS = \[([\s\S]*?)\];/.exec(read("js/car/liveries.js"))[1],
  };
  const ctx = vm.createContext({});
  for (const f of ["js/car/liveries.js", "js/car/custom-liveries.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const resolve = vm.runInContext("CustomLiveries.create({ store: {} })", ctx);
  const sheet = read("js/garage/setup-sheet.js");
  lists["LIV_DRAFT_COLORS"] = /const LIV_DRAFT_COLORS = \[([\s\S]*?)\];/.exec(sheet)[1];
  lists["LIV_DRAFT_PILLS"] = /const LIV_DRAFT_PILLS = \{([\s\S]*?)\};/.exec(sheet)[1];
  for (const k of COLOURS.concat(PILLS)) {
    const where = COLOURS.includes(k) ? ["Liveries.FIELDS", "LIV_DRAFT_COLORS"] : ["Liveries.FIELDS", "LIV_DRAFT_PILLS"];
    for (const name of where) assert.match(lists[name], new RegExp(`["']?${k}["']?`), `${k} missing from ${name}`);
    assert.equal(resolve.pickLivery({ id: "mine", c1: [0, 0, 0], c2: [1, 1, 1], [k]: "kept:" + k })[k], "kept:" + k, `${k} reaches live resolution`);
    assert.match(sheet, new RegExp(`\\n  ${k}: "`), `${k} has no LIV_ROW_HINT`);
  }
  for (const k of PILLS) assert.ok(!/LIV_DRAFT_COLORS = \[[\s\S]*?\];/.exec(sheet)[0].includes(`"${k}"`), `${k} is a pill, not a colour`);
});

test("zone finishes: a sidepod/fin/mirror finish remaps only that section's paint vertices", () => {
  const P = CM.SURFACES.paint;
  const out = { mat: [P, P, P, P, P, CM.SURFACES.carbon] };
  const sections = [{ name: "sidepods", from: 0, to: 2 }, { name: "sharkFin", from: 2, to: 3 }, { name: "mirrors", from: 3, to: 4 }, { name: "chassis", from: 4, to: 6 }];
  CM.applyFinish(out, "gloss", sections, { podFinish: "matte", finFinish: "chrome", mirrorFinish: "satin" });
  assert.deepEqual(out.mat, [28, 28, 27, 26, P, CM.SURFACES.carbon]);
});

test("no zone field set = the whole-car finish path, byte for byte", () => {
  const P = CM.SURFACES.paint;
  const out = { mat: [P, CM.SURFACES.glass, P] };
  CM.applyFinish(out, "satin", [], { podFinish: "inherit" });
  assert.deepEqual(out.mat, [26, CM.SURFACES.glass, 26]);
});

// Build-through (C2-22): the tests above read the contract off the data tables; these run the
// real Car3D.build and read the material column the mesh carries.
const { Car3D } = loadParts();
const buildMat = (livery) => Car3D.build([0.8, 0.05, 0.05], [0.9, 0.9, 0.9], { teamId: "ferrari", livery, noDriver: true }).mat;
const histogram = (mat) => { const h = {}; for (const v of mat) h[v] = (h[v] || 0) + 1; return h; };

test("every finish moves exactly the paint vertices of a built car to its surface id", () => {
  const gloss = histogram(buildMat({ finish: "gloss" }));
  const PAINT = CM.SURFACES.paint;
  assert.ok(gloss[PAINT] > 1000, "a built car has a large paint area to finish");
  for (const [name, id] of Object.entries(Car3D.FINISH_SURFACE)) {
    const h = histogram(buildMat({ finish: name }));
    assert.equal(h[PAINT] || 0, 0, `${name}: paint vertices left unfinished`);
    // `satin` shares its id with a non-paint surface already on the car, so compare the id's GAIN.
    assert.equal((h[id] || 0) - (gloss[id] || 0), gloss[PAINT], `${name}: the finish id ${id} did not take the paint vertices`);
    for (const k of Object.keys(gloss)) if (+k !== PAINT && +k !== id) assert.equal(h[k], gloss[k], `${name}: touched non-paint surface ${k}`);
  }
});

test("a zone finish reaches the built mesh for its section only", () => {
  const PAINT = CM.SURFACES.paint, CHROME = Car3D.FINISH_SURFACE.chrome;
  const plain = histogram(buildMat({ finish: "gloss" }));
  const pods = histogram(buildMat({ finish: "gloss", podFinish: "chrome" }));
  assert.ok((pods[CHROME] || 0) > 0, "no sidepod vertex took the zone finish");
  assert.ok(pods[PAINT] > 0 && pods[PAINT] < plain[PAINT], "the zone finish must replace some paint, not all of it");
  assert.equal((pods[CHROME] || 0) + pods[PAINT], plain[PAINT], "every changed vertex was paint");
});

test("expanded finishes preserve nested-zone precedence, nose override and protected surfaces", () => {
  const P = CM.SURFACES.paint, protectedIds = [CM.SURFACES.carbon, CM.SURFACES.glass, CM.SURFACES.emissive, CM.SURFACES.mirror];
  const sections = [{ name: "chassis", from: 0, to: 3 }, { name: "engineCover", from: 3, to: 5 },
    { name: "mirrors", from: 5, to: 9 }];
  const zones = [{ name: "engineCover", from: 1, to: 2 }];
  for (const finish of ["holographic", "velvet", "hammered", "anodized"]) {
    const id = CM.FINISH_SURFACE[finish];
    assert.ok(Number.isInteger(id) && id > 40, `${finish} has its own shader identity`);
    const out = { mat: [P, P, P, P, P, ...protectedIds], pos: Array.from({ length: 9 }, (_, i) => [0, 0, i === 2 ? 2 : 0]).flat() };
    CM.applyFinish(out, finish, sections, { finish, coverFinish: "gloss", noseFinish: "satin" }, zones);
    assert.deepEqual(out.mat, [id, P, CM.FINISH_SURFACE.satin, P, P, ...protectedIds], `${finish}: overrides must touch only their paint`);
    assert.equal(CM.finishOf({ finish, coverFinish: "inherit" }, "coverFinish"), finish);
    assert.equal(CM.finishOf({ finish, coverFinish: "unknown-future-finish" }, "coverFinish"), finish);
  }
});

// Execute WGX's actual packing function with its real quantisers. The GPU mock
// cannot emulate a broken indexed vertex_index, so verify the independent bytes
// and the shader's selection contract rather than trusting the storage pull.
function wgxCarPacking() {
  const source = read("js/render/webgpu/wgx.js"), start = source.indexOf("    function _interleave(data) {");
  const end = source.indexOf("    // createBuffer may still throw", start);
  assert.ok(start >= 0 && end > start, "real WGX interleave body must be found");
  const stride = Number(/const VERTEX_STRIDE = (\d+);/.exec(source)[1]);
  const context = vm.createContext({ Float32Array, Int16Array, Uint16Array, Uint32Array, ArrayBuffer,
    Number, Array, Math, toF32: (v) => v instanceof Float32Array ? v : new Float32Array(v),
    VERTEX_STRIDE: stride, VERTEX_FLOATS: stride >> 2 });
  vm.runInContext(read("js/render/shared/vertex-pack.js"), context, { filename: absSrc("js/render/shared/vertex-pack.js") });
  const expandStart = source.indexOf("    function _expandPull(vert, attr, idx) {");
  const expandEnd = source.indexOf("    function _makeAttrBG(attr)", expandStart);
  assert.ok(expandStart >= 0 && expandEnd > expandStart, "real WGX indexed expansion body must be found");
  return { pack: vm.runInContext(`(${source.slice(start, end)})`, context),
    expand: vm.runInContext(`(${source.slice(expandStart, expandEnd)})`, context), stride };
}
function carIdMesh(ids) {
  const n = ids.length;
  return { pos: Float32Array.from(ids.flatMap((_, i) => [i * .25, .3, -i * .125])),
    nrm: Float32Array.from(ids.flatMap(() => [.2, .9, -.3])),
    col: Float32Array.from(ids.flatMap(() => [.1, .3, .8])),
    mat: Float32Array.from(ids), idx: Uint16Array.from({ length: n }, (_, i) => i) };
}

test("WGX carries every packed car id independently of indexed vertex_index without growing its vertices", () => {
  const { pack, stride } = wgxCarPacking(), ids = Array.from({ length: 66 }, (_, i) => i + 20);
  const data = carIdMesh(ids), packed = pack(data), plain = pack({ ...data, mat: null });
  assert.equal(stride, 28); assert.equal(packed.vert.byteLength, ids.length * 28);
  assert.equal(packed.count, data.idx.length); assert.deepEqual(Array.from(packed.idx), Array.from(data.idx));
  const short = new Int16Array(packed.vert.buffer), raw = new Uint8Array(packed.vert.buffer), baseline = new Uint8Array(plain.vert.buffer);
  ids.forEach((id, i) => {
    const encoded = short[i * 14 + 9];
    assert.equal(encoded, id * 256);
    const fetched = Math.fround(encoded / 32767);  // snorm16 vertex fetch
    const decoded = Math.floor(Math.fround(fetched * Math.fround(32767 / 256)) + .5);
    assert.equal(decoded, id, `${id} must survive GPU f32 decode, including protected carbon/glass/light ids`);
    // Even when the broken storage route returns vertex zero's material, this
    // vertex's valid padding route selects its own authored classification.
    assert.equal(decoded >= 20 && decoded <= 85 ? decoded : ids[0], id);
    for (let b = 0; b < stride; b++) if (b !== 18 && b !== 19)
      assert.equal(raw[i * stride + b], baseline[i * stride + b], `id ${id}: byte ${b} outside normal.w changed`);
    assert.equal(packed.attr[i * 4], data.mat[i], "data.mat remains authoritative in the storage buffer too");
  });
});

test("WGX car padding does not capture non-car material or FLAG fractional fields", () => {
  const { pack } = wgxCarPacking(), ids = [0, 1, 15.4, 16, 19, 19.5, 85.5, 86, NaN, Infinity];
  const data = carIdMesh(ids), packed = pack(data), short = new Int16Array(packed.vert.buffer);
  ids.forEach((_, i) => {
    assert.equal(short[i * 14 + 9], 0, "only exact integer car ids occupy normal.w");
    assert.ok(Object.is(packed.attr[i * 4], data.mat[i]), "legacy storage material survives unchanged");
  });
  assert.ok(new Int16Array(pack({ ...data, mat: null }).vert.buffer).every((v, i) => i % 14 !== 9 || v === 0));

});



// Evaluate the actual backend layout declarations and the small, pure vertex
// expressions at this transport boundary. This is not a WGSL compiler/GPU test:
// the independent f32 round-trip above and rendered checks cover those layers.
function wgxVertexTransport() {
  const backend = read("js/render/webgpu/wgx.js"), shader = read("js/render/webgpu/wgsl-chunks.js");
  const declaration = (name) => {
    const found = new RegExp(`const ${name} = ([\\s\\S]*?);`).exec(backend);
    assert.ok(found, `backend declaration ${name} must exist`);
    return found[1];
  };
  const stride = vm.runInNewContext(declaration("VERTEX_STRIDE"));
  const layout = (name) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${declaration(name)})`, { VERTEX_STRIDE: stride })));
  const input = /@location\((\d+)\)\s+aNrm\s*:\s*vec(\d)<f32>/.exec(shader);
  assert.ok(input, "vertex normal input must be declared");
  const expression = (lhs) => {
    const found = new RegExp(`\\b${lhs.replaceAll(".", "\\.")}\\s*=\\s*([^;]+);`).exec(shader);
    assert.ok(found, `vertex expression ${lhs} must exist`);
    return found[1];
  };
  // Both scalar expressions are valid JS arithmetic too. Execute their source,
  // rather than recopying the decode scale, selection predicate or fallback.
  const decode = new vm.Script(expression("packedCarId"));
  const select = new vm.Script(expression("o.matId"));
  const normal = expression("o.nrm").split("*").map((term) => term.trim());
  const normalLayout = layout("VERTEX_POS_LAYOUT").attributes.find((a) => a.shaderLocation === Number(input[1]));
  assert.ok(normalLayout, "vertex input must have a bound layout attribute");
  const format = /^snorm(\d+)x(\d)$/.exec(normalLayout.format);
  assert.ok(format, "normal fetch requires a signed normalized vector");
  assert.equal(Number(format[1]), 16, "normal components consume two bytes");
  assert.equal(Number(format[2]), Number(input[2]), "pipeline and shader must agree on the normal width");
  const shadow = layout("SHADOW_VERTEX_LAYOUT");
  const lit = layout("VERTEX_POS_LAYOUT");
  assert.equal(lit.arrayStride, stride);
  assert.equal(shadow.arrayStride, stride);
  assert.deepEqual(shadow.attributes, [lit.attributes.find((a) => a.shaderLocation === 0)],
    "shadow uses exactly the same position fetch, without consuming the packed normal lane");
  return (packed, vertex, pulledId, matrix) => {
    const bytes = new DataView(packed.vert.buffer, packed.vert.byteOffset, packed.vert.byteLength);
    const values = Array.from({ length: Number(input[2]) }, (_, c) =>
      Math.fround(Math.max(-1, bytes.getInt16(vertex * stride + normalLayout.offset + c * 2, true) / 32767)));
    const aNrm = Object.fromEntries([..."xyzw"].map((name, c) => [name, values[c]]));
    const context = vm.createContext({ aNrm, pulled: { x: pulledId }, floor: Math.floor,
      select: (a, b, condition) => condition ? b : a });
    context.packedCarId = decode.runInContext(context);
    const matId = select.runInContext(context);
    // Interpret matrix-vector multiplication with explicit dimensions. A vec4
    // normal (including its material lane) cannot silently pass as a vec3.
    assert.equal(normal.length, 2, "normal transform must remain one matrix-vector product");
    const vector = (term) => {
      if (term === "nm") return matrix;
      const swizzle = /^aNrm\.([xyzw]+)$/.exec(term);
      assert.ok(swizzle, `unsupported normal operand ${term}`);
      return [...swizzle[1]].map((component) => aNrm[component]);
    };
    const left = vector(normal[0]), right = vector(normal[1]);
    assert.equal(left.length, 3); assert.equal(right.length, 3);
    const nrm = left.map((row) => row.reduce((sum, value, c) => sum + value * right[c], 0));
    const position = shadow.attributes[0];
    assert.equal(position.format, "float32x3");
    const shadowPos = Array.from({ length: 3 }, (_, c) =>
      bytes.getFloat32(vertex * shadow.arrayStride + position.offset + c * 4, true));
    return { matId, nrm, shadowPos };
  };
}

test("WGX vertex transport delivers classified ids and rotates normals independently of normal.w", () => {
  const { pack } = wgxCarPacking(), transport = wgxVertexTransport();
  const ids = Array.from({ length: 66 }, (_, i) => i + 20).concat([0, 15.4, 16, 19.5, 85.5, 86]);
  const data = carIdMesh(ids), packed = pack(data);
  const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], yaw = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
  const base = transport(packed, 0, 21, identity).nrm;
  ids.forEach((id, i) => {
    const pulled = i < 66 ? 21 : packed.attr[i * 4];
    const result = transport(packed, i, pulled, yaw);
    assert.equal(result.matId, i < 66 ? id : pulled,
      `vertex ${i}: packed car classification must bypass stuck vertex_index, non-cars retain storage`);
    assert.deepEqual(result.shadowPos, Array.from(data.pos.slice(i * 3, i * 3 + 3)),
      `vertex ${i}: shadow fetch must preserve the authored position`);
    assert.deepEqual(result.nrm, [base[2], base[1], -base[0]],
      `vertex ${i}: material padding must not affect the transformed normal`);
  });
});


test("WGX indexed expansion preserves packed car surface bytes through triangle reordering", () => {
  const { pack, expand, stride } = wgxCarPacking(), packed = pack(carIdMesh([21, 41, 25]));
  const indices = Uint16Array.from([2, 1, 0, 0, 1, 2]), order = [2, 0, 1, 0, 2, 1];
  const expanded = expand(packed.vert, packed.attr, indices);
  const source = new Uint8Array(packed.vert.buffer), result = new Uint8Array(expanded.vert.buffer);
  assert.equal(expanded.count, indices.length);
  order.forEach((vertex, i) => {
    assert.deepEqual(Array.from(result.slice(i * stride, (i + 1) * stride)), Array.from(source.slice(vertex * stride, (vertex + 1) * stride)), "expanded triangles retain all packed lanes bit-for-bit");
    assert.equal(expanded.attr[i * 4], packed.attr[vertex * 4], "storage sidecar follows the same reordered vertex");
  });
});
