import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (file) => fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8");
function setup(disk = new Map()) {
  const dom = makeDom(), mutations = [], delivered = [], disposed = [];
  const race = { paused: true, clock: 122.5, camera: "chase", input: "tilt" };
  const store = { raw: (key) => disk.get(key), rawSet: (key,val) => disk.set(key,val), get: (_,val) => val };
  const ctx = vm.createContext({ GameStore: {store}, location: {search:""}, Log: {info(){},warn(){}},
    // Index 0 is the shipped garage default (Mercedes); keep a McLaren at 2
    // so older call-site assumptions in the harness still resolve.
    Teams: { LIST: [
      {id:"mercedes",color:[0,.5,.5],color2:[.05,.05,.08]},
      null,
      {id:"mclaren",color:[1,.3,0],color2:[.1,.1,.1]},
    ] },
    Liveries: {forTeam: (team) => [{c1:team.color,c2:team.color2}]}, AppearanceOpts: {units:()=>"mph"},
    MutationObserver: class { constructor(fn){mutations.push(fn);} observe(){} }, race });
  vm.runInContext(read("js/camera/cockpit-opts.js") + ";this.opts=CockpitOpts",ctx, { filename: absSrc("js/camera/cockpit-opts.js") });
  vm.runInContext(read("js/car/car-materials.js") + ";this.materials=CarMaterials",ctx, { filename: absSrc("js/car/car-materials.js") });
  vm.runInContext(read("js/camera/cockpit-finishes.js") + ";this.finishes=CockpitFinishes",ctx, { filename: absSrc("js/camera/cockpit-finishes.js") });
  ctx.document = dom.document; ctx.window = ctx;
  const create = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = create(tag); el.ownerDocument = dom.document;
    if (tag === "iframe") el.contentWindow = {CockpitPreviewFrame:{set:(state)=>delivered.push(state),dispose:()=>disposed.push(el)}};
    return el;
  };
  vm.runInContext(read("js/camera/cockpit-preview.js") + ";this.preview=CockpitPreview",ctx, { filename: absSrc("js/camera/cockpit-preview.js") });
  const fold = create("details"); fold.open=true; dom.body.appendChild(fold);
  const host = create("div"); host.ownerDocument=dom.document; fold.appendChild(host);
  const api = ctx.preview.mount(host);
  return {ctx,disk,dom,host,fold,api,mutations,delivered,disposed,race};
}

test("preview open, angle changes and close preserve race state and custom saved choices", () => {
  const s=setup(), {opts}=s.ctx;
  opts.setWheel("yoke"); opts.setBody("wide"); opts.setInterior("suede"); opts.setSeat("low"); opts.setHalo("slim");
  const beforeDisk=[...s.disk], beforeRace={...s.race};
  s.api.open(); const frame=s.host.querySelector("iframe"); frame.onload();
  assert.equal(frame.src,"cockpit-view.html?cockpitpreview=1");
  assert.equal(s.delivered.at(-1).wheel,"yoke"); assert.equal(s.delivered.at(-1).units,"mph");
  for (const button of s.host.querySelector("#ckpreview-angles").querySelectorAll("button")) button.onclick();
  assert.equal(s.delivered.at(-1).angle,"above");
  s.api.close(true);
  assert.equal(s.disposed.length,1); assert.equal(s.host.querySelector("iframe"),null);
  assert.deepEqual([...s.disk],beforeDisk); assert.deepEqual(s.race,beforeRace);
  assert.equal(s.dom.document.activeElement.id,"pm-ckpreview");
});

test("changing options and coordinated presets repaints the same iframe and remains persisted after close", () => {
  const s=setup(); s.api.open(); const frame=s.host.querySelector("iframe"); frame.onload();
  s.ctx.opts.setPreset("historic");
  assert.equal(s.host.querySelector("iframe"),frame);
  assert.equal(s.delivered.at(-1).wheel,"round"); assert.equal(s.delivered.at(-1).halo,0);
  s.api.close(); s.api.open();
  assert.equal(s.delivered.at(-1).interior,"classic"); assert.equal(s.ctx.opts.preset(),"historic");
  s.ctx.opts.setPreset("modern"); assert.equal(s.delivered.at(-1).body,"sculpted");
});

