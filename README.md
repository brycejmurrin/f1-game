# F1 repair handoff

This repository preserves the local repair sources, package archives, startup instructions and validation evidence. It contains no credentials, profiles or dependency caches. Paths below f1-toolchain/ map to /workspace/f1-toolchain/. Review and apply files individually; do not overwrite newer work.

The original game checkout is /workspace/f1-game on branch work. Its sole pre-existing modification, tools/check/doctor.mjs, is preserved as evidence/sdk-existing-work.patch and was not replaced. PR #3889 already merged the SDK server-subpath resolution fix (merge c6d5c62f4cbb083dfc443dd5aece1dc25be4203f). Do not create a duplicate fix.

Implemented: retained gateway accepts optional bounded hostToolNames for apex_tools__apex_doctor via doctor-catalog.mjs. Without that input it preserves the upstream route and its missing-catalog warning. Supplied names are caller evidence, not proof of execution. The gateway uses /workspace/f1-game. Cloud MCP 1.0.5 and Dev Tools 0.2.5 are installed locally.

Verified: 239 doctor passes, zero warnings/failures through a real local MCP client with this session's supplied catalog; 6 runtime tests, 6 environment tests, 1 health test, 5 package-builder tests, 2 lifecycle tests and 24 package tests passed. One supervised tunnel, readyz 200, successful control-plane polling, 145 local tools and a passing status call. These are local results, not hosted attachment.

Remaining: discover actual Plugin Management/Creator and hosted F1 tools; import account packages using supported capabilities, verify hosted status and doctor with a fresh host catalog, save startup instructions and publish the prepared environment through its supported workflow. Last save returned draft_not_editable; read again before retrying. Account publication and hosted execution remain unverified.

The toolchain was not a Git repository. This handoff repository is a local preservation commit only and has no configured remote. The next agent must identify the intended repository, commit the durable runtime/plugin sources and tests there, push a review branch and open a draft PR under that repository's rules. Preserve all unrelated work and never include credentials, tunnel profiles or private runtime state.
