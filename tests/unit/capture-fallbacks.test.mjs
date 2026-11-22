// #5790: every capture prints the TLX software-renderer fallbacks beside the image and never calls itself a parity
// capture while one is active; a tool that prefetches the whole model pack says so and names the extras.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import {
  FALLBACKS, formatCaptureFallbacks, loadAllModels, loadPlayerModels, prefetchCaptureModels,
  readCaptureFallbacks, reportCaptureFallbacks, summarizeCaptureFallbacks,
} from "../../tools/shot/capture-fallbacks.mjs";

const LACKS = FALLBACKS.map(([, why]) => why);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A stubbed page: TLX bound on a software adapter, the fallback sky on, tlxForceHw=env, and the whole pack resident
// although the circuit's scenery names one model.
function softwarePage({ fallbackSky = true, soft = true, resident = ["pine", "tower"], forceHw = "env" } = {}) {
  const store = { "apex26.tlxForceHw": forceHw };
  const ctx = {
    GLX: { __tlx: {
      backendState: () => ({ softwareGL: soft, softAdapter: soft, skipBatches: soft, liteGpu: soft }),
      skyState: () => ({ on: true, fallback: fallbackSky }),
    } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    Assets: { models: () => ["pine", "tower", "barn"], modelSync: (id) => (resident.includes(id) ? {} : null),
      modelIds: (src) => ["pine", "tower", "barn"].filter((id) => src.includes(`"${id}"`)) },
    Tracks: { LIST: [{ id: "spa", scenery: function (api) { api.bakedModel("pine"); } }] },
  };
  ctx.window = ctx;
  return ctx;
}
const inPage = (ctx, trackId) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${readCaptureFallbacks.toString()})(${JSON.stringify(trackId)})`, ctx, { filename: absSrc("tools/shot/capture-fallbacks.mjs") })));   // out of the vm realm

test("software path: the report carries every fallback field, the forceHw set and the extra models, and parity is false", () => {
  const state = inPage(softwarePage(), "spa");
  assert.deepEqual(state, { tlx: true, softwareGL: true, softAdapter: true, skipBatches: true, liteGpu: true, skyFallback: true,
    forceHw: ["env"], resident: ["pine", "tower"], track: "spa", playerModels: ["pine"] });
  const sum = summarizeCaptureFallbacks(state);
  assert.deepEqual(sum.active, FALLBACKS.map(([k]) => k));
  assert.equal(sum.parity, false);
  assert.deepEqual(sum.extraModels, ["tower"]);
  assert.equal(formatCaptureFallbacks(sum), "capture state — fallbacks ACTIVE: skyFallback, skipBatches, softwareGL, liteGpu · tlxForceHw=env · "
    + "extra models a player's page does not load: tower · parity: false (the frame lacks: " + LACKS.join("; ") + "; apex26.tlxForceHw restores most)");
});

test("a real-GPU frame that loaded only the player's set is a parity capture", () => {
  const sum = summarizeCaptureFallbacks(inPage(softwarePage({ fallbackSky: false, soft: false, resident: ["pine"], forceHw: "" }), "spa"));
  assert.deepEqual(sum.active, []);
  assert.deepEqual(sum.extraModels, []);
  assert.equal(sum.parity, true);
  assert.equal(formatCaptureFallbacks(sum), "capture state — fallbacks: none · parity: true");
});

test("one fallback alone (the sky) still voids parity and names what the frame lacks", () => {
  const sum = summarizeCaptureFallbacks(inPage(softwarePage({ soft: false, resident: ["pine"], forceHw: "" }), "spa"));
  assert.deepEqual(sum.active, ["skyFallback"]);
  assert.equal(sum.parity, false);
  assert.equal(formatCaptureFallbacks(sum), `capture state — fallbacks ACTIVE: skyFallback · parity: false (the frame lacks: ${LACKS[0]}; apex26.tlxForceHw restores most)`);
});

test("not TLX, an unreadable circuit set, or a page that throws: never a parity capture", () => {
  assert.equal(summarizeCaptureFallbacks({ tlx: false, forceHw: [] }).parity, false);
  const unknown = summarizeCaptureFallbacks({ tlx: true, forceHw: [], resident: ["pine"], playerModels: null });
  assert.equal(unknown.parity, false);
  assert.equal(unknown.modelsUnknown, true);
  assert.equal(formatCaptureFallbacks(unknown), "capture state — fallbacks: none · models loaded (circuit set unknown): pine · parity: false");
  const broken = inPage({ GLX: { __tlx: { backendState() { throw new Error("boom"); } } }, window: {} }, "spa");
  assert.equal(broken.err, "boom");
  assert.equal(summarizeCaptureFallbacks(broken).parity, false);
});

test("reportCaptureFallbacks and loadAllModels print their line through the given log", async () => {
  const lines = [];
  const page = { evaluate: async (fn, arg) => vm.runInNewContext(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`,
    Object.assign(softwarePage(), { Assets: Object.assign(softwarePage().Assets, { loadModels: async () => 3 }) }), { filename: absSrc("tools/shot/capture-fallbacks.mjs") }) };
  const sum = await reportCaptureFallbacks(page, "spa", (l) => lines.push(l));
  assert.equal(sum.parity, false);
  const r = await loadAllModels(page, { log: (l) => lines.push(l) });
  assert.equal(r.n, 3);
  assert.equal(lines[0], formatCaptureFallbacks(sum));
  assert.equal(lines[1], "models: this tool prefetched the WHOLE pack (3 resident); a player's page loads only the models its circuit's scenery names, "
    + "so a frame can show a model a player never gets (the capture-state line names the extras)");
});

