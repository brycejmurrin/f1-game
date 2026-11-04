/* Timed garage service: blanket handlers, a rolling front jack and garage support.
 * Shared articulated bodies and cached props; no mesh rebuilds during playback. */
const GarageCrewService = (function () {
  "use strict";
  const { block, tube } = GaragePrims;
  const acc = GarageCrewDraw.acc;
  const ease = GarageCrewDraw.ease;
  const place = GarageCrewDraw.place;
  const phase = (t, a, b) => ease((t-a)/(b-a));
  // Soft-present floor z-fight: keep equipment a hair above y=0.
  // Foot targets stay at 0.08 (boot sole is 0.08 m under the target → sole on the floor).
  const FLOOR_Y = 0.01;
  const FOOT_PLANT = 0.08;
  const EXIT_HALF = 1.55;              // car half-width + margin — the exit corridor
  const CLEAR_BY = 4.5;                // every actor is outside EXIT_HALF by this serviceTime
  const WHEELS = [[1, 1.7, .79], [-1, 1.7, .79], [1, -1.6, .76], [-1, -1.6, .76]];
  // The jack operator parks against the wall at (JACK_WALL_X, JACK_WALL_Z) facing the car.
  const JACK_WALL_X = 4.05, JACK_WALL_Z = 1.35;
  function actors() {
    return Array.from({ length: 7 }, () => ({ x: 0, z: 0, yaw: 0, door: 1, seconds: 0, calm: true, crouch: 0, lean: 0, hipLean: 0,
      handY: .85, reach: .03, walkDistance: 0, feet: null, footYaw: null, stance: new Float32Array(6), stanceYaw: new Float32Array(2) }));
  }
  // Push anyone still in the exit corridor out to the wall before roll-out.
  function clearExit(out) {
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (Math.abs(a.x) < EXIT_HALF) a.x = (a.x < 0 ? -1 : 1) * Math.max(2.8, EXIT_HALF + 0.4);
    }
    const j = out[4];
    j.x = JACK_WALL_X; j.z = JACK_WALL_Z; j.yaw = -Math.PI / 2; j.pump = 0; j.walkDistance = JACK_WALL_X;
    j.feet = null; j.footYaw = null;
    const cable = out[5];
    cable.x = 3; cable.connected = 0; cable.walkDistance = 0; cable.crouch = 0; cable.lean = 0;
    cable.handY = 0.94; cable.reach = 0.34;
  }
  // Actors 0-3: a blanket handler per wheel. Each half-stride is .675 m: both
  // feet plant before lowering or lifting.
  function layoutHandlers(t, leaving, out) {
    const approach = phase(t, leaving ? 0 : .3, leaving ? 1.1 : 1.9);
    const slide = phase(t, leaving ? 1.1 : 2.7, leaving ? 1.9 : 3.5);
    const lower = leaving ? 1 - phase(t, 1.9, 2.6) : phase(t, 1.9, 2.7);
    // Leave retreat finishes earlier so the corridor is empty well before roll-out.
    const retreat = phase(t, leaving ? 2.2 : 4, leaving ? 4.2 : 5.8);
    for (let i = 0; i < 4; i++) {
      const [side, z, wx] = WHEELS[i], a = out[i];
      // On leave, approach less deep so handlers stay clear of the exit half-width
      // except for the brief cover grasp, then retreat hard.
      const distance = leaving ? 1.15 * approach - .575 * slide - .575 * retreat : .675 * approach + .675 * slide - 1.35 * retreat;
      a.x = side * (2.8 - distance); a.z = z; a.yaw = -side * Math.PI / 2; a.walkDistance = -distance;
      const grasp = leaving ? phase(t, .7, 1.1) : 1 - phase(t, 3.5, 3.9);
      a.crouch = .16 * lower * grasp; a.lean = .16 * lower * grasp; a.hipLean = 0;
      a.handY = .85 + (.88 - .51 * lower + .35 - .85) * grasp;
      a.reach = .03 + (1.45 - wx - .215 - .03) * grasp;
      a.coverY = .88 - .51 * lower; a.coverAttached = leaving ? t >= 1.1 : t < 3.5;
      a.coverX = side * wx; a.coverZ = z; a.coverReach = 1.45 - wx;
    }
  }
  // Actor 4: the front-jack operator.
  function layoutJack(t, leaving, j) {
    j.crouch = .08; j.lean = .14; j.hipLean = .14; j.handY = .92; j.reach = .52;
    if (leaving) {
      // Sidestep to the wall BEFORE the turn so planted feet stay fixed in world space during 1.2–1.8.
      const side = phase(t, 0, 1.2), back = phase(t, 0, 1.2), turn = phase(t, 1.2, 1.8);
      j.x = JACK_WALL_X * side; j.z = JACK_WALL_Z * back; j.yaw = -Math.PI + Math.PI / 2 * turn;
      j.walkDistance = side > 0 && turn <= 0 ? JACK_WALL_X * side : (turn > 0 ? 0 : JACK_WALL_Z * back);
      j.pump = 0; turning(j, turn, -Math.PI, -Math.PI / 2);
    } else {
      const travel = phase(t, .3, 2), turn = phase(t, 2, 2.7), insert = phase(t, 2.7, 3.8);
      j.x = JACK_WALL_X * (1 - travel); j.z = JACK_WALL_Z * (1 - insert); j.yaw = -Math.PI / 2 - Math.PI / 2 * turn;
      j.walkDistance = insert > 0 ? -JACK_WALL_Z * insert : -JACK_WALL_X * travel;
      turning(j, turn, -Math.PI / 2, -Math.PI);
      j.pump = t > 4 && t < 5.2 ? Math.sin(Math.PI * (t - 4) / 1.2) ** 2 : 0;
    }
  }
  // Actor 5: the side service umbilical. Walk in after parking; unplug and retreat before roll-out.
  function layoutCable(t, leaving, cable) {
    const travel = leaving ? 1 - phase(t, 0, 1.8) : phase(t, .5, 2.4);
    const connect = leaving ? 1 - phase(t, 0, .6) : phase(t, 2.4, 3.2);
    cable.x = 3 - 1.35 * travel; cable.z = -.3; cable.yaw = -Math.PI / 2;
    cable.walkDistance = -1.35 * travel; cable.crouch = .16 * connect; cable.lean = .17 * connect; cable.hipLean = 0;
    cable.handY = .94 - .16 * connect; cable.reach = .34 + .24 * connect;
    cable.connected = connect;
  }
  // Actor 6: an engineer at the existing monitor bank, clear of all tyre-handler routes.
  function layoutEngineer(pose, engineer) {
    const typing = pose.calm ? 0 : .012 * Math.sin((pose.seconds || 0) * 7);
    engineer.x = -4.38; engineer.z = .6; engineer.yaw = -Math.PI / 2; engineer.walkDistance = 0;
    engineer.crouch = .1; engineer.lean = .18; engineer.hipLean = 0; engineer.handY = .95 + typing; engineer.reach = .46;
  }
  // Writes into preallocated actors. Equipment crosses the lane only while
  // the car is parked; every actor and prop is back at the sides before roll-out.
  function layout(pose, out = actors()) {
    const t = Number.isFinite(pose.serviceTime) ? pose.serviceTime : 0, leaving = pose.direction === "out";
    layoutHandlers(t, leaving, out);
    layoutJack(t, leaving, out[4]);
    layoutCable(t, leaving, out[5]);
    layoutEngineer(pose, out[6]);
    for (let i = 0; i < 7; i++) { out[i].seconds = pose.seconds; out[i].calm = pose.calm; }
    // Hard gate: once the leave clear window opens (or the car is already moving),
    // nobody remains in the exit corridor.
    const moving = Math.abs(pose.z || 0) + Math.abs(pose.x || 0) > 0.03;
    if (leaving && (t >= CLEAR_BY || moving)) clearExit(out);
    return out;
  }
  // Each foot lifts, turns and plants in world space in its own half-step.
  // Inverse yaw supplies 3D ankle targets while the torso keeps turning.
  function turning(actor,u,start,end) {
    actor.feet=null;actor.footYaw=null;
    if(u<=0 || u>=1)return;
    actor.feet=actor.stance;actor.footYaw=actor.stanceYaw;
    const c=Math.cos(actor.yaw),s=Math.sin(actor.yaw);
    for(let i=0;i<2;i++) {
      const x=i===0?.1:-.1, t=Math.max(0,Math.min(1,u*2-i)), e=ease(t);
      const ax=Math.cos(start)*x+Math.sin(start)*.03,az=-Math.sin(start)*x+Math.cos(start)*.03;
      const bx=Math.cos(end)*x+Math.sin(end)*.03,bz=-Math.sin(end)*x+Math.cos(end)*.03;
      const wx=ax+(bx-ax)*e,wz=az+(bz-az)*e;
      // A planted foot target sits at FOOT_PLANT (sole on the floor); the swing foot lifts clear.
      actor.stance[i*3]=c*wx-s*wz;actor.stance[i*3+1]=FOOT_PLANT+.065*Math.sin(Math.PI*t)**2;actor.stance[i*3+2]=s*wx+c*wz;
      actor.stanceYaw[i]=start+(end-start)*e;
    }
  }
  // Annular cloth shell: the wheel centre remains visible through the cover.
  function blanket(out, stripe) {
    const cloth=[.075,.085,.10], n=20;
    function quad(points, normal, col) {
      const b=out.pos.length/3;
      for(const p of points) { out.pos.push(...p); out.nrm.push(...normal); out.col.push(...col); out.mat.push(0); }
      const u=points[1].map((v,i)=>v-points[0][i]), v=points[2].map((v,i)=>v-points[0][i]);
      const dot=(u[1]*v[2]-u[2]*v[1])*normal[0]+(u[2]*v[0]-u[0]*v[2])*normal[1]+(u[0]*v[1]-u[1]*v[0])*normal[2];
      if(dot>0)out.idx.push(b,b+1,b+2,b,b+2,b+3);else out.idx.push(b,b+2,b+1,b,b+3,b+2);
    }
    for(let i=0;i<n;i++) {
      const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2, p=(r,t,z)=>[r*Math.cos(t),r*Math.sin(t),z];
      for(const [lo,hi] of [[-.235,-.055],[-.055,.055],[.055,.235]])quad([p(.37,a,lo),p(.37,b,lo),p(.37,b,hi),p(.37,a,hi)],[Math.cos((a+b)/2),Math.sin((a+b)/2),0],lo===-.055?stripe:cloth);
      for(const z of [-.235,.235])quad([p(.368,a,z),p(.37,a,z),p(.37,b,z),p(.368,b,z)],[0,0,Math.sign(z)],cloth);
      quad([p(.368,a,-.235),p(.368,b,-.235),p(.368,b,.235),p(.368,a,.235)],[-Math.cos((a+b)/2),-Math.sin((a+b)/2),0],cloth);
    }
    for(const s of [-1,1])block(out,s*.22,.315,-.24,.045,.04,.018,stripe);
  }
  function create(gfx,nose,frontJack,stripe) {
    let a=acc(); const gripZ=frontJack(a,nose,false), rootZ=gripZ+.52, pivotZ=Math.max(2.72,nose.z)+.14, pivotY=nose.under-.03;
    // The existing chassis-aware jack is converted to operator-local +z.
    for(let i=0;i<a.pos.length;i+=3) { a.pos[i]=-a.pos[i];a.pos[i+2]=rootZ-a.pos[i+2];a.nrm[i]=-a.nrm[i];a.nrm[i+2]=-a.nrm[i+2]; }
    // Lift the whole jack so its lowest vertex sits at y=0 in mesh space; draw()
    // then places the base at FLOOR_Y so wheels never clip through the bay floor.
    let minY = Infinity;
    for (let i = 1; i < a.pos.length; i += 3) if (a.pos[i] < minY) minY = a.pos[i];
    if (Number.isFinite(minY) && minY !== 0) {
      for (let i = 1; i < a.pos.length; i += 3) a.pos[i] -= minY;
    }
    const base=gfx.createMesh(a); a=acc();
    tube(a,[0,0,0],[0,.92-pivotY,-1.06],.03,[.62,.63,.66],8);
    block(a,0,.92-pivotY,-1.06,.27,.025,.025,[.72,.12,.08]);
    const handle=gfx.createMesh(a); a=acc();blanket(a,stripe);
    const cover=gfx.createMesh(a);a=acc();
    // Two-hand connector grip and keyed nose; the hose attaches behind it.
    block(a,0,0,0,.27,.035,.045,stripe);tube(a,[0,0,-.08],[0,0,.35],.038,[.12,.13,.15],8);
    block(a,0,0,.30,.065,.055,.05,stripe);const plug=gfx.createMesh(a);a=acc();
    tube(a,[0,0,0],[0,1,0],.018,[.45,.23,.07],8);const cable=gfx.createMesh(a);a=acc();
    // Power/data service unit and a keyboard on the existing engineers' desk.
    block(a,3.95,.35,-.3,.22,.30,.25,[.12,.14,.17]);block(a,3.95,.67,-.3,.23,.02,.26,stripe);
    block(a,3.72,.48,-.3,.015,.09,.14,[.05,.4,.3]);
    for(const x of [3.78,4.12])for(const z of [-.5,-.1])block(a,x,FLOOR_Y+.015,z,.035,.025,.035,[.06,.07,.08]);
    block(a,-4.87,.91,.6,.15,.02,.30,[.06,.07,.08]);
    for(let row=0;row<4;row++)for(let key=0;key<10;key++)block(a,-4.98+row*.065,.935,.35+key*.055,.022,.005,.018,[.3,.32,.34]);
    return { base,handle,cover,plug,cable,station:gfx.createMesh(a),rootZ,pivotZ:rootZ-pivotZ,pivotY,actors:actors(),m:new Float32Array(16) };
  }
  // Reuse one unit cylinder and matrix for the hanging hose's three spans.
  function cableSpan(rig,gfx,x,y,z,tx,ty,tz,opts) {
    const m=rig.m,dx=tx-x,dy=ty-y,dz=tz-z,d=Math.hypot(dx,dy,dz),h=Math.hypot(dx,dy);
    m[0]=dy/h;m[1]=-dx/h;m[2]=0;m[3]=0;m[4]=dx;m[5]=dy;m[6]=dz;m[7]=0;
    m[8]=-dx*dz/(h*d);m[9]=-dy*dz/(h*d);m[10]=h/d;m[11]=0;
    m[12]=x;m[13]=y;m[14]=z;m[15]=1;gfx.draw(rig.cable,m,opts);
  }
  function draw(rig,body,gfx,pose,opts) {
    const people=layout(pose,rig.actors), m=rig.m;
    for(let i=0;i<4;i++) {
      const a=people[i]; GarageCrewMotion.draw(body,gfx,a.x,a.z,a.yaw,a,i,opts);
      const cx=a.coverAttached ? a.x+Math.sin(a.yaw)*a.coverReach : a.coverX;
      // Detached covers rest on the floor plane (tyre radius .37), never under it.
      const coverY = a.coverAttached ? a.coverY : Math.max(0.37, FLOOR_Y + 0.36);
      gfx.draw(rig.cover,place(m,cx,coverY,a.coverZ,a.yaw),opts);
    }
    const j=people[4], z=rig.rootZ+j.z, angle=-.16*j.pump, c=Math.cos(angle),s=Math.sin(angle), dy=.92-rig.pivotY;
    j.handY=rig.pivotY+dy*c+1.06*s; j.reach=rig.pivotZ+dy*s-1.06*c; j.crouch=.08+.12*j.pump;
    GarageCrewMotion.draw(body,gfx,j.x,z,j.yaw,j,4,opts);
    // Jack base rides on FLOOR_Y so its wheels never clip through the bay floor.
    gfx.draw(rig.base,place(m,j.x,FLOOR_Y,z,j.yaw),opts);
    gfx.draw(rig.handle,place(m,j.x+Math.sin(j.yaw)*rig.pivotZ,rig.pivotY,z+Math.cos(j.yaw)*rig.pivotZ,j.yaw,angle),opts);
    const a=people[5],px=a.x-a.reach;
    GarageCrewMotion.draw(body,gfx,a.x,a.z,a.yaw,a,5,opts);
    gfx.draw(rig.plug,place(m,px,a.handY,a.z,a.yaw),opts);
    const hoseY = Math.max(0.06, FLOOR_Y + 0.05);
    cableSpan(rig,gfx,3.72,.48,-.3,3.4,hoseY,-.65,opts);
    cableSpan(rig,gfx,3.4,hoseY,-.65,px+.30,hoseY,-.65,opts);
    cableSpan(rig,gfx,px+.30,hoseY,-.65,px+.08,a.handY,a.z,opts);
    const e=people[6];GarageCrewMotion.draw(body,gfx,e.x,e.z,e.yaw,e,6,opts);
    gfx.draw(rig.station,place(m,0,0,0,0),opts);
  }
  function free(rig, gfx) {
    if (!rig) return 0;
    for (const mesh of [rig.base, rig.handle, rig.cover, rig.plug, rig.cable, rig.station]) gfx.freeMesh(mesh);
    return 6;
  }
  return Object.freeze({ create,draw,free,layout,FLOOR_Y,FOOT_PLANT,EXIT_HALF,CLEAR_BY });
})();
