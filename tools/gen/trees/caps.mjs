/**
 * LOD triangle caps for AX26 v3 tree bakes (Slice F / #1619).
 * @doc Frozen LOD0/LOD1 triangle caps from the 2026-10-19 tree-budget measurement
 *   (docs/notes/TREE-BUDGET-2026-10-19.md). bake-trees.mjs fails closed on these.
 * @skill scenery-dress
 *
 * LOD0 ≤ measured post-strip mean of the procedural species it replaces;
 * LOD1 ≤ half of LOD0 (integer floor).
 */
export const SWAY_FRAC = 0.45; // must match TrackGeom.SWAY_FRAC

/** @type {Record<string, { lod0: number, lod1: number, meanTris: number }>} */
export const LOD_CAPS = {
  pine: { lod0: 45, lod1: 22, meanTris: 44.73 },
  tree: { lod0: 51, lod1: 25, meanTris: 51 },
  palm: { lod0: 156, lod1: 78, meanTris: 156 },
};

export const SPECIES = Object.freeze(["pine", "tree", "palm"]);
