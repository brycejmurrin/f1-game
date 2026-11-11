/* mirror-pass-prepare — race preparation of the hidden rear view: eligibility, retries, cancel, failure restore. No browser.
 * Split from mirror-pass.test.mjs (T3-16); the VM rig is tests/helpers/mirror-pass-rig.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "../helpers/mirror-pass-rig.mjs";

test("an immersive XR session stands the mirror and the PiP down; EXIT VR brings the mirror back", () => {
  const xr = { on: true };
  const b = boot({ mode: "on", cam: "cockpit", xr });
  for (let i = 0; i < 4; i++) b.render();
  assert.equal(b.calls.filter((c) => c[0] === "begin").length, 0, "no mirror pass while presenting");
  assert.equal(b.mp.state().shown, false);
  assert.equal(b.frameEl.hidden, true);
  assert.ok(b.calls.filter((c) => c[0] === "rect").every((c) => c[1] === null), "and no composite rect");
  xr.on = false;
  b.render();
  assert.equal(b.calls.filter((c) => c[0] === "begin").length, 1, "the flat game draws it again");
  assert.equal(b.mp.state().shown, true);
  const pip = boot({ bc: true, pipMode: "on", cam: "chase", xr: { on: true } });
  const sub = { s: 400, team: "s", code: "HAM" };
  pip.G.cars.push(sub); pip.mp.setSubject(sub, "chase"); pip.render();
  assert.equal(pip.mp.state().pip.shown, false, "no broadcast PiP pass in the headset either");
  assert.equal(pip.calls.filter((c) => c[0] === "begin").length, 0);
});

test("race preparation lets the main warm run first, then draws the actual hidden rear view at its real size", async () => {
  const h = boot({ state: "count" });
  const originalBox = h.frameEl.getBoundingClientRect;
  h.frameEl.style.setProperty("visibility", "collapse", "important");
  h.frameEl.getBoundingClientRect = () => {
    assert.equal(h.frameEl.hidden, false, "layout is measurable");
    assert.equal(h.frameEl.style.getPropertyValue("visibility"), "hidden", "never visible even without a cover");
    return originalBox();
  };
  let warming = false;
  h.gfx.warming = () => warming;
  const ready = h.mp.prepareRace();
  assert.equal(h.mp.prepareRace(), ready, "duplicate entry shares its pending preparation");
  assert.equal(h.mp.preparing(), true);
  h.render();
  assert.equal(h.calls.some(c => c[0] === "begin"), false, "first slot allows the main present to start its queued warm");
  warming = true; h.render();
  assert.equal(h.calls.some(c => c[0] === "begin"), false, "never draws across renderer compile ownership");
  assert.deepEqual(h.profileMarks, ["programWarm:start"], "the wait on the entry's program warm is its own span (A·W14)");
  warming = false; h.render();
  assert.equal(await ready, true);
  assert.deepEqual(h.profileMarks, ["programWarm:start", "programWarm:end"], "closed once, before the mirror's own pass");
  assert.equal(h.mp.preparing(), false); assert.equal(h.timers.size, 0);
  assert.equal(h.frameEl.hidden, true);
  assert.equal(h.frameEl.style.getPropertyValue("visibility"), "collapse");
  assert.equal(h.frameEl.style.getPropertyPriority("visibility"), "important");
  assert.equal(h.mp.state().shown, false); assert.equal(h.classes.has("hud-mirror-on"), false);
  assert.ok(h.calls.filter(c => c[0] === "rect").every(c => c[1] === null), "no composite during preparation");
  const begin = h.calls.find(c => c[0] === "begin");
  assert.deepEqual(begin.slice(1, 3), [800, 228]);
  assert.notEqual(begin[3], h.mainVP, "the real reverse camera is used");
  assert.deepEqual(h.calls.filter(c => c[0] === "draw").map(c => c[1]), ["mesh:b", "mesh:f"], "actual rear rivals, never player/ahead");
  assert.equal(h.frame.viewProj, h.mainVP); assert.equal(h.frameSky.invViewProj, h.mainInv);
  assert.equal(h.G.state, "count", "does not impersonate race state");
  h.frameEl.getBoundingClientRect = originalBox;
  h.G.state = "race"; h.render();
  assert.equal(h.calls.filter(c => c[0] === "begin").length, 2, "first visible frame still draws fresh");
  assert.deepEqual(h.calls.filter(c => c[0] === "begin")[1].slice(1, 3), [800, 228], "same-sized real target can be reused");
});

test("preparation follows real eligibility, quality and current layout", async () => {
  // Pin AUTO where the case is about AUTO eligibility, not the stored default.
  for (const options of [{mode:"off"}, {mode:"auto", cam:"chase"}, {mode:"auto", soft:true}, {bc:true}, {state:"race"}]) {
    const h = boot({state:"count", ...options});
    assert.equal(await h.mp.prepareRace(), false);
    assert.equal(h.mp.preparing(), false); assert.equal(h.timers.size, 0);
  }
  const h = boot({state:"count", mode:"on", cam:"chase", soft:true, tier:4});
  const ready = h.mp.prepareRace(); h.render();
  h.frameEl.getBoundingClientRect = () => ({width:500,height:140});
  h.render(); assert.equal(await ready, true);
  assert.deepEqual(h.calls.find(c => c[0] === "begin").slice(1,3), [200,56], "latest layout and min quality, not a guessed fixed target");
  h.G.state="race"; h.render();
  assert.equal(h.calls.filter(c => c[0] === "begin").length, 2, "even cadence-limited quality draws the first live frame");
});

test("preparation retries a temporarily unavailable target and has a bounded deadline", async () => {
  const h = boot({state:"count"});
  const begin = h.gfx.mirrorBegin;
  let available = false;
  h.gfx.mirrorBegin = (...args) => available ? begin(...args) : false;
  const ready = h.mp.prepareRace(); h.render(); h.render();
  assert.equal(h.mp.preparing(), true); assert.equal(h.calls.some(c=>c[0]==="end"), false);
  assert.equal(h.frame.viewProj, h.mainVP);
  available = true; h.render(); assert.equal(await ready, true);
  const timeout = h.mp.prepareRace();
  const timer = [...h.timers.values()][0]; assert.equal(timer.ms, 30000);
  timer.fn(); assert.equal(await timeout, false); assert.equal(h.mp.preparing(), false);
  assert.equal(h.timers.size, 0);
});

test("cancel, standDown, stale subjects and in-place backend replacement settle without drawing", async () => {
  for (const change of [h=>h.mp.cancelPreparation(), h=>h.mp.standDown(), h=>{h.G.state="menu";},
    h=>{h.G.player={};}, h=>{h.G.track={};}, h=>{h.G.gfx={};}, h=>{h.gfx.mirrorBegin=()=>true;}, h=>{h.gfx.mirrorEnd=()=>{};}, h=>h.mp.setMode("off")]) {
    const h=boot({state:"count"}); const ready=h.mp.prepareRace(); h.render(); change(h); h.render();
    assert.equal(await ready,false); assert.equal(h.mp.preparing(),false);
    assert.equal(h.calls.some(c=>c[0]==="begin"),false); assert.equal(h.timers.size,0);
  }
  const h=boot({state:"count"}); const old=h.mp.prepareRace(), staleTimer=[...h.timers.values()][0].fn;
  h.mp.cancelPreparation(); assert.equal(await old,false);
  const latest=h.mp.prepareRace(); staleTimer(); assert.equal(h.mp.preparing(),true,"expired owner cannot cancel newer preparation");
  h.render();h.render();assert.equal(await latest,true);
});

test("preparation failure restores both hidden layout and swapped frame fields", async () => {
  for (const where of ["measure","world","end"]) {
    const h=boot({state:"count",throwInWorld:where==="world"});
    if(where==="measure") h.frameEl.getBoundingClientRect=()=>{throw new Error("measure failed");};
    if(where==="end") h.gfx.mirrorEnd=()=>{throw new Error("end failed");};
    const ready=h.mp.prepareRace(); h.render(); assert.doesNotThrow(()=>h.render());
    assert.equal(await ready,false);assert.equal(h.mp.preparing(),false);assert.equal(h.timers.size,0);
    assert.equal(h.frameEl.hidden,true);assert.equal(h.frameEl.style.getPropertyValue("visibility"),"");
    assert.equal(h.frame.viewProj,h.mainVP);assert.equal(h.frameSky.invViewProj,h.mainInv);
    assert.deepEqual(h.frame.eye,[0,5,90]);assert.equal(h.frame.proj,"P");assert.equal(h.frame.invProj,"IP");
  }
});

test("a visible mirrorEnd failure still restores the main frame before propagating", () => {
  const h=boot({mode:"on"});h.gfx.mirrorEnd=()=>{throw new Error("end failed");};
  assert.throws(()=>h.render(),/end failed/);
  assert.equal(h.frame.viewProj,h.mainVP);assert.equal(h.frameSky.invViewProj,h.mainInv);
  assert.deepEqual(h.frame.eye,[0,5,90]);assert.equal(h.frame.proj,"P");assert.equal(h.frame.invProj,"IP");
});

test("a restart hides the old mirror and a skipped entry clears old preparation success", async () => {
  const h=boot({mode:"on"});h.render();
  assert.equal(h.frameEl.hidden,false);assert.equal(h.mp.state().shown,true);
  h.G.state="count";const ready=h.mp.prepareRace();
  assert.equal(h.frameEl.hidden,true);assert.equal(h.mp.state().shown,false);
  assert.equal(h.classes.has("hud-mirror-on"),false);
  assert.equal(h.calls.at(-1)[1],null,"old composite cleared before any preparation frame");
  h.render();h.render();assert.equal(await ready,true);assert.equal(h.mp.state().prepared,true);
  h.mp.setMode("off");assert.equal(await h.mp.prepareRace(),false);assert.equal(h.mp.state().prepared,false);
});

test("caught backend failures and stale ready targets do not claim preparation success", async () => {
  for(const state of [{dead:true,ready:false},{dead:false,ready:false},{dead:false,ready:true,renders:3}]) {
    const h=boot({state:"count"});
    // Initial target is valid enough to attempt preparation; mirrorEnd can
    // catch an error and report dead/not-ready, or retain a stale ready target.
    let ended=false;
    h.gfx.mirrorState=()=>ended?state:{dead:false,ready:true,renders:3};
    h.gfx.mirrorEnd=()=>{ended=true;};
    const ready=h.mp.prepareRace();h.render();h.render();
    assert.equal(await ready,false);assert.equal(h.mp.state().prepared,false);
    assert.equal(h.frame.viewProj,h.mainVP);assert.equal(h.frameSky.invViewProj,h.mainInv);
  }
  const h=boot({state:"count"});h.gfx.mirrorState=()=>{throw new Error("dead backend");};
  assert.equal(await h.mp.prepareRace(),false,"optional preparation remains non-throwing");
});

// THE MIRROR SHARES THE MAIN PASS'S MESHES. It drew teamMesh(team, car), the
// WHOLE car, a cache nothing else fills: up to 6 Car3D.build calls inside
// mirrorPrepare and one frame spike per rival new to the 6 nearest, mid-race.
// Here the REAL CarDraw warms a full field (warmCarAssets, as race entry does)
// and the REAL MirrorPass draws through its drawMirrorCar: no build, ever.

// A·W14: __apex.mirror().prep says where a preparation's time went after the program warm (iPhone 14: mirrorPrepare
// 16-21 s, programWarm 2.6-5.8 s of it): frames after the warm, the longest gap between them, refusals by kind, the
// real-size pass's own time, and how it ended. Observation only.
test("race preparation reports frames, gaps, refusals and pass time after the warm (__apex.mirror().prep)", async () => {
  const h = boot({ state: "count" });
  let warming = true;
  h.gfx.warming = () => warming;
  const begin = h.gfx.mirrorBegin;
  let refuse = 1;
  h.gfx.mirrorBegin = (...a) => { h.clock.t += 40; if (refuse > 0) { refuse--; return false; } return begin(...a); };
  h.clock.t = 1000;
  const ready = h.mp.prepareRace();
  h.render();                                     // primes
  h.clock.t = 2000; h.render();                   // still warming
  h.clock.t = 4000; warming = false; h.render();  // warm over at +3000; first pass refused (40 ms)
  assert.equal(h.mp.state().prep.end, null, "still preparing");
  h.clock.t = 6500; h.render();                   // a 2.46 s gap, then the pass draws
  assert.equal(await ready, true);
  const p = h.mp.state().prep;
  assert.equal(p.end, "ready");
  assert.equal(p.warmEndMs, 3000, "the warm released the preparation 3 s in");
  assert.equal(p.frames, 4, "every render() the preparation saw");
  assert.equal(p.framesAfterWarm, 2);
  assert.equal(p.maxGapMs, 2460, "the longest wait for a frame after the warm (6500 - 4040)");
  assert.deepEqual(JSON.parse(JSON.stringify(p.refused)), { noEl: 0, box: 0, size: 0, begin: 1 }, "one refused begin");
  assert.equal(p.passes, 2);
  assert.ok(p.passMs >= 80 && p.lastPassMs >= 40, `the passes' own time: ${p.passMs} / ${p.lastPassMs}`);
  assert.equal(p.endMs, Math.round(h.clock.t - 1000), "ended when the drawn pass finished");
});
