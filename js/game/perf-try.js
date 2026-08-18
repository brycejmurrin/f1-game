/* Apex 26 — PerfTry: renderer A/B switches. Counted coverage/reach wins ship
   ON by default (`def: true`); unmeasured or look-sensitive ones stay OFF until
   someone with a real GPU flips them.

   WHY THIS EXISTS. docs/PERF-FINDINGS.md §0 records that the GPU half of this
   game is unmeasurable here: SwiftShader is fill-bound, so frame timing is
   misleading in the OPTIMISTIC direction and a render-mode CPU profile reads
   99.9% idle. Mechanism is readable; wall-clock ms is not. Shipping a change
   ON from a timing guess is the trade §3 warns against — but once coverage or
   reach is COUNTED (skyLate coveragePct, envCull chunk-reach.cjs), the switch
   is no longer a guess: `def: true` is the schema for that class. Pure
   multiplied-by-zero GLSL gates (flareGate, lampFogGate) are bit-identical and
   also default ON. Everything else stays `def`-absent (= OFF) and remains a
   QUESTION to measure on real hardware.

   HOW TO USE, on the live site or locally — no __apex hook needed, PerfTry is
   a plain global and resolves in any console:
     PerfTry.list()                    every switch: state, what, why, what to watch
     PerfTry.active()                  just the names that are ON
     PerfTry.set("skyLate", true)      turn one on (reloads: shaders recompile)
     ?perftry=skyLate,flareGate        URL form, no console needed
     ?perftry=all / ?perftry=none      everything on / everything off
   The URL form overrides storage for that session only, so a link can demo a
   switch without touching anyone's saved state. Storage persists only
   deviations from each flag's `def`, so an explicit OFF of a default-ON switch
   survives reload.

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
// `def: true` = ships ON (counted coverage/reach, or a bit-identical gate).
// Absent `def` = ships OFF. The `glsl` flag marks switches that become a
// #define in the shader source (see GLX.compile), rather than a branch in JS.
// NOT YET WIRED, deliberately absent rather than present-and-inert — a switch
// that does nothing is worse than no switch, because it reports a negative
// result that was never actually tested:
//
//   floorLast  Draw the base floor plane last among the opaque world meshes.
//              Everything there writes depth under LEQUAL, so ties go to the
//              LAST draw, and where terrain and road are near-coplanar a reorder
//              flips which surface wins (docs/SCENERY-GROUNDING.md). Needs a
//              rendered lap, not just a frame.
//
// Both live in js/game.js, which was under concurrent edit when this landed.
const FLAGS = {
  skyLate: {
    def: true,   // COUNTED coverage — docs/PERF-FINDINGS.md skyLate / coveragePct
    glsl: false,
    what: "Draw the sky AFTER the opaque world instead of before it.",
    why: "SKY_FS is the second most expensive shader in the renderer (up to 4 fbm() " +
         "octaves, ~10 pow(), the hash3 star grid, moon disc + halo, city-glow dome) " +
         "and without this switch it runs on EVERY pixel of the frame, most of which " +
         "opaque geometry then overwrites. The sky sits at depth 1.0 (SKY_VS: z = w) " +
         "with depth writes off under LEQUAL, so drawing it last lets early-Z reject " +
         "every covered fragment. COUNTED (docs/PERF-FINDINGS.md): vegas, six views " +
         "around the lap — opaque geometry covers 64.3 / 70.8 / 89.0 / 64.3 / 64.3 / " +
         "98.5 % of the frame (mean 75.2% coveragePct from render({what:'view'})), and " +
         "every covered pixel is a SKY_FS invocation early-Z rejects. That fraction " +
         "is not timed, so it transfers to a real GPU; ms still depends on the GPU. " +
         "Ships ON because the coverage was counted, not guessed.",
    watch: "The LAMP HALOS are the thing to check. The glow is additive with no depth " +
           "write, so it had to move after the sky too (opaque -> sky -> glow); if the " +
           "ordering is wrong the halos vanish against open sky, or the horizon looks " +
           "clipped. Check a night circuit with floodlights, and the horizon at dusk. " +
           "WGX sky pipelines MUST use depthCompare less-equal (not always) — always + " +
           "skyLate overwrites the lit world (hall-of-mirrors / melted scenery).",
  },
  // glStateCache: REMOVED after measurement. The audit claimed "~150-250
  // redundant GL calls per frame" from GLX.draw()'s uncached CULL_FACE /
  // colorMask / POLYGON_OFFSET_FILL toggles. Counted directly, by patching
  // WebGL2RenderingContext.prototype before any page script and sampling 12
  // frames per arm on vegas: those four calls total **63.5 per frame**, and
  // the cache collapses **zero** of them — 318 disable / 300 enable / 66
  // colorMask / 78 polygonOffset over 12 frames, byte-identical with the
  // switch on and off, with the flag verified as actually engaging
  // (PerfTry.on() read false then true inside the two arms, so this is a
  // measured zero and not a broken measurement).
  //
  // The reason is worth keeping: the toggles strictly ALTERNATE. Cars are
  // doubleSided and their neighbours are not, so every setCull genuinely
  // changes state and there is no run of identical state to collapse. A
  // redundancy cache can only pay where redundancy exists.
  //
  // docs/PERF-FINDINGS.md §1's pattern, exactly: findings estimated from
  // operation counts come in at a fraction of their billing or vanish. This
  // one vanished. The setCull/setAlphaWrite/setPolyOffset routing in glx.js
  // is KEPT — it is equivalent to the direct calls and tidier — but the switch
  // is gone, because a toggle that cannot change anything is a UI element that
  // can only mislead whoever flips it.
  flareGate: {
    def: true,   // bit-identical multiplied-by-zero gate (post.js sunVis / uFlareStr)
    glsl: true,
    what: "Compute the lens-flare occlusion depth fetch only when the flare is actually on.",
    why: "post.js samples uDepth for sunVis one line ABOVE the uFlareStr > 0.0 test that " +
         "is its only consumer, so every full-res composite pixel pays a depth fetch on " +
         "night frames, where flareStr is 0. Hygiene rather than a big win — uSunUV is a " +
         "uniform so the texture cache absorbs most of it. Ships ON: pure gate, " +
         "bit-identical by construction, day-correct (flareStr already 0 at night).",
    watch: "Bit-identical by construction. If the flare changes at all, the reorder is wrong.",
  },
  envCull: {
    def: true,   // COUNTED reach — docs/PERF-FINDINGS.md § env probe / tools/chunk-reach.cjs
    glsl: false,
    what: "Give the car-paint reflection probe its OWN 300 m draw-distance cull, "
        + "instead of letting it inherit the main camera's (which is 0 — no cull — "
        + "below PerfGov tier 3).",
    why: "envFaceBegin swaps viewProj and eye for the probe face but not cullDist, so a "
       + "64x64 reflection target re-draws the whole city through a 900 m frustum. "
       + "COUNTED, not estimated (docs/PERF-FINDINGS.md; tools/chunk-reach.cjs; over a "
       + "full 6-face cube the probe looks in every direction, so its coverage is exactly "
       + "a SPHERE of the far radius and the count needs no view matrix): at 900 m it "
       + "reaches 238.3 chunks / 1,256,344 indices per cube on vegas, 373.6 / 344,888 on "
       + "spa, 195.1 / 516,647 on monza. At 300 m that is 68-72% fewer indices and "
       + "78-83% fewer chunks, and the three circuits agree closely despite completely "
       + "different scenery (spa is 1594 small tree chunks over 207k tris, vegas 914 "
       + "large building chunks over 885k) — so it is a property of the radius, not of a "
       + "circuit. Why 300 m is defensible rather than arbitrary: a face is 90 deg across "
       + "64 pixels = 1.41 deg/px, so a 20 m building subtends ~2.7 px at 300 m and "
       + "0.9 px at 900 m — UNDER ONE PIXEL, in a target that is then mipmapped and "
       + "blurred. The whole 300-900 m band pays full vertex cost to move less than a "
       + "pixel. game.js already calls this pass 'the biggest per-frame load multiplier'; "
       + "the mitigation that shipped halved its RATE (one face every other frame), not "
       + "its REACH. Ships ON because the reach was counted.",
    watch: "This is the ONE switch here that is not bit-identical — it removes distant "
         + "geometry from the reflection, so judge it by LOOKING, not by assuming. Watch "
         + "a car's bodywork reflection on a street circuit with tall buildings (vegas, "
         + "singapore, baku): distant skyline should still read as skyline in the paint. "
         + "If the reflection visibly loses a landmark, or the horizon band in the "
         + "reflection changes colour, 300 m is too tight — raise it before rejecting "
         + "the idea, since 400 m still removes ~59%. Never takes effect where the main "
         + "camera is already culling tighter (it is a min, not an override).",
  },
  lampFogGate: {
    def: true,   // bit-identical multiplied-by-zero gate (lit.js lampFog / uLampFog)
    glsl: true,
    what: "Accumulate per-lamp fog only when uLampFog > 0.",
    why: "lit.js accumulates lampFog inside the 32-iteration light loop for every lit " +
         "fragment, but its only consumer is gated on uLampFog > 0, which game.js drives " +
         "to exactly 0 in daylight. Bites where lamps are lit AND the key is bright: " +
         "daytime floodlights, and always-on fixtures like Monaco's tunnel. Ships ON: " +
         "pure gate, bit-identical by construction, day-correct (uLampFog is 0 in day).",
    watch: "Bit-identical by construction. Check a daytime floodlit scene and Monaco's " +
           "tunnel — if lamp fog changes there, the gate is wrong.",
  },
};

let _on = Object.create(null);

function load() {
  _on = Object.create(null);
  // Schema defaults first (`def: true` → ON). Storage then overlays only keys it
  // actually holds, so an explicit OFF of a default-ON switch survives reload,
  // and an old ON-only blob does not wipe newer defaults for untouched keys.
  for (const k in FLAGS) if (FLAGS[k].def) _on[k] = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === "object") {
      for (const k in FLAGS) {
        if (Object.prototype.hasOwnProperty.call(raw, k)) {
          if (raw[k]) _on[k] = true; else delete _on[k];
        }
      }
    }
  } catch (_) { /* No storage (Safari private mode) or corrupt JSON: keep schema defaults. */ }
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
    // Persist only deviations from each flag's `def`, so default-ON switches
    // can be turned OFF without looking identical to "never touched".
    const out = {};
    for (const k in FLAGS) {
      const isOn = _on[k] === true;
      const defOn = !!FLAGS[k].def;
      if (isOn !== defOn) out[k] = isOn;
    }
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch (_) { /* Storage write refused (quota is 0 in private mode): the switch still applies for THIS session, it just will not persist. */ }
  // Shaders are compiled once at renderer init, so a glsl switch cannot take
  // effect without a reload — and the JS ones change draw order, which is
  // clearer to judge from a clean frame than mid-lap.
  if (!(opts && opts.noReload) && typeof location !== "undefined") {
    // DISARM THE CRASH SENTINEL FIRST — the fix js/game/gfx-quality.js already
    // carries, never copied to this sibling. PerfGov detects a jetsam/OOM kill
    // by finding the in-race flag still set at the next boot, so a
    // settings-driven reload with it armed is indistinguishable from the phone
    // dying. These buttons sit in the PAUSE menu and are NOT hidden on mobile
    // (unlike RENDERER), so toggling one mid-race cost a phone a free crash
    // strike — which pins tier floor 2 and pre-drops the render scale at the
    // next boot, degrading the very thing the experiment is trying to measure.
    try { if (typeof PerfGov !== "undefined" && PerfGov.sentinelArm) PerfGov.sentinelArm(false); } catch (_) {}
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

/* ── The UI ────────────────────────────────────────────────────────────────
   Rows are GENERATED here, not written into index.html, for the same reason
   the lighting tuner generates its rows from TUNE_DEFS: the shell carries a
   DOM-node ratchet (tests/unit/css-class-ratchet.test.mjs, justified by
   Lighthouse's ~1,400-node error band), and a hand-written row per switch
   would spend it on markup that changes every time a switch is added or
   retired. Runtime-injected nodes are not in index.html, so the ratchet is
   untouched — and the panel stays correct by construction when FLAGS changes.

   It also mints NO new CSS class: the buttons carry no class, exactly like
   their neighbours (#pm-res, #pm-renderer, #pm-gfx), so the class ceiling is
   untouched too. */
const LABELS = { skyLate: "SKY LATE", flareGate: "FLARE GATE", lampFogGate: "LAMP FOG GATE" };

function labelFor(k) { return LABELS[k] || k.replace(/([A-Z])/g, " $1").toUpperCase(); }

function paint(btn, k) {
  btn.textContent = labelFor(k) + ": " + (on(k) ? "ON" : "OFF");
  btn.setAttribute("aria-pressed", on(k) ? "true" : "false");
}

function initUI() {
  Log.info("game", "PerfTry.initUI");
  if (typeof document === "undefined") return;
  // Performance experiments have their own Settings category. Keeping them
  // out of DISPLAY means the ordinary rendering controls stay short and the
  // deliberately specialist switches are not mistaken for daily settings.
  const host = document.getElementById("pm-panel-performance");
  if (!host) return;

  const head = document.createElement("h3");
  head.className = "pm-group-h";          // existing class, nothing new minted
  head.textContent = "PERF EXPERIMENTS";
  host.appendChild(head);

  const note = document.createElement("p");
  // .adv-help is the existing small-explanatory-text class (css/tuner.css:
  // micro font, 0.6 opacity). Reused rather than minting a `pm-note` that does
  // not exist in css/ and would have rendered unstyled at body size.
  note.className = "adv-help";
  note.textContent = "Counted coverage/reach switches and pure gates default ON; the rest stay OFF until you measure them on YOUR hardware. Changing one reloads the page.";
  host.appendChild(note);

  for (const k of Object.keys(FLAGS)) {
    const b = document.createElement("button");
    b.id = "pm-try-" + k;
    // The tooltip is the honest part: what it does, and what breaking would
    // look like, so a tester knows what they are looking for rather than just
    // watching a frame counter.
    b.title = FLAGS[k].what + "\n\nWatch for: " + FLAGS[k].watch;
    paint(b, k);
    b.onclick = () => {
      const next = !on(k);
      set(k, next);                       // persists + reloads (shaders recompile)
      paint(b, k);
      b.textContent = labelFor(k) + ": " + (next ? "ON" : "OFF") + " — RELOADING…";
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* Audio not up yet (settings opened before first interaction): the toggle still applies. */ }
    };
    host.appendChild(b);
  }
}

if (typeof document !== "undefined") {
  // docs/PERF-FINDINGS.md defer trap: !== "complete" preserves today's wait and stays correct under defer.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
  else initUI();
}

function list() {
  const out = {};
  for (const k in FLAGS) {
    out[k] = {
      on: on(k), def: !!FLAGS[k].def, glsl: !!FLAGS[k].glsl,
      what: FLAGS[k].what, why: FLAGS[k].why, watch: FLAGS[k].watch,
    };
  }
  return out;
}

return { FLAGS, on, set, defines, list, reload: load, active: () => Object.keys(_on) };
})();
