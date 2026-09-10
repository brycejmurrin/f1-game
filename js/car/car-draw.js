/* Apex 26 — CarDraw: the car-drawing seam out of js/game.js — the bounded
   mesh / livery-atlas caches (team, body, player, cockpit, wheel pairs), the
   player's resolved wheel spec and cosmetic key, decal queueing and its flush,
   the cockpit rig, the planted spinning wheels, warm-ups, and the optional GLB
   body. One CarDraw.create(G, deps) at boot; game.js keeps the render loop,
   the shadow batches and the ground/attitude matrices, and reads the caches
   only through this surface. Depends on nothing in game.js by name: state
   comes through the G façade (gfx / store / cars / raceT / camEye / camMode /
   raceTimeOfDay / track / teamIdx / driverIdx / headlessMode), the four
   helpers that could not leave game.js through deps (resolveLivery,
   partsVisualKey, drawAeroFlaps, damp, isTimeTrial, isQuali). */
"use strict";

const CarDraw = (function () {
  function create(G, deps) {
    Log.info("game", "CarDraw.create");
    const { getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getCockpitWheel,
            getLedStrip, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, drawWheelExtras } = CarMesh;

    // ── cache-helpers ───────────────────────────────────────────────
    function invalidateCustomMeshCache(cache, order) {
      Object.keys(cache).forEach((key) => {
        if (key.indexOf("custom:") !== 0) return;
        if (cache[key] && G.gfx.freeMesh) G.gfx.freeMesh(cache[key]);
        delete cache[key];
        if (order) {
          const i = order.indexOf(key);
          if (i >= 0) order.splice(i, 1);
        }
      });
    }
    // Bound a key→mesh cache to `max` most-recent entries. Evicted meshes are freed
    // via gfx.freeMesh exactly once (deleted from the map before free). `freeOne`
    // optional — defaults to freeMesh(mesh); wheel pairs pass a custom freer.
    function putBoundedMesh(cache, order, key, create, max, freeOne) {
      if (cache[key]) {
        if (order[order.length - 1] !== key) {
          const i = order.indexOf(key);
          if (i >= 0) order.splice(i, 1);
          order.push(key);
        }
        return cache[key];
      }
      const mesh = create();
      cache[key] = mesh;
      order.push(key);
      const free = freeOne || ((m) => { if (m && G.gfx.freeMesh) G.gfx.freeMesh(m); });
      while (order.length > max) {
        const old = order.shift();
        const victim = cache[old];
        delete cache[old];
        free(victim);
      }
      return mesh;
    }
    // ── team-caches ─────────────────────────────────────────────────
    const teamMeshes = {}, teamMeshOrder = [];   // factory full mesh (shadows / ghost / glb)
    const teamBodies = {}, teamBodyOrder = [];   // factory body-only (visible AI — wheels drawn planted)
    const TEAM_MESH_CACHE_MAX = 40, DECAL_TEX_CACHE_MAX = 48;   // 12 teams × (2 painted + 1 :sh) = 36; headroom for ghost/custom. Was 48 while seat-keyed :sh briefly doubled casters.
    // ── player-parts ────────────────────────────────────────────────
    // Resolved tyre/brake visual tiers for the PLAYER's wheel meshes (drawPlayerWheels
    // reads these directly — cheap per-frame variable reads, not a per-frame
    // Parts.getVisualTiers() call). Refreshed whenever parts change (below).
    let playerTyreTier = 1, playerBrakesTier = 1, playerTyreId = "medium", playerBrakeId = "standard";
    let playerTyreVisual = null, playerBrakeVisual = null;
    // WHEELS rides along with the other two wheel-facing categories.
    let playerWheelId = "standard", playerWheelVisual = null;
    // Full 12-char cosmetic key for the PLAYER's body/cockpit mesh caches — computed
    // once here (parts only change from the setup screen, which calls this on close)
    // so the render loop reads a cached string instead of rebuilding it via
    // partsVisualKey() → getVisualTiers() every frame. Overwritten before the first
    // race render by startRace()'s recomputePlayerMods() call.
    let playerVisualKey = "111111111111";

    // ── car-model ───────────────────────────────────────────────────
    // Optional imported car model (binary glTF / .glb). When loaded, team meshes are
    // built from it — tinted to each livery — instead of the procedural Car3D.
    // null => procedural (the shipped default; there is no bundled model).
    let carModelBuf = null;
    const CAR_MODEL_SCALE = 1;

    function buildCarData(team, extra) {
      const liv = deps.resolveLivery(team);   // chosen paint job (else team colours)
      if (carModelBuf) {
        try { return GLTF.toMesh(carModelBuf, { scale: CAR_MODEL_SCALE, tint: liv.c1 }); }
        catch (e) { /* any parse trouble: fall through to the procedural car */ }
      }
      const factorySetup = Parts.getFactorySetup(team);
      return Car3D.build(liv.c1, liv.c2, {
        livery: liv,
        teamId: team.id,   // per-team chassis style (nose/airbox/fin/mirrors/inlet)
        num: (extra && extra.num != null) ? extra.num : (team.drivers && team.drivers[0] && team.drivers[0].num),
        parts: Parts.getVisualTiers(factorySetup, team),
        noWheels: !!(extra && extra.noWheels),
        field: !!(extra && extra.noWheels),   // factory body — probe vs playerBodies
        silhouette: !!(extra && extra.silhouette),
      });
    }

    // ── team-mesh ───────────────────────────────────────────────────
    // Memoized per team.id, invalidated by G.store.rev — same pattern as
    // _livResolveCache above, and for the same reason. This key is rebuilt from
    // getLiveryId (a store read, itself two string concatenations) plus
    // Parts.factoryKey (a fresh 12-element array and a ~60-char join), and teamMesh
    // is called for EVERY drawn car in the body pass, again in the dynamic car-shadow
    // pass and again in the night lamp-shadow pass — up to ~66 times a frame for a
    // value that cannot change unless something was written to the store.
    const _teamMeshKeyCache = new Map();
    function teamMeshKey(team) {
      const c = _teamMeshKeyCache.get(team.id);
      if (c && c.rev === G.store.rev) return c.val;
      const val = team.id + ":" + G.getLiveryId(team.id) + ":" + Parts.factoryKey(team);
      _teamMeshKeyCache.set(team.id, { val, rev: G.store.rev });
      return val;
    }
    // Painted full meshes are KEYED PER DRIVER (helmet design is opts.num). Shadow
    // casters pass silhouette:true — depth cannot see paint, and Car3D already
    // drops paint-edge splits + in-tub torso on that path, so both seats of a team
    // build bit-identical casters. Sharing one ":sh" per team(+parts) halves
    // shadow-mesh residency (22 → 11) with no depth change; seat stays on the
    // painted key only.
    function teamMesh(team, car, silhouette) {
      const sil = silhouette === true || (car == null && silhouette !== false);
      if (sil) {
        return putBoundedMesh(teamMeshes, teamMeshOrder, teamMeshKey(team) + ":sh",
          () => G.gfx.createMesh(buildCarData(team, { num: carDecalNum(team, car), silhouette: true })),
          TEAM_MESH_CACHE_MAX);
      }
      const num = carDecalNum(team, car);
      return putBoundedMesh(teamMeshes, teamMeshOrder, teamMeshKey(team) + ":" + num,
        () => G.gfx.createMesh(buildCarData(team, { num })), TEAM_MESH_CACHE_MAX);
    }
    function teamBodyMesh(team, car) {
      return putBoundedMesh(teamBodies, teamBodyOrder, teamMeshKey(team) + ":" + carDecalNum(team, car), () => G.gfx.createMesh(buildCarData(team, { noWheels: true, num: carDecalNum(team, car) })), TEAM_MESH_CACHE_MAX);
    }

    // ── decals ──────────────────────────────────────────────────────
    const _decalTexCache = {}, _decalTexFail = {}, _decalTexOrder = [];
    function invalidateDecalTextures(teamId) {
      const prefix = teamId + ":";
      Object.keys(_decalTexCache).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        const tex = _decalTexCache[key];
        if (tex && G.gfx.freeTexture) G.gfx.freeTexture(tex);
        delete _decalTexCache[key]; delete _decalTexFail[key];
        const oi = _decalTexOrder.indexOf(key); if (oi >= 0) _decalTexOrder.splice(oi, 1);
      });
    }
    // The livery half of the atlas key, memoised on G.store.rev like teamMeshKey:
    // G.getLiveryId() is a store read (two string concats + a JSON decode) and this
    // ran once per drawn car per FRAME — ~22 times — for a value that only moves
    // when something is written to the store.
    const _decalPrefixCache = new Map();
    function decalKeyPrefix(team) {
      const c = _decalPrefixCache.get(team.id);
      if (c && c.rev === G.store.rev) return c.val;
      const val = team.id + ":" + G.getLiveryId(team.id) + ":";
      _decalPrefixCache.set(team.id, { val, rev: G.store.rev });
      return val;
    }
    function getCarDecalTexture(team, num, isPlayer) {
      if (typeof LiveryTex === "undefined" || !G.gfx.createTexture) return null;
      // isPlayer is part of the key: on the mobile tier the player's atlas uploads
      // at 512² and AI atlases at 256², so a team the player later switches to
      // must not reuse a cached AI-resolution atlas (and vice versa).
      const key = decalKeyPrefix(team) + (num == null ? "_" : num) + (isPlayer ? ":P" : "");
      if (!(key in _decalTexCache)) {
        let t = null;
        try { t = G.gfx.createTexture(LiveryTex.buildAtlas(team.id, deps.resolveLivery(team), num, !!isPlayer)); }
        catch (e) {
          // Swallowed AND cached as null before: one transient miss stripped that
          // team's numbers/sponsors for the session, unlogged. Log and retry — but
          // this runs per drawn car per FRAME, so cache the null after 3 tries.
          const n = _decalTexFail[key] = (_decalTexFail[key] || 0) + 1;
          if (n === 1) Log.warn("gfx", "decal atlas build failed for " + key, e);
          if (n < 3) return null;
        }
        _decalTexCache[key] = t; _decalTexOrder.push(key);
        while (_decalTexOrder.length > DECAL_TEX_CACHE_MAX) {   // FIFO: browsing liveries minted page-lifetime ~5 MB atlases
          const old = _decalTexOrder.shift(), ot = _decalTexCache[old];
          if (ot && G.gfx.freeTexture) G.gfx.freeTexture(ot);
          delete _decalTexCache[old]; delete _decalTexFail[old];
        }
      }
      return _decalTexCache[key];
    }
    // Driver number for a car's decal atlas: the car's own number if present, else
    // the team's primary driver (so the setup preview / any numberless call still
    // shows a sensible number).
    function carDecalNum(team, car) {
      if (car && car.num != null) return car.num;
      return (team.drivers && team.drivers[0] && team.drivers[0].num != null) ? team.drivers[0].num : null;
    }
    // Draw a car's logo/sponsor decals with the same model matrix as its body.
    // A team's rear-wing downforce level (0..4), driving which endplate-number mesh
    // to draw. getVisualTiers is a small 12-category loop and the resulting mesh is
    // cached per level, so resolving this per car/frame is negligible.
    const _aeroLevelCache = new Map();   // "player|factory:team.id" -> {val, rev}
    function teamDecalState(team, usePlayerSetup) {
      const key = (usePlayerSetup ? "player:" : "factory:") + team.id;
      const rev = usePlayerSetup ? G.store.rev : -1;
      const c = _aeroLevelCache.get(key);
      if (c && c.rev === rev) return c;
      const setup = usePlayerSetup ? G.getTeamParts(team.id) : Parts.getFactorySetup(team);
      const parts = Parts.getVisualTiers(setup, team);
      // aero: the resolved RECIPE, resolved once here for every flap consumer.
      // parts.aero is the tier NUMBER — passing that to Car3D.aeroFlaps() NaN'd
      // every flap vertex and made the moveable wings invisible (see aeroStyleOf).
      const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2,
                      aero: Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null,
                      parts, rev };
      _aeroLevelCache.set(key, state);
      return state;
    }
    // Build every car's body mesh and livery atlas BEFORE the first frame draws
    // the grid. Both caches were lazy, so the first countdown frame built up to
    // 11 Car3D meshes and 22 atlases (each a 1024² canvas painted, downscaled on
    // phones, uploaded) — hundreds of ms landing on the lights animation. The same
    // keys the per-car draw uses (queueCarDecals / teamBodyMesh / playerBodyMesh),
    // so the caches simply hit; the cost joins the load stall instead.
    function warmCarAssets() {
      if (carModelBuf) return;   // a GLB body is one piece with no procedural build to warm
      const at = performance.now();
      for (let i = 0; i < G.cars.length; i++) {
        const c = G.cars[i];
        try {
          if (c.isPlayer) playerBodyMesh(c.team, c); else teamBodyMesh(c.team, c);
          if (c.isPlayer && CamModes.CAM_MODES[G.camMode].id === "cockpit") cockpitBodyMesh(c.team, c);
          getCarDecalTexture(c.team, carDecalNum(c.team, c), !!c.isPlayer);
        } catch (e) { Log.warn("gfx", "car asset warm-up failed for " + (c.team && c.team.id), e); }
      }
      Log.info("gfx", "race car assets ready", { cars: G.cars.length, cpuMs: Math.round(performance.now() - at) });
    }
    // Prepare visual descriptors only: do not call makeCars(), advance the seeded
    // simulation, replace the live field, or arm a race from a menu. Existing bounded
    // mesh/atlas caches are shared with the real race; each task warms one driver.
    async function prepareMenuCarAssets(current) {
      if (carModelBuf || G.headlessMode) return;
      const teamPick = G.teamIdx, driverPick = G.driverIdx, rev = G.store.rev, solo = deps.isTimeTrial() || deps.isQuali();
      const valid = () => current() && !G.headlessMode && !carModelBuf && G.teamIdx === teamPick && G.driverIdx === driverPick && G.store.rev === rev
        && solo === (deps.isTimeTrial() || deps.isQuali());
      const field = [];
      Teams.LIST.forEach((team, ti) => {
        if (team.custom && ti !== teamPick) return;
        Career.gridDrivers(team).forEach((seat, di) => {
          const d = Career.driverOverride(team.id, di) || seat;
          const c = { team, num: d.num, isPlayer: ti === teamPick && di === driverPick };
          if (c.isPlayer) field.unshift(c); else if (!solo) field.push(c);
        });
      });
      const visualKey = Teams.LIST[teamPick] ? deps.partsVisualKey(Teams.LIST[teamPick].id) : "";
      let cpuMs = 0, maxCpuMs = 0;
      for (const c of field) {
        await new Promise(resolve => setTimeout(resolve, 32));
        if (!valid() || (G.gfx.warming && G.gfx.warming())) return;
        const at = performance.now();
        try {
          if (c.isPlayer) {
            playerBodyMesh(c.team, c, visualKey);
            if (CamModes.CAM_MODES[G.camMode].id === "cockpit") cockpitBodyMesh(c.team, c, visualKey);
          } else teamBodyMesh(c.team, c);
          getCarDecalTexture(c.team, carDecalNum(c.team, c), c.isPlayer);
        } catch (e) { Log.warn("gfx", "selector car asset preparation failed", e); }
        const elapsed = performance.now() - at; cpuMs += elapsed; maxCpuMs = Math.max(maxCpuMs, elapsed);
      }
      Log.info("gfx", "selector car assets ready", { cars: field.length, cpuMs: Math.round(cpuMs), maxCpuMs: Math.round(maxCpuMs) });
    }
    function drawCarDecals(team, modelMat, night, num, cockpit, usePlayerSetup) {
      const state = teamDecalState(team, usePlayerSetup);
      // A loaded GLB is a static body and does not consume procedural part recipes;
      // keep its overlay on stable default/legacy anchors as setup options change.
      const legacyBody = !!carModelBuf;
      const rl = cockpit ? null : deps.resolveLivery(team);
      const mesh = cockpit ? getCockpitDecalMesh(legacyBody ? null : state.parts, team.id) :
        getCarDecalMesh(state.val, state.parts, legacyBody, team.id, rl.finShape, rl.spineHeight);
      const tex = getCarDecalTexture(team, num, usePlayerSetup);
      if (mesh && tex) { _decalOpts.glow = night ? 0.35 : 0; G.gfx.drawDecal(mesh, modelMat, tex, _decalOpts); }
    }
    // Pooled decal opts — drawCarDecals runs once per drawn car per frame; a fresh
    // literal there was ~20 allocations/frame feeding the night-track GC jitter.
    const _decalOpts = { glow: 0 };

    // ── wheel-caches ────────────────────────────────────────────────
    // Player car gets animated wheels: a body-only mesh + four separate wheel meshes
    // the render layer spins (∝ speed) and steers (fronts). Only for the procedural
    // car — a loaded glb model is one piece, so playerBodyMesh returns null and the
    // player falls back to the full static mesh. Wheel meshes are cached per
    // TYRES/BRAKES visual tier below (getPlayerWheelMeshes), not team-keyed.
    // Bounded to the latest N visual keys so parts-expansion doesn't leak GPU meshes.
    const PLAYER_BODY_CACHE_MAX = 3;
    const COCKPIT_BODY_CACHE_MAX = 3;
    const WHEEL_MESH_CACHE_MAX = 8;
    const playerBodies = {};
    const playerBodyOrder = [];
    const WHEELS = [
      { x: -0.79, y: 0.34, z:  1.7, front: true,  rear: false },
      { x:  0.79, y: 0.34, z:  1.7, front: true,  rear: false },
      { x: -0.76, y: 0.34, z: -1.6, front: false, rear: true },
      { x:  0.76, y: 0.34, z: -1.6, front: false, rear: true },
    ];
    const _wheelLocal = new Float32Array(16);
    const _wheelWorld = new Float32Array(16);
    const _fixedWheelLocal = new Float32Array(16);
    const _fixedWheelWorld = new Float32Array(16);
    const _ringWorld = new Float32Array(16);
    // Scratch opts for AI brake rings — mutated in place per frame so the car loop
    // doesn't allocate a fresh literal per ring (up to ~40/frame in a braking pack).
    const _ringOpts = { emissive: 0, roughness: 0.9, specular: 0, alpha: 1, noAlphaWrite: true };
    // Deferred wheel/ring queues for drawPlayerWheels — the _shadowMats/_decalMats
    // shape (parallel arrays, Float32Array(16) pool grown on demand, counter reset
    // by the consumer). Bounded at 4 each: one car's wheels, drained before return.
    const _wq = [], _wqMesh = [], _rq = [], _rqEmis = [], _rqAlpha = [];
    let _wqN = 0, _rqN = 0;
    // ── decal-queue ─────────────────────────────────────────────────
    // Deferred car-decal batch (same pattern as the blob shadows above): the car
    // loop used to interleave G.gfx.draw(body) with G.gfx.drawDecal per car — ~2
    // program+state flips per car, ~44/frame with a full field. Record each drawn
    // car's decal params here and flush them in ONE decal-program block right
    // after the loop. Decals are depth-tested but write neither depth nor alpha,
    // so drawing them after the bodies/wheels/rings resolves identically.
    const _decalMats = [];    // pool of Float32Array(16), reused across frames
    const _decalTeams = [];
    const _decalNums = [];
    const _decalCockpit = [];
    const _decalSetup = [];
    let _decalCount = 0;
    function queueCarDecals(team, modelMat, num, cockpit, usePlayerSetup) {
      let m = _decalMats[_decalCount];
      if (!m) { m = new Float32Array(16); _decalMats[_decalCount] = m; }
      m.set(modelMat);
      _decalTeams[_decalCount] = team;
      _decalNums[_decalCount] = num;
      _decalCockpit[_decalCount] = !!cockpit;
      _decalSetup[_decalCount] = !!usePlayerSetup;
      _decalCount++;
    }
    // ── cockpit-wheels-model ────────────────────────────────────────
    // The cockpit body: the REAL car (livery, nose, mirrors, number board) minus
    // the driver helmet the camera sits inside. Cached per team like playerBodies.
    const cockpitBodies = {};
    const cockpitBodyOrder = [];
    function cockpitBodyMesh(team, car, visualKey = playerVisualKey) {
      // Player-only (drawCockpitRig runs on c.isPlayer), so the cached playerVisualKey
      // is always this team's key — no per-frame partsVisualKey() rebuild.
      const num = carDecalNum(team, car);
      const key = team.id + ":" + visualKey + (CockpitOpts.halo() ? ":H" : "") + ":" + num;   // halo keys the cache: toggling rebuilds, no reload
      return putBoundedMesh(cockpitBodies, cockpitBodyOrder, key, () => {
        const liv = deps.resolveLivery(team);
        return G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
          { livery: liv, teamId: team.id, noWheels: true, noDriver: true, cockpit: true, halo: CockpitOpts.halo(), num,
            parts: Parts.getVisualTiers(G.getTeamParts(team.id), team) }));
      }, COCKPIT_BODY_CACHE_MAX);
    }
    // Hub transform (translate + upscale) + scratch matrices for the steering roll
    // and per-element LCD offsets. The rig z is NOT cosmetic: the cockpit near
    // plane is 0.30 m (_nearM below) and the eye sits at car-local z -0.20, so any
    // hub nearer than z ~0.14 puts the whole dash INSIDE it — measured at z 0.10
    // the wheel projected at w 0.276 and EVERY instrument at 0.274: LCD, LED strip,
    // digits and aero lamp all clipped, the wheel a washed-out near-clipped shell.
    const _rigT = new Float32Array([0.80,0,0,0, 0,0.80,0,0, 0,0,0.80,0, 0,0.63,0.26,1]);
    const _rigR = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const _rigA = new Float32Array(16), _rigB = new Float32Array(16);
    const _digT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const _digM = new Float32Array(16);
    const _rigFx = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true }, _rigFxA = { emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 1 };
    function drawCockpitRig(c, base, dt, paint) {
      const nite = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && G.track.def.night);
      _cockpitOpts.emissive = nite ? 0.16 : 0;
      const opt = _cockpitOpts;
      // The actual car around you: body (minus helmet) with the real paint, plus
      // the steering/spinning FRONT wheels (the rears sit right beside the camera
      // in the wide FOV and blob the bottom corners — skipped). Nudged 0.30 m
      // forward of their real physics position so they read further out ahead of
      // the driver instead of hugging the cockpit edge (cosmetic-only offset —
      // the actual wheel/contact-patch physics is untouched).
      G.gfx.draw(cockpitBodyMesh(c.team, c), base, paint);
      // The cockpit body includes the FRONT wing, whose top elements are active
      // aero and therefore not baked into it — draw them, or the driver looks out
      // over a wing that is missing its flaps. The rear assembly is not part of
      // this build at all, hence "front" only.
      if (!carModelBuf) {
        const aSt = teamDecalState(c.team, c.isPlayer);
        deps.drawAeroFlaps(c.team, aSt.val, c.aeroX || 0, base, paint, aSt.aero, "front");
      }
      // Forward decal: the driver number on the nose plate ahead of the driver (the
      // nose is identical to the chase build, so this lands exactly on the plate).
      // Queued with the field's decals and flushed after the car loop. The player
      // cockpit is the one queued decal that renders the PLAYER's setup parts.
      queueCarDecals(c.team, base, carDecalNum(c.team, c), true, true);
      _cockpitWheelOpts.emissive = nite ? 0.12 : 0;
      drawPlayerWheels(c, base, dt, _cockpitWheelOpts, true, 0.30, 1.4);
      // Roll the wheel about the (car-local) column axis by the smoothed steering —
      // works identically for tilt / buttons / touch (steerVis is the resolved,
      // damped steering whatever the input mode). A second, slower damping stage
      // gives the wheel visual WEIGHT (it settles rather than flicking), the lock
      // is modest (~±46°), and the sign is flipped — it was rotating backwards.
      c._whlVis = deps.damp(c._whlVis == null ? 0 : c._whlVis, M4.clamp(c.steerVis || 0, -1, 1), 6, dt);
      const a = -c._whlVis * 0.80;
      const ca = Math.cos(a), sa = Math.sin(a);
      _rigR[0] = ca; _rigR[1] = sa; _rigR[4] = -sa; _rigR[5] = ca;
      M4.mulTo(_rigA, base, _rigT);
      M4.mulTo(_rigB, _rigA, _rigR);
      G.gfx.draw(getCockpitWheel(deps.resolveLivery(c.team)), _rigB, opt);   // livery-keyed: team grips/marker/gloves
      // Live telemetry ON the wheel (all ride the wheel matrix, like the real LCD):
      // gear (auto or manual — c.gear is maintained by both paths), RPM shift
      // lights, speed, pedal bars, ERS energy.
      const fx = _rigFx;
      G.gfx.draw(getGearDigit(M4.clamp(c.gear || 1, 0, 9)), _rigB, fx);
      const rpmF = M4.clamp(((c.rpm || PhysicsConsts.IDLE_RPM) - PhysicsConsts.IDLE_RPM) / (PhysicsConsts.MAX_RPM - PhysicsConsts.IDLE_RPM), 0, 1);
      G.gfx.draw(getLedStrip(rpmF > 0.965 ? (G.raceT * 14 % 1 < 0.5 ? 9 : 0) : Math.round(rpmF * 8)), _rigB, fx);
      drawWheelExtras(_rigB, c, G.raceT);   // ACTIVE AERO lamp + flap-travel bar (carmesh.js)
      // Clamp to 0: a negative c.speed (e.g. hard braking to a near-stop, or a
      // reversing glitch) would otherwise stringify with a "-" character that
      // getSpeedDigit can't parse (+"-" is NaN -> SEG7[NaN] -> crash every frame).
      const kmh = Math.max(0, Math.min(999, Math.round(G.dashKph(c.speed || 0))));
      const ds = String(kmh);
      for (let i = 0; i < ds.length; i++) {
        _digT[12] = -0.034 + (i - (ds.length - 1) / 2) * 0.0135; _digT[13] = 0.022; _digT[14] = -0.0335;
        M4.mulTo(_digM, _rigB, _digT);
        G.gfx.draw(getSpeedDigit(+ds[i]), _digM, fx);
      }
      // ERS charge fill in the slot under the LCD; pulses while deploying.
      const en = M4.clamp(c.energy || 0, 0, 1);
      if (en > 0.01) {
        _digT[12] = 0.048; _digT[13] = 0.001; _digT[14] = -0.0315;
        M4.mulTo(_digM, _rigB, _digT);
        _digM[4] *= en; _digM[5] *= en; _digM[6] *= en;
        G.gfx.draw(getErsBar(), _digM, c.deploying ? (_rigFxA.alpha = 0.75 + 0.25 * Math.sin(G.raceT * 22), _rigFxA) : fx);
      }
      // OVERTAKE lamp on the wheel: white when armed, pulsing purple while active
      // (the floating HUD OVERTAKE text is hidden in cockpit view).
      if (c.otT > 0) {
        G.gfx.draw(getOtLamp(true), _rigB, (_rigFxA.alpha = 0.7 + 0.3 * Math.sin(G.raceT * 18), _rigFxA));
      } else if (c.otArmed) {
        G.gfx.draw(getOtLamp(false), _rigB, fx);
      }
      _digT[12] = _digT[13] = _digT[14] = 0;
    }

    function playerBodyMesh(team, car, visualKey = playerVisualKey) {
      if (carModelBuf) return null;   // glb model: single piece, no wheel split
      // Player-only draw path, so the cached playerVisualKey is always this team's
      // key — no per-frame partsVisualKey() rebuild. The number joins it: a player
      // in the second seat wears the second driver's helmet.
      const key = team.id + ":" + visualKey + ":" + carDecalNum(team, car);
      const liv = deps.resolveLivery(team);
      return putBoundedMesh(playerBodies, playerBodyOrder, key, () => G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, teamId: team.id, noWheels: true, num: carDecalNum(team, car),
          parts: Parts.getVisualTiers(G.getTeamParts(team.id), team) })), PLAYER_BODY_CACHE_MAX);
    }
    // Player wheel meshes, keyed by the resolved TYRES/BRAKES visual tier (band
    // colour + caliper accent) so a parts change rebuilds the right mesh instead
    // of drawing stale geometry. Tier "1:1" (both default) matches today's shared
    // wheelMeshF/wheelMeshR exactly — same team-independent, dark-tyre meshes.
    // Bounded to the latest WHEEL_MESH_CACHE_MAX tyre:brake pairs.
    const wheelMeshCache = {};
    const wheelMeshOrder = [];
    function freeWheelPair(m) {
      if (!m) return;
      if (G.gfx.freeMesh) {
        if (m.F) G.gfx.freeMesh(m.F);
        if (m.R) G.gfx.freeMesh(m.R);
        if (m.FFixed) G.gfx.freeMesh(m.FFixed);
        if (m.RFixed) G.gfx.freeMesh(m.RFixed);
      }
    }
    function getPlayerWheelMeshes() {
      const key = playerTyreId + ":" + playerBrakeId + ":" + playerWheelId;
      return putBoundedMesh(wheelMeshCache, wheelMeshOrder, key, () => {
        const band = playerTyreVisual && playerTyreVisual.band || Car3D.TYRE_BAND[playerTyreTier];
        const caliper = playerBrakeVisual ? playerBrakeVisual.cal : Car3D.BRAKE_CALIPER[playerBrakesTier];
        const rim = playerBrakeVisual && playerBrakeVisual.rim;
        const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, false,
          playerTyreVisual, playerBrakeVisual, playerWheelVisual);
        const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, false,
          playerTyreVisual, playerBrakeVisual, playerWheelVisual);
        return {
          F: G.gfx.createMesh(front.rotating),
          R: G.gfx.createMesh(rear.rotating),
          FFixed: G.gfx.createMesh(front.fixed),
          RFixed: G.gfx.createMesh(rear.fixed),
        };
      }, WHEEL_MESH_CACHE_MAX, freeWheelPair);
    }
    // Spin each wheel about its axle ∝ speed and steer the fronts by the smoothed
    // driver input. local = translate(corner) ∘ rotY(steer) ∘ rotX(spin), composed
    // straight into a scratch matrix (no per-frame allocation), then into world.
    // Factory tyre/brake/rim per team — the old baked AI wheel look — but as a
    // planted spinning pair, not glued to the chassis. Own cache so garage swaps
    // cannot evict the field (WHEEL_MESH_CACHE_MAX is a player-parts bound).
    const fieldWheelCache = {};
    // putBoundedMesh + freeWheelPair: hit promotion so a still-drawn combo is not
    // FIFO-evicted while a new career R&D key walks in. Each entry is FOUR meshes
    // (F/R rotating + F/R fixed) = 12 GL objects and ~205 KB of buffers.
    //
    // The key is the team's FITTED tyre:brake:wheel ids, so in career/MyTeam the AI
    // teams' parts change as the season's R&D lands and fresh keys keep appearing
    // inside one page load; the catalog spans 27 x 27 x 22 combos. Ten new
    // combinations over a session is +2 MB and 120 orphaned GL objects that live as
    // long as the tab does. Slow, monotonic, and it never comes back.
    //
    // 12 rather than 8: this is the whole FIELD, and evicting a set another car is
    // still drawing costs a rebuild every frame. The grid is 22 cars but they share
    // factory parts, so distinct fitted combos in one race are far fewer.
    const fieldWheelOrder = [];
    const FIELD_WHEEL_CACHE_MAX = 12;
    function getFieldWheelMeshes(team) {
      const vt = teamDecalState(team, false).parts;   // permanently cached factory resolve — was ~1260 resolveSetup/s across the drawn field
      const key = "field:" + (vt._ids ? vt._ids.tyres + ":" + vt._ids.brakes + ":" + vt._ids.wheels : "1:1:1");
      return putBoundedMesh(fieldWheelCache, fieldWheelOrder, key, () => {
        const tyre = vt._visual && vt._visual.tyres;
        const brake = vt._visual && vt._visual.brakes;
        const wheel = vt._visual && vt._visual.wheels;
        const band = (tyre && tyre.band) || Car3D.TYRE_BAND[vt.tyres] || Car3D.TYRE_BAND[1];
        const caliper = brake ? brake.cal : Car3D.BRAKE_CALIPER[vt.brakes];
        const rim = brake && brake.rim;
        const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, false, tyre, brake, wheel);
        const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, false, tyre, brake, wheel);
        // A MARKER, not behaviour (Car3D.build's `field` opt is the same idea): this
        // cache and getPlayerWheelMeshes() call buildWheelLayers identically, so a
        // mesh probe cannot otherwise tell a FIELD pair from a PLAYER one, and
        // parts-mesh-cache.spec.js was measuring the sum of two separate bounds.
        front.rotating._field = front.fixed._field = rear.rotating._field = rear.fixed._field = true;
        return {
          F: G.gfx.createMesh(front.rotating),
          R: G.gfx.createMesh(rear.rotating),
          FFixed: G.gfx.createMesh(front.fixed),
          RFixed: G.gfx.createMesh(rear.fixed),
        };
      }, FIELD_WHEEL_CACHE_MAX, freeWheelPair);
    }
    function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale) {
      const wm = c.isPlayer ? getPlayerWheelMeshes() : getFieldWheelMeshes(c.team);
      c.wheelSpin = ((c.wheelSpin || 0) + (c.speed / PhysicsConsts.WHEEL_R) * dt) % (Math.PI * 2);
      // Fronts have their own spin so a lock-up (c.wheelLock) freezes them while
      // the car still moves; the flat spot it leaves bumps them once per rev.
      c.wheelSpinF = ((c.wheelSpinF || 0) + (c.speed / PhysicsConsts.WHEEL_R) * dt * (1 - (c.wheelLock || 0))) % (Math.PI * 2);
      const spR = Math.sin(c.wheelSpin), cpR = Math.cos(c.wheelSpin);
      const spF = Math.sin(c.wheelSpinF), cpF = Math.cos(c.wheelSpinF);
      const flat = (c.flatSpot || 0) * 0.004 * (0.5 + 0.5 * cpF);
      const steerA = M4.clamp(c.steerVis || 0, -1, 1) * PhysicsConsts.WHEEL_STEER_VIS;
      const ws = wScale || 1;   // widen the tyre along its axle (cockpit view)
      for (let w = 0; w < WHEELS.length; w++) {
        const wd = WHEELS[w];
        if (frontsOnly && wd.rear) continue;   // cockpit: rears sit beside the camera and blob the corners
        const yaw = wd.front ? steerA : 0;
        const ss = Math.sin(yaw), cs = Math.cos(yaw);
        const sp = wd.front ? spF : spR, cp = wd.front ? cpF : cpR;
        const L = _wheelLocal;
        // Local X is the wheel axle (tyre width); scale that column by ws to widen.
        L[0] = cs*ws;    L[1] = 0;      L[2] = -ss*ws;    L[3] = 0;
        L[4] = ss*sp;    L[5] = cp;     L[6] = cs*sp;     L[7] = 0;
        L[8] = ss*cp;    L[9] = -sp;    L[10] = cs*cp;    L[11] = 0;
        // Push the widened wheels outward so they don't intersect the tub.
        L[12] = wd.x + (wd.x < 0 ? -1 : 1) * (ws - 1) * 0.16; L[13] = wd.y + (wd.front ? flat : 0); L[14] = wd.z + (fwdOffset || 0); L[15] = 1;
        M4.mulTo(_wheelWorld, base, L);
        G.gfx.draw(wd.rear ? wm.R : wm.F, _wheelWorld, opt);
        const F = _fixedWheelLocal;
        F[0] = cs*ws; F[1] = 0; F[2] = -ss*ws; F[3] = 0;
        F[4] = 0; F[5] = 1; F[6] = 0; F[7] = 0;
        F[8] = ss; F[9] = 0; F[10] = cs; F[11] = 0;
        F[12] = L[12]; F[13] = L[13]; F[14] = L[14]; F[15] = 1;
        M4.mulTo(_fixedWheelWorld, base, F);
        // DEFERRED, not drawn here. Interleaving rotating/fixed per wheel gives the
        // VAO sequence F,FFixed,F,FFixed,R,RFixed,R,RFixed — every consecutive pair
        // differs, so bindVAO's cache collapses NOTHING (the alternating-toggle
        // shape PERF-FINDINGS 1 already documents). Queued and flushed below in two
        // runs, the wheels are opaque (alpha 1 => depth write on, blend off) and
        // non-coplanar, so any order resolves identically under LEQUAL.
        _wq[_wqN] || (_wq[_wqN] = new Float32Array(16));
        _wq[_wqN].set(_fixedWheelWorld);
        _wqMesh[_wqN] = wd.rear ? wm.RFixed : wm.FFixed;
        _wqN++;
        // Hot brake discs: an emissive ring floating just off the outer wheel face,
        // ramping with the render-only brakeHeat (bright orange → blooms when hot).
        const heat = c.brakeHeat || 0;
        let ringOk = heat > 0.05;
        if (ringOk && !c.isPlayer) {
          const dx = base[12] - G.camEye[0], dy = base[13] - G.camEye[1], dz = base[14] - G.camEye[2];
          ringOk = dx * dx + dy * dy + dz * dz < 40 * 40;
        }
        if (ringOk) {
          const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.025);
          const W = _ringWorld;
          W.set(_wheelWorld);
          W[12] += W[0] * tx; W[13] += W[1] * tx; W[14] += W[2] * tx;
          // Pooled, like the AI ring path: this allocated a literal per hot wheel.
          // Rings are BLENDED with no alpha write and alpha 0.295..1.0, and they
          // were drawn interleaved with opaque car geometry. A ring writes no
          // depth, so a LATER car's opaque draw sitting behind it still passes
          // LEQUAL and paints over it — a live artifact, not just a bind cost.
          // Queued with the same emissive/alpha it would have had and flushed
          // after all the opaque wheels, which is both correct and one VAO bind
          // for the whole car instead of one per ring (getBrakeRing is a single
          // shared mesh).
          _rq[_rqN] || (_rq[_rqN] = new Float32Array(16));
          _rq[_rqN].set(W);
          _rqEmis[_rqN] = 0.30 + 0.70 * heat;
          _rqAlpha[_rqN] = Math.min(1, 0.25 + heat * 0.9);
          _rqN++;
        }
      }
      // Run 1: the fixed wheel layers, one bind for up to four draws.
      for (let i = 0; i < _wqN; i++) G.gfx.draw(_wqMesh[i], _wq[i], opt);
      // Run 2: the blended rings, after every opaque wheel of this car.
      const ro = _ringOpts;
      for (let i = 0; i < _rqN; i++) {
        ro.emissive = _rqEmis[i]; ro.alpha = _rqAlpha[i];
        G.gfx.draw(getBrakeRing(), _rq[i], ro);
      }
      _wqN = 0; _rqN = 0;
    }

    // Load an optional .glb car model at runtime. On success, rebuilds every team
    // mesh from it; on any failure (missing file, bad data) silently keeps the
    // procedural car. Returns Promise<boolean>. Not auto-called — so a missing asset
    // never logs a 404 during normal startup. Drop in a model then call this (e.g.
    // from the console or __apex.loadCarModel) once a CC-licensed .glb is available.
    async function loadCarModel(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        GLTF.toMesh(buf, { scale: CAR_MODEL_SCALE });   // validate before adopting
        carModelBuf = buf;
        for (const k in teamMeshes) { if (G.gfx.freeMesh) G.gfx.freeMesh(teamMeshes[k]); delete teamMeshes[k]; }  // free old GPU buffers, then rebuild from model
        for (const k in teamBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(teamBodies[k]); delete teamBodies[k]; }
        for (const k in playerBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(playerBodies[k]); delete playerBodies[k]; }
        playerBodyOrder.length = teamMeshOrder.length = teamBodyOrder.length = 0;
        for (const k in cockpitBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(cockpitBodies[k]); delete cockpitBodies[k]; }
        cockpitBodyOrder.length = 0;
        for (const k in wheelMeshCache) { freeWheelPair(wheelMeshCache[k]); delete wheelMeshCache[k]; }
        wheelMeshOrder.length = 0;
        for (const k in fieldWheelCache) { freeWheelPair(fieldWheelCache[k]); delete fieldWheelCache[k]; }
        // Same putBoundedMesh contract as wheelMeshOrder: clearing the cache without
        // the order array leaves stale keys queued, so the next eviction can free a
        // live field-wheel mesh while a dead key still occupies a slot.
        fieldWheelOrder.length = 0;
        return true;
      } catch (e) { return false; }
    }

    // ── cockpit-opts ────────────────────────────────────────────────
    const _cockpitOpts = { roughness: 0.55, metalness: 0.15, specular: 0.40, emissive: 0 };
    const _cockpitWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };

    // The render loop drains the decal queue once per frame, after the bodies.
    function beginDecals() { _decalCount = 0; }
    function flushDecals(night) {
      for (let i = 0; i < _decalCount; i++)
        drawCarDecals(_decalTeams[i], _decalMats[i], night, _decalNums[i], _decalCockpit[i], _decalSetup[i]);
    }
    // recomputePlayerMods hands over the player's resolved wheel spec + cosmetic key.
    function setPlayerParts(vt, visualKey) {
      playerTyreTier = vt.tyres; playerBrakesTier = vt.brakes;
      playerTyreId = vt._ids ? vt._ids.tyres : "medium";
      playerBrakeId = vt._ids ? vt._ids.brakes : "standard";
      playerTyreVisual = vt._visual && vt._visual.tyres || null;
      playerBrakeVisual = vt._visual && vt._visual.brakes || null;
      playerWheelId = vt._ids ? vt._ids.wheels : "standard";
      playerWheelVisual = vt._visual && vt._visual.wheels || null;
      playerVisualKey = visualKey;
    }
    // MY TEAM re-customise: drop every "custom:" entry of the four body caches.
    function invalidateCustomMeshCaches() {
      invalidateCustomMeshCache(teamMeshes, teamMeshOrder);
      invalidateCustomMeshCache(teamBodies, teamBodyOrder);
      invalidateCustomMeshCache(playerBodies, playerBodyOrder);
      invalidateCustomMeshCache(cockpitBodies, cockpitBodyOrder);
    }

    return {
      teamMesh, teamBodyMesh, playerBodyMesh, cockpitBodyMesh,
      teamDecalState, carDecalNum, getCarDecalTexture, invalidateDecalTextures,
      drawCarDecals, queueCarDecals, beginDecals, flushDecals,
      drawPlayerWheels, drawCockpitRig,
      warmCarAssets, prepareMenuCarAssets, loadCarModel, buildCarData,
      setPlayerParts, invalidateCustomMeshCaches,
      WHEELS,
      get modelBuf() { return carModelBuf; },
      get playerVisualKey() { return playerVisualKey; },
    };
  }
  return { create };
})();
Object.freeze(CarDraw);
