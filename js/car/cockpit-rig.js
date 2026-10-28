/* Apex 26 — CockpitRig: the steering wheel, dash, cabin, glass and shift-light builders.
   Pure move out of js/car/car-mesh.js. CarMesh re-exports the same keys and forwards init. */
const CockpitRig = (function () {
  "use strict";

let _gfx = null;
function init(gfx) { _gfx = gfx; }

function _rigBox(out, cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const F = [
    [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
    [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1]],
    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],
    [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],
  ];
  for (const f of F) {
    const b = out.pos.length / 3, n = f[4];
    for (let i = 0; i < 4; i++) { const v = f[i]; out.pos.push(v[0], v[1], v[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
    out.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}
// A bar from (x0,y0) to (x1,y1) in the wheel plane, w across and d deep (z):
// the one shape _rigBox cannot lie along — round rims and angled spokes. The
// faces wind like _rigBox's (a rotation of it), so culling treats them alike.
function _rigBar(out, x0, y0, x1, y1, z, w, d, col) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const nx = -uy * w / 2, ny = ux * w / 2, za = z - d / 2, zb = z + d / 2;
  const P = [[x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny], [x0 + nx, y0 + ny]];
  const v = (i, zz) => [P[i][0], P[i][1], zz];
  const F = [
    [v(0, zb), v(1, zb), v(2, zb), v(3, zb), [0, 0, 1]],
    [v(1, za), v(0, za), v(3, za), v(2, za), [0, 0, -1]],
    [v(3, zb), v(2, zb), v(2, za), v(3, za), [-uy, ux, 0]],
    [v(0, za), v(1, za), v(1, zb), v(0, zb), [uy, -ux, 0]],
    [v(1, zb), v(1, za), v(2, za), v(2, zb), [ux, uy, 0]],
    [v(0, za), v(0, zb), v(3, zb), v(3, za), [-ux, -uy, 0]],
  ];
  for (const f of F) {
    const b = out.pos.length / 3, n = f[4];
    for (let i = 0; i < 4; i++) { const q = f[i]; out.pos.push(q[0], q[1], q[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
    out.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
}
// A rim arc of radius r from angle a0 to a1 (radians, 0 = 3 o'clock, CCW), in
// n straight segments each stretched past its ends so the joins leave no gap.
function _rigArc(out, r, a0, a1, n, w, d, col) {
  const ext = w * 0.18;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    const x0 = r * Math.cos(t0), y0 = r * Math.sin(t0), x1 = r * Math.cos(t1), y1 = r * Math.sin(t1);
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ex = (x1 - x0) / L * ext, ey = (y1 - y0) / L * ext;
    _rigBar(out, x0 - ex, y0 - ey, x1 + ex, y1 + ey, 0, w, d, col);
  }
}
// Convex, bevel-cornered fascia / glove panels. Unlike boxes, their silhouette
// stays rounded when the wheel rolls. Front is -z, toward the driver.
// Physical cockpit materials avoid the generic world/ground texture on instruments.
function _rigMark(out,start,surface) {
  if(!out.mat)out.mat=[];
  while(out.mat.length<out.pos.length/3)out.mat.push(26);
  for(let i=start;i<out.mat.length;i++)out.mat[i]=surface;
}
function _rigMaterials(out) { _rigMark(out,out.pos.length/3,26); return out; }
function _rigPlate(out, pts, z, depth, col) {
  const start=out.pos.length/3;
  let area = 0;
  for (let i=0;i<pts.length;i++) { const a=pts[i], b=pts[(i+1)%pts.length]; area += a[0]*b[1]-b[0]*a[1]; }
  if (area < 0) pts = pts.slice().reverse();
  const front = z - depth / 2, back = z + depth / 2;
  const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
  const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    _rigQuad(out, [a[0], a[1], front], [b[0], b[1], front], [b[0], b[1], back], [a[0], a[1], back], [dy/L, -dx/L, 0], col);
    for (const [zz, normal, order] of [[front, -1, [b, a]], [back, 1, [a, b]]]) {
      const base = out.pos.length / 3;
      for (const q of [[cx, cy], ...order]) { out.pos.push(q[0], q[1], zz); out.nrm.push(0, 0, normal); out.col.push(...col); }
      out.idx.push(base, base + 1, base + 2);
    }
  }
  _rigMark(out,start,Math.max(...col)<.15 && col[2]>col[0]+.005?21:26);
}
function _rigRounded(out, x, y, z, w, h, d, r, col, surface) {
  const start=out.pos.length/3;
  const a=w/2, b=h/2, c=Math.min(r,a,b), pts=[];
  for (const [cx,cy,start] of [[a-c,b-c,0],[-a+c,b-c,Math.PI/2],[-a+c,-b+c,Math.PI],[a-c,-b+c,Math.PI*1.5]])
    for(let i=0;i<=4;i++) {const t=start+i*Math.PI/8; pts.push([x+cx+c*Math.cos(t),y+cy+c*Math.sin(t)]);}
  _rigPlate(out,pts,z,d,col);
  if(surface!=null)_rigMark(out,start,surface);
}
// Smooth closed forms for fabric wrapped around a grip, with shared normals.
function _rigEllipsoid(out, x, y, z, rx, ry, rz, col, angle=0) {
  const N=12, M=6, base=out.pos.length/3, c=Math.cos(angle), s=Math.sin(angle);
  const vertex=(px,py,pz)=>{
    const n=[px/(rx*rx),py/(ry*ry),pz/(rz*rz)], L=Math.hypot(...n);
    out.pos.push(x+c*px-s*py,y+s*px+c*py,z+pz);
    out.nrm.push((c*n[0]-s*n[1])/L,(s*n[0]+c*n[1])/L,n[2]/L); out.col.push(...col);
  };
  vertex(0,-ry,0);
  for(let i=1;i<M;i++)for(let j=0;j<N;j++) {
    const a=i/M*Math.PI, t=j/N*Math.PI*2;
    vertex(rx*Math.sin(a)*Math.cos(t),-ry*Math.cos(a),rz*Math.sin(a)*Math.sin(t));
  }
  vertex(0,ry,0); const top=base+1+(M-1)*N;
  for(let j=0;j<N;j++) {
    const k=(j+1)%N; out.idx.push(base,base+1+j,base+1+k,top,top-N+k,top-N+j);
    for(let i=0;i<M-2;i++) {const a=base+1+i*N+j,b=base+1+i*N+k;out.idx.push(a,a+N,b+N,a,b+N,b);}
  }
  _rigMark(out,base,22);
}
// A circular button / rotary / quick-release boss, with real depth rather
// than a square painted block. The face is slightly proud of its bezel.
function _rigButton(out, x, y, z, r, col, rotary = false) {
  _rigRing(out, x, y, z + 0.002, r * 1.16, 12, r * 0.24, 0.007, [0.12, 0.13, 0.15]);
  _rigDisc(out, x, y, z - 0.003, r, 12, col);
  if (rotary) {
    _rigBar(out, x-r*0.48, y-r*0.35, x+r*0.48, y+r*0.35, z-0.005, r*0.32, 0.003, [0.035, 0.04, 0.05]);
    _rigBar(out, x, y+r*0.62, x, y+r*0.90, z-0.005, r*0.12, 0.003, [0.85, 0.86, 0.80]);
  }
}
// Swept elliptical tube in the wheel plane: continuous silicone grips and
// leather rims. Shared radial normals avoid a chain of visible square joints.
function _rigGrip(out, path, radius, depth, col) {
  const raw=path;
  path=[];
  for(let i=0;i<raw.length-1;i++) for(let j=0;j<3;j++) {
    const t=j/3,a=raw[Math.max(0,i-1)],b=raw[i],c=raw[i+1],d=raw[Math.min(raw.length-1,i+2)];
    path.push(b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t)));
  }
  path.push(raw[raw.length-1]);
  const N = 8, start = out.pos.length / 3;
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i-1)], b = path[Math.min(path.length-1, i+1)];
    const L = Math.hypot(b[0]-a[0], b[1]-a[1]), nx = -(b[1]-a[1])/L, ny = (b[0]-a[0])/L;
    for (let j = 0; j < N; j++) {
      const t = j/N*Math.PI*2, c = Math.cos(t), sn = Math.sin(t);
      out.pos.push(path[i][0]+nx*radius*c, path[i][1]+ny*radius*c, depth*sn);
      const len = Math.hypot(c/radius, sn/depth);
      out.nrm.push(nx*c/radius/len, ny*c/radius/len, sn/depth/len); out.col.push(...col);
    }
  }
  for (let i = 0; i < path.length-1; i++) for (let j = 0; j < N; j++) {
    const a = start+i*N+j, b = start+i*N+(j+1)%N, c = b+N, d = a+N;
    out.idx.push(a,b,c,a,c,d);
  }
  // Caps bury in the fascia or the glove, but close the ends for all angles.
  for (const i of [0, path.length-1]) for (let j = 1; j < N-1; j++) {
    const a = start+i*N, b = a+j, c = b+1;
    out.idx.push(...(i === 0 ? [a,c,b] : [a,b,c]));
  }
  _rigMark(out,start,22);
}
// Modern wheels are open-bottom control yokes, not rectangular hoops.
// References: Mercedes cockpit photograph / McLaren wheel history (see
// docs/notes/COCKPIT-MODEL-REFERENCES.md). Telemetry still uses the same LCD plane.
// Tiny geometry-native legends; no texture upload or per-frame text allocation.
const _RIG_FONT = {
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',
  G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',
  M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',
  S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',
  '0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001',
  '5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110',
};
function _rigLabel(out,text,x,y,z,size,col) {
  const start=out.pos.length/3;
  const left=x-(text.length*4-1)*size/2;
  for(let k=0;k<text.length;k++) {
    const glyph=_RIG_FONT[text[k]]; if(!glyph)continue;
    for(let i=0;i<15;i++) if(glyph[i]==='1') {
      const cx=left+(k*4+i%3+0.5)*size, cy=y+(2-Math.floor(i/3))*size;
      _rigQuad(out,[cx-size*.43,cy-size*.43,z],[cx-size*.43,cy+size*.43,z],[cx+size*.43,cy+size*.43,z],[cx+size*.43,cy-size*.43,z],[0,0,-1],col);
    }
  }
  _rigMark(out,start,26);
}
function _wheelScreen(out, c2, style) {
  const CARB = [0.09, 0.095, 0.105], DARK = [0.022, 0.028, 0.036];
  const outlines={
    f1:[[-.090,-.092],[.090,-.092],[.114,-.055],[.112,.065],[.092,.098],[-.092,.098],[-.112,.065],[-.114,-.055]],
    gt:[[-.084,-.102],[.084,-.102],[.107,-.057],[.105,.065],[.076,.085],[-.076,.085],[-.105,.065],[-.107,-.057]],
    butterfly:[[-.057,-.104],[.057,-.104],[.121,-.036],[.111,.068],[.085,.092],[-.085,.092],[-.111,.068],[-.121,-.036]],
    yoke:[[-.082,-.108],[.082,-.108],[.112,-.060],[.101,.055],[.067,.071],[-.067,.071],[-.101,.055],[-.112,-.060]],
    endurance:[[-.101,-.112],[.101,-.112],[.119,-.065],[.116,.063],[.090,.096],[-.090,.096],[-.116,.063],[-.119,-.065]],
  };
  _rigPlate(out,outlines[style]||outlines.f1,0.014,0.042,CARB);
  _rigRounded(out, 0, 0.024, -0.016, 0.125, 0.080, 0.020, 0.008, [0.06,0.067,0.075]);
  _rigBox(out, 0, 0.024, -0.028, 0.112, 0.068, 0.006, DARK);
  // Preserve aligned cyan speed, orange gear and green battery cells.
  _rigBox(out, 0.048, 0.024, -0.0295, 0.012, 0.050, 0.003, [0.03,0.04,0.045]);
  _rigRounded(out, -0.034, 0.022, -0.0292, 0.052, 0.040, 0.003, 0.002, [0.06,0.067,0.075]);
  _rigRounded(out, -0.034, 0.022, -0.0296, 0.047, 0.035, 0.003, 0.001, [0.010,0.016,0.026]);
  _rigRounded(out, 0.014, 0.022, -0.0292, 0.034, 0.044, 0.003, 0.002, [0.032,0.028,0.027]);
  _rigRounded(out, 0.014, 0.022, -0.0296, 0.029, 0.039, 0.003, 0.001, [0.014,0.018,0.024]);
  const LEG=[0.64,0.70,0.74];
  _rigLabel(out,'SPD',-.034,.052,-.033,.0015,LEG);
  _rigLabel(out,'G',.014,.052,-.033,.0015,LEG);
  _rigLabel(out,'ERS',.048,.052,-.033,.0011,LEG);
  for(const x of [-.004,.035]) _rigBox(out,x,.023,-.032,.0008,.054,.001,[.08,.11,.14]);
  _rigLabel(out,'OT',-.082,.003,-.033,.0012,LEG);
  _rigLabel(out,'AERO',.082,-.014,-.033,.0011,LEG);
  const BTN = [[0.83,0.12,0.09],[0.16,0.43,0.85],[0.12,0.65,0.30],[0.88,0.70,0.12]];
  for (const side of [-1,1]) {
    for (let i = 0; i < 3; i++) _rigButton(out, side*(style === "endurance" ? 0.102 : style === "gt" ? 0.094 : 0.096), 0.055-i*0.037, -0.027, 0.008, BTN[(i+(side>0?1:0))%4]);
    _rigButton(out, side*0.132, 0.079, -0.023, 0.010, BTN[side<0?2:0]);
    _rigButton(out, side*0.126, 0.045, -0.025, 0.008, BTN[side<0?1:3]);
  }
  const rotaries=style==='gt'?[[-.045,BTN[3]],[.045,BTN[1]]]:style==='butterfly'?[[0,BTN[1]]]:style==='yoke'?[[-.060,BTN[3]],[.060,BTN[2]]]:style==='endurance'?[[-.075,BTN[3]],[-.025,BTN[1]],[.025,BTN[2]],[.075,BTN[0]]]:[[-.064,BTN[3]],[0,BTN[1]],[.064,BTN[2]]];
  for(const [x,col] of rotaries) {
    const r=style==='butterfly'?.023:style==='endurance'?.013:.016;
    const y=style==='endurance'?-.073:-.063;
    _rigButton(out,x,y,-.026,r,col,true);
    for(let i=0;i<8;i++) {
      const a=i/8*Math.PI*2, c=Math.cos(a), sn=Math.sin(a);
      _rigLabel(out,String(i+1),x+c*(r+.007),y+sn*(r+.007),-.031,.00075,LEG);
    }
  }
  for(const [word,x,y] of [['N',-.132,.107],['P',.132,.107],['BB',-.064,-.102],['MODE',0,-.102],['DIFF',.064,-.102]])
    _rigLabel(out,word,x,y,-.027,.0013,LEG);
  if(style==='butterfly') for(const side of [-1,1]) _rigButton(out,side*.064,-.058,-.027,.009,BTN[side<0?3:2]);
  // Fasteners, separate from controls; no fake HDR glow on physical buttons.
  for (const x of [-0.104,0.104]) for (const y of [-0.072,0.084])
    _rigDisc(out, x, y, -0.009, 0.003, 8, [0.40,0.42,0.44]);
  _rigRounded(out, -0.082, 0.024, -0.0290, 0.024, 0.024, 0.003, 0.004, [0.10,0.11,0.13]);
  _rigBox(out, -0.082, 0.024, -0.0294, 0.019, 0.019, 0.003, [0.06,0.05,0.08]);
}
function _wheelPaddles(out, wide) {
  for (const s of [-1,1]) {
    _rigRounded(out, s*0.140, 0.006, 0.052, wide?0.075:0.060, 0.105, 0.012, 0.018, [0.13,0.14,0.16]);
    _rigRounded(out, s*0.078, -0.082, 0.047, 0.077, 0.022, 0.010, 0.007, [0.17,0.18,0.20]); // clutch paddles
  }
}
// Curved backs, individual finger pads, an inboard thumb and tapered cuffs.
// All styles use the same nine-and-three grip points and rotate with the wheel.
function _wheelHands(out, acc, c1) {
  const GLOVE=[0.14,0.155,0.175], SEAM=[0.34,0.36,0.38];
  for (const side of [-1,1]) {
    _rigEllipsoid(out,side*.184,-.011,-.013,.023,.046,.024,GLOVE,-side*.12);
    for(let i=0;i<4;i++) _rigEllipsoid(out,side*.169,.030-i*.021,.010,.014,.011,.020,GLOVE,-side*.25);
    _rigEllipsoid(out,side*.154,.015,-.024,.011,.022,.014,GLOVE,-side*.68);
    _rigEllipsoid(out,side*.188,-.077,-.003,.021,.035,.021,GLOVE,-side*.06);
    _rigEllipsoid(out,side*.192,-.126,.005,.024,.039,.024,GLOVE,-side*.08);
    for(const y of [-.098,-.104]) _rigGrip(out,[[side*.171,y],[side*.182,y-.003],[side*.193,y-.003],[side*.211,y]],.0012,.026,SEAM);
    for(let i=0;i<3;i++) _rigBar(out,side*.181,.017-i*.013,side*.197,.011-i*.013,-.035,.0008,.001,SEAM);
    _rigBar(out,side*.176,-.043,side*.184,-.080,-.025,.001,.001,SEAM);
  }
}
const COCKPIT_WHEELS = ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round"];
function _wheelRimF1(out, CARB, RUB, GRIP, acc, style) {
  for (const s of [-1,1]) {
    _rigGrip(out, [[s*0.151,style === "yoke" ? 0.062 : 0.103],[s*0.169,0.054],[s*0.179,0.020],[s*0.176,-0.031],[s*0.155,-0.099]], 0.022, 0.029, RUB);
    _rigBar(out, s*0.093, style === "yoke" ? 0.045 : 0.080, s*0.151, style === "yoke" ? 0.053 : 0.090, 0.010, 0.042, 0.039, CARB);
  }
  if (style === "gt") {
    // A continuous flat-bottom rim around the modern display and hand grips.
    _rigGrip(out, [[-0.155,-0.099],[-0.12,-0.123],[0,-0.128],[0.12,-0.123],[0.155,-0.099]],0.015,0.024,RUB);
    _rigGrip(out, [[-0.151,0.103],[-0.11,0.124],[0,0.132],[0.11,0.124],[0.151,0.103]],0.014,0.022,RUB);
    _rigRounded(out,0,0.132,-0.007,0.012,0.024,0.038,0.004,acc||GRIP);
  } else if (style === "butterfly") {
    // Angular wings and a tapered lower housing leave the top of the rim open.
    for (const side of [-1,1]) {
      _rigPlate(out,[[side*0.090,-0.091],[side*0.160,-0.080],[side*0.162,0.094],[side*0.140,0.140],[side*0.090,0.100]],0.020,0.022,CARB);
      _rigBar(out,side*0.108,-0.080,side*0.148,-0.063,-0.006,0.009,0.008,acc||GRIP);
    }
  }
  if (style === "yoke") {
    _rigGrip(out,[[-0.155,-0.099],[-0.115,-0.131],[0,-0.141],[0.115,-0.131],[0.155,-0.099]],0.014,0.022,RUB);
    for (const side of [-1,1]) _rigPlate(out,[[side*0.095,-0.072],[side*0.151,-0.093],[side*0.158,-0.117],[side*0.110,-0.127]],0.016,0.016,CARB);
  } else if (style === "endurance") {
    _rigGrip(out,[[-0.155,-0.099],[-0.118,-0.127],[-0.060,-0.141],[0,-0.144],[0.060,-0.141],[0.118,-0.127],[0.155,-0.099]],0.013,0.022,RUB);
    _rigGrip(out,[[-0.151,0.103],[-0.130,0.127],[-0.080,0.135],[0,0.135],[0.080,0.135],[0.130,0.127],[0.151,0.103]],0.012,0.022,RUB);
    for (const side of [-1,1]) _rigBar(out,side*0.080,-0.085,side*0.118,-0.117,0.012,0.024,0.018,CARB,21);
    _rigRounded(out,0,0.135,-0.004,0.016,0.020,0.033,0.004,acc||GRIP);
  }
  _wheelPaddles(out, true);
}
// 2000s butterfly: compact monochrome LCD, sparse controls, mechanical paddles.
function _wheelRimRetro(out, CARB, RUB, GRIP, acc) {
  const BTN = [[0.85,0.13,0.10],[0.16,0.4,0.85],[0.82,0.68,0.12],[0.55,0.58,0.61]];
  _rigPlate(out, [[-0.085,-0.089],[0.085,-0.089],[0.102,-0.045],[0.127,0.055],
    [0.111,0.082],[-0.111,0.082],[-0.127,0.055],[-0.102,-0.045]], 0.012, 0.038, CARB);
  for (const s of [-1,1]) {
    _rigGrip(out, [[s*0.135,-0.091],[s*0.166,-0.045],[s*0.178,0.020],[s*0.165,0.081],[s*0.135,0.099]], 0.023, 0.027, RUB);
    for(let i=0;i<3;i++) _rigButton(out, s*0.079, 0.025-i*0.030, -0.015, 0.008, BTN[(i+(s>0?1:0))%4]);
    _rigButton(out, s*0.120, 0.064, -0.014, 0.009, BTN[s<0?2:0]);
    _rigButton(out, s*0.043, -0.058, -0.012, 0.015, BTN[2], true);
  }
  _rigRounded(out, 0, 0.042, -0.010, 0.084, 0.034, 0.006, 0.004, [0.02,0.02,0.025]);
  _rigBox(out, 0, 0.042, -0.014, 0.070, 0.024, 0.003, [0.16,0.22,0.12]);
  _rigLabel(out,'SPD',-.019,.066,-.018,.0011,[.58,.64,.48]);
  _rigLabel(out,'G',.025,.066,-.018,.0011,[.58,.64,.48]);
  for(const [word,x] of [['OT',-.041],['AX',.041]]) {
    _rigRounded(out,x,.035,-.0155,.011,.011,.002,.002,[.025,.03,.04]);
    _rigLabel(out,word,x,.020,-.018,.001,[.58,.64,.48]);
  }
  for(let i=0;i<7;i++) _rigDisc(out, -0.042+i*0.014, 0.071, -0.016, 0.0035, 8, [0.12,0.15,0.10]);
  _wheelPaddles(out, false);
}
function _wheelRimRound(out, GRIP, acc, grip) {
  const R=0.165, MET=[0.46,0.48,0.50], LEATHER=grip||[0.14,0.095,0.065];
  const path=Array.from({length:41},(_,i)=>[R*Math.cos(i/40*Math.PI*2),R*Math.sin(i/40*Math.PI*2)]);
  _rigGrip(out,path,0.016,0.019,LEATHER);
  for(const s of [-1,1]) _rigPlate(out, [[s*0.025,-0.020],[s*0.146,-0.026],[s*0.151,0.007],[s*0.027,0.018]],0.018,0.009,MET);
  _rigPlate(out,[[-0.020,-0.026],[0.020,-0.026],[0.015,-0.151],[-0.015,-0.151]],0.018,0.009,MET);
  _rigButton(out,0,0,0.004,0.032,[0.18,0.20,0.22]); // compact mechanical boss; no road-car horn
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;_rigDisc(out,Math.cos(a)*0.022,Math.sin(a)*0.022,-0.006,0.003,8,[0.63,0.65,0.67]);}
  for(const side of [-1,1]) for(const x of [.065,.095,.125]) _rigDisc(out,side*x,-.005,.011,.006,12,[.045,.05,.055]);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;_rigDisc(out,(R-.007)*Math.cos(a),(R-.007)*Math.sin(a),-.015,.0008,6,[.35,.25,.17]);}
  _rigRounded(out,0,R,-0.002,0.013,0.026,0.042,0.004,acc||[0.55,0.52,0.42]);
}
// Keyed like _cockpitDecalMesh: the chosen wheel and the player's livery colours
// join the key, so a garage livery edit (resolveLivery is store.rev-invalidated
// upstream) or a WHEEL change frees and rebuilds it. liv may be null — the
// wheel then falls back to the neutral carbon look.
// The resolved livery is one object per store rev (resolveLivery memo) and its
// colours are never written in place, so the SAME object + style is the same
// key: return before the tints, the toFixed map/joins and the concat (every
// frame on the default camera). A draft or an edit is a new object and takes
// the string path, which still owns the free-and-rebuild.
// WHEEL FINISH (B·H33): which car surface each part of the wheel takes. Every rig part is born
// panel (26) or carbon (21) and the rig drew it at roughness 0.88 / clearcoat 0, so the wheel read as one
// flat grey-black lump whatever the parts were. A finish is a per-vertex surface remap (no geometry, no
// texture) plus the draw opts that let those surfaces' own lobes through (cockpitWheelOpts).
// Classes come from the builder's own constants: rubber grips, carbon structure, neutral alloy hardware,
// the button bezels, the LCD glass. Gloves and legends keep their surfaces.
const WHEEL_FINISHES = Object.freeze({
  stock: null,
  livery: Object.freeze({ grip: 22, structure: 20, hardware: 29, bezel: 29, screen: 24, metal: Object.freeze([0.62, 0.63, 0.66]) }),
  carbon:   Object.freeze({ grip: 22, structure: 21, hardware: 29, bezel: 29, screen: 24, metal: Object.freeze([0.62, 0.63, 0.66]) }),
  anodised: Object.freeze({ grip: 22, structure: 21, hardware: 44, bezel: 44, screen: 24, accent: true }),
  suede:    Object.freeze({ grip: 42, structure: 28, hardware: 39, bezel: 39, screen: 24, teamGrip: true }),
});
const WHEEL_DEFAULT = "carbon";   // Bryce picked A, carbon + alloy, from the stills (2026-10-22; note §Steering wheel finish)
let _wheelFinish = WHEEL_DEFAULT;
const _near = (c, r, i) => Math.abs(c[i] - r[0]) < 0.004 && Math.abs(c[i + 1] - r[1]) < 0.004 && Math.abs(c[i + 2] - r[2]) < 0.004;
const _W_GLOVE = [[0.14,0.155,0.175],[0.34,0.36,0.38]], _W_SCREEN = [0.022,0.028,0.036], _W_BEZEL = [0.12,0.13,0.15];
// acc: the wheel's accent tint (anodised bezels); team: its c1 tint (suede grips).
function wheelFinishPass(out, name, acc, team, livery) {
  const f = WHEEL_FINISHES[name];
  if (!f) return out;
  const M = out.mat, C = out.col;
  for (let v = 0, i = 0; v < M.length; v++, i += 3) {
    const s = M[v], hi = Math.max(C[i], C[i+1], C[i+2]), lo = Math.min(C[i], C[i+1], C[i+2]);
    let structure = s === 21;
    if (s === 22) { if (!_W_GLOVE.some((g) => _near(C, g, i))) M[v] = f.grip; }
    else if (s === 21) M[v] = f.structure;
    else if (s !== 26) continue;
    else if (_near(C, _W_SCREEN, i)) M[v] = f.screen;
    else if (_near(C, _W_BEZEL, i)) M[v] = f.bezel;
    else if (hi > 0.2 && hi < 0.5 && hi - lo < 0.05) M[v] = f.hardware;   // fasteners, pivots, rotary pointers
    else if (hi < 0.21 && hi - lo < 0.04 && lo > 0.1) { M[v] = f.structure; structure = true; }   // paddles and clutch blades
    else continue;
    if (name === "livery" && structure) {
      M[v] = livery && typeof CarMaterials !== "undefined" ? CarMaterials.FINISH_SURFACE[livery.finish] || 20 : 20;
      if (team) { C[i] = team[0]; C[i+1] = team[1]; C[i+2] = team[2]; }
    }
    const ink = name === "livery" && structure ? null : M[v] === f.bezel || M[v] === f.hardware ? (f.accent ? acc : f.metal) : M[v] === f.grip && f.teamGrip ? team : null;
    if (ink) { C[i] = ink[0]; C[i+1] = ink[1]; C[i+2] = ink[2]; }
  }
  return out;
}
// The wheel's draw opts: the rig's 0.88-rough card for stock; a finish lets lacquer (carbon min 0.42 clearcoat),
// alloy and glass through. Every response is clamped per surface in the lit shaders (tsl-lit/glsl-lit/WGSL).
const _wheelOptsFin = { doubleSided: true, roughness: 0.5, metalness: 0.04, specular: 0.4, clearcoat: 0.7, emissive: 0 };
function cockpitWheelOpts(rigOpts) {
  if (!WHEEL_FINISHES[_wheelFinish]) return rigOpts;
  _wheelOptsFin.emissive = rigOpts.emissive;
  return _wheelOptsFin;
}
function wheelFinish(name) {
  if (name !== undefined && Object.hasOwn(WHEEL_FINISHES, name) && name !== _wheelFinish) { _wheelFinish = name; _wheelLiv = undefined; _cockpitWheelKey = ""; }
  return _wheelFinish;
}
let cockpitWheelMesh = null, _cockpitWheelKey = "", _wheelLiv, _wheelStyle;
const _wheelTint = (c, k) => c ? [c[0] * k, c[1] * k, c[2] * k] : null;
function getCockpitWheel(liv, style) {
  if (cockpitWheelMesh && liv === _wheelLiv && style === _wheelStyle) return cockpitWheelMesh;
  _wheelLiv = liv; _wheelStyle = style;
  const st = COCKPIT_WHEELS.includes(style) ? style : COCKPIT_WHEELS[0];
  // Livery colours are display-range; against the near-black rig they glare,
  // so team colour lands at ~45% (grips/straps) and ~55% (the 12-o'clock
  // stripe, which is SUPPOSED to pop).
  const c1 = _wheelTint(liv && liv.c1, 0.45);
  const acc = _wheelTint(liv && (liv.accent || liv.c2), 0.55);
  const c2 = _wheelTint(liv && liv.c2, 0.40);
  // GRIPS (liv.gripTint): the hand-grip rubber / round-wheel leather in the picked colour, at the
  // same ~55% the accent lands at. Unset = today's black rubber, and the key gains nothing.
  const gt = _wheelTint(liv && typeof CarMaterials !== "undefined" && CarMaterials.zoneColour(liv.gripTint), 0.55);
  const kc = (c) => c ? c.map((v) => v.toFixed(2)).join(",") : "-";
  const wantKey = st + "|" + kc(c1) + "|" + kc(acc) + "|" + kc(c2) + (gt ? "|g" + kc(gt) : "") + "|" + _wheelFinish + (_wheelFinish === "livery" ? "|" + (liv && liv.finish || "gloss") : "");
  if (cockpitWheelMesh && _cockpitWheelKey !== wantKey) {
    if (_gfx.freeMesh) _gfx.freeMesh(cockpitWheelMesh);
    cockpitWheelMesh = null;
  }
  if (cockpitWheelMesh) return cockpitWheelMesh;
  _cockpitWheelKey = wantKey;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CARB = [0.09, 0.095, 0.105], RUB = gt || [0.11, 0.115, 0.12];
  const GRIP = c1 || RUB;
  if (st === "round") _wheelRimRound(out, GRIP, acc, gt);
  else if (st === "retro") _wheelRimRetro(out, CARB, RUB, GRIP, acc);
  else {
    _wheelRimF1(out, CARB, RUB, GRIP, acc, st);
    _wheelScreen(out, c2, st);
  }
  // Physical fascia fasteners, paddle pivots and stitched glove cuffs on all wheels.
  for (const side of [-1,1]) {
    const bx=side*(st === "round" ? 0.075 : 0.084), by=st === "round" ? -0.002 : -0.092;
    _rigDisc(out,bx,by,-0.019,0.0035,8,[0.42,0.44,0.46]);
    _rigBar(out,bx-0.0018,by,bx+0.0018,by,-0.020,0.0008,0.001,[0.025,0.03,0.035]);
    if (st !== "round") {
      _rigDisc(out,side*0.130,0.026,0.043,0.004,8,[0.36,0.38,0.40]);
      for (let i=0;i<4;i++) _rigBar(out,side*0.146,-0.022+i*0.013,side*0.161,-0.018+i*0.013,0.044,0.0015,0.001,[0.22,0.23,0.25]);
    }
  }
  _wheelHands(out, acc, c1);
  cockpitWheelMesh = _gfx.createMesh(wheelFinishPass(_rigMaterials(out), _wheelFinish, acc, c1, liv));
  return cockpitWheelMesh;
}
// STEERING LOCK. The wheel used to roll a fixed 0.80 rad (±46 deg) at full
// steer, behind a second λ6 damp stacked on the already-damped steerVis: a
// hairpin turned the wheel a quarter of what a real one does, a beat late.
// Progressive now: the centre keeps the shipped 0.80 rad slope (small
// corrections read exactly as before) and a cubic term takes full lock to
// 1.5 rad (~86 deg — a 2026 car's ±90 deg lock), behind a λ12 visual damp
// that still settles rather than flicks. The sign is the shipped one.
const WHEEL_ROLL_LIN = 0.80, WHEEL_ROLL_CUBE = 0.70, WHEEL_ROLL_LAMBDA = 12;
function cockpitWheelRoll(steer) {
  const v = Math.max(-1, Math.min(1, steer || 0));
  return -(WHEEL_ROLL_LIN * v + WHEEL_ROLL_CUBE * v * v * v);
}
// FOREARMS. The gloves end at their cuffs, so on their own they floated —
// worst at full lock, where the outside hand hangs at twelve o'clock with
// nothing running back to the driver. A sleeve in the SUIT colour now runs
// from inside each cuff (wheel-local: it rolls with the wheel) to an elbow
// fixed in CAR space beside the seat (it does not): one cached unit tube,
// stretched between the two per frame. The elbow rides the seat (CockpitOpts
// layout wheelY/wheelZ), low and only 8 cm behind the hub, so the sleeve
// DROPS out of the bottom of the frame the way an onboard shows forearms
// rising to the grips. That is forced by the 0.30 m near plane, not taste: the
// eye is only 0.46 m behind the wheel, and an elbow set back where a real one
// is pulled the sleeve through the near plane IN FRAME at full lock (the
// outside hand at twelve o'clock), worst from the HELMET eye under braking.
// Here every stretch of sleeve nearer than 0.33 m is already >= 42 deg under
// the eye line (the widest stock FOV shows 40.5) — tests/unit/cockpit-wheels.
const ARM_WRIST = [0.1895, -0.140, 0.004];   // wheel-local, inside the glove cuff (_wheelHands)
const ARM_ELBOW = [0.215, -0.30, -0.08];     // car-local x; y and z relative to the wheel hub
const ARM_R = 0.016, ARM_TAPER = 1.6;        // sleeve radius at the wrist (m); elbow / wrist
// The exterior driver's SUIT (car3d part "driver": c2 x 0.62 + 0.05), with the
// cockpit's pale-accent rule (car3d _ckAcc) first: a white suit dims to a grey
// so a pale accent never fills the bottom of the view.
function suitColour(liv) {
  let c = liv && liv.c2 ? liv.c2 : [0.30, 0.30, 0.33];
  const mn = Math.min(c[0], c[1], c[2]);
  if (mn >= 0.45) c = [c[0] * 0.42 / mn, c[1] * 0.42 / mn, c[2] * 0.42 / mn];
  return [c[0] * 0.62 + 0.05, c[1] * 0.62 + 0.05, c[2] * 0.62 + 0.05];
}
let _armMesh = null, _armKey = "";
const _armC2 = [NaN, NaN, NaN];   // the c2 the cached sleeve was built from: a per-frame check that allocates nothing
// Unit sleeve: +z from the wrist (z 0, radius 1) to the elbow (z 1, ARM_TAPER),
// a little fuller at the forearm's belly. Radial normals, so the per-frame
// stretch (radius on x/y, length on z) leaves them pointing the right way.
function getForearm(liv) {
  const c2 = liv && liv.c2;
  if (_armMesh && c2 && c2[0] === _armC2[0] && c2[1] === _armC2[1] && c2[2] === _armC2[2]) return _armMesh;
  _armC2[0] = c2 ? c2[0] : NaN; _armC2[1] = c2 ? c2[1] : NaN; _armC2[2] = c2 ? c2[2] : NaN;
  const col = suitColour(liv), key = col.map((v) => v.toFixed(2)).join(",");
  if (_armMesh && _armKey !== key) { if (_gfx.freeMesh) _gfx.freeMesh(_armMesh); _armMesh = null; }
  if (_armMesh) return _armMesh;
  _armKey = key;
  const out = { pos: [], nrm: [], col: [], idx: [] }, N = 10, T = [0, 0.3, 0.65, 1];
  for (const t of T) {
    const r = 1 + (ARM_TAPER - 1) * t + 0.12 * Math.sin(Math.PI * t);
    for (let j = 0; j < N; j++) {
      const a = j / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      out.pos.push(c * r, s * r, t); out.nrm.push(c, s, 0); out.col.push(col[0], col[1], col[2]);
    }
  }
  for (let i = 0; i < T.length - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * N + j, b = i * N + (j + 1) % N;
    out.idx.push(a, b, b + N, a, b + N, a + N);
  }
  // Flat caps with their own normals (the elbow end is below the frame, the
  // wrist end inside the cuff, but a closed tube never shows a hole).
  for (const end of [0, T.length - 1]) {
    const c0 = out.pos.length / 3, z = T[end], nz = end ? 1 : -1;
    out.pos.push(0, 0, z); out.nrm.push(0, 0, nz); out.col.push(col[0], col[1], col[2]);
    for (let j = 0; j < N; j++) {
      const p = (end * N + j) * 3;
      out.pos.push(out.pos[p], out.pos[p + 1], z); out.nrm.push(0, 0, nz); out.col.push(col[0], col[1], col[2]);
    }
    for (let k = 0; k < N; k++) {
      const a = c0 + 1 + k, b = c0 + 1 + (k + 1) % N;
      out.idx.push(...(end ? [c0, a, b] : [c0, b, a]));
    }
  }
  _rigMark(out, 0, 22);   // suit fabric: the gloves' matte surface, not the generic panel
  _armMesh = _gfx.createMesh(out);
  return _armMesh;
}
// A point through a column-major 4x4 (no M4: the node tests load this file alone).
function _xf(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}
// Wrist (through the rolled wheel matrix) and elbow (through the car body
// matrix) for one side, both in the space the two matrices map into.
function forearmEnds(rig, base, lay, side, wrist, elbow) {
  _xf(rig, side * ARM_WRIST[0], ARM_WRIST[1], ARM_WRIST[2], wrist);
  _xf(base, side * ARM_ELBOW[0], lay.wheelY + ARM_ELBOW[1], lay.wheelZ + ARM_ELBOW[2], elbow);
}
const _armW = [0, 0, 0], _armE = [0, 0, 0], _armM = new Float32Array(16);
// The unit sleeve stretched from wrist to elbow: a right-handed basis whose x/y
// span the cross-section (ARM_R) and whose z IS the wrist-to-elbow vector.
function forearmMatrix(wrist, elbow, up, out) {
  const dx = elbow[0] - wrist[0], dy = elbow[1] - wrist[1], dz = elbow[2] - wrist[2];
  const L = Math.hypot(dx, dy, dz) || 1, ux = dx / L, uy = dy / L, uz = dz / L;
  let ax = uy * up[2] - uz * up[1], ay = uz * up[0] - ux * up[2], az = ux * up[1] - uy * up[0];
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-6) { ax = 1; ay = 0; az = 0; } else { ax /= al; ay /= al; az /= al; }
  const bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax;   // u x a
  out[0] = ax * ARM_R; out[1] = ay * ARM_R; out[2] = az * ARM_R; out[3] = 0;
  out[4] = bx * ARM_R; out[5] = by * ARM_R; out[6] = bz * ARM_R; out[7] = 0;
  out[8] = dx; out[9] = dy; out[10] = dz; out[11] = 0;
  out[12] = wrist[0]; out[13] = wrist[1]; out[14] = wrist[2]; out[15] = 1;
  return out;
}
// Both sleeves, two draws a frame. rig = the rolled wheel matrix (car-draw
// _rigB), base = the car body matrix, lay = CockpitOpts.layout() of the seat.
const _armUp = [0, 1, 0];
function drawForearms(rig, base, lay, liv, opt) {
  const mesh = getForearm(liv);
  _armUp[0] = base[4]; _armUp[1] = base[5]; _armUp[2] = base[6];
  for (let side = -1; side <= 1; side += 2) {
    forearmEnds(rig, base, lay, side, _armW, _armE);
    _gfx.draw(mesh, forearmMatrix(_armW, _armE, _armUp, _armM), opt);
  }
}
// The COLUMN AND BULKHEAD a wheel clips onto, for VISOR — the cockpit with the
// wheel taken off (js/camera/vantage.js) — and for the NONE cockpit interior. Without them the view looked down
// onto a bare deck with the halo pillar hanging in the air. Wheel-local like
// getCockpitWheel and drawn at the same _rigT, never rolled: the quick-release
// boss sits where the wheel's hub was, the column runs forward (+z, away from
// the driver) into a carbon front bulkhead that closes the front of the opening
// wall to wall (0.76 local = x ±0.30 world, the tub's inner walls are at ±0.315).
// Neutral carbon, so it needs no livery key.
let cockpitDashMesh = null;
function getCockpitDash() {
  if (cockpitDashMesh) return cockpitDashMesh;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const CARB = [0.04, 0.04, 0.05], DARK = [0.015, 0.015, 0.02], MET = [0.30, 0.30, 0.33];
  _rigTube(out, [[0,-0.012,0.025],[0,-0.012,0.32]], 0.028, CARB);        // steering column into the bulkhead
  _rigRing(out, 0, 0, 0.020, 0.037, 16, 0.012, 0.034, MET);             // quick-release boss where the hub clips on
  _rigDisc(out, 0, 0, 0.001, 0.027, 12, DARK);
  _rigRing(out,0,0,-.001,.022,12,.003,.002,[.16,.17,.19]);
  _rigButton(out,0,0,-.002,.010,[.25,.26,.28]);            // its spline socket, facing the driver
  _rigPlate(out, [[-0.28,-0.25],[0.28,-0.25],[0.34,-0.15],[0.37,0.04],[0.34,0.07],[-0.34,0.07],[-0.37,0.04],[-0.34,-0.15]], 0.32, 0.035, CARB);          // front bulkhead, down to the coaming (world y 0.43..0.69)
  _rigTube(out, [[-0.34,0.064,0.305],[-0.17,0.072,0.305],[0,0.075,0.305],[0.17,0.072,0.305],[0.34,0.064,0.305]], 0.009, [0.10,0.10,0.12]); // its top lip
  for (let i=0;i<6;i++) {
    const a=i/6*Math.PI*2;
    _rigDisc(out,Math.cos(a)*0.032,Math.sin(a)*0.032,-0.001,0.003,8,[0.50,0.52,0.54]);
  }
  for (const side of [-1,1]) for (let i=0;i<4;i++)
    _rigRounded(out,side*(0.22+i*0.026),-0.080,0.298,0.012,0.078,0.008,0.003,DARK);
  cockpitDashMesh = _gfx.createMesh(_rigMaterials(out));
  return cockpitDashMesh;
}
// --- COCKPIT INTERIORS (js/camera/cockpit-opts.js INTERIOR) ------------------
// The bodywork an interior adds around its seat, CAR-LOCAL (the frame the body
// is drawn in: y up from the road, z forward, x across) and never rolled with
// the wheel (CockpitOpts INTERIOR). TEAM: padding in the team's colours. CLASSIC:
// a 1960s cockpit — a padded leather scuttle, a painted dash with round gauges,
// a wraparound aeroscreen. The eye is CockpitOpts.layout(); everything here
// sits >= 0.40 m ahead of it (the cockpit near plane is 0.30).
// A quad wound so it faces n (the _rigBox convention: (b-a)x(c-a) . n > 0).
function _rigQuad(out, a, b, c, d, n, col) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const q = ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2]) >= 0 ? [a, b, c, d] : [a, d, c, b];
  const i0 = out.pos.length / 3;
  for (const v of q) { out.pos.push(v[0], v[1], v[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]); }
  out.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
}
// A square beam w thick from p0 to p1, in any direction: pillars and rails.
function _rigBeam(out, p0, p1, w, col) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(d[0], d[1], d[2]) || 1;
  const u = [d[0] / L, d[1] / L, d[2] / L], ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const a = nz(cr(u, ref)), b = cr(u, a), h = w / 2;
  const P = (p, sa, sb) => [p[0] + (a[0] * sa + b[0] * sb) * h, p[1] + (a[1] * sa + b[1] * sb) * h, p[2] + (a[2] * sa + b[2] * sb) * h];
  const ng = (v) => [-v[0], -v[1], -v[2]];
  _rigQuad(out, P(p0, 1, -1), P(p1, 1, -1), P(p1, 1, 1), P(p0, 1, 1), a, col);          // the four sides
  _rigQuad(out, P(p0, -1, -1), P(p1, -1, -1), P(p1, -1, 1), P(p0, -1, 1), ng(a), col);
  _rigQuad(out, P(p0, -1, 1), P(p1, -1, 1), P(p1, 1, 1), P(p0, 1, 1), b, col);
  _rigQuad(out, P(p0, -1, -1), P(p1, -1, -1), P(p1, 1, -1), P(p0, 1, -1), ng(b), col);
  _rigQuad(out, P(p0, -1, -1), P(p0, 1, -1), P(p0, 1, 1), P(p0, -1, 1), ng(u), col);
  _rigQuad(out, P(p1, -1, -1), P(p1, 1, -1), P(p1, 1, 1), P(p1, -1, 1), u, col);
}
// Rounded removable padding: circular sections follow the tub instead of
// exposing the corners of a rectangular beam at the driver's eye.
function _rigTube(out, path, r, col, surface=22) {
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=v=>{const L=Math.hypot(...v);return v.map(x=>x/L);}, start=out.pos.length/3, dirs=[];
  for(let i=0;i<path.length;i++) {
    const p=path[i], lo=path[Math.max(0,i-1)], hi=path[Math.min(path.length-1,i+1)];
    const d=unit(hi.map((x,k)=>x-lo[k])), a=unit(cross(d,Math.abs(d[1])<0.9?[0,1,0]:[1,0,0])), b=cross(d,a); dirs.push(d);
    for(let j=0;j<8;j++) {
      const t=j/8*Math.PI*2, n=a.map((x,k)=>x*Math.cos(t)+b[k]*Math.sin(t));
      out.pos.push(...p.map((x,k)=>x+r*n[k])); out.nrm.push(...n); out.col.push(...col);
    }
  }
  for(let i=0;i<path.length-1;i++) for(let j=0;j<8;j++) {
    const a=start+i*8+j,b=start+i*8+(j+1)%8;out.idx.push(a,b,b+8,a,b+8,a+8);
  }
  for(const i of [0,path.length-1]) {
    const c=out.pos.length/3;out.pos.push(...path[i]);out.nrm.push(...dirs[i].map(x=>i===0?-x:x));out.col.push(...col);
    for(let j=0;j<8;j++) {const a=start+i*8+j,b=start+i*8+(j+1)%8;out.idx.push(c,i===0?b:a,i===0?a:b);}
  }
  _rigMark(out,start,surface);
}
// A flat disc facing the driver (-z) at z = cz: gauge faces.
function _rigDisc(out, cx, cy, cz, r, n, col) {
  const i0 = out.pos.length / 3;
  out.pos.push(cx, cy, cz); out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]);
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    out.pos.push(cx + r * Math.cos(t), cy + r * Math.sin(t), cz); out.nrm.push(0, 0, -1); out.col.push(col[0], col[1], col[2]);
  }
  // CCW about +z is clockwise seen from the driver (-z), so wind it backwards.
  for (let i = 0; i < n; i++) out.idx.push(i0, i0 + 1 + (i + 1) % n, i0 + 1 + i);
}
// A ring (bezel) about (cx, cy) in the plane z = cz.
function _rigRing(out, cx, cy, cz, r, n, w, d, col) {
  const ext = w * 0.18;
  for (let i = 0; i < n; i++) {
    const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
    const x0 = r * Math.cos(t0), y0 = r * Math.sin(t0), x1 = r * Math.cos(t1), y1 = r * Math.sin(t1);
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ex = (x1 - x0) / L * ext, ey = (y1 - y0) / L * ext;
    _rigBar(out, cx + x0 - ex, cy + y0 - ey, cx + x1 + ex, cy + y1 + ey, cz, w, d, col);
  }
}
// Fixed labeled faces; the needles are drawn from actual telemetry separately.
function _rigGauge(out, cx, cy, cz, r, max, label, face, bezel) {
  const start=out.pos.length/3;
  _rigRing(out, cx, cy, cz, r, 20, r * 0.16, 0.008, bezel);
  _rigMark(out,start,23);
  _rigDisc(out, cx, cy, cz + 0.002, r * 0.94, 20, face);
  for (let i=0;i<=10;i++) {
    const t = Math.PI*(1.25-1.5*i/10), c = Math.cos(t), s = Math.sin(t);
    _rigBar(out,cx+c*r*0.70,cy+s*r*0.70,cx+c*r*0.86,cy+s*r*0.86,cz-0.001,r*0.035,0.001,[0.11,0.12,0.13]);
  }
  for(let i=0;i<=4;i++) {const a=Math.PI*(1.25-1.5*i/4);_rigLabel(out,String(max*i/4),cx+Math.cos(a)*r*.61,cy+Math.sin(a)*r*.61,cz-.002,r*.032,[.13,.14,.15]);}
  _rigLabel(out,label,cx,cy-r*.35,cz-.002,r*.040,[.13,.14,.15]);
}
// Lofted panels with outward normals and closed ends, rather than box walls.
function _rigLiner(out, rings, col) {
  const start=out.pos.length/3;
  const face=(a,b,c,d)=>{
    const u=b.map((v,i)=>v-a[i]), v=c.map((q,i)=>q-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], L=Math.hypot(...n);
    _rigQuad(out,a,b,c,d,n.map(q=>q/L),col);
  };
  for(let i=0;i<rings.length-1;i++) for(let j=0;j<rings[i].length;j++) {
    const k=(j+1)%rings[i].length; face(rings[i][j],rings[i+1][j],rings[i+1][k],rings[i][k]);
  }
  for(const end of [0,rings.length-1]) {
    const q=end===0 ? rings[end].slice().reverse() : rings[end];
    for(let j=1;j<q.length-1;j++) {
      const before=out.idx.length; face(q[0],q[j],q[j+1],q[0]); out.idx.length=before+3;
    }
  }
  _rigMark(out,start,22);
}
// A closed lower tub shared by EVERY trim and body choice. Extending behind
// the eye keeps the near plane from cutting an opening into the road below.
function _cockpitLowerTub(out, kind, accent) {
  const carbon=[0.065,0.070,0.080], edge=[0.16,0.17,0.19], metal=[0.32,0.34,0.36];
  const pad=kind === "classic" ? [0.14,0.085,0.05] : kind === "suede" ? [0.14,0.13,0.12] : [0.09,0.095,0.105];
  const start=out.pos.length/3;
  _rigBox(out,0,0.245,-0.725,0.66,0.040,3.65,carbon); // continuous opaque floor
  _rigBox(out,0,0.450,1.08,0.66,0.450,0.040,carbon); // closed footwell end
  _rigMark(out,start,21);
  for (const side of [-1,1]) {
    const rings=[[-2.55,.326,.690],[-.82,.322,.690],[-.20,.313,.681],[.20,.297,.672],[.48,.280,.665],[1.10,.300,.655]].map(([z,x,y])=>{
      const ring=[[side*.230,.265,z],[side*.255,.245,z],[side*x,y,z],[side*(x-.014),y-.012,z],
        [side*(x-.025),y-.045,z],[side*(x-.045),y-.110,z],[side*(x-.061),.450,z],[side*.244,.410,z]];
      return side>0 ? ring : ring.reverse();
    });
    _rigLiner(out,rings,pad);
    _rigBeam(out,[side*0.246,0.365,-0.20],[side*0.238,0.365,0.81],0.006,edge);
    for (const z of [0.16,0.52,0.84])
      _rigBeam(out,[side*0.244,0.375,z],[side*0.289,0.631,z],0.0025,edge);
    _rigRounded(out,side*0.212,0.440,0.17,0.045,0.055,0.055,0.007,metal);
    _rigRounded(out,side*0.212,0.440,0.137,0.028,0.033,0.008,0.004,accent);
    _rigBeam(out,[side*0.16,0.275,-0.15],[side*0.16,0.275,0.90],0.012,edge);
    for (const y of [0.37,0.61]) {
      _rigDisc(out,side*0.270,y,1.052,0.007,8,metal);
      _rigBar(out,side*0.267,y,side*0.273,y,1.051,0.0015,0.001,[0.025,0.03,0.035]);
    }
  }
  _rigRounded(out,0,0.56,-0.79,0.66,0.63,0.10,0.025,carbon,21); // sealed rear bulkhead
  _rigRounded(out,0,0.79,-0.72,0.48,0.20,0.09,0.04,pad,22); // rear headrest
  _rigRounded(out,0,0.345,-0.025,0.44,0.085,0.37,0.018,pad,22); // seat base
  _rigBeam(out,[-0.20,0.382,0.10],[0.20,0.382,0.10],0.004,edge);
  _rigBox(out,0,0.320,0.76,0.34,0.050,0.16,carbon); // raised pedal heel rest
  for (const x of [-0.10,0,0.10]) _rigBeam(out,[x,0.349,0.69],[x,0.349,0.83],0.006,edge);
}
// Modern tub trim: rounded removable pads, a carbon scuttle, moulded seam
// lines and recessed fasteners. TEAM adds accents to the same shaped trim.
function _teamCabin(out, pad, stitch, kind) {
  const CARB = [0.08,0.085,0.095];
  for (const side of [-1,1]) {
    const stations=[[-.80,.300,.727],[-.55,.297,.725],[-.16,.289,.714],[.10,.278,.704],[.28,.258,.691],[.42,.231,.687]];
    const rings=stations.map(([z,x,y])=>[[side*(x+.012),y+.022,z],[side*(x-.012),y+.015,z],
      [side*(x-.021),y-.006,z],[side*(x-.012),y-.039,z],[side*(x+.016),y-.047,z],[side*(x+.025),y-.018,z]]);
    if(side<0) for(const q of rings)q.reverse();
    _rigLiner(out,rings,pad);
    _rigTube(out,stations.map(([z,x,y])=>[side*(x-.016),y-.007,z]),.0015,stitch);
    _rigRounded(out,side*.273,.696,.23,.026,.035,.04,.006,CARB);
    _rigDisc(out,side*.273,.696,.207,.004,8,[.30,.32,.34]);
    if(kind==='team') _rigTube(out,stations.slice(0,4).map(([z,x,y])=>[side*x,y+.023,z]),.003,stitch);
  }
  _rigTube(out,[[-.302,.739,-.80],[-.20,.754,-.82],[0,.765,-.82],[.20,.754,-.82],[.302,.739,-.80]],.024,pad);
  _rigTube(out,[[-.231,.687,.42],[-.15,.704,.44],[0,.709,.45],[.15,.704,.44],[.231,.687,.42]],.018,CARB,21);
  _rigRounded(out,0,.714,.400,.44,.010,.008,.004,CARB,21);
}
function _classicCabin(out, paint) {
  const LEATHER = [0.10, 0.065, 0.043], CHROME = [0.37, 0.39, 0.41], FACE = [0.55, 0.53, 0.48];
  // Leather coaming follows the entire opening, including behind the driver.
  const rim = [[0,0.75,-0.82],[-0.30,0.72,-0.80],[-0.30,0.69,-0.05],[-0.30,0.69,0.25],[-0.18,0.71,0.40],
    [0.18,0.71,0.40],[0.30,0.69,0.25],[0.30,0.69,-0.05],[0.30,0.72,-0.80],[0,0.75,-0.82]];
  _rigTube(out,rim,0.020,LEATHER);
  _rigRounded(out, 0, 0.745, 0.47, 0.50, 0.13, 0.03, 0.038, paint);        // painted dash panel
  _rigGauge(out, 0, 0.75, 0.443, 0.045, 16, "RPM X1000", FACE, CHROME);
  _rigGauge(out, -0.15, 0.745, 0.443, 0.028, 400, "KPH", FACE, CHROME);
  _rigGauge(out, 0.15, 0.745, 0.443, 0.028, 100, "ERS", FACE, CHROME);
  const scr = _classicScreen();
  for (const [a, b] of scr.frame) _rigBeam(out, a, b, 0.004, CHROME);   // aeroscreen frame
}
// The wraparound aeroscreen: a centre panel and two swept side panels, top edge
// below the eye (0.90) so the chrome never cuts the horizon.
function _classicScreen() {
  const cb = [[-0.14, 0.81, 0.50], [0.14, 0.81, 0.50]], ct = [[-0.13, 0.87, 0.45], [0.13, 0.87, 0.45]];
  const sb = (s) => [s * 0.26, 0.80, 0.40], st = (s) => [s * 0.24, 0.86, 0.36];
  const panels = [[cb[0], cb[1], ct[1], ct[0]], [cb[1], sb(1), st(1), ct[1]], [sb(-1), cb[0], ct[0], st(-1)]];
  const frame = [[ct[0], ct[1]], [ct[1], st(1)], [ct[0], st(-1)], [sb(1), st(1)], [sb(-1), st(-1)]];
  return { panels, frame };
}
let _cabinMesh = null, _cabinKey = "", _cabinKind, _cabinLiv;   // same identity early-out as getCockpitWheel
function getCockpitCabin(kind, liv) {
  if (_cabinMesh && kind === _cabinKind && liv === _cabinLiv) return _cabinMesh;
  _cabinKind = kind; _cabinLiv = liv;
  const tint = (c, k, d) => c ? [c[0] * k, c[1] * k, c[2] * k] : d;
  const col = tint(liv && liv.c1, 0.55, [0.25, 0.05, 0.05]), acc = tint(liv && (liv.accent || liv.c2), 0.6, [0.6, 0.6, 0.62]);
  const key = kind + "|" + col.concat(acc).map((v) => v.toFixed(2)).join(",");
  if (_cabinMesh && _cabinKey !== key) { if (_gfx.freeMesh) _gfx.freeMesh(_cabinMesh); _cabinMesh = null; }
  if (_cabinMesh) return _cabinMesh;
  _cabinKey = key;
  const out = { pos: [], nrm: [], col: [], idx: [] };
  _cockpitLowerTub(out, kind, acc);
  if (kind === "classic") _classicCabin(out, col);
  else _teamCabin(out, kind === "team" ? col.map(v=>v*.32+.045) : kind === "suede" ? [0.18,0.165,0.15] : [0.095,0.10,0.11], kind === "team" ? col : [0.18,0.19,0.20], kind);
  for(const side of [-1,1]) {
    if(kind==='ribbed') for(let i=0;i<8;i++) {
      const z=-.12+i*.055, x=.282-Math.max(0,z)*.10, y=.708-Math.max(0,z)*.04;
      _rigRounded(out,side*x,y-.040,z,.028,.065,.037,.012,[.12,.13,.145],22);
    }
    if(kind==='suede') {
      for(let i=0;i<6;i++) _rigTube(out,[[side*.281,.706,-.14+i*.07],[side*.276,.677,-.14+i*.07]],.0008,[.31,.29,.26]);
      _rigRounded(out,side*.265,.575,.18,.019,.130,.24,.009,[.15,.135,.12],22);
    }
    for(const z of [-.32,.06,.39]) _rigDisc(out,side*.282,.638,z,.0035,8,[.24,.26,.29]);
  }

  _cabinMesh = _gfx.createMesh(_rigMaterials(out));
  return _cabinMesh;
}
// One shared physical needle, transformed per instrument without allocating
// meshes as RPM, speed or energy change. Speed scale is always KPH, as labeled.
let _classicNeedle=null;
const _gaugeT=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]), _gaugeM=new Float32Array(16);
function drawClassicTelemetry(mat,c,kph,opt) {
  if(!_classicNeedle) {
    const out={pos:[],nrm:[],col:[],idx:[]};
    _rigBar(out,-.15,0,.80,0,0,.065,.025,[.92,.20,.08]);
    _rigDisc(out,0,0,-.018,.10,12,[.09,.095,.10]);
    _classicNeedle=_gfx.createMesh(_rigMaterials(out));
  }

  for(let i=0;i<3;i++) {
    const value=i===0?c.rpm/16000:i===1?kph/400:c.energy;
    const r=i===0?.045:.028, a=Math.PI*(1.25-1.5*Math.max(0,Math.min(1,Number.isFinite(value)?value:0)));
    const ca=Math.cos(a)*r,sa=Math.sin(a)*r;
    _gaugeT[0]=ca;_gaugeT[1]=sa;_gaugeT[4]=-sa;_gaugeT[5]=ca;_gaugeT[10]=r;
    _gaugeT[12]=i===0?0:i===1?-.15:.15;_gaugeT[13]=i===0?.75:.745;_gaugeT[14]=.438;
    M4.mulTo(_gaugeM,mat,_gaugeT);_gfx.draw(_classicNeedle,_gaugeM,opt);
  }
}
// CLASSIC's aeroscreen glass, drawn with an alpha material (car-draw.js _glassOpts).
const _glassMeshes = {};
function getCockpitGlass(kind) {
  if (_glassMeshes[kind]) return _glassMeshes[kind];
  const out = { pos: [], nrm: [], col: [], idx: [] }, G = [0.55, 0.62, 0.70], back = [0, 0.55, -0.83];
  for (const q of _classicScreen().panels) _rigQuad(out, q[0], q[1], q[2], q[3], back, G);
  _glassMeshes[kind] = _gfx.createMesh(out);
  return _glassMeshes[kind];
}
const _ledMeshes = {};
// THE SHIFT LIGHTS ARE THE BIGGEST THING ON THE WHEEL. At 3.4 mm the fifteen
// lenses were specks at the wheel's 0.46 m; a real 2026 row runs right across
// the top of the display at about a centimetre a lens. Each row sits inside its
// own fascia's top edge (the _wheelScreen outlines): GT's top is lower, and the
// YOKE's sits so close over its LCD that its row is a hair smaller and narrower.
// `half` is the centre-to-centre half-span; 15 lenses at 2r + 1 mm each.
const LED_ROWS = { std: { y: 0.082, half: 0.077, r: 0.005 }, gt: { y: 0.076, half: 0.077, r: 0.005 },
  yoke: { y: 0.0625, half: 0.070, r: 0.0045 } };
