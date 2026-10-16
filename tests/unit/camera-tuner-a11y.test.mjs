/* Camera tuner accessibility contract.
 * The scope chips are toggle buttons: the selected scope is already shown by
 * the `.on` class, and must remain exposed to screen readers after switching.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(ROOT, "js/camera/tuner-panel.js"), "utf8");

test("camera tuner scope buttons expose the active scope as aria-pressed", () => {
  assert.match(source, /b\.setAttribute\("aria-pressed", id === _scope \? "true" : "false"\)/,
    "new scope buttons must expose the initial selection");
  assert.match(source, /sm\.mode\.setAttribute\("aria-pressed", on \? "true" : "false"\)/,
    "THIS CAM must stay synchronized after a scope switch");
  assert.match(source, /sm\.global\.setAttribute\("aria-pressed", on \? "true" : "false"\)/,
    "ALL CAMS must stay synchronized after a scope switch");
});
