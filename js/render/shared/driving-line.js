"use strict";
/* Apex 26 — DrivingLine: the suggested-line ribbon every racing game draws on
 * the road, as DATA. Backend-agnostic: this file samples the circuit, decides
 * where the line runs and how fast a car can be on each metre of it, and
 * emits one interleaved vertex strip; each backend's drawDrivingLine (GLX
 * LINE_VS/FS, WGX WGSLFx.LINE, TLX tsl-fx lineMat) uploads and shades it. Nothing here touches a car — the arc reaches the PICTURE only
 * (docs/PHYSICS.md §curvature reads: render-only).
 *
 * WHAT THE OTHER GAMES DO (researched 2026-09-08, sources in
 * docs/notes/DRIVING-LINE-RESEARCH.md):
 *   Forza    Suggested Line: FULL / BRAKING ONLY / OFF. One ribbon; blue where it
 *            is ideal to accelerate, red where the driver should slow down.
 *            BRAKING ONLY draws only the red parts. White when off the track.
 *   F1 (EA)  Dynamic Racing Line: FULL / CORNERS ONLY / OFF, 2D flat or 3D
 *            raised; green (on pace) → amber (lift) → red (brake) against the
 *            PLAYER's speed, so the same corner reads differently at 300 and
 *            at 200 km/h — "dynamic".
 *   GT7      a dotted Driving Line, side-of-road Corner Indicators, and a
 *            separate Braking Area marker; the line itself is NOT colour-coded.
 *   Engines  the geometry is a polystrip laid on the road (a generated mesh
 *            decal, depth-tested, no depth write, biased off the surface) —
 *            the same shape as this game's batched skid marks.
 * This is Forza's shape with F1's three-colour dynamic grammar and F1's mode
 * names (which the STEERING assist already uses: OFF / CORNERS / FULL).
 *
 * THE LINE. The circuit's baked racing line (js/track/core/line.js: turn-in
 * on the outside, apex on the inside, exit released wide — the line the AI
 * drives) when the track carries one; otherwise the steering assist's lateral
 * formula (game.js `lineX`) read against the CHANGE in curvature so a long
 * arc keeps its apex (see lateral()).
 *
 * THE SPEED. A cornering cap v = sqrt(LAT_MAX·grip/|k|) capped at vTop, swept
 * BACKWARDS under the brake budget (a car can only lose so much speed per
 * metre) and FORWARDS under the accel budget. The backward sweep is what turns
 * the cap into braking ZONES that begin before the corner — the part a player
 * actually wants shown.
 *
 * THE LOOK. Not a solid ribbon: a chevron every few metres pointing the way
 * the lap runs, the tip on the centre and the wings trailing at the edges —
 * the F1 games' form — each arrow bending with the road because it lives in
 * the strip's own space (the owner asked for arrows on a properly curving
 * line, 2026-09-08). The shaders pattern it from the per-vertex ALONG value
 * (metres of lap), so all three backends agree.
 *
 * VERTEX LAYOUT (interleaved Float32, STRIDE floats per vertex, two vertices
 * per sample, a triangle strip): pos3, across (-1 | +1), vLine (m/s), zone
 * (0 straight … 1 corner/braking, held past the exit and smoothed so CORNERS
 * mode fades in and out over tens of metres, never a cut), along (m). */
