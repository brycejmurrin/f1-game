# Canonical plugin packages

Run `python3 tools/environment/build-plugins.py`, then the same command with
`--check`. Sources live in `tools/environment/plugin-sources`; output defaults
to `/workspace/f1-toolchain/plugin-dist` outside Git. Hidden manifests and app
bindings are checked and archives are deterministic. Cloud MCP 1.0.6 and Dev
Tools 0.3.0 preserve their existing identities and author metadata. These are
hosted-first packages with optional executor configuration below executor/;
root local stdio auto-discovery is rejected.

Run `python3 tools/environment/test-plugin-build.py` for reconstruction,
manifest identity, archive integrity and negative-path regressions. Local
Codex registration uses `f1-env plugin-install`. Account imports require an
exposed supported management capability. Neither build nor local registration
establishes account publication or hosted execution.
