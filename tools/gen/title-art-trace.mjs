#!/usr/bin/env node
/**
 * title-art-trace.mjs — turns a real render of the car into the portrait
 * drawing's polygons.
 * @doc Traces a garage render into tools/gen/title-art-trace.json for title-art.mjs's portrait drawing.
 *
 * WHY. The landscape drawing is a pinhole projection of js/car/car3d.js, which
 * is the right tool for a camera off the car's flank. Pointed down the car's
 * own axis that machinery collapses: the lofted sections present as one flat
 * slab, the wheels reduce to their tread bands, and the near/far split that
 * gives the side view its volume runs down the spine as a seam. Four attempts
 * produced a drawing nobody could identify as a racing car.
 *
 * So the portrait half is TRACED instead, from the renderer's own output:
 *   node tools/shot/garage-angles.mjs --az=180deg --el=0.55 --dist=6.5 \
 *     --target=0,0.45,-1.2 --viewport=620x900 --out=artifacts/title-art/ref2
 *   node tools/gen/title-art-trace.mjs <that png> tools/gen/title-art-trace.json
 * The car is separated from the pit box by saturation (it is the only strongly
 * warm thing in frame), its rubber is picked up as the dark pixels around it,
 * and the mask's borders are followed into loops, simplified, and mapped into a
 * 300x420 car-local box. Tone bands become the drawing's fill layers.
 *
 * The JSON is committed because the build must not need a browser. Re-run this
 * only when the car mesh or the livery changes enough to matter.
 *
 * tools/car/render-car.mjs would give a cleaner, track-free subject, but it
 * renders an empty backdrop in this container (no GPU; carview does not take
 * the soft-present path garage-angles does), which is why the pit-box render
 * with a saturation cut is what this reads.
 */
