# Shell, presentation, and native packaging map

## Goal

Fresh, bounded source map of `index.html`, `css/`, `desktop/`, `mobile/`, and `worker/`. This is navigation evidence, not a runtime audit. No browser, build, deployment, or source modification was performed.

## Source identity

- Checkout: `/workspace/f1-game`, requested branch `cursor/project-map-a84f`.
- Source HEAD observed: `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb` (2026-10-27 UTC).
- Root `AGENTS.md` read fully. It identifies the static HTML as the DOM owner and `tools/manifest.cjs` as load-order authority; generated shell blocks must be regenerated from sources.
- Initial worktree status was clean. Reports may be added concurrently by other mapping lanes.

## Inventory

`index.html` has 3,970 lines. The 34 CSS files total 20,472 lines (24,442 including HTML). Desktop includes Electron entry/protocol/preload, four library modules, builder config, scripts, packaged tests, and icons. Mobile includes Capacitor config and sync scripts plus an Android Gradle project and image resources. Worker has exactly `README.md`, `rendezvous.js`, and `wrangler.toml`.

## Architecture and data flow

The static shell declares CSP, viewport policy, font/style preloads, all static screen/HUD/dialog markup, and the deferred ordered IIFE script roster. `js/game.js` is the final generated script. Generated ranges include CSP (5–7), preload (84–91), CSS (111–147), title art (2219–2245), and scripts (3654–3969). Canvas `#game` starts at line 508, HUD at 656, title overlay at 2168. The loading status remains a nonmodal div at 2721; menus commonly use actual `<dialog>` elements with `hidden` and `data-esc-close` contracts. Data Hub and Track Designer are shell hosts whose detailed contents are built at runtime. This report does not inspect their JS controllers.

CSS starts with the layer order `reset, base, components, hud, overlays` in `tokens.css:13`. Tokens also carry base geometry, fonts, and theme infrastructure. Component files dress specific screens; HUD and visor files style racing surfaces; overlay files provide loading, editor, touch and Data Hub surfaces. `menu-destinations.css` introduces an additional `responsive` layer. Since it is outside the initial layer declaration, its precedence deserves attention when tracing cross-file collisions. `tools/manifest.cjs:486–514` owns CSS, preload, and deferred lists. Title sheets block rendering while other links use print-to-all loading. This is an intentional load/cascade contract, not independent CSS imports.

Desktop scripts stage the shared static site into `dist-site` before launching Electron; packaged resources put it under `resources/site`. `main.js` registers privileged `app://apex/`, loads that origin in a sandboxed/context-isolated BrowserWindow with Node integration disabled, restricts navigation, and opens HTTP(S) popups externally. Permission helpers allow a finite list only for the app origin (camera permission is video-only). `preload.js` exposes frozen `__APEX_NATIVE__` metadata. The protocol provides MIME mapping, containment checks, byte ranges and streaming. Native identity must remain stable to retain origin-bound saves. Main also handles single-instance focus, F11, user-directed renderer recovery, and an optional bounded smoke mode. Native service-worker/OAuth suppression is a documented downstream consumer contract; its game-side implementation was not read here.

Mobile `sync-web.mjs` reuses the desktop staging implementation, accepts only stamped input by default, reuses a prior stage only for clean/current HEAD, and copies to `www` before `cap sync android`. `--out` requires a new isolated destination and `--skip-sync`. Capacitor uses HTTPS Android origin, `webDir=www`, mixed content/debugging disabled, minimum WebView 100. `MainActivity` keeps the screen awake and uses edge-to-edge content with transient system bars. Native downloads and inset behavior require game-side adapters beyond this scope.

Optional Cloudflare worker routes only `/v3/r/<64 hex id>/(offer|answer)`, rejecting legacy `/r/` with 426. It checks methods, rate limits per isolate/IP, resolves one Durable Object by room id, then forwards the slot. The Room stores sealed v2 payloads with a two-minute per-slot TTL; offer retries require the same owner capability. Transactions coordinate writes and alarms; reads independently enforce expiry. Limits bound request bodies, payload size and in-memory rate buckets. `wrangler.toml` binds SQLite-backed `Room` via migration `v1`. It transports rendezvous data, not the WebRTC gameplay stream.

## File-by-file coverage

“Partial” means selected lines, headers, or structural searches only; it never means full semantic review. Some initial batched output was truncated, so those files are conservatively classified partial even where a full-file command was issued.

