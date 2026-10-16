/* qr-camera.js — a QR code, as a fake webcam.
 *
 * Chromium can play a video file in place of a camera
 * (--use-file-for-fake-video-capture), which is what lets the scan path be
 * tested with a real getUserMedia, a real video element, a real canvas readback
 * and the real decoder. Only the photons are fake.
 *
 * Y4M is used because it is the one video format that needs no encoder: a text
 * header, then raw planar frames. Producing an MP4 here would mean shipping
 * ffmpeg to prove that a QR code decodes.
 *
 * Two cameras, not one, and they live in separate spec files because Chromium
 * takes the file as a LAUNCH ARGUMENT:
 *
 *   withCode: true   the code is always in frame, so a scan always resolves.
 *                    Use for "does it decode".
 *   withCode: false  nothing is ever in frame, so a scan NEVER resolves.
 *                    Use for anything that has to happen mid-scan — cancelling,
 *                    closing the lobby. Against a camera that decodes instantly
 *                    those tests pass for the wrong reason: the scanner has
 *                    already released the camera by itself and the teardown
 *                    being asserted was never exercised. A camera showing
 *                    nothing makes "mid-scan" a stable state instead of a race.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Walk up for package.json rather than counting ".." — this file is scheduled
// to move (tests/ split, AUDIT-SYNTHESIS §R2), and a hop count that is wrong at
// the new depth still resolves to a real directory, so the failure arrives as
// "js/net/qr.js not found" from somewhere unrelated. See tests/helpers/output-paths.js
// for the same anchor and the fuller reasoning.
function repoRoot(from) {
  let dir = from;
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error(`no package.json above ${from} — cannot locate the repo root`);
    dir = up;
  }
}

const ROOT = repoRoot(path.dirname(fileURLToPath(import.meta.url)));

// A real invite code, at the length the compact codec actually produces.
export const CODE = "APEX1.s." + "aB3-_x9Zq".repeat(26).slice(0, 232);

export function buildY4m(withCode) {
  const NetQr = eval(fs.readFileSync(path.join(ROOT, "js/net/qr.js"), "utf8") + ";NetQr");
  const W = 640, H = 480, FRAMES = 8;
  const luma = Buffer.alloc(W * H, 255);                  // a white page

  if (withCode) {
    const qr = NetQr.encode(CODE);
    if (!qr) throw new Error("the fixture code did not encode");
    const q = NetQr.QUIET;
    const scale = Math.floor((Math.min(W, H) * 0.9) / (qr.size + q * 2));
    const side = (qr.size + q * 2) * scale;
    const ox = (W - side) >> 1, oy = (H - side) >> 1;
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (!qr.modules[y * qr.size + x]) continue;
        const px = ox + (x + q) * scale, py = oy + (y + q) * scale;
        for (let dy = 0; dy < scale; dy++) {
          luma.fill(0, (py + dy) * W + px, (py + dy) * W + px + scale);
        }
      }
    }
  }

  const chroma = Buffer.alloc((W >> 1) * (H >> 1), 128);  // neutral: greyscale
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420\n`)];
  for (let i = 0; i < FRAMES; i++) parts.push(Buffer.from("FRAME\n"), luma, chroma, chroma);

  const file = path.join(os.tmpdir(), `apex-scan-${withCode ? "code" : "blank"}.y4m`);
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

// Extend the config's own launch options, never replace them: overriding
// launchOptions wholesale drops the resolved executablePath and Playwright then
// hunts for a bundled headless shell this box does not have.
export function cameraLaunch(baseLaunch, y4m) {
  const base = baseLaunch || {};
  return {
    ...base,
    args: [
      ...(base.args || []),
      "--use-fake-ui-for-media-stream",        // auto-grant the camera
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${y4m}`,
    ],
  };
}
