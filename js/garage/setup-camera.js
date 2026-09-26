/* Apex 26 — the GARAGE SETUP-PREVIEW CAMERA for js/game.js (#carsetup): the turntable/orbit rig, its presets, pan and zoom, the active-aero demo, the preview mesh cache and the whole non-track render path the garage draws through — plus the #cs-view / #cs-cam-panel controls that drive it. The ROOM it renders into is js/garage/scene.js; the sheet beside it is js/garage/setup-sheet.js. */
const SetupCamera = (function () {
  "use strict";

// Read at EVAL time, exactly as js/game.js reads its own physics constants —
// the garage eases the flaps at the rates the car uses on track, so there is
// one source for them. See the HARD_EDGES pair in tools/manifest.cjs.
const { X_OPEN_RATE, X_CLOSE_RATE } = PhysicsConsts;

/** @param {*} G the js/game.js ctx façade.
 *  @param {*} deps car-drawing helpers that stay in game.js (the garage and the
 *  race share them) — the same seam js/car/car-draw.js and
 *  js/render/shared/shadow-pass.js are handed. */
function create(G, deps) {
Log.info("game", "SetupCamera.create");
// Stable bindings from the game.js closure.
const { $, gfx, clamp, getTeamParts } = G;
const { resolveLivery, partsVisualKey, drawAeroFlaps, teamDecalState, carDecalNum,
        drawCarDecals, carPaintMat, PAINT_DRY_DAY, MAT_REFLECT_X } = deps;

// A standalone, non-track, non-player render path for the #carsetup screen:
// openSetup() has no `player`/`cars` yet (makeCars() only runs at race-start),
// so the studio() rig (buildStudioRig in js/game.js) can't be reused — it hard-depends
// on player.px/track. This is the same ring-of-lamps energy math, anchored at
// the world origin instead of the player's track position.
let setupPreviewAz = 0.6;
// Preview CAMERA state. The turntable used to be the only way to see the car:
// one fixed height, one fixed distance, spinning left whether you wanted it to
// or not, so inspecting the part you just bought meant waiting for it to come
// back around. az/el/dist are now a real orbit the player drives (drag on the
// canvas, wheel/pinch to zoom, preset chips in #cs-view), and SPIN is a toggle
// over the top of it rather than the whole interaction.
// Defaults reproduce the previous framing: eye y 2.0 at dist 8.35 over a
// target at y 0.35 is an elevation of atan2(1.65, 8.5) — el unchanged, a hair
// closer after the WGX garage fix shipped.
const SP_EL_DEF = Math.atan2(1.65, 8.5), SP_DIST_DEF = 8.35;
// Half the car's BROADSIDE footprint (~5.95 m drawn) plus ~5% margin.
// Was 3.35 (~12%), then 3.15 after honest WGX off-axis projection. 3.10 is a
// hair closer on desktop after the view-matrix fix landed (1440x900 ~8.40 m).
const SP_FIT_HALF_W = 3.10;
// How far the AUTOMATIC turntable may back off. Deliberately under the MANUAL
// zoom ceiling SP_DIST_MAX: a player who zooms out that far asked for the wide
// shot, whereas the auto fit reaching it means the fit diverged. garage-scene.js
// notes a camera at 15 m "is outside the bay on at least one axis nearly
// always"; 11 keeps the swing inside the door/back walls (Z +/-6.4) at the
// default elevation with real headroom over the 8.5 m default framing.
const SP_FIT_DIST_MAX = 11;
// The garage environment — bay shell, truss, LED fixtures, pit equipment, team
// dress, floor and light rig — lives in js/garage/scene.js. It owns the
// frame clear colour too: every surface in there fades to exactly BACKDROP at
// its far edge, so the room has no silhouette against the void.
let setupPreviewEl = SP_EL_DEF, setupPreviewDist = SP_DIST_DEF;
let setupPreviewSpin = true;
// GARAGE active-aero demo. `setupPreviewXOn` is the button; `setupPreviewAeroX`
// is the flap TRAVEL that the draw reads, eased toward it at the same rates the
// car uses on track — so the garage shows the wings MOVING, at the real speed,
// rather than snapping between two poses.
let setupPreviewXOn = false, setupPreviewAeroX = 0;
// Orbit limits: never underneath the floor plane, never past straight down, and
// close enough to read a decal without clipping into the nose.
const SP_EL_MIN = 0, SP_EL_MAX = 1.30, SP_DIST_MIN = 4.6, SP_DIST_MAX = 15, SP_DIST_FREE_MIN = 0.3;
// az 0 = ahead of the nose (+Z), PI = behind the wing; see the eye vector below.
// Distances are per-view because the car is 5.4 m long and 1.9 m wide, and the
// sheet takes the right ~40% of the canvas: head-on it fits close, broadside it
// does not. SIDE and TOP get the extra pull-back their aspect actually needs
// rather than one nominal distance that crops the nose off two of the five.
const SP_VIEWS = {
  hero:  { az: Math.PI * 0.78, el: 0.30, dist: 8.35 },   // rear three-quarter
  // A SURVEY FRAMING IS NOT A GAME PRESET. `bay` / `bayFront` lived here with
  // no #cs-stack button — production data carrying a shot tool's camera. They
  // are `az` / `el` / `dist` parameters now (garage-angles CAM_ALIAS), which
  // also lets the tool sweep between them; anything a PLAYER can pick belongs
  // in this table, and everything else is a parameter.
  front: { az: 0,              el: 0.20, dist: 8.2 },
  side:  { az: Math.PI * 0.5,  el: 0.10, dist: 11.2 },
  rear:  { az: Math.PI,        el: 0.22, dist: 8.4 },
  top:   { az: Math.PI * 0.5,  el: 1.20, dist: 11.5 },
  // WING views: framed for watching the active-aero flaps travel. Both are
  // deliberately three-quarter, never head-on — the flaps rotate about the
  // car's X axis, so a dead-on view looks straight down that axis and hides
  // the travel. `aim` names the wing the camera orbits (see setSetupView);
  // `minDist` lets them sit closer than the whole-car floor. Distances come
  // from the frustum (36 deg vertical fov, ~62% usable canvas width at the
  // target), tightened ~20% from the frustum floor — the flap travel is the
  // subject, and a little wing-tip crop reads better than a few-pixel flap.
  wingFront: { az: Math.PI * 0.30, el: 0.34, dist: 3.6, aim: "front", minDist: 2.0 },
  wingRear:  { az: Math.PI * 0.72, el: 0.36, dist: 2.8, aim: "rear",  minDist: 1.8 },
};
// The point the preview camera ORBITS and LOOKS AT. The defaults reproduce the
// previous hard-coded numbers exactly (eye was offset -1.0 in z from a target at
// z 0), so every existing view is unchanged; only the wing presets move them.
// ORBIT AND AIM ARE THE SAME POINT, AND IT IS THE CAR'S CENTRE. These used to
// be [0, 0.35, -1.0] and [0, 0.35, 0] — a camera circling a point 1 m BEHIND
// the one it looked at, swinging the car across the frame instead of rotating
// it in place. The drawn body spans z -2.69..3.18 (measured), so its centre
// is z +0.245, not 0 and not -1.
const SP_CAR_CTR = [0, 0.45, 0.245];
const SP_ORBIT_DEF = SP_CAR_CTR.slice(), SP_TGT_DEF = SP_CAR_CTR.slice();
let setupPreviewOrbit = SP_ORBIT_DEF.slice(), setupPreviewTgt = SP_TGT_DEF.slice();
let setupPreviewMinDist = 0, setupPreviewFree = false;   // 0 = use the global SP_DIST_MIN; free = a dev shot may leave the player's range
// The player's orbit floor is 0 (never under the car) and a view's minDist; a
// survey tool asking to look UP at a wing from the floor needs neither, and
// setSetupFree lifts both until the next preset. Nothing the player can reach.
const spElMin = () => (setupPreviewFree ? -SP_EL_MAX : SP_EL_MIN);
const spDistMin = () => (setupPreviewFree ? SP_DIST_FREE_MIN : (setupPreviewMinDist || SP_DIST_MIN));
// Last frame's RESOLVED framing, for __apex.garageCam(). Read-only telemetry.
let _spEffDist = 0, _spEffFit = 0, _spEffPanel = 0;
// THE GARAGE'S CLOCK. The bay's washer flickers on three sines of whatever
// clock live() gets, so under performance.now() two captures at different WALL
// instants light the room differently — a held render clock did not hold the
// garage. Measurements: tools/shot/garage-angles.mjs header.
function garageNow() { return G.skyHold ? G.skyT * 1000 : performance.now(); }
// PAN — a translation of the whole rig (orbit centre AND look-at) in car-local
// metres. Orbit and zoom alone can only ever circle the same point, so there is
// no way to walk along the car and study one end of it up close; you can only
// back off until the whole car fits. Pan is what makes the preview a camera you
// move rather than a turntable you watch.
let setupPreviewPan = [0, 0, 0];
const _spAim = [0, 0, 0];
// Bounds are a box around the car (~5.4 m long, ~1.9 m wide), sized so you can
// reach past either end and either flank but not lose the car off screen.
const SP_PAN_X = 2.2, SP_PAN_Z = 3.4;
// Mid-chord of one flap, in car-local metres — what a wing view aims at. Read
// from the same Car3D anchors the flaps are drawn from, so the framing follows
// the player's own AERO part instead of a fixed guess.
function flapAimPoint(which) {
  const aSt = teamDecalState(Teams.LIST[G.teamIdx], true);
  return Car3D.aeroFlapAim(aSt.val, which, aSt.aero);
}
function setSetupView(name) {
  const v = SP_VIEWS[name];
  if (!v) return;
  GarageScene.spot(name);   // the work lamp wheels over to what the preset frames
  setupPreviewFree = false;   // a preset is the player's range again
  setupPreviewAz = v.az; setupPreviewEl = v.el; setupPreviewDist = v.dist;
  // A preset is an absolute framing, so it also drops any pan the player had
  // walked in — otherwise "show me the rear wing" shows them the rear wing plus
  // whatever two metres of offset they were still carrying.
  setupPreviewPan[0] = setupPreviewPan[1] = setupPreviewPan[2] = 0;
  if (v.aim) {
    // Orbit AND look at the flap itself, so the wing stays centred at every
    // turntable angle instead of swinging out of frame the way a car-centred
    // orbit does once you are 2.5 m away.
    const p = flapAimPoint(v.aim);
    setupPreviewOrbit = p.slice(); setupPreviewTgt = p.slice();
    setupPreviewMinDist = v.minDist || 0;
  } else {
    setupPreviewOrbit = SP_ORBIT_DEF.slice(); setupPreviewTgt = SP_TGT_DEF.slice();
    setupPreviewMinDist = 0;
  }
  // Picking a view means "hold it there" — leaving the turntable running would
  // immediately rotate away from the angle that was just asked for.
  setSetupSpin(false);
}
function setSetupSpin(on) {
  setupPreviewSpin = !!on;
  const b = $("cs-view-spin");
  // `active` drives the lit style (and is what AriaState reads); the attribute
  // is set here too so the state is correct before AriaState's observer fires.
  if (b) {
    b.classList.toggle("active", setupPreviewSpin);
    b.setAttribute("aria-pressed", String(setupPreviewSpin));
  }
}
// Ease the garage flaps at the SAME asymmetric rates the car uses on track (see
// X_OPEN_RATE / X_CLOSE_RATE) — the snap-shut is half the character of the
// system, and a garage that opened and closed at one speed would missell it.
// Its own function so the frame loop and __apex.garageStep() cannot drift: the
// preview animation was previously reachable ONLY from inside the rAF render,
// which made it untestable, and an untested animation is one you find out about
// from a player.
function stepSetupAero(dt) {
  const want = setupPreviewXOn ? 1 : 0;
  const rate = want > setupPreviewAeroX ? X_OPEN_RATE : X_CLOSE_RATE;
  const step = rate * Math.min(dt, 1 / 20);
  setupPreviewAeroX = clamp(setupPreviewAeroX + Math.sign(want - setupPreviewAeroX) * step,
                            Math.min(setupPreviewAeroX, want), Math.max(setupPreviewAeroX, want));
}
function setSetupAero(on) {
  const was = setupPreviewXOn;
  setupPreviewXOn = !!on;
  // Switching X-mode ON from the untouched turntable AIMS at the rear wing.
  // The flaps rotate about the car's X axis, so the turntable's own three-quarter
  // sweep and the FRONT/REAR presets all look very nearly along that axis, where
  // a 36-degree sweep projects to almost nothing. Pressing the button and seeing
  // the car not move is the single most common way to conclude this feature is
  // broken — and it is what happened. `spin` is the "I have not aimed anything"
  // state, so a player who HAS chosen an angle keeps it.
  // The threshold is DISTANCE, not just the turntable. At the whole-car framing
  // (8.5 m) the rear wing's 135 mm of travel projects to about TEN PIXELS on a
  // landscape phone — the motion is real and simply cannot be seen, which is
  // indistinguishable from a broken feature and was reported as one. The wing
  // preset sits at 2.8 m, where the same travel is ~30 px and the slot visibly
  // opens. A player already close in on something has aimed deliberately, so
  // they keep their shot.
  if (setupPreviewXOn && !was && (setupPreviewSpin || setupPreviewDist > 5)) setSetupView("wingRear");
  const b = $("cs-aero");
  if (b) {
    // `active` drives the lit style (and is what AriaState reads); the attribute
    // is set here too so the state is correct before AriaState's observer fires.
    b.classList.toggle("active", setupPreviewXOn);
    b.setAttribute("aria-pressed", String(setupPreviewXOn));
    const v = b.querySelector(".cs-aero-val");
    if (v) v.textContent = setupPreviewXOn ? "X-MODE" : "Z-MODE";
  }
}
function setupZoom(mul) {
  setupPreviewDist = clamp(setupPreviewDist * mul, spDistMin(), SP_DIST_MAX);
}
// Move the rig sideways / along the car, in the SCREEN's frame rather than the
// car's: "left" has to mean left as seen, or the control inverts itself as soon
// as the turntable carries you past the nose. At azimuth `az` the camera's
// horizontal right vector is (cos az, 0, -sin az) and its forward is
// (-sin az, 0, -cos az); strafe and dolly ride those.
function setupPan(strafe, dolly) {
  if (!strafe && !dolly) return;
  const ca = Math.cos(setupPreviewAz), sa = Math.sin(setupPreviewAz);
  setupPreviewPan[0] = clamp(setupPreviewPan[0] + strafe * ca - dolly * sa, -SP_PAN_X, SP_PAN_X);
  setupPreviewPan[2] = clamp(setupPreviewPan[2] - strafe * sa - dolly * ca, -SP_PAN_Z, SP_PAN_Z);
  // Panning is aiming. Leaving the turntable running would immediately carry the
  // camera away from whatever was just framed, exactly as picking a view does.
  setSetupSpin(false);
}
// One discrete step of the on-screen orbit controls (keyboard activation).
function nudgeSetupCam(dAz, dEl, zoom) {
  if (dAz) { setupPreviewAz += dAz; setSetupSpin(false); }
  if (dEl) { setupPreviewEl = clamp(setupPreviewEl + dEl, spElMin(), SP_EL_MAX); setSetupSpin(false); }
  if (zoom) setupZoom(zoom);
}
// A HELD control, as per-second rates applied by the frame loop. This started as
// a setInterval and read as a stutter: the render loop saturates the main thread
// under software GL, so a 55 ms timer was only serviced every ~240 ms. Rates on
// the frame clock are smooth at any frame rate and correct on a fast machine
// too, where a fixed timer would instead have moved in visible jumps.
let spHeld = null;   // {az, el, zoom, strafe, dolly} — per second
const SP_RATE = { az: 1.8, el: 1.0, zoom: 2.4, pan: 1.5 };
function applyHeldSetupCam(dt) {
  if (!spHeld) return;
  if (spHeld.az) { setupPreviewAz += spHeld.az * dt; setSetupSpin(false); }
  if (spHeld.el) {
    setupPreviewEl = clamp(setupPreviewEl + spHeld.el * dt, SP_EL_MIN, SP_EL_MAX);
    setSetupSpin(false);
  }
  if (spHeld.zoom) setupZoom(Math.pow(spHeld.zoom, dt));
  if (spHeld.strafe || spHeld.dolly)
    setupPan((spHeld.strafe || 0) * dt, (spHeld.dolly || 0) * dt);
}
function resetSetupCam() {
  setupPreviewAz = 0.6;
  setupPreviewEl = SP_EL_DEF;
  setupPreviewDist = SP_DIST_DEF;
  setupPreviewPan[0] = setupPreviewPan[1] = setupPreviewPan[2] = 0;
  // …and the FRAMING, which az/el/dist do not carry. A WING or BRAKES preset
  // aims the camera by moving the orbit point and the look-at (setSetupAim /
  // garageFrame) and tightens minDist; resetting only the three angles left the
  // turntable spinning about the wing with a close-up minimum, which is exactly
  // the "reopened on somebody's last drag" state this reset exists to prevent.
  setupPreviewOrbit = SP_ORBIT_DEF.slice();
  setupPreviewTgt = SP_TGT_DEF.slice();
  setupPreviewMinDist = 0;
  setupPreviewFree = false;
  setSetupSpin(true);
}
// Rebuild-on-change only (not per-frame): keyed by team + resolved parts tiers,
// mirroring the playerBodyMesh/cockpitBodyMesh cache-key pattern. The meshes
// live in GarageScene's six-slot LRU, which frees what it evicts — no leak.
let _spMesh = null, _spMeshKey = "", _spHull = null;
// Which livery fields can MOVE a vertex, as opposed to only recolouring one.
// Measured (tests/unit/setup-preview-hull.test.mjs builds the car both ways and
// compares positions byte for byte): a hue change never moves anything, and only
// the PRESENCE of these four does — they gate optional strip geometry. finShape
// is the one non-colour entry: it picks the shark fin's outline (or no fin).
// coverVents and spineHeight are the other enums that move a vertex, and
// spineSide moves the service panels aft of its flank band.
const SP_HULL_GEOM_FIELDS = ["stripe", "noseStripe", "nose", "pod", "finShape", "coverVents", "spineHeight", "spineSide"];
// The key carries the livery ID, not its colours: a paint edit drops EVERY cached car.
function spMeshBust() { _spMeshKey = ""; GarageScene.dropPreviewMeshes(); }
function garageSeat() {
  const team = Teams.LIST[G.teamIdx];
  const seats = (typeof Career !== "undefined" && Career.gridDrivers)
    ? (Career.gridDrivers(team) || team.drivers) : team.drivers;
  return (seats && seats[G.driverIdx]) || (seats && seats[0]) || null;
}
function getSetupPreviewMesh() {
  const team = Teams.LIST[G.teamIdx];
  // driverIdx, not drivers[0]: the turntable shows YOUR car, so it wears the
  // helmet of the seat you picked. In the key too, or switching seats keeps
  // the mesh you were already looking at. Career.gridDrivers() is the MY TEAM
  // pair when a second driver is hired.
  const seat = garageSeat();
  const key = team.id + ":" + partsVisualKey(team.id) + ":" + (seat && seat.num);
  if (key !== _spMeshKey) {
    const liv = resolveLivery(team);
    // The hull depends on POSITIONS ONLY: keyed on the geometry-gating fields, it
    // survives the per-value colour-drag busts livePreviewDraft issues.
    const hullKey = key + "|" + SP_HULL_GEOM_FIELDS.map((f) => (typeof liv[f] === "string" ? liv[f] : liv[f] ? 1 : 0)).join(",");
    const ent = GarageScene.previewMesh(key, hullKey, () => Car3D.build(liv.c1, liv.c2, {
      livery: liv,
      teamId: team.id,   // per-team chassis style shows in the setup turntable too
      num: seat && seat.num,
      parts: Parts.getVisualTiers(getTeamParts(team.id), team),
    }));
    _spMesh = ent.mesh; _spHull = ent.hull;   // hull: silhouette proxy for the turntable re-centre
    _spMeshKey = key;
  }
  return _spMesh;
}
// The ROOM's view of the game beyond the car (GarageScene.draw's ctx): the
// circuit the next race runs at — the career's calendar, the free-play season's,
// else the picker's — its weather and hour, and the career's tally for the wall.
function garageCtx() {
  const c = Career.inCareer() ? Career.data() : null;
  const t = c ? Tracks.SEASON[c.season.round % Tracks.SEASON.length]
          : (G.seasonMode && G.season) ? SeasonCal.track(G.season.round) : Tracks.LIST[G.trackIdx];
  return { track: t, weather: G.raceWeather, tod: G.raceTimeOfDay,
           night: G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && !!(t && t.night)),
           wins: c ? c.results.filter((r) => r.p === 1).length : 0,
           last: c && c.results.length ? c.results[c.results.length - 1] : null,
           sponsor: c ? Career.sponsor() : null, career: !!c, round: c ? c.season.round : 0, spin: setupPreviewSpin };
}
const _spProj = new Float32Array(16), _spView = new Float32Array(16), _spVP = new Float32Array(16);
const _spInvProj = new Float32Array(16);
const _spLiv = () => resolveLivery(Teams.LIST[G.teamIdx]);   // memoised on store.rev
// Bloom lower and hotter than the race default: the ceiling panels ARE the
// subject. ssao needs the proj/invProj pair passed to begin(); contact shadows
// would additionally need sunViewDir, and the sun is now only a fill.
const SP_PRESENT = { exposure: 1.28, bloom: 0.70, threshold: 0.62, contact: 0 };
function renderSetupPreview(dt) {
  gfx.resize();
  applyHeldSetupCam(dt);                               // held on-screen controls
  if (setupPreviewSpin) setupPreviewAz += dt * 0.35;   // slow turntable
  stepSetupAero(dt);
  // The orbit radius is horizontal, so raising the camera does not walk it away
  // from the car: at el 0 this is the old fixed ring, at el 1.2 it is overhead.
  const spCe = Math.cos(setupPreviewEl), spSe = Math.sin(setupPreviewEl);
  // The docked #cs-inner panel covers the right portion of the canvas, so the
  // car only ever gets (1 - panelFrac) of the frustum. Read the panel's live
  // pixel width so this tracks every breakpoint/viewport automatically.
  // WHICH WAY DOES THE PANEL LEAVE ROOM? It docks to the RIGHT on a wide screen
  // and to the TOP on a tall one, because a portrait phone has no width to give
  // and plenty of height — so the gap the car gets is either beside the panel or
  // below it. Measure both and shift along the axis that actually has the room;
  // shifting the wrong one is what left the car invisible behind a full-width
  // sheet in portrait.
  const canvasEl = $("game"), panelEl = $("cs-inner");
  let panelFrac = 0, panelFracY = 0;
  if (canvasEl && panelEl && canvasEl.clientWidth > 0 && canvasEl.clientHeight > 0) {
    // Visual coverage vs the unzoomed canvas (A13). viewportRect scales up on
    // engines where gBCR is still local under CSS zoom.
    const pr = (window.CssZoom && CssZoom.viewportRect(panelEl)) || panelEl.getBoundingClientRect();
    const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight;
    if (cw - pr.width >= ch - pr.height) panelFrac = clamp(pr.width / cw, 0, 0.85);
    else {
      // Portrait: centre the car in what is left between the sheet and the OPEN
      // camera panel (bottom of the same gap), not behind the buttons that aim it.
      const cam = $("cs-cam-panel"), camTop = cam && !cam.hidden && cam.offsetParent !== null
        ? ((window.CssZoom && CssZoom.viewportRect(cam)) || cam.getBoundingClientRect()).top : ch;
      panelFracY = clamp((pr.bottom + Math.min(camTop, ch) - ch) / ch, 0, 0.85);
    }
  }
  // FIT THE VISIBLE REGION, NOT THE WHOLE CANVAS. SP_DIST_DEF was chosen so the
  // car cleared the full frustum — but a third of that frustum is behind the
  // panel, so the turntable put the front wing off the left edge and the rear
  // wing under the panel every time it swung broadside (measured at 1440x900).
  // Two numbers in the old note were wrong: the drawn car is ~5.95 m across at
  // broadside, not 5.4 m (the wings are the wide part), and the margin has to
  // come out of the VISIBLE half-width. Hold the turntable at whatever distance
  // keeps that inside it. Only the AUTOMATIC view self-frames — picking a preset
  // or zooming clears setupPreviewSpin, and from there the distance is theirs.
  // THIS BACKS OFF WITHOUT BOUND. The visible half-angle is
  // atan(tan18 * aspect * (1 - panelFrac)), so as the region narrows the
  // distance diverges, and the only thing stopping it was the MANUAL zoom's
  // SP_DIST_MAX. Measured at 900x820 with the panel over half the width: the
  // fit asks for 17.6 m and pins on 15 — outside the bay's 5.4 m side wall, the
  // near wall culled away, the car a small object in a dollhouse of the whole
  // garage. That is the reported "the camera is further back and rotates around
  // the outside of the room". Cap the AUTO fit; past it, crop the wings at
  // broadside rather than leave the room. Only the viewports that were PINNED
  // move (1440x900, 1280x800 and 844x390 are unchanged to 2 dp).
  //
  // panelFracY is NOT a term here and that is not the oversight it looks like:
  // it constrains the car's on-screen HEIGHT (~1.8 m projected against 6.7 m
  // wide), so the horizontal axis binds everywhere. Fitting the half-WIDTH
  // against the vertical half-angle was tried and measured wrong — a constant
  // 10.31 m floor that pushed 1440x900 from 9.10 to 10.31.
  const spFitD = Math.min(SP_FIT_DIST_MAX,
    SP_FIT_HALF_W / Math.max(Math.tan(18 * Math.PI / 180) * gfx.aspect * (1 - panelFrac), 0.05));
  const spDist = setupPreviewSpin
    ? clamp(Math.max(setupPreviewDist, spFitD), SP_DIST_MIN, SP_DIST_MAX) : setupPreviewDist;
  // Publish what the camera USES: garageCam() reported setupPreviewDist, which
  // is the effective distance only when the turntable is off — so on the auto
  // path, the one that can misframe, it read 8.5 while the camera sat at 15.
  _spEffDist = spDist; _spEffFit = spFitD; _spEffPanel = panelFrac;
  // PAN shifts the orbit centre and the look-at together, so strafing tracks
  // along the car instead of swinging the aim off it — the difference between
  // "walk down the flank" and "turn your head at the far end of the pit box".
  const eye = [setupPreviewOrbit[0] + setupPreviewPan[0] + Math.sin(setupPreviewAz) * spDist * spCe,
               setupPreviewOrbit[1] + setupPreviewPan[1] + spDist * spSe,
               setupPreviewOrbit[2] + setupPreviewPan[2] + Math.cos(setupPreviewAz) * spDist * spCe];
  M4.perspectiveTo(_spProj, 36 * Math.PI / 180, gfx.aspect, 0.1, 60);
  // An on-axis camera centers the car behind the panel, half-cropped. Shift the
  // frustum (off-axis / "lens shift") so the car renders centered in the VISIBLE
  // region instead — sideways when the panel is docked to an edge, downwards
  // when it sits across the top. col2 row0 shifts NDC.x, col2 row1 shifts NDC.y;
  // in both cases a positive value moves the image the OTHER way, which is why
  // the car ends up at -frac, the centre of the gap the panel is not covering.
  _spProj[8] = panelFrac;
  _spProj[9] = panelFracY;
  _spAim[0] = setupPreviewTgt[0] + setupPreviewPan[0];
  _spAim[1] = setupPreviewTgt[1] + setupPreviewPan[1];
  _spAim[2] = setupPreviewTgt[2] + setupPreviewPan[2];
  M4.lookAtTo(_spView, eye, _spAim, [0, 1, 0]);
  M4.mulTo(_spVP, _spProj, _spView);
  GarageScene.recentre(_spProj, _spView, _spVP, panelFrac, setupPreviewSpin, _spHull);
  M4.invertTo(_spInvProj, _spProj);
  if (gfx.begin({
    // Sun with NO sideways component. The shark fin is a thin blade whose two
    // flanks carry opposite normals (+X and -X), so any X in the sun direction
    // lights one face and leaves the other on ambient — the same badge came out
    // two different shades depending on which side you orbited to. On a thick
    // body that asymmetry is correct; on a blade being inspected in a showroom
    // it just reads as a bug. Front-and-above keeps the modelling (the ring of
    // studio lamps below is already symmetric) without favouring a side.
    // The sun is now a SKYLIGHT — a soft roof fill, not the key. See
    // GarageScene.SKYLIGHT: no lamp can contribute more than 1/17 of albedo, so
    // as long as the sun stayed at full white it owned the picture and the bay's
    // ten fixtures were decoration. proj/invProj are what unlock SSAO in
    // present(), and an interior lives or dies on its corner darkening.
    viewProj: _spVP, view: _spView, eye, sunDir: [0, 0.86, 0.51], sunColor: GarageScene.SKYLIGHT,
    ambientSky: GarageScene.AMB_SKY, ambientGround: GarageScene.AMB_GROUND,
    fogColor: GarageScene.BACKDROP, fogDensity: 0, lights: GarageScene.live(_spLiv(), garageNow(), garageCtx()),
    proj: _spProj, invProj: _spInvProj,
    noEnv: true,   // probe-less preview: matte paint, never mirror a stale race cube
  }) === false) return;
  const spMat = carPaintMat(PAINT_DRY_DAY);
  spMat.sparkle = 0.12;   // near-kill the metallic-flake glitter so the slow turntable doesn't "twinkle"
  // Matte preview: the glossy clear-coat + sharp speculars from the studio ring
  // lights bloom across the bodywork and wash the livery out to a pale sheen.
  // Soften them here so the setup screen shows the TRUE livery colour. This is a
  // preview-only override — the in-race PAINT_* materials are untouched, so the
  // car still reads glossy on track.
  spMat.clearcoat = 0.1;
  spMat.specular = 0.22;
  spMat.roughness = clamp(spMat.roughness * 2.4, 0.02, 1);   // spread + dim the speculars
  spMat.metalness = Math.min(spMat.metalness, 0.05);
  GarageScene.draw(Teams.LIST[G.teamIdx], _spLiv(), eye, getTeamParts, G.driverIdx, garageCtx(), getSetupPreviewMesh());
  gfx.draw(getSetupPreviewMesh(), MAT_REFLECT_X, spMat);
  // The moveable wings, so a player can watch active aero work before ever
  // driving — and see what their own AERO parts choice did to the flap size.
  {
    const aSt = teamDecalState(Teams.LIST[G.teamIdx], true);
    drawAeroFlaps(Teams.LIST[G.teamIdx], aSt.val, setupPreviewAeroX, MAT_REFLECT_X, spMat,
      aSt.aero);
  }
  // `night` here means "the sun is not the key" — which in a garage it is not.
  // The decal shader is sun + ambient + glow only, so without this the liveries'
  // logos and numbers would darken with the skylight and nothing would lift them.
  const gSeat = garageSeat();
  drawCarDecals(Teams.LIST[G.teamIdx], MAT_REFLECT_X, true,
    (gSeat && gSeat.num) || carDecalNum(Teams.LIST[G.teamIdx], null), false, true);
  // AFTER the car: glare billboards are additive with depth-write off, so drawn
  // any earlier the opaque car would paint straight over them — and at high
  // elevation the ceiling fixtures sit between the eye and the car.
  gfx.drawGlow(GarageScene.live(_spLiv(), garageNow(), garageCtx()), GarageScene.glareStr());
  gfx.present(SP_PRESENT);
}

// ---- the #cs-view / #cs-cam-panel controls ----
// The chips in #cs-view, plus orbit-by-drag and zoom on the canvas itself. All
// of it is gated on G.setupPreviewOn, so none of these listeners can touch the
// camera during a race — the canvas is shared with the track render and, on
// touch, with the steering.
// ---- the CAMERA disclosure ----
// The panel holds the whole camera set; only CAMERA and ACTIVE AERO show at
// rest. Closing is driven by INTENT, not by "a click happened": a preset is an
// aim-and-leave choice so it closes, while MOVE/zoom/SPIN repeat and must not
// pull the panel out from under the finger mid-adjustment.
function setSetupCamPanel(open) {
  const b = $("cs-cam"), p = $("cs-cam-panel");
  if (!b || !p) return;
  p.hidden = !open;
  b.setAttribute("aria-expanded", open ? "true" : "false");
}
const setupCamPanelOpen = () => !$("cs-cam-panel").hidden;
$("cs-cam").onclick = () => {
  setSetupCamPanel(!setupCamPanelOpen());
  if (G.soundOn) GameAudio.uiTick();
};
// Outside-click and Escape, the two ways every disclosure is expected to shut.
// Pointerdown rather than click so a drag STARTING on the car closes the panel
// before the orbit begins, instead of leaving it hanging over the car you are
// now turning.
document.addEventListener("pointerdown", (e) => {
  if (!G.setupPreviewOn || !setupCamPanelOpen()) return;
  if (!e.target.closest || !e.target.closest("#cs-stack")) setSetupCamPanel(false);
}, true);
// AN INNER DISCLOSURE CLAIMS ESCAPE BEFORE ITS SCREEN DOES. The generic layer
// handler in js/ui/modal.js is on document/capture and bails on an event
// already marked handled; this one must run before it (see below). stopPropagation alone did NOT mark it: it stops the
// event descending but says nothing to a sibling listener on this same node, so
// preventDefault is what actually keeps Escape from ALSO pressing the GARAGE's
// BACK button and closing the screen behind the panel.
// ON WINDOW, NOT DOCUMENT. Since the extraction this registers when game.js
// calls create(), which can be after js/ui/modal.js has registered its own
// document/capture Escape handler — and then modal ran FIRST and pressed the
// garage's BACK (cs-back) with the panel open. Window capture precedes every
// document listener whatever the registration order, so the inner disclosure
// always claims the key first (parts-setup-ids.spec.js "the panel starts shut…").
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && G.setupPreviewOn && setupCamPanelOpen()) {
    setSetupCamPanel(false);
    e.preventDefault();
    e.stopPropagation();   // don't also close the GARAGE behind it
  }
}, true);

