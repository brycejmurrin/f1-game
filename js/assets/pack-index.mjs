/**
 * Pack-index hygiene helper (Node / unit tests): classifies pack keys via
 * data/packs/model-index.json against a live manifest.
 *
 * The remembered `apex26.packIndex` is pruned by the SHIPPED rememberPack in
 * js/render/shared/assets.js (it rebuilds the index from each live manifest);
 * its test drives that function through the assets VM. A copy of the prune
 * here could not fail when assets.js changed, so there is none (#5654 F7).
 */

/**
 * Diff a role index against a live manifest.
 * @param {{ models?: Record<string, { role?: string }> }} roleIndex
 * @param {{ models?: Record<string, unknown> }} live
 * @param {string[]} [roles]
 */
export function diffRoleIndex(roleIndex, live, roles = ["placed", "kit_catalog", "nature_bake"]) {
  const roleSet = new Set(roles);
  const idxModels = (roleIndex && roleIndex.models) || {};
  const liveModels = (live && live.models) || {};
  const indexIds = Object.keys(idxModels);
  const liveIds = Object.keys(liveModels);
  const indexOnly = indexIds.filter((id) => !Object.prototype.hasOwnProperty.call(liveModels, id));
  const liveOnly = liveIds.filter((id) => !Object.prototype.hasOwnProperty.call(idxModels, id));
  const badRole = [];
  for (const id of indexIds) {
    const role = idxModels[id] && idxModels[id].role;
    if (!roleSet.has(role)) badRole.push(`${id}:${role}`);
  }
  return { indexOnly, liveOnly, badRole };
}
