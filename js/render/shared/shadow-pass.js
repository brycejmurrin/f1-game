/* Apex 26 — ShadowPass: the three shadow-map passes out of js/game.js — the
   snap-cached SUN map (terrain + road ribbons + props, rebuilt when the camera
   crosses a light-space cell or the sun moves), the per-frame CAR map (every
   pooled caster within reach of the anchor, the live player first), and the
   night LAMP map (the nearest floodlight, content-keyed on the lamp and the
   cars under it). Owns the light-space matrices, the snap keys, the caster
   pools the render loop fills (pushCaster) and the blob-shadow flush. One
   ShadowPass.create(G, deps) at boot; the render loop calls beginFrame /
   pushCaster / sunPass / lampPass / flushBlobs and loadTrack calls reset.
   Reads G.gfx / G.track / G.player / G.state / G.camEye / G.camTgt /
   G._studioRig; teamMesh (the silhouette caster) and vStd come through deps. */
"use strict";

const ShadowPass = (function () {
  function create(G, deps) {
    Log.info("game", "ShadowPass.create");
    // The LIVE lighting-knob values (js/lighting/knobs.js, re-exported by the
    // LightTune façade): the same object game.js binds, mutated in place by the
    // tuner, so one capture here reads every later slider move. In game.js this
    // was a bare `LT` from its own eval-time destructure — a name that does not
    // exist outside that file, which is what the call-time-reads guard caught.
    const LT = LightTune.LT;
    const MAT_IDENT = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    // Own frustum-plane scratch (game.js shares its _pbPlanes with the camera
    // cull; the backends snapshot CONTENTS, so a separate set is merely tidy).
    const _shPlanes = [0,0,0,0,0,0].map(() => new Float32Array(4));
    const _mLView = new Float32Array(16), _mLProj = new Float32Array(16), _mLVP = new Float32Array(16);
    // Dynamic car shadow pass scratches (per-frame car-only depth map).
    const _mCView = new Float32Array(16), _mCProj = new Float32Array(16), _mCVP = new Float32Array(16);
    // Nearest-floodlight spot-shadow pass scratches (per-frame 512² lamp depth map).
    const _mFlView = new Float32Array(16), _mFlProj = new Float32Array(16), _mFlVP = new Float32Array(16);

    const _upX = [1, 0, 0], _upY = [0, 1, 0];   // shadow-basis up choices (read-only)
    // lookAtTo() eye/target scratches — it reads all three vectors synchronously
    // and retains none. CULL_NO_UPLOAD: shadow cull packs to a second buffer
    // (GLX shadowIbo / WGX shadowInstBuf / TLX CPU pack) — camera ibo untouched.
    const _shEye = [0, 0, 0], _shCtr = [0, 0, 0], _flEye = [0, 0, 0], _flTgt = [0, 0, 0];
    const CULL_NO_UPLOAD = { upload: false };
    let _shadowSnapX = null, _shadowSnapZ = null, _shadowBox = null;
    let _shadowSunX = null, _shadowSunY = null, _shadowSunZ = null;
    // Lamp-spot shadow snap: skip full rebuild when nearest flood + eye cell hold.
    // Props dominate the cost; freezing the map for a 12 m eye cell is the night twin
    // of the sun snap cache (cars already one-frame lag on AI mats).
    // LAMP SHADOW SNAP KEY — the map's CONTENT, not a proxy for it. The old key was
    // (slot into frame.lights, 12 m eye cell) and both halves were wrong: the slot
    // cannot see a lamp handover (lighting.js re-sorts that array every frame), and
    // the eye cell is not what the map depends on at all — the props cast is culled
    // to the LAMP's frustum, so the static half of this map is a pure function of
    // which lamp it is. What actually varies is the lamp and the CARS cast into it.
    let _lampShX = null, _lampShY = null, _lampShZ = null;   // the lamp, by world position (static fixture => exact match)
    let _lampShCarKey = 0;   // quantised positions of the cars in the map
    const _shadowCtr = [0, 0, 0];   // unsnapped shadow anchor (glides) — the shader fades by distance from this

    // Deferred blob-shadow batch: instead of interleaving shadow↔body per car (which
    // flips program+VAO+blend+depthMask twice each car), accumulate every drawn car's
    // shadow matrix and flush them all in one state block after the body loop. Shadows
    // are depth-tested but write no depth, so drawing them last is visually identical.
    const _shadowMats = [];   // pool of Float32Array(16), reused across frames
    const _shadowTeams = [];  // parallel: each car's team, for the dynamic car-shadow caster pass
    const _shadowCars = [];   // parallel refs: the live player transform replaces its stale pooled entry
    const _livePlayerShadowMat = new Float32Array(16);
    let _shadowCount = 0;

    // Instanced prop shadow cast: cull to the active light frustum (sun ortho or
    // lamp cone via gfx.shadowCullVP) before castShadowInstanced — shared by the
    // snap-cached sun pass and the per-frame lamp pass.
    // NO CADENCE GATE. There was one — skip odd frames at tier >= 1 — and it cost
    // scenery shadows for nothing. The sun caller is INSIDE the snap-cached static
    // pass, which only runs when the eye crosses its cell or the sun moves, so on the
    // frames the gate fired the function was not being called at all: it saved zero
    // work. What it did do was land on odd-numbered REBUILD frames, where the chunked
    // props, terrain and road were cast into the map and the instanced batches (trees,
    // barriers, signs, grandstand furniture) were not. That map then persists until
    // the next rebuild, so at tier >= 1 roughly half of all snap cells rendered with
    // every instanced prop's ground shadow missing, blinking back at the next cell.
    // Halving the cost of a snap-cached pass means skipping a whole rebuild, never
    // half of one.
    function _castPropBatchesShadow() {
      const _pb = G.track.meshes.propBatches;
      if (!_pb || !G.gfx.castShadowInstanced) return;
      // Sharing _shPlanes with the camera cull is safe: backends snapshot CONTENTS.
      const planes = (G.gfx.shadowCullVP && G.gfx.makeFrustumPlanes)
        ? G.gfx.makeFrustumPlanes(G.gfx.shadowCullVP, _shPlanes) : null;
      for (let i = 0; i < _pb.length; i++) {
        if (planes && G.gfx.cullInstances) {
          // upload:false → shadow pack only. WGX/GLX use a second instance buffer;
          // TLX packs CPU-side into a second InstancedMesh. Camera ibo/cache stay.
          G.gfx.castShadowInstanced(_pb[i], G.gfx.cullInstances(_pb[i], planes, CULL_NO_UPLOAD));
        } else G.gfx.castShadowInstanced(_pb[i]);
      }
    }
    // Shadow-ribbon cast — hoisted so a sun recentre does not allocate a closure
    // (PERF-FINDINGS §2y). Same body the rebuild used to close over each snap.
    function _castRibbonSh(geo, key, plain, allow = true) {
      if (G.track.meshes[key] === undefined) {
        G.track.meshes[key] = null;
        // TIER GATE. Tracks.build() only chunks the ribbons when
        // PerfGov.tier() < 3; above that it writes the FUSED mesh and leaves
        // roadChunked/terrainChunked undefined. This lazy build then made a
        // SECOND GPU copy of road and terrain anyway — measured +2.78 MiB
        // median, +3.81 on spa — on precisely the devices that had already
        // been told to spend less: tier() is max(crash-strike floor, the
        // player's GRAPHICS preset, the governor's own shed), so a phone that
        // has been killed twice and a player who picked LOW both silently paid
        // for a duplicate.
        //
        // Falling through leaves the key null and the branch below casts the
        // fused mesh instead, which is what the tier asked for.
        const tierOk = typeof PerfGov === "undefined" || PerfGov.tier() < 3;
        if (allow && tierOk && geo && G.gfx.createChunkedMesh) {
          geo._keepPositions = true;
          G.track.meshes[key] = G.gfx.createChunkedMesh(geo, 72);
        }
      }
      const ch = G.track.meshes[key];
      if (ch && ch.chunks) G.gfx.castShadowChunked(ch, MAT_IDENT);
      else G.gfx.castShadow(plain, MAT_IDENT);
    }

    // Sun-shadow snap caches — loadTrack invalidates them so a new track whose
    // first snapped cell + sunDir happen to match the old track's last values
    // does not keep the PREVIOUS track's silhouette until the camera moves a cell.
    function reset() {
      _shadowSnapX = _shadowSnapZ = _shadowBox = null;
      _shadowSunX = _shadowSunY = _shadowSunZ = null;
      _lampShX = _lampShY = _lampShZ = null; _lampShCarKey = 0;
    }
    // The render loop: count reset before the car loop, one push per drawn car
    // (blob shadow this frame; sun / lamp caster next frame), flush after.
    function beginFrame() { _shadowCount = 0; }
    function pushCaster(groundMat, team, car) {
      let _sm = _shadowMats[_shadowCount];
      if (!_sm) { _sm = new Float32Array(16); _shadowMats[_shadowCount] = _sm; }
      _sm.set(groundMat);
      _shadowTeams[_shadowCount] = team;   // for next frame's AI car-shadow caster pass
      _shadowCars[_shadowCount] = car;
      _shadowCount++;
    }
    // Flush all accumulated car shadows in one pass — shadowProg+shadowVAO+blend+
    // depthMask are set once for the whole field instead of ping-ponging with the
    // lit body program every car.
    function flushBlobs() {
      const gfx = G.gfx;
      for (let i = 0; i < _shadowCount; i++) gfx.drawShadow(_shadowMats[i], 2.4, 5.8);
    }

    // Sun map (snap-cached) + car map (per frame). `frame` is the render loop's
    // per-frame lighting record (sunDir / sunColor / moonGate; shadowCtr is
    // written here); `_frameNo` its counter; `_hasLivePlayerShadow` whether
    // livePlayerMat carries this frame's resolved player transform.
    function sunPass(frame, _frameNo, _hasLivePlayerShadow) {
      // Shadow pass — render terrain + road from sun's perspective.
      // Snap the frustum centre on the LIGHT's right/up axes to a step of sBox/4
      // (20 m at the default 80 m box) so the map only re-renders when the camera
      // moves a cell — and so each recentre shifts the box by an exact whole number
      // of shadow texels (sBox/4 is SHADOW_SIZE/8 texels for any pow-2 map size).
      // The old snap was on a world-XZ grid with an unsnapped camera HEIGHT: those
      // axes don't match the sun-rotated texel grid, so every recentre re-rasterised
      // all shadow edges at a new sub-texel phase — a visible shimmer/jump of every
      // shadow edge each 16 m of driving.
      if (G.track) {
        const sd = frame.sunDir;
        const up = Math.abs(sd[1]) > 0.98 ? _upX : _upY;
        // Light basis exactly as lookAtTo derives it: z = sd, x = norm(up×z), y = z×x.
        const zx = sd[0], zy = sd[1], zz = sd[2];
        let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
        const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        // SHADOW DISTANCE knob: re-render the map when the box size changes too (not
        // only on the position snap), so the slider responds without driving.
        const sBox = LT.shadowRange != null ? LT.shadowRange : 80;
        const step = sBox / 4;
        // Forward-biased CAMERA anchor, not the raw player position: the box budget
        // goes where you look. Centred on the car, up to sBox/8 of snap slack plus
        // the ~10 m chase-cam offset sat BEHIND the camera, so the shader's fade had
        // to dissolve shadows by 0.72·range (≈58 m at the default 80) to stay inside
        // the worst-case border — the "shadow horizon" ~58 m ahead. Anchoring at
        // camera + a forward bias makes the safe radius symmetric around the view
        // (0.875·sBox from the anchor), letting the fade reach ~0.84·range — shadows
        // hold ~67 m ahead of the camera at the same texel density. Height comes from
        // the LOOK TARGET (subject/ground level — right for chase, cockpit, TV and
        // orbit/aerial debug cams alike), NOT the camera eye: fading by eye distance
        // erased ALL shadows from any high/aerial camera (vDist ≥ altitude).
        // THE BIAS DIRECTION IS THE CAR'S HEADING, NOT THE VIEW. Biasing along the look
        // direction made the FADE camera-ORIENTATION dependent: uShadowCtr swings around
        // a 2·fBias circle on a pure yaw and sampleShadow dissolves shadows by distance
        // from it, so a stationary shadow changed strength when the player only turned.
        // Measured (bahrain/day, eye pinned, aim swept ±40°): a shadow 70 m ahead swung
        // edgeFade 0.625..0.986 — 58% of its strength — while 40 m and 60 m were flat.
        // Same class as the night lamp-cull bug, and the same rule MJP's shadow notes
        // state: a stabilised map must not change as the camera rotates. Heading is
        // invariant under a camera-only rotation and still points where the car is
        // going, so the reach the bias buys is unchanged; |bias| and therefore the
        // 0.875·sBox coverage guarantee are untouched. No player (menu flyby) falls
        // back to the look direction, which is the only direction that exists there.
        let fbx = G.camTgt[0] - G.camEye[0], fbz = G.camTgt[2] - G.camEye[2];
        if (G.player && G.player.head != null) { fbx = Math.sin(G.player.head); fbz = Math.cos(G.player.head); }
        const fbl = Math.hypot(fbx, fbz), fBias = Math.min(20, sBox * 0.3);
        if (fbl > 1e-6) { fbx = fbx / fbl * fBias; fbz = fbz / fbl * fBias; } else { fbx = 0; fbz = 0; }
        _shadowCtr[0] = G.camEye[0] + fbx; _shadowCtr[1] = G.camTgt[1]; _shadowCtr[2] = G.camEye[2] + fbz;
        frame.shadowCtr = _shadowCtr;
        const cx = _shadowCtr[0], cy = _shadowCtr[1], cz = _shadowCtr[2];
        const lu = Math.round((xx * cx + xy * cy + xz * cz) / step) * step;
        const lv = Math.round((yx * cx + yy * cy + yz * cz) / step) * step;
        // Sun direction is part of the gate: a sunDir change (SUN ELEVATION/AZIMUTH
        // sliders, a time-of-day flip) previously left the map STALE until the next
        // cell crossing — shadows looked dead while dragging, then all jumped at once.
        // PRODUCER/CONSUMER GATE. lit.js's sampleShadow opens with
        // `if (uShadowStr <= 0.0) return 1.0;` — so when the key has faded out
        // (overcast, wet or foggy night) NOTHING reads this map: the god-ray march
        // is the only other reader and it is gated on uStr > 0.0, which is 0 below
        // the same key. The consumer side of that was already taken; the PRODUCER
        // was not, so the frame still paid a 2048² depth clear, the full terrain and
        // road ribbons cast unchunked (44,826 verts on vegas), and shadowEnd's 512²
        // PCSS blocker downsample — for a texture with zero readers, once per 20 m
        // snap cell, i.e. 300+ times a lap.
        //
        // The predicate is NOT new: it is the identical expression already used
        // below to gate the props cast and again at the car sun pass. Hoisted here
        // so all three agree. When it closes, the snap cache is INVALIDATED rather
        // than left alone — otherwise weather clearing mid-race would re-open the
        // gate onto a stale map and hold it until the next cell crossing.
        const _shKeyG = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
        const _shadowsRead = _shKeyG > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01);
        if (!_shadowsRead) {
          _shadowSnapX = _shadowSnapZ = _shadowBox = null;
          _shadowSunX = _shadowSunY = _shadowSunZ = null;
        // NO tier >= 1 PARITY GATE ON THIS REBUILD; both forms of it were wrong.
        // Inside _castPropBatchesShadow it published a map with road and terrain
        // shadows but no trees or barriers, and the snap cache held that half-built
        // map for a whole 20 m cell. Moved out here to defer the WHOLE rebuild it
        // saves nothing: the snap keys are written inside this block, so the
        // predicate is still true next frame and the deferred rebuild runs in full,
        // props included. Deferral only pays when the trigger fires on CONSECUTIVE
        // frames; two 20 m crossings one frame apart needs 1200 m/s. It bought a
        // frame of extra shadow lag and nothing else.
        //
        // Nor is the saving recoverable by coarsening the snap cell: slack is
        // step/2 against a 0.875·sBox coverage guarantee and a fade that already
        // reaches 0.84·range, so doubling step spends the whole margin and pushes
        // shadows through the box edge. That trade moves the fade constant with it
        // and needs real hardware, not a gate.
        } else if (lu !== _shadowSnapX || lv !== _shadowSnapZ || sBox !== _shadowBox ||
            sd[0] !== _shadowSunX || sd[1] !== _shadowSunY || sd[2] !== _shadowSunZ) {
          _shadowSnapX = lu; _shadowSnapZ = lv; _shadowBox = sBox;
          _shadowSunX = sd[0]; _shadowSunY = sd[1]; _shadowSunZ = sd[2];
          // Rebuild the snapped centre in world space. The along-sun component needs
          // no snap — it only shifts depth values, which the bias absorbs.
          const lw = zx * cx + zy * cy + zz * cz;
          const wx = xx * lu + yx * lv + zx * lw;
          const wy = xy * lu + yy * lv + zy * lw;
          const wz = xz * lu + yz * lv + zz * lw;
          _shEye[0] = wx + sd[0] * 150; _shEye[1] = wy + sd[1] * 150; _shEye[2] = wz + sd[2] * 150;
          _shCtr[0] = wx; _shCtr[1] = wy; _shCtr[2] = wz;
          M4.lookAtTo(_mLView, _shEye, _shCtr, up);
          // Half-size box (default ±80 m / 160 m) snapped around the anchor;
          // sampleShadow fades shadows out by ANCHOR distance (uShadowCtr) well
          // inside its border. Bigger = more reach, smaller = crisper contacts
          // (texel density = 2048/box).
          M4.orthoTo(_mLProj, -sBox, sBox, -sBox, sBox, 1.0, 320);
          M4.mulTo(_mLVP, _mLProj, _mLView);
          G.gfx.shadowBegin(_mLVP);
          // Shadow ribbons: chunk + frustum-cull against the ±shadow-box ortho
          // (castShadowChunked). PERF-FINDINGS: ~89% of tris sit outside the box;
          // depth half is bit-identical. Independent of LT.roadChunkLamps (lit pass).
          // Lazy-build shares roadChunked with the lamp draw path.
          _castRibbonSh(G.track.terrainGeo, "terrainChunked", G.track.meshes.terrain);
          _castRibbonSh(G.track.roadGeo, "roadChunked", G.track.meshes.road, G.gfx.chunkedTrackCoords !== false);
          // Perf: skip casting the (heavy, up to ~5 M-vert) props/city into the shadow
          // map at NIGHT — directional sun shadows are invisible under the dim
          // moonlight, so this is the biggest night saving. Gate on the KEY's actual
          // BRIGHTNESS, not sunDir.y: the night moon-key is deliberately held high
          // (sunDir.y ≈ 0.97) to drive the sky glow, so an elevation test never fired
          // at night and the whole city rasterised into the shadow map every recentre.
          // Cutoff 0.28 = the BOTTOM of the renderer's key-luminance strength fade
          // (uShadowStr ramps over key 0.28→0.42): props only leave the map once the
          // whole shadow pass has faded to zero strength. The old 0.35 cutoff sat in
          // the MIDDLE of that band, so prop shadows popped out at ~50% strength on
          // a dusk→night flip / SUN ELEVATION drag while terrain shadows lingered.
          const _shKey = _shKeyG;   // hoisted above; same expression, one source
          // Clear-night moon shadows re-open the gate: props must be in the map for
          // the moonlight floor to have anything to cast (snap-cached, so the night
          // saving only goes when MOON SHADOWS is active and the sky is clear — or,
          // above 0.5, the knob itself forces the gate open regardless of weather;
          // see frame.moonGate above).
          if (_shKey > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) {
            G.gfx.castShadowChunked(G.track.meshes.props, MAT_IDENT);
            // Cull instanced props to the light ortho before cast — same frustum
            // castShadowChunked already uses (shadowCullVP || sun lightVP).
            _castPropBatchesShadow();
          }
          G.gfx.shadowEnd();
        }
        // Dynamic CAR shadow pass — every frame (cars move, so they can't live in
        // the snap-cached static map above; that's why cars only had blob shadows).
        // AI casts use the preceding frame's pooled transforms; the player is
        // rebuilt above from the current interpolation state. Reusing its old matrix
        // trailed the shadow by speed × frame time (6–12 m on low-FPS devices).
        // ±42 m box (at the default 80 m SHADOW DISTANCE — a car shadow beyond that
        // is sub-pixel) on the same gliding anchor, scaled proportionally with
        // SHADOW DISTANCE above its default so the slider also reaches the car's
        // own shadow, same depth program and key-luminance gate as the props above.
        // WGX mobile tiers may no-op the pass (blob fallback); menu/select skip
        // because the car loop doesn't run and its pooled AI matrices would be
        // stale race positions.
        // Car shadow pass: skip odd frames at low speed — the 1024² map persists
        // one frame and parked/slow driving does not need 60 Hz updates.
        const _carSpd = G.player ? Math.abs(G.player.speed) : 0;
        const _carShadowFrame = (_frameNo & 1) === 0 || deps.vStd(_carSpd) > 0.15;
        // The skip on the line above is a CADENCE skip, and the renderer cannot tell
        // it from a stop. Every backend clears its armed flag in present(), which is
        // correct when this pass stops for real (knob off, tier shed, menu, key
        // faded) and wrong here: the map persists and is still accurate, but the LIT
        // uniform read 0 on the skipped frames, so a parked car's own sun shadow
        // strobed at 30 Hz. Say which kind of skip it is. A genuine stop still
        // disarms by making no call at all, and keep() declines until the pass has
        // run at least once (GLX and WGX do not prime these maps: an unwritten one
        // reads fully shadowed).
        const _carShadowWanted = G.gfx.carShadowBegin && LT.carShadow && PerfGov.tier() < 3 &&
            (_hasLivePlayerShadow || _shadowCount > 0) && G.player && G.state !== "menu" &&
            (_shKeyG > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01));
        if (_carShadowWanted && !_carShadowFrame && G.gfx.carShadowKeep) G.gfx.carShadowKeep();
        if (G.gfx.carShadowBegin && LT.carShadow && PerfGov.tier() < 3 && _carShadowFrame &&
            (_hasLivePlayerShadow || _shadowCount > 0) && G.player && G.state !== "menu") {
          const _ck = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
          // Same clear-night MOON SHADOWS relaxation as the prop gate above: with
          // the moonlight floor (or the knob's above-0.5 override) active, cars
          // keep casting so they throw faint moon shadows too instead of popping
          // to blob-only.
          if (_ck > 0.28 || (LT.moonShadow > 0 && (frame.moonGate || 0) > 0.01)) {
            _shEye[0] = _shadowCtr[0] + sd[0] * 150; _shEye[1] = _shadowCtr[1] + sd[1] * 150; _shEye[2] = _shadowCtr[2] + sd[2] * 150;
            M4.lookAtTo(_mCView, _shEye, _shadowCtr, up);
            const cBox = 42 * Math.max(1, sBox / 80);
            M4.orthoTo(_mCProj, -cBox, cBox, -cBox, cBox, 1.0, 320);
            M4.mulTo(_mCVP, _mCProj, _mCView);
            // The depth-comparison bias baked into lit.js's biasTerm was tuned for the
            // map's texel size at the DEFAULT ±42m box; cBox growing with SHADOW DISTANCE
            // grows the car map's real-world texel size at the same fixed 1024² resolution,
            // so the bias needs to grow proportionally or the car self-shadows into acne
            // (uCarBiasScale, applied in lit.js). cBox/42 == 1 at the default, matching the
            // originally-tuned bias exactly.
            G.gfx.carShadowBegin(_mCVP, cBox / 42);
            if (_hasLivePlayerShadow) G.gfx.castShadow(deps.teamMesh(G.player.team, G.player, true), _livePlayerShadowMat);
            // Skip casters that CANNOT reach the shadow volume. gfx.castShadow does
            // no culling of its own (js/render/glx/shadow.js): it binds the VAO,
            // uploads uModel and draws, ~22k verts per silhouette car (wheels +
            // unsplit helmet; paint-edge splits stay on the colour body), so a
            // caster outside the
            // volume costs a full mesh for zero texels — and at night the field pays
            // it twice, once here and once in the lamp pass.
            //
            // The radius is the volume's CORNER distance, not cBox. The ortho above
            // is ±cBox PERPENDICULAR to the sun, but spans depth 1..320 from an eye
            // at _shadowCtr + sd*150 — so it reaches ~170 m along the sun axis. A
            // car far away but nearly aligned with the sun has a small perpendicular
            // offset, and at a low sun its stretched shadow legitimately lands in
            // frame; culling at cBox would delete exactly those. hypot(cBox, 170) is
            // the furthest any point of the box can be from the anchor, so beyond it
            // a caster is provably outside — no visible change, only skipped draws.
            const _csR = Math.hypot(cBox, 170) + 8;   // +8: car length + mesh extent
            const _csR2 = _csR * _csR;
            for (let i = 0; i < _shadowCount; i++) {
              const _sm2 = _shadowMats[i];
              const _sdx = _sm2[12] - _shadowCtr[0], _sdz = _sm2[14] - _shadowCtr[2];
              if (_sdx * _sdx + _sdz * _sdz > _csR2) continue;
              if (_shadowCars[i] !== G.player) G.gfx.castShadow(deps.teamMesh(_shadowTeams[i], _shadowCars[i], true), _shadowMats[i]);
            }
            G.gfx.carShadowEnd();
          }
        }
      }
    }

    // Nearest-floodlight spot shadow map (night only).
    function lampPass(frame, _frameNo, _hasLivePlayerShadow) {
      // Night only: ONE lamp — the nearest/strongest to the camera — gets a real
      // per-frame 512² depth map (perspective, looking down its beam) so the car
      // driving under it throws a radial shadow away from the mast and walls carve
      // its pool + volumetric shaft. The other 31 lamps stay cone-shaped (no
      // per-light shadow cost). Casters: last frame's pooled car matrices (same
      // one-frame lag as the car sun-shadow pass) + the props/city chunks inside
      // the lamp frustum (barriers, grandstands, buildings). Desktop only — all
      // three backends expose lampShadowBegin; the mobile tier never creates the map.
      if (G.gfx.lampShadowBegin && LT.lampShadow && PerfGov.tier() < 2 && frame.lights && !G._studioRig &&
          G.player && G.state !== "menu") {
        // Gate on the KEY being dim (true night): by day/dusk the sun owns the
        // shadows, and a daytime-floods pool shadow would fight the sun's.
        const _flk = frame.sunColor ? Math.max(frame.sunColor[0], frame.sunColor[1], frame.sunColor[2]) : 1;
        if (_flk <= 0.30) {
          const L = frame.lights, nRec = (L.length / 15) | 0;
          // Tail-lights are the LAST frame.tailCount records and are excluded by
          // RANGE, not by the radius literal below — which is not a filter: a tail
          // light's radius is 8 * (1 + bAmt * 0.45), bAmt = brakeHeat * BRAKE FLARE,
          // so it clears 12 once that shipped slider passes 1.111 (max 2.5). A
          // hard-braking rival 15 m ahead then outscores a 40 m flood and takes the
          // 512 map with a frustum slung off a moving car. glx/chunked.js's drawChunked guards its
          // own slot this way; the lit path and godray never did.
          const tailFrom = frame.tailCount > 0 ? frame.tailStart : nRec;
          let flBest = -1, flScore = Infinity;
          for (let i = 0; i < nRec; i++) {
            const o = i * 15;
            if (i >= tailFrom) continue;   // never shadow-map a car tail-light
            if (L[o + 6] < 12) continue;   // skip small movers (washers)
            const dx = L[o] - G.camEye[0], dy = L[o + 1] - G.camEye[1], dz = L[o + 2] - G.camEye[2];
            // Nearest-strongest: distance² over luminance, so a bright flood bank
            // beats a dim work lamp at similar range.
            const s = (dx * dx + dy * dy + dz * dz) /
                      Math.max(Math.max(L[o + 3], L[o + 4], L[o + 5]), 1);
            if (s < flScore) { flScore = s; flBest = i; }
          }
          if (flBest >= 0) {
            const o = flBest * 15;
            const rad = L[o + 6];
            // WHAT THIS MAP CONTAINS: the props (chunked + instanced), culled to the
            // LAMP's frustum, plus every car within rad + 8 of the lamp. So it is a
            // function of exactly two things — WHICH LAMP, and WHERE THOSE CARS ARE.
            // Key on both and the map is always either provably current (keep it,
            // and SAY so, or the lit pass reads a false 0) or provably stale
            // (rebuild). The key it replaces was (slot, 12 m eye cell) and neither
            // term was the content: the slot indexes an array lighting.js re-sorts
            // every frame, so a lamp handover onto the same slot read as "no
            // change" and bound one lamp's depth under another's VP; and the eye
            // cell is not an input to this map at all — the props cull uses the
            // lamp frustum, not the camera's. The old pair let the flag sit false on
            // every frame but the rebuild, which is the floodlight strobe (~1 armed
            // frame in 14 once the car is moving) and the shadow that never came
            // back at all for a player parked under a flood.
            const _lx = L[o], _ly = L[o + 1], _lz = L[o + 2];
            // Lamp fixtures are STATIC and their coordinates are copied, not
            // recomputed, so exact equality is the identity test — no epsilon, and
            // no way for two distinct lamps to collide on it.
            const _sameLamp = _lx === _lampShX && _ly === _lampShY && _lz === _lampShZ;
            // Same bound the cast loop below uses, hoisted so the key is computed
            // from exactly the set that gets rasterised — a key over a different set
            // than the content is how this class of cache goes wrong.
            const _lsR = rad + 8, _lsR2 = _lsR * _lsR;
            // Quantised at 0.25 m: finer than a shadow edge is worth rebuilding for,
            // coarser than the physics jitter of a stationary car. A parked field
            // therefore holds one key indefinitely and costs no rebuilds at all,
            // which is strictly cheaper than the 12 m cell it replaces.
            let _carKey = 0;
            if (_hasLivePlayerShadow && G.player && G.player.px != null) {   // px/pz are scalars, not a vec
              _carKey = ((Math.round(G.player.px * 4) * 31 + Math.round(G.player.pz * 4)) * 31 + 1) | 0;
            }
            for (let i = 0; i < _shadowCount; i++) {
              const _cm = _shadowMats[i];
              if (_shadowCars[i] === G.player) continue;
              const _cdx = _cm[12] - _lx, _cdy = _cm[13] - _ly, _cdz = _cm[14] - _lz;
              if (_cdx * _cdx + _cdy * _cdy + _cdz * _cdz > _lsR2) continue;
              _carKey = ((_carKey * 31 + Math.round(_cm[12] * 4)) * 31 + Math.round(_cm[14] * 4)) | 0;
            }
            // The player is cast into this map unconditionally, so while driving the
            // car half of the key changes every frame and a pure content key would
            // rebuild at 60 Hz where the old cell key rebuilt at ~5. Bound it: a
            // CAR-ONLY change may be deferred one frame at tier >= 1, which is the
            // one-frame lag this file already takes for AI casters in the sun pass
            // and is invisible at any speed a shadow is legible at. A LAMP change
            // never defers — that is the wrong-lamp bug, not a lag.
            //
            // THIS DEFER ACTUALLY SAVES, unlike the sun pass's (removed) one. There
            // the keys were written inside the rebuild, so a deferred trigger was
            // still true next frame and the same rebuild just happened one frame
            // later — N triggers, N rebuilds. Here the deferred frame ARMS via the
            // keep and skips the pass outright, so 60 content changes cost 30
            // rebuilds. The difference is whether the skipped frame does the work.
            const _carOnly = _sameLamp && _carKey !== _lampShCarKey;
            if ((_sameLamp && _carKey === _lampShCarKey) ||
                (_carOnly && PerfGov.tier() >= 1 && (_frameNo & 1) === 1)) {
              // Provably current, or one frame behind on car positions only. Skip
              // the pass and ARM: a cadence skip is not a stop, and only this side
              // knows which it is — the renderer clears the flag every present().
              if (G.gfx.lampShadowKeep) G.gfx.lampShadowKeep(flBest);
            } else {
            _lampShX = _lx; _lampShY = _ly; _lampShZ = _lz; _lampShCarKey = _carKey;
            const fov = Math.min(2.6, 2 * Math.acos(M4.clamp(L[o + 11], -0.999, 0.999)) * 1.1 + 0.15);
            const up = Math.abs(L[o + 8]) > 0.95 ? _upX : _upY;
            _flEye[0] = L[o]; _flEye[1] = L[o + 1]; _flEye[2] = L[o + 2];
            _flTgt[0] = L[o] + L[o + 7]; _flTgt[1] = L[o + 1] + L[o + 8]; _flTgt[2] = L[o + 2] + L[o + 9];
            M4.lookAtTo(_mFlView, _flEye, _flTgt, up);
            // Near plane 2.5 m: the light sits INSIDE its own fixture geometry (the
            // lamp position IS the visible lens box, with the head/arm right beside
            // it, all part of the props caster mesh) — a closer near plane renders
            // the fixture into the map and it eclipses its own beam, blacking out
            // the whole pool. 2.5 m clips the fixture; every real occluder (cars,
            // walls, the mast pole below the head) is farther out than that.
            M4.perspectiveTo(_mFlProj, fov, 1, 2.5, Math.max(rad, 10));
            M4.mulTo(_mFlVP, _mFlProj, _mFlView);
            G.gfx.lampShadowBegin(_mFlVP, flBest);
            if (_hasLivePlayerShadow) G.gfx.castShadow(deps.teamMesh(G.player.team, G.player, true), _livePlayerShadowMat);
            // Distance-cull the casters, the twin of the sun pass's _csR above — the
            // comment there notes the field pays the caster cost TWICE at night, and
            // this is the second half. Only 1-3 cars are ever under a lamp, so this
            // skips ~18-20 full ~11k-vert car meshes per night frame.
            //
            // The bound is the LAMP RADIUS, and the argument is not the frustum (a
            // 149-degree cone's far corners reach ~5x its far plane) but the light
            // itself: shadow rays travel outward from the lamp, so a caster at
            // distance D can only occlude receivers at distance > D. Both readers of
            // this map reject beyond rad — the lit shader's lamp loop
            // (`if (d2 > rad*rad) continue`) and the god-ray beam march — so a
            // caster beyond rad occludes only fragments that already receive zero
            // light from this lamp. +8 covers the car's own half-extent, so a car
            // whose CENTRE clears the bound has no vertex inside rad.
            // _lsR2 is the one hoisted for the content key above — the key MUST be
            // computed over exactly the set this loop rasterises, so they share it.
            for (let i = 0; i < _shadowCount; i++) {
              const _lm = _shadowMats[i];
              const _ldx = _lm[12] - L[o], _ldy = _lm[13] - L[o + 1], _ldz = _lm[14] - L[o + 2];
              if (_ldx * _ldx + _ldy * _ldy + _ldz * _ldz > _lsR2) continue;
              if (_shadowCars[i] !== G.player) G.gfx.castShadow(deps.teamMesh(_shadowTeams[i], _shadowCars[i], true), _shadowMats[i]);
            }
            G.gfx.castShadowChunked(G.track.meshes.props, MAT_IDENT);
            // Lamp pass: cull against the lamp perspective frustum (castCullVP).
            _castPropBatchesShadow();
            G.gfx.lampShadowEnd();
            } // end lamp-shadow snap rebuild
          }
        }
      }
    }

    return {
      reset, beginFrame, pushCaster, flushBlobs, sunPass, lampPass,
      livePlayerMat: _livePlayerShadowMat,
      get count() { return _shadowCount; },
    };
  }
  return { create };
})();
Object.freeze(ShadowPass);
