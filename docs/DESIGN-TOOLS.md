# Free design and environment tooling

These tools extend the existing Apex workflow. They use local software and the
existing private tunnel; they do not buy credits, create plugins, or call an AI
API. Environment compute and any existing hosting plan remain separate costs.

## Set up and diagnose the environment

Install the locked development dependencies with `npm ci --include=dev` and use
`bash tools/env/install-browsers.sh` for the supported Chromium installation.
FFmpeg and Inkscape are optional system packages; the setup tool reports
missing packages rather than silently installing them. The cloud image does not
ship Blender: `bash tools/env/install-blender.sh` installs the pinned 4.2.23 LTS
(the version the crew exporters were authored with) after checking the official
SHA-256 list. Headless Workbench/EEVEE renders also need Mesa's EGL
(`apt-get install -y libegl1 libgl1 libegl-mesa0`); Cycles renders without it.

```sh
node tools/env/chat-mcp-service.mjs doctor
node tools/mcp/check-chat-contract.mjs
```

The first command reports dependency/browser readiness and optional binaries.
Credential presence does not establish authorization. The second initializes a
disposable full-gateway client, checks its schemas, upstream namespaces and
browser-release route, then calls the read-only status tool. It starts no browser.

To compare against chat, save the actual currently exposed F1 tool names as a
JSON array and pass that file to `check-chat-contract.mjs`. A configuration file
is not a host snapshot. A passing local contract is not a passing native chat call.

For an existing private tunnel profile, derive a new full-catalog profile:

```sh
node tools/env/configure-chat-mcp.mjs --source /absolute/existing.yaml --out /absolute/new-gateway.yaml --npm-cache /absolute/npm-cache
node tools/env/chat-mcp-service.mjs start --profile /absolute/new-gateway.yaml --tunnel-client /absolute/tunnel-client
node tools/env/chat-mcp-service.mjs status
# After a gateway update, restart the owned supervisor with the same profile/binary:
node tools/env/chat-mcp-service.mjs restart --profile /absolute/new-gateway.yaml --tunnel-client /absolute/tunnel-client
```

The profile generator preserves the tunnel identity and credential references,
refuses literal API tokens and output overwrites, optionally preserves a shared npm cache path, and points to this checkout's
`tools/mcp/chat-gateway.mjs`. It does not edit the original profile or app.
Stop the old runtime using its existing lifecycle owner before starting a
replacement for the same tunnel. Never run competing runtimes for one tunnel.

The service supervisor atomically owns its local startup, records Linux process
identity, and restarts an exited tunnel at most five times with bounded backoff.
Its state is under `artifacts/run/chat-mcp/`; status reports process state, not
remote usability. After startup, verify tunnel readiness using the tunnel CLI
and call status from the actual chat before claiming recovery.

For subsequent environment installation/startup, configure the non-secret paths
`APEX_CHAT_MCP_PROFILE` and `APEX_TUNNEL_CLIENT_BIN` through the environment's
supported settings. `cloud-agent-install.sh` starts the service only when the
profile variable is set. Build snapshots do not preserve running processes;
the platform must execute its startup hook after boot. Managed environment
configuration remains a separate reviewed operation.

The gateway retains namespaced upstream schemas and serialized calls. Browser
modes cannot switch within a session until closed or explicitly released.
Detach the JS debugger before releasing the page. Browser ownership across
independent clients still follows the repository's occupancy and shared-lock rules.
BrowserStack is optional and is not provisioned by the free setup.

## UI inspection, accessibility and tokens

Use the existing CSS loop with optional evidence flags:

```sh
node tools/ui/css-play.mjs --screen settings --viewport 844x390 --tokens --axe --out artifacts/design-settings
node tools/ui/review-captures.mjs artifacts/design-settings/review.json
```

`--tokens` records custom properties, selected computed typography/layout values,
visible control measurements, viewport and reduced-motion state in JSON and HTML.
The report captures actual current state; it does not invent hover/disabled states.
`--axe` injects the locked local axe-core package into the same page and writes
violations, incomplete checks, passing rules and engine version. Incomplete checks
require review. Zero violations is not WCAG compliance. Continue the existing
keyboard, screen-reader, touch, focus and scrolling checks in `ui-menu-a11y`.

The review manifest includes source commit and capture environment. Add more
entries to its `shots` array with `file`, `label`, `metadata`, and optional
`before` image. Image paths are relative to the manifest and must remain within
that directory, including after symlink resolution. The bounded HTML embeds
local raster images, supports full-size viewing and a keyboard-operable
before/after slider, and needs no web service or CDN. Output belongs under
`artifacts/` or `scratch/`. Never include credentials or player saves in metadata.

## Reuse the interactive car viewer

