/* Selected-world garage exterior. Owns its meshes; never borrows or replaces a race world. */
const GarageExterior = (function () {
  "use strict";
  const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const wetWeather = weather => /^(wet|rain|storm)$/.test(weather || "");
  const vector = (v, fallback) => v && v.length >= 3 && Array.from(v).slice(0, 3).every(Number.isFinite) ? Array.from(v).slice(0, 3) : fallback.slice();
  // Owned values only. No live profiles, atmosphere, frame or palette writes.
  function lighting(selection) {
    const s = selection || {}, tod = s.tod || "default", weather = s.weather || "dry";
    const authored = s.def && (s.def.pal || s.def.palette) || {};
    // An explicit DAY on a night-authored circuit uses the race's daylight base,
    // rather than carrying its orange/dark default palette into the garage.
    const p = tod === "day" && s.def && s.def.night ? Object.assign({}, authored, {
      sunDir: [.46,.58,.42], sunColor: [1.13,.95,.72], ambientSky: [.26,.33,.50], ambientGround: [.24,.19,.12],
      zenith: [.09,.26,.95], horizon: [.54,.68,.90], fogColor: [.66,.74,.88], fogDensity: .0008 }) : authored;
    const night = tod === "night" || (tod === "default" && !!(s.night || s.def && s.def.night));
    const twilight = tod === "dawn" || tod === "dusk", wet = wetWeather(weather), storm = weather === "storm";
    const overcast = storm || wet || weather === "overcast" || weather === "fog";
    const sunDir = vector(p.sunDir, [.2,.8,.4]);
    if (night) { sunDir[0] = -.25; sunDir[1] = .8; sunDir[2] = .3; }
    else if (twilight) { sunDir[0] = tod === "dawn" ? -.8 : .8; sunDir[1] = .18; sunDir[2] = .4; }
    const norm = Math.hypot(...sunDir) || 1;
    for (let i = 0; i < 3; i++) sunDir[i] /= norm;
    const sunColor = night ? [.06,.075,.11] : twilight ? [1,.55,.28] : vector(p.sunColor || p.sun, [1,.97,.90]);
    const ambientSky = night ? [.085,.10,.15] : twilight ? [.24,.20,.27] : vector(p.ambientSky, [.42,.48,.57]);
    const ambientGround = night ? [.035,.04,.06] : vector(p.ambientGround, [.21,.20,.18]);
    const zenith = night ? [.008,.014,.035] : twilight ? [.12,.12,.25] : vector(p.zenith, [.18,.35,.59]);
    const horizon = night ? [.035,.045,.07] : twilight ? [.65,.30,.15] : vector(p.horizon, [.55,.66,.73]);
    const fogColor = night ? [.025,.035,.055] : twilight ? (tod === "dawn" ? [.52,.36,.34] : [.58,.28,.10]) : vector(p.fogColor || p.fog, [.55,.62,.67]);
    if (overcast) {
      const attenuation = storm ? .22 : .48;
      for (let i = 0; i < 3; i++) {
        sunColor[i] *= attenuation;
        if (!night) { zenith[i] = storm ? [.09,.11,.14][i] : [.29,.33,.38][i]; horizon[i] = storm ? [.17,.19,.22][i] : [.49,.52,.55][i]; fogColor[i] = horizon[i]; }
        ambientSky[i] *= storm ? .65 : .86;
      }
    }
    return { night, wet, sunDir, sunColor, ambientSky, ambientGround, fogColor,
      fogDensity: weather === "fog" ? .0065 : storm ? .0038 : wet ? .0018 : Number.isFinite(p.fogDensity) ? p.fogDensity : .0008,
      exposure: night ? 1.05 : twilight ? 1.02 : 1,
      sky: { zenith, horizon, sunDir: sunDir.slice(), sunColor: sunColor.slice(), stars: night ? 1 : 0, starBright: overcast ? 0 : 1, moon: night ? .85 : tod === "dawn" ? .3 : 0, cloud: overcast ? .95 : night ? .22 : .4 } };
  }
  // Match the circuit's lane direction without changing caller-owned camera vectors.
  // The authored CUT arc starts only after the rear clears the 6.4 m shutter.
  function fitPose(pose, anchor, authoredDeparture = false) {
    if (!pose || !anchor || (anchor.side !== 1 && anchor.side !== -1)) return pose;
    if (pose.side !== anchor.side) {
      pose.x = -pose.x; pose.yaw = -pose.yaw;
      if (pose.eye) pose.eye[0] = -pose.eye[0];
      if (pose.aim) pose.aim[0] = -pose.aim[0];
    }
    pose.side = anchor.side;
    pose.exteriorUnsupported = false;
    if (!authoredDeparture) return pose;
    const bands = anchor.bands, door = anchor.door;
    const wallZ = door && bands ? door.z + bands.work + bands.corridor + bands.fast : NaN;
    const room = wallZ - 9.8 - .30, square = room * room - 3.18 * 3.18;
    const radius = room > 0 && square > 0 ? Math.min(3.2, Math.sqrt(square) - .95) : 0;
    if (!(radius > 0)) { pose.exteriorUnsupported = true; return pose; }
    const angle = Math.min(Math.PI / 2, Math.abs(pose.yaw));
    const k = Math.min(1, angle / .4), blend = k * k * (3 - 2 * k);
    const correction = (radius - 3.2) * blend;
    const dx = anchor.side * correction * (1 - Math.cos(angle)), dz = correction * Math.sin(angle);
    pose.x += dx; pose.z += dz;
    if (!pose.calm) {
      if (pose.eye) { pose.eye[0] += dx; pose.eye[2] += dz; }
      if (pose.aim) { pose.aim[0] += dx; pose.aim[2] += dz; }
    }
    return pose;
  }
  function contactHeight(surface, x, z) {
    const door = surface && surface.bounds ? surface.bounds[2] : 6.4;
    let y = surface && typeof GarageExteriorGeometry.sampleHeight === "function" ? GarageExteriorGeometry.sampleHeight(surface, x, z) : null;
    if (!Number.isFinite(y)) y = z < door ? 0 : .03;
    // Match the short sill ramp without a one-frame chassis/camera step.
    if (z >= door && z < door + .3) { const t = (z - door) / .3; y *= t * t * (3 - 2 * t); }
    return y;
  }
  function wheelHeight(surface, x, z, c, s, lateral, longitudinal) {
    return contactHeight(surface, x + c * lateral + s * longitudinal, z - s * lateral + c * longitudinal);
  }
  function groundPose(pose, surface, followCamera = false) {
    if (!pose) return pose;
    const yaw = pose.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw), x = pose.x || 0, z = pose.z || 0;
    const fl = wheelHeight(surface, x, z, c, s, -.79, 1.7), fr = wheelHeight(surface, x, z, c, s, .79, 1.7);
    const rl = wheelHeight(surface, x, z, c, s, -.79, -1.6), rr = wheelHeight(surface, x, z, c, s, .79, -1.6);
    pose.groundY = ((fl + fr) * 1.6 + (rl + rr) * 1.7) / 6.6;
    pose.groundForward = (fl + fr - rl - rr) / 6.6;
    pose.groundRight = (fr + rr - fl - rl) / 3.16;
    if (followCamera && !pose.calm) {
      if (pose.eye) pose.eye[1] += pose.groundY;
      if (pose.aim) pose.aim[1] += pose.groundY;
    }
    return pose;
  }
  // Orthonormal road frame, then the garage model's existing X reflection.
  function poseMatrix(pose, out) {
    const yaw = pose && pose.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const forward = pose && pose.groundForward || 0, right = pose && pose.groundRight || 0;
    let nx = -right * c - forward * s, ny = 1, nz = right * s - forward * c;
    const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
    let fx = s, fy = forward, fz = c;
    const fn = Math.hypot(fx, fy, fz); fx /= fn; fy /= fn; fz /= fn;
    let rx = ny * fz - nz * fy, ry = nz * fx - nx * fz, rz = nx * fy - ny * fx;
    const rn = Math.hypot(rx, ry, rz); rx /= rn; ry /= rn; rz /= rn;
    fx = ry * nz - rz * ny; fy = rz * nx - rx * nz; fz = rx * ny - ry * nx;
    out[0] = -rx; out[1] = -ry; out[2] = -rz; out[3] = 0;
    out[4] = nx; out[5] = ny; out[6] = nz; out[7] = 0;
    out[8] = fx; out[9] = fy; out[10] = fz; out[11] = 0;
    out[12] = pose && pose.x || 0; out[13] = pose && pose.groundY || 0; out[14] = pose && pose.z || 0; out[15] = 1;
    return out;
  }
  function snapshot(s) {
    const tod = s.tod || "default";
    return { trackId: s.trackId || s.def && s.def.id || "", teamId: s.teamId || "", weather: s.weather || "dry",
      tod, night: s.night != null ? !!s.night : tod === "night" || tod === "dusk" || tod === "dawn" || tod === "default" && !!(s.def && s.def.night), def: s.def };
  }
  const geometryKey = s => JSON.stringify([s.trackId, s.teamId, s.night]);
  const selectionKey = s => geometryKey(s) + "|" + s.weather + "|" + s.tod;
  function create(deps) {
    const { gfx, load } = deps;
    const now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const yieldTask = deps.yieldTask || (() => new Promise(resolve => setTimeout(resolve, 0)));
    let selected = null, key = "", generation = 0, status = "idle", error = null, readySet = null, job = null;
    let queue = Promise.resolve(), attempts = 0, retryAt = 0;
    const material = { ground: {}, road: {}, props: {} };
    let rainMesh = null;
    const rainMatrix = new Float32Array(IDENTITY);
    // Lit transparency keeps normal scene depth testing; noAlphaWrite preserves the scene's alpha.
    const rainOpts = { alpha: .30, doubleSided: true, noAlphaWrite: true, roughness: 1, specular: 0, emissive: .25 };
    function freeWeather() { if (rainMesh) gfx.freeMesh(rainMesh); rainMesh = null; }
    function weatherMesh() {
      if (!ready() || !/^(rain|storm)$/.test(selected.weather)) { freeWeather(); return; }
      rainOpts.alpha = selected.weather === "storm" ? .42 : .30;
      if (rainMesh) return;
      const data = { pos: [], nrm: [], col: [], idx: [] };
      // 12 columns x 8 repeated vertical bands. All z remain beyond the shutter;
      // translating only Y cannot bring precipitation into the dry service box.
      for (let column = 0; column < 12; column++) for (let layer = 0; layer < 8; layer++) {
        const x = -19 + ((column * 17) % 39), z = 7.1 + (column * 23) % 86;
        const y = .4 + layer * 2 + ((column * 7) % 11) / 11, at = data.pos.length / 3;
        data.pos.push(x-.025,y,z, x+.025,y,z, x+.115,y+.65,z, x+.065,y+.65,z);
        for (let i=0;i<4;i++) { data.nrm.push(0,0,-1); data.col.push(.58,.67,.76); }
        data.idx.push(at,at+1,at+2,at,at+2,at+3);
      }
      const gen = generation;
      let handle;
      try { handle = gfx.createMesh(data); } catch (_) { return; }   // decorative rain cannot fail the selected world
      if (gen !== generation || !ready()) { if (handle) gfx.freeMesh(handle); return; }
      rainMesh = handle;
    }
    function notify() { if (deps.onChange) { try { deps.onChange(state()); } catch (_) { /* observer owns no resources */ } } }
    function free(set) { if (set) for (const name of ["ground", "road", "props"]) if (set[name]) gfx.freeMesh(set[name]); }
    function appearance() {
      if (!/^(rain|storm)$/.test(selected.weather)) freeWeather();
      const wet = wetWeather(selected.weather), dark = selected.night;
      Object.assign(material.ground, { roughness: wet ? .65 : .94, metalness: 0 });
      Object.assign(material.road, { roughness: wet ? .24 : .85, metalness: wet ? .06 : 0, specular: wet ? .65 : .25 });
      Object.assign(material.props, { roughness: wet ? .48 : .78, metalness: .04, emissive: dark ? .75 : 0 });
    }
    function state() { return { status, key, generation, error, attempts, retryAt, stats: readySet ? readySet.stats : null,
      trackId: selected ? selected.trackId : null, weather: selected ? selected.weather : null, tod: selected ? selected.tod : null, rain: !!rainMesh, anchor: readySet ? readySet.anchor : null }; }
    function ready(s) { return !!readySet && status === "ready" && (!s || selectionKey(snapshot(s)) === key); }
    function discard() { free(readySet); readySet = null; freeWeather(); }
    function cancel() { generation++; selected = null; key = ""; if (job) job.cancel(); job = null; discard(); status = "idle"; error = null; attempts = 0; retryAt = 0; notify(); }
    function request(value, opts) {
      const s = snapshot(value || {}), nextKey = selectionKey(s), geomKey = geometryKey(s);
      if (!s.trackId || !s.teamId) { cancel(); return Promise.resolve(false); }
      if (key === nextKey && ready()) return Promise.resolve(true);
      if (selected && geometryKey(selected) === geomKey) {
        if (key !== nextKey) { selected = s; key = nextKey; generation++; appearance(); }
        if (readySet) { status = "ready"; weatherMesh(); notify(); return Promise.resolve(ready()); }
        if (job && job.geometryKey === geomKey) { notify(); return job.promise; }
        // A frame loop may request forever; only explicit retry may restart a failed key.
        if (!(opts && opts.retry) || attempts >= 2 || Date.now() < retryAt) return Promise.resolve(false);
      } else {
        selected = s; key = nextKey; generation++; if (job) job.cancel(); job = null; discard(); attempts = 0; retryAt = 0;
      }
      appearance(); status = "loading"; error = null; attempts++;
      const mine = { geometryKey: geomKey, promise: null, cancel: null };
      const aborted = new Promise(resolve => { mine.cancel = () => resolve(null); });
      const wait = promise => Promise.race([promise, aborted]);
      job = mine;
      const current = () => job === mine && selected && geometryKey(selected) === geomKey;
      mine.promise = queue.catch(() => {}).then(async () => {
        const owned = {};
        let iterator = null;
        try {
          if (!current()) return false;
          const def = await wait(load(Object.assign({}, s)));
          if (!current()) return false;
          if (!def || def.id !== s.trackId) throw new Error("Selected circuit unavailable");
          if (typeof GarageExteriorGeometry === "undefined") throw new Error("Exterior geometry unavailable");
          const buildAt = now();
          let maxSliceMs = 0, uploadMs = 0;
          iterator = GarageExteriorGeometry.buildSteps(def, { teamId: s.teamId, night: s.night });
          let step;
          do {
            await wait(yieldTask()); if (!current()) return false;
            const at = now(); step = iterator.next();
            maxSliceMs = Math.max(maxSliceMs, now() - at);
          } while (!step.done);
          const data = step.value;
          if (!data || data.supported === false) {
            status = "unsupported"; error = data && data.reason || "No real garage bay"; return false;
          }
          for (const name of ["ground", "road", "props"]) {
            await wait(yieldTask()); if (!current()) return false;
            if (!data[name] || !data[name].pos || !data[name].pos.every(Number.isFinite)) throw new Error("Invalid exterior " + name);
            const uploadAt = now();
            owned[name] = gfx.createMesh(data[name]);
            uploadMs += Math.max(0, now() - uploadAt);
            if (!owned[name]) throw new Error("Exterior upload failed");
            if (!current()) return false;
          }
          if (!current()) return false;
          readySet = Object.assign({}, owned, { surface: data.surface || null, stats: Object.assign({}, data.stats,
            { maxSliceMs, uploadMs, buildWallMs: Math.max(0, now() - buildAt) }), anchor: data.anchor || null });
          for (const name of ["ground", "road", "props"]) delete owned[name];
          status = "ready"; weatherMesh(); return ready();
        } catch (e) {
          if (current()) { status = "failed"; error = String(e && e.message || e); retryAt = Date.now() + 1000; }
          return false;
        } finally {
          if (iterator && iterator.return) { try { iterator.return(null); } catch (_) { /* abandoned CPU iterator */ } }
          free(owned);
          if (current()) { job = null; notify(); }
        }
      });
      queue = mine.promise;
      notify(); return mine.promise;
    }
    function draw() {
      if (!ready()) return false;
      gfx.draw(readySet.ground, IDENTITY, material.ground);
      gfx.draw(readySet.road, IDENTITY, material.road);
      gfx.draw(readySet.props, IDENTITY, material.props);
      return true;
    }
    function drawWeather(sceneNow, reducedMotion) {
      if (!ready() || !rainMesh || !/^(rain|storm)$/.test(selected.weather)) return false;
      // Same millisecond render clock as GarageScene.live and garageCtx.sceneNow.
      const seconds = Number.isFinite(sceneNow) ? Math.max(0, sceneNow) / 1000 : 0;
      rainMatrix[13] = reducedMotion ? 0 : -(seconds * (selected.weather === "storm" ? 10 : 7) % 2);
      gfx.draw(rainMesh, rainMatrix, rainOpts);
      return true;
    }
    return { request, ready, draw, drawWeather, groundPose: (pose, follow) => ready() ? groundPose(pose, readySet.surface, follow) : pose, state, cancel, release: cancel, retry: s => request(s || selected, { retry: true }) };
  }
  return Object.freeze({ create, lighting, fitPose, groundPose, poseMatrix });
})();
