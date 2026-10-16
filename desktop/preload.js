"use strict";
/**
 * Preload — expose a tiny native-detect flag to the game. No Node APIs leak
 * into the page (contextIsolation + sandbox); the game only reads this object.
 *
 * window.__APEX_NATIVE__.desktop === true  → skip service-worker registration,
 * degrade Spotify OAuth (redirect URI is app://…), gate other origin-sensitive
 * features.
 */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("__APEX_NATIVE__", Object.freeze({
  desktop: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }),
}));
