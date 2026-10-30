/* Apex 26 — GarageCrew: the pit crew in the garage on an arrival and the RACE!
   drive-out. Two mechanics beside the car's nose who step back as the shutter
   lifts, and a lollipop man out in the working lane on the camera's side who
   holds his board across the car's path and lifts it as the car rolls. Built
   from GarageCrewDraw.body (Blender-authored lofts), in the active livery's overalls, and
   drawn only while a pose is playing — a parked setup preview has no crew.
   Optional service playback adds four blanket handlers and a front-jack operator.
   Split out of scene.js (the ratchet); GarageScene.draw calls draw(). */
const GarageCrew = (function () {
  "use strict";
  const { block, tube, rgb } = GaragePrims;

  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const OPTS = { roughness: 0.9, metalness: 0.02, specular: 0.12, clearcoat: 0 };
  const VISOR = [0.05, 0.06, 0.08];
  // WHERE THEY STAND (bay metres: x right, z toward the door at 6.4).
  const MECH_X0 = 1.55, MECH_X1 = 2.9, MECH_Z0 = 2.6;   // beside the nose → stepped back
  const LOLLI_X = 2.2, LOLLI_Z = 8.6;                                 // working lane, camera side
  const RAISED = 1.35, LOWERED = 0.05;                                // board pole angle above horizontal

  let gfx = null, key = null, mechMesh = null, bodyMesh = null, poleMesh = null;
  const _m = new Float32Array(16);

  // The full-face shell every crew style wears (GarageCrewDraw.body's Blender-authored
  // loft: chin bar, visor, crown stripe, trim neck roll); +z is forward.
  function helmet(out, H, c1, c2) { return GarageCrewDraw.body.helmet(out, H, c1, c2); }

  /* Crew LOOKS (B·G2, 2026-10-19): alternative crews, picked on the setup
   * sheet's CREW row (GarageCrew.setLook(id), saved as apex26.crewLook).
   * "classic" (the default) is two mechanics and the lollipop man, standing.
   * "sculpted" draws GarageCrewMotion articulated guides (no baked look mesh);
   * pitstop / workshop / welcome bake posed figures + props into ONE static
   * mesh in bay metres, plus the lollipop. */
  const LOOKS = ["classic", "sculpted", "pitstop", "workshop", "welcome"];
  const RUBBER = [0.035, 0.035, 0.04], ALLOY = [0.62, 0.63, 0.66];
  const GUN = [0.10, 0.10, 0.11], HOSE = [0.08, 0.08, 0.09], JACK = [0.72, 0.12, 0.08], BLANKET = [0.16, 0.16, 0.18];
  let look = "classic", lookMesh = null, motionRig = null, serviceRig = null, choreoProps = null;
  const J0 = { foot: [0.11, 0.05, 0.03], knee: [0.11, 0.50, 0.02], hip: [0.10, 0.92, 0], pelvis: [0, 0.95, 0],
    chest: [0, 1.32, 0], neck: [0, 1.46, 0], head: [0, 1.62, 0], shoulder: [0.22, 1.38, 0],
    elbow: [0.26, 1.10, 0], hand: [0.27, 0.84, 0.03] };
  // A pose: the stand with overrides; a [l, r] pair is per side, else mirrored in x.
  const POSES = {
    stand: {},
    kneel: { footL: [0.14, 0.05, 0.40], kneeL: [0.14, 0.52, 0.38], footR: [-0.12, 0.07, -0.36], kneeR: [-0.12, 0.09, 0.06],
      hip: [0.10, 0.55, 0.04], pelvis: [0, 0.58, 0.03], chest: [0, 0.90, 0.16], neck: [0, 1.02, 0.20], head: [0, 1.16, 0.24],
      shoulder: [0.22, 0.95, 0.16], elbow: [0.25, 0.62, 0.30], hand: [0.07, 0.42, 0.46] },
    jack: { chest: [0, 1.26, 0.16], neck: [0, 1.38, 0.22], head: [0, 1.53, 0.27], shoulder: [0.22, 1.30, 0.16],
      elbow: [0.22, 1.08, 0.36], hand: [0.08, 0.92, 0.50], footL: [0.12, 0.05, 0.22], kneeL: [0.12, 0.50, 0.18] },
    carry: { shoulder: [0.22, 1.38, 0.02], elbow: [0.30, 1.08, 0.18], hand: [0.36, 0.88, 0.48] },
    lean: { pelvis: [0, 0.95, -0.06], hip: [0.10, 0.92, -0.06], chest: [0, 1.22, 0.34], neck: [0, 1.30, 0.47], head: [0, 1.40, 0.58],
      shoulder: [0.22, 1.26, 0.36], elbow: [0.27, 1.00, 0.52], hand: [0.26, 0.76, 0.64], foot: [0.12, 0.05, -0.04] },
    crouch: { foot: [0.15, 0.05, 0.14], knee: [0.17, 0.52, 0.30], hip: [0.11, 0.52, -0.10], pelvis: [0, 0.55, -0.12],
      chest: [0, 0.92, 0.04], neck: [0, 1.04, 0.10], head: [0, 1.19, 0.14], shoulder: [0.22, 0.96, 0.05],
      elbow: [0.26, 0.70, 0.24], hand: [0.20, 0.48, 0.42] },
    tablet: { elbowL: [0.25, 1.10, 0.12], handL: [0.10, 1.12, 0.30], elbowR: [-0.25, 1.12, 0.10], handR: [-0.06, 1.16, 0.30] },
    cheer: { elbow: [0.34, 1.64, 0.02], hand: [0.28, 1.92, 0.06] },
    clap: { elbow: [0.28, 1.14, 0.16], hand: [0.04, 1.30, 0.32] },
  };
  function joints(name) {
    const P = POSES[name] || {}, J = { pelvis: P.pelvis || J0.pelvis, chest: P.chest || J0.chest, neck: P.neck || J0.neck, head: P.head || J0.head };
    for (const k of ["foot", "knee", "hip", "shoulder", "elbow", "hand"]) {
      const both = P[k] || J0[k];
      J[k + "L"] = P[k + "L"] || both;
      J[k + "R"] = P[k + "R"] || [-both[0], both[1], both[2]];
    }
    return J;
  }
  // One helmeted figure into `out`, facing +z, from GarageCrewDraw.body's parts
  // baked between the pose's joints (rest lengths THIGH 0.43, SHIN 0.44, ARM
  // 0.30, torso pelvis→neck 0.51); noArmR leaves the lollipop man's pole arm off.
  function rig(out, J, c1, c2, noArmR) {
    const B = GarageCrewDraw.body;
    for (const s of ["L", "R"]) {
      const f = J["foot" + s], ankle = [f[0], f[1] + 0.03, f[2]];   // the sole on the floor (f.y 0.05)
      B.segment(out, "thigh", J["hip" + s], J["knee" + s], c1, c2, 0.43);
      B.segment(out, "shin", J["knee" + s], ankle, c1, c2, 0.44);
      B.boot(out, f, c1, c2, 0.03);
    }
    B.segment(out, "torso", J.pelvis, J.neck, c1, c2, 0.51, 0.95);
    for (const s of noArmR ? ["L"] : ["L", "R"]) {
      B.segment(out, "upper", J["shoulder" + s], J["elbow" + s], c1, c2, 0.30);
      B.segment(out, "fore", J["elbow" + s], J["hand" + s], c1, c2, 0.30);
    }
    helmet(out, J.head, c1, c2);
  }

  // Props, figure-local (the figure's +z), at the hands of their pose.
  function wheelGun(out, J) {
    const g = [0, 0.42, 0.52];
    block(out, g[0], g[1], g[2], 0.06, 0.075, 0.11, GUN);
    block(out, g[0], g[1] - 0.10, g[2] - 0.04, 0.03, 0.06, 0.035, GUN);              // grip
    tube(out, [g[0], g[1], g[2] + 0.1], [g[0], g[1], g[2] + 0.3], 0.042, ALLOY, 8);  // socket
    tube(out, [g[0], g[1], g[2] - 0.1], [g[0], 0.06, -0.15], 0.022, HOSE, 6);        // air line
    tube(out, [g[0], 0.03, -0.15], [g[0] + 0.4, 0.03, -1.6], 0.022, HOSE, 6);
  }
  // A manual jack from the hands to a saddle at height sy, 1.5 m ahead: the
  // saddle's face stops at local z 1.62, so the figure stands 1.62 m off the
  // front wing's leading edge or the rear crash structure and the jack touches it, never enters.
  function jack(out, sy) {
    tube(out, [0, 0.92, 0.52], [0, sy, 1.46], 0.03, ALLOY, 8);                       // the long handle
    block(out, 0, 0.92, 0.52, 0.16, 0.025, 0.025, JACK);                             // its T-bar
    block(out, 0, sy, 1.52, 0.2, 0.06, 0.10, JACK);                                  // lift saddle
    tube(out, [0, sy - 0.06, 1.46], [0, 0.07, 1.36], 0.03, JACK, 6);                 // its leg to the axle
    for (const s of [-1, 1]) tube(out, [s * 0.17, 0.07, 1.36], [s * 0.23, 0.07, 1.36], 0.07, RUBBER, 10);
  }
  // A tyre about centre c, half-width ax along x (on the car) or along z (held
  // face-on toward the hub, the way the tyre-on man offers it).
  // THE DRAWN NOSE for the car in the bay: Car3D's tip station moved by the
  // body style (styledNoseStations' tip rule), so the front jack's saddle is
  // seated under THIS chassis' nose. y is the station centre, h its full height.
  function noseTip(teamId, liv) {
    const C = typeof Car3D !== "undefined" ? Car3D : null;
    const N = C && C.CHASSIS ? C.CHASSIS.nose : [{ z: 2.60, y: 0.245, h: 0.072 }, { z: 2.00, y: 0.315, h: 0.235 }];
    const st = C && C.teamStyleOf ? C.teamStyleOf(C.bodyStyleKey ? C.bodyStyleKey(teamId, liv && liv.bodyStyle) : teamId) : {};
    const tz = st.noseTipZ || 0, dr = st.noseDroop || 0, sl = st.noseSlim || 1, sil = Math.abs(st.coverLift || 0) > 1e-6;
    // Tip and mid stations as styledNoseStations builds them; the cone between
    // them is a straight loft, so its underside is a line.
    const tip = { z: N[0].z + tz, under: N[0].y + dr - N[0].h * sl / 2 };
    const mSl = 1 + (sl - 1) * (sil ? 0.85 : 0.55);
    const mY = N[1].y + dr * (sil ? 0.85 : 0.45) + (sil ? (sl < 0.7 ? -0.04 : 0) + (sl > 1.2 ? 0.03 : 0) : 0);
    const mid = { z: N[1].z + tz * (sil ? 0.72 : 0.45), under: mY - N[1].h * mSl / 2 };
    const at = (z) => tip.under + (mid.under - tip.under) * (tip.z - z) / (tip.z - mid.z);
    return { z: tip.z, under: tip.under, at };
  }
  // A manual front jack in bay metres: its frame stands on two wheels just
  // ahead of the front wing's leading edge (z 2.72, every chassis) or of the
  // nose if that leads, and a short arm reaches back over the main plane so the
  // saddle's top sits ON the nose's underside — touching, never inside, and
  // never through the wing. Returns where the jack man's hands hold the bar.
  const WING_LE = 2.72;
  function frontJack(out, nose, handle = true) {
    const pz = Math.max(WING_LE, nose.z) + 0.14, py = nose.under - 0.03;
    const sz0 = nose.z - 0.10, sz1 = nose.z - 0.015;                          // saddle, under the tip
    // A round cradle laid along the cone's own slope: its top line IS the
    // nose's underside over the whole saddle, so no wedge of light under it.
    const R = 0.024;
    tube(out, [0, nose.at(sz0) - R, sz0], [0, nose.at(sz1) - R, sz1], R, JACK, 12);
    tube(out, [0, py, sz1], [0, py, pz], 0.022, ALLOY, 8);                     // the arm, above the wing
    tube(out, [0, py, pz], [0, 0.07, pz + 0.06], 0.026, JACK, 6);              // the frame to the axle
    for (const s of [-1, 1]) tube(out, [s * 0.10, 0.07, pz + 0.06], [s * 0.16, 0.07, pz + 0.06], 0.07, RUBBER, 10);
    const hz = pz + 1.06;
    if (handle) tube(out, [0, py, pz], [0, 0.92, hz], 0.03, ALLOY, 8);                     // the long handle
    if (handle) block(out, 0, 0.92, hz, 0.16, 0.025, 0.025, JACK);                         // its T-bar
    return hz;
  }
  function tyre(out, c, ax, blanket, mark, alongZ) {
    const at = (w) => alongZ ? [c[0], c[1], c[2] + w] : [c[0] + w, c[1], c[2]];
    const a = at(-ax), b = at(ax);
    if (blanket) {
      tube(out, a, b, 0.355, BLANKET, 16);
      tube(out, at(-(ax * 0.25)), at(ax * 0.25), 0.36, mark, 16);    // the compound band
    } else {
      tube(out, a, b, 0.35, RUBBER, 16);
      tube(out, at(-(ax - 0.006)), at(ax + 0.006), 0.26, mark, 14);  // sidewall stripe
      tube(out, at(-(ax - 0.01)), at(ax + 0.01), 0.2, ALLOY, 12);
    }
  }
  function tablet(out) { block(out, 0.02, 1.15, 0.33, 0.13, 0.085, 0.012, VISOR); block(out, 0.02, 1.15, 0.342, 0.11, 0.07, 0.002, [0.25, 0.45, 0.7]); }
  // Copy `src` into `dst` turned by yaw about y and moved to (x, y, z).
  function place(dst, src, x, y, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw), base = dst.pos.length / 3;
    for (let i = 0; i < src.pos.length; i += 3) {
      const px = src.pos[i], pz = src.pos[i + 2], nx = src.nrm[i], nz = src.nrm[i + 2];
      dst.pos.push(x + c * px + s * pz, y + src.pos[i + 1], z - s * px + c * pz);
      dst.nrm.push(c * nx + s * nz, src.nrm[i + 1], -s * nx + c * nz);
    }
    for (const v of src.col) dst.col.push(v);
    for (const v of src.mat) dst.mat.push(v);
    for (const v of src.idx) dst.idx.push(base + v);
  }
  function person(dst, c1, c2, poseName, x, z, yaw, prop) {
    const f = acc(), J = joints(poseName);
    rig(f, J, c1, c2, false);
    if (prop) prop(f, J);
    place(dst, f, x, 0, z, yaw);
  }
  const FACE_X = (s) => s > 0 ? -Math.PI / 2 : Math.PI / 2;   // a figure at side s facing the car's centreline
  // THE LOOKS: who stands where, holding what (bay metres, car parked at 0,0).
  function buildLook(id, c1, c2, nose) {
    const m = acc(), soft = [0.95, 0.80, 0.10], med = [0.95, 0.95, 0.95];
    const wheels = [[0.79, 1.7], [-0.79, 1.7], [0.76, -1.6], [-0.76, -1.6]];
    if (id === "pitstop") {
      for (const [wx, wz] of wheels) {
        const s = Math.sign(wx);
        person(m, c1, c2, "kneel", wx + s * 1.05, wz, FACE_X(s), wheelGun);                // gunner
        person(m, c1, c2, "carry", wx + s * 1.25, wz + (wz > 0 ? 0.95 : -0.95), FACE_X(s),
          (o) => tyre(o, [0, 0.88, 0.5], 0.17, false, soft, true));                                            // tyre on
        person(m, c1, c2, "stand", wx + s * 1.55, wz + (wz > 0 ? -0.9 : 0.9), FACE_X(s));    // tyre off
      }
      person(m, c1, c2, "jack", 0, frontJack(m, nose) + 0.52, Math.PI);                 // hands on the T-bar
      person(m, c1, c2, "jack", 0, -2.69 - 1.62, 0, (o) => jack(o, 0.34));             // crash structure
      for (const s of [-1, 1]) person(m, c1, c2, "crouch", s * 1.35, 0.1, FACE_X(s));        // stabilisers
    } else if (id === "workshop") {
      for (const [wx, wz] of wheels) tyre(m, [wx, 0.36, wz], 0.215, true, wz > 0 ? soft : med);       // blankets on, resting on the floor
      person(m, c1, c2, "lean", 1.25, 0.3, -Math.PI / 2);                                        // in the cockpit
      person(m, c1, c2, "crouch", -1.55, 1.9, Math.PI / 2);                                      // at the front corner
      person(m, c1, c2, "tablet", -2.4, -1.4, Math.PI / 2 - 0.5, tablet);                        // engineer
      person(m, c1, c2, "carry", 2.6, -2.8, -Math.PI / 2 - 0.6, (o) => tyre(o, [0, 0.88, 0.5], 0.17, true, soft, true));
      person(m, c1, c2, "stand", 3.6, 2.2, -Math.PI / 2 - 0.4);
    } else if (id === "welcome") {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
        person(m, c1, c2, i === 1 ? "clap" : "cheer", s * (2.0 + i * 0.62), 5.4 - i * 0.55, s > 0 ? Math.PI + 0.5 : Math.PI - 0.5);
      for (const s of [-1, 1]) person(m, c1, c2, "clap", s * 3.6, -3.6, FACE_X(s) + s * 0.4);
    }
    return m;
  }
  function build(liv, teamId, style = look) {
    const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
    const c2 = rgb(liv && (liv.c2 || liv.accent || liv.stripe), [0.85, 0.86, 0.88]);
    const nose = noseTip(teamId, liv), noseY = nose.at(nose.z - 0.1);
    // Snapshot components rather than a weighted sum: distinct palettes can
    // share a numeric hash, and the editor can mutate a colour array in place.
    if (mechMesh && key && key[0] === style && key[1] === c1[0] && key[2] === c1[1] && key[3] === c1[2] &&
        key[4] === c2[0] && key[5] === c2[1] && key[6] === c2[2] && key[7] === nose.z && key[8] === noseY) return;
    free();
    key = [style, ...c1, ...c2, nose.z, noseY];
    const classic = style === "classic", J = joints("stand");
    const m = acc(); rig(m, J, c1, c2, false);
    mechMesh = gfx.createMesh(m);
    const b = acc(); rig(b, J, c1, c2, true);
    bodyMesh = gfx.createMesh(b);
    const L = classic ? null : buildLook(style, c1, c2, nose);
    lookMesh = L && L.idx.length ? gfx.createMesh(L) : null;
    // The lollipop: arm and pole along local +x from the shoulder, the round
    // board at the end facing ±z (toward the car), raised by a turn about z.
    const p = acc();
    block(p, 0.16, 0, 0, 0.16, 0.05, 0.06, c1);                          // upper arm
    tube(p, [0.30, 0, 0], [1.75, 0, 0], 0.016, [0.85, 0.85, 0.88], 6);   // pole
    tube(p, [1.95, 0, -0.012], [1.95, 0, 0.012], 0.24, [0.95, 0.95, 0.96], 16);   // board
    tube(p, [1.95, 0, -0.016], [1.95, 0, 0.016], 0.17, [0.86, 0.10, 0.08], 16);   // its red face
    poleMesh = gfx.createMesh(p);
    if (style !== "classic" && style !== "welcome" && typeof GarageCrewMotion !== "undefined")
      motionRig = GarageCrewMotion.create(gfx, c1, c2, helmet);
    if (style === "service" && typeof GarageCrewService !== "undefined") serviceRig = GarageCrewService.create(gfx, nose, frontJack, c2);
    if (style === "choreo" && typeof GarageCrewChoreo !== "undefined") choreoProps = GarageCrewChoreo.createProps(gfx, c2);
  }
  function free() {
    if (!gfx || !gfx.freeMesh) return 0;
    let n = 0;
    for (const mesh of [mechMesh, bodyMesh, poleMesh, lookMesh]) if (mesh) { gfx.freeMesh(mesh); n++; }
    if (motionRig && typeof GarageCrewMotion !== "undefined") n += GarageCrewMotion.free(motionRig, gfx);
    if (serviceRig && typeof GarageCrewService !== "undefined") n += GarageCrewService.free(serviceRig, gfx);
    if (choreoProps && typeof GarageCrewChoreo !== "undefined") n += GarageCrewChoreo.freeProps(choreoProps, gfx);
    motionRig = serviceRig = choreoProps = null;
    mechMesh = bodyMesh = poleMesh = lookMesh = null; key = null;
    return n;
  }
  // Column-major T * Ry(ay) * Rz(az) into _m (scene.js mk's convention).
  function mk(tx, ty, tz, ay, az) {
    const cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
    _m[0] = cy * cz; _m[1] = sz; _m[2] = -sy * cz; _m[3] = 0;
    _m[4] = -cy * sz; _m[5] = cz; _m[6] = sy * sz; _m[7] = 0;
    _m[8] = sy; _m[9] = 0; _m[10] = cy; _m[11] = 0;
    _m[12] = tx; _m[13] = ty; _m[14] = tz; _m[15] = 1;
    return _m;
  }
  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

  /** Where everyone stands for a pose: pure, so it is testable. `cam` is the
   *  side of the bay the camera stands on (sign of the eye's x). */
  function layout(pose, cam) {
    const back = ease(pose.door), out = pose.z > 0.3 || Math.abs(pose.x || 0) > 0.3;
    const mx = MECH_X0 + (MECH_X1 - MECH_X0) * back, mz = MECH_Z0;
    return {
      mechanics: [[-mx, mz, Math.PI / 2], [mx, mz, -Math.PI / 2]],      // [x, z, yaw]: facing the car
      lollipop: { x: cam * LOLLI_X, z: LOLLI_Z, yaw: cam > 0 ? Math.PI : 0, raise: Number.isFinite(pose.crewClear) ? LOWERED + (RAISED - LOWERED) * pose.crewClear : out ? RAISED : LOWERED },
    };
  }
  function init(g) {
    if (g !== gfx) { free(); gfx = g; }
    try { const v = typeof localStorage !== "undefined" && localStorage.getItem("apex26.crewLook"); if (v && LOOKS.includes(v)) look = v; } catch (_) { /* no storage */ }
  }
  /** The garage CREW picker (and the dev hook): one of LOOKS, saved; returns the look in force. */
  function setLook(id) {
    if (LOOKS.includes(id) && id !== look) {
      look = id; free();
      try { localStorage.setItem("apex26.crewLook", id); } catch (_) { /* private mode */ }
    }
    return look;
  }
  // teamId (optional): the car's team, so the pit-stop jack seats on its nose.
  function draw(liv, eye, pose, opts, teamId) {
    if (!gfx || !pose || pose.crew === "none") return;
    // Per-direction animation choices never change the saved Team-tab crew.
    const choreo = typeof GarageCrewChoreo !== "undefined" && GarageCrewChoreo.has(pose.crew);
    const style = choreo ? "choreo" : pose.crew === "service" ? "service" : pose.crew === "guides" ? "sculpted" : pose.crew === "welcome" ? "welcome" : look;
    build(liv, teamId, style);
    const L = layout(pose, eye && eye[0] > 0 ? 1 : -1);
    // A Blender variant (GarageCrewChoreo) is the whole crew bar the lollipop.
    if (choreo && motionRig) GarageCrewChoreo.draw(motionRig, choreoProps, gfx, pose.crew, pose.seconds || 0, pose.side, pose.seconds || 0, !!pose.calm, opts || OPTS);
    else {
      const moving = Math.abs(pose.z || 0) > 1e-6 || Math.abs(pose.x || 0) > 1e-6;
      // Service tools and people leaning into the cockpit belong to a parked
      // car. The already-built guides take over while it enters or leaves.
      const guides = style === "service" || style === "classic" || style === "sculpted" || (moving && (style === "pitstop" || style === "workshop"));
      if (guides)
        for (let i = 0; i < L.mechanics.length; i++) {
          const p = L.mechanics[i];
          if (motionRig) GarageCrewMotion.draw(motionRig, gfx, p[0], p[1], p[2], pose, i, opts || OPTS);
          else gfx.draw(mechMesh, mk(p[0], 0, p[1], p[2], 0), opts || OPTS);
        }
      if (serviceRig && motionRig) GarageCrewService.draw(serviceRig, motionRig, gfx, pose, opts || OPTS);
      if (lookMesh && !guides) gfx.draw(lookMesh, mk(0, 0, 0, 0, 0), opts || OPTS);
    }
    const lp = L.lollipop;
    gfx.draw(bodyMesh, mk(lp.x, 0, lp.z, lp.yaw + Math.PI, 0), opts || OPTS);   // facing the garage
    // The pole from the right shoulder, across the car's path, lifted by `raise`.
    const sx = lp.x + (lp.yaw === 0 ? 0.25 : -0.25);
    gfx.draw(poleMesh, mk(sx, 1.38, lp.z, lp.yaw, lp.raise), opts || OPTS);
  }
  return Object.freeze({ init, draw, layout, free, setLook, noseTip, helmet, look: () => look, LOOKS, RAISED, LOWERED });
})();
