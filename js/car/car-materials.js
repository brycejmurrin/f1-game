"use strict";
const CarMaterials = (function () {
  const SURFACES = Object.freeze({
    custom: 0, paint: 20, carbon: 21, rubber: 22,
    metal: 23, glass: 24, visor: 32,
    emissive: 25, functionalEmissive: 25, panel: 26, mirror: 27, sidewall: 33,
  });
  const FINISH_SURFACE = Object.freeze({
    satin: 26, chrome: 27, matte: 28, carbon: 31, brushed: 29, pearl: 30,
    flake: 34, candy: 35, tinted: 36, chameleon: 37,
    forged: 38, gunmetal: 39, goldplate: 40,
    holographic: 41, velvet: 42, hammered: 43, anodized: 44,
    oilslick: 60, frozen: 61, fluoro: 62, burnt: 63, alubare: 65, rawcarbon: 66, flovis: 67, carbonfade: 68,
    silverfade: 69, metalflop: 70, truematte: 71, pearlwhite: 72, jpsgold: 74, ghostpearl: 81, xirallic: 82,
    mystichrome: 83, midnightpurple: 84, ultrablack: 85,
  });
  const FINISH_RESERVED = Object.freeze({ flake: 34, candy: 35, tinted: 36, chameleon: 37, forged: 38, gunmetal: 39, goldplate: 40,
    holographic: 41, velvet: 42, hammered: 43, anodized: 44,
    oilslick: 60, frozen: 61, fluoro: 62, burnt: 63, alubare: 65, rawcarbon: 66, flovis: 67, carbonfade: 68, silverfade: 69,
    metalflop: 70, truematte: 71, pearlwhite: 72, jpsgold: 74, ghostpearl: 81, xirallic: 82, mystichrome: 83,
    midnightpurple: 84, ultrablack: 85 });
  const DARK   = [0.05, 0.05, 0.05];
  const CARBON = [0.055, 0.056, 0.062];
  const VISOR  = [0.08, 0.08, 0.09];
  const PANEL  = [0.82, 0.82, 0.86];
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];
  const INTAKE = [0.03, 0.03, 0.04];
  const HALO   = [0.22, 0.225, 0.245];
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
  const ZONE_FINISH = Object.freeze({ engineCover: "coverFinish", frontWing: "wingFinish", rearAssembly: "wingFinish",
    halo: "haloFinish", sidepods: "podFinish", sharkFin: "finFinish", mirrors: "mirrorFinish",
    floor: "floorFinish", suspension: "suspFinish", brakeDucts: "ductFinish", deflector: "deflectorFinish",
    headrest: "cockpitFinish", bolsters: "cockpitFinish", sponsorBoard: "boardFinish" });
  const NOSE_Z = 1.55, NOSE_SECTIONS = ["chassis", "hood", "livery"];
  const pickedFinish = (v) => v === "gloss" || Object.hasOwn(FINISH_SURFACE, v) ? v : null;
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
  const PAINT_ZONES = Object.freeze([
    { colour: "floorTint", finish: "floorFinish", zone: "floor" },
    { colour: "suspTint", finish: "suspFinish", section: "suspension" },
    { colour: "ductTint", finish: "ductFinish", section: "brakeDucts" },
    { colour: "deflectorTint", finish: "deflectorFinish", zone: "deflector" },
    { colour: "cockpitTint", finish: "cockpitFinish", zone: "headrest" },
    { colour: "cockpitTint", finish: "cockpitFinish", section: "bolsters", paintOnly: true },
    { colour: "boardTint", finish: "boardFinish", section: "sponsorBoard", paintOnly: true },
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

  const PH_HALO = 200, PH_HOOP = 201, PH_MIRROR = 202, PH_RIM = 203;
  const FINISH_FIELDS = Object.freeze(["finish", ...new Set(Object.values(ZONE_FINISH)), "noseFinish", "rimFinish"]);
  function finishPass(out, liv, f) {
    const hf = liv.haloFinish, haloOn = !!hf && hf !== "inherit", mf = liv.mirrorFinish, M = out.mat;
    const map = [haloOn ? (Object.hasOwn(FINISH_SURFACE, hf) && FINISH_SURFACE[hf]) || SURFACES.paint : SURFACES.metal,
      haloOn ? SURFACES.paint : SURFACES.metal, mf && (mf === "gloss" || Object.hasOwn(FINISH_SURFACE, mf)) ? SURFACES.paint : SURFACES.carbon,
      CarWheels.tints(liv).surf || SURFACES.metal];
    for (let i = 0; i < M.length; i++) if (M[i] >= PH_HALO && M[i] <= PH_RIM) M[i] = map[M[i] - PH_HALO];
    applyZones(out, f.zoneRanges, f.sections, liv, f.dim);
    applyFinish(out, liv.finish, f.sections, liv, f.zoneRanges);
    if (f.smooth) CarShade.smooth(out, { skip: [SURFACES.emissive], keep: f.keep });
  }
  function refinish(base, liv) {
    Log.info("car", "refinish");
    const f = base._refinish, out = Object.assign({}, base, { mat: f.mat.slice(), col: f.col.slice(), nrm: f.nrm.slice() });
    if (out.flapInfo) out.flapInfo = Object.assign({}, out.flapInfo, { finish: finishOf(liv, "wingFinish") });
    finishPass(out, liv, f);
    if (typeof CarGeometry !== "undefined") { out.pos = base.pos.slice(); out.idx = base.idx.slice(); CarGeometry.weld(out); }
    return out;
  }
  const seatable = (o) => !(o.measure || o.refinish || o.noWeld || o.cockpit || o.noDriver || o.silhouette || o.shadeKeep);
  function reseat(out, opts, lid) {
    const f = out._refinish, liv = opts.livery || {}, tc = {};
    delete out._refinish;
    const sec = f.sections.find((x) => x.name === "helmet");
    const tcam = (num) => tcamColour(liv.tcam, opts.teamId, num, tc);
    for (const num of opts.seats.keys()) {
      if (!sec || num === opts.num || tcam(num) !== tcam(opts.num)) continue;
      const h = lid(num), a = sec.from, n = h.pos.length;
      let same = a + n / 3 <= sec.to && h.mat.length === n / 3 && sec.ifrom + h.idx.length <= out.idx.length;
      for (let i = 0; same && i < n; i++) same = h.pos[i] === out.pos[a * 3 + i] && h.nrm[i] === f.nrm[a * 3 + i];
      for (let i = 0; same && i < n / 3; i++) same = h.mat[i] === f.mat[a + i];
      for (let i = 0; same && i < h.idx.length; i++) same = h.idx[i] + a === out.idx[sec.ifrom + i];
      if (!same) continue;
      const col = f.col.slice();
      for (let i = 0; i < n; i++) col[a * 3 + i] = h.col[i];
      const seat = Object.assign({}, out, { pos: out.pos.slice(), idx: out.idx.slice(), mat: f.mat.slice(), col, nrm: f.nrm.slice() });
      if (seat.flapInfo) seat.flapInfo = Object.assign({}, seat.flapInfo);
      finishPass(seat, liv, f);
      opts.seats.set(num, CarGeometry.weld(seat));
    }
    return CarGeometry.weld(out);
  }

  const SHADE = (typeof CarMaterialShade !== "undefined") ? CarMaterialShade : null;

  return {
    SURFACES, FINISH_SURFACE, FINISH_RESERVED, SHADE, finishOf,
    DARK, CARBON, VISOR, PANEL, TYRE, RIM, HUB, INTAKE, HALO, EXHAUST,
    TYRE_BAND, BRAKE_CALIPER,
    TCAM_IDS, tcamColour,
    smoothSkin, applyBodySplit, applyFinish, zoneColour,
    PH_HALO, PH_HOOP, PH_MIRROR, PH_RIM, FINISH_FIELDS, finishPass, refinish, seatable, reseat,
  };
})();
Object.freeze(CarMaterials);