The existing `apex_viewer` MCP tool and `tools/viewer/build-viewer.mjs` workflow
generate an HTML viewer from the game's real car and circuit geometry. Discover
the current tool schema before choosing teams or circuits. Prefer that to a
replacement car mesh. A viewer artifact does not prove a new garage runtime.

## Zero-spend room adapter

`tools/assets/procedural-room.py` is a project-specific procedural adapter,
not a claim that the separate Meshy-oriented plugin supports zero-credit jobs.
Its example uses authored primitive geometry for an engineering draft and
reserves a footprint for the existing game car.

```sh
python3 tools/assets/procedural-room.py validate tools/assets/procedural-room.example.json --out artifacts/unused
blender --background --factory-startup --python tools/assets/procedural-room.py -- plan tools/assets/procedural-room.example.json --out artifacts/room-plan
```

`plan` creates draft Blender geometry, applied Boolean arrival openings,
evaluated mesh projections for lower-room/reflected-ceiling SVGs and provenance.
Game coordinates are +Y up in metres; Blender coordinates are +Z up, with the
mapping recorded in source. The initial adapter supports south-wall door
openings; unsupported kinds fail rather than becoming decorative false openings.
Draft primitives are explicitly unfinished assets.

`compose` requires an explicit Function review with status, approver and timestamp.
`export` additionally requires Form approval before writing GLB. Record approvals
only after actual human review. Neither a rendered draft nor a successful
validator grants approval. Runtime fit, textures, lighting, collision, performance,
support, clearances and Runtime approval still gate publication. Existing Build
3D Game Rooms doctrine and review requirements continue to apply; this adapter
does not certify those checks automatically.

## Garage arrival and drive-out previz

The garage in / out shows are analytic poses in `js/garage/arrival.js`
(`GarageArrival.pose` / `poseOut`); the crews are Blender-authored key tables
(`tools/gen/blender/crew-choreo.py` → `js/garage/crew-choreo.js`). To see or
redesign the car path and camera in Blender:

```sh
node tools/garage/arrival-poses.mjs --angle cut --out artifacts/garage-previz/poses.json
blender -b --factory-startup --python tools/gen/blender/garage-previz.py -- \
    --poses artifacts/garage-previz/poses.json --output-dir artifacts/garage-previz --render --step 2
```

The first samples the real JS in a Node VM (no port of the maths); the second
builds `garage-previz.blend` (scenes `garage-in` / `garage-out`: the
`TrackPit.BAY` room, shutter, car proxy with a red nose, camera keyed from
eye / aim / vertical fov, captions as timeline markers) and, with `--render`,
844x390 Workbench MP4s and contact sheets (~100 s for both clips at step 2).
Edit there, then port the change into `arrival.js`; the parked-pose and
sampler contracts are `tests/unit/garage-arrival.test.mjs`.

## Validate and optimize glTF

```sh
node tools/assets/gltf-check.mjs artifacts/room-export/room.glb --out artifacts/room-export/validation.json
node tools/assets/gltf-check.mjs artifacts/room-export/room.glb --out artifacts/room-export/optimization.json --optimize artifacts/room-export/optimized.glb
```

Khronos validation includes external local resources through a path-contained
callback. Remote URLs, traversal and escaped symlinks fail. Configurable total
byte, triangle and texture-dimension budgets are reported with hashes and the
validator's errors/warnings. Unsupported extension evidence is retained.
Optimization writes a separate file, runs only deduplication/pruning and validates
again. Required extensions without registered codecs fail explicitly. There is no
automatic Draco/KTX compression or unsupported runtime assumption.

## Route and verify

Use `mcp-probe` for attachment/readiness, `css-play` for layout/token evidence,
`ui-menu-a11y` for axe plus manual interaction checks, and `asset-pack` for asset
validation/procedural-room tooling. `playwright-probe` owns viewer/camera capture;
`check-changes` owns the test ladder. Reuse the existing reviewer, verifier and
worker agents; the parent remains the only browser owner. Sites publication is
its own workflow, after the relevant review gates.

Contract regression checks are in `tests/unit/free-design-tools.test.mjs`, included
in `agent-contract` and `tooling-fast`. They are not browser or GPU evidence.

## Upstream references

- [axe-core API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md), MPL-2.0.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), MIT.
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator), Apache-2.0.
- [glTF Transform SDK](https://gltf-transform.dev/concepts) and [functions](https://gltf-transform.dev/functions), MIT.
- [Blender mesh API](https://docs.blender.org/api/current/bpy.types.Mesh.html),
  [Boolean modifier](https://docs.blender.org/api/current/bpy.types.BooleanModifier.html),
  [glTF exporter](https://docs.blender.org/api/current/bpy.ops.export_scene.html).

Dependencies are pinned in package-lock.json. Installed Blender 4.3.2 was checked
for Exact Boolean support and the glTF operator; online Blender documentation was
partly unavailable during implementation, so the installed API is authoritative.