for (const btn of document.querySelectorAll("#cs-stack [data-cs-view]")) {
  btn.onclick = () => {
    setSetupView(btn.dataset.csView);
    setSetupCamPanel(false);
    if (G.soundOn) GameAudio.uiTick();
  };
}
$("cs-view-spin").onclick = () => { setSetupSpin(!setupPreviewSpin); if (G.soundOn) GameAudio.uiTick(); };
$("cs-view-reset").onclick = () => { resetSetupCam(); if (G.soundOn) GameAudio.uiTick(); };
// Hold a control to move continuously; the frame loop reads spHeld. A camera
// control that only moves on click is one you have to jab at twenty times to get
// round the car, so press-and-hold is the primary interaction and the discrete
// step is what a keyboard activation gets.
function holdSetupCtl(id, rates, step) {
  const el = $(id);
  if (!el) return;
  const release = () => { if (spHeld === rates) spHeld = null; };
  el.addEventListener("pointerdown", (e) => {
    if (!G.setupPreviewOn) return;
    e.preventDefault();
    // Capture so a finger sliding off the chip still releases here. NOT
    // pointerleave for the release: setPointerCapture fires a boundary event as
    // it retargets, which would stop the motion on its very first frame.
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* capture can refuse (pointer already gone); the drag still runs on move events */ }
    // One discrete step up front, THEN the held rate. Without the step a quick
    // tap moved by whatever fraction of a frame it happened to span — i.e.
    // visibly nothing — so the buttons only worked if you knew to hold them.
    step();
    spHeld = rates;
    if (G.soundOn) GameAudio.uiTick();
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, release);
  window.addEventListener("pointerup", release);
  // Enter/Space activate as a click with detail 0 and never send a pointerdown,
  // so the keyboard gets a discrete nudge rather than nothing at all.
  el.addEventListener("click", (e) => { if (e.detail === 0) step(); });
}
holdSetupCtl("cs-view-in",    { zoom: 1 / SP_RATE.zoom }, () => nudgeSetupCam(0, 0, 1 / 1.12));
holdSetupCtl("cs-view-out",   { zoom: SP_RATE.zoom },     () => nudgeSetupCam(0, 0, 1.12));
holdSetupCtl("cs-view-left",  { az: -SP_RATE.az },        () => nudgeSetupCam(-0.18, 0, 0));
holdSetupCtl("cs-view-right", { az: SP_RATE.az },         () => nudgeSetupCam(0.18, 0, 0));
holdSetupCtl("cs-view-up",    { el: SP_RATE.el },         () => nudgeSetupCam(0, 0.12, 0));
holdSetupCtl("cs-view-down",  { el: -SP_RATE.el },        () => nudgeSetupCam(0, -0.12, 0));
holdSetupCtl("cs-pan-left",   { strafe: -SP_RATE.pan },   () => setupPan(-0.15, 0));
holdSetupCtl("cs-pan-right",  { strafe: SP_RATE.pan },    () => setupPan(0.15, 0));
holdSetupCtl("cs-pan-fwd",    { dolly: SP_RATE.pan },     () => setupPan(0, 0.15));
holdSetupCtl("cs-pan-back",   { dolly: -SP_RATE.pan },    () => setupPan(0, -0.15));
$("cs-aero").onclick = () => { setSetupAero(!setupPreviewXOn); if (G.soundOn) GameAudio.uiTick(); };
{
  const canvas = $("game");
  // Live pointers by id, so a two-finger pinch is separable from a one-finger
  // orbit without a separate touch-event path.
  const spPtr = new Map();
  let spPinch = 0;
  const pinchGap = () => {
    const p = [...spPtr.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  if (canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (!G.setupPreviewOn) return;
      spPtr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      spPinch = pinchGap();
      // Taking hold of the car is itself the instruction to stop the turntable —
      // dragging against a rotation that keeps adding to your input is horrible.
      if (spPtr.size === 1) setSetupSpin(false);
    });
    window.addEventListener("pointermove", (e) => {
      if (!G.setupPreviewOn || !spPtr.has(e.pointerId)) return;
      const p = spPtr.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (spPtr.size >= 2) {
        // Pinch: the gap between the two fingers drives distance directly.
        const gap = pinchGap();
        if (spPinch > 0 && gap > 0) setupZoom(spPinch / gap);
        spPinch = gap;
        return;
      }
      // Drag: horizontal spins, vertical raises/lowers. Scaled by viewport width
      // so the same swipe travels the same arc on a phone and on a desktop.
      const span = Math.max(1, canvas.clientWidth);
      setupPreviewAz -= dx * (Math.PI * 1.6) / span;
      setupPreviewEl = clamp(setupPreviewEl + dy * (Math.PI * 0.9) / span, SP_EL_MIN, SP_EL_MAX);
    });
    const release = (e) => {
      spPtr.delete(e.pointerId);
      spPinch = pinchGap();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    canvas.addEventListener("wheel", (e) => {
      if (!G.setupPreviewOn) return;
      e.preventDefault();
      setupZoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }
}

// The camera's own state, published for the G façade (js/game.js keeps the
// spellings __apex.garageCam() and types/game-ctx.d.ts already name).
return {
  renderSetupPreview, resetSetupCam, setSetupCamPanel, spMeshBust,
  stepSetupAero, setSetupView, setSetupAero, setupPan, nudgeSetupCam,
  setSetupAim(p) { setupPreviewOrbit = p.slice(); setupPreviewTgt = p.slice(); },
  setSetupFree(on) { setupPreviewFree = !!on; },
  get spin() { return setupPreviewSpin; },
  get az() { return setupPreviewAz; },
  get el() { return setupPreviewEl; },
  get dist() { return setupPreviewDist; },
  get pan() { return setupPreviewPan; },
  get aeroX() { return setupPreviewAeroX; },
  get xOn() { return setupPreviewXOn; },
  get effDist() { return _spEffDist; },
  get effFit() { return _spEffFit; },
  get effPanel() { return _spEffPanel; },
  get meshKey() { return _spMeshKey; },
  set meshKey(v) { if (v === "") spMeshBust(); else _spMeshKey = v; },
};
}

return { create };
})();
Object.freeze(SetupCamera);
