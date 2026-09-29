// @doc Shared allow-list of runtime files/dirs staged for Pages and Electron packaging.
// @skill check-changes
/**
 * stage-files.mjs — ONE allow-list for the deployable site folder.
 *
 * pages.yml used to inline `cp` / `cp -r` commands. An allow-list edited only
 * there went stale once (`vendor/` missing → dynamic imports 404'd on the live
 * site). Both Pages and the Electron packager now consume this list via
 * `tools/desktop/stage.mjs`, and `tests/unit/deploy-staging.test.mjs` asserts
 * the shipped code's fetches are covered by it.
 *
 * A root `.html` page is NOT swept by a directory copy — name it here or it
 * 404s on the live site with a green build (bench.html on build 7377).
 */
export const STAGE_ROOT_FILES = Object.freeze([
  "index.html",
  "bench.html",
  "controller.html",
  "version.json",
  "manifest.json",
  "sw.js",
  ".nojekyll",
]);

export const STAGE_DIRS = Object.freeze([
  "js",
  "css",
  "icons",
  "assets",
  "vendor",
]);

/** Every top-level name the stage writes (files + directories). */
export function stagedNames() {
  return new Set([...STAGE_ROOT_FILES, ...STAGE_DIRS]);
}