| File | Coverage and responsibility |
|---|---|
| `index.html` | Partial: lines 1–110, tail, generated markers, dialog/canvas/HUD searches; bulk forms/inline boot code unread. |
| `worker/rendezvous.js` | Fully read: relay, validation, rate limiter, Room persistence/alarm and public router. |
| `worker/wrangler.toml` | Fully read: binding/migration/deploy identity. |
| `worker/README.md` | Partial: initial batch truncated; deployment guide. |
| `desktop/README.md` | Fully read: packaging and origin contract. |
| `desktop/package.json` | Fully read: pinned dependencies and packaging commands. |
| `desktop/main.js` | Fully read: Electron lifecycle, policy and smoke path. |
| `desktop/preload.js` | Fully read: native metadata bridge. |
| `desktop/app-protocol.js` | Partial: header, scheme privileges, function/response searches; containment/range internals not fully reviewed. |
| `desktop/lib/identity.cjs` | Fully read: stable package/origin identity. |
| `desktop/lib/permissions.cjs` | Fully read: origin/media-sensitive permission handlers. |
| `desktop/lib/site.cjs`, `desktop/lib/version.cjs` | Unread beyond inventory (initial batch truncation); shared staging/version helpers. |
| `desktop/electron-builder.config.cjs` | Unread beyond inventory (initial batch truncation); builder policy. |
| `mobile/scripts/sync-web.mjs` | Fully read: staging, validation, safe copying, Capacitor sync CLI. |
| `mobile/capacitor.config.json` | Fully read: application/WebView/SystemBars policy. |
| `mobile/android/app/src/main/java/io/github/brycejmurrin/apex26/MainActivity.java` | Fully read: keep-awake and system-bar lifecycle setup. |
| `mobile/README.md` | Partial: targeted native/orientation/download search. |
| `mobile/android/app/src/main/AndroidManifest.xml` | Partial: configuration-change/orientation references. |
| `mobile/package.json`, `mobile/lib/identity.json` | Unread beyond inventory (initial batch truncation). |
| `css/a11y-loading.css` | Fully read; Loading hint contrast. |
| `css/appearance-studio.css` | Partial: header and/or comment/structure searches; Appearance settings studio. |
| `css/career-experience.css` | Partial: header and/or comment/structure searches; Career/result storytelling. |
| `css/career.css` | Partial: header and/or comment/structure searches; Career setup and hub. |
| `css/carsetup.css` | Partial: header and/or comment/structure searches; Car setup and livery. |
| `css/cockpit-preview.css` | Fully read; Settings cockpit preview. |
| `css/components.css` | Partial: header and/or comment/structure searches; Shared screen/sheet/pane/button primitives. |
| `css/data.css` | Partial: header and/or comment/structure searches; Data Hub. |
| `css/dialog-platform.css` | Partial: header and/or comment/structure searches; Native dialog presentation. |
| `css/dialogs.css` | Partial: header and/or comment/structure searches; Dialog sheets. |
| `css/editor.css` | Partial: header and/or comment/structure searches; Track Designer. |
| `css/experience.css` | Partial: header and/or comment/structure searches; Home paddock context. |
| `css/fonts-hud.css` | Partial: header and/or comment/structure searches; Deferred HUD/body fonts. |
| `css/garage-experience.css` | Partial: header and/or comment/structure searches; Garage comparison. |
| `css/helmet-visor.css` | Partial: header and/or comment/structure searches; Helmet optics compositing. |
| `css/hud.css` | Partial: header and/or comment/structure searches; Race HUD. |
| `css/loading.css` | Partial: header and/or comment/structure searches; Pre-race loading. |
| `css/menu-destinations.css` | Partial: header and/or comment/structure searches; Home destination groups. |
| `css/menus.css` | Partial: header and/or comment/structure searches; Home navigation/layout. |
| `css/overlays.css` | Partial: header and/or comment/structure searches; Race/modal overlays. |
| `css/photo-studio.css` | Partial: header and/or comment/structure searches; Photo composition/library. |
| `css/player-tools.css` | Fully read; Settings search and player panels. |
| `css/race-setup.css` | Partial: header and/or comment/structure searches; Race/season setup. |
| `css/responsive.css` | Partial: header and/or comment/structure searches; Viewport-specific overrides. |
| `css/save-health.css` | Fully read; Save recovery panels. |
| `css/select.css` | Partial: header and/or comment/structure searches; Circuit picker. |
| `css/settings-controls.css` | Partial: header and/or comment/structure searches; Setting controls and dependencies. |
| `css/settings.css` | Partial: header and/or comment/structure searches; Settings submenus. |
| `css/title.css` | Partial: header and/or comment/structure searches; Title identity/art. |
| `css/tokens.css` | Partial: first 65 lines and comment/structure searches; Tokens, base, theme and cascade order. |
| `css/touch-controls.css` | Partial: header and/or comment/structure searches; Touch controls and density. |
| `css/track-detail.css` | Partial: header and/or comment/structure searches; Track/standings modal. |
| `css/tuner.css` | Partial: header and/or comment/structure searches; Lighting tuner/control vocabulary. |
| `css/watch-transport.css` | Partial: header and/or comment/structure searches; WATCH playback HUD. |

