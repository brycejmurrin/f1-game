/**
 * Pack-index hygiene helpers (Node / unit tests).
 *
 * Adjacent to — not overlapping — the GPU-ready load path in
 * js/render/shared/assets.js (#4028): that PR remembers `apex26.packIndex` and
 * starts model fetches beside the manifest. This module only *prunes* a
 * remembered index against a live manifest and classifies pack keys via
 * data/packs/model-index.json. It is ESM so load-order does not require a
 * tools/manifest.cjs entry (that file is out of this lane's ownership).
 */

/** @typedef {{ file?: string, md5?: string }} PackModelHint */
/** @typedef {{ models?: Record<string, PackModelHint> }} PackIndex */

const MD5_RE = /^[0-9a-f]{32}$/;

/**
 * Drop dead or stale keys from a remembered pack index.
 * Keeps only models whose file + md5 still match the live manifest.
 * Unknown top-level fields on the remembered object are discarded.
 *
 * @param {PackIndex | null | undefined} remembered
 * @param {{ models?: Record<string, PackModelHint> } | null | undefined} live
 * @returns {PackIndex}
 */
export function pruneRememberedIndex(remembered, live) {
  const out = { models: {} };
  const liveModels = live && live.models && typeof live.models === "object" ? live.models : null;
  const rememberedModels =
    remembered && remembered.models && typeof remembered.models === "object"
      ? remembered.models
      : null;
  if (!liveModels || !rememberedModels) return out;
  for (const id of Object.keys(rememberedModels)) {
    const hint = rememberedModels[id];
    const rec = liveModels[id];
    if (!hint || !rec) continue;
    if (typeof hint.file !== "string" || typeof rec.file !== "string") continue;
    if (hint.file !== rec.file) continue;
    if (!MD5_RE.test(hint.md5 || "") || hint.md5 !== rec.md5) continue;
    out.models[id] = { file: hint.file, md5: hint.md5 };
  }
  return out;
}

/**
 * Build a { file, md5 } remember-payload from a live manifest (same shape
 * #4028 stores). Skips records that lack a content-addressed md5.
 *
 * @param {{ models?: Record<string, PackModelHint> } | null | undefined} live
 * @returns {PackIndex}
 */
export function rememberPayload(live) {
  const models = {};
  if (!live || !live.models || typeof live.models !== "object") return { models };
  for (const id of Object.keys(live.models)) {
    const rec = live.models[id];
    if (!rec || typeof rec.file !== "string" || !MD5_RE.test(rec.md5 || "")) continue;
    models[id] = { file: rec.file, md5: rec.md5 };
  }
  return { models };
}

/**
 * Diff a role index against a live manifest.
 * @param {{ models?: Record<string, { role?: string }> }} roleIndex
 * @param {{ models?: Record<string, unknown> }} live
 * @param {string[]} [roles]
 */
export function diffRoleIndex(roleIndex, live, roles = ["placed", "kit_catalog", "nature_bake"]) {
  const roleSet = new Set(roles);
  const indexIds = Object.keys((roleIndex && roleIndex.models) || {});
  const liveIds = Object.keys((live && live.models) || {});
  const indexOnly = indexIds.filter((id) => !Object.prototype.hasOwnProperty.call(live.models || {}, id));
  const liveOnly = liveIds.filter((id) => !Object.prototype.hasOwnProperty.call(roleIndex.models || {}, id));
  const badRole = [];
  for (const id of indexIds) {
    const role = roleIndex.models[id] && roleIndex.models[id].role;
    if (!roleSet.has(role)) badRole.push(`${id}:${role}`);
  }
  return { indexOnly, liveOnly, badRole };
}
