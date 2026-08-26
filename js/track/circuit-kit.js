/* Apex 26 — reusable, atomically staged circuit infrastructure.
   Pure IIFE global; complete facilities emit only through TrackModels. */
const CircuitKit = (function () {
  "use strict";

  const DEFAULT_SIZE = {
    pitBuilding: [18, 10, 72],
    hospitality: [16, 9, 36],
    raceControl: [12, 24, 14],
    cameraCrane: [6, 16, 6],
    marshalShelter: [6, 3, 5],
    recoveryBay: [12, 5, 18],
    serviceCompound: [24, 6, 36],
    trackSigns: [3, 3, 48],
  };
  const BUDGET_KIND = {
    pitBuilding: "facility",
    hospitality: "facility",
    raceControl: "hero",
    cameraCrane: "repeated",
    marshalShelter: "repeated",
    recoveryBay: "repeated",
    serviceCompound: "facility",
    trackSigns: "repeated",
  };

  function finiteVector(value, length) {
    return Array.isArray(value) && value.length === length &&
      value.every(Number.isFinite);
  }

  function validSize(value) {
    return finiteVector(value, 3) && value.every((part) => part > 0);
  }

  function validIdAndFraction(spec) {
    return !!spec && typeof spec === "object" &&
      typeof spec.id === "string" && spec.id.trim().length > 0 &&
      Number.isFinite(spec.frac) && spec.frac >= 0 && spec.frac <= 1;
  }

  function boundedCount(value, fallback, maximum) {
    if (value === undefined) return fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const rounded = Math.round(numeric);
    return rounded > 0 && rounded <= maximum ? rounded : 0;
  }

  function validFrame(frame) {
    return !!frame && finiteVector(frame.c, 3) &&
      finiteVector(frame.r, 3) && finiteVector(frame.u, 3) &&
      finiteVector(frame.t, 3) && Number.isFinite(frame.hw) && frame.hw >= 0;
  }

  function addScaled(base, a, aScale, b, bScale) {
    return [
      base[0] + a[0] * aScale + b[0] * bScale,
      base[1] + a[1] * aScale + b[1] * bScale,
      base[2] + a[2] * aScale + b[2] * bScale,
    ];
  }

  function create(dependencies) {
    Log.info("track", "circuit-kit create");
    const deps = dependencies || {};
    const models = deps.models || {};
    const landmarks = deps.landmarks || {};
    const theme = deps.theme || {};
    const palette = theme.palette || {};
    const budgets = theme.budgets || {};

    function color(name, fallback) {
      const value = palette[name] || palette[fallback];
      return finiteVector(value, 3) ? value : null;
    }

    function placement(spec, method) {
      if (!validIdAndFraction(spec) ||
          (spec.side !== -1 && spec.side !== 1) ||
          !Number.isFinite(spec.gap) || spec.gap < 0) return null;
      const size = spec.size === undefined ? DEFAULT_SIZE[method] : spec.size;
      if (!validSize(size) || typeof deps.frameAt !== "function" ||
          typeof deps.groundHeight !== "function") return null;
      let frame;
      let ground;
      try {
        frame = deps.frameAt(spec.frac);
        if (!validFrame(frame)) return null;
        // groundHeight takes a NODE INDEX — a frame without one cannot fall
        // back to the raw lap fraction (that rounds to node 0/1: the start
        // line's ground, anywhere on the lap).
        if (frame.k === undefined) return null;
        ground = deps.groundHeight(frame.k, spec.gap + size[0] / 2);
      } catch (_error) {
        return null;
      }
      if (!Number.isFinite(ground)) return null;
      const lateral = spec.side * (frame.hw + spec.gap + size[0] / 2);
      const base = [frame.c[0], ground, frame.c[2]];
      const center = addScaled(base, frame.r, lateral, frame.u, size[1] / 2);
      if (!finiteVector(center, 3)) return null;
      return {
        frame,
        size: size.slice(),
        center,
        bounds: {
          center,
          size: size.slice(),
          basis: [frame.r.slice(), frame.u.slice(), frame.t.slice()],
        },
      };
    }

    function call(callback, args) {
      if (typeof callback !== "function") return false;
      try {
        return callback(...args) !== false;
      } catch (_error) {
        return false;
      }
    }

    function localCenter(place, x, y, z) {
      return addScaled(
        addScaled(place.center, place.frame.r, x, place.frame.u, y),
        place.frame.t, z, place.frame.u, 0,
      );
    }

    function box(stage, place, offset, size, shade) {
      const tint = color(shade, "shell");
      return !!tint && call(models.box, [
        stage,
        localCenter(place, offset[0], offset[1], offset[2]),
        size,
        tint,
        place.bounds.basis,
      ]);
    }

    function landmark(method, stage, place, spec) {
      const tint = color(spec.colorName || "shell", "shell");
      if (!tint) return false;
      return call(landmarks[method], [stage, {
        ...spec,
        center: localCenter(place, spec.offset[0], spec.offset[1], spec.offset[2]),
        color: tint,
        basis: place.bounds.basis,
        offset: undefined,
        colorName: undefined,
      }]);
    }

    function route(method, spec, emit) {
      const place = placement(spec, method);
      const budgetKind = BUDGET_KIND[method];
      const maximum = budgets[budgetKind];
      if (!place || typeof models.modelGroup !== "function" ||
          !Number.isFinite(maximum) || maximum < 0) return false;
      try {
        return models.modelGroup(
          spec.id,
          place.bounds,
          (stage) => emit(stage, place),
          {
            required: !!spec.required,
            maxVertices: maximum,
            kind: method,
          },
        ) === true;
      } catch (_error) {
        return false;
      }
    }

    function pitBuilding(spec) {
      const garages = boundedCount(spec && spec.garages, 12, 24);
      if (!garages) return false;
      return route("pitBuilding", spec, (stage, place) => {
        const bay = place.size[2] / garages;
        for (let i = 0; i < garages; i++) {
          const z = -place.size[2] / 2 + bay * (i + 0.5);
          if (!box(stage, place, [0, -place.size[1] * 0.08, z],
            [place.size[0], place.size[1] * 0.84, bay * 0.9], "shell")) return false;
        }
        return landmark("roof", stage, place, {
          offset: [0, place.size[1] * 0.46, 0],
          size: [place.size[0] * 1.08, place.size[1] * 0.08, place.size[2]],
          kind: spec.style || "flat",
          colorName: "roof",
        });
      });
    }

    function hospitality(spec) {
      const modules = boundedCount(spec && spec.modules, 4, 12);
      if (!modules) return false;
      return route("hospitality", spec, (stage, place) => {
        const moduleDepth = place.size[2] / modules;
        for (let i = 0; i < modules; i++) {
          const z = -place.size[2] / 2 + moduleDepth * (i + 0.5);
          if (!box(stage, place, [0, -place.size[1] * 0.08, z],
            [place.size[0], place.size[1] * 0.84, moduleDepth * 0.86],
            i % 2 ? "service" : "shell")) return false;
        }
        return landmark("canopy", stage, place, {
          offset: [0, place.size[1] * 0.38, 0],
          size: [place.size[0] * 1.05, place.size[1] * 0.24, place.size[2]],
          colorName: "roof",
        });
      });
    }

    function raceControl(spec) {
      return route("raceControl", spec, (stage, place) =>
        landmark("tower", stage, place, {
          offset: [0, 0, 0],
          size: place.size,
          levels: spec.levels || 6,
          kind: spec.style || "lattice",
          colorName: "shell",
        }));
    }

    function cameraCrane(spec) {
      return route("cameraCrane", spec, (stage, place) => {
        if (!box(stage, place, [0, 0, 0],
          [place.size[0] * 0.16, place.size[1], place.size[2] * 0.16],
          "service")) return false;
        return box(stage, place,
          [0, place.size[1] * 0.42, place.size[2] * 0.32],
          [place.size[0] * 0.2, place.size[1] * 0.08, place.size[2] * 0.8],
          "accent");
      });
    }

    function marshalShelter(spec) {
      return route("marshalShelter", spec, (stage, place) => {
        if (!box(stage, place, [0, -place.size[1] * 0.08, 0],
          [place.size[0], place.size[1] * 0.84, place.size[2]], "shell")) return false;
        return landmark("roof", stage, place, {
          offset: [0, place.size[1] * 0.46, 0],
          size: [place.size[0] * 1.12, place.size[1] * 0.08, place.size[2] * 1.12],
          kind: spec.style || "flat",
          colorName: "roof",
        });
      });
    }

    function recoveryBay(spec) {
      return route("recoveryBay", spec, (stage, place) => {
        if (!box(stage, place, [0, -place.size[1] * 0.35, 0],
          [place.size[0], place.size[1] * 0.3, place.size[2]], "service")) return false;
        return landmark("canopy", stage, place, {
          offset: [0, place.size[1] * 0.05, 0],
          size: [place.size[0], place.size[1] * 0.9, place.size[2]],
          colorName: "roof",
        });
      });
    }

    function serviceCompound(spec) {
      const vehicles = boundedCount(spec && spec.vehicles, 6, 16);
      if (!vehicles) return false;
      return route("serviceCompound", spec, (stage, place) => {
        const columns = 4;
        const rows = Math.ceil(vehicles / columns);
        const cellX = place.size[0] / columns;
        const cellZ = place.size[2] / rows;
        for (let i = 0; i < vehicles; i++) {
          const column = i % columns;
          const row = Math.floor(i / columns);
          const x = -place.size[0] / 2 + cellX * (column + 0.5);
          const z = -place.size[2] / 2 + cellZ * (row + 0.5);
          if (!box(stage, place, [x, -place.size[1] * 0.28, z],
            [cellX * 0.7, place.size[1] * 0.44, cellZ * 0.62],
            i % 2 ? "service" : "accent")) return false;
        }
        return true;
      });
    }

    function trackSigns(spec) {
      const signs = boundedCount(spec && spec.count, 8, 64);
      if (!signs) return false;
      return route("trackSigns", spec, (stage, place) => {
        const spacing = place.size[2] / signs;
        for (let i = 0; i < signs; i++) {
          const z = -place.size[2] / 2 + spacing * (i + 0.5);
          if (!box(stage, place, [0, 0, z],
            [place.size[0], place.size[1], Math.min(0.35, spacing * 0.4)],
            i % 2 ? "shell" : "accent")) return false;
        }
        return true;
      });
    }

    function pedestrianBridge(spec) {
      if (!validIdAndFraction(spec) || typeof models.overheadSpan !== "function")
        return false;
      const clearance = spec.clearance === undefined ? 5.5 : spec.clearance;
      const span = spec.span;
      const thickness = spec.thickness === undefined ? 0.9 : spec.thickness;
      const depth = spec.depth === undefined ? 2 : spec.depth;
      if (!Number.isFinite(clearance) || clearance < 4.8 ||
          (span !== undefined && (!Number.isFinite(span) || span <= 0)) ||
          !Number.isFinite(thickness) || thickness <= 0 ||
          !Number.isFinite(depth) || depth <= 0) return false;
      const shell = color("shell", "shell");
      if (!shell) return false;
      const bridge = {
        id: spec.id,
        frac: spec.frac,
        clearance,
        minimumClearance: 4.8,
        span,
        thickness,
        depth,
        color: shell,
        required: !!spec.required,
      };
      if (span === undefined) delete bridge.span;
      return call(models.overheadSpan, [bridge]);
    }

    return {
      pitBuilding,
      hospitality,
      raceControl,
      pedestrianBridge,
      cameraCrane,
      marshalShelter,
      recoveryBay,
      serviceCompound,
      trackSigns,
    };
  }

  return { create };
})();