window.DrivingLine = (function () {
  const STRIDE = 7;
  const STEP = 2.5;          // m between samples (a 5 km lap ≈ 2000 samples)
  const LOOK = 60;           // m — the assist's look-ahead at ~70 m/s (25-90)
  const HALF_W = 0.75;       // m — half the ribbon width (one 1.5 m row of chevrons)
  const LIFT = 0.03;         // m above the road (the road mesh sits at +0.02)
  const MODES = ["off", "corner", "full"];
  const KMIN = 1 / 400;      // |k| above this is "a corner" (radius under 400 m)
  const LEAD_OUT = 60;       // m the CORNERS line stays lit past a corner's exit
  const FADE = 35;           // m half-width of the zone smoothing (a ~70 m fade)

  let mode = "full";
  const cache = { id: null, verts: null, count: 0, dirty: false, v: null, zone: null, n: 0, step: STEP };

  const clamp = M4.clamp;   // the shared scalar helper (js/core/mat4.js), never a private copy

  function setMode(m) { mode = MODES.includes(m) ? m : "off"; return mode; }
  function getMode() { return mode; }
  // LINE COLOUR. The speed cue is only a cue if it can be read: F1's own
  // green/amber/red puts the two ends of the scale on the pair the common
  // red-green deficiencies cannot separate. `safe` swaps in the IBM
  // colour-blind-safe triple; every backend's shader mixes between the two on
  // this one flag (SETTINGS › LINE COLOUR, and F1 25 offers the same choice).
  let palette = "f1";
  const PALETTES = ["f1", "safe"];
  function setPalette(p) { palette = PALETTES.includes(p) ? p : "f1"; return palette; }
  function getPalette() { return palette; }
  // LINE OPACITY. F1 25 offers an "increased opacity" option; the complaint it
  // answers runs both ways, so this goes both ways — SUBTLE for the players who
  // find the ribbon intrusive in cockpit view (the same reason they step down
  // to CORNERS), SOLID for the ones who cannot pick it out against a bright
  // road. NORMAL is 1.0 and is exactly the line as shipped. The multiplier
  // scales the emissive feed and the alpha together, so a subtle line does not
  // keep its bloom.
  let opacity = "normal";
  const OPACITIES = [["subtle", 0.65], ["normal", 1], ["solid", 1.35]];
  function setOpacity(o) { opacity = OPACITIES.some((r) => r[0] === o) ? o : "normal"; return opacity; }
  function getOpacity() { return opacity; }
  function opacityMul() { return (OPACITIES.find((r) => r[0] === opacity) || OPACITIES[1])[1]; }

  /* The banked surface's lift at lateral o, the road mesh's own formula
     (js/track/core/mesh.js bankOffsetAt, index-keyed there) at the nearest
     centreline node — so the ribbon rides a banked corner where the road does. */
  function bankOffset(track, s, o) {
    const bp = track && track.bankP;
    if (!bp) return 0;
    const n = track.n, k = ((Math.round(s / track.total * n) % n) + n) % n;
    const lift = bp.lift[k];
    if (!(lift > 0)) return 0;
    const w = track.hw[k];
    const frac = clamp((bp.bsign[k] * o + w) / (2 * w), 0, 1);
    return lift * (frac - 0.5);
  }

  /* Lateral offset of the line at s: the assist's formula (game.js lineX) with
     one change. The assist reads the raw curvature ahead and behind, and with
     a fixed look-ahead that CANCELS inside a long constant-radius arc — 60 m
     into a 180° turn the corner ahead IS this corner, so "go wide for the next
     one" undid "hug this apex" and the line ran down the middle (unit test on
     a stadium, 2026-09-08). Reading the CHANGE in curvature instead keeps the
     entry and exit wide (a corner appearing ahead / disappearing behind) and
     the apex inside for however long the corner lasts. */
  function lateral(api, s, hw) {
    // The baked RACING LINE (js/track/core/line.js, 2026-09-08) when the
    // circuit has one: outside-inside-outside, the line the AI now drives, so
    // the picture and the field are one truth. `w` eases to 0 on a straight
    // ("no opinion"), which brings the ribbon back to the centre there.
    if (api.lineAt) {
      const ln = api.lineAt(s);
      if (ln && ln.w > 0) return clamp(ln.x * ln.w, -(hw - 0.6), hw - 0.6);
      return 0;
    }
    const k = api.curvature(s);
    const kA = api.curvature(s + LOOK) - k, kB = api.curvature(s - LOOK * 0.7) - k;
    return clamp(-k * 170 + (kA + kB) * 85, -0.72, 0.72) * Math.max(0, hw - 0.6);
  }

  /* Build the strip for `api` — see game.js drivingLineApi() for the shape:
     { id, total, track, sample(s, out), curvature(s), lineAt?(s) → {x, w},
       latMax, brake, accel, vTop, grip }. Returns the cache; call once per circuit. */
  function build(api) {
    const L = api.total, n = Math.max(8, Math.round(L / STEP));
    const ds = L / n;
    const latMax = api.latMax || 22, brake = (api.brake || 22) * 0.85, accel = api.accel || 7;
    const vTop = api.vTop || 72, grip = api.grip || 1;
    const v = new Float32Array(n), zone = new Float32Array(n), x = new Float32Array(n);
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    // 1. cornering cap and the line's lateral offset, per sample
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      api.sample(s, smp);
      const k = Math.max(Math.abs(api.curvature(s)), 1e-5);
      v[i] = Math.min(vTop, Math.sqrt(latMax * grip / k));
      x[i] = lateral(api, s, smp.hw);
    }
    // 2. backward sweep: entering sample i, a car can be at most as fast as it
    //    can brake down to v[i+1] over ds (the lap wraps).
    for (let pass = 0; pass < 2; pass++) {
      for (let j = n - 1; j >= 0; j--) {
        const i = (j + n) % n, nx = (i + 1) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * brake * ds));
      }
      // 3. forward sweep: leaving sample i, it can only have gained accel·ds.
      for (let i = 0; i < n; i++) {
        const pv = (i - 1 + n) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[pv] * v[pv] + 2 * accel * ds));
      }
    }
    // 4. zones: braking (speed still falling ahead) or a real corner. The
    //    braking sweep already gives every corner a long lead-IN; the exit had
    //    none — the zone ended the metre the curvature dropped, and with a
    //    30 m blend the line looked cut off at track-out (Monza T1 shot,
    //    2026-09-08). So: hold the zone LEAD_OUT metres past a corner, then a
    //    ±FADE box smooth so CORNERS mode fades over ~2·FADE m rather than pops.
    const raw = new Float32Array(n), held = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * ds, nx = (i + 1) % n;
      raw[i] = (v[nx] < v[i] - 0.05 || Math.abs(api.curvature(s)) > KMIN) ? 1 : 0;
    }
    const hold = Math.max(1, Math.round(LEAD_OUT / ds));
    for (let i = 0; i < n; i++) if (raw[i]) for (let d = 0; d <= hold; d++) held[(i + d) % n] = 1;
    const R = Math.max(1, Math.round(FADE / ds));
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let d = -R; d <= R; d++) acc += held[(i + d + n) % n];
      zone[i] = acc / (2 * R + 1);
    }
    // 5. the strip: two vertices per sample plus the two that close the loop.
    const verts = new Float32Array((n + 1) * 2 * STRIDE);
    let o = 0;
    for (let q = 0; q <= n; q++) {
      const i = q % n, s = i * ds;
      api.sample(s, smp);
      const p = smp.p, r = smp.r, t = smp.t;
      // up = r × t, the road mesh's frame (mesh.js buildRoad: p + r·o + u·bank)
      const ux = r[1] * t[2] - r[2] * t[1], uy = r[2] * t[0] - r[0] * t[2], uz = r[0] * t[1] - r[1] * t[0];
      for (let side = -1; side <= 1; side += 2) {
        const off = x[i] + side * HALF_W;
        const by = bankOffset(api.track, s, off) + LIFT;
        verts[o++] = p[0] + r[0] * off + ux * by;
        verts[o++] = p[1] + r[1] * off + uy * by;
        verts[o++] = p[2] + r[2] * off + uz * by;
        verts[o++] = side;
        verts[o++] = v[i];
        verts[o++] = zone[i];
        verts[o++] = q * ds;   // metres along the lap (q, not i: the closing pair reads L, not 0)
      }
    }
    cache.id = api.id; cache.verts = verts; cache.count = (n + 1) * 2; cache.dirty = true;
    cache.v = v; cache.zone = zone; cache.n = n; cache.step = ds;
    return cache;
  }

  /* The line's speed at arc position s (m/s), for a HUD or a test. */
  function speedAt(s) {
    if (!cache.v) return null;
    const n = cache.n, f = ((s / cache.step) % n + n) % n;
    const i = Math.floor(f), j = (i + 1) % n, t = f - i;
    return cache.v[i] * (1 - t) + cache.v[j] * t;
  }
  function zoneAt(s) {
    if (!cache.zone) return null;
    const n = cache.n, i = Math.floor(((s / cache.step) % n + n) % n);
    return cache.zone[i];
  }

  /* Draw through a backend: `gfx.drawDrivingLine(verts, count, dirty, opts)`.
     Builds lazily when the circuit changed. Returns false when the line is off
     or the backend's pass is not ready. */
  function draw(gfx, api, playerSpeed) {
    if (mode === "off" || !gfx || typeof gfx.drawDrivingLine !== "function") return false;
    if (cache.id !== api.id || !cache.verts) build(api);
    const drew = gfx.drawDrivingLine(cache.verts, cache.count, cache.dirty, {
      speed: playerSpeed || 0, cornersOnly: mode === "corner", palette: palette === "safe" ? 1 : 0,
      opacity: opacityMul(),
    });
    if (drew) cache.dirty = false;
    return !!drew;
  }

  /* THE BRAKING CUE, as a number rather than a sound. F1 25 pairs the visual
     line with an audio braking assist; the reason to want one here is not
     parity, it is that the ribbon's speed cue is the one piece of this assist
     a player who cannot see the road cannot use. So the cue is derived from
     EXACTLY the quantity the shaders colour with — over = playerSpeed /
     lineSpeed, amber from 0.98, red by 1.16 (glsl-fx LINE_FS, wgsl-fx LINE,
     tsl-fx lineMat) — and not from a second opinion about braking. Ear and eye
     then say the same thing at the same moment, which is what makes it usable
     alongside the line rather than instead of it.

     It saturates WITH the red (1.16) but opens at 1.0, not at the shaders'
     0.98. That 0.02 is deliberate and it is the one place ear and eye are
     allowed to differ: 0.98 is fractionally UNDER the line's own speed, so the
     ribbon carries a faint tint while the player is exactly on the pace, which
     is unobjectionable in a colour and intolerable in a tone. A cue that beeps
     at a driver who is doing it right is a cue they switch off. Caught by the
     test below, which held the code to the sentence above rather than to what
     the code did.

     0 = on the line's pace or under it. 1 = the ribbon is fully red.
     Null when there is no baked profile to be over. */
  function cue(playerSpeed, s) {
    const v = speedAt(s);
    if (v == null) return null;
    const over = (playerSpeed || 0) / Math.max(v, 1);
    const t = clamp((over - 1) / (1.16 - 1), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function reset() { cache.id = null; cache.verts = null; cache.count = 0; cache.v = null; cache.zone = null; }

  return { MODES, PALETTES, OPACITIES, STRIDE, STEP, HALF_W, setMode, mode: getMode,
           setPalette, palette: getPalette, setOpacity, opacity: getOpacity, opacityMul,
           build, draw, speedAt, zoneAt, cue, reset,
           _cache: () => cache };
})();
