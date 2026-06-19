/* Apex 26 — Binary glTF (.glb) loader.
 *
 * Self-contained glTF 2.0 *binary* (.glb) parser that bakes a model down to the
 * plain mesh data GLX.createMesh expects: {pos,nrm,col,idx}. The renderer is
 * vertex-colour only (no textures), so each material's baseColorFactor (and any
 * COLOR_0 attribute) is baked into the per-vertex colour. All primitives of all
 * meshes are merged into one buffer set, with node transforms applied.
 *
 * Usage (browser):
 *   const data = await GLTF.load("assets/models/car.glb");
 *   const mesh = GLX.createMesh(data);
 *   // ...later... GLX.draw(mesh, modelMat);
 *
 * The model's OWN baked colours are used. Team-tinting can be applied later by
 * passing { tint:[r,g,b] } via GLTF.toMesh / GLTF.load opts (multiplies colour).
 *
 * API:
 *   GLTF.parseGLB(arrayBuffer)        -> parsed glTF object (throws on malformed)
 *   GLTF.toMesh(arrayBuffer, opts)    -> {pos,nrm,col,idx} for GLX.createMesh
 *   GLTF.load(url[, opts])            -> Promise<{pos,nrm,col,idx}> (never throws sync)
 *
 * opts: { scale?:number (default 1), swapYZ?:bool, tint?:[r,g,b] }
 *
 * Intentionally NOT supported (kept tiny on purpose): textures/UVs, external
 * .bin or image URIs, Draco / meshopt compression, animations, skins/morphs,
 * sparse accessors, cameras, lights. The text .gltf form is not parsed (binary
 * .glb only). Such files throw / reject with a clear message so callers can fall
 * back to procedural geometry.
 */
"use strict";

