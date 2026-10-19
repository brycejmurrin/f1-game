#!/bin/bash
# Re-creates tests/specs/audit.spec.js:53-67 and :178-192 in the Node VM (no Chromium) with extra readouts.
cd "$(git rev-parse --show-toplevel)"
node tools/shot/apex-eval.mjs bahrain "(a.go?a.go():0, a.jump(0.01,25,0), a.aim(180), (()=>{const s0=a.physState(); const p0=a.probe(); a.setInput({steer:0,throttle:true}); let minProg=s0.prog,minS=s0.s; for(let i=0;i<90;i++){a.step(1/60,1); const s=a.physState(); minProg=Math.min(minProg,s.prog); minS=Math.min(minS,s.s);} const s1=a.physState(); return {lap0:s0.lap,lap1:s1.lap,s0:s0.s,s1:s1.s,minS,prog0:s0.prog,prog1:s1.prog,speed0:p0.speed,speed1:a.probe().speed};})())" --vm 2>&1 | tail -5
echo ---rear-end
node tools/shot/apex-eval.mjs bahrain "(a.go?a.go():0, a.setPhysics({drift:0}), a.jump(0.3,50,0), a.rivals([{dProg:3,dx:0}]), a.setInput({steer:0,throttle:false}), (()=>{const v0=a.probe().speed; const r0=a.cars().filter(c=>!c.player).map(c=>c.speed); let maxV=v0,minGap=1e9; for(let i=0;i<40;i++){a.step(1/60,1); maxV=Math.max(maxV,a.probe().speed);} return {v0,rivalV0:r0.slice(0,2),vEnd:a.probe().speed,maxV, contact: a.physState && a.physState().contact};})())" --vm 2>&1 | tail -5
