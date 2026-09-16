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
  const ai=vm.runInContext("AiDrive",ctx);
  const G={track:{total:1000},player:null,netPlay:{owns:c=>!!c.remote},PACE:1,raceT:0,
    wrapS:s=>(s%1000+1000)%1000,worldFromTrack:(s,x)=>({x,z:s})};
  const collision=vm.runInContext("Collide",ctx).create(G,()=>{});
  return {geometry,collision,G,ai};
}
const {geometry:C,ai:AI}=setup();
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
test("an unyawed pair takes neither bounce nor side grip",()=>{
  // The gate that keeps the shipped field bit-identical (contact-geometry.js,
  // "CONTACT MATERIAL"): 20 m/s of closing and 6 m/s of slide, and the pair
  // still ends at one speed with its lateral velocities untouched.
  const a={angle:0,invMass:1,invInertia:0,vx:30,vy:3,omega:0};
  const b={angle:0,invMass:1,invInertia:0,vx:10,vy:-3,omega:0};
  const h=C.overlap(-4,.5,0,0);assert.ok(h);close(h.nx,-1);close(h.ny,0);
  const j=C.impulse(a,b,-4,.5,h);
  close(j.slide,0);close(j.ay,0);close(j.by,0);
  close(a.vx+j.ax,b.vx+j.bx);
});
// The normals below are handed in rather than taken from overlap(), so the
// arithmetic is checkable by hand: a pure longitudinal normal on a pair whose
// only closing motion is along it.
test("a yawed pair separates at the restitution fraction of its closing speed",()=>{
  const n={nx:-1,ny:0};
  const a={angle:.6,invMass:1,invInertia:0,vx:30,vy:0,omega:0};
  const b={angle:.6,invMass:1,invInertia:0,vx:10,vy:0,omega:0};
  const j=C.impulse(a,b,-4,0,n);
  close(j.closing,20);close(j.slide,0);
  close((b.vx+j.bx)-(a.vx+j.ax),AI.bumpRestitution(20)*20);
  assert.ok(AI.bumpRestitution(20)>0,"the shared ramp is what supplies e");
  // Under the ramp's floor a pair leaning on each other must not be pushed
  // apart at all, or a settled contact jitters for as long as it lasts.
  const s={angle:.6,invMass:1,invInertia:0,vx:11,vy:0,omega:0};
  const t={angle:.6,invMass:1,invInertia:0,vx:10,vy:0,omega:0};
  const k=C.impulse(s,t,-4,0,n);
  close((t.vx+k.bx)-(s.vx+k.ax),0);
});
test("friction opposes the slide, clamps at the Coulomb limit, and yaws both cars",()=>{
  const n={nx:-1,ny:0};
  const mk=(angle,vx,vy)=>({angle,invMass:1,invInertia:1/C.INERTIA,vx,vy,omega:0});
  // A 40 m/s slide against 2 m/s of closing: the clamp is what binds.
  const a=mk(.6,12,20),b=mk(0,10,-20);
  const j=C.impulse(a,b,-4,.5,n);
  close(Math.abs(j.slide),C.FRICTION*j.magnitude);
  assert.ok(j.ay<0&&j.by>0,"the impulse pulls the two lateral velocities together");
  close(j.ay/a.invMass+j.by/b.invMass,0);
  assert.ok(j.aw!==0&&j.bw!==0,"a rub yaws BOTH bodies, not only the one that is turned");
  // A slide the normal impulse can afford is solved exactly instead.
  const c=mk(.6,30,6),d=mk(0,10,5.4);
  const k=C.impulse(c,d,-4,.5,n);
  assert.ok(Math.abs(k.slide)<C.FRICTION*k.magnitude);
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
