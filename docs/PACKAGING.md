# Apex 26 — packaging (desktop)

Native wrappers around the **same staged site** GitHub Pages publishes.
There is no second gameplay codebase and no build step for the game itself.

This file is filled in per packaging task. Task 10's shared stage scripts
already live in `tools/desktop/`. The Electron spike (PR #422) shipped
`desktop/main.js`, `app-protocol.js`, `preload.js`, `tools/desktop/stage.mjs`,
and `.github/workflows/desktop.yml`. This document records **packaging + icons**
on top of that spike.

## Desktop (electron-builder 26)

**Do not change `appId` (`io.github.brycejmurrin.apex26`) or `productName`
(`Apex 26`).** Those identifiers plus the `app://apex/` origin are frozen:
changing them orphans localStorage / IndexedDB / `userData` (career, garage,
music). Single source: `desktop/lib/identity.cjs`.

### Version

- `desktop/package.json` field `apexVersion` is MAJOR.MINOR (`1.0`).
- PATCH is the stamped `version.json` `build` → app version `1.0.<build>`.
- `node desktop/scripts/set-version.mjs` writes `package.json` `version` before pack.
- To bump MAJOR.MINOR, edit `apexVersion` only.

The merged spike used `0.<build>.0`; this packaging pass switched to the
plan's `1.0.<build>` form. `pack:test` / Playwright `_electron` still work;
they now assert `1.0.${build}`.

### Commands (from `desktop/`)

```sh
npm install
npm run stage          # tools/desktop/stage.mjs → desktop/dist-site --stamp
npm run icons          # regenerate from icons/icon-512.png (committed already)
npm run set-version    # 1.0.<build>
npm run pack           # electron-builder --dir (unpacked, this host)
npm run dist:linux     # AppImage + .deb
npm run dist:win       # NSIS .exe x64 (CI / Windows host)
npm run dist:mac       # .dmg + .zip arm64+x64 (macOS host)
```

`npm run pack:test` is the CI smoke pack: same as `pack` but with
`EnableNodeCliInspectArguments` on so Playwright `_electron` can attach.

Override the staged tree with `APEX_SITE_DIR=/abs/path` (must contain
`version.json`). Default is `desktop/dist-site`.

Artifacts land in `desktop/dist/` (gitignored). **Unsigned.** Uninstall does
**not** delete app data (`nsis.deleteAppDataOnUninstall: false`).

### Artifact names

| OS | File |
|---|---|
| Windows NSIS | `Apex26-Setup-<version>-x64.exe` |
| macOS | `Apex26-<version>-<arch>.dmg` and `.zip` |
| Linux | `Apex26-<version>-<arch>.AppImage` and `.deb` |

Installer size is measured in the desktop CI workflow (task 30 / existing
`desktop.yml` release-build). Record numbers here when a tag/dispatch run
produces them — **not measured on cloud VMs**.

### Icons

Repo art is 512×512 (`icons/icon-512.png`). There is **no 1024 master**.
`desktop/scripts/make-icons.mjs` upscales to `desktop/build/icon-1024-PLACEHOLDER.png`
with a visible banner. Human: supply a 1024+ PNG/SVG master later.

### Notices

`desktop/scripts/notices.mjs` concatenates in-tree CREDITS/LICENSE files into
`desktop/build/THIRD-PARTY-NOTICES.txt` (generated, gitignored). Root
`package.json` is `UNLICENSED` — the game's own licence text is a human
decision and is not invented here.

### Out of scope here

Signing, notarization, auto-update, GitHub Releases, tags, secrets, store
listings. No new workflow in this pass (`desktop.yml` already exists from the
spike).

## Task 25 notes

Adapted from plan 25 because task 20's `desktop/lib/identity.cjs` was **not**
in the merged spike: identity was inlined in `desktop/package.json` `build`.
This pass extracted `lib/identity.cjs` and moved the builder block to
`desktop/electron-builder.config.cjs` so `pack:test` CLI fuse overrides still
work.
