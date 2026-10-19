/* Apex 26 — CarDraw: the car-drawing seam out of js/game.js — the bounded
   mesh / livery-atlas caches (team, body, player, cockpit, wheel pairs), the
   player's resolved wheel spec and cosmetic key, decal queueing and its flush,
   the cockpit rig, the planted spinning wheels, warm-ups, and the optional GLB
   body. One CarDraw.create(G, deps) at boot; game.js keeps the render loop,
   the shadow batches and the ground/attitude matrices, and reads the caches
   only through this surface. Depends on nothing in game.js by name: state
   comes through the G façade (gfx / store / cars / raceT / camEye / camMode /
   dbgCam / state / raceTimeOfDay / track / teamIdx / driverIdx / headlessMode /
   frame), the four helpers that could not leave game.js through deps (resolveLivery,
   partsVisualKey, drawAeroFlaps, damp, isTimeTrial, isQuali). */
"use strict";

const CarDraw = (function () {
  // WHICH CACHE ENTRY A CAR'S BUILD IS — ONE answer for makeCars and the menu
  // prep (prepareMenuCarAssets), so the prep's bodies and casters are the race's.
  // `own`: the player or the MY TEAM hire, on the saved build (getTeamParts); a
  // career rival runs its R&D shelf (Career.aiSetup); everyone else the factory.
  // A build that RESOLVES to the team's factory parts is the factory car: no
  // stamp, no setup, the factory key. CareerAiDev.ensureSeed copies the works
  // shelf into a team's bag on its first winter, so once R&D had started every
  // rival carried its own stamp while the prep keyed the factory — ~21 bodies
  // and ~11 casters rebuilt behind the race-entry card. Same parts, same mesh.
  function carVisual(team, num, own, getTeamParts) {
    const setup = own ? getTeamParts(team.id) : (Career.inCareer() && Career.aiSetup ? Career.aiSetup(team) : null);
    let stamp = "";
    if (setup) {
      const ids = Parts.resolveSetup(setup, team).ids, works = Parts.getFactorySetup(team);
      if (Parts.CATALOG.some((cat) => ids[cat.id] !== works[cat.id])) stamp = Parts.CATALOG.map((cat) => setup[cat.id] || "").join(",");
    }
    return { visualSetup: stamp ? setup : null, visStamp: stamp, visPaint: stamp ? stamp + ":" + num : "", visSh: stamp ? stamp + ":sh" : "" };
  }
  function create(G, deps) {
    Log.info("game", "CarDraw.create");
    FieldLod.init(G.store);   // apex26.fieldLod, read once at boot (0 = no rival LOD)
    const { getCarDecalMesh, getCockpitDecalMesh, getBrakeRing, getSpinDisc, getCompoundRing, getCrewMesh, getCockpitWheel, getCockpitDash, getCockpitCabin, getCockpitGlass, getMirrorFallback, getMirrorGlass,
            getLedStrip, getGearDigit, getSpeedDigit, getErsBar, getOtLamp, drawWheelExtras } = CarMesh;

    // ── cache-helpers ───────────────────────────────────────────────
    function invalidateCustomMeshCache(cache, order, prefix = "custom:") {
      Object.keys(cache).forEach((key) => {
        if (key.indexOf(prefix) !== 0) return;
        if (cache[key] && G.gfx.freeMesh) G.gfx.freeMesh(cache[key]);
        delete cache[key];
        if (order) {
          const i = order.indexOf(key);
          if (i >= 0) order.splice(i, 1);
          const st = _lruStamp.get(order); if (st) st.delete(key);
        }
      });
    }
    // Bound a key→mesh cache to `max` most-recent entries. Evicted meshes are freed
    // via gfx.freeMesh exactly once (deleted from the map before free). `freeOne`
    // optional — defaults to freeMesh(mesh); wheel pairs pass a custom freer.
    // A hit promotes, the least recently used evicts — by STAMP: a hit writes one
    // number (it was an indexOf + splice + push per drawn car per pass), and only
    // an eviction, a miss past `max`, scans `order` for the oldest stamp.
    // `order` stays the key list every clear (length = 0) and invalidation edits.
    const _lruStamp = new WeakMap();   // order array -> Map(key -> last-use tick)
    let _lruTick = 0;
    function putBoundedMesh(cache, order, key, create, max, freeOne) {
      let st = _lruStamp.get(order);
      if (!st) { st = new Map(); _lruStamp.set(order, st); }
      if (cache[key]) { st.set(key, ++_lruTick); return cache[key]; }
      const mesh = create();
      cache[key] = mesh;
      order.push(key);
      st.set(key, ++_lruTick);
      const free = freeOne || ((m) => { if (m && G.gfx.freeMesh) G.gfx.freeMesh(m); });
      while (order.length > max) {
        let oi = 0, ot = Infinity;
        for (let i = 0; i < order.length; i++) {
          const t = st.get(order[i]);
          if (t === undefined) { oi = i; break; }   // a key with no stamp is older than any stamped one
          if (t < ot) { ot = t; oi = i; }
        }
        const old = order.splice(oi, 1)[0];
        st.delete(old);
        const victim = cache[old];
        delete cache[old];
        free(victim);
      }
      return mesh;
    }
    // ── team-caches ─────────────────────────────────────────────────
    const teamMeshes = {}, teamMeshOrder = [];   // factory full mesh (shadows / ghost / glb)
    if (typeof CockpitPreview !== "undefined") CockpitPreview.bind(() => {
      const team = G.player ? G.player.team : Teams.LIST[G.teamIdx];
      return { teamId: team.id, livery: deps.resolveLivery(team), parts: Parts.getVisualTiers(G.getTeamParts(team.id), team), units: AppearanceOpts.units() };
    });
    const teamBodies = {}, teamBodyOrder = [];   // factory body-only (visible AI — wheels drawn planted)
    // Each team cache holds 40. teamMeshes: one ":sh" caster per team (the menu
    // prep builds 11 real + a MY TEAM / LEGENDS pick + the player's own build <= 13),
    // a career's R&D-stamped ones (one per team) and the TT ghost: <= 26. It also
    // took a painted whole car per mirror rival (+22) until the mirror drew bodies.
    // teamBodies: 21-23 rivals in a race (the prep's keys: carVisual), 24 for LEGENDS.
    // A hit promotes, so no live key is evicted (car-presentation-canary pins
    // both counts). Was 48 while seat-keyed :sh doubled casters.
    // Decal atlases: the live set is the rivals' half-tier keys (21-23, 24 for
    // LEGENDS) plus the player's full one. 48 FIFO sat above everything a
    // session could reach (~45 with photo mode's), so nothing was ever evicted
    // and every browsed livery stayed resident (~7 MB each). 36 with a hit
    // promoting (LRU, like the team caches) keeps the live set plus photo mode's
    // PHOTO_ATLAS_MAX and evicts the rest.
    const TEAM_MESH_CACHE_MAX = 40, DECAL_TEX_CACHE_MAX = 36;
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

    // Ten legends share num 1, so the player's LEGENDS slot names its lid by the
    // picked legend's code (Car3D opts.helmetKey) and every body-mesh key carries
    // it. Any other team: undefined / "" — the key and the build do not move.
    function legendLid(team) {
      if (!team || team.id !== "legends") return undefined;
      const d = team.drivers && team.drivers[G.driverIdx | 0];
      return d && d.code ? d.code : undefined;
    }
    const lidKey = (team, suffix) => team.id === "legends" ? suffix + ":" + legendLid(team) : suffix;
    function buildCarData(team, extra) {
      const liv = deps.resolveLivery(team);   // chosen paint job (else team colours)
      if (carModelBuf) {
        try { return GLTF.toMesh(carModelBuf, { scale: CAR_MODEL_SCALE, tint: liv.c1 }); }
        catch (e) { /* any parse trouble: fall through to the procedural car */ }
      }
      const setup = (extra && extra.setup) || Parts.getFactorySetup(team);
      return Car3D.build(liv.c1, liv.c2, {
        livery: liv,
        teamId: team.id,   // per-team chassis style (nose/airbox/fin/mirrors/inlet)
        num: (extra && extra.num != null) ? extra.num : (team.drivers && team.drivers[0] && team.drivers[0].num),
        helmetKey: legendLid(team),
        parts: Parts.getVisualTiers(setup, team),
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
    // The memo entry also holds each FULL key (base + ":" + seat number or
    // ":sh"), so a hit concatenates nothing, and the rev test compares the two
    // parts (a number and the interned ruleset string) instead of building a
    // "rev|legality" string on every call.
    const _teamMeshKeyCache = new Map();
    function teamMeshEntry(team) {
      // The era moves the factory build without a store write (Career.engage
      // → applyRegs), so the memo is keyed on the ruleset as well as rev.
      const rev = G.store.rev, leg = Parts.legalityKey();
      let c = _teamMeshKeyCache.get(team.id);
      if (c && c.rev === rev && c.leg === leg) return c;
      const val = team.id + ":" + G.getLiveryId(team.id) + ":" + Parts.factoryKey(team);
      c = { val, rev, leg, full: new Map() };
      _teamMeshKeyCache.set(team.id, c);
      return c;
    }
    function teamMeshKey(team) { return teamMeshEntry(team).val; }
    // teamMeshKey(team) + ":" + suffix, memoised with it (suffix: a seat number or "sh").
    function teamMeshKeyFor(team, suffix) {
      const c = teamMeshEntry(team);
      let k = c.full.get(suffix);
      if (k === undefined) { k = c.val + ":" + suffix; c.full.set(suffix, k); }
      return k;
    }
    // ONE hoisted factory for the three team caches: the caller sets the pending
    // build, then putBoundedMesh calls it on a miss only. A per-call arrow here
    // was a fresh closure per drawn car per pass (~66 a frame) on the hit path.
    let _pbTeam = null, _pbNum = null, _pbKind = 0, _pbSetup = null;   // 0 painted, 1 silhouette, 2 body-only
    function buildPendingTeamMesh() {
      const team = _pbTeam, num = _pbNum, setup = _pbSetup;
      const extra = _pbKind === 1 ? { num, silhouette: true, setup }
        : _pbKind === 2 ? { noWheels: true, num, setup } : { num, setup };
      return G.gfx.createMesh(buildCarData(team, extra));
    }
    // Painted full meshes are KEYED PER DRIVER (helmet design is opts.num). Shadow
    // casters pass silhouette:true — depth cannot see paint, and Car3D already
    // drops paint-edge splits + in-tub torso on that path, so both seats of a team
    // build bit-identical casters WHEN they share a setup. A career hire or an AI
    // works car with its own fitted shelf must not share the factory mesh: the
    // stamp (catalog ids, once, on the car) joins the suffix, including ":sh".
    // Null visualSetup keeps the factory suffix, so the key does not move.
    function teamMesh(team, car, silhouette) {
      const sil = silhouette === true || (car == null && silhouette !== false);
      const num = carDecalNum(team, car);
      _pbTeam = team; _pbNum = num; _pbKind = sil ? 1 : 0;
      _pbSetup = (car && car.visualSetup) || null;
      const painted = lidKey(team, (_pbSetup && car.visPaint) || num);
      const shadow = (_pbSetup && car.visSh) || "sh";
      return putBoundedMesh(teamMeshes, teamMeshOrder, teamMeshKeyFor(team, sil ? shadow : painted),
        buildPendingTeamMesh, TEAM_MESH_CACHE_MAX);
    }
    function teamBodyMesh(team, car) {
      const num = carDecalNum(team, car);
      _pbTeam = team; _pbNum = num; _pbKind = 2;   // body-only: noWheels, num
      _pbSetup = (car && car.visualSetup) || null;
      const suffix = lidKey(team, (_pbSetup && car.visPaint) || _pbNum);
      return putBoundedMesh(teamBodies, teamBodyOrder, teamMeshKeyFor(team, suffix), buildPendingTeamMesh, TEAM_MESH_CACHE_MAX);
    }
    // ONE procedural body for every rival past FieldLod tier 2 (~120 m, ±10 %
    // hysteresis on c._lodTier). Team livery stays on the planted wheels; the
    // mesh is neutral grey so we never pay a Car3D.build per seat at range.
    let _sharedRivalBody = null;
    function sharedRivalBodyMesh() {
      if (carModelBuf) return null;
      if (_sharedRivalBody) return _sharedRivalBody;
      const team = Teams.LIST[0];
      const setup = Parts.getFactorySetup(team);
      _sharedRivalBody = G.gfx.createMesh(Car3D.build([0.72, 0.72, 0.72], [0.72, 0.72, 0.72], {
        field: true, silhouette: true, noDriver: true, noWheels: true, livery: {}, smooth: false,
        parts: Parts.getVisualTiers(setup, team),
      }));
      return _sharedRivalBody;
    }

    // ── decals ──────────────────────────────────────────────────────
    const _decalTexCache = {}, _decalTexFail = {}, _decalTexOrder = [];
    const _decalTexUse = new Map();   // key -> last-use tick (LRU; the putBoundedMesh idiom)
    let _decalTexTick = 0;
    // The LRU is bounded by BYTES as well as slots: a desktop player's hi-res atlas
    // is ~26.7 MB, a rival's half-tier one ~1.7 MB, and 36 slots of the former was
    // up to ~960 MB of GPU while a garage browsed liveries. The live set (player
    // hi-res + the field + photo mode's six) is ~110 MB, so 160 MB evicts only the
    // browsed-away ones. A canvas with no numeric size counts 0 (tests, stubs).
    const DECAL_TEX_BYTES_MAX = 160 * 1024 * 1024;
    const _decalTexBytes = {};   // key -> estimated GPU bytes (RGBA + mip chain)
    const atlasBytes = (canvas) => canvas && canvas.width > 0 && canvas.height > 0
      ? Math.round(canvas.width * canvas.height * 4 * 4 / 3) : 0;
    // Evict the least recently drawn until under both budgets; `keep` (the atlas
    // just minted or swapped in) is never the victim.
    function trimDecalCache(keep) {
      for (;;) {
        let bytes = 0;
        for (let i = 0; i < _decalTexOrder.length; i++) bytes += _decalTexBytes[_decalTexOrder[i]] || 0;
        if (_decalTexOrder.length <= 1 || (_decalTexOrder.length <= DECAL_TEX_CACHE_MAX && bytes <= DECAL_TEX_BYTES_MAX)) return;
        let oi = -1, ot = Infinity;
        for (let i = 0; i < _decalTexOrder.length; i++) {
          if (_decalTexOrder[i] === keep) continue;
          const u = _decalTexUse.get(_decalTexOrder[i]);
          if (u === undefined) { oi = i; break; }
          if (u < ot) { ot = u; oi = i; }
        }
        if (oi < 0) return;
        dropDecalTexture(_decalTexOrder[oi]);
      }
    }
    // Free one cached atlas and forget every record of it. The ONE place a decal
    // texture leaves the cache: invalidation, LRU eviction and photo release.
    function dropDecalTexture(key) {
      const tex = _decalTexCache[key];
      if (tex && G.gfx.freeTexture) G.gfx.freeTexture(tex);
      delete _decalTexCache[key]; delete _decalTexFail[key]; delete _decalTexBytes[key];
      _decalTexUse.delete(key); _photoKeys.delete(key);
      _hiResDone.delete(key); _hiResPending.delete(key); _hiResFail.delete(key);
      const oi = _decalTexOrder.indexOf(key); if (oi >= 0) _decalTexOrder.splice(oi, 1);
      // A deferred hi-res swap parks the preview in _hiResGrave until the next
      // bind. Invalidate / LRU / photo-release must free that parked tex now
      // — otherwise a color-save leaks the preview (custom-team.spec.js).
      if (_hiResGrave.length) {
        for (let i = _hiResGrave.length - 1; i >= 0; i--) {
          const g = _hiResGrave[i];
          if (!g || g.key !== key) continue;
          if (g.tex && g.tex !== tex && G.gfx && G.gfx.freeTexture) G.gfx.freeTexture(g.tex);
          _hiResGrave.splice(i, 1);
        }
      }
    }
    function invalidateDecalTextures(teamId) {
      const prefix = teamId + ":";
      Object.keys(_decalTexCache).forEach(function (key) {
        if (key.indexOf(prefix) === 0) dropDecalTexture(key);
      });
    }

    // PHOTO MODE ATLASES. A close-up is what photo mode is for, so a rival
    // drawn there asks for the player-tier PREVIEW atlas (":P", 1024 on desktop)
    // instead of its half-size one. Hi-res (2048) is the real player car only —
    // photo rivals never schedule the deferred kick. It used to ask on EVERY
    // drawn car: entering photo mode on a grid built ~21 full atlases in one
    // frame. Now, per rendered frame: at most ONE new player-tier preview,
    // for the uncached car nearest the photo camera; at most PHOTO_ATLAS_MAX
    // of them at once; a car waiting its turn draws its half-tier atlas; and
    // all of them are freed on the first frame after photo mode closes.
    // Never the player's own ":P".
    const PHOTO_ATLAS_MAX = 6;
    const _photoKeys = new Map();   // photo-minted ":P" key -> { f: frame last drawn, d2: camera distance² then }
    let _photoFrame = 0, _photoMint = null, _photoOn = false;
    function releasePhotoAtlases() {
      for (const key of [..._photoKeys.keys()]) dropDecalTexture(key);
    }
    // Once per frame, before the decal queue is drawn: mark which full atlases
    // this frame draws, and pick the one car allowed to mint.
    function planPhotoAtlases() {
      _photoMint = null;
      if (!G.photoMode) {
        if (_photoOn) releasePhotoAtlases();
        _photoOn = false;
        return;
      }
      _photoOn = true;
      _photoFrame++;
      const eye = G.camEye;
      let best = null, bestD2 = Infinity;
      for (let i = 0; i < _decalCount; i++) {
        if (_decalSetup[i]) continue;                    // the player's car: its own tier already
        const key = decalKeyFor(_decalTeams[i], _decalNums[i], true);
        const m = _decalMats[i];
        const dx = m[12] - eye[0], dy = m[13] - eye[1], dz = m[14] - eye[2], d2 = dx * dx + dy * dy + dz * dz;
        const rec = _photoKeys.get(key);
        if (rec) { rec.f = _photoFrame; rec.d2 = d2; continue; }
        if (key in _decalTexCache) continue;              // cached for another reason (a failed build's null)
        if (d2 < bestD2) { bestD2 = d2; best = key; }
      }
      if (best === null) return;
      if (_photoKeys.size < PHOTO_ATLAS_MAX) { _photoMint = best; return; }
      // Full: evict one not drawn this frame, else the farthest drawn one if the
      // newcomer is nearer by a margin (10 % in distance, so two cars at nearly
      // the same range do not trade the slot every frame).
      let victim = null, vf = Infinity, far = null, farD2 = -1;
      for (const [k, r] of _photoKeys) {
        if (r.f < _photoFrame) { if (r.f < vf) { vf = r.f; victim = k; } }
        else if (r.d2 > farD2) { farD2 = r.d2; far = k; }
      }
      if (victim === null && far !== null && bestD2 < farD2 * 0.81) victim = far;
      if (victim === null) return;
      dropDecalTexture(victim);
      _photoMint = best;
    }
    // The atlas a car draws with. Photo mode upgrades a rival only when its full
    // player-tier preview exists or this frame's plan picked it; otherwise the
    // half tier. 2048 is the real player car only (getCarDecalTexture 4th arg).
    function decalTextureFor(team, num, usePlayerSetup) {
      if (usePlayerSetup || !G.photoMode) return getCarDecalTexture(team, num, usePlayerSetup);
      const key = decalKeyFor(team, num, true);
      if (_photoKeys.has(key) || key === _photoMint) {
        const minting = key === _photoMint;
        if (minting) _photoMint = null;                   // one per frame, whatever happens next
        const tex = getCarDecalTexture(team, num, true, false);
        if (minting && tex) _photoKeys.set(key, { f: _photoFrame, d2: 0 });
        if (tex) return tex;
      }
      return getCarDecalTexture(team, num, false);
    }
    // The livery half of the atlas key, memoised on G.store.rev like teamMeshKey:
    // G.getLiveryId() is a store read (two string concats + a JSON decode) and this
    // ran once per drawn car per FRAME — ~22 times — for a value that only moves
    // when something is written to the store.
    // The entry also memoises each FULL key (prefix + num [+ ":P"]) like
    // teamMeshKeyFor, so a per-car-per-frame hit concatenates nothing.
    const _decalPrefixCache = new Map();
    function decalKeyEntry(team) {
      const c = _decalPrefixCache.get(team.id);
      if (c && c.rev === G.store.rev) return c;
      const val = team.id + ":" + G.getLiveryId(team.id) + ":";
      const e = { val, rev: G.store.rev, full: new Map(), fullP: new Map() };
      _decalPrefixCache.set(team.id, e);
      return e;
    }
    function decalKeyFor(team, num, isPlayer) {
      const e = decalKeyEntry(team), m = isPlayer ? e.fullP : e.full;
      let k = m.get(num);
      if (k === undefined) { k = e.val + (num == null ? "_" : num) + (isPlayer ? ":P" : ""); m.set(num, k); }
      return k;
    }
    // TLX exposes the three.Texture on the createTexture handle. Raise its
    // anisotropy for player / garage atlases so sponsor boards stay crisp at
    // grazing 3/4 angles. GLX/WGX already apply their own cap inside
    // createTexture (4×) — those handles have no `.tex`, so this is a no-op.
    // TLX also receives this sampler before eager upload can release its canvas.
    function crispPlayerDecal(t) {
      const tex = t && t.tex;
      if (!tex || typeof tex.anisotropy !== "number") return t;
      try {
        if (tex.anisotropy < 8) { tex.anisotropy = 8; tex.needsUpdate = true; }
      } catch (_) { /* renderer may clamp; ignore */ }
      return t;
    }
    // Desktop player hi-res (2048×2560, ~26.7 MB) is DEFERRED: boot / garage
    // open / warmCarAssets / prepareMenuCarAssets sync-upload the 1024 preview
    // only, then requestIdleCallback (setTimeout fallback) swaps in the full
    // atlas. AI, mobile, and photo-mode rivals never schedule — atlasDiv has
    // no larger upload, and photo rivals stay on the preview.
    const _hiResPending = new Map(), _hiResDone = new Set();   // pending: key -> the kick that owns it
    // A failed build used to retry on every draw (each a 2048 paint). Two tries per
    // key, like the sync path's three; an invalidate / eviction forgets the count.
    const HIRES_TRIES = 2, _hiResFail = new Map();
    const _hiResGrave = [];   // {key, tex} prev preview; free AFTER the next bind
    function reapHiResGrave() {
      if (!_hiResGrave.length) return;
      if (G.gfx && G.gfx.freeTexture) {
        for (let i = 0; i < _hiResGrave.length; i++) G.gfx.freeTexture(_hiResGrave[i].tex);
      }
      _hiResGrave.length = 0;
    }
    // C-P3 (perf hunt 4): the idle slot only picked WHEN the 2048x2560 atlas uploaded — the upload itself
    // (WGX copyExternalImageToTexture from a canvas, GLX/TLX texImage2D with UNPACK_FLIP_Y + PREMULTIPLY
    // from a canvas) still blocked the main thread 45-100 ms once per race. Now the painted canvas goes
    // through createImageBitmap(), which does the orientation / premultiply conversion as its own step
    // and hands back a bitmap every backend's createTexture() uploads WITHOUT that conversion.
    //   GLX   : WebGL ignores UNPACK_FLIP_Y_WEBGL / UNPACK_PREMULTIPLY_ALPHA_WEBGL for an ImageBitmap
    //           source — the bitmap's own creation options apply instead (three's ImageBitmapLoader doc
    //           says the same of Texture.flipY / premultiplyAlpha) — so GLX gets the flip BAKED IN.
    //   TLX   : three flips in the copy (WebGPU: copyExternalImageToTexture flipY; WebGL: TextureNode's
    //           uv flip for `image instanceof ImageBitmap && flipY`), so it gets an UNFLIPPED bitmap.
    //   WGX   : copies with flipY:true itself, so it gets an UNFLIPPED bitmap too.
    // Premultiply is baked for all three (a premultiplied source is copied as-is by WebGPU and ignored-
    // flag by WebGL). GLX and WGX copy inside createTexture, so the bitmap is closed right after; three
    // keeps texture.image (its flipY uniform tests the instance), so on TLX it stays until the texture
    // is freed. Texel parity is the contract: tests/unit/livery-tier.test.mjs (APEX_LIVERY_PARITY=1) byte-diffs both paths in Chromium.
    // apex26.liveryAsync=0 restores the synchronous canvas upload.
    // Read per kick (one per race), so the knob needs no reboot and no boot-order dependency on the store.
    function liveryAsyncOn() {
      try { const v = G.store && G.store.get ? G.store.get("liveryAsync", 1) : 1; return !(v === 0 || v === "0" || v === false); } catch (_) { return true; }
    }
    function liveryBitmapOpts(backend) {
      return backend === "three" || backend === "webgpu"
        ? { premultiplyAlpha: "premultiply" }
        : { imageOrientation: "flipY", premultiplyAlpha: "premultiply" };
    }
    // Promise<ImageBitmap> for the painted atlas, or null when the sync path must be taken.
    function liveryBitmap(canvas) {
      if (typeof createImageBitmap !== "function" || !liveryAsyncOn()) return null;
      try {
        const p = createImageBitmap(canvas, liveryBitmapOpts(G.gfx && G.gfx.backend));
        return p && typeof p.then === "function" ? p : null;
      } catch (_) { return null; }
    }
    function closeBitmap(b) { try { if (b && typeof b.close === "function") b.close(); } catch (_) { /* already closed */ } }
    function schedulePlayerHiRes(team, num, key) {
      if (typeof LiveryTex === "undefined" || !LiveryTex.playerHiResDeferred) return;
      if (!LiveryTex.playerHiResDeferred(!!LiveryTex.IS_MOBILE)) return;
      if (_hiResDone.has(key) || _hiResPending.has(key) || (_hiResFail.get(key) || 0) >= HIRES_TRIES) return;
      // The livery is resolved NOW, with the key (decalKeyFor embeds its id): the idle
      // slot can fire after the garage moved on, and building from the livery selected
      // THEN stored another livery's pixels under this key (A -> B -> A).
      const livery = deps.resolveLivery(team);
      // Re-checked after every await: the idle slot and the bitmap can both land after the garage moved on.
      const owns = () => _hiResPending.get(key) === kick   // dropped, maybe re-scheduled: the newer kick owns the key
        && (key in _decalTexCache)                          // LRU / invalidate won the race
        && decalKeyFor(team, num, true) === key;            // livery changed since: its next draw re-schedules
      const done = () => { if (_hiResPending.get(key) === kick) _hiResPending.delete(key); };
      const fail = (e) => {
        _hiResFail.set(key, (_hiResFail.get(key) || 0) + 1);
        Log.warn("gfx", "deferred hi-res decal atlas failed for " + key, e);
        done();
      };
      // `src` is the bitmap (async path) or the canvas itself (sync path / a refused bitmap).
      const finish = function (src, canvas) {
        const bitmap = src !== canvas ? src : null;
        let keep = false;
        try {
          if (!owns()) return;
          const transfer = !!bitmap && G.gfx.backend === "three";
          const next = crispPlayerDecal(G.gfx.createTexture(src, transfer ? { disposeSource: closeBitmap, anisotropy: 8 } : { anisotropy: 8 }));
          if (!next) throw new Error("no texture");   // keep the preview rather than cache a null over it
          keep = transfer;   // TLX owns this bitmap until Texture.dispose; GLX/WGX already copied it
          const prev = _decalTexCache[key];
          _decalTexCache[key] = next;
          _decalTexBytes[key] = atlasBytes(canvas);
          _hiResDone.add(key);
          if (prev && prev !== next) _hiResGrave.push({ key: key, tex: prev });
          if (typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(next);
          trimDecalCache(key);   // the swap grew this key's bytes
        } catch (e) {
          fail(e);
        } finally {
          if (bitmap && !keep) closeBitmap(bitmap);
          done();
        }
      };
      const kick = function () {
        try {
          if (!owns()) { done(); return; }
          if (!G.gfx || !G.gfx.createTexture) { done(); return; }
          const canvas = LiveryTex.buildAtlas(team.id, livery, num, true, true);
          const bmp = liveryBitmap(canvas);
          if (!bmp) { finish(canvas, canvas); return; }
          // The kick keeps the key until finish(): a second draw must not schedule a twin.
          bmp.then(function (b) { finish(b, canvas); }, function (e) {
            Log.info("gfx", "livery bitmap refused, uploading the canvas: " + (e && e.message || e));
            finish(canvas, canvas);
          });
        } catch (e) {
          fail(e);
        }
      };
      _hiResPending.set(key, kick);
      const enqueue = function () {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(function (deadline) {
            if (!owns()) { done(); return; }
            if (deadline && (deadline.didTimeout ||
                (typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 10))) {
              enqueue();
              return;
            }
            kick();
          });
        } else {
          setTimeout(kick, 0);
        }
      };
      enqueue();
    }
    function getCarDecalTexture(team, num, isPlayer, allowHiRes) {
      if (typeof LiveryTex === "undefined" || !G.gfx.createTexture) return null;
      // isPlayer is part of the key: on the mobile tier the player's atlas uploads
      // at 512² and AI atlases at 256², so a team the player later switches to
      // must not reuse a cached AI-resolution atlas (and vice versa).
      const key = decalKeyFor(team, num, isPlayer);
      const wantHi = !!isPlayer && allowHiRes !== false;
      if (key in _decalTexCache) {
        _decalTexUse.set(key, ++_decalTexTick);   // a hit promotes
        // A cache hit that never got a hi-res pass (e.g. warmed as preview)
        // still schedules — idempotent via _hiResPending / _hiResDone.
        if (wantHi) schedulePlayerHiRes(team, num, key);
      } else {
        let t = null;
        try {
          // Sync path is ALWAYS the preview tier for the player (hiRes false).
          // Full 2048 is schedulePlayerHiRes only — never boot / garage-open.
          const canvas = LiveryTex.buildAtlas(team.id, deps.resolveLivery(team), num, !!isPlayer, false);
          t = G.gfx.createTexture(canvas, isPlayer ? { anisotropy: 8 } : undefined);
          if (isPlayer) t = crispPlayerDecal(t);
          _decalTexBytes[key] = atlasBytes(canvas);
        }
        catch (e) {
          // Swallowed AND cached as null before: one transient miss stripped that
          // team's numbers/sponsors for the session, unlogged. Log and retry — but
          // this runs per drawn car per FRAME, so cache the null after 3 tries.
          const n = _decalTexFail[key] = (_decalTexFail[key] || 0) + 1;
          if (n === 1) Log.warn("gfx", "decal atlas build failed for " + key, e);
          if (n < 3) return null;
        }
        _decalTexCache[key] = t; _decalTexOrder.push(key); _decalTexUse.set(key, ++_decalTexTick);
        if (wantHi && t) schedulePlayerHiRes(team, num, key);
        // LRU: browsing liveries minted page-lifetime ~7 MB atlases; the least
        // recently drawn goes, never one the field drew this frame (nor, by the
        // byte budget, the atlas just minted).
        trimDecalCache(key);
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
    // [factory, player] maps of team.id -> state; rev/leg compared as parts, no
    // per-call key or "rev|legality" string (this runs per drawn car per frame).
    const _aeroLevelCache = [new Map(), new Map()];
    const _aeroCustom = new Map();   // team.id -> Map(stamp -> state); hit path allocates nothing
    const AERO_CUSTOM_CACHE_MAX = 32;
    let _aeroCustomTick = 0;
    function teamDecalState(team, usePlayerSetup, setup, stamp) {
      if (setup) {
        let byTeam = _aeroCustom.get(team.id);
        if (!byTeam) { byTeam = new Map(); _aeroCustom.set(team.id, byTeam); }
        const leg = Parts.legalityKey();
        const key = stamp || "";
        const c = byTeam.get(key);
        if (c && c.leg === leg) { c.lastUse = ++_aeroCustomTick; return c; }
        const parts = Parts.getVisualTiers(setup, team);
        const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2,
                        aero: Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null,
                        parts, rev: -1, leg, fwKey: null, lastUse: ++_aeroCustomTick };
        byTeam.set(key, state);
        // Career upgrades change the stamp for years of builds. Retain the
        // recent recipes, including both seats of every active team, rather
        // than keeping every historical visual tier graph for the tab's life.
        if (byTeam.size > AERO_CUSTOM_CACHE_MAX) {
          let oldestKey, oldestUse = Infinity;
          for (const [k, cached] of byTeam) {
            if (cached.lastUse < oldestUse) { oldestKey = k; oldestUse = cached.lastUse; }
          }
          byTeam.delete(oldestKey);
        }
        return state;
      }
      const cache = _aeroLevelCache[usePlayerSetup ? 1 : 0];
      // Factory: the ruleset (Parts.setLegality) is the only thing that moves it.
      const rev = usePlayerSetup ? G.store.rev : -1, leg = Parts.legalityKey();
      const c = cache.get(team.id);
      if (c && c.rev === rev && c.leg === leg) return c;
      const resolved = usePlayerSetup ? G.getTeamParts(team.id) : Parts.getFactorySetup(team);
      const parts = Parts.getVisualTiers(resolved, team);
      // aero: the resolved RECIPE, resolved once here for every flap consumer.
      // parts.aero is the tier NUMBER — passing that to Car3D.aeroFlaps() NaN'd
      // every flap vertex and made the moveable wings invisible (see aeroStyleOf).
      const state = { val: Car3D.aeroLevelOf ? Car3D.aeroLevelOf(parts) : 2,
                      aero: Car3D.aeroStyleOf ? Car3D.aeroStyleOf(parts) : null,
                      parts, rev, leg, fwKey: null };
      cache.set(team.id, state);
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
      // The car and lamp shadow passes (js/render/shared/shadow-pass.js) fetch every
      // caster with teamMesh(team, car, true) on the FIRST countdown frame: ~12 builds
      // there, unless they are built here behind the loading cover. Same gates as the passes.
      // prepareMenuCarAssets builds them in the menu, so these are normally hits.
      const casters = shadowCastersWanted();
      // FieldLod launch warm is VISUAL only. Skip it when there is no hitch to
      // hide: headlessMode, or an inert gfx stub (game-vm omits mirrorBegin /
      // present — see tools/lib/game-vm.cjs). game-vm's inert gfx omits
      // mirrorBegin on purpose (and has no casters); a real backend always
      // exposes the mirror API even when the HUD mirror is off.
      const gfx = G.gfx || {};
      const lodWarm = FieldLod.on && !G.headlessMode &&
        !!(casters || typeof gfx.mirrorBegin === "function");
      const sliced = carWarmSliceOn();
      for (let i = 0; i < G.cars.length; i++) {
        const c = G.cars[i];
        try {
          for (let ph = 0; ph < WARM_PHASES; ph++) warmCarPhase(c, ph, casters, lodWarm, sliced);
        } catch (e) { Log.warn("gfx", "car asset warm-up failed for " + (c.team && c.team.id), e); }
      }
      Log.info("gfx", "race car assets ready", { cars: G.cars.length, casters, lodWarm, cpuMs: Math.round(performance.now() - at) });
    }
    // ONE CAR'S WARM, IN FOUR PHASES — each one heavy piece, so the stepped
    // variant below can yield between them (perf hunt 4 F3.3: the whole field in
    // one task measured 0.91 s GLX, 1.05 s three/WebGL2, 1.10 s three/WebGPU and
    // 3.17 s WGX on the macOS census, spa dusk, census 471). The sync path runs
    // all four back to back under one try per car, in today's order.
    //   0 body (+ the cockpit body)   1 livery atlas   2 caster (+ cockpit caster)
    //   3 the LAUNCH's FieldLod set: planted wheels, the flap solve, flame, ERS lamp
    const WARM_PHASES = 4;
    function warmCarPhase(c, ph, casters, lodWarm, sliced) {
      if (ph === 0) {
        if (c.isPlayer) playerBodyMesh(c.team, c); else teamBodyMesh(c.team, c);
        if (c.isPlayer && ["cockpit", "helmet"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitBodyMesh(c.team, c);
      } else if (ph === 1) {
        const tex = getCarDecalTexture(c.team, carDecalNum(c.team, c), !!c.isPlayer);
        // TLX defers every canvas to its first draw (gfx.js uploadTexture): push it
        // now, as the menu prep does, or the first warm frame uploads the field's
        // atlases in one go. GLX / WGX upload inside createTexture (no method).
        if (sliced && tex && typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(tex);
      } else if (ph === 2) {
        if (casters) teamMesh(c.team, c, true);
        if (casters && c.isPlayer && ["cockpit", "helmet", "visor"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitShadowMesh(c.team, c);
      } else if (lodWarm) {
        // What the LAUNCH first draws (FieldLod): the planted field wheels and
        // the exhaust flame quad — each was built on its first draw, after the
        // lights, in the frame the field pulled away. (The caster silhouette is
        // phase 2.) The HUD mirror and the PiP draw these same body and
        // wheel meshes (drawMirrorCar). NOT a whole-car teamMesh per rival: one
        // each cost ~5 s of CPU here (game-vm track build 4 s -> 9 s), and no
        // procedural pass draws a rival with one (past 120 m it only drops its decal).
        if (!c.isPlayer) getFieldWheelMeshes(c.team, c);
        // The wing-flap hinge solve (Car3D.aeroFlaps, ~30-225 ms per recipe, memoised):
        // every rival draws its flap set at any range now, so solve it behind the cover.
        if (!c.isPlayer) warmFlaps(c);
        CarMesh.getExhaustFlame(c.fuelVisual && c.fuelVisual.fxFlame);
        if (c.isPlayer) CarMesh.getErsLight();
      }
    }
    // The flap set a rival draws (teamDecalState's own key): a memo hit after the first car of a recipe.
    function warmFlaps(c) { const aSt = teamDecalState(c.team, false, c.visualSetup, c.visStamp); Car3D.aeroFlaps(aSt.val, aSt.aero); }
    // apex26.carWarmSlice (perf hunt 4 F3.3), default ON: the menu prep also solves the
    // rivals' flaps and builds their planted wheels, the race warm uploads TLX atlases,
    // and warmCarAssetsAsync yields between phases. 0 restores the single-task warm.
    // Read per call, like liveryAsync: no reboot, no boot-order dependency on the store.
    function carWarmSliceOn() {
      try { const v = G.store && G.store.get ? G.store.get("carWarmSlice", 1) : 1; return !(v === 0 || v === "0" || v === false); } catch (_) { return true; }
    }
    // THE STEPPED RACE WARM: warmCarAssets' phases, one per step, yielding once a
    // slice has spent `sliceMs` (the menu prep's 8 ms), so no task holds more than
    // one heavy piece (measured in Node: a body build 20-110 ms cold, a flap solve
    // 20-135 ms per recipe, a caster 16-100 ms; an atlas paint + upload is the
    // browser's). `current()` false between steps abandons it (resolves false);
    // whatever is left builds on first draw, as before this warm existed. Resolves
    // true when every phase ran. Knob 0: the single sync task, today's path.
    // The caller must keep the loading cover up and the grid undrawn until it
    // resolves — a frame drawn between steps would build the rest itself.
    async function warmCarAssetsAsync(current, sliceMs) {
      if (carModelBuf) return true;
      if (!carWarmSliceOn()) { warmCarAssets(); return true; }
      const at = performance.now(), budget = sliceMs > 0 ? sliceMs : 8;
      const casters = shadowCastersWanted(), gfx = G.gfx || {};
      const lodWarm = FieldLod.on && !G.headlessMode && !!(casters || typeof gfx.mirrorBegin === "function");
      const cars = G.cars.slice();
      let sliceAt = performance.now(), cpuMs = 0, maxStepMs = 0, yields = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        for (let ph = 0; ph < WARM_PHASES; ph++) {
          if (performance.now() - sliceAt >= budget) {
            await yieldWarm(); yields++;
            sliceAt = performance.now();
            if (current && !current()) {
              Log.info("gfx", "race car warm abandoned", { at: i, of: cars.length, yields });
              return false;
            }
          }
          const t = performance.now();
          try { warmCarPhase(c, ph, casters, lodWarm, true); }
          catch (e) { Log.warn("gfx", "car asset warm-up failed for " + (c.team && c.team.id), e); }
          const ms = performance.now() - t; cpuMs += ms; if (ms > maxStepMs) maxStepMs = ms;
        }
      }
      Log.info("gfx", "race car assets ready", { cars: cars.length, casters, lodWarm, cpuMs: Math.round(cpuMs),
        maxStepMs: Math.round(maxStepMs), yields, wallMs: Math.round(performance.now() - at) });
      // The census reads RaceEntryProfile marks, not Log.info: one mark carries the step stats.
      if (typeof RaceEntryProfile !== "undefined") RaceEntryProfile.mark("warmCarAssets:steps yields=" + yields + " maxStepMs=" + Math.round(maxStepMs) + " cpuMs=" + Math.round(cpuMs));
      return true;
    }
    // https://developer.chrome.com/blog/use-scheduler-yield — a continuation that keeps
    // its place ahead of other queued tasks; setTimeout(0) where it is missing.
    function yieldWarm() {
      return (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function")
        ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));
    }
    function shadowCastersWanted() {
      const LT = typeof LightTune !== "undefined" && LightTune.LT, gfx = G.gfx || {};
      if (G.headlessMode || !LT) return false;
      const tier = typeof PerfGov === "undefined" ? 0 : PerfGov.tier();
      return !!((gfx.carShadowBegin && LT.carShadow && tier < 3) || (gfx.lampShadowBegin && LT.lampShadow && tier < 2));
    }
    // Prepare visual descriptors only: do not call makeCars(), advance the seeded
    // simulation, replace the live field, or arm a race from a menu. Existing bounded
    // mesh/atlas caches are shared with the real race; expensive work yields in slices.
    async function prepareMenuCarAssets(current) {
      if (carModelBuf || G.headlessMode) return;
      const teamPick = G.teamIdx, driverPick = G.driverIdx, rev = G.store.rev, solo = deps.isTimeTrial() || deps.isQuali();
      const valid = () => current() && !G.headlessMode && !carModelBuf && G.teamIdx === teamPick && G.driverIdx === driverPick && G.store.rev === rev
        && solo === (deps.isTimeTrial() || deps.isQuali());
      const field = [];
      Teams.LIST.forEach((team, ti) => {
        if (!Teams.isReal(team) && ti !== teamPick) return;
        Career.gridDrivers(team).forEach((seat, di) => {
          const d = Career.driverOverride(team.id, di) || seat, isPlayer = ti === teamPick && di === driverPick;
          // makeCars' own keys (carVisual): the player and MY TEAM's hire on the saved build, a career rival on its shelf.
          const c = Object.assign({ team, num: d.num, isPlayer }, carVisual(team, d.num, ti === teamPick && (isPlayer || !!team.custom), G.getTeamParts));
          if (c.isPlayer) field.unshift(c); else if (!solo) field.push(c);
        });
      });
      const visualKey = Teams.LIST[teamPick] ? deps.partsVisualKey(Teams.LIST[teamPick].id) : "";
      // THE SHADOW CASTERS TOO, under warmCarAssets' own gate and key (team, car,
      // true): ~32 ms each, and race entry built ~11 (~0.38 s) behind the card.
      // Each is a step of its own after its car, so a slice still holds one
      // build; a team's second seat shares the ":sh" key and is a cache hit.
      // Every car carries carVisual's stamp, so a caster keys as the race's car
      // does (the player's and a career rival's OWN build included).
      // warmCarAssets keeps its call, all hits after this (and the safety net).
      const casters = shadowCastersWanted();
      const steps = casters ? field.flatMap(c => [c, { caster: c }]) : field;
      // AND THE LAUNCH'S FIELD-LOD SET (perf hunt 4 F3.3, apex26.carWarmSlice): every
      // rival's planted wheels and flap solve (~20-135 ms per recipe, memoised), a step
      // each after the bodies, under warmCarAssets' lodWarm gate — race entry then hits.
      const lodPrep = carWarmSliceOn() && FieldLod.on && !!(casters || typeof G.gfx.mirrorBegin === "function");
      const plan = lodPrep ? steps.concat(field.filter(c => !c.isPlayer).map(c => ({ lod: c }))) : steps;
      let cpuMs = 0, maxCpuMs = 0, sliceAt = performance.now();
      for (const step of plan) {
        // Cache hits need no per-car timer. Yield only after real work spends
        // the slice; still use the actual caches so eviction/settings stay correct.
        if (performance.now() - sliceAt >= 8) {
          await new Promise(resolve => setTimeout(resolve, 32));
          sliceAt = performance.now();
        }
        if (!valid() || (G.gfx.warming && G.gfx.warming())) return;
        const at = performance.now(), c = step.caster || step.lod || step;
        try {
          if (step.lod) { getFieldWheelMeshes(c.team, c); warmFlaps(c); }
          else {
            if (step.caster && c.isPlayer && ["cockpit", "helmet", "visor"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitShadowMesh(c.team, c, visualKey);
            if (step.caster) teamMesh(c.team, c, true);
            else {
              if (c.isPlayer) {
                playerBodyMesh(c.team, c, visualKey);
                if (["cockpit", "helmet"].includes(CamModes.CAM_MODES[G.camMode].id)) cockpitBodyMesh(c.team, c, visualKey);
              } else teamBodyMesh(c.team, c);
              const tex = getCarDecalTexture(c.team, carDecalNum(c.team, c), c.isPlayer);
              if (tex && typeof G.gfx.uploadTexture === "function") G.gfx.uploadTexture(tex);
            }
          }
        } catch (e) { Log.warn("gfx", "selector car asset preparation failed", e); }
        const elapsed = performance.now() - at; cpuMs += elapsed; maxCpuMs = Math.max(maxCpuMs, elapsed);
      }
      // Resolves to its record only when it ran to its end (the export keeps the last: menuCarAssets).
      const done = { cars: field.length, steps: plan.length, casters, lod: lodPrep, cpuMs: Math.round(cpuMs), maxCpuMs: Math.round(maxCpuMs), at: Math.round(performance.now()) };
      Log.info("gfx", "selector car assets ready", done);
      return done;
    }
    function drawCarDecals(team, modelMat, night, num, cockpit, usePlayerSetup, setup, stamp) {
      const state = teamDecalState(team, usePlayerSetup, setup, stamp);
      // A loaded GLB is a static body and does not consume procedural part recipes;
      // keep its overlay on stable default/legacy anchors as setup options change.
      const legacyBody = !!carModelBuf;
      const rl = cockpit ? null : deps.resolveLivery(team);
      const mesh = cockpit ? getCockpitDecalMesh(legacyBody ? null : state.parts, team.id) :
        getCarDecalMesh(state.val, state.parts, legacyBody, team.id, rl.finShape, rl.spineHeight);
      // PHOTO MODE upgrades rivals to the player-tier PREVIEW, lazily: one new
      // preview atlas per frame, nearest the photo camera first, a bounded set,
      // all freed when the mode closes (decalTextureFor / planPhotoAtlases).
      // Desktop AI atlases upload at half size (liverytex atlasDiv) — ample at
      // racing distance; a close-up is the one place that would show.
      // Hi-res 2048 is the real player car only (schedulePlayerHiRes).
      //
      // NOT folded into usePlayerSetup: that argument selects the player's
      // SETUP for teamDecalState above and means something else entirely.
      const tex = decalTextureFor(team, num, usePlayerSetup);
      if (mesh && tex) { _decalOpts.glow = night ? 0.35 : 0; G.gfx.drawDecal(mesh, modelMat, tex, _decalOpts); }
      // The race frees the parked previews once per frame, after its whole decal
      // queue (flushDecals). The garage draws one car straight through here and
      // never flushes, so every livery browsed parked its ~7 MB preview for good.
      if (!_decalFlushing) reapHiResGrave();
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
    const _wq = [], _wqMesh = [], _rq = [], _rqEmis = [], _rqAlpha = [], _rqMesh = [];
    let _wqN = 0, _rqN = 0;
    // R1 (perf hunt 3): on a backend that coalesces (TLX: gfx.coalesce) the OPAQUE wheel layers go out
    // through a sibling of the caller's bag carrying `coalesce`, and the backend draws each wheel mesh
    // of the field as one instanced run. The sibling is refreshed per call (game.js moves emissive per
    // frame) and is never handed to GLX/WGX, whose draws stay exactly as they were. Rings and spin discs
    // (alpha < 1) keep the plain _ringOpts path.
    const _coSib = new WeakMap();
    function coOpt(o) {
      if (!o || G.gfx.coalesce !== true || (o.alpha !== undefined && o.alpha < 1)) return o;
      let s = _coSib.get(o);
      if (!s) { s = {}; _coSib.set(o, s); }
      for (const k in o) s[k] = o[k];
      s.coalesce = true;
      return s;
    }
    // ── decal-queue ─────────────────────────────────────────────────
    // Deferred car-decal batch (same pattern as the blob shadows above):
    // interleaving G.gfx.draw(body) with G.gfx.drawDecal per car costs ~2
    // program+state flips per car, ~44/frame with a full field. Record each drawn
    // car's decal params here and flush them in ONE decal-program block right
    // after the loop. Decals are depth-tested but write neither depth nor alpha,
    // so drawing them after the bodies/wheels/rings resolves identically.
    const _decalMats = [];    // pool of Float32Array(16), reused across frames
    const _decalTeams = [];
    const _decalNums = [];
    const _decalCockpit = [];
    const _decalSetup = [];
    const _decalVis = [];
    const _decalStamp = [];
    let _decalCount = 0;
    function queueCarDecals(team, modelMat, num, cockpit, usePlayerSetup, setup, stamp) {
      let m = _decalMats[_decalCount];
      if (!m) { m = new Float32Array(16); _decalMats[_decalCount] = m; }
      m.set(modelMat);
      _decalTeams[_decalCount] = team;
      _decalNums[_decalCount] = num;
      _decalCockpit[_decalCount] = !!cockpit;
      _decalSetup[_decalCount] = !!usePlayerSetup;
      _decalVis[_decalCount] = setup || null;
      _decalStamp[_decalCount] = stamp || null;
      _decalCount++;
    }
    // ── cockpit-wheels-model ────────────────────────────────────────
    // The cockpit body: the REAL car (livery, nose, mirrors, number board) minus
    // the driver helmet the camera sits inside. Cached per team like playerBodies.
    const cockpitBodies = {};
    const cockpitBodyOrder = [];
    // The last key's inputs, so the per-frame call (default camera) builds no
    // string and no closure on a hit — the hoisted factory reads _cb*.
    let _cbTeam = null, _cbId = null, _cbVk = null, _cbHalo = null, _cbBody = null, _cbNum = null, _cbKey = "", _cbShKey = "";
    function buildPendingCockpitBody() {
      const team = _cbTeam, liv = deps.resolveLivery(team);
      return G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, teamId: team.id, noWheels: true, noDriver: true, cockpit: true, cockpitBody: CockpitOpts.body(), halo: _cbHalo, num: _cbNum,
          parts: Parts.getVisualTiers(G.getTeamParts(team.id), team) }));
    }
    // The first-person SHADOW caster: the WHOLE exterior car (wheels, engine
    // cover/airbox, fin, rear wing) as a depth silhouette minus only what made
    // #840's blobs — no driver (helmet crown ~0.83 m), and the player's OWN halo
    // in place of the factory hoop and its head-surround attachments (Car3D
    // ownHalo). Casting the cockpit build itself (no wheels, no rear assembly)
    // left a hollow, wheelless half-car on the road.
    function buildPendingCockpitShadow() {
      const team = _cbTeam, liv = deps.resolveLivery(team);
      return G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, teamId: team.id, silhouette: true, noDriver: true, ownHalo: true, halo: _cbHalo, num: _cbNum,
          parts: Parts.getVisualTiers(G.getTeamParts(team.id), team) }));
    }
    function cockpitKey(team, car, visualKey) {
      // Player-only (drawCockpitRig runs on c.isPlayer), so the cached playerVisualKey
      // is always this team's key — no per-frame partsVisualKey() rebuild.
      const num = carDecalNum(team, car), haloSz = CockpitOpts.haloSize();   // 0 off, 1 slim, 2 standard, 3 thick, 4 faired
      const body = CockpitOpts.body();
      if (team.id !== _cbId || visualKey !== _cbVk || haloSz !== _cbHalo || body !== _cbBody || num !== _cbNum) {
        _cbKey = team.id + ":" + visualKey + ":H" + haloSz + ":B" + CockpitOpts.body() + ":" + num;   // halo size keys the cache: a change rebuilds, no reload
        _cbShKey = _cbKey + ":FP";   // the first-person caster: same cache (and wipes), its own key
        _cbId = team.id; _cbVk = visualKey; _cbHalo = haloSz; _cbBody = body; _cbNum = num;
      }
      _cbTeam = team;
    }
    function cockpitBodyMesh(team, car, visualKey = playerVisualKey) {
      cockpitKey(team, car, visualKey);
      return putBoundedMesh(cockpitBodies, cockpitBodyOrder, _cbKey, buildPendingCockpitBody, COCKPIT_BODY_CACHE_MAX);
    }
    function cockpitShadowMesh(team, car, visualKey = playerVisualKey) {
      cockpitKey(team, car, visualKey);
      return putBoundedMesh(cockpitBodies, cockpitBodyOrder, _cbShKey, buildPendingCockpitShadow, COCKPIT_BODY_CACHE_MAX);
    }
    // THE PLAYER'S SHADOW CASTER IN A FIRST-PERSON VIEW (ShadowPass.resolvePlayer,
    // deps.cockpitCaster): in cockpit, helmet and visor, cockpitShadowMesh at the
    // matrix the car loop's cockpit branch draws the body with — the same mode
    // test, and GameCams.cockpitViewmodelAxes over the same inputs (the player's
    // road sample and interpolated yawVis, the final eye, the mode's seat),
    // written into `out`, so the body's self-shadow lines up with the body the
    // player sees. null in every other view: the exterior silhouette casts.
    // Pinned against game.js's branch: tests/unit/car-presentation-canary.test.mjs.
    const _ckR = [0, 0, 0], _ckU = [0, 1, 0], _ckF = [0, 0, 0], _ckP = [0, 0, 0];
    function cockpitCaster(c, smp, yv, out) {
      const id = !G.dbgCam && (G.state === "race" || G.state === "count") ? CamModes.CAM_MODES[G.camMode].id : "";
      if (id !== "cockpit" && id !== "helmet" && id !== "visor") return null;
      const seat = id === "visor" ? "visor" : "cockpit";
      GameCams.cockpitViewmodelAxes(smp.r, smp.t, yv, G.camEye, _ckR, _ckU, _ckF, _ckP, GameCams.seatFwd(seat), GameCams.seatUp(seat));
      out[0] = _ckR[0]; out[1] = _ckR[1]; out[2] = _ckR[2]; out[3] = 0;
      out[4] = _ckU[0]; out[5] = _ckU[1]; out[6] = _ckU[2]; out[7] = 0;
      out[8] = _ckF[0]; out[9] = _ckF[1]; out[10] = _ckF[2]; out[11] = 0;
      out[12] = _ckP[0]; out[13] = _ckP[1]; out[14] = _ckP[2]; out[15] = 1;
      return cockpitShadowMesh(c.team, c);
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
    // Sky-tint fallback is a MATTE card of the current TOD env — not a shiny
    // dielectric. roughness 0.08 / specular 0.7 made it pick up lamp speculars
    // and a stale day env cube so Monaco night glass read luma 0.39–0.58 against
    // a 0.05 road (Lighting 2026-10-14). Matte + night mesh colours keep it
    // within ~1.5× of the scene.
    const _mirrorFbOpts = { doubleSided: true, roughness: 0.92, specular: 0.06, emissive: 0.55, clearcoat: 0 };
    // THE HOUSINGS' GLASS: the HUD mirror's own rear view, LIVE, while that pass
    // is drawing — gfx.drawMirrorGlass maps the target the pass rendered before
    // this frame's begin() onto the lens (car-mesh.js getMirrorGlass), no second
    // render. Anything else — the pass not drawing (MIRROR AUTO on a software GPU,
    // OFF, collapsed), or the backend refusing (no image yet, a dead target, the
    // PiP) — gets the sky-tint fallback. Exactly one of the two, every frame.
    const _glassBase = new Float32Array(16);
    let _glassQuads = null, _glassLive = 0, _glassFb = 0;
    function drawMirrorLens(c, base, nite) {
      const cm = teamDecalState(c.team, true).parts, vis = cm && cm._visual && cm._visual.cockpit;
      const quads = Car3D.cockpitMirrorGlass(vis && vis.mirror), gfx = G.gfx;
      const mp = typeof MirrorPass !== "undefined" ? MirrorPass.instance() : null;
      _glassQuads = quads; _glassBase.set(base);
      const mesh = mp && mp.drawing() && typeof gfx.drawMirrorGlass === "function" ? getMirrorGlass(quads) : null;
      if (mesh && gfx.drawMirrorGlass(mesh, base, null)) { _glassLive++; return true; }
      // Night mesh already holds the current night env colours; emissive near 1
      // just shows them (the old 0.08 × day-sky bands still read as a bright
      // card once lamp specular hit the glossy material). Day keeps the legacy
      // 0.55 lift on the brighter sky bands.
      _mirrorFbOpts.emissive = nite ? 0.85 : 0.55;
      _mirrorFbOpts.roughness = 0.92;
      _mirrorFbOpts.specular = 0.06;
      gfx.draw(getMirrorFallback(quads, !!nite), base, _mirrorFbOpts);
      _glassFb++;
      return false;
    }
    // __apex.mirror().glass (mirror-pass.js state): the live / fallback draw
    // counts and, projected on demand through the main camera, the two glasses
    // as last drawn — per glass its [a, b, c, d] corners (inboard-low,
    // outboard-low, outboard-high, inboard-high) as canvas fractions, top-left
    // origin. hud-mirror.spec.js samples the presented frame there.
    function glassState() {
      const vp = G.frame && G.frame.viewProj, b = _glassBase;
      const screen = _glassQuads && vp ? _glassQuads.map((q) => q.map((p) => {
        const w = [0, 1, 2].map((i) => b[i] * p[0] + b[4 + i] * p[1] + b[8 + i] * p[2] + b[12 + i]);
        const cl = [0, 1, 3].map((i) => vp[i] * w[0] + vp[4 + i] * w[1] + vp[8 + i] * w[2] + vp[12 + i]);
        return cl[2] > 1e-6 ? [(cl[0] / cl[2] + 1) / 2, (1 - cl[1] / cl[2]) / 2] : null;
      })) : null;
      return { live: _glassLive, fallback: _glassFb, screen };
    }
    const _rmq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const motionReduced = () => !!(_rmq && _rmq.matches)   // the OS flag OR MOTION: REDUCED (html[data-motion]), as game.js
      || (typeof document !== "undefined" && !!document.documentElement && document.documentElement.dataset.motion === "reduce");
    // Windscreen / aeroscreen glass: a faint tint that still shows the road.
    const _glassOpts = { alpha: 0.16, roughness: 0.05, specular: 0.9, doubleSided: true, noAlphaWrite: true };
    const _rigFx = { doubleSided: true, emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true }, _rigFxA = { doubleSided: true, emissive: 1.0, roughness: 0.9, specular: 0, noAlphaWrite: true, alpha: 1 };
    function drawCockpitRig(c, base, dt, paint, noWheel) {
      // Match game.js sessionDarkFor / skyNight: an explicit night, or a night
      // circuit on the default TOD. (Was the same check; kept next to the glass
      // so a wrong flag cannot leave the day sky-tint mesh on at night.)
      const nite = G.raceTimeOfDay === "night" || (G.raceTimeOfDay === "default" && G.track.def.night);
      _cockpitOpts.emissive = nite ? 0.20 : 0.14;
      const opt = _cockpitOpts;
      // The actual car around you: body (minus helmet) with the real paint, plus
      // the steering/spinning FRONT wheels (the rears sit right beside the camera
      // in the wide FOV and blob the bottom corners — skipped). Nudged 0.30 m
      // forward of their real physics position so they read further out ahead of
      // the driver instead of hugging the cockpit edge (cosmetic-only offset —
      // the actual wheel/contact-patch physics is untouched).
      // The cockpit CHOICES (js/camera/cockpit-opts.js): VISOR keeps the STANDARD
      // seat (its eye is vantage.js VISOR_EYE_*) and no wheel.
      const wheelStyle = noWheel ? "none" : CockpitOpts.wheel(), lay = CockpitOpts.layout(wheelStyle, noWheel ? "std" : null);
      G.gfx.draw(cockpitBodyMesh(c.team, c), base, paint);
      // The housings' glass: the live rear view, else the sky-tint fallback.
      if (!carModelBuf) drawMirrorLens(c, base, nite);
      // INTERIOR: carbon or team trim; CLASSIC adds gauges and an aeroscreen.
      // Car-local like the body (base), never rolled with the wheel.
      const cab = CockpitOpts.interior();
      G.gfx.draw(getCockpitCabin(cab, deps.resolveLivery(c.team)), base, opt);
      if (cab === "classic") {
        CarMesh.drawClassicTelemetry(base,c,G.dashKph(c.speed || 0),opt);
        G.gfx.draw(getCockpitGlass(cab), base, _glassOpts);
      }
      // The wheel mount follows the seat: hub and scale from the layout.
      _rigT[0] = _rigT[5] = _rigT[10] = lay.wheelS; _rigT[13] = lay.wheelY; _rigT[14] = lay.wheelZ;
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
      // VISOR: the phone in the hand is the wheel — the bodywork stays, the
      // steering wheel and the dash on it do not. What a car with its wheel
      // unclipped shows instead: the column, its quick-release boss and the
      // front bulkhead, fixed where the wheel mounts (no steering roll). The
      // NONE cockpit interior is the same thing by choice.
      if (wheelStyle === "none") {
        M4.mulTo(_rigA, base, _rigT);
        G.gfx.draw(getCockpitDash(), _rigA, opt);
        return;
      }
      // Roll the wheel about the (car-local) column axis by the smoothed steering —
      // works identically for tilt / buttons / touch (steerVis is the resolved,
      // damped steering whatever the input mode). A second, light damping stage
      // (λ12) gives the wheel visual WEIGHT (it settles rather than flicking);
      // the lock is progressive to ~±86° (CarMesh.cockpitWheelRoll).
      c._whlVis = deps.damp(c._whlVis == null ? 0 : c._whlVis, M4.clamp(c.steerVis || 0, -1, 1), CarMesh.WHEEL_ROLL_LAMBDA, dt);
      const a = CarMesh.cockpitWheelRoll(c._whlVis);
      const ca = Math.cos(a), sa = Math.sin(a);
      _rigR[0] = ca; _rigR[1] = sa; _rigR[4] = -sa; _rigR[5] = ca;
      M4.mulTo(_rigA, base, _rigT);
      M4.mulTo(_rigB, _rigA, _rigR);
      G.gfx.draw(getCockpitWheel(deps.resolveLivery(c.team), wheelStyle), _rigB, opt);   // style + livery keyed: team grips/marker/gloves
      // No forearm sleeves (CarMesh.drawForearms): the tubes from the cuffs to
      // the bottom of the frame read as pipes on the wheel (user, 2026-10-04).
      // A wheel with no screen (CLASSIC) has nowhere to show the readouts: the
      // HUD shows gear and speed instead (js/camera/mode-switch.js).
      if (wheelStyle === "retro") {
        CarMesh.drawRetroTelemetry(_rigB,c,G.dashKph(c.speed || 0),G.raceT);
        return;
      }
      if (!CockpitOpts.wheelHasScreen(wheelStyle)) return;
      // Live telemetry ON the wheel (all ride the wheel matrix, like the real LCD):
      // gear (auto or manual — c.gear is maintained by both paths), RPM shift
      // lights, speed, pedal bars, ERS energy.
      const fx = _rigFx;
      G.gfx.draw(getGearDigit(M4.clamp(c.gear || 1, 0, 9)), _rigB, fx);
      const rpmF = M4.clamp(((c.rpm || PhysicsConsts.IDLE_RPM) - PhysicsConsts.IDLE_RPM) / (PhysicsConsts.MAX_RPM - PhysicsConsts.IDLE_RPM), 0, 1);
      // At the limiter the strip stays LIT: full ramp <-> all-blue SHIFT NOW at
      // ~7 Hz (it went 9 <-> 0 — dark half the frames), steady blue under reduced motion.
      G.gfx.draw(getLedStrip(rpmF > 0.965 ? (motionReduced() || G.raceT * 14 % 1 < 0.5 ? 9 : 8) : Math.round(rpmF * 8), wheelStyle), _rigB, fx);
      drawWheelExtras(_rigB, c, G.raceT);   // ACTIVE AERO lamp + flap-travel bar (car-mesh.js)
      // Clamp to 0: a negative c.speed (e.g. hard braking to a near-stop, or a
      // reversing glitch) would otherwise stringify with a "-" character that
      // getSpeedDigit can't parse (+"-" is NaN -> SEG7[NaN] -> crash every frame).
      // ONE formatter with #hud-speed-n (HudReadouts.spdDigits): dash km/h → units → 0..999.
      const dash = G.dashKph(c.speed || 0);
      const kmh = (typeof HudReadouts !== "undefined" && HudReadouts.spdDigits)
        ? HudReadouts.spdDigits(dash)
        : Math.max(0, Math.min(999, typeof AppearanceOpts !== "undefined" ? AppearanceOpts.speed(dash) : Math.round(dash)));
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
      // LEGENDS: ten legends share num 1, so the picked legend's code joins the key
      // and names the lid (Car3D opts.helmetKey); no other team moves (lid undefined).
      const ld = team.id === "legends" && team.drivers ? team.drivers[G.driverIdx | 0] : null, lid = ld && ld.code || undefined;
      const key = team.id + ":" + visualKey + ":" + carDecalNum(team, car) + (lid ? ":" + lid : "");
      const liv = deps.resolveLivery(team);
      return putBoundedMesh(playerBodies, playerBodyOrder, key, () => G.gfx.createMesh(Car3D.build(liv.c1, liv.c2,
        { livery: liv, teamId: team.id, noWheels: true, num: carDecalNum(team, car), helmetKey: lid,
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
    function getPlayerWheelMeshes(team) {
      // livery wheel tints (rimTint / caliperTint) join the key: "" when unset, so today's key is unchanged
      const wt = CarWheels.tints(team && deps.resolveLivery(team));
      const key = playerTyreId + ":" + playerBrakeId + ":" + playerWheelId + wt.key;
      return putBoundedMesh(wheelMeshCache, wheelMeshOrder, key, () => {
        const band = playerTyreVisual && playerTyreVisual.band || Car3D.TYRE_BAND[playerTyreTier];
        const caliper = wt.cal || (playerBrakeVisual ? playerBrakeVisual.cal : Car3D.BRAKE_CALIPER[playerBrakesTier]);
        const rim = wt.rim || (playerBrakeVisual && playerBrakeVisual.rim);
        const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, false,
          playerTyreVisual, playerBrakeVisual, playerWheelVisual, wt.ink);
        const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, false,
          playerTyreVisual, playerBrakeVisual, playerWheelVisual, wt.ink);
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
    // Factory tyre/brake/rim per team, as a planted spinning pair, not glued
    // to the chassis. Own cache so garage swaps
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
    let _fwTints = null;
    let _fwVt = null;   // the pending build for the hoisted factory below (no closure per car per frame)
    function getFieldWheelMeshes(team, car) {
      const setup = car && car.visualSetup;
      const st = setup ? teamDecalState(team, false, setup, car.visStamp) : teamDecalState(team, false);
      const vt = st.parts;   // permanently cached factory resolve — was ~1260 resolveSetup/s across the drawn field
      // A pure function of the cached state's parts, so it is built once per state.
      const wt = CarWheels.tints(deps.resolveLivery(team));   // rimTint / caliperTint: part of the key ("" unset)
      const base = st.fwKey || (st.fwKey = "field:" + (vt._ids ? vt._ids.tyres + ":" + vt._ids.brakes + ":" + vt._ids.wheels : "1:1:1"));
      const key = wt.key ? base + wt.key : base;
      _fwVt = vt; _fwTints = wt;
      return putBoundedMesh(fieldWheelCache, fieldWheelOrder, key, buildPendingFieldWheels, FIELD_WHEEL_CACHE_MAX, freeWheelPair);
    }
    function buildPendingFieldWheels() {
        const vt = _fwVt;
        const tyre = vt._visual && vt._visual.tyres;
        const brake = vt._visual && vt._visual.brakes;
        const wheel = vt._visual && vt._visual.wheels;
        const band = (tyre && tyre.band) || Car3D.TYRE_BAND[vt.tyres] || Car3D.TYRE_BAND[1];
        const wt = _fwTints;
        const caliper = wt.cal || (brake ? brake.cal : Car3D.BRAKE_CALIPER[vt.brakes]);
        const rim = wt.rim || (brake && brake.rim);
        const front = Car3D.buildWheelLayers(0.32, band, caliper, rim, false, tyre, brake, wheel, wt.ink);
        const rear = Car3D.buildWheelLayers(0.38, band, caliper, rim, false, tyre, brake, wheel, wt.ink);
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
    }
    const _cq = [], _cqMesh = [];
    let _cqN = 0;
    // THE STOP'S CREW at a car held in its box (CarMesh.getCrewMesh): the two
    // jacks, a wheel gun at each wheel, and the six people who work them, on
    // the ground in the grounded basis (the jacks lift the car, not
    // themselves). Within 90 m of the camera; nothing for a car that is not
    // stopped. doubleSided: the car basis is a reflection (det −1), and
    // FrontSide alone culls the kit.
    const _crewOpts = { emissive: 0, doubleSided: true };
    let _crewDrawn = 0;   // frames that actually submitted the crew mesh (spec / __apex.pit)
    function drawPitCrew(c, base, opt) {
      if (!c || c.pitState !== "box") return false;
      const dx = base[12] - G.camEye[0], dy = base[13] - G.camEye[1], dz = base[14] - G.camEye[2];
      if (dx * dx + dy * dy + dz * dz > 90 * 90) return false;
      const col = (c.team && c.team.color) || [0.30, 0.32, 0.36];
      const m = getCrewMesh(col);
      if (!m) return false;
      G.gfx.draw(m, base, opt || _crewOpts);
      _crewDrawn++;
      return true;
    }
    function pitCrewDrawn() { const n = _crewDrawn; _crewDrawn = 0; return n; }
    const VIS_WHEELBASE = WHEELS[0].z - WHEELS[2].z;   // the DRAWN axle spacing (3.3 m)
    // `bare` (drawMirrorCar): the 4 rotating wheels at the steer they show and
    // the spin they hold, and nothing else — no fixed layers, compound stripes,
    // spin discs, brake rings or far flares (those are Particles, which a second
    // camera would emit twice). Pass dt 0 with it: the main pass advances the spin.
    function drawPlayerWheels(c, base, dt, opt, frontsOnly, fwdOffset, wScale, bare) {
      const wm = c.isPlayer ? getPlayerWheelMeshes(c.team) : getFieldWheelMeshes(c.team, c);
      c.wheelSpin = ((c.wheelSpin || 0) + (c.speed / PhysicsConsts.WHEEL_R) * dt) % (Math.PI * 2);
      // Fronts have their own spin so a lock-up (c.wheelLock) freezes them while
      // the car still moves; the flat spot it leaves bumps them once per rev.
      c.wheelSpinF = ((c.wheelSpinF || 0) + (c.speed / PhysicsConsts.WHEEL_R) * dt * (1 - (c.wheelLock || 0))) % (Math.PI * 2);
      const spR = Math.sin(c.wheelSpin), cpR = Math.cos(c.wheelSpin);
      const spF = Math.sin(c.wheelSpinF), cpF = Math.cos(c.wheelSpinF);
      const flat = (c.flatSpot || 0) * 0.004 * (0.5 + 0.5 * cpF);
      // FRONT-WHEEL ANGLE (visual). An AI's `steer` is a lane-change command,
      // not a steering angle — its TURNING is the arc it follows — so steerVis
      // sat near 0 through every bend and the field cornered on straight
      // wheels. An AI car adds the Ackermann angle atan(L·k) of the bend under
      // it (kCur; L = the drawn wheelbase; +k is a LEFT turn, +steer is right).
      // AI-ONLY: the arc must not reach a human car (docs/PHYSICS.md). A
      // human's wheels show the driver's input, tapered with speed by the
      // driving model's OWN lock taper (updateCar's lockTaper, 1/(1 + vStd/
      // STEER_SPEED_REF)) — a twitch at 300 km/h no longer draws hairpin lock.
      const WSV = PhysicsConsts.WHEEL_STEER_VIS;
      let steerA = M4.clamp(c.steerVis || 0, -1, 1) * WSV;
      if (!c.human) steerA = M4.clamp(steerA - Math.atan(VIS_WHEELBASE * (c.kCur || 0)), -WSV, WSV);
      else if (G.STEER_SPEED_REF > 0) steerA /= 1 + Math.abs(c.speed || 0) * PhysicsConsts.VMAX / (G.vTop() * G.STEER_SPEED_REF);
      const ws = wScale || 1;   // widen the tyre along its axle (cockpit view)
      const wo = coOpt(opt);    // the opaque layers' bag (R1)
      // The stop, seen (PitLane.stopAnim): a car held in its box is up on its
      // jacks and its wheels come off outward along their axles.
      const anim = c.pitState === "box" && G.pits && G.pits.stopAnim ? G.pits.stopAnim(c) : null;
      const lift = anim ? anim.lift : 0, off = anim ? anim.off : 0;
      // The camera distance, once per car: the brake rings draw within 40 m
      // of a rival (the flare from 40 m out to 240 m); everything else for a
      // rival is gated by the LOD tier below (wheel extras within 50 m).
      let camD2 = 0;
      if (!c.isPlayer && !bare) {
        const dx = base[12] - G.camEye[0], dy = base[13] - G.camEye[1], dz = base[14] - G.camEye[2];
        camD2 = dx * dx + dy * dy + dz * dz;
      }
      // FIELD LOD: past FieldLod.T.WHEEL_EXTRAS_M (reference-lens metres: a
      // long lens keeps them further out) a rival drops spin discs but KEEPS
      // the fixed disc/caliper layer and compound stripe so open rims do not
      // read hollow (tier 1). Past NO_DECAL_M (tier 2) / bare (mirror) it is
      // rotating wheels only. The cut is the tier game.js kept on the car
      // (c._lodTier, with FieldLod's hysteresis); a car with no tier yet
      // (FieldLod off, tests) takes the plain table.
      const lodT = c._lodTier, haveTier = FieldLod.on && (lodT === 0 || lodT === 1 || lodT === 2);
      const lite = bare || (!c.isPlayer && (haveTier ? lodT >= 1 : FieldLod.wheelsLite(camD2, G.lens && G.lens.fovY)));
      // Drop fixed + compound only for bare (mirror) or far (tier 2). Lite
      // (tier 1) keeps them — matches FieldLod.parts().fixedWheels / .compound.
      const dropFixed = bare || (!c.isPlayer && haveTier && lodT >= 2);
      const tyreCol = !dropFixed && c.tyre && c.tyre.colour
        && (c.isPlayer || lite || camD2 < 60 * 60) ? c.tyre.colour : null;
      // SPIN BLUR (CarMesh.getSpinDisc): how far the rim turns THIS frame. Past
      // ~0.6 rad the spokes start to strobe, by 1.8 rad they alias outright, so
      // the disc fades in over that band. Per frame on purpose: a low frame
      // rate aliases sooner, and the blur has to cover what the display shows.
      // Within 120 m of a rival; the player always. Lite (tier ≥ 1) drops it.
      const spinRate = (c.speed / PhysicsConsts.WHEEL_R) * dt;
      const blur = !lite && camD2 < 120 * 120 ? Math.min(1, Math.max(0, (Math.abs(spinRate) - 0.6) / 1.2)) : 0;
      // PAST THE RINGS (a rival beyond 40 m): one cheap additive flare per FRONT
      // disc (Particles.flare — this frame only, outside the pool) on the same
      // brakeHeat. Mostly a night cue: `opt.emissive` is the wheels' night term
      // (game.js sets 0.12 after dark, 0 by day), so by day it is a faint fleck
      // and after dark a braking zone lights up down the straight. Out to
      // 240 m; past that a 0.4 m disc is under a pixel.
      const heatF = c.brakeHeat || 0;
      const flareA = !bare && !c.isPlayer && heatF > 0.15 && camD2 >= 40 * 40 && camD2 < 240 * 240 && typeof Particles !== "undefined"
        ? (heatF - 0.15) / 0.85 * (opt && opt.emissive > 0 ? 0.9 : 0.3) : 0;
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
        L[12] = wd.x + (wd.x < 0 ? -1 : 1) * ((ws - 1) * 0.16 + off); L[13] = wd.y + (wd.front ? flat : 0) + lift; L[14] = wd.z + (fwdOffset || 0); L[15] = 1;
        M4.mulTo(_wheelWorld, base, L);
        G.gfx.draw(wd.rear ? wm.R : wm.F, _wheelWorld, wo);
        if (dropFixed) {
          // Bare (mirror) or far (tier 2): rotating wheel only. The far brake
          // flare (40-240 m, Particles, outside the pool) is exactly this
          // range's cue, so it still fires here.
          if (flareA > 0 && wd.front) {
            const tx = (wd.x < 0 ? -1 : 1) * 0.19, W = _wheelWorld;
            Particles.flare(W[12] + W[0] * tx, W[13] + W[1] * tx, W[14] + W[2] * tx,
              0.16 + 0.10 * heatF, 2.4, 0.85, 0.22, flareA);
          }
          continue;   // brake rings are already off past 40 m
        }
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
        const ringOk = heat > 0.05 && camD2 < 40 * 40;
        // The COMPOUND'S STRIPE on the sidewall (getCompoundRing): the record
        // the car runs on, so a fresh set reads as what it is the moment the
        // stop fits it. Opaque, queued with the fixed layers.
        if (tyreCol) {
          const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.012);
          _cq[_cqN] || (_cq[_cqN] = new Float32Array(16));
          const Wc = _cq[_cqN];
          Wc.set(_wheelWorld);
          Wc[12] += Wc[0] * tx; Wc[13] += Wc[1] * tx; Wc[14] += Wc[2] * tx;
          _cqMesh[_cqN] = getCompoundRing(tyreCol);
          _cqN++;
        }
        if (blur > 0.01) {
          // The disc sits just inside the brake ring's plane so the hot ring
          // still reads over it; same queue, no emissive.
          const tx = (wd.x < 0 ? -1 : 1) * ((wd.rear ? 0.19 : 0.16) + 0.020);
          _rq[_rqN] || (_rq[_rqN] = new Float32Array(16));
          const Wd = _rq[_rqN];
          Wd.set(_wheelWorld);
          Wd[12] += Wd[0] * tx; Wd[13] += Wd[1] * tx; Wd[14] += Wd[2] * tx;
          _rqEmis[_rqN] = 0; _rqAlpha[_rqN] = 0.72 * blur; _rqMesh[_rqN] = getSpinDisc();
          _rqN++;
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
          _rqMesh[_rqN] = null;   // the brake ring
          _rqN++;
        } else if (flareA > 0 && wd.front) {
          const tx = (wd.x < 0 ? -1 : 1) * 0.19, W = _wheelWorld;
          Particles.flare(W[12] + W[0] * tx, W[13] + W[1] * tx, W[14] + W[2] * tx,
            0.16 + 0.10 * heatF, 2.4, 0.85, 0.22, flareA);
        }
      }
      // Run 1: the fixed wheel layers, one bind for up to four draws, then
      // the compound stripes (one shared ring per colour).
      for (let i = 0; i < _wqN; i++) G.gfx.draw(_wqMesh[i], _wq[i], wo);
      for (let i = 0; i < _cqN; i++) G.gfx.draw(_cqMesh[i], _cq[i], wo);
      _cqN = 0;
      // Run 2: the blended rings, after every opaque wheel of this car.
      const ro = _ringOpts;
      for (let i = 0; i < _rqN; i++) {
        ro.emissive = _rqEmis[i]; ro.alpha = _rqAlpha[i];
        G.gfx.draw(_rqMesh[i] || getBrakeRing(), _rq[i], ro);
      }
      _wqN = 0; _rqN = 0;
    }

    // ── mirror-car ──────────────────────────────────────────────────
    // A car in the HUD MIRROR or the broadcast PiP (js/render/shared/mirror-pass.js),
    // from the main pass's OWN caches: the body-only mesh (teamBodyMesh; the
    // player's playerBodyMesh, which only the PiP draws) and the planted wheel
    // pair, so every mesh is one the race warm already built. It drew
    // teamMesh(team, car) — the WHOLE car, wheels and full helmet, a cache
    // nothing else fills: 140-250 ms of Car3D.build per rival (Node VM), up to
    // 6 inside mirrorPrepare behind the loading card, then a frame spike each
    // time a new rival joined the 6 nearest behind the player (the default
    // cockpit cam, mirror AUTO) or the PiP cut to a new car.
    // `mat` is the second camera's grounded pose (no cosmetic suspension), the
    // basis the whole car sat on, so body and wheels share it. The wheels are
    // BARE (drawPlayerWheels): the mirror is ~120 px tall. A GLB is one piece.
    // The main pass's _wheelOpts (game.js) values: TLX keys materials by value.
    const _mirWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };
    function drawMirrorCar(c, mat, paint, night) {
      const body = carModelBuf ? null : (c.isPlayer ? playerBodyMesh(c.team, c) : teamBodyMesh(c.team, c));
      if (!body) { G.gfx.draw(teamMesh(c.team, c), mat, paint); return; }
      G.gfx.draw(body, mat, paint);
      // The moveable wing elements are not in the body: the static set (ONE
      // draw, the nearer rest pose), or every wing here was its main plane only.
      const aSt = teamDecalState(c.team, c.isPlayer, c.isPlayer ? null : c.visualSetup, c.isPlayer ? null : c.visStamp);
      deps.drawAeroFlaps(c.team, aSt.val, c.aeroX || 0, mat, paint, aSt.aero, null, true);
      _mirWheelOpts.emissive = night ? 0.12 : 0;
      drawPlayerWheels(c, mat, 0, _mirWheelOpts, false, 0, 1, true);
    }

    // ── exhaust-fx ──────────────────────────────────────────────────
    // Out of game.js's per-car loop. Electric ERS deployment has a pulsing
    // status strip (the player only), never an exhaust flame; the brief
    // fuel-coloured throttle-lift after-fire draws for every car at any time of
    // day — `flameOk` is FieldLod.flame (rivals within 60 m; always with
    // apex26.fieldLod=0). Both opts bags are warmed by TLX (_LATE_FX).
    const _ersLightOpts = { emissive: 1.0, roughness: 1, specular: 0, noAlphaWrite: true, alpha: 1 };
    const _flameOpts = { emissive: 1.0, roughness: 1, specular: 0, alpha: 1, noAlphaWrite: true };
    const _fxWorld = new Float32Array(16);   // scratch for the ERS light / exhaust flame placement
    function drawExhaustFx(c, mat, ersOn, flameOk) {
      const raceT = G.raceT, W = _fxWorld;
      if (ersOn) {
        W.set(mat);
        W[12] += W[4] * 0.605 - W[8] * 2.615;
        W[13] += W[5] * 0.605 - W[9] * 2.615;
        W[14] += W[6] * 0.605 - W[10] * 2.615;
        _ersLightOpts.alpha = 0.5 + 0.5 * (Math.sin(raceT * 28.0) > 0 ? 1 : 0.2);
        G.gfx.draw(CarMesh.getErsLight(), W, _ersLightOpts);
      }
      if ((c.exhaustPop || 0) > 0.05 && flameOk) {   // every car — the transient lasts ~0.2 s
        const fl = 0.6 + 0.4 * Math.sin(raceT * 41.0 + Math.sin(raceT * 23.0) * 3.0);
        W.set(mat);
        // 3 cm forward of the boost quad in the same clear pocket — at z -2.24
        // it hides behind the rain-light housing from chase cam.
        W[12] += W[4] * 0.40 - W[8] * 2.63;
        W[13] += W[5] * 0.40 - W[9] * 2.63;
        W[14] += W[6] * 0.40 - W[10] * 2.63;
        _flameOpts.alpha = (0.30 + 0.55 * fl) * c.exhaustPop;
        G.gfx.draw(CarMesh.getExhaustFlame(c.fuelVisual && c.fuelVisual.fxFlame), W, _flameOpts);
      }
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
        if (_sharedRivalBody && G.gfx.freeMesh) G.gfx.freeMesh(_sharedRivalBody);
        _sharedRivalBody = null;
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
    const _cockpitOpts = { doubleSided: true, roughness: 0.88, metalness: 0.04, specular: 0.14, emissive: 0 };
    const _cockpitWheelOpts = { roughness: 0.55, metalness: 0.30, specular: 0.45, emissive: 0, doubleSided: true };

    // The render loop drains the decal queue once per frame, after the bodies.
    function beginDecals() { _decalCount = 0; }
    let _decalFlushing = false;   // inside flushDecals: it reaps once, after the last bind
    function flushDecals(night) {
      planPhotoAtlases();
      _decalFlushing = true;
      try {
        for (let i = 0; i < _decalCount; i++)
          drawCarDecals(_decalTeams[i], _decalMats[i], night, _decalNums[i], _decalCockpit[i], _decalSetup[i], _decalVis[i], _decalStamp[i]);
      } finally { _decalFlushing = false; }
      reapHiResGrave();
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
    // With a team id, that team's entries (the livery editor's CANCEL / SAVE:
    // their keys carry the SAVED livery id, so a miss while a draft was live
    // stored the draft's paint under it — issue #2796 item 4).
    function invalidateCustomMeshCaches(teamId) {
      const prefix = (teamId || "custom") + ":";
      invalidateCustomMeshCache(teamMeshes, teamMeshOrder, prefix);
      invalidateCustomMeshCache(teamBodies, teamBodyOrder, prefix);
      invalidateCustomMeshCache(playerBodies, playerBodyOrder, prefix);
      invalidateCustomMeshCache(cockpitBodies, cockpitBodyOrder, prefix);
    }
    // Drop EVERY procedural body/wheel GPU cache (same wipe loadCarModel does
    // before adopting a GLB). A sharedTest worker that already raced leaves
    // teamBodies warm; a Car3D.build probe installed later never fires. Specs
    // that instrument builds call this after the hook so the next warm rebuilds.
    function invalidateFactoryMeshCaches() {
      for (const k in teamMeshes) { if (G.gfx.freeMesh) G.gfx.freeMesh(teamMeshes[k]); delete teamMeshes[k]; }
      for (const k in teamBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(teamBodies[k]); delete teamBodies[k]; }
      for (const k in playerBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(playerBodies[k]); delete playerBodies[k]; }
      for (const k in cockpitBodies) { if (G.gfx.freeMesh) G.gfx.freeMesh(cockpitBodies[k]); delete cockpitBodies[k]; }
      playerBodyOrder.length = teamMeshOrder.length = teamBodyOrder.length = cockpitBodyOrder.length = 0;
      for (const k in wheelMeshCache) { freeWheelPair(wheelMeshCache[k]); delete wheelMeshCache[k]; }
      wheelMeshOrder.length = 0;
      for (const k in fieldWheelCache) { freeWheelPair(fieldWheelCache[k]); delete fieldWheelCache[k]; }
      fieldWheelOrder.length = 0;
      if (_sharedRivalBody && G.gfx.freeMesh) G.gfx.freeMesh(_sharedRivalBody);
      _sharedRivalBody = null;
      _teamMeshKeyCache.clear();
    }

    let _menuCarPrep = null;   // the last prepareMenuCarAssets that ran to its end (menuCarAssets)
    return (_instance = {
      teamMesh, teamBodyMesh, sharedRivalBodyMesh, playerBodyMesh, cockpitBodyMesh, cockpitShadowMesh, cockpitCaster,
      teamDecalState, carDecalNum, getCarDecalTexture, invalidateDecalTextures,
      drawCarDecals, queueCarDecals, beginDecals, flushDecals,
      drawPlayerWheels, drawPitCrew, pitCrewDrawn, drawCockpitRig, drawExhaustFx, glassState, drawMirrorCar,
      warmCarAssets, warmCarAssetsAsync, loadCarModel, buildCarData,
      // __apex.menuPrep().cars: the last menu car prep that ran to its end.
      prepareMenuCarAssets: (current) => prepareMenuCarAssets(current).then((r) => { if (r) _menuCarPrep = r; return r; }),
      setPlayerParts, invalidateCustomMeshCaches, invalidateFactoryMeshCaches,
      WHEELS, coOpt, liveryBitmapOpts,
      get modelBuf() { return carModelBuf; },
      get playerVisualKey() { return playerVisualKey; },
      get menuCarAssets() { return _menuCarPrep; },
    });
  }
  // The live instance, for mirror-pass.js state().glass — game.js creates exactly one.
  let _instance = null;
  // A-H3 (perf hunt 4): game.js drawAeroFlaps routes the opaque flap bag through R1's seam exactly as the
  // wheel layers do; before create() (or on a backend without gfx.coalesce) the bag comes back untouched.
  return { create, carVisual, instance: () => _instance, coOpt: (o) => (_instance ? _instance.coOpt(o) : o) };
})();
Object.freeze(CarDraw);
