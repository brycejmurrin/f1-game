// wgx-vid-repro — DIAGNOSTIC/EVIDENTIARY. Measures whether @builtin(vertex_index)
// @doc Raw-WebGPU `vertex_index` verdict matrix (draw shapes × N crossing 4095 × read path) on SwiftShader/Lavapipe.
// @skill webgpu-debug
// delivers correct values on this container's WebGPU stacks for the draw shapes
// the road renderer cares about. The 4095-vert PIECE split in wgx.js createMesh
// exists for a 2026-08-17 measured "vertex_index stays 0 on large non-indexed
// draws (and drawIndexed)" — the origin commit is beyond the shallow-clone
// graft, so this tool is the re-runnable primary evidence for keeping or
// lifting that workaround (docs/research/WEBGPU-PARITY.md §road items).
//
//   node tools/gfx/wgx-vid-repro.mjs [--stack swiftshader|lavapipe|both] [--json]
//
// Shape of the experiment (constraints from WEBGPU-PARITY.md and wgx.js):
//   - own adapter/device on a page served from http://127.0.0.1 (secure ctx);
//     NEVER ctx.getCurrentTexture() — on software adapters the first call
//     permanently breaks mapAsync device-wide (readback dies).
//   - offscreen 64x64 rgba8unorm RENDER_ATTACHMENT|COPY_SRC target; readback
//     via copyTextureToBuffer + mapAsync (bytesPerRow 256, already aligned).
//   - vertex buffer stride 36 with 3x float32x3 attributes, matching the
//     ribbon layout — held CONSTANT because the 4th-attr zeroing is a
//     separate documented bug and must not be conflated with this one.
//   - queue.writeBuffer only (mappedAtCreation exhausts the mappable pool).
//   - two shader variants separate the two historical conflated claims:
//     "storage": VS reads a pre-encoded ramp storage array at arr[vid];
//     "novid-storage" control is the same with index 0 (proves raster+readback);
//     "builtin": VS encodes vid arithmetically, no storage bind at all.
//   - draw shapes per N: draw(N) whole; draw(<=4095)xk per-piece with per-piece
//     buffers (the shipping shape, control); draw(n,1,firstVertex) over one
//     shared vbuf (the blocked merge shape — vertex_index includes firstVertex);
//     drawIndexed(N) with an identity index buffer (the blocked indexed shape).
//   - probe triangles: all triangles are degenerate except K probes placed in
//     distinct grid cells; flat interpolation carries the PROVOKING (first)
//     vertex's value, so each probe cell reads back its first-vertex vid.
import { startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS } from "../lib/harness.mjs";
import { createRequire } from "node:module";
const { WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } =
  createRequire(import.meta.url)("../lib/webgpu-chrome-args.cjs");

const argv = process.argv.slice(2);
const stackArg = argv.includes("--stack") ? argv[argv.indexOf("--stack") + 1] : "both";
const asJson = argv.includes("--json");

// N values cross the 4095 boundary up to beyond a real ribbon's size.
const NS = [4092, 4095, 4098, 8190, 12285, 24576];