Remaining inventory is explicitly unread: `desktop/build/**` (including README, entitlements and PNGs), `desktop/scripts/{make-icons,notices,prebuild,read-fuses,set-version,unpacked-bin}.mjs`, `desktop/sync-version.mjs`, `desktop/playwright.config.mjs`, `desktop/tests/electron-packaged.spec.mjs`, desktop lockfile; `mobile/scripts/gen-icons.mjs`, mobile lockfile, Android build/config/Gradle/wrapper files, all Android resource XML/PNGs, and example Android test Java files. Binary images and Gradle wrapper jar were inventoried, not opened. Related root `sw.js`, `manifest.json`, workers under `js/`, and `tools/desktop/` are outside the assigned directories; only the staging dependency path was identified. Test names were inventoried, not executed or reviewed.

## LSP evidence

Connected `apex-lsp.lsp_outline({file:"worker/rendezvous.js"})` succeeded during this map: it reports TTL at line 34, limiter at 62, bounded-body reader at 102, Room at 134, and public fetch at 218, matching the local text. LSP was used as structural corroboration, not proof of runtime behavior. No diagnostics, caller or reference audit was performed. HTML/CSS mapping used textual selectors/comments rather than unsupported symbol inference. The LSP workspace SHA was not separately verified, so local file reads are the authoritative evidence here.

## Comment findings with proof

- **Confirmed stale prose:** `desktop/README.md:21` says “Forge config ... exercised by CI” while its own lines 10–16 explicitly choose electron-builder, `desktop/package.json` scripts invoke electron-builder, and the builder config exists. Suggested follow-up: replace “Forge config” with the actual builder/config wording. No edit made.
- **Useful contract, locally supported:** `index.html:14–55` explains preserving menu pinch zoom while preventing driving-surface gestures. The viewport at line 8 has no zoom cap, and the inspected inline event code scopes GestureEvent cancellation to `#game,#hud`; the double-tap fallback bypasses native controls. Device behavior is unverified.
- **Useful safety rationale:** rendezvous header and comments explain why Durable Objects, read-time expiry, owner retry capabilities and isolate-local rate limits exist. These match the inspected transactions/router; account-wide WAF behavior is explicitly not promised.
- **Potentially incomplete cascade explanation:** `tokens.css:11–13` calls out five deterministic layers, whereas `menu-destinations.css:1` creates `responsive`. This establishes an extra layer, but does not establish a rendering defect. Follow-up should document its intentional precedence before changing it.
- No TODO/FIXME/HACK results were returned by the scoped search across index/CSS/mobile scripts/worker/desktop README. That does not establish absence in unread desktop/mobile files.

## Risks/unknowns

Most CSS and HTML were deliberately sampled, so responsive overflow, theme contrast, selector deadness and controller/DOM agreement remain unassessed. Packaging helpers/configs/tests and platform manifests require deeper review before release claims. No Android build, Electron launch, worker deployment, browser interaction, unit test or visual verification was run. Remote service pricing/runtime compatibility claims in comments were not researched or revalidated. The optional relay's client encryption and direct WebRTC handoff were not followed into `js/net/`.

## Next steps

1. For a UI issue, trace its shell id to the controller, then inspect the corresponding complete CSS file and its layer/load-order context; reproduce at 844×390 touch as required by AGENTS.md.
2. For packaging work, read builder/stager/site/version helpers and existing desktop/mobile unit suites before altering the shared staging boundary.
3. Correct the narrow README stale word in a separate authorized change; document the extra CSS layer if it is intentional.
4. Verify this prose through the parent mapping lane's docs-only checks; this report does not claim those checks have passed.
