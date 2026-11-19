
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
