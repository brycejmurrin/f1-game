import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const root = new URL("../../", import.meta.url);
function setup() {
  const ctx = vm.createContext({Math,Number,Object,WeakMap,
    Log:{info(){},enabled(){return false;}},
    IncidentSim:{owns:c=>!!c.owned,notifyCar(){}},
    DebrisWorld:{active:()=>false}, Tracks:{wallAt:()=>100}});
  for(const path of ["js/core/mat4.js","js/physics/ai-drive.js","js/physics/contact-geometry.js","js/physics/collide.js"])
    vm.runInContext(readFileSync(new URL(path,root),"utf8"),ctx);
  const geometry=vm.runInContext("ContactGeometry",ctx);
  const G={track:{total:1000},player:null,netPlay:{owns:c=>!!c.remote},PACE:1,raceT:0,
    wrapS:s=>(s%1000+1000)%1000,worldFromTrack:(s,x)=>({x,z:s})};
  const collision=vm.runInContext("Collide",ctx).create(G,()=>{});
  return {geometry,collision,G};
}
const {geometry:C}=setup();
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test("SAT rejects rotated bounding-box overlap without touching bodywork",()=>{
  assert.equal(C.overlap(3,-3,Math.PI/3,Math.PI/3),null);
  const hit=C.overlap(0,2.8,Math.PI/2,0);
  assert.ok(hit);close(hit.depth,.6);
});
test("manifold normal reverses with the pair and rotates with the geometry",()=>{
  const h=C.overlap(3,.5,.5,-.2), swap=C.overlap(-3,-.5,-.2,.5);
  assert.ok(h&&swap);close(h.depth,swap.depth);close(h.nx,-swap.nx);close(h.ny,-swap.ny);
  const rot=.7,c=Math.cos(rot),s=Math.sin(rot);
  const turned=C.overlap(3*c-.5*s,3*s+.5*c,.5+rot,-.2+rot);
  close(turned.depth,h.depth);close(turned.nx,h.nx*c-h.ny*s);close(turned.ny,h.nx*s+h.ny*c);
});
test("linear sweep catches a fast crossing and rejects a parallel near miss",()=>{
  const hit=C.sweep(-9,0,9,0,0,0);assert.ok(hit);close(hit.time,(9-4.8)/18);
  assert.equal(C.sweep(-9,2.1,9,2.1,0,0),null);
  assert.equal(C.sweep(-9,0,-10,0,0,0),null);
  assert.equal(C.sweep(0,0,1,0,0,0),null,"initial overlap belongs to the discrete solver");
});
test("inelastic oblique impulses conserve momentum and do not create kinetic energy",()=>{
  for(let i=0;i<100;i++){
    const a={angle:.45,invMass:.5,invInertia:.5/C.INERTIA,vx:10+i*.4,vy:i%5-2,omega:.1};
    const b={angle:-.2,invMass:1,invInertia:1/C.INERTIA,vx:5,vy:1,omega:-.2};
    const h=C.overlap(-3,.7,a.angle,b.angle);assert.ok(h);
    const j=C.impulse(a,b,-3,.7,h);
    const energy=(v)=>.5*((v.vx*v.vx+v.vy*v.vy)/v.invMass+v.omega*v.omega/v.invInertia);
    const aa={...a,vx:a.vx+j.ax,vy:a.vy+j.ay,omega:a.omega+j.aw};
    const bb={...b,vx:b.vx+j.bx,vy:b.vy+j.by,omega:b.omega+j.bw};
    close(j.ax/a.invMass+j.bx/b.invMass,0);close(j.ay/a.invMass+j.by/b.invMass,0);
    assert.ok(energy(aa)+energy(bb)<=energy(a)+energy(b)+1e-8);
    assert.ok(j.magnitude>0);
  }
});
function car(prog,speed,x=0){return {prog,s:prog,x,speed,human:false,yawVis:0};}
test("actual resolver stops a fast car crossing through another between steps",()=>{
  const {collision,G}=setup(),a=car(0,600),b=car(9,0);
  collision.resolveCollisions([a,b],.03);a.prog=a.s=18;G.raceT=.03;
  collision.resolveCollisions([a,b],.03);
  assert.ok(a.prog<b.prog);close(b.prog-a.prog,4.8);close(a.speed,b.speed);
});
test("sweep ignores teleports and cars owned by another simulator",()=>{
  for(const owned of ["remote","owned"]){
    const {collision}=setup(),a=car(0,600),b=car(9,0);b[owned]=true;
    collision.resolveCollisions([a,b],.03);a.prog=a.s=18;
    collision.resolveCollisions([a,b],.03);close(a.prog,18);close(b.prog,9);close(b.speed,0);
  }
  const {collision}=setup(),a=car(0,40),b=car(9,0);
  collision.resolveCollisions([a,b],1/60);a.prog=a.s=18;
  collision.resolveCollisions([a,b],1/60);close(a.prog,18);
});
test("a rotated remote contact only changes the locally owned car",()=>{
  const {collision}=setup(),a=car(0,30),b=car(0,20,2.8);
  a.human=b.human=true;a.yawVis=Math.PI/2;b.remote=true;
  const before=JSON.stringify(b);
  collision.resolveCollisions([a,b],1/60);
  const after=JSON.parse(before);
  for(const k of ["prog","s","x","speed","yawVis"])assert.equal(b[k],after[k]);
  assert.ok(a.x<0 || a.prog!==0);
});
