# F1 plugin and environment consolidation

The source baseline is deploy `77b4d989b` plus preservation commit
`d68c1b57699f4c78cae839f380bdd6d833713a08`, fetched from
`cursor/f1-plugin-environment-repair-d68c`. That branch is an independent
preservation tree, not game history; its handoff files were inspected and applied
individually. The original local-only handoff checkout was absent from this
restored instance. The complete retained toolchain supplied dependencies missing
from the preservation tree: package builders, both complete plugin packages,
activation, installation, health discovery, lifecycle fixtures and tests.

The game checkout already includes PR #3889's SDK fix, merge
`c6d5c62f4cbb083dfc443dd5aece1dc25be4203f`. The original dirty doctor change was
saved in a stash and compared byte-for-byte to the newer checkout. No duplicate
SDK fix is included. Existing main-repo gateway, lifecycle manager, MCP contract
checker and SDK 1.32.2 lockfile were reused. Canonical environment/package sources
now live under `tools/environment/`; old toolchain source entrypoints resolve by
compatibility links, with previous files preserved outside Git. See
[the environment contract](../../tools/environment/ENVIRONMENT.md).

Fresh host tool discovery in this session exposed neither F1 apex_status/
apex_doctor nor Plugin Creator/Management/import tools. These capabilities cannot
be inferred from plugin tags, skills or local registration. No account update or
hosted success is claimed. The Codex CLI supports local marketplace registration;
a disposable external CODEX_HOME verified installation of Cloud MCP 1.0.6 and
Dev Tools 0.3.0 from canonical sources. The active host config is read-only and
its CLI list returned no installed local packages in this restored task. The
isolated installation does not change active account/session tools.

Current-instance evidence: two startups reused supervisor PID 2398 and tunnel
PID 2412; native readiness returned HTTP 200 and successful control-plane polling.
The real stdio MCP contract exposed 145 tools and executed apex_status. A fresh
20-name host catalog supplied through the real local MCP doctor route produced
239 passes, zero warnings/failures. Those names contained no hosted F1 routes.
Doctor's supplied-catalog result is session evidence, not hosted execution proof.
The direct doctor protocol probe requires the documented environment activation
for the prepared npm cache and optional-clone policy; probes without activation
closed during catalog initialization. Activation made the probe pass.

Environment configuration saved successfully as draft
`03e7fe60-b914-4ac1-9fe9-ffb9168da3a0~cecfgdraft_a98b065b997481a1977c416247a2a688`,
with requires_publish true. Install/start instructions reference canonical repo
sources and preserve all credential bindings. Draft saving is not publication.
No fresh published instance has been restored or tested. Review/save and publish
in environment settings, then verify resume twice and actual hosted status/doctor
using the new session's exposed catalog.

References consulted:
https://developers.openai.com/plugins/build/mcp-server
https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle
https://docs.npmjs.com/cli/v11/commands/npm-ci/

The connected Dev Tools skills were newer than the retained 0.2.5 source tree.
The canonical package incorporates the connected main skills, readiness receipts,
Codex workflows, profiling/workflow references, browser helper and comparison
helper. Environment references were adapted to the canonical checkout. The
saved startup text had named 0.2.9, but no corresponding retained manifest was
available; the consolidated Dev Tools release is 0.3.0 to avoid a downgrade.

Clean-source restoration validation reconstructed both plugin ZIPs byte-for-byte
from an archive of the staged Git source tree, without retained uploads or
plugin output. The archive's main package-lock restored 170 dependencies via
npm ci; npm ls was valid and all 13 gateway/asset contract tests passed there.
This is source/dependency restoration evidence, not a fresh provider instance.
Environment verification also passed seven environment regressions, one native
health regression, two initialization-shim protocol tests, five package-builder
regressions and 24 package tests. Static GLSL compiled all 33 variants; naga WGSL
and static TLX checks remain explicit skips. No rendered/gameplay change is
claimed. Browser smoke helper was consolidated but not run for this repair.

The final saved install script invokes only the canonical environment installer,
which builds and verifies packages. Local Codex registration is optional and
requires a supported writable configured home. The restored active configuration
is read-only, so mandatory registration would have made image setup fail. This
does not change the configured home, account state or credential bindings.
