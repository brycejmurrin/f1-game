/* Timed garage service: four blanket handlers and a rolling front jack.
 * Shared articulated bodies and cached props; no mesh rebuilds during playback. */
const GarageCrewService = (function () {
  "use strict";
  const { block, tube } = GaragePrims;
  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const ease = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3-2*x); };
  const phase = (t, a, b) => ease((t-a)/(b-a));
  const WHEELS = [[1, 1.7, .79], [-1, 1.7, .79], [1, -1.6, .76], [-1, -1.6, .76]];
  function actors() { return Array.from({ length: 5 }, () => ({ x:0, z:0, yaw:0, door:1, seconds:0, calm:true, crouch:0, lean:0, hipLean:0, handY:.85, reach:.03, walkDistance:0, feet:null, footYaw:null, stance:new Float32Array(6), stanceYaw:new Float32Array(2) })); }
  // Writes into preallocated actors. Equipment crosses the lane only while
  // the car is parked; every actor and prop is back at the sides before roll-out.
  function layout(pose, out = actors()) {
    const t = Number.isFinite(pose.serviceTime) ? pose.serviceTime : 0, leaving = pose.direction === "out";
    const approach = phase(t, leaving ? 0 : .3, leaving ? 1.8 : 2.5);
    const lower = leaving ? 1-phase(t,1.8,2.6) : phase(t,2.5,3.4);
    const retreat = phase(t, leaving ? 2.6 : 4, leaving ? 4.8 : 5.8);
    for (let i=0;i<4;i++) {
      const [side,z,wx]=WHEELS[i], a=out[i], near=approach*(1-retreat), carrying=leaving ? t>=1.8 : t<3.4;
      a.x=side*(2.8-1.35*near); a.z=z; a.yaw=-side*Math.PI/2;
      a.walkDistance=retreat>0 ? 1.35*retreat : -1.35*approach;
      a.crouch=.16*lower*approach*(1-retreat); a.lean=.16*lower*approach*(1-retreat); a.hipLean=0;
      const grasp=leaving ? phase(t,1.2,1.8) : 1-phase(t,3.4,3.8);
      a.handY=.85+(.88-.51*lower+.35-.85)*grasp;
      a.reach=.03+(1.45-wx-.215-.03)*grasp;
      if(!leaving){a.crouch*=grasp;a.lean*=grasp;}
      a.coverY=.88-.51*lower; a.coverAttached=carrying;
      a.coverX=side*wx; a.coverZ=z; a.coverReach=1.45-wx;
      a.seconds=pose.seconds; a.calm=pose.calm;
    }
    const j=out[4]; j.z=0; j.crouch=.08; j.lean=.14; j.hipLean=.14; j.handY=.92; j.reach=.52;
    if (leaving) {
      const back=phase(t,0,1.2), turn=phase(t,1.2,1.8), side=phase(t,1.8,4.8);
      j.x=4.05*side; j.z=1.35*back; j.yaw=-Math.PI+Math.PI/2*turn;
      j.walkDistance=side>0 ? 4.05*side : 1.35*back;
      j.pump=0; turning(j,turn,-Math.PI,-Math.PI/2);
    } else {
      const travel=phase(t,.3,2), turn=phase(t,2,2.7), insert=phase(t,2.7,3.8);
      j.x=4.05*(1-travel); j.z=1.35*(1-insert); j.yaw=-Math.PI/2-Math.PI/2*turn; j.walkDistance=insert>0 ? -1.35*insert : -4.05*travel;
      turning(j,turn,-Math.PI/2,-Math.PI);
      j.pump=t>4 && t<5.2 ? Math.sin(Math.PI*(t-4)/1.2)**2 : 0;
    }
    j.seconds=pose.seconds; j.calm=pose.calm;
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
      actor.stance[i*3]=c*wx-s*wz;actor.stance[i*3+1]=.08+.065*Math.sin(Math.PI*t)**2;actor.stance[i*3+2]=s*wx+c*wz;
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
      for(const z of [-.235,.235])quad([p(.265,a,z),p(.37,a,z),p(.37,b,z),p(.265,b,z)],[0,0,Math.sign(z)],cloth);
      quad([p(.265,a,-.235),p(.265,b,-.235),p(.265,b,.235),p(.265,a,.235)],[-Math.cos((a+b)/2),-Math.sin((a+b)/2),0],cloth);
    }
    for(const s of [-1,1])block(out,s*.22,.315,-.24,.045,.04,.018,stripe);
  }
  function create(gfx,nose,frontJack,stripe) {
    let a=acc(); const gripZ=frontJack(a,nose,false), rootZ=gripZ+.52, pivotZ=Math.max(2.72,nose.z)+.14, pivotY=nose.under-.03;
    // The existing chassis-aware jack is converted to operator-local +z.
    for(let i=0;i<a.pos.length;i+=3) { a.pos[i]=-a.pos[i];a.pos[i+2]=rootZ-a.pos[i+2];a.nrm[i]=-a.nrm[i];a.nrm[i+2]=-a.nrm[i+2]; }
    const base=gfx.createMesh(a); a=acc();
    tube(a,[0,0,0],[0,.92-pivotY,-1.06],.03,[.62,.63,.66],8);
    block(a,0,.92-pivotY,-1.06,.27,.025,.025,[.72,.12,.08]);
    const handle=gfx.createMesh(a); a=acc();blanket(a,stripe);
    return { base,handle,cover:gfx.createMesh(a),rootZ,pivotZ:rootZ-pivotZ,pivotY,actors:actors(),m:new Float32Array(16) };
  }
  function matrix(m,x,y,z,yaw,rx=0) {
    const c=Math.cos(yaw),s=Math.sin(yaw),cx=Math.cos(rx),sx=Math.sin(rx);
    m[0]=c;m[1]=0;m[2]=-s;m[3]=0;m[4]=s*sx;m[5]=cx;m[6]=c*sx;m[7]=0;m[8]=s*cx;m[9]=-sx;m[10]=c*cx;m[11]=0;m[12]=x;m[13]=y;m[14]=z;m[15]=1;
    return m;
  }
  function draw(rig,body,gfx,pose,opts) {
    const people=layout(pose,rig.actors), m=rig.m;
    for(let i=0;i<4;i++) {
      const a=people[i]; GarageCrewMotion.draw(body,gfx,a.x,a.z,a.yaw,a,i,opts);
      const cx=a.coverAttached ? a.x+Math.sin(a.yaw)*a.coverReach : a.coverX;
      gfx.draw(rig.cover,matrix(m,cx,a.coverAttached?a.coverY:.37,a.coverZ,a.yaw),opts);
    }
    const j=people[4], z=rig.rootZ+j.z, angle=-.16*j.pump, c=Math.cos(angle),s=Math.sin(angle), dy=.92-rig.pivotY;
    j.handY=rig.pivotY+dy*c+1.06*s; j.reach=rig.pivotZ+dy*s-1.06*c; j.crouch=.08+.12*j.pump;
    GarageCrewMotion.draw(body,gfx,j.x,z,j.yaw,j,4,opts);
    gfx.draw(rig.base,matrix(m,j.x,0,z,j.yaw),opts);
    gfx.draw(rig.handle,matrix(m,j.x+Math.sin(j.yaw)*rig.pivotZ,rig.pivotY,z+Math.cos(j.yaw)*rig.pivotZ,j.yaw,angle),opts);
  }
  function free(rig,gfx) { if(!rig)return 0;for(const mesh of [rig.base,rig.handle,rig.cover])gfx.freeMesh(mesh);return 3; }
  return Object.freeze({ create,draw,free,layout });
})();
