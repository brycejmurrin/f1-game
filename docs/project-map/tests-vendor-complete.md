# Test-only vendor map — full read closure

Both tracked files under tests/vendor are completely read and mapped. The guide was read in full by parent and both fresh Sol readers. The263643-byte minified IWER bundle was read in33 individually returned untruncated byte chunks across two reports: tests-vendor-01 covers[0,160000), tests-vendor-02 covers[160000,263643). The half-open union covers every byte without a gap. Whole-source, part and chunk hashes are separate in the two evidence JSON files; static class/method inventories aid navigation and do not substitute for raw reading.

IWER2.5.0 is a test-only UMD WebXR emulation runtime with core poses/spaces/input/session/frame objects, device/controller/hand profiles, actions/remote control/recording, layers/native override integration and XRDevice installation. First-part core/layers contracts and second-part layers/profile/device teardown/export details are mapped in their reports. The guide attributes MIT IWER and embedded Apache-2.0 components and names the npm build source. No dependency upgrade, license rewrite or upstream network verification occurred.

Playwright specs inject this file before the app and install a forced runtime with stereo enabled. tests/helpers/iwer-install.mjs adapts a pinned offset-reference-space defect by forwarding transform.matrix at the internal boundary. xr-phase0 unit coverage checks finite transforms and offset signs; XR browser specs test emulated flows. The adapter belongs only to emulation fixtures; production XR remains a separate hardware/session contract. Complete text reading and static AST inspection do not establish device support, rendered stereo correctness or a real headset result. No bundle evaluation, tests, browser or network was performed.

The pinned-version upgrade checklist in the guide requires recopying/renaming the bundle, updating the helper and path canary and reconsidering the offset adapter. That conditional removal instruction is supported; no safe immediate deletion was established.

| Source | Bytes | SHA-256 |
|---|---|---|
| tests/vendor/README.md | 2061 | 2c9172a0942ddf0b21da9ba59841e14b82ae346d60c9ff1a46c7e67bb5e3916d |
| tests/vendor/iwer-2.5.0.min.js | 263643 | 23d8640949f19db4b1e70398b30e084e4aa555f3a81e4329da3fac1a70b39542 |
