"use strict";
/**
 * electron-builder 26 config (not 27 alpha — native ESM / Node >=22.12).
 *
 * Site lives in extraResources `site` (outside asar) so app:// Range streams
 * work. App code is asar. Unsigned, no publish / update channel (README).
 *
 * Docs (2026-09-29):
 *   https://www.electron.build/docs/
 *   https://www.electron.build/docs/nsis/
 *   https://www.electron.build/electron-builder.interface.platformspecificbuildoptions
 */
const identity = require("./lib/identity.cjs");
const { extraResourcesSiteFrom } = require("./lib/site.cjs");

const DESKTOP = __dirname;
const CAMERA =
  "Apex 26 uses the camera only to scan a multiplayer join QR code.";

const config = {
  appId: identity.appId,
  productName: identity.productName,
  copyright: "Copyright © Apex 26 contributors",
  directories: {
    output: "dist",
    buildResources: "build",
  },
  files: [
    "main.js",
    "app-protocol.js",
    "preload.js",
    "lib/**",
    "package.json",
  ],
  extraResources: [
    {
      from: extraResourcesSiteFrom(DESKTOP),
      to: "site",
      filter: ["**/*"],
    },
    {
      from: "build/THIRD-PARTY-NOTICES.txt",
      to: "THIRD-PARTY-NOTICES.txt",
    },
  ],
  asar: true,
  compression: "normal",
  electronLanguages: ["en-US"],
  // Fuses (Electron 44 docs/tutorial/fuses.md). None needs a certificate to be
  // flipped; WITHOUT code signing nothing stops someone who can write the
  // install dir from flipping them back (desktop/README.md §What is protected).
  // embeddedAsarIntegrityValidation: macOS + Windows only (Linux ignores it);
  // electron-builder embeds the asar header hash (Info.plist / an exe resource)
  // even with signAndEditExecutable: false. With onlyLoadAppFromAsar it stops
  // loading app code that does not match that hash.
  // loadBrowserProcessSpecificV8Snapshot stays default: no custom snapshot.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.png",
    signAndEditExecutable: false,
    artifactName: "Apex26-Setup-${version}-${arch}.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Never wipe %APPDATA%/Apex 26 — career / garage / music live there.
    deleteAppDataOnUninstall: false,
  },
  mac: {
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    category: "public.app-category.games",
    icon: "build/icon.png",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    identity: null,
    extendInfo: {
      NSCameraUsageDescription: CAMERA,
    },
    artifactName: "Apex26-${version}-${arch}.${ext}",
  },
  linux: {
    target: ["AppImage", "deb"],
    category: "Game",
    icon: "build/icons",
    synopsis: "Unofficial fan racing game — desktop shell for Apex 26.",
    description:
      "Wraps the static site GitHub Pages publishes (three.js, WebGPU first, WebGL2 fallback). No second gameplay codebase.",
    // Public GitHub noreply already used on ship-branch commits (not invented).
    maintainer: "Apex 26 contributors <37964036+brycejmurrin@users.noreply.github.com>",
    artifactName: "Apex26-${version}-${arch}.${ext}",
  },
  publish: null,
};

if (process.env.APEX_APP_VERSION) {
  config.extraMetadata = { version: process.env.APEX_APP_VERSION };
}

module.exports = config;
