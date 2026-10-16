import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const read = (file) => fs.readFileSync(new URL("../../" + file, import.meta.url), "utf8");
function setup() {
  const disk = new Map(), dom = makeDom(), mutations = [], delivered = [], disposed = [];
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
  vm.runInContext(read("js/camera/cockpit-opts.js") + ";this.opts=CockpitOpts",ctx);
  ctx.document = dom.document; ctx.window = ctx;
  const create = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = create(tag); el.ownerDocument = dom.document;
    if (tag === "iframe") el.contentWindow = {CockpitPreviewFrame:{set:(state)=>delivered.push(state),dispose:()=>disposed.push(el)}};
    return el;
  };
  vm.runInContext(read("js/camera/cockpit-preview.js") + ";this.preview=CockpitPreview",ctx);
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