// `lit` 0-8 lights that many LEDs left-to-right. 9 is SHIFT NOW: the whole
// row blue, the cue a driver actually upshifts on (8 lit and 8 lit-plus-past-
// it looked identical). The strip never goes DARK at the limiter — modern
// (car-draw.js) and retro (drawRetroTelemetry) alternate 8 and 9, steady 9
// under reduced motion.
// `style` picks the row (LED_ROWS); anything else — the 2000s wheel scales the
// standard row onto its own LCD — gets the standard one.
function getLedStrip(lit, style) {
  const rowId = LED_ROWS[style] ? style : "std", key = rowId + lit;
  if (_ledMeshes[key]) return _ledMeshes[key];
  const out = { pos: [], nrm: [], col: [], idx: [] }, row = LED_ROWS[rowId];
  const COLS = [[0.2,1.3,0.35],[1.2,0.82,0.12],[0.35,0.55,1.5]];
  const count = Math.round(Math.max(0, Math.min(8, lit)) / 8 * 15);
  for (let i = 0; i < 15; i++) {
    const col = lit === 9 ? [0.35,0.55,1.5] : i < count ? COLS[Math.floor(i/5)] : [0.055,0.06,0.065];
    _rigDisc(out, -row.half + i * row.half / 7, row.y, -0.030, row.r, 8, col);
  }
  _ledMeshes[key] = _gfx.createMesh(out);
  return _ledMeshes[key];
}

  return { init, box: _rigBox, label: _rigLabel, wheelFinishPass, cockpitWheelOpts, wheelFinish,
    getCockpitWheel, WHEEL_FINISHES, WHEEL_DEFAULT, cockpitWheelRoll, WHEEL_ROLL_LAMBDA,
    suitColour, getForearm, forearmEnds, forearmMatrix, drawForearms, ARM_R, ARM_TAPER,
    getCockpitDash, getCockpitCabin, drawClassicTelemetry, getCockpitGlass, getLedStrip,
    LED_ROWS, COCKPIT_WHEELS };
})();
Object.freeze(CockpitRig);