test("loadPlayerModels / prefetchCaptureModels default to the circuit set (#6037 §2, offline)", async () => {
  const lines = [];
  const ctx = softwarePage({ resident: ["pine"] });
  ctx.TrackDef = { scenerySource: (def) => String(def.scenery) + ' "pine"' };
  ctx.Assets = Object.assign(ctx.Assets, {
    loadModels: async () => 9,
    loadModelsFor: async (src) => (src.includes("pine") ? 1 : 0),
    modelIds: (src) => (src.includes("pine") ? ["pine"] : []),
  });
  const page = { evaluate: async (fn, arg) => vm.runInNewContext(
    `(${fn.toString()})(${JSON.stringify(arg ?? null)})`, ctx, { filename: absSrc("tools/shot/capture-fallbacks.mjs") },
  ) };
  const player = await loadPlayerModels(page, "spa", { log: (l) => lines.push(l) });
  assert.equal(player.scope, "player");
  assert.equal(player.n, 1);
  assert.deepEqual(player.ids, ["pine"]);
  assert.deepEqual(lines, ["models: this tool loaded the PLAYER set for spa (1 resident, ids: pine); pass --all-models to prefetch the whole pack"]);
  const viaDefault = await prefetchCaptureModels(page, { trackId: "spa", log: () => {} });
  assert.equal(viaDefault.scope, "player");
  assert.equal(viaDefault.n, 1);
  const viaAll = await prefetchCaptureModels(page, { trackId: "spa", allModels: true, quiet: true });
  assert.equal(viaAll.n, 9);
  assert.equal(viaAll.pack, true);
});

test("every capture tool that prefetches the whole pack goes through loadAllModels (no raw Assets.loadModels() call)", () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(mjs|cjs|js)$/.test(e.name) && rel !== "tools/shot/capture-fallbacks.mjs") {
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        if (/\bawait\s+Assets\.loadModels\(\)/.test(src)) hits.push(rel);
      }
    }
  };
  walk("tools");
  assert.deepEqual(hits, [], "call loadAllModels(page) from tools/shot/capture-fallbacks.mjs so the tool says it loaded more than a player's page");
});
