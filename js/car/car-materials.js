/* Apex 26 — car surface ids, finish remaps, palette colours, and paint helpers for Car3D. */
"use strict";
const CarMaterials = (function () {
  const SURFACES = Object.freeze({
    custom: 0, paint: 20, carbon: 21, rubber: 22,
    metal: 23, glass: 24, visor: 32,   // 32 is glass-like but DIELECTRIC, not chrome: glsl-lit.js baseRefl
    emissive: 25, functionalEmissive: 25, panel: 26, mirror: 27, sidewall: 33,   // 33: satin tyre sidewall (glsl-lit.js)
  });
  // A livery FINISH is a surface-id remap on painted vertices, not a material
  // uniform: the shaders classify car surfaces 20-40 and branch per id, so a new
  // finish costs an id in that chain (js/render/glx/shaders/glsl-lit.js and its WGSL/TSL
  // mirrors) and one row here. `carbon` gets id 31 rather than reusing
  // SURFACES.carbon (21): 21 keeps the vertex colour, so pointing the finish at
  // it just rendered flatter TEAM-COLOURED paint. 31 darkens the albedo to bare
  // weave, and leaving 21 alone keeps genuinely carbon PARTS looking as they did.
  // Also the ORDER the garage's finish chips render in: js/garage/setup-sheet.js builds that
  // row as ["gloss", ...Object.keys(FINISH_SURFACE)] rather than keeping its own
  // copy, because the copy drifted — the row grew from three finishes to seven
  // and the spec asserting a count of 3 stayed behind, red and unnoticed for as
  // long as it took to run a 2.5-hour browser group. Gloss is absent by design:
  // it is the default and remaps nothing.
  const FINISH_SURFACE = Object.freeze({
    satin: 26, chrome: 27, matte: 28, carbon: 31, brushed: 29, pearl: 30,
    flake: 34, candy: 35, tinted: 36, chameleon: 37,   // shader branches exist in GLX/TLX/WGX (surface-id-parity.test.mjs)
    forged: 38, gunmetal: 39, goldplate: 40,
  });
  // RESERVED FINISH IDS (garage finishes contract, 2026-10-17). A finish row joins FINISH_SURFACE only when its
  // shader branch exists in GLX, TLX and WGX, so the garage never offers a finish that renders as plain paint;
  // the id is fixed here first so the slices cannot take the same one. tests/unit/livery-finish-contract.test.mjs
  // pins that no id repeats and that every FINISH_SURFACE id is either shipped (<= 33) or reserved.
  const FINISH_RESERVED = Object.freeze({ flake: 34, candy: 35, tinted: 36, chameleon: 37, forged: 38, gunmetal: 39, goldplate: 40 });
  const DARK   = [0.05, 0.05, 0.05];
  // Deeper resin base so the shader weave (CarMaterialShade.CARBON) reads at
  // garage and near-track distance instead of flat charcoal paint.
  const CARBON = [0.055, 0.056, 0.062];
  const VISOR  = [0.08, 0.08, 0.09];          // tinted visor
  const PANEL  = [0.82, 0.82, 0.86];          // matte sponsor / number plate
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];
  const INTAKE = [0.03, 0.03, 0.04];          // radiator inlet void
  // Cooler / brighter titanium: the metal env lobe (CarMaterialShade.METAL) needs
  // enough albedo for the halo and exhaust tips to read at garage distance.
  const HALO   = [0.22, 0.225, 0.245];
  // Exhaust tip / heat-shield metal (optional palette; car3d may still inline).
  const EXHAUST = [0.14, 0.13, 0.12];
  const TYRE_BAND     = { 0: [0.92, 0.92, 0.90], 1: [0.85, 0.10, 0.08], 2: [0.95, 0.15, 0.05] };
  const BRAKE_CALIPER = { 0: null, 1: null, 2: [0.75, 0.08, 0.05] };
  const TCAM_IDS = Object.freeze(["team", "auto", "black", "yellow"]);
  const TCAM_BLACK = Object.freeze([0.05, 0.05, 0.06]);
  const TCAM_YELLOW = Object.freeze([0.96, 0.78, 0.08]);
  function tcamColour(pick, teamId, num, accent) {
    if (pick === "black") return TCAM_BLACK;
    if (pick === "yellow") return TCAM_YELLOW;
    if (pick === "auto") {
      const t = typeof Teams !== "undefined" && Teams.LIST && Teams.LIST.find((x) => x.id === teamId);
      const first = t && t.drivers && t.drivers[0] ? t.drivers[0].num : null;
      return (first != null && num != null && num !== first) ? TCAM_YELLOW : TCAM_BLACK;
    }
    return accent;
  }
  // Smooth a curved skin by averaging coincident face normals, before caps.
  // Stays with materials/shading (normals only); not part of the body-geom extract.
  function smoothSkin(out, start) {
    const normals = new Map();
    for (let i = start; i < out.pos.length / 3; i++) {
      const k = out.pos.slice(i * 3, i * 3 + 3).join(","), n = normals.get(k) || [0, 0, 0];
      for (let j = 0; j < 3; j++) n[j] += out.nrm[i * 3 + j];
      normals.set(k, n);
    }
    for (let i = start; i < out.pos.length / 3; i++) {
      const n = normals.get(out.pos.slice(i * 3, i * 3 + 3).join(",")), L = Math.hypot(...n);
      for (let j = 0; j < 3; j++) out.nrm[i * 3 + j] = n[j] / (L || 1);
    }
  }
  function applyBodySplit(out, i0, i1, leftC, rightC) {
    for (let i = i0; i < i1; i++) {
      if (out.mat[i] !== SURFACES.paint) continue;
      const c = out.pos[i * 3] < 0 ? leftC : rightC;
      out.col[i * 3] = c[0]; out.col[i * 3 + 1] = c[1]; out.col[i * 3 + 2] = c[2];
    }
  }
  function finishOf(livery, field) {
    const value = livery && livery[field];
    return value === "gloss" || Object.hasOwn(FINISH_SURFACE, value) ? value : livery && livery.finish || null;
  }
  // Section (or zone) name -> the livery field that picks its own finish. A section not listed takes
  // the whole-car `finish`. NOSE is not a section: noseFinish takes every PAINTED chassis / hood /
  // livery vertex ahead of the bulkhead (z >= NOSE_Z) — the cone, its cap and its stripes — so the
  // nose needs no split of the shared chassis loft.
  const ZONE_FINISH = Object.freeze({ engineCover: "coverFinish", frontWing: "wingFinish", rearAssembly: "wingFinish",
    halo: "haloFinish", sidepods: "podFinish", sharkFin: "finFinish", mirrors: "mirrorFinish",
    floor: "floorFinish", suspension: "suspFinish" });
  const NOSE_Z = 1.55, NOSE_SECTIONS = ["chassis", "hood", "livery"];
  const pickedFinish = (v) => v === "gloss" || Object.hasOwn(FINISH_SURFACE, v) ? v : null;
  // `zones` (optional) are { name, from, to } spans drawn inside another section that belong to `name`'s
  // finish (Car3D's zone(): pod panel, cover stripes, floor, headrest, deflector; #2796). They are
  // remapped first and never revisited.
  function applyFinish(out, finish, sections, livery, zones) {
    const noseFin = livery && pickedFinish(livery.noseFinish), nose = [];
    if (noseFin && sections) for (const section of sections) if (NOSE_SECTIONS.includes(section.name))
      for (let i = section.from; i < section.to; i++) if (out.mat[i] === SURFACES.paint && out.pos[i * 3 + 2] >= NOSE_Z) nose.push(i);
    if (sections && livery && Object.values(ZONE_FINISH).some((f) => livery[f] && livery[f] !== "inherit")) {
      const done = zones && zones.length ? new Uint8Array(out.mat.length) : null;
      for (const section of done ? zones.concat(sections) : sections) {
        const choice = finishOf(livery, ZONE_FINISH[section.name]), local = FINISH_SURFACE[choice] || SURFACES.paint;
        for (let i = section.from; i < section.to; i++) {
          if (out.mat[i] !== SURFACES.paint || (done && done[i])) continue;
          out.mat[i] = local; if (done) done[i] = 1;
        }
      }
    } else {
      const finishSurface = FINISH_SURFACE[finish];
      if (finishSurface) {
        for (let i = 0; i < out.mat.length; i++) {
          if (out.mat[i] === SURFACES.paint) out.mat[i] = finishSurface;
        }
      }
    }
    const noseId = FINISH_SURFACE[noseFin] || SURFACES.paint;
    for (const i of nose) out.mat[i] = noseId;
  }
  // PAINT ZONES (paint-zones-t6w2): parts that were fixed carbon or body colour take an optional
  // livery tint. Each row names a zone range (Car3D's zone()) or a whole Car3D section. A tint
  // recolours the range's paint and carbon vertices (voids darker than VOID stay: inlet mouths) and
  // makes that carbon PAINT, so FINISH or the row's own finish then lands on it; a finish alone also
  // makes the carbon paint (the mirror-housing rule). paintOnly rows recolour paint, never carbon.
  // Every field unset = nothing runs = today's mesh, byte for byte. Runs BEFORE applyFinish.
  const PAINT_ZONES = Object.freeze([
    { colour: "floorTint", finish: "floorFinish", zone: "floor" },
    { colour: "suspTint", finish: "suspFinish", section: "suspension" },
    { colour: "ductTint", section: "brakeDucts" },
    { colour: "deflectorTint", zone: "deflector" },
    { colour: "cockpitTint", zone: "headrest" },
    { colour: "cockpitTint", section: "bolsters", paintOnly: true },
    { colour: "boardTint", section: "sponsorBoard", paintOnly: true },
  ].map(Object.freeze));
  const VOID = 0.045;
  function zoneColour(v) {
    if (Array.isArray(v)) return v.length >= 3 && v.slice(0, 3).every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
    const m = typeof v === "string" && /^#?([0-9a-f]{6})$/i.exec(v);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function applyZones(out, zones, sections, livery, dim) {
    if (!livery) return;
    for (const z of PAINT_ZONES) {
      const raw = zoneColour(livery[z.colour]), fin = z.finish && pickedFinish(livery[z.finish]);
      if (!raw && !fin) continue;
      const t = raw && (dim ? dim(raw) : raw), c = t && t.map((x) => Math.min(Math.max(x, 0), 1));
      for (const r of (z.zone ? zones : sections) || []) {
        if (r.name !== (z.zone || z.section)) continue;
        for (let i = r.from; i < r.to; i++) {
          const m = out.mat[i];
          if (m !== SURFACES.paint) {
            if (z.paintOnly || m !== SURFACES.carbon) continue;
            if (Math.max(out.col[i * 3], out.col[i * 3 + 1], out.col[i * 3 + 2]) < VOID) continue;
            out.mat[i] = SURFACES.paint;
          }
          if (c) { out.col[i * 3] = c[0]; out.col[i * 3 + 1] = c[1]; out.col[i * 3 + 2] = c[2]; }
        }
      }
    }
  }

  // Shade contract (carbon / gloss / matte / metal) — see car-material-shade.js.
  // Re-exported so Car3D and tests reach one table; shaders stay hand-ported.
  const SHADE = (typeof CarMaterialShade !== "undefined") ? CarMaterialShade : null;

  return {
    SURFACES, FINISH_SURFACE, FINISH_RESERVED, SHADE, finishOf,
    DARK, CARBON, VISOR, PANEL, TYRE, RIM, HUB, INTAKE, HALO, EXHAUST,
    TYRE_BAND, BRAKE_CALIPER,
    TCAM_IDS, tcamColour,
    smoothSkin, applyBodySplit, applyFinish, applyZones, PAINT_ZONES, ZONE_FINISH, zoneColour,
  };
})();
Object.freeze(CarMaterials);
