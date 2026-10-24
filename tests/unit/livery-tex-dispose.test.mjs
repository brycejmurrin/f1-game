/* livery-tex-dispose — #3609: SAVE & FIT mints custom_<ts> and only drops draft
 * decal keys; the new id cache-misses and schedulePlayerHiRes uploads another
 * 2048×2560 (~26.7 MB) while the previous fitted id's atlas stayed live.
 * Fix is in js/car/car-draw.js (dropSupersededFittedAtlases). Stubbed renderer
 * via tests/helpers/car-draw-vm.mjs — no GPU.
 * Run: node --test tests/unit/livery-tex-dispose.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

const MB = 1024 * 1024;
function atlasMB(canvas) {
  // Same RGBA+mip estimate car-draw uses (non-square: w*h*4 * 4/3).
  return (canvas.width * canvas.height * 4 * 4 / 3) / MB;
}
function rig() {
  const v = carDrawVm();
  let livId = "default";
  v.G.getLiveryId = () => livId;
  v.G.setLiveryId = (id) => { livId = id; v.G.store.rev++; };
  const built = [], freed = [], idle = [], hiBuilds = [];
  v.G.gfx.createTexture = (canvas) => { const t = { canvas }; built.push(canvas); return t; };
  v.G.gfx.freeTexture = (t) => freed.push(t.canvas);
  v.G.gfx.drawDecal = () => {};
  v.ctx.LiveryTex = {
    IS_MOBILE: false,
    IS_PHONE: false,
    playerHiResDeferred: () => true,
    buildAtlas: (teamId, _liv, num, isPlayer, hiRes) => {
      if (hiRes) hiBuilds.push(teamId + "#" + num + "@" + livId);
      const side = hiRes ? 2048 : isPlayer ? 1024 : 512;
      return {
        id: teamId + "#" + num + (hiRes ? ":hi" : isPlayer ? ":prev" : ":half") + "@" + livId,
        hi: !!hiRes, width: side, height: hiRes ? 2560 : side,
      };
    },
  };
  v.ctx.requestIdleCallback = (cb) => { idle.push(cb); };
  v.ctx.setTimeout = (cb) => { idle.push(cb); };
  const drain = () => { while (idle.length) idle.shift()({ didTimeout: false, timeRemaining: () => 50 }); };
  const live = () => {
    const list = built.filter((c) => !freed.includes(c));
    // A hi-res swap parks the preview in _hiResGrave until the next bind; those
    // parked canvases are still "live" in GPU terms until reaped. Match the
    // issue's texturesSize sample: sum canvases still owned by the cache OR grave
    // by reading decalBytes (cache only) plus any built-not-freed that are hi.
    return {
      textures: list.length,
      texMB: Math.round(list.reduce((s, c) => s + atlasMB(c), 0) * 100) / 100,
      list: list.map((c) => ({ id: c.id, MB: Math.round(atlasMB(c) * 100) / 100 })),
    };
  };
  const sample = (step) => {
    const s = Object.assign({ step, livId, draft: !!v.G.livDraftOverride, idle: idle.length, hiBuilds: hiBuilds.length }, live());
    return s;
  };
  return { ...v, built, freed, idle, hiBuilds, drain, sample, setLiv: (id) => v.G.setLiveryId(id) };
}
const team = (id) => ({ id, drivers: [{ num: 1 }] });
const names = (list) => list.map((c) => c.id);

test("SAVE & FIT new id disposes the previous fitted hi-res atlas (#3609)", () => {
  const r = rig(), t = team("me"), m = new Float32Array(16);
  const steps = [];

  // 1. Garage open on fitted default → preview then deferred 2048.
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  r.carDraw.drawCarDecals(t, m, true, 1, false, true); // reap parked preview
  steps.push(r.sample("1 garage open (fitted default + hi-res)"));
  assert.equal(steps[0].texMB, 26.67, "baseline is one hi-res atlas");
  assert.equal(steps[0].textures, 1);

  // 2–4. Editor open + three warm-up draft edits (draftOnly invalidate).
  r.G.livDraftOverride = { teamId: "me", liv: { n: 0 } };
  r.carDraw.invalidateDecalTextures("me", true);
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  steps.push(r.sample("2 editor open (draft key, hi-res suppressed)"));
  for (let i = 1; i <= 3; i++) {
    r.carDraw.invalidateDecalTextures("me", true);
    r.G.livDraftOverride = { teamId: "me", liv: { n: i } };
    r.carDraw.drawCarDecals(t, m, true, 1, false, true);
    r.drain();
    steps.push(r.sample("3." + i + " draft edit " + i));
  }
  const warm = steps[steps.length - 1];
  assert.ok(warm.texMB < 40, "warm-up stays under 40 MB (saved hi + one draft prev), saw " + warm.texMB);

  // 5. SAVE & FIT: end draft, mint new custom_<ts>, draftOnly invalidate (as setup-sheet).
  const newId = "custom_" + Date.now();
  r.G.livDraftOverride = null;
  r.carDraw.invalidateDecalTextures("me", true);
  r.setLiv(newId);
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  steps.push(r.sample("5 SAVE & FIT (new id, preview minted, hi-res pending)"));
  r.drain();
  steps.push(r.sample("5b after idle hi-res swap"));
  r.carDraw.drawCarDecals(t, m, true, 1, false, true); // reap parked new preview
  const end = r.sample("5c after next draw (preview reaped)");
  steps.push(end);

  // Evidence for REPORT.md / issue: no second 26.7 MB atlas left from the old id.
  assert.equal(end.textures, 1, "exactly one live atlas after SAVE & FIT settle: " + JSON.stringify(end.list));
  assert.equal(end.texMB, 26.67, "texturesSize settles at one hi-res, not ~53 MB");
  assert.ok(names(r.freed).includes("me#1:hi@default"), "previous fitted hi-res was disposed");
  assert.ok(!end.list.some((x) => x.id.includes("@default")), "no default-id atlas remains");
  assert.equal(end.list[0].id, "me#1:hi@" + newId);
  // Growth warm→end must not be another full hi-res (~+20–27 MB in the bug).
  const dMB = Math.round((end.texMB - warm.texMB) * 100) / 100;
  assert.ok(dMB < 5, "warm→end MB growth must be small (saw " + dMB + "; steps=" + JSON.stringify(steps));
});

test("CANCEL still keeps the saved hi-res (draft keys only)", () => {
  const r = rig(), t = team("me"), m = new Float32Array(16);
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  const saved = r.carDraw.getCarDecalTexture(t, 1, true);
  assert.equal(saved.canvas.id, "me#1:hi@default");
  r.G.livDraftOverride = { teamId: "me", liv: { n: 1 } };
  r.carDraw.invalidateDecalTextures("me", true);
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  r.G.livDraftOverride = null;
  r.carDraw.invalidateDecalTextures("me", true);
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  assert.equal(r.carDraw.getCarDecalTexture(t, 1, true), saved, "CANCEL restores the same saved handle");
  assert.ok(!r.freed.includes(saved.canvas), "saved hi-res never freed on CANCEL");
});

test("repeated SAVE & FIT edits do not stack undisposed hi-res atlases", () => {
  const r = rig(), t = team("me"), m = new Float32Array(16);
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  for (let i = 0; i < 4; i++) {
    r.G.livDraftOverride = { teamId: "me", liv: { n: i } };
    r.carDraw.invalidateDecalTextures("me", true);
    r.carDraw.drawCarDecals(t, m, true, 1, false, true);
    r.drain();
    r.G.livDraftOverride = null;
    r.carDraw.invalidateDecalTextures("me", true);
    r.setLiv("custom_" + (1000 + i));
    r.carDraw.drawCarDecals(t, m, true, 1, false, true);
    r.drain();
    r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  }
  const end = r.sample("after 4 SAVE & FIT cycles");
  assert.equal(end.textures, 1, "one live atlas after many saves: " + JSON.stringify(end.list));
  assert.equal(end.texMB, 26.67);
  const hiLive = end.list.filter((x) => x.id.includes(":hi@"));
  assert.equal(hiLive.length, 1);
});