test("collapse and Escape dispose the frame, stale load callbacks cannot reopen it, mount is idempotent", () => {
  const s=setup(); assert.equal(s.ctx.preview.mount(s.host),null);
  s.api.open(); const old=s.host.querySelector("iframe"), oldLoad=old.onload;
  s.fold.open=false; s.mutations[0](); assert.equal(s.disposed.length,1);
  const count=s.delivered.length; oldLoad(); assert.equal(s.delivered.length,count);
  s.fold.open=true; s.api.open();
  const event={key:"Escape",preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  s.dom.document._listeners.get("keydown")[0](event);
  assert.equal(event.prevented,true); assert.equal(event.stopped,true); assert.equal(s.disposed.length,2);
});

test("bound player car reader supplies exact paint and parts without a settings write", () => {
  const s=setup(), car={teamId:"ferrari",livery:{c1:[.8,0,0],c2:[.1,.1,.1]},parts:{aero:4},units:"kmh"};
  s.ctx.preview.bind(()=>car); const state=s.ctx.preview.snapshot("rear");
  assert.equal(state.livery,car.livery); assert.equal(state.parts,car.parts); assert.equal(state.teamId,"ferrari");
  assert.equal(state.angle,"rear"); assert.equal(s.disk.size,0);
});

test("finish changes repaint the existing preview with independent resolved body, halo and wheel choices", () => {
  const s = setup(), f = s.ctx.finishes, m = s.ctx.materials;
  const liv = Object.freeze({ c1: [0.8, 0.1, 0.1], c2: [0.1, 0.1, 0.1], finish: "satin", noseFinish: "brushed", haloFinish: "carbon" });
  const car = { teamId: "ferrari", livery: liv, parts: { aero: 4 }, units: "kmh" }, original = JSON.stringify(car), beforeRace = { ...s.race };
  s.ctx.preview.bind(() => car);
  s.api.open(); const frame = s.host.querySelector("iframe"); frame.onload();
  const first = s.delivered.at(-1);
  assert.equal(first.livery, liv); assert.equal(first.cockpitLivery, liv);
  assert.equal(first.cockpitHalo.surface, m.FINISH_SURFACE.carbon);
  assert.equal(first.wheelFinish, "carbon");
  const count = s.delivered.length;
  f.set("body", "matte");
  let state = s.delivered.at(-1);
  assert.equal(s.delivered.length, count + 1, "a finish change triggers the subscribed preview update");
  assert.equal(s.host.querySelector("iframe"), frame);
  assert.equal(state.cockpitLivery.finish, "matte");
  assert.equal(state.cockpitLivery.noseFinish, "matte");
  assert.equal(state.cockpitHalo.surface, m.FINISH_SURFACE.carbon, "body override does not replace inherited halo finish");
  assert.equal(state.livery, liv, "original livery remains available for independent wheel paint");
  f.set("halo", "chrome"); f.set("wheel", "livery");
  state = s.delivered.at(-1);
  assert.equal(state.cockpitLivery.finish, "matte");
  assert.equal(state.cockpitHalo.surface, m.FINISH_SURFACE.chrome);
  assert.equal(state.wheelFinish, "livery");
  assert.equal(state.parts, car.parts);
  assert.equal(JSON.stringify(car), original);
  assert.deepEqual(s.race, beforeRace);
  const persisted = [...s.disk];
  s.api.close(); s.api.open(); s.host.querySelector("iframe").onload();
  assert.equal(s.delivered.at(-1).wheelFinish, "livery");
  assert.equal(s.delivered.at(-1).cockpitHalo.surface, m.FINISH_SURFACE.chrome);
  assert.deepEqual([...s.disk], persisted, "opening and closing do not write settings");
  const reloaded = setup(s.disk);
  reloaded.ctx.preview.bind(() => car);
  const restored = reloaded.ctx.preview.snapshot("front");
  assert.equal(restored.wheelFinish, "livery");
  assert.equal(restored.cockpitLivery.finish, "matte");
  assert.equal(restored.cockpitHalo.surface, m.FINISH_SURFACE.chrome);
  assert.deepEqual(reloaded.race, beforeRace);
});