import { launchChromium, shutdown } from "../lib/harness.mjs";
import fs from "node:fs";
const SRC = process.argv[2], OUT = process.argv[3];
if (!SRC || !OUT) { console.error("usage: title-art-trace.mjs <render.png> <out.json>"); process.exit(1); }
// harness.mjs owns the Chromium ladder: a pinned Linux path here dies on a Mac
// (tools-runnable pins that rule).
const b = await launchChromium();
const p = await b.newPage();
const b64 = fs.readFileSync(SRC).toString("base64");
const res = await p.evaluate(async (b64) => {
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i+1], d[i+2]]; };
  const satOf = (r, gg, bb) => { const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb); return mx ? (mx - mn) / mx : 0; };
  const lum = (r, gg, bb) => 0.2126*r + 0.7152*gg + 0.0722*bb;

  const warm = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, gg, bb] = px(x, y); const s = satOf(r, gg, bb), v = Math.max(r, gg, bb)/255;
    if (s > 0.42 && v > 0.22 && r >= gg && gg >= bb) warm[y*W+x] = 1;
  }
  const blob = (mask) => { const lab = new Int32Array(W*H).fill(-1); let best=-1,bn=0,id=0;
    for (let i=0;i<W*H;i++){ if(!mask[i]||lab[i]>=0) continue; const st=[i]; lab[i]=id; let n=0;
      while(st.length){ const q=st.pop(); n++; const x=q%W,y=(q/W)|0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=W||ny>=H) continue; const k=ny*W+nx;
          if(mask[k]&&lab[k]<0){lab[k]=id;st.push(k);} } }
      if(n>bn){bn=n;best=id;} id++; }
    const out=new Uint8Array(W*H); for(let i=0;i<W*H;i++) if(lab[i]===best) out[i]=1; return out; };

  const body = blob(warm);
  let x0=W,x1=0,y0=H,y1=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (body[y*W+x]) {
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  // Rubber: dark, unsaturated, inside a box a little wider than the body.
  // The rubber box has to reach well PAST the warm blob up the frame: from
  // overhead the front wing and front tyres are black, so the saturation pass
  // finds only the orange rear and the front half would be cropped off the
  // drawing entirely. Reach is asymmetric because the car points up.
  const RX0=Math.max(0,x0-95), RX1=Math.min(W-1,x1+95);
  const RY0=Math.max(0,y0-Math.round((y1-y0)*0.95)), RY1=Math.min(H-1,y1+30);
  const rubber = new Uint8Array(W*H);
  for (let y=RY0;y<=RY1;y++) for (let x=RX0;x<=RX1;x++) {
    const [r,gg,bb]=px(x,y); if (lum(r,gg,bb) < 46 && satOf(r,gg,bb) < 0.45) rubber[y*W+x]=1; }
  const car = new Uint8Array(W*H);
  for (let i=0;i<W*H;i++) if (body[i]||rubber[i]) car[i]=1;
  // THE PIT GANTRY CROSSES THE CAR. From overhead the box's own overhead rig
  // sits between the camera and the bodywork, so the mask arrives in two halves
  // with a grey bar of nothing between them. Bridge a gap only where the car is
  // on BOTH sides of it within a bar's width — a repair of the occluder, not a
  // licence to close real holes like the cockpit.
  const GAP = 64;
  for (let x=0;x<W;x++) {
    let last=-1;
    for (let y=0;y<H;y++) {
      if (!car[y*W+x]) continue;
      if (last>=0 && y-last>1 && y-last<=GAP) for (let k=last+1;k<y;k++) car[k*W+x]=1;
      last=y;
    }
  }
  const solid = blob(car);

  // Border following (Moore) over a binary mask -> list of loops.
  const contours = (mask, minLen) => {
    const seen = new Uint8Array(W*H), loops=[];
    const get=(x,y)=> (x<0||y<0||x>=W||y>=H)?0:mask[y*W+x];
    for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++) {
      if (!get(x,y) || get(x-1,y) || seen[y*W+x]) continue;
      const start=[x,y]; let cur=[x,y], dir=6, loop=[]; let guard=0;
      const N=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
      do { loop.push(cur.slice()); seen[cur[1]*W+cur[0]]=1;
        let found=false;
        for (let k=0;k<8;k++){ const nd=(dir+k)%8, nx=cur[0]+N[nd][0], ny=cur[1]+N[nd][1];
          if (get(nx,ny)) { cur=[nx,ny]; dir=(nd+5)%8; found=true; break; } }
        if (!found) break; guard++;
      } while ((cur[0]!==start[0]||cur[1]!==start[1]) && guard<40000);
      if (loop.length>=minLen) loops.push(loop);
    }
    return loops;
  };
  const rdp = (pts, eps) => {
    if (pts.length<3) return pts;
    const d2=(a,b,q)=>{ const A=q[0]-a[0],B=q[1]-a[1],C=b[0]-a[0],D=b[1]-a[1];
      const dot=A*C+B*D, len=C*C+D*D, t=len?Math.max(0,Math.min(1,dot/len)):0;
      const px2=a[0]+t*C-q[0], py2=a[1]+t*D-q[1]; return px2*px2+py2*py2; };
    let mi=0,md=0; for(let i=1;i<pts.length-1;i++){const dd=d2(pts[0],pts[pts.length-1],pts[i]); if(dd>md){md=dd;mi=i;}}
    if (md>eps*eps){ const l=rdp(pts.slice(0,mi+1),eps), r=rdp(pts.slice(mi),eps); return l.slice(0,-1).concat(r); }
    return [pts[0],pts[pts.length-1]];
  };

  const band = (lo, hi) => { const m=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++){ if(!solid[i]) continue; const L=lum(d[i*4],d[i*4+1],d[i*4+2]);
      if (L>=lo && L<hi) m[i]=1; } return m; };

  // Map from the FINAL mask's own box, not the warm blob's: the rubber pass
  // reaches past the orange, and mapping from the blob put the car's front off
  // the top of the drawing.
  let mx0=W,mx1=0,my0=H,my1=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (solid[y*W+x]) {
    if(x<mx0)mx0=x; if(x>mx1)mx1=x; if(y<my0)my0=y; if(y>my1)my1=y; }
  const S = Math.min(300/(mx1-mx0), 420/(my1-my0));
  const map = ([x,y]) => [Math.round((x-mx0)*S), Math.round((y-my0)*S)];
  const pack = (loops, eps) => loops.map((l)=>rdp(l,eps).map(map)).filter((l)=>l.length>=4);

  return {
    box: [mx0,my0,mx1,my1], scale: S,
    outline: pack(contours(solid, 160), 2.4),
    tyre:    pack(contours(band(0, 46), 90), 2.4),
    dark:    pack(contours(band(46, 92), 90), 2.4),
    mid:     pack(contours(band(92, 150), 80), 2.4),
    lit:     pack(contours(band(150, 999), 70), 2.4),
  };
}, b64);
const n = (k) => res[k].length + " loops / " + res[k].reduce((s,l)=>s+l.length,0) + " pts";
console.log("box", res.box, "scale", res.scale.toFixed(3));
for (const k of ["outline","tyre","dark","mid","lit"]) console.log(k.padEnd(8), n(k));
fs.writeFileSync(OUT, JSON.stringify(res));
await shutdown();
