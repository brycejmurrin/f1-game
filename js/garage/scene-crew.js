/* Apex 26 — GarageCrew: the pit crew in the garage on an arrival and the RACE!
   drive-out. Two mechanics beside the car's nose who step back as the shutter
   lifts, and a lollipop man out in the working lane on the camera's side who
   holds his board across the car's path and lifts it as the car rolls. Built
   from the room's own primitives (GaragePrims), in the team's overalls, and
   drawn only while a pose is playing — a parked setup preview has no crew.
   Split out of scene.js (the ratchet); GarageScene.draw calls draw(). */
const GarageCrew = (function () {
  "use strict";
  const { block, cyl, tube, scale, rgb } = GaragePrims;

  const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
  const OPTS = { roughness: 0.9, metalness: 0.02, specular: 0.12, clearcoat: 0 };
  const SKIN = [0.62, 0.47, 0.38], BOOT = [0.06, 0.06, 0.07], VISOR = [0.05, 0.06, 0.08];
  // WHERE THEY STAND (bay metres: x right, z toward the door at 6.4).
  const MECH_X0 = 1.55, MECH_X1 = 2.9, MECH_Z0 = 2.6, MECH_Z1 = 3.0;   // beside the nose → stepped back
  const LOLLI_X = 2.2, LOLLI_Z = 8.6;                                 // working lane, camera side
  const RAISED = 1.35, LOWERED = 0.05;                                // board pole angle above horizontal

  let gfx = null, key = -1, mechMesh = null, bodyMesh = null, poleMesh = null;
  const _m = new Float32Array(16);

  // A standing figure about the origin, facing +z: boots, legs, team overalls,
  // arms at the sides, a helmet with a visor. `arms` false leaves the right arm
  // off for the lollipop man, whose arm is the pole mesh.
  function figure(out, c1, c2, arms) {
    for (const s of [-1, 1]) {
      block(out, s * 0.10, 0.05, 0.03, 0.07, 0.05, 0.12, BOOT);
      block(out, s * 0.10, 0.48, 0, 0.075, 0.38, 0.085, scale(c1, 0.8));
    }
    block(out, 0, 1.13, 0, 0.21, 0.30, 0.13, c1);                       // overalls
    block(out, 0, 1.30, 0.135, 0.15, 0.04, 0.006, scale(c2, 0.95));     // chest panel
    for (const s of arms ? [-1, 1] : [-1]) {
      block(out, s * 0.27, 1.13, 0, 0.055, 0.29, 0.065, c1);
      block(out, s * 0.27, 0.80, 0, 0.05, 0.05, 0.05, scale(SKIN, 0.9)); // glove
    }
    cyl(out, 0, 1.43, 0, 0.06, 0.07, SKIN, 8);                          // neck
    block(out, 0, 1.62, 0, 0.13, 0.14, 0.14, scale(c2, 0.9));           // helmet
    block(out, 0, 1.62, 0.135, 0.10, 0.045, 0.01, VISOR);
  }
  /* DESIGN PREVIEW LOOKS (B·G2, 2026-10-19): alternative crews behind a dev
   * switch — GarageCrew.setLook(id) or localStorage apex26.crewLook — so a
   * gallery can set them side by side. "classic" is the shipped crew above and
   * stays the default; every other look is an articulated figure (tubes between
   * joints, so a kneel or a lean is a joint table, not new geometry) baked with
   * the props it holds into ONE static mesh in bay metres, plus the lollipop. */
  const LOOKS = ["classic", "sculpted", "pitstop", "workshop", "welcome"];
  const GLOVE = [0.07, 0.07, 0.08], RUBBER = [0.035, 0.035, 0.04], ALLOY = [0.62, 0.63, 0.66];
  const GUN = [0.10, 0.10, 0.11], HOSE = [0.08, 0.08, 0.09], JACK = [0.72, 0.12, 0.08], BLANKET = [0.16, 0.16, 0.18];
  let look = "classic", lookMesh = null;
  const J0 = { foot: [0.11, 0.05, 0.03], knee: [0.11, 0.50, 0.02], hip: [0.10, 0.92, 0], pelvis: [0, 0.95, 0],
    chest: [0, 1.32, 0], neck: [0, 1.46, 0], head: [0, 1.62, 0], shoulder: [0.22, 1.38, 0],
    elbow: [0.26, 1.10, 0], hand: [0.27, 0.84, 0.03] };
  // A pose: the stand with overrides; a [l, r] pair is per side, else mirrored in x.
  const POSES = {
    stand: {},
    kneel: { footL: [0.14, 0.05, 0.40], kneeL: [0.14, 0.52, 0.38], footR: [-0.12, 0.06, -0.36], kneeR: [-0.12, 0.08, 0.06],
      hip: [0.10, 0.55, 0.04], pelvis: [0, 0.58, 0.03], chest: [0, 0.90, 0.16], neck: [0, 1.02, 0.20], head: [0, 1.16, 0.24],
      shoulder: [0.22, 0.95, 0.16], elbow: [0.20, 0.62, 0.30], hand: [0.07, 0.42, 0.46] },
    jack: { chest: [0, 1.26, 0.16], neck: [0, 1.38, 0.22], head: [0, 1.53, 0.27], shoulder: [0.22, 1.30, 0.16],
      elbow: [0.22, 1.08, 0.36], hand: [0.08, 0.92, 0.50], footL: [0.12, 0.05, 0.22], kneeL: [0.12, 0.50, 0.18] },
    carry: { shoulder: [0.22, 1.38, 0.02], elbow: [0.28, 1.12, 0.22], hand: [0.22, 1.02, 0.40] },
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
  // One articulated figure into `out`, facing +z. kit: "helmet" | "cap" (team
  // cap and headset); noArmR leaves the lollipop man's pole arm off.
  function rig(out, J, c1, c2, kit, noArmR) {
    const low = scale(c1, 0.72), band = scale(c2, 0.95);
    for (const s of ["L", "R"]) {
      const f = J["foot" + s], k = J["knee" + s], h = J["hip" + s];
      block(out, f[0], f[1], f[2] + 0.04, 0.065, 0.05, 0.12, BOOT);
      tube(out, k, f, 0.062, low, 8);
      tube(out, h, k, 0.082, c1, 8);
      block(out, k[0], k[1], k[2] + 0.06, 0.06, 0.06, 0.02, GLOVE);              // knee pad
    }
    tube(out, J.pelvis, J.chest, 0.16, c1, 10);
    tube(out, J.chest, J.neck, 0.13, c1, 10);
    const mid = [0, 1, 2].map((i) => J.pelvis[i] * 0.35 + J.chest[i] * 0.65);
    const dir = [0, 1, 2].map((i) => (J.chest[i] - J.pelvis[i]) * 0.08);
    tube(out, [mid[0] - dir[0], mid[1] - dir[1], mid[2] - dir[2]], [mid[0] + dir[0], mid[1] + dir[1], mid[2] + dir[2]], 0.166, band, 10);   // chest band
    tube(out, [J.pelvis[0], J.pelvis[1] - 0.02, J.pelvis[2]], [J.pelvis[0], J.pelvis[1] + 0.04, J.pelvis[2]], 0.165, GLOVE, 10);   // belt
    for (const s of noArmR ? ["L"] : ["L", "R"]) {
      const sh = J["shoulder" + s], el = J["elbow" + s], ha = J["hand" + s];
      tube(out, sh, el, 0.058, c1, 8);
      tube(out, el, ha, 0.05, c1, 8);
      block(out, ha[0], ha[1], ha[2], 0.045, 0.045, 0.05, GLOVE);
      block(out, sh[0], sh[1] + 0.02, sh[2], 0.07, 0.03, 0.07, band);           // shoulder panel
    }
    const H = J.head, fw = [J.head[0] - J.neck[0], 0, J.head[2] - J.neck[2]];
    const lean = Math.hypot(fw[0], fw[2]) > 0.02;
    cyl(out, J.neck[0], J.neck[1] - 0.04, J.neck[2], 0.055, 0.1, SKIN, 8);
    if (kit === "cap") {
      cyl(out, H[0], H[1] - 0.11, H[2], 0.105, 0.2, SKIN, 10);                  // face and head
      block(out, H[0], H[1] + 0.09, H[2], 0.115, 0.04, 0.115, c1);             // team cap
      block(out, H[0], H[1] + 0.065, H[2] + 0.15, 0.09, 0.01, 0.06, c1);       // its brim
      tube(out, [H[0] - 0.12, H[1], H[2]], [H[0] + 0.12, H[1], H[2]], 0.04, GLOVE, 8);   // headset cups
    } else {
      cyl(out, H[0], H[1] - 0.13, H[2], 0.14, 0.27, c2, 12);                   // helmet
      cyl(out, H[0], H[1] + 0.13, H[2], 0.10, 0.03, c2, 12);                   // its crown
      block(out, H[0], H[1] + 0.0, H[2] + 0.13 + (lean ? 0.01 : 0), 0.10, 0.045, 0.02, VISOR);
      tube(out, [H[0] - 0.141, H[1] + 0.06, H[2] - 0.02], [H[0] + 0.141, H[1] + 0.06, H[2] - 0.02], 0.035, band, 10);   // stripe
    }
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
  function frontJack(out) {
    tube(out, [0, 0.92, 0.52], [0, 0.16, 1.48], 0.03, ALLOY, 8);                     // the long handle
    block(out, 0, 0.92, 0.52, 0.16, 0.025, 0.025, JACK);                             // its T-bar
    block(out, 0, 0.14, 1.52, 0.2, 0.06, 0.12, JACK);                                // lift saddle
    for (const s of [-1, 1]) tube(out, [s * 0.17, 0.07, 1.42], [s * 0.23, 0.07, 1.42], 0.07, RUBBER, 10);
  }
  function tyre(out, c, ax, blanket, mark) {
    const a = [c[0] - ax, c[1], c[2]], b = [c[0] + ax, c[1], c[2]];
    if (blanket) {
      tube(out, a, b, 0.37, BLANKET, 16);
      tube(out, [c[0] - ax - 0.004, c[1], c[2]], [c[0] + ax + 0.004, c[1], c[2]], 0.36, BLANKET, 16);
      tube(out, [c[0] - ax * 0.25, c[1], c[2]], [c[0] + ax * 0.25, c[1], c[2]], 0.375, mark, 16);   // the compound band
    } else {
      tube(out, a, b, 0.35, RUBBER, 16);
      tube(out, [c[0] - ax - 0.006, c[1], c[2]], [c[0] + ax + 0.006, c[1], c[2]], 0.26, mark, 14);  // sidewall stripe
      tube(out, [c[0] - ax - 0.01, c[1], c[2]], [c[0] + ax + 0.01, c[1], c[2]], 0.2, ALLOY, 12);
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
  function person(dst, c1, c2, poseName, kit, x, z, yaw, prop) {
    const f = acc(), J = joints(poseName);
    rig(f, J, c1, c2, kit, false);
    if (prop) prop(f, J);
    place(dst, f, x, 0, z, yaw);
  }
  const FACE_X = (s) => s > 0 ? -Math.PI / 2 : Math.PI / 2;   // a figure at side s facing the car's centreline
  // THE LOOKS: who stands where, holding what (bay metres, car parked at 0,0).
  function buildLook(id, c1, c2) {
    const m = acc(), soft = [0.95, 0.80, 0.10], med = [0.95, 0.95, 0.95];
    const wheels = [[0.79, 1.7], [-0.79, 1.7], [0.76, -1.6], [-0.76, -1.6]];
    if (id === "pitstop") {
      for (const [wx, wz] of wheels) {
        const s = Math.sign(wx);
        person(m, c1, c2, "kneel", "helmet", wx + s * 1.05, wz, FACE_X(s), wheelGun);                // gunner
        person(m, c1, c2, "carry", "helmet", wx + s * 1.25, wz + (wz > 0 ? 0.95 : -0.95), FACE_X(s),
          (o) => tyre(o, [0, 1.0, 0.48], 0.17, false, soft));                                            // tyre on
        person(m, c1, c2, "stand", "helmet", wx + s * 1.55, wz + (wz > 0 ? -0.9 : 0.9), FACE_X(s));    // tyre off
      }
      person(m, c1, c2, "jack", "helmet", 0, 3.25 + 1.5, Math.PI, frontJack);
      person(m, c1, c2, "jack", "helmet", 0, -2.75 - 1.5, 0, frontJack);
      for (const s of [-1, 1]) person(m, c1, c2, "crouch", "helmet", s * 1.35, 0.1, FACE_X(s));        // stabilisers
    } else if (id === "workshop") {
      for (const [wx, wz] of wheels) tyre(m, [wx * 1.0, 0.345, wz], 0.215, true, wz > 0 ? soft : med); // blankets on
      person(m, c1, c2, "lean", "cap", 1.25, 0.3, -Math.PI / 2);                                        // in the cockpit
      person(m, c1, c2, "crouch", "cap", -1.55, 1.9, Math.PI / 2);                                      // at the front corner
      person(m, c1, c2, "tablet", "cap", -2.4, -1.4, Math.PI / 2 - 0.5, tablet);                        // engineer
      person(m, c1, c2, "carry", "cap", 2.6, -2.8, -Math.PI / 2 - 0.6, (o) => tyre(o, [0, 1.0, 0.48], 0.17, true, soft));
      person(m, c1, c2, "stand", "cap", 3.6, 2.2, -Math.PI / 2 - 0.4);
    } else if (id === "welcome") {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++)
        person(m, c1, c2, i === 1 ? "clap" : "cheer", i === 2 ? "cap" : "helmet", s * (2.0 + i * 0.62), 5.4 - i * 0.55, s > 0 ? Math.PI + 0.5 : Math.PI - 0.5);
      for (const s of [-1, 1]) person(m, c1, c2, "clap", "cap", s * 3.6, -3.6, FACE_X(s) + s * 0.4);
    }
    return m;
  }
  function build(liv) {
    const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
    const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.85, 0.86, 0.88]);
    const k = c1[0] * 1e6 + c1[1] * 1e3 + c1[2] + c2[0] * 7 + c2[1] * 11 + c2[2] * 13;
    const kk = k + LOOKS.indexOf(look) * 1e7;
    if (kk === key && mechMesh) return;
    free();
    key = kk;
    const classic = look === "classic", J = joints("stand");
    const m = acc(); if (classic) figure(m, c1, c2, true); else rig(m, J, c1, c2, "helmet", false);
    mechMesh = gfx.createMesh(m);
    const b = acc(); if (classic) figure(b, c1, c2, false); else rig(b, J, c1, c2, "helmet", true);
    bodyMesh = gfx.createMesh(b);
    const L = classic ? null : buildLook(look, c1, c2);
    lookMesh = L && L.idx.length ? gfx.createMesh(L) : null;
    // The lollipop: arm and pole along local +x from the shoulder, the round
    // board at the end facing ±z (toward the car), raised by a turn about z.
    const p = acc();
    block(p, 0.16, 0, 0, 0.16, 0.05, 0.06, c1);                          // upper arm
    tube(p, [0.30, 0, 0], [1.75, 0, 0], 0.016, [0.85, 0.85, 0.88], 6);   // pole
    tube(p, [1.95, 0, -0.012], [1.95, 0, 0.012], 0.24, [0.95, 0.95, 0.96], 16);   // board
    tube(p, [1.95, 0, -0.016], [1.95, 0, 0.016], 0.17, [0.86, 0.10, 0.08], 16);   // its red face
    poleMesh = gfx.createMesh(p);
  }
  function free() {
    if (!gfx || !gfx.freeMesh) return 0;
    let n = 0;
    for (const mesh of [mechMesh, bodyMesh, poleMesh, lookMesh]) if (mesh) { gfx.freeMesh(mesh); n++; }
    mechMesh = bodyMesh = poleMesh = lookMesh = null; key = -1;
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
    const mx = MECH_X0 + (MECH_X1 - MECH_X0) * back, mz = MECH_Z0 + (MECH_Z1 - MECH_Z0) * back;
    return {
      mechanics: [[-mx, mz, Math.PI / 2], [mx, mz, -Math.PI / 2]],      // [x, z, yaw]: facing the car
      lollipop: { x: cam * LOLLI_X, z: LOLLI_Z, yaw: cam > 0 ? Math.PI : 0, raise: out ? RAISED : LOWERED },
    };
  }
  function init(g) {
    if (g !== gfx) { free(); gfx = g; }
    try { const v = typeof localStorage !== "undefined" && localStorage.getItem("apex26.crewLook"); if (v && LOOKS.includes(v)) look = v; } catch (_) { /* no storage */ }
  }
  /** Dev switch for the design preview: one of LOOKS; returns the look in force. */
  function setLook(id) {
    if (LOOKS.includes(id) && id !== look) { look = id; free(); }
    return look;
  }
  function draw(liv, eye, pose, opts) {
    if (!gfx || !pose) return;
    build(liv);
    const L = layout(pose, eye && eye[0] > 0 ? 1 : -1);
    if (look === "classic" || look === "sculpted")
      for (const [x, z, yaw] of L.mechanics) gfx.draw(mechMesh, mk(x, 0, z, yaw, 0), opts || OPTS);
    if (lookMesh) gfx.draw(lookMesh, mk(0, 0, 0, 0, 0), opts || OPTS);
    const lp = L.lollipop;
    gfx.draw(bodyMesh, mk(lp.x, 0, lp.z, lp.yaw + Math.PI, 0), opts || OPTS);   // facing the garage
    // The pole from the right shoulder, across the car's path, lifted by `raise`.
    const sx = lp.x + (lp.yaw === 0 ? 0.25 : -0.25);
    gfx.draw(poleMesh, mk(sx, 1.38, lp.z, lp.yaw, lp.raise), opts || OPTS);
  }
  return Object.freeze({ init, draw, layout, free, setLook, look: () => look, LOOKS, RAISED, LOWERED });
})();