const PAGE_FN = async (cfg) => {
  const out = { adapter: null, cases: [] };
  const gpu = navigator.gpu;
  if (!gpu) return { error: "no navigator.gpu (insecure context or flags missing)" };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { error: "no adapter" };
  const info = adapter.info || {};
  out.adapter = [info.vendor, info.architecture, info.device, info.description]
    .filter(Boolean).join(" ") || "(info hidden)";
  const device = await adapter.requestDevice();
  const W = 64, H = 64, CELL = 8, COLS = W / CELL;
  const target = device.createTexture({
    size: [W, H], format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const targetView = target.createView();
  const readBuf = device.createBuffer({
    size: 256 * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const shader = (variant) => `
struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) @interpolate(flat) val : vec4<f32>,
};
${variant === "builtin" ? "" : "@group(0) @binding(0) var<storage, read> arr : array<vec4<f32>>;"}
@vertex fn vs(@builtin(vertex_index) vid : u32,
              @location(0) p : vec3<f32>,
              @location(1) n : vec3<f32>,
              @location(2) c : vec3<f32>) -> VSOut {
  var o : VSOut;
  // n/c are consumed so the 3-attribute stride-36 layout stays live like the ribbon's.
  o.pos = vec4<f32>(p.xy + n.xy * 0.0 + c.xy * 0.0, 0.0, 1.0);
  ${variant === "builtin"
    ? `o.val = vec4<f32>(f32(vid % 256u) / 255.0, f32((vid / 256u) % 256u) / 255.0, f32(vid / 65536u) / 255.0, 1.0);`
    : `o.val = arr[vid];`}
  return o;
}
@fragment fn fs(in : VSOut) -> @location(0) vec4<f32> { return in.val; }
`;

  const layouts = {};
  const pipelines = {};
  for (const variant of ["storage", "builtin"]) {
    const mod = device.createShaderModule({ code: shader(variant) });
    const pipe = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: mod, entryPoint: "vs",
        buffers: [{
          arrayStride: 36,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
            { shaderLocation: 2, offset: 24, format: "float32x3" },
          ],
        }],
      },
      fragment: { module: mod, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list" },
    });
    pipelines[variant] = pipe;
    layouts[variant] = variant === "builtin" ? null : pipe.getBindGroupLayout(0);
  }

  // Build geometry for N verts: every triangle degenerate at (-2,-2) except the
  // probe triangles, each filling its own CELLxCELL grid cell in clip space.
  // Returns { vert: Float32Array, probes: [{tri, cellX, cellY}] }.
  const buildGeom = (N) => {
    const nTri = N / 3;
    const probeTris = [...new Set([
      0, 1, 1364, 1365, 1366, 2729, 2730, nTri - 2, nTri - 1,
    ].filter((t) => t >= 0 && t < nTri))].sort((a, b) => a - b);
    const vert = new Float32Array(N * 9);
    // all-degenerate default: every vertex at (-2,-2) (offscreen, zero area)
    for (let v = 0; v < N; v++) { vert[v * 9] = -2; vert[v * 9 + 1] = -2; }
    const probes = [];
    probeTris.forEach((tri, k) => {
      const cellX = k % COLS, cellY = (k / COLS) | 0;
      // cell rect in clip space (y flipped is irrelevant — we read the cell back)
      const x0 = -1 + (cellX * CELL) / W * 2, x1 = -1 + ((cellX + 1) * CELL) / W * 2;
      const y0 = -1 + (cellY * CELL) / H * 2, y1 = -1 + ((cellY + 1) * CELL) / H * 2;
      // one triangle big enough to cover the whole cell
      const base = tri * 3 * 9;
      const px = [x0 - 0.02, x1 + 0.06, x0 - 0.02];
      const py = [y0 - 0.02, y0 - 0.02, y1 + 0.06];
      for (let i = 0; i < 3; i++) { vert[base + i * 9] = px[i]; vert[base + i * 9 + 1] = py[i]; }
      probes.push({ tri, cellX, cellY });
    });
    return { vert, probes };
  };

  const encodeRamp = (count, base) => {
    // arr[i] (GLOBAL index i+base) pre-encoded to the same color the builtin
    // variant computes, so both variants decode identically.
    const a = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const g = i + base;
      a[i * 4] = (g % 256) / 255; a[i * 4 + 1] = ((g / 256 | 0) % 256) / 255;
      a[i * 4 + 2] = (g / 65536 | 0) / 255; a[i * 4 + 3] = 1;
    }
    return a;
  };

  const mkBuf = (data, usage) => {
    const b = device.createBuffer({ size: Math.max(data.byteLength, 512), usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(b, 0, data);
    return b;
  };

  const readCells = async (probes) => {
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: target }, { buffer: readBuf, bytesPerRow: 256 }, [W, H, 1]);
    device.queue.submit([enc.finish()]);
    await readBuf.mapAsync(GPUMapMode.READ);
    const px = new Uint8Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    return probes.map((p) => {
      // NDC +y is the framebuffer TOP: a cell placed at clip y0=-1+cellY*…
      // lands mirrored in texture rows — flip when sampling.
      const x = p.cellX * CELL + CELL / 2, y = H - 1 - (p.cellY * CELL + CELL / 2);
      const o = y * 256 + x * 4;
      return { tri: p.tri, got: px[o] + px[o + 1] * 256 + px[o + 2] * 65536, alpha: px[o + 3] };
    });
  };

  const runPass = (draws, variant) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: targetView, loadOp: "clear",
        clearValue: { r: 1, g: 1, b: 1, a: 0 }, storeOp: "store" }],
    });
    pass.setPipeline(pipelines[variant]);
    for (const d of draws) {
      pass.setVertexBuffer(0, d.vbuf, d.vbufOffset || 0);
      if (variant !== "builtin") pass.setBindGroup(0, d.bg);
      if (d.ibuf) { pass.setIndexBuffer(d.ibuf, "uint32"); pass.drawIndexed(d.count, 1, 0, 0); }
      else pass.draw(d.count, 1, d.firstVertex || 0);
    }
    pass.end();
    device.queue.submit([enc.finish()]);
  };

  for (const N of cfg.ns) {
    const { vert, probes } = buildGeom(N);
    const sharedVbuf = mkBuf(vert, GPUBufferUsage.VERTEX);
    const sharedRamp = mkBuf(encodeRamp(N, 0), GPUBufferUsage.STORAGE);
    const sharedBG = device.createBindGroup({
      layout: layouts.storage,
      entries: [{ binding: 0, resource: { buffer: sharedRamp } }],
    });
    const identIdx = new Uint32Array(N);
    for (let i = 0; i < N; i++) identIdx[i] = i;
    const idxBuf = mkBuf(identIdx, GPUBufferUsage.INDEX);

    // per-piece buffers (the shipping shape): local vids restart at 0, so the
    // ramp for piece at offset `off` is encoded with base=off — a correct
    // stack reads GLOBAL values even though vid is local.
    const PIECE = 4095;
    const pieces = [];
    for (let off = 0; off < N; off += PIECE) {
      let n = Math.min(PIECE, N - off); n -= n % 3;
      if (n <= 0) continue;
      const pv = vert.slice(off * 9, (off + n) * 9);
      pieces.push({
        vbuf: mkBuf(pv, GPUBufferUsage.VERTEX), count: n,
        bg: device.createBindGroup({
          layout: layouts.storage,
          entries: [{ binding: 0, resource: { buffer: mkBuf(encodeRamp(n, off), GPUBufferUsage.STORAGE) } }],
        }),
      });
    }
    // shared-vbuf run shapes: same piece sizes, firstVertex offsets, ONE ramp
    const runs = [];
    for (let off = 0; off < N; off += PIECE) {
      let n = Math.min(PIECE, N - off); n -= n % 3;
      if (n <= 0) continue;
      runs.push({ vbuf: sharedVbuf, count: n, firstVertex: off, bg: sharedBG });
    }

    const shapes = {
      "draw(N)":        { variant: "storage", draws: [{ vbuf: sharedVbuf, count: N, bg: sharedBG }] },
      "pieces(4095)":   { variant: "storage", draws: pieces },
      "firstVertex":    { variant: "storage", draws: runs },
      "drawIndexed(N)": { variant: "storage", draws: [{ vbuf: sharedVbuf, count: N, bg: sharedBG, ibuf: idxBuf }] },
      "builtin:draw(N)":{ variant: "builtin", draws: [{ vbuf: sharedVbuf, count: N }] },
    };
    for (const [shape, spec] of Object.entries(shapes)) {
      runPass(spec.draws, spec.variant);
      const cells = await readCells(probes);
      const results = cells.map((c) => {
        const expected = c.tri * 3;   // flat = provoking (first) vertex of the tri
        const ok = c.got === expected && c.alpha === 255;
        return { tri: c.tri, expected, got: c.got, alpha: c.alpha, ok };
      });
      const bad = results.filter((r) => !r.ok);
      out.cases.push({
        n: N, shape,
        verdict: bad.length === 0 ? "OK"
          : results.every((r) => r.got === 0 && r.alpha === 255) ? "STUCK-AT-0"
          : results.every((r) => r.alpha !== 255) ? "NOT-RASTERIZED"
          : "OTHER",
        bad: bad.slice(0, 4),
      });
    }
  }
  device.destroy();
  return out;
};