const GLTF = (function () {

  // ---------- GLB container constants ----------
  const GLB_MAGIC = 0x46546c67;   // "glTF" little-endian
  const CHUNK_JSON = 0x4e4f534a;  // "JSON"
  const CHUNK_BIN = 0x004e4942;   // "BIN\0"

  // glTF accessor componentType -> [TypedArray, bytes]
  const COMP = {
    5120: [Int8Array, 1],
    5121: [Uint8Array, 1],
    5122: [Int16Array, 2],
    5123: [Uint16Array, 2],
    5125: [Uint32Array, 4],
    5126: [Float32Array, 4],
  };
  const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

  // ---------- small column-major mat4 / quat helpers (self-contained) ----------
  function mIdentity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  // a * b, both column-major 16-arrays.
  function mMul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }

  // Compose a TRS matrix from translation[3], quaternion[4] (x,y,z,w), scale[3].
  function mFromTRS(t, q, s) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = s[0], sy = s[1], sz = s[2];
    // column-major
    return [
      (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
      t[0], t[1], t[2], 1,
    ];
  }

  // Transform a point [x,y,z] by a column-major mat4 (w=1, perspective divide).
  function mPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  }

  // 3x3 inverse-transpose of a mat4's upper-left, applied to a normal vector.
  // Returns the (unnormalised) transformed normal; caller normalises.
  function normalMatTransform(m, n) {
    // upper-left 3x3
    const a = m[0], b = m[1], c = m[2];
    const d = m[4], e = m[5], f = m[6];
    const g = m[8], h = m[9], i = m[10];
    // determinant
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) {
      // singular (e.g. zero scale axis) — fall back to plain rotation*normal
      return [a * n[0] + d * n[1] + g * n[2], b * n[0] + e * n[1] + h * n[2], c * n[0] + f * n[1] + i * n[2]];
    }
    const id = 1 / det;
    // inverse of 3x3 (cofactor / det), then transpose = multiply normal by inverse-transpose.
    // inv = adj^T / det. Normal' = inv^T * n = (adj / det) * n  (adj is cofactor matrix).
    const c00 = (e * i - f * h) * id;
    const c01 = (f * g - d * i) * id;
    const c02 = (d * h - e * g) * id;
    const c10 = (c * h - b * i) * id;
    const c11 = (a * i - c * g) * id;
    const c12 = (b * g - a * h) * id;
    const c20 = (b * f - c * e) * id;
    const c21 = (c * d - a * f) * id;
    const c22 = (a * e - b * d) * id;
    // normal' = inverse-transpose * n. inverse-transpose rows are the cofactor rows.
    return [
      c00 * n[0] + c01 * n[1] + c02 * n[2],
      c10 * n[0] + c11 * n[1] + c12 * n[2],
      c20 * n[0] + c21 * n[1] + c22 * n[2],
    ];
  }

  // ---------- base64 (data: URI buffers) ----------
  // atob in the browser; Buffer in Node (self-test). Returns a Uint8Array.
  function base64ToBytes(b64) {
    if (typeof atob === "function") {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(b64, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    throw new Error("GLTF: no base64 decoder available (need atob or Buffer)");
  }

  // ---------- GLB container parse ----------
  function parseGLB(arrayBuffer) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error("GLTF.parseGLB: expected an ArrayBuffer");
    }
    const dv = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength < 12) throw new Error("GLTF: file too small for GLB header");

    const magic = dv.getUint32(0, true);
    if (magic !== GLB_MAGIC) throw new Error("GLTF: bad GLB magic (not a .glb file)");
    const version = dv.getUint32(4, true);
    if (version !== 2) throw new Error("GLTF: unsupported GLB version " + version + " (need 2)");
    const total = dv.getUint32(8, true);
    if (total > arrayBuffer.byteLength) throw new Error("GLTF: GLB length exceeds buffer");

    let offset = 12;
    let json = null;
    let bin = null;
    while (offset + 8 <= total) {
      const chunkLen = dv.getUint32(offset, true);
      const chunkType = dv.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      if (dataStart + chunkLen > total) throw new Error("GLTF: GLB chunk overruns file");
      if (chunkType === CHUNK_JSON) {
        const bytes = new Uint8Array(arrayBuffer, dataStart, chunkLen);
        const text = new TextDecoder("utf-8").decode(bytes);
        json = JSON.parse(text);
      } else if (chunkType === CHUNK_BIN) {
        bin = new Uint8Array(arrayBuffer, dataStart, chunkLen);
      }
      // unknown chunk types are skipped per spec
      offset = dataStart + chunkLen + (chunkLen % 4 === 0 ? 0 : 4 - (chunkLen % 4));
    }

    if (!json) throw new Error("GLTF: GLB has no JSON chunk");
    if (json.asset && json.asset.version && !String(json.asset.version).startsWith("2")) {
      throw new Error("GLTF: asset version " + json.asset.version + " unsupported (need 2.x)");
    }
    return { json, bin };
  }

  // ---------- accessor reading ----------
  // Resolve a buffer (index) to a Uint8Array. Embedded BIN, or data: URI.
  function resolveBuffer(json, bin, index) {
    const buf = json.buffers[index];
    if (!buf) throw new Error("GLTF: missing buffer " + index);
    if (buf.uri === undefined) {
      // embedded BIN chunk
      if (!bin) throw new Error("GLTF: buffer " + index + " references BIN chunk but none present");
      return bin;
    }
    const uri = buf.uri;
    if (uri.startsWith("data:")) {
      const comma = uri.indexOf(",");
      if (comma < 0) throw new Error("GLTF: malformed data: URI");
      const meta = uri.slice(5, comma);
      if (meta.indexOf("base64") < 0) throw new Error("GLTF: only base64 data: URIs supported");
      return base64ToBytes(uri.slice(comma + 1));
    }
    throw new Error("GLTF: external buffer uri not supported: " + uri);
  }

  // Read an accessor into a flat JS array of numbers (length = count*numComponents).
  function readAccessor(json, bin, accessorIndex) {
    const acc = json.accessors[accessorIndex];
    if (!acc) throw new Error("GLTF: missing accessor " + accessorIndex);
    if (acc.sparse) throw new Error("GLTF: sparse accessors not supported");
    const comp = COMP[acc.componentType];
    if (!comp) throw new Error("GLTF: unknown componentType " + acc.componentType);
    const nc = NUM_COMPONENTS[acc.type];
    if (!nc) throw new Error("GLTF: unknown accessor type " + acc.type);
    const [TA, bytes] = comp;

    const view = json.bufferViews[acc.bufferView];
    if (!view) throw new Error("GLTF: accessor without bufferView not supported");
    const bufBytes = resolveBuffer(json, bin, view.buffer);
    const baseByte = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const count = acc.count;
    const elemStride = bytes * nc;
    const stride = view.byteStride || elemStride; // interleaved support

    const out = new Array(count * nc);
    // Need a DataView for arbitrary (possibly unaligned) offsets.
    const dv = new DataView(bufBytes.buffer, bufBytes.byteOffset, bufBytes.byteLength);
    const normalized = acc.normalized;
    for (let i = 0; i < count; i++) {
      const rowByte = baseByte + i * stride;
      for (let c = 0; c < nc; c++) {
        const b = rowByte + c * bytes;
        let v;
        switch (acc.componentType) {
          case 5120: v = dv.getInt8(b); if (normalized) v = Math.max(v / 127, -1); break;
          case 5121: v = dv.getUint8(b); if (normalized) v = v / 255; break;
          case 5122: v = dv.getInt16(b, true); if (normalized) v = Math.max(v / 32767, -1); break;
          case 5123: v = dv.getUint16(b, true); if (normalized) v = v / 65535; break;
          case 5125: v = dv.getUint32(b, true); break;
          case 5126: v = dv.getFloat32(b, true); break;
          default: v = 0;
        }
        out[i * nc + c] = v;
      }
    }
    return { data: out, count, numComponents: nc };
  }

  // ---------- node hierarchy -> world matrices ----------
  function nodeLocalMatrix(node) {
    if (node.matrix) return node.matrix.slice(); // already column-major per spec
    const t = node.translation || [0, 0, 0];
    const q = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    return mFromTRS(t, q, s);
  }

  // Walk the scene, accumulating a world matrix per node that has a mesh.
  // Returns [{ mesh:meshIndex, world:mat4 }, ...]. If no scene/nodes, falls back
  // to drawing every mesh at identity.
  function collectMeshInstances(json) {
    const instances = [];
    const nodes = json.nodes;
    if (!nodes || nodes.length === 0) {
      if (json.meshes) {
        for (let i = 0; i < json.meshes.length; i++) instances.push({ mesh: i, world: mIdentity() });
      }
      return instances;
    }

    let roots;
    const sceneIndex = json.scene !== undefined ? json.scene : 0;
    if (json.scenes && json.scenes[sceneIndex] && json.scenes[sceneIndex].nodes) {
      roots = json.scenes[sceneIndex].nodes;
    } else {
      roots = nodes.map((_, i) => i); // no scene def: treat all as roots
    }

    const visited = new Set();
    function walk(idx, parentWorld) {
      if (visited.has(idx)) return; // guard against malformed cycles
      visited.add(idx);
      const node = nodes[idx];
      if (!node) return;
      const world = mMul(parentWorld, nodeLocalMatrix(node));
      if (node.mesh !== undefined) instances.push({ mesh: node.mesh, world });
      if (node.children) {
        for (const ch of node.children) walk(ch, world);
      }
    }
    for (const r of roots) walk(r, mIdentity());
    return instances;
  }

  // ---------- main: bake to merged {pos,nrm,col,idx} ----------
  function toMesh(arrayBuffer, opts) {
    opts = opts || {};
    const scale = opts.scale !== undefined ? opts.scale : 1;
    const swapYZ = !!opts.swapYZ;
    const tint = opts.tint || null;

    const { json, bin } = parseGLB(arrayBuffer);
    if (!json.meshes || json.meshes.length === 0) throw new Error("GLTF: file has no meshes");

    const instances = collectMeshInstances(json);

    const posOut = [];
    const nrmOut = [];
    const colOut = [];
    const idxOut = [];
    let vertBase = 0;

    for (const inst of instances) {
      const mesh = json.meshes[inst.mesh];
      if (!mesh || !mesh.primitives) continue;
      const world = inst.world;

      for (const prim of mesh.primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) {
          // only TRIANGLES (mode 4) supported; skip points/lines/strips
          continue;
        }
        const attr = prim.attributes || {};
        if (attr.POSITION === undefined) continue;

        const posA = readAccessor(json, bin, attr.POSITION);
        const vCount = posA.count;
        const positions = posA.data;

        // indices: explicit, or sequential
        let indices;
        if (prim.indices !== undefined) {
          indices = readAccessor(json, bin, prim.indices).data;
        } else {
          indices = new Array(vCount);
          for (let i = 0; i < vCount; i++) indices[i] = i;
        }

        // normals: read, or compute flat face normals below
        let normals = null;
        if (attr.NORMAL !== undefined) {
          normals = readAccessor(json, bin, attr.NORMAL).data;
        }

        // material baseColorFactor (default white)
        let baseCol = [1, 1, 1];
        if (prim.material !== undefined && json.materials && json.materials[prim.material]) {
          const m = json.materials[prim.material];
          const pbr = m.pbrMetallicRoughness;
          if (pbr && pbr.baseColorFactor) {
            baseCol = [pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]];
          }
        }
        if (tint) baseCol = [baseCol[0] * tint[0], baseCol[1] * tint[1], baseCol[2] * tint[2]];

        // optional per-vertex COLOR_0 (VEC3 or VEC4); multiply into base colour
        let vcolA = null;
        if (attr.COLOR_0 !== undefined) vcolA = readAccessor(json, bin, attr.COLOR_0);

        // transform + emit vertices
        for (let i = 0; i < vCount; i++) {
          let p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
          p = mPoint(world, p);
          if (swapYZ) p = [p[0], p[2], p[1]];
          posOut.push(p[0] * scale, p[1] * scale, p[2] * scale);

          if (normals) {
            let n = normalMatTransform(world, [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
            if (swapYZ) n = [n[0], n[2], n[1]];
            const l = Math.hypot(n[0], n[1], n[2]) || 1;
            nrmOut.push(n[0] / l, n[1] / l, n[2] / l);
          } else {
            nrmOut.push(0, 0, 0); // filled after, from faces
          }

          let cr = baseCol[0], cg = baseCol[1], cb = baseCol[2];
          if (vcolA) {
            const ncn = vcolA.numComponents;
            cr *= vcolA.data[i * ncn];
            cg *= vcolA.data[i * ncn + 1];
            cb *= vcolA.data[i * ncn + 2];
          }
          colOut.push(cr, cg, cb);
        }

        // compute flat face normals if the primitive had none
        if (!normals) {
          computeFlatNormals(posOut, indices, vertBase, nrmOut);
        }

        // emit indices, offset by this primitive's vertex base
        for (let i = 0; i < indices.length; i++) idxOut.push(indices[i] + vertBase);
        vertBase += vCount;
      }
    }

    if (vertBase === 0) throw new Error("GLTF: no triangle geometry found");

    const pos = new Float32Array(posOut);
    const nrm = new Float32Array(nrmOut);
    const col = new Float32Array(colOut);
    const big = vertBase > 65535;
    const idx = big ? new Uint32Array(idxOut) : new Uint16Array(idxOut);
    return { pos, nrm, col, idx };
  }

  // Accumulate flat (per-face) normals for the triangles of one primitive into
  // the global nrmOut array. vertBase is the global offset of this primitive's
  // first vertex; positions for those verts already live in posOut.
  function computeFlatNormals(posOut, indices, vertBase, nrmOut) {
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const ia = vertBase + indices[t];
      const ib = vertBase + indices[t + 1];
      const ic = vertBase + indices[t + 2];
      const ax = posOut[ia * 3], ay = posOut[ia * 3 + 1], az = posOut[ia * 3 + 2];
      const bx = posOut[ib * 3], by = posOut[ib * 3 + 1], bz = posOut[ib * 3 + 2];
      const cx = posOut[ic * 3], cy = posOut[ic * 3 + 1], cz = posOut[ic * 3 + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      // assign the face normal to each of the triangle's three vertices
      for (const vi of [ia, ib, ic]) {
        nrmOut[vi * 3] = nx;
        nrmOut[vi * 3 + 1] = ny;
        nrmOut[vi * 3 + 2] = nz;
      }
    }
  }

  // ---------- async loader (browser fetch) ----------
  // Resolves to {pos,nrm,col,idx}; rejects gracefully so callers can fall back
  // to procedural geometry. Never throws synchronously.
  function load(url, opts) {
    return Promise.resolve().then(function () {
      if (typeof fetch !== "function") throw new Error("GLTF.load: fetch unavailable");
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error("GLTF.load: HTTP " + res.status + " for " + url);
        return res.arrayBuffer();
      }).then(function (buf) {
        return toMesh(buf, opts);
      });
    });
  }

  return { parseGLB, toMesh, load };
})();
