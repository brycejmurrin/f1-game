/* Apex 26 — bounded architectural forms for staged scenery geometry.
   Pure IIFE global; all geometry remains in the caller-owned stage. */
const LandmarkKit = (function () {
  "use strict";

  function finiteVector(value, length) {
    return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
  }

  function validStage(stage) {
    return stage !== null && typeof stage === "object";
  }

  function validSpec(spec) {
    return !!spec && typeof spec === "object" &&
      finiteVector(spec.center, 3) && finiteVector(spec.size, 3) &&
      spec.size.every((value) => value > 0);
  }

  function boundedCount(value, fallback, maximum) {
    if (value === undefined) return fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const count = Math.round(numeric);
    return count > 0 && count <= maximum ? count : 0;
  }

  function create(primitives) {
    Log.info("track", "landmark-kit create");
    const p = primitives || {};

    function emit(callback, args) {
      return typeof callback === "function" && callback(...args) !== false;
    }

    function ready(stage, spec) {
      return validStage(stage) && validSpec(spec);
    }

    function roof(stage, spec) {
      if (!ready(stage, spec)) return false;
      const callback = spec.kind === "sawtooth" ? p.prism : p.box;
      return emit(callback, [stage, spec.center, spec.size, spec.color, spec.basis]);
    }

    function facade(stage, spec) {
      if (!ready(stage, spec)) return false;
      const bays = boundedCount(spec.bays, 6, 24);
      if (!bays) return false;
      for (let i = 0; i < bays; i++) {
        const offset = (i + 0.5) / bays - 0.5;
        const center = [
          spec.center[0],
          spec.center[1],
          spec.center[2] + offset * spec.size[2],
        ];
        const size = [spec.size[0], spec.size[1], spec.size[2] / bays * 0.82];
        if (!emit(p.box, [stage, center, size, spec.color, spec.basis])) return false;
      }
      return true;
    }

    // `kind` was accepted and then ignored — circuit-kit.js passed
    // `kind: spec.style` but only `spec.levels` was ever read, so every
    // raceControl in the game was the same stack of shrinking boxes and
    // style:"tapered" was a silent no-op. The kinds below are real.
    function tower(stage, spec) {
      if (!ready(stage, spec)) return false;
      const levels = boundedCount(spec.levels, 4, 12);
      if (!levels) return false;
      const kind = spec.kind || "lattice";
      if (kind === "tapered" && p.frustum) {
        // One tapered shaft plus a proud cap slab — a modern control tower.
        const half = spec.size[1] / 2;
        return emit(p.frustum, [stage,
          [spec.center[0], spec.center[1] - half, spec.center[2]],
          spec.size[0] * 0.5, spec.size[0] * 0.28, spec.size[1] * 0.88,
          spec.color, 8, spec.basis]) &&
          emit(p.box, [stage,
            [spec.center[0], spec.center[1] + half * 0.80, spec.center[2]],
            [spec.size[0] * 0.86, spec.size[1] * 0.08, spec.size[2] * 0.86],
            spec.color, spec.basis]);
      }
      if (kind === "drum" && p.cylinder) {
        const half = spec.size[1] / 2;
        return emit(p.cylinder, [stage,
          [spec.center[0], spec.center[1] - half, spec.center[2]],
          spec.size[0] * 0.46, spec.size[1] * 0.86, spec.color, 10, spec.basis]) &&
          emit(p.box, [stage,
            [spec.center[0], spec.center[1] + half * 0.74, spec.center[2]],
            [spec.size[0] * 1.05, spec.size[1] * 0.10, spec.size[2] * 1.05],
            spec.color, spec.basis]);
      }
      for (let i = 0; i < levels; i++) {
        const scale = kind === "stepped"
          ? (i % 2 ? 0.78 : 1.0)
          : 1 - i / levels * 0.35;
        const center = [
          spec.center[0],
          spec.center[1] - spec.size[1] / 2 + (i + 0.5) * spec.size[1] / levels,
          spec.center[2],
        ];
        const size = [
          spec.size[0] * scale,
          spec.size[1] / levels * 0.86,
          spec.size[2] * scale,
        ];
        if (!emit(p.box, [stage, center, size, spec.color, spec.basis])) return false;
      }
      return true;
    }

    function stadiumSection(stage, spec) {
      if (!ready(stage, spec)) return false;
      const rows = boundedCount(spec.rows, 8, 16);
      if (!rows) return false;
      for (let i = 0; i < rows; i++) {
        const offset = (i + 0.5) / rows;
        const center = [
          spec.center[0],
          spec.center[1] - spec.size[1] / 2 + offset * spec.size[1],
          spec.center[2] - spec.size[2] / 2 + offset * spec.size[2],
        ];
        const size = [spec.size[0], spec.size[1] / rows * 0.7, spec.size[2] / rows];
        if (!emit(p.box, [stage, center, size, spec.color, spec.basis])) return false;
      }
      return true;
    }

    function arch(stage, spec) {
      if (!ready(stage, spec)) return false;
      if (spec.postWidth !== undefined &&
          (!Number.isFinite(spec.postWidth) || spec.postWidth <= 0)) return false;
      const post = Math.min(
        spec.size[0] * 0.2,
        spec.size[1] * 0.5,
        spec.postWidth === undefined ? 1.2 : spec.postWidth,
      );
      const postHeight = spec.size[1] - post;
      const centers = [
        [spec.center[0] - (spec.size[0] - post) / 2,
          spec.center[1] - post / 2, spec.center[2]],
        [spec.center[0] + (spec.size[0] - post) / 2,
          spec.center[1] - post / 2, spec.center[2]],
        [spec.center[0],
          spec.center[1] + (spec.size[1] - post) / 2, spec.center[2]],
      ];
      const sizes = [
        [post, postHeight, spec.size[2]],
        [post, postHeight, spec.size[2]],
        [spec.size[0], post, spec.size[2]],
      ];
      for (let i = 0; i < centers.length; i++) {
        if (!emit(p.box, [
          stage, centers[i], sizes[i], spec.color, spec.basis,
        ])) return false;
      }
      return true;
    }

    function canopy(stage, spec) {
      if (!ready(stage, spec)) return false;
      const mastHeight = spec.size[1] * 0.8;
      const mastCenter = [
        spec.center[0],
        spec.center[1] - spec.size[1] / 2,
        spec.center[2],
      ];
      const radius = Math.min(spec.size[0], spec.size[2]) * 0.06;
      if (!emit(p.cylinder, [
        stage, mastCenter, radius, mastHeight,
        spec.mastColor || spec.color, 8, spec.basis,
      ])) return false;
      const ridge = spec.size[1] * 0.30;
      return emit(p.prism, [
        stage,
        [spec.center[0], spec.center[1] + spec.size[1] * 0.30, spec.center[2]],
        [spec.size[0], ridge, spec.size[2]],
        spec.color,
        spec.basis,
      ]) && emit(p.box, [
        stage,
        [spec.center[0], spec.center[1] + spec.size[1] * 0.28, spec.center[2]],
        [spec.size[0] * 1.02, spec.size[1] * 0.06, spec.size[2]],
        spec.color,
        spec.basis,
      ]);
    }

    return { roof, facade, tower, stadiumSection, arch, canopy };
  }

  return { create };
})();