async function runStack(name, args, env) {
  const srv = await startStaticServer(process.cwd());
  // Lavapipe only binds under a HEADED Chromium on an X display (the
  // wgx-lavapipe-probe.mjs shape); headless silently falls back to
  // SwiftShader, which would mislabel the leg. The outer process re-execs
  // this tool under xvfb-run for the lavapipe leg (see below); here the
  // headed/headless choice just follows the leg.
  const headed = name === "lavapipe";
  const browser = await launchChromium({ args: [...args], env: env ? { ...process.env, ...env } : undefined, headless: !headed });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    await page.goto(srv.url + "version.json", { waitUntil: "domcontentloaded", timeout: 60000 });
    const r = await page.evaluate(PAGE_FN, { ns: NS });
    // Honesty guard: a leg whose adapter string contradicts the requested
    // stack is a FALLBACK, not an independent measurement.
    if (r && r.adapter && name === "lavapipe" && /swiftshader/i.test(r.adapter)) {
      r.fellBackToSwiftShader = true;
    }
    return r;
  } finally {
    await browser.close();
  }
}

const report = {};
if (stackArg === "both" || stackArg === "swiftshader") {
  try { report.swiftshader = await runStack("swiftshader", WEBGPU_CHROMIUM_ARGS, null); }
  catch (e) { report.swiftshader = { error: (e && e.message || String(e)).slice(0, 300) }; }
}
if (stackArg === "both" || stackArg === "lavapipe") {
  if (process.env.WGX_VID_INNER) {
    // inner (already under xvfb-run): run the leg headed on this display
    try { report.lavapipe = await runStack("lavapipe", WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV); }
    catch (e) { report.lavapipe = { error: (e && e.message || String(e)).slice(0, 300) }; }
  } else {
    // outer: re-exec the lavapipe leg under a virtual X display
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync("xvfb-run", ["-a", process.execPath, process.argv[1], "--stack", "lavapipe", "--json"], {
      encoding: "utf8", timeout: 300000,
      env: { ...process.env, WGX_VID_INNER: "1", ...WEBGPU_LAVAPE_ENV },
    });
    try { report.lavapipe = JSON.parse(res.stdout || "{}").lavapipe || { error: "no inner output: " + (res.stderr || "").slice(-200) }; }
    catch (_) { report.lavapipe = { error: "inner parse failed: " + (res.stderr || res.stdout || "").slice(-200) }; }
  }
}
await shutdown();

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  for (const [stack, r] of Object.entries(report)) {
    console.log(`== ${stack}: ${r.error ? "ERROR " + r.error : r.adapter}` +
      (r.fellBackToSwiftShader ? "  [FELL BACK — not an independent stack; verdict does not count for lavapipe]" : ""));
    for (const c of r.cases || []) {
      console.log(`  N=${String(c.n).padEnd(6)} ${c.shape.padEnd(16)} ${c.verdict}` +
        (c.bad.length ? `  e.g. tri ${c.bad[0].tri} expected ${c.bad[0].expected} got ${c.bad[0].got} a=${c.bad[0].alpha}` : ""));
    }
  }
}
