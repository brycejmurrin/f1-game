/* Apex 26 — PerfTry: default-OFF switches for renderer optimisations that
   cannot be measured on the CI box.

   WHY THIS EXISTS. docs/PERF-FINDINGS.md §0 records that the GPU half of this
   game is unmeasurable here: SwiftShader is fill-bound, so frame timing is
   misleading in the OPTIMISTIC direction and a render-mode CPU profile reads
   99.9% idle. Every finding in this file is mechanism-provable by reading, and
   none of them has a trustworthy number attached. Shipping them ON, on
   plausibility, is exactly the trade §3 exists to warn against.

   So they ship OFF, behind one switch each, and get measured on real hardware
   by whoever has some. A flag flipped here is a QUESTION, not a claim.

   HOW TO USE, on the live site or locally — no __apex hook needed, PerfTry is
   a plain global and resolves in any console:
     PerfTry.list()                    every switch: state, what, why, what to watch
     PerfTry.active()                  just the names that are ON
     PerfTry.set("skyLate", true)      turn one on (reloads: shaders recompile)
     ?perftry=skyLate,glStateCache     URL form, no console needed
     ?perftry=all / ?perftry=none      everything on / everything off
   The URL form overrides storage for that session only, so a link can demo a
   switch without touching anyone's saved state.

   Boot-time by design. Two of these are #defines injected into GLSL at compile
   time, so they cannot change without recompiling shaders; making the JS ones
   live while the GLSL ones need a reload would be a confusing half-measure, so
   all of them read once at boot and setting one reloads.

   Self-initialising (no create(G)). Every read is at call time, so this file
   has no eval-time dependencies and its position in the load order is free. */
const PerfTry = (function () {
  "use strict";

const KEY = "apex26.perfTry";

// name -> what it does, why it might win, and what to watch for when judging it.
// The `glsl` flag marks switches that become a #define in the shader source
// (see GLX.compile), rather than a branch in JS.
// NOT YET WIRED, deliberately absent rather than present-and-inert — a switch
// that does nothing is worse than no switch, because it reports a negative
// result that was never actually tested:
//
//   skyLate    Draw the sky AFTER the opaque world. SKY_FS is the second most
//              expensive shader here (up to 4 fbm() octaves, ~10 pow(), the
//              star grid, moon disc + halo, city-glow dome) and runs on EVERY
//              pixel today, 40-70% of which opaque geometry overwrites. Sky sits
//              at depth 1.0 (SKY_VS: z = w) with depth writes off under LEQUAL,
//              so drawing it last lets early-Z reject the covered fragments.
//              BLOCKED ON A REAL ORDERING HAZARD, not on effort: gfx.drawGlow()
//              is called from INSIDE drawWorldMeshes, so a naive move puts the
//              sky after the glow — and because the glow does not write depth,
//              the background stays at 1.0 and the sky would paint straight over
//              it. Doing this properly means hoisting the glow out of
//              drawWorldMeshes so the order becomes opaque -> sky -> glow.
//   floorLast  Draw the base floor plane last among the opaque world meshes.
//              Everything there writes depth under LEQUAL, so ties go to the
//              LAST draw, and where terrain and road are near-coplanar a reorder
//              flips which surface wins (docs/SCENERY-GROUNDING.md). Needs a
//              rendered lap, not just a frame.
//
// Both live in js/game.js, which was under concurrent edit when this landed.
const FLAGS = {
  glStateCache: {
    glsl: false,
    what: "Cache CULL_FACE / colorMask / POLYGON_OFFSET_FILL across draws.",
    why: "GLX.draw() brackets EVERY draw with gl.disable/enable(CULL_FACE), a colorMask " +
         "pair and a polygonOffset pair, while setBlend/setDepthMask ten lines above it " +
         "already collapse runs of identical state. Every car body and all 8 wheel draws " +
         "are doubleSided, so this is ~150-250 redundant GL calls per frame. CPU-side, " +
         "so unlike the others it may show up even on a weak GPU.",
    watch: "State leaks. If a draw path bypasses the cache the symptom is inverted " +
           "culling or missing alpha — look at wheels, brake rings and decals.",
  },
  flareGate: {
    glsl: true,
    what: "Compute the lens-flare occlusion depth fetch only when the flare is actually on.",
    why: "post.js samples uDepth for sunVis one line ABOVE the uFlareStr > 0.0 test that " +
         "is its only consumer, so every full-res composite pixel pays a depth fetch on " +
         "night frames, where flareStr is 0. Hygiene rather than a big win — uSunUV is a " +
         "uniform so the texture cache absorbs most of it.",
    watch: "Bit-identical by construction. If the flare changes at all, the reorder is wrong.",
  },
  lampFogGate: {
    glsl: true,
    what: "Accumulate per-lamp fog only when uLampFog > 0.",
    why: "lit.js accumulates lampFog inside the 32-iteration light loop for every lit " +
         "fragment, but its only consumer is gated on uLampFog > 0, which game.js drives " +
         "to exactly 0 in daylight. Bites where lamps are lit AND the key is bright: " +
         "daytime floodlights, and always-on fixtures like Monaco's tunnel.",
    watch: "Bit-identical by construction. Check a daytime floodlit scene and Monaco's " +
           "tunnel — if lamp fog changes there, the gate is wrong.",
  },
};

let _on = Object.create(null);

function load() {
  _on = Object.create(null);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === "object") for (const k in FLAGS) if (raw[k]) _on[k] = true;
  } catch (_) { /* No storage (Safari private mode) or corrupt JSON: every switch stays OFF, which is the safe default anyway. */ }
  // URL form wins over storage for the session, so a link can demo a switch
  // without touching anyone's saved state.
  try {
    const q = new URLSearchParams(location.search).get("perftry");
    if (q !== null) {
      const list = q.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.indexOf("none") >= 0) _on = Object.create(null);
      else if (list.indexOf("all") >= 0) { for (const k in FLAGS) _on[k] = true; }
      else { _on = Object.create(null); for (const n of list) if (FLAGS[n]) _on[n] = true; }
    }
  } catch (_) { /* No URLSearchParams or no location (test harness, worker): fall back to whatever storage gave us. */ }
}
load();

function on(name) { return _on[name] === true; }

function set(name, v, opts) {
  if (!FLAGS[name]) return false;
  if (v) _on[name] = true; else delete _on[name];
  try {
    const out = {};
    for (const k in _on) out[k] = true;
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch (_) { /* Storage write refused (quota is 0 in private mode): the switch still applies for THIS session, it just will not persist. */ }
  // Shaders are compiled once at renderer init, so a glsl switch cannot take
  // effect without a reload — and the JS ones change draw order, which is
  // clearer to judge from a clean frame than mid-lap.
  if (!(opts && opts.noReload) && typeof location !== "undefined") {
    setTimeout(() => { try { location.reload(); } catch (_) { /* No location to reload (harness): the flag is set; the caller reloads however it can. */ } }, 120);
  }
  return true;
}

/* The #define block GLX prepends to every shader. Injected AFTER the #version
   line, because GLSL requires #version to be the first non-comment token. */
function defines() {
  let s = "";
  for (const k in FLAGS) if (FLAGS[k].glsl && on(k)) s += "#define OPT_" + k.toUpperCase() + " 1\n";
  return s;
}

function list() {
  const out = {};
  for (const k in FLAGS) out[k] = { on: on(k), glsl: !!FLAGS[k].glsl, what: FLAGS[k].what, why: FLAGS[k].why, watch: FLAGS[k].watch };
  return out;
}

return { FLAGS, on, set, defines, list, reload: load, active: () => Object.keys(_on) };
})();
