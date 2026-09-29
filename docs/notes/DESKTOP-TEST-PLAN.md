# Desktop (Electron) test plan

Spike verification for the installable shell in `desktop/`. The game itself stays
a static IIFE site (no bundler); packaging stages via `tools/desktop/stage.mjs`.

Research basis (2026-09-29): Playwright `_electron`, electron-builder `--dir`,
fuses, signing verify, auto-update (B1–B7); spike-support research B —
Electron **44.4.5** (Chromium 152), manual `app://` Range/206 handler, SW skip,
autoplay default, WebGPU soft-adapter, Steam deferred. Upstream links below.

**CI proves "boots and renders something", not GPU performance.** Hosted runners
have no real GPU ([GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).

## Automated (every PR — `desktop.yml` pack-smoke job)

**Non-draft PRs only** (draft→ready gets a fresh run). Matrix on PR: **ubuntu-latest**
alone (1 job). Windows / macOS pack-smoke run on `workflow_dispatch` (and full
installers on `desktop-v*` tags via `release-build`).

1. `npm ci` in `desktop/` (Node ≥ 22.12 recommended; electron-builder v27 requires it).
2. `npm run pack:test` → `electron-builder --dir` with
   `enableNodeCliInspectArguments=true` (release `pack`/`dist` keep inspect **off**
   and `grantFileProtocolExtraPrivileges` **false**).
3. Soft-GL env: `APEX_DESKTOP_SOFT_GL=1` + `APEX_DESKTOP_NO_SANDBOX=1` (explicit;
   never implied by `CI=true` alone — packaged releases must keep the Chromium
   sandbox). Soft-GL appends ANGLE SwiftShader + `enable-unsafe-webgpu`.
4. Playwright `_electron` against the unpacked binary
   (`desktop/tests/electron-packaged.spec.mjs`):
   - window opens; `app.isPackaged === true`
   - title / `app.getVersion()` matches `0.<version.json build>.0`
   - `#game` canvas present; ≥ 30 rAF frames advance
   - no serious `pageerror`
   - fullscreen toggle via `electronApp.evaluate` (macOS: simpleFullScreen)
   - clean `electronApp.close()`
   - offline reload still serves `app://apex/` (assets in `extraResources`)
5. `npx @electron/fuses read --app <path>` — assert
   `EnableNodeCliInspectArguments is Enabled` on the **test** pack only.

Unit coverage (no Electron binary): `tests/unit/desktop-app-protocol.test.mjs`
(MIME, Range parse, traversal), `desktop-native.test.mjs` (SW skip / Spotify /
main wiring), stage + unpacked-bin helpers.

The root web Playwright suite continues to cover game behaviour; Electron adds
only shell-specific tests.

### Fuses (build under test)

Release defaults in `desktop/package.json` → `build.electronFuses`:
`enableNodeCliInspectArguments: false`, `grantFileProtocolExtraPrivileges: false`.
CI / local `_electron` uses `npm run pack:test`, which flips inspect **on** for
Playwright attach ([Playwright Electron docs](https://playwright.dev/docs/api/class-electron)).
Flip inspect off again before any signed production build.

## Tags / manual dispatch — signed verification (secrets optional)

On `desktop-v*` tags and `workflow_dispatch` only (never ship-branch push):

- Full installers (`npm run dist:*`) remain unsigned unless secrets exist.
- macOS (when `CSC_LINK` / Apple notarize secrets present):
  - `codesign -vvv --deep --strict App.app`
  - `spctl --assess --type execute --verbose App.app`
  - `xcrun stapler validate App.app`
- Windows (when Authenticode / Azure signing secrets present):
  - `signtool verify /pa /v app.exe`
- If secrets are absent, those steps print a skip notice and succeed (fork PRs
  and unsigned spikes must stay green).

## Auto-update — test plan (not automated end-to-end yet)

Source: [electron-builder auto-update](https://www.electron.build/docs/features/auto-update).

**Dev without packaging:** add `desktop/dev-app-update.yml` matching a future
`publish` block and set `autoUpdater.forceDevUpdateConfig = true` in main
(behind a flag). Prefer testing on an *installed* build, especially Windows.

**Recommended local feed:** MinIO or a plain static HTTP server hosting
`latest*.yml` + artifacts.

**Event sequence to assert (mock server + unsigned `--dir` / installed build):**

1. Install vN (`0.<build>.0`).
2. Publish vN+1 artifacts + `latest-*.yml`.
3. Expect: `checking-for-update` → `update-available` → `download-progress` →
   `update-downloaded`.
4. Also: no-update, bad `sha512`, network error, `stagingPercentage`, downgrade.
5. Set `autoUpdater.logger` (e.g. electron-log).

**macOS:** Squirrel.Mac / autoUpdater requires a signed app. Unsigned CI can only
cover metadata/event mocks.

**Manual dispatch job:** `desktop.yml` `auto-update-plan` step prints this
checklist; a future job can spin MinIO + two `--dir` builds.

## Steam — deferred (do not enable in this spike)

`steamworks.js` 0.4.0 is unmaintained for our packaging needs (no arm64 Win/Linux,
overlay flaky on Linux/macOS, Steam Input gamepad regressions — electron#45732).
Keep Steam out of `desktop/package.json` and the builder config until a
maintained binding and depot layout exist. See `desktop/README.md` § Steam.

## Manual per-OS checklist (B7)

Run on a clean machine/VM after a tag build (Windows, macOS Intel + Apple Silicon
if shipped, Ubuntu):

- [ ] Install from the real installer / DMG / AppImage; note Gatekeeper /
      SmartScreen on first launch (quarantined download).
- [ ] Hardware GPU: WebGL2 works; if WebGPU is opted in (`enable-unsafe-webgpu`
      where needed), confirm adapter identity in-app (`chrome://gpu` / `__apex`
      gfx hooks). Target frame rate, fullscreen, multi-monitor, HiDPI, gamepad /
      wheel. Soft-GL CI must not claim GPU performance.
- [ ] Audio seeks work (Range 206 on `app://` media). Window state restore; no
      crash on quit. Uninstall cleanly.
- [ ] Update from N−1 → N over a real feed; relaunch; settings / career saves
      persist under the stable `app://apex/` origin (localStorage / IndexedDB).
- [ ] Spotify remains degraded (OAuth redirect is `app://…`); built-in music works.
- [ ] Service worker stays unregistered (`__APEX_NATIVE__.desktop`); do not
      re-enable SW until Cache API supports the `app` scheme.

## Local commands

```sh
cd desktop
npm ci
npm run pack:test
# Linux:
APEX_DESKTOP_SOFT_GL=1 APEX_DESKTOP_NO_SANDBOX=1 xvfb-run -a npm run test:electron
# macOS / Windows (display available):
set APEX_DESKTOP_SOFT_GL=1
set APEX_DESKTOP_NO_SANDBOX=1
npm run test:electron
npm run fuses:read
```

## Refs

- https://playwright.dev/docs/api/class-electron
- https://www.electronjs.org/docs/latest/tutorial/automated-testing
- https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci
- https://www.electron.build/docs/cli/
- https://www.electron.build/docs/features/auto-update
- https://www.electron.build/docs/tutorials/adding-electron-fuses
- https://www.electronjs.org/docs/latest/tutorial/code-signing
- https://github.com/electron/electron/issues/38749 (Range / protocol.handle)
- https://github.com/electron/electron/issues/45732 (Steam Input)
