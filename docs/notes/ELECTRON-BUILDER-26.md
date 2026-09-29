# electron-builder 26 packaging notes (2026-09-29)

Task 25 / desktop packaging. Training-data memory of flags is not evidence;
these URLs were fetched this session.

- electron-builder overview + v26 vs v27 warning (do **not** use 27 alpha):
  https://www.electron.build/docs/
- NSIS options including `deleteAppDataOnUninstall` (one-click installer only
  in the docs; we still set it false with `oneClick: false`):
  https://www.electron.build/docs/nsis/
- Platform `extraResources` / `asar` (site outside asar, app code in asar):
  https://www.electron.build/electron-builder.interface.platformspecificbuildoptions
- Playwright `_electron` (existing spike smoke, not re-litigated here):
  https://playwright.dev/docs/api/class-electron
- Electron Range/`net.fetch` gap the protocol handler works around:
  https://github.com/electron/electron/issues/38749

Pinned in-tree: `electron-builder@26.15.3` (already in the PR #422 spike;
`^26`, not 27). Electron runtime stays **44.4.5**.
