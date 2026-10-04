"use strict";
/**
 * Desktop permission policy: the web permissions the game actually uses,
 * granted to OUR origin (app://apex/) and nobody else; everything else denied.
 *
 * Before this, main.js answered every request with callback(false), so in the
 * desktop app the pause menu's FULLSCREEN row rejected (F11 only worked because
 * main.js handles the key), Keyboard Lock never engaged, the race / lobby wake
 * locks were refused (a pad-only race could hit the OS screensaver), QR SCAN
 * said the camera was refused with no way to allow it, and COPY CODE survived
 * only on the execCommand fallback.
 *
 * Permission names and handler shapes (Electron session API):
 *   https://www.electronjs.org/docs/latest/api/session
 *     setPermissionRequestHandler(handler(webContents, permission, callback, details))
 *     setPermissionCheckHandler(handler(webContents | null, permission, requestingOrigin, details))
 *   https://www.electronjs.org/docs/latest/api/structures/media-access-permission-request
 *     details.mediaTypes: ("video" | "audio")[]
 *
 * Pure Node (no electron require) so tests/unit/desktop-native.test.mjs can
 * drive both handlers directly.
 */

// Every name the game asks for, and where:
//   fullscreen               — pause-menu FULLSCREEN (js/ui/platform-session.js, phone-pad.js)
//   keyboardLock             — Input.lockEscape() (navigator.keyboard.lock, js/input/input.js)
//   pointerLock              — no caller today; listed so a mouse-look camera is not a silent deny
//   screen-wake-lock         — RaceWakeLock, lobby + phone-pad wake locks
//   media                    — QR SCAN camera (js/net/scan.js); VIDEO ONLY
//   clipboard-sanitized-write — COPY CODE / share fallbacks (js/core/clipboard.js)
const ALLOWED = Object.freeze([
  "fullscreen",
  "keyboardLock",
  "pointerLock",
  "screen-wake-lock",
  "media",
  "clipboard-sanitized-write",
]);

function isAppOrigin(url, origin) {
  if (typeof url !== "string" || !url) return false;
  return url === origin || url === origin + "/" || url.startsWith(origin + "/");
}

// The camera, never the microphone: the QR scanner is the only media user.
function mediaOk(details, check) {
  if (!details) return false;
  if (check) return details.mediaType === "video";
  const types = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
  return types.length > 0 && types.every((t) => t === "video");
}

function allowed(permission, url, origin, details, check) {
  if (ALLOWED.indexOf(permission) < 0) return false;
  if (!isAppOrigin(url, origin)) return false;
  // A cross-origin subframe embedded in our page is not us.
  if (details && details.embeddingOrigin && !isAppOrigin(details.embeddingOrigin, origin)) return false;
  if (permission === "media") return mediaOk(details, check);
  return true;
}

/** handler for session.setPermissionRequestHandler — the requesting frame's URL decides. */
function requestHandler(origin) {
  return (webContents, permission, callback, details) => {
    let url = details && details.requestingUrl;
    if (!url && webContents && typeof webContents.getURL === "function") {
      try { url = webContents.getURL(); } catch (_) { url = ""; }
    }
    callback(allowed(permission, url, origin, details, false));
  };
}

/** handler for session.setPermissionCheckHandler — webContents may be null. */
function checkHandler(origin) {
  return (_webContents, permission, requestingOrigin, details) =>
    allowed(permission, requestingOrigin || (details && details.requestingUrl) || "", origin, details, true);
}

module.exports = { ALLOWED, allowed, isAppOrigin, requestHandler, checkHandler };
