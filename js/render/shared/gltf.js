/* Apex 26 — Binary glTF (.glb) loader. Self-contained glTF 2.0 *binary* (.glb) parser that bakes a model down to the plain mesh data GLX.createMesh expects: {pos,… */
"use strict";

const GLTF = (function () {

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

  // Sign of the upper-left 3x3 determinant: negative for a MIRRORED node (an
  // odd number of negative scale axes — a modeller's "mirror" modifier, or a
  // left/right part exported once and instanced with scale -1).
  function det3(m) {
    return m[0] * (m[5] * m[10] - m[6] * m[9])
         - m[1] * (m[4] * m[10] - m[6] * m[8])
         + m[2] * (m[4] * m[9] - m[5] * m[8]);
  }

  function normalMatrix(m) {
    // upper-left 3x3
    const a = m[0], b = m[1], c = m[2];
    const d = m[4], e = m[5], f = m[6];
    const g = m[8], h = m[9], i = m[10];
    // determinant
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) {
      // singular (e.g. zero scale axis) — fall back to plain rotation*normal
      return [a, d, g, b, e, h, c, f, i];
    }
    const id = 1 / det;
    const c00 = (e * i - f * h) * id;
    const c01 = (f * g - d * i) * id;
    const c02 = (d * h - e * g) * id;
    const c10 = (c * h - b * i) * id;
    const c11 = (a * i - c * g) * id;
    const c12 = (b * g - a * h) * id;
    const c20 = (b * f - c * e) * id;
    const c21 = (c * d - a * f) * id;
    const c22 = (a * e - b * d) * id;
    // The coefficients above are cofactor COLUMNS for our column-major input.
    // Apply their rows: normals need inverse-transpose, not inverse rotation.
    return [c00, c10, c20, c01, c11, c21, c02, c12, c22];
  }

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

  // Resolve a buffer (index) to a Uint8Array. Embedded BIN, or data: URI.
  function resolveBuffer(json, bin, index) {
    const buf = json.buffers && json.buffers[index];   // no buffers[] at all → same named error, not a bare TypeError
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
    const acc = json.accessors && json.accessors[accessorIndex];
    if (!acc) throw new Error("GLTF: missing accessor " + accessorIndex);
    if (acc.sparse) throw new Error("GLTF: sparse accessors not supported");
    const comp = COMP[acc.componentType];
    if (!comp) throw new Error("GLTF: unknown componentType " + acc.componentType);
    const nc = NUM_COMPONENTS[acc.type];
    if (!nc) throw new Error("GLTF: unknown accessor type " + acc.type);
    const [TA, bytes] = comp;

    const view = json.bufferViews && json.bufferViews[acc.bufferView];
    if (!view) throw new Error("GLTF: accessor without bufferView not supported");
    const bufBytes = resolveBuffer(json, bin, view.buffer);
    const baseByte = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const count = acc.count;
    const elemStride = bytes * nc;
    const stride = view.byteStride || elemStride; // interleaved support
    const viewStart = view.byteOffset || 0, accStart = acc.byteOffset || 0;
    const end = count ? accStart + (count - 1) * stride + elemStride : accStart;
    if (!Number.isSafeInteger(count) || count < 0 ||
        !Number.isSafeInteger(viewStart) || viewStart < 0 ||
        !Number.isSafeInteger(view.byteLength) || view.byteLength < 0 ||
        !Number.isSafeInteger(accStart) || accStart < 0 ||
        !Number.isSafeInteger(stride) || stride < elemStride || stride % bytes !== 0 ||
        (view.byteStride != null && view.byteStride !== stride) ||
        !Number.isSafeInteger(end) || end > view.byteLength ||
        viewStart + view.byteLength > bufBytes.byteLength) {
      throw new Error("GLTF: accessor exceeds bufferView bounds or has invalid stride");
    }

    const normalized = acc.normalized;
    const n = count * nc;
    // Tightly packed and component-aligned: a typed view, not one heap number per
    // component. A 40k-vert import was allocating ~17 MB of boxed arrays for a
    // ~1.5 MB mesh (scratch/gltf-bench.mjs, 2026-10-27). Unaligned or strided
    // accessors still go through DataView below.
    const aligned = ((bufBytes.byteOffset + baseByte) % bytes) === 0;
    if (stride === elemStride && aligned && !normalized) {
      return { data: new TA(bufBytes.buffer, bufBytes.byteOffset + baseByte, n), count, numComponents: nc };
    }
    const out = new Float32Array(n);
    const dv = new DataView(bufBytes.buffer, bufBytes.byteOffset, bufBytes.byteLength);
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

  function nodeLocalMatrix(node) {
    if (node.matrix) return node.matrix.slice(); // already column-major per spec
    const t = node.translation || [0, 0, 0];
    const q = node.rotation || [0, 0, 0, 1];
    const s = node.scale || [1, 1, 1];
    return mFromTRS(t, q, s);
  }

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
      // No scene def: only UNPARENTED nodes are roots. Walking every node in
      // index order visited a child listed before its parent at identity and
      // then skipped it inside the parent's walk (shared visited set) —
      // wrong transform, silently.
      const parented = new Set();
      for (const nd of nodes) if (nd && nd.children) for (const ch of nd.children) parented.add(ch);
      roots = nodes.map((_, i) => i).filter((i) => !parented.has(i));
      if (!roots.length) roots = nodes.map((_, i) => i); // cyclic garbage: old behavior
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

  function toMesh(arrayBuffer, opts) {
    opts = opts || {};
    const scale = opts.scale !== undefined ? opts.scale : 1;
    const tint = opts.tint || null;

    const { json, bin } = parseGLB(arrayBuffer);
    if (!json.meshes || json.meshes.length === 0) throw new Error("GLTF: file has no meshes");

    const instances = collectMeshInstances(json);
    const quantized = (json.extensionsUsed || []).includes("KHR_mesh_quantization");

    // Grow typed outputs. Pushing into JS arrays boxed every float (the same
    // import measured above) and then copied into the typed mesh anyway.
    function ensure(buf, need) {
      if (buf.length >= need) return buf;
      const next = new buf.constructor(Math.max(need, (buf.length * 2) || need));
      if (buf.length) next.set(buf);
      return next;
    }
    let pos = new Float32Array(0), nrm = new Float32Array(0), col = new Float32Array(0);
    let idx = new Uint32Array(0), idxN = 0, vertBase = 0;

    for (const inst of instances) {
      const mesh = json.meshes[inst.mesh];
      if (!mesh || !mesh.primitives) continue;
      const world = inst.world;
      let nm = null;   // computed once if this instance supplies normals
      // A mirrored world transform reverses every triangle's winding, so the
      // front faces arrive clockwise: back-face culling drops the visible side
      // and computeVertexNormals points inward. glTF 2.0 §3.7.4: "the
      // determinant of the node's global transform defines the winding order
      // ... if the determinant is a negative value, the front-facing
      // triangles use the clockwise order". We emit CCW-front, so flip. The uniform
      // opts.scale mirrors through the origin when negative (sign^3 = sign).
      const mirrored = det3(world) * (scale < 0 ? -1 : 1) < 0;
      // Normals: the inverse-transpose already handles a mirrored node; the
      // scalar opts.scale is applied to positions only, so a negative one
      // must turn the supplied normals round too.
      const nSign = scale < 0 ? -1 : 1;

      for (const prim of mesh.primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) {
          // only TRIANGLES (mode 4) supported; skip points/lines/strips
          continue;
        }
        const attr = prim.attributes || {};
        if (attr.POSITION === undefined) continue;

        const posA = readAccessor(json, bin, attr.POSITION);
        const posAcc = json.accessors[attr.POSITION];
        if (posA.numComponents !== 3 || !(posAcc.componentType === 5126 ||
            (quantized && [5120, 5121, 5122, 5123].includes(posAcc.componentType)))) {
          throw new Error("GLTF: invalid POSITION accessor");
        }
        const vCount = posA.count;
        const positions = posA.data;

        // indices: explicit, or sequential
        let indices;
        if (prim.indices !== undefined) {
          const acc = json.accessors && json.accessors[prim.indices];
          if (!acc || acc.type !== "SCALAR" || ![5121, 5123, 5125].includes(acc.componentType) || acc.normalized) {
            throw new Error("GLTF: invalid triangle index accessor");
          }
          indices = readAccessor(json, bin, prim.indices).data;
        } else {
          indices = new Uint32Array(vCount);
          for (let i = 0; i < vCount; i++) indices[i] = i;
        }
        if (indices.length % 3) throw new Error("GLTF: invalid triangle indices");

        // normals: read, or compute flat face normals below
        let normals = null;
        if (attr.NORMAL !== undefined) {
          const normalA = readAccessor(json, bin, attr.NORMAL);
          if (normalA.numComponents !== 3 || normalA.count !== vCount ||
              !(json.accessors[attr.NORMAL].componentType === 5126 ||
                (quantized && [5120, 5122].includes(json.accessors[attr.NORMAL].componentType) && json.accessors[attr.NORMAL].normalized))) {
            throw new Error("GLTF: invalid NORMAL accessor");
          }
          normals = normalA.data;
          if (!nm) nm = normalMatrix(world);
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
        if (attr.COLOR_0 !== undefined) {
          const acc = json.accessors && json.accessors[attr.COLOR_0];
          vcolA = readAccessor(json, bin, attr.COLOR_0);
          if (![3, 4].includes(vcolA.numComponents) || vcolA.count !== vCount ||
              !(acc.componentType === 5126 || ([5121, 5123].includes(acc.componentType) && acc.normalized))) {
            throw new Error("GLTF: invalid COLOR_0 accessor");
          }
        }

        pos = ensure(pos, (vertBase + vCount) * 3);
        nrm = ensure(nrm, (vertBase + vCount) * 3);
        col = ensure(col, (vertBase + vCount) * 3);
        // transform + emit vertices straight into the typed outputs
        const m0 = world[0], m1 = world[1], m2 = world[2], m3 = world[3];
        const m4 = world[4], m5 = world[5], m6 = world[6], m7 = world[7];
        const m8 = world[8], m9 = world[9], m10 = world[10], m11 = world[11];
        const m12 = world[12], m13 = world[13], m14 = world[14], m15 = world[15];
        for (let i = 0; i < vCount; i++) {
          const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
          if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
            throw new Error("GLTF: invalid POSITION accessor");
          }
          // mPoint, inlined: a 40k-vert import was spending the stall on one
          // short-lived array per vertex after the boxed accessor was gone.
          const pw = m3 * px + m7 * py + m11 * pz + m15 || 1;
          const inv = scale / pw;
          const o = (vertBase + i) * 3;
          pos[o] = (m0 * px + m4 * py + m8 * pz + m12) * inv;
          pos[o + 1] = (m1 * px + m5 * py + m9 * pz + m13) * inv;
          pos[o + 2] = (m2 * px + m6 * py + m10 * pz + m14) * inv;

          if (normals) {
            const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
            if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
              throw new Error("GLTF: invalid NORMAL accessor");
            }
            const x = nm[0] * nx + nm[1] * ny + nm[2] * nz;
            const y = nm[3] * nx + nm[4] * ny + nm[5] * nz;
            const z = nm[6] * nx + nm[7] * ny + nm[8] * nz;
            const l = (Math.hypot(x, y, z) || 1) * nSign;
            nrm[o] = x / l; nrm[o + 1] = y / l; nrm[o + 2] = z / l;
          } else {
            nrm[o] = 0; nrm[o + 1] = 0; nrm[o + 2] = 0; // filled after, from faces
          }

          let cr = baseCol[0], cg = baseCol[1], cb = baseCol[2];
          if (vcolA) {
            const ncn = vcolA.numComponents;
            const r = vcolA.data[i * ncn], g = vcolA.data[i * ncn + 1], b = vcolA.data[i * ncn + 2];
            const a = ncn === 4 ? vcolA.data[i * ncn + 3] : 0;
            if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || (ncn === 4 && !Number.isFinite(a))) {
              throw new Error("GLTF: invalid COLOR_0 accessor");
            }
            cr *= r; cg *= g; cb *= b;
          }
          col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
        }

        for (let i = 0; i < indices.length; i++) {
          const v = indices[i];
          if (!Number.isInteger(v) || v < 0 || v >= vCount) throw new Error("GLTF: invalid triangle indices");
        }
        // Restore counter-clockwise front faces on a mirrored node (swap the
        // 2nd and 3rd index of every triangle) BEFORE any normal is derived
        // from the winding below.
        if (mirrored) {
          // Copy first: a tight accessor is a view of the GLB, and swapping it
          // in place would rewrite the file bytes.
          const flipped = new Uint32Array(indices.length);
          flipped.set(indices);
          for (let t = 0; t + 2 < flipped.length; t += 3) {
            const b = flipped[t + 1]; flipped[t + 1] = flipped[t + 2]; flipped[t + 2] = b;
          }
          indices = flipped;
        }

        // compute averaged vertex normals if the primitive had none
        if (!normals) {
          computeVertexNormals(pos, indices, vertBase, vCount, nrm);
        }

        idx = ensure(idx, idxN + indices.length);
        for (let i = 0; i < indices.length; i++) idx[idxN++] = indices[i] + vertBase;
        vertBase += vCount;
      }
    }

    if (vertBase === 0) throw new Error("GLTF: no triangle geometry found");

    pos = pos.slice(0, vertBase * 3);
    nrm = nrm.slice(0, vertBase * 3);
    col = col.slice(0, vertBase * 3);
    const big = vertBase > 65535;
    idx = big ? idx.slice(0, idxN) : Uint16Array.from(idx.subarray(0, idxN));
    if (Log.enabled("assets", Log.DEBUG)) Log.debug("assets", "glb verts=" + vertBase);
    return { pos, nrm, col, idx };
  }

  // Smooth (angle-agnostic) vertex normals: accumulate each triangle's unit
  // face normal onto its three (shared) vertices, then normalize once per
  // vertex. `vertBase`/`vertCount` scope the normalize pass to exactly the
  // vertices this call's primitive wrote into the shared nrmOut buffer.
  function computeVertexNormals(posOut, indices, vertBase, vertCount, nrmOut) {
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
      // accumulate the face normal onto each of the triangle's three vertices
      for (const vi of [ia, ib, ic]) {
        nrmOut[vi * 3] += nx;
        nrmOut[vi * 3 + 1] += ny;
        nrmOut[vi * 3 + 2] += nz;
      }
    }
    // normalize the accumulated sum per vertex, scoped to this primitive
    for (let vi = vertBase; vi < vertBase + vertCount; vi++) {
      const nx = nrmOut[vi * 3], ny = nrmOut[vi * 3 + 1], nz = nrmOut[vi * 3 + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nrmOut[vi * 3] = nx / l;
      nrmOut[vi * 3 + 1] = ny / l;
      nrmOut[vi * 3 + 2] = nz / l;
    }
  }

  return { parseGLB, toMesh };
})();
