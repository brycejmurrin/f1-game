/* Blender-authored guide motion. Regenerate with tools/garage/author-crew-motion.py.
 * Rigid articulated meshes share the garage's livery materials; no skinning,
 * asynchronous asset load, or per-frame mesh generation is needed. */
const GarageCrewMotion = (function () {
  "use strict";
  // @blender-motion:start
  // Blender 4.3; tools/garage/author-crew-motion.py; 24 fps, sampled every 2 frames.
  // Source SHA256: 707304cdd745495a24e34779c03e9e3c0c0140e724cd7f38fbf2677ab075eccf
  const KEYS = [[0.08,0.03,0.08,0.03,0.42,1.35,0.0],[0.08,0.036836,0.08,0.036836,0.425185,1.358889,0.000593],[0.08,0.056562,0.08,0.056562,0.438148,1.381111,0.002074],[0.117091,0.042771,0.08,0.088008,0.455,1.41,0.004],[0.163615,-0.059329,0.08,0.13,0.471852,1.438889,0.005926],[0.085099,-0.150182,0.08,0.181367,0.484815,1.461111,0.007407],[0.08,-0.096563,0.125835,0.183379,0.49,1.47,0.008],[0.08,-0.029961,0.12094,0.020572,0.484815,1.46441,0.00765],[0.08,0.0425,0.08,0.0425,0.471852,1.449444,0.006704],[0.163921,-0.03094,0.08,0.119648,0.455,1.427813,0.005313],[0.08,-0.137187,0.08,0.200312,0.438148,1.402222,0.00363],[0.08,-0.05418,0.160191,0.076171,0.425185,1.375382,0.001808],[0.08,0.03,0.08,0.03,0.42,1.35,0.0],[0.160191,-0.016171,0.08,0.11418,0.422963,1.328322,-0.00166],[0.08,-0.140313,0.08,0.197188,0.43037,1.310741,-0.003111],[0.08,-0.059648,0.163921,0.09094,0.44,1.297187,-0.004313],[0.08,0.0175,0.08,0.0175,0.44963,1.287593,-0.005222],[0.12094,0.039428,0.08,0.089961,0.457037,1.281887,-0.005799],[0.125835,-0.123379,0.08,0.156562,0.46,1.28,-0.006],[0.08,-0.121367,0.085099,0.210182,0.457037,1.285185,-0.005556],[0.08,-0.07,0.163615,0.119329,0.44963,1.298148,-0.004444],[0.08,-0.028008,0.117091,0.017229,0.44,1.315,-0.003],[0.08,0.003437,0.08,0.003437,0.43037,1.331852,-0.001556],[0.08,0.023164,0.08,0.023164,0.422963,1.344815,-0.000444],[0.08,0.03,0.08,0.03,0.42,1.35,0.0]];
  // @blender-motion:end
  const acc = GarageCrewDraw.acc;
  const THIGH = 0.43, SHIN = 0.44, ARM = 0.30;
  function sample(u, out) {
    const p = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 1)) * (KEYS.length - 1), a = Math.floor(p), b = Math.min(a + 1, KEYS.length - 1), f = p - a;
    for (let i = 0; i < 7; i++) out[i] = KEYS[a][i] + (KEYS[b][i] - KEYS[a][i]) * f;
    return out;
  }
  // Replay the authored planted gait over arbitrary travel, in 1.35 m cycles.
  // Positive distance retreats along local -z; negative distance walks forward.
  function walking(distance, out) {
    const v=((distance/1.35)%1+1)%1;
    let lo=0,hi=1;
    for(let i=0;i<16;i++){const u=(lo+hi)/2;if(u*u*(3-2*u)<v)lo=u;else hi=u;}
    return sample((lo+hi)/2,out);
  }
  // The parts are GarageCrewDraw.body's lofts (tools/gen/blender/crew-body.py), in
  // the frames part() places: the fore carries the glove and fist past the wrist.
  function create(gfx, c1, c2, helmet) {
    const mesh = {}, add = (name, data) => { mesh[name] = gfx.createMesh(data); };
    for (const name of ["torso", "upper", "fore", "thigh", "shin", "boot"]) add(name, GarageCrewDraw.body.build(acc(), name, c1, c2));
    const a = acc(); helmet(a, [0, 0, 0], c1, c2); add("head", a);
    return { mesh, m: new Float32Array(16), pm: new Float32Array(16), parent: null, walk: new Float32Array(7), signal: new Float32Array(7), joint: new Float32Array(2), knee: new Float32Array(3), x: 0, z: 0, cy: 1, sy: 0 };
  }
  function free(rig, gfx) {
    if (!rig) return 0;
    const names = Object.keys(rig.mesh); for (const name of names) gfx.freeMesh(rig.mesh[name]);
    return names.length;
  }
  // Two-bone IK in the figure's YZ plane. Feet remain at Blender's authored
  // ground targets while knees bend; the same solver keeps arm lengths fixed.
  function joint(y, z, ty, tz, a, b, bend, out) {
    const dy = ty - y, dz = tz - z, raw = Math.hypot(dy, dz), d = Math.max(.001, Math.min(a + b - .0001, raw));
    const uy = raw > .001 ? dy / raw : -1, uz = raw > .001 ? dz / raw : 0;
    const along = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - along * along));
    out[0] = y + uy * along + uz * h * bend; out[1] = z + uz * along - uy * h * bend;
    return out;
  }
  // Three-dimensional knee solve keeps an ankle planted as the torso turns.
  function leg(x,y,z,tx,ty,tz,out) {
    const dx=tx-x,dy=ty-y,dz=tz-z,raw=Math.hypot(dx,dy,dz),d=Math.max(.001,Math.min(THIGH+SHIN-.0001,raw));
    const ux=dx/raw,uy=dy/raw,uz=dz/raw,along=(THIGH*THIGH-SHIN*SHIN+d*d)/(2*d),h=Math.sqrt(Math.max(0,THIGH*THIGH-along*along)),n=Math.sqrt(1-uz*uz);
    out[0]=x+ux*along-uz*ux*h/n;out[1]=y+uy*along-uz*uy*h/n;out[2]=z+uz*along+n*h;return out;
  }
  function part(rig, gfx, name, x, y, z, dy, dz, length, opts, dx=0, footYaw=null) {
    const m=rig.m,cy=rig.cy,sy=rig.sy,d=Math.hypot(dx,dy,dz),nx=dx/d,ny=dy/d,nz=dz/d;
    const h=Math.hypot(dx,dy),xx=h>.00001?Math.abs(dy)/h:1,xy=h>.00001?-(dy<0?-1:1)*dx/h:0,zx=xy*nz,zy=-xx*nz,zz=xx*ny-xy*nx;
    m[0]=cy*xx;m[1]=xy;m[2]=-sy*xx;m[3]=0;
    m[4]=(cy*dx+sy*dz)/length;m[5]=dy/length;m[6]=(-sy*dx+cy*dz)/length;m[7]=0;
    m[8]=cy*zx+sy*zz;m[9]=zy;m[10]=-sy*zx+cy*zz;m[11]=0;
    m[12]=rig.x+cy*x+sy*z;m[13]=y;m[14]=rig.z-sy*x+cy*z;m[15]=1;
    if(footYaw!==null) { const c=Math.cos(footYaw),s=Math.sin(footYaw);m[0]=c;m[1]=0;m[2]=-s;m[4]=0;m[5]=1;m[6]=0;m[8]=s;m[9]=0;m[10]=c; }
    // rig.parent (GarageCrewChoreo.draw): the in-race stop places the crew in the car's grounded basis.
    gfx.draw(rig.mesh[name],rig.parent?GarageCrewDraw.mul(rig.pm,rig.parent,m):m,opts);
  }
  function draw(rig, gfx, x, z, yaw, pose, side, opts) {
    rig.x = x; rig.z = z; rig.cy = Math.cos(yaw); rig.sy = Math.sin(yaw);
    const walk = Number.isFinite(pose.walkDistance) ? walking(pose.walkDistance, rig.walk) : sample(pose.door, rig.walk), time = Number.isFinite(pose.seconds) ? pose.seconds : 0;
    const signal = sample(pose.calm ? 0 : (time / 2 + side * .17) % 1, rig.signal);
    const ready = Math.max(0, Math.min(1, (pose.door - .8) * 5)), custom = Number.isFinite(pose.handY), bob = pose.calm || custom ? 0 : signal[6] * ready;
    const drop = Number.isFinite(pose.crouch) ? pose.crouch : 0, lean = Number.isFinite(pose.lean) ? pose.lean : 0, hipLean=Number.isFinite(pose.hipLean)?pose.hipLean:lean;
    const bend=Math.asin(Math.max(-.9,Math.min(.9,(lean-hipLean)/.43))),bc=Math.cos(bend),bs=Math.sin(bend);
    part(rig,gfx,"torso",0,bob-drop+.95*(1-bc),hipLean-.95*bs,bc,bs,1,opts);
    part(rig,gfx,"head",0,.95+.67*bc+bob-drop,hipLean+.67*bs,bc,bs,1,opts);
    for (let i = 0; i < 2; i++) {
      const s=i===0?1:-1,lx=s*.10,fx=pose.feet?pose.feet[i*3]:lx,fy=pose.feet?pose.feet[i*3+1]:walk[i*2],fz=pose.feet?pose.feet[i*3+2]:walk[i*2+1];
      const knee=leg(lx,.91+bob-drop,hipLean,fx,fy,fz,rig.knee),kx=knee[0],ky=knee[1],kz=knee[2];
      part(rig,gfx,"thigh",lx,.91+bob-drop,hipLean,ky-.91-bob+drop,kz-hipLean,THIGH,opts,kx-lx);
      part(rig,gfx,"shin",kx,ky,kz,fy-ky,fz-kz,SHIN,opts,fx-kx);
      part(rig,gfx,"boot",fx,fy,fz,1,0,1,opts,0,pose.footYaw?pose.footYaw[i]:null);
      const sy = .95+.43*bc + bob-drop, hy = custom ? pose.handY : .85 + (signal[5] - .85) * ready + bob, hz = custom ? pose.reach : .03 + (signal[4] - .03) * ready;
      const elbow = joint(sy, lean, hy, hz, ARM, ARM, -1, rig.joint), ey = elbow[0], ez = elbow[1];
      part(rig, gfx, "upper", s * .22, sy, lean, ey - sy, ez-lean, ARM, opts);
      part(rig, gfx, "fore", s * .22, ey, ez, hy - ey, hz - ez, ARM, opts);
    }
  }
  return Object.freeze({ create, free, draw, sample, joint, sampleCount: KEYS.length });
})();
