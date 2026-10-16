# desktop/build — packaging resources

Provenance:

- `icon.png` and `icons/*.png` are generated from repo `icons/icon-512.png` by
  `node desktop/scripts/make-icons.mjs` (sharp, lanczos).
- `icon-1024-PLACEHOLDER.png` is a **soft upscale** of the 512 master with a
  visible PLACEHOLDER banner. There is no 1024/SVG master in the tree; replace
  this before store listings (human step).
- `entitlements.mac.plist` is authored (hardened runtime + camera for QR scan).
  Entitlements only take effect when signing (later task).
- `THIRD-PARTY-NOTICES.txt` is **generated** by `desktop/scripts/notices.mjs`
  during prebuild and is gitignored.

Regenerate icons:

```
cd desktop && node scripts/make-icons.mjs
```
