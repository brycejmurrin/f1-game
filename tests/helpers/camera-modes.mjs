// The shipped CAM_MODES ids, in index order (apex26.camMode is an index into
// this list), read from js/camera/mode-switch.js so a test stub cannot drift
// from the indices the game really produces.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const text = fs.readFileSync(path.join(ROOT, "js/camera/mode-switch.js"), "utf8");
const block = text.slice(text.indexOf("const CAM_MODES = ["), text.indexOf("];", text.indexOf("const CAM_MODES = [")));

export const CAM_MODE_IDS = Object.freeze([...block.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]));
export const camModeStubs = () => CAM_MODE_IDS.map((id) => ({ id }));
