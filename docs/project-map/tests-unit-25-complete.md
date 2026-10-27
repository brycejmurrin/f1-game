# Unit group 25 — complete source map

All 23 planned test files (4,951 lines) were read through EOF in individually bounded source returns of at most 100 lines and 10,000 characters. No tests, browser, game, importer, workflow or mapped subprocess were executed; this is source evidence, not a pass/fail result. Only this report and ignored analysis files were written. SHA-256 values fix the working-tree snapshot.

## Method and limits

Each row gives the entire syntactic test registration, all lexical assertion-call spans and its intended behavior. Overlapping/adjacent assertion spans are coalesced; assertions inside callbacks count. Dynamic registration templates retain their interpolation expressions below. Helper assertions outside registrations are listed separately. Rows describe actual assertions rather than treating titles/comments as proof.

P = pure/CLI/filesystem behavior, V = VM or stubbed state behavior, S = textual source contract, G = synthetic geometry, O = local mathematical oracle. Every row inherits its file-specific fixture and limit paragraph. Source pins do not prove runtime branches; VM execution does not prove browser/GPU/device behavior. Generated fake paths (for example fixture f.js, scratch/m.json, /x/a.png, refused /tmp/x, /etc/passwd and disposable git branch/file names) are descriptive strings, not live reference links. Historical issue numbers and captures in comments are context only.

Used checkout-local code-nav fallback `bash tools/mcp/lsp-mcp.sh`: outlines for HudTyres, InputBindings, InputGhost, Input, IncidentSim, CamTune, I18n, Gfx, CanvasCssSize and HudReadouts. Definitions read: CamTune.decodeShare 619–651 (module-file fallback, export/caller coverage unverified) and InputGhost.valid 103–123 (text match because CommonJS export scopes the symbol locally). Production inventory ranges are whole-file extents, not claims of full production review. Named target function ranges below are syntax-derived; LSP supplied the module/definition anchors.

## Test source inventory

| Source | Full read range | SHA-256 | Registrations |
|---|---|---|---|
| tests/unit/hud-survey.test.mjs | 1–977 | 0aa54a08f7195b134fd2fcf6e43176639a738c64777c63a4789fa7c0cb4017d5 | 50 |
| tests/unit/hud-tyres.test.mjs | 1–112 | 1f60f95a436116b7a30eaebda9a4a28d37ec8f9c433dbb36dee4bd7c4895ba87 | 8 |
| tests/unit/hungaroring-pit-firs-orbit.test.mjs | 1–127 | 454a1777c1559fa5e071cf081c0319c981e736d2cb9d26aeda87bd53d31a4e65 | 2 |
| tests/unit/hunt-apex-aiplace-reset-vm.test.mjs | 1–39 | e889d862b03a9afe8ddfd96321cefe2a65ecf2fad516a578edb6ca0dcb62103e | 2 |
| tests/unit/hunt-tlx-create-undo.test.mjs | 1–35 | e44b59e69816ef3837d5e203ee2b38c280727db7cabc9c40ee4d71d5c8f3b924 | 3 |
| tests/unit/hw-zones.test.mjs | 1–134 | 93a4f2f42c3068af3844a0320e066562053ede6b65879930cfb3bd808d32bdad | 3 |
| tests/unit/i18n-lint.test.mjs | 1–144 | 62e780261125a9ccf6e826f2e86d0dde97b0606818a0ede99228f51d77431e47 | 13 |
| tests/unit/i18n.test.mjs | 1–142 | eabf1544671850d70820c9bfdb1eed425b3eac4f6779dd3aa8b7d32e14ca49d1 | 8 |
| tests/unit/image-grade-shaders.test.mjs | 1–343 | 1645bca8d2a2a7e6846b23ec992edccd3f7fce52d10b1e8d2e0880a0cb156e78 | 12 |
| tests/unit/import-hardening-apxc1.test.mjs | 1–105 | bea11a042efddd7f8a075f34372ebfaa2d5a332b63bd5d9d0bc7fd5fda364d74 | 6 |
| tests/unit/import-models-workflow.test.mjs | 1–128 | 2fecdaa22e29eff6ca46214d5fd0b595c1e6e95dec65af31aac4013f3efef8ac | 6 |
| tests/unit/import-models.test.mjs | 1–309 | 9b864c0b68c7e56008e0006eab2991b51deae8e135fd12955b4c00e4ccf02f75 | 4 |
| tests/unit/incident-gate.test.mjs | 1–625 | 24ea13d7dc340be0e8a501d2ed7d2573f26fb9d4fcb93f48d753554d071ac2ad | 32 |
| tests/unit/incident-rpm.test.mjs | 1–49 | 4d6fb711edbf6e2b4a631599a3aaf3ab0cb61a3b099fde41e27db32cb173781b | 2 |
| tests/unit/init-owner-resize-observer.test.mjs | 1–52 | 1f3b739ad152843ad54f41cdc2eb2fb882f2508f441beb99cf34497c223f4eb6 | 2 |
| tests/unit/input-bindings.test.mjs | 1–330 | fb85ba22524d75eabba4a8c7a8f2d351856f02964d0bcc3e0c3b88dbd01f930d | 15 |
| tests/unit/input-clock-rotate.test.mjs | 1–80 | 8eaf3c0e021541ddfc95f39fdf465ad5505081d3091a8f9ffba8f3864576fdaa | 5 |
| tests/unit/input-ghost-replay-vm.test.mjs | 1–187 | aa0755a44ef5420fb9fd97514ab7ddc0d2b4c72972875385ed24f3ff6c1547c0 | 4 |
| tests/unit/input-ghost.test.mjs | 1–572 | d2562f4d92f3167d2c72f6c5b28a2f7e12c98373b55ebc24da9131b8db4524f0 | 23 |
| tests/unit/input-hud-properties.test.mjs | 1–102 | 7ca1609302aebbbffd5c2cf327ba68433211ebaf4f8cd74ee1f1aa8fafd67368 | 6 |
| tests/unit/inputs-hash.test.mjs | 1–126 | a4c9e4c4a38b4d84c685a5f029ca106ec0c944d3b14ee04346c5bdf89df16aee | 7 |
| tests/unit/install-chip-overlap.test.mjs | 1–109 | e08371182b0b37a084702f3f3a28a138160412c464c46220a6d919d933ea801a | 5 |
| tests/unit/ios-input-zoom-w25e.test.mjs | 1–124 | 76c4ec6153bf991a0f2660fcbb9db85f1c81918eae8839842b35e5eaf11aa87f | 2 |

## Production, contracts and fixture inventory

Referenced files are current existing dependencies; synthetic pathname strings are intentionally excluded. Hashes and whole-file ranges give reproducible target versions, not a claim every dependency was fully read. The eight i18n fixture catalogs were read; glTF/PNG/AX26 fixtures are constructed inline in the test ranges. AX26 helper 1–57 was read and confirms Assets.model performs the actual decode.

| Source | Extent | SHA-256 |
|---|---|---|
| .claude/skills/survey-ui-matrix/SKILL.md | 1–128 | d658de42fcb6fb52a8cead9866bbb67174d77b971fb3eb477c722653c56752f6 |
| .github/workflows/ci.yml | 1–3143 | d615b39496e01177025a6dde9dbdd6edd5d8314942a9adaca3cb8ead2bf0f1d6 |
| .github/workflows/hud-survey.yml | 1–162 | 807e23358199fafc47367da2f634b26ecc582398bd2b40b45938a62cbcbcdaec |
| .github/workflows/import-models.yml | 1–202 | 7102ad40780c5f1e2933af89ddb3f07f0dfbad6f54edb9fdf342f6af076d9fac |
| css/appearance-studio.css | 1–300 | a7419ce41a242e18437dbe31e1a8cb9b97bed3baaf91f1479f8fd98297a7a89e |
| css/hud.css | 1–2526 | ae4d6a5649088bc03a468e0d0686bc0a333f613440ffd78edb351ab41e1f75b1 |
| css/overlays.css | 1–1469 | 9b84e3b6694cd8d7798cdd42353791f1dd80e74659dfd09470084bc37f34e101 |
| css/race-setup.css | 1–706 | 57666de08cc805e268a7df72e2086c242b19a127db6cd9e5efc4ecf3a70ab061 |
| css/tokens.css | 1–1361 | baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a |
| css/track-detail.css | 1–232 | b39afb0b28ca00df1989f02382adc867a072cbeef440038d47ef204088387c90 |
| css/tuner.css | 1–1509 | 50f6c5c0d39e3acb7a7bd95ac02b72dbfc729de7904cd3c1025f29fb668e82ac |
| docs/AGENT-SURFACE.md | 1–691 | 01d0331bed6676ae85175c7017a27bd5ab6401f8c29e3598f88339b4e3d8173e |
| index.html | 1–3970 | 198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348 |
| js/agent/apex.js | 1–2495 | fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1 |
| js/camera/cam-groups.js | 1–44 | 9b66600b78e8e3fadda1b872fb7c6e301607c648be85e2865169e4bdf0945424 |
| js/camera/mode-switch.js | 1–305 | 042ce57bb945fc87fed40198717e1db9b5dd44565025f8aab4407bed4accf920 |
| js/camera/offsets.js | 1–721 | d632655e71861cf92db8c83be426a16e8ed6742649729e87dc62b03f2a5a75a3 |
| js/car/input-ghost.js | 1–608 | 632d4af87c07e9947d9397eee81a4f9e7350d3847090457d81b267f38a5c75e5 |
| js/circuits/hungaroring.js | 1–57 | a9ca02aa396fd9a16fdd823452bef2d312800b4b9c97aa20e813f998ee9bc51c |
| js/circuits/scenery/hungaroring.js | 1–879 | b82a4eb96859a1024445d3b636672ed501321d3ebf0970a535b2766c6fad378c |
| js/core/dom-apply.js | 1–59 | e2b76d41974ed81d469f659cb289dc830e2d53377749c8ef3fc68e3854e9c668 |
| js/core/i18n-pseudo.js | 1–34 | 67df489f5af769d0e7722a70dac3dc7f0e52b2cb9820c97015d7035483ec26cd |
| js/core/i18n.js | 1–300 | 9f6058bcf0c6686628174c57bdb195694c027f5132625b8a1162d19f09c44719 |
| js/core/mat4.js | 1–98 | 8b80f0f6223622840031c736453f9d84862f049e70ce49a1709090098f7d121d |
| js/core/store.js | 1–878 | 736b2573d7a8376f5eaa7526486310fa1455e47ee7aa20c510ba4f648f2dda0b |
| js/data/settings-defaults.js | 1–95 | 341c37276f582021a20da7b8bc1d70d31c4f56dc6c191fc2ecc1d1d1fb25009b |
| js/game.js | 1–9554 | 20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d |
| js/garage/setup-camera.js | 1–1153 | 15edc407088a93398cfa04a8ec828867e956d2d832c1cfffafb2c94589843637 |
| js/input/bindings.js | 1–319 | c6ab198929edc778cc7d23b6b573f2d7c6feb608283f2b160d4ee8a819ea03e4 |
| js/input/haptics.js | 1–213 | a7ae29b469fa16a74dfe9394a1cf4bddaf0fc0cba06f2296a6aad6312410b0d2 |
| js/input/hold-buttons.js | 1–211 | 9727946b9132cd9e5694b85ff624953e5573a7aa52560a9e85d59c9c762d3ff7 |
| js/input/input.js | 1–2624 | cb7c8f371e27b0b5862fafc0327f896f80f778948e7a7778ea8380707c356de2 |
| js/input/pad-menu.js | 1–286 | d2b3a3b58c89b25b15742bd6fd39eefb9a39a71e833a48a59f7b14bce1a56abe |
| js/physics/contact-geometry.js | 1–164 | 75288946c2076ce5531a81f86cd4670649c2c01ad3cfacf4300aeb3ea6e204a5 |
| js/physics/incident-sim.js | 1–543 | bff96767345deb8d8596bc58443aafbe8583d46a95ec6cd465ce2d794508c649 |
| js/race/car-fields.js | 1–272 | 1588de112c142540acf93e0f88c7ddb86a3d5ce773a27e296f9fd728dfa327d1 |
| js/race/overtake-mode.js | 1–155 | 69e498cd080c996b49caef0ddd9d17b96f378566d7734b2f1db6c678a67a8019 |
| js/race/race-control.js | 1–744 | 1dfaf228a9906bc173fdccad5e6605514cc530fdc48ff9883935813c80dd67ca |
| js/race/session-records.js | 1–140 | ec7a609aee9a671f43871d7279192cb0035f6a92ecd49c3c2abe34168399db32 |
| js/render/gfx.js | 1–318 | 879c63bb0eb55022f20b43c55e218cba220c896af7dc1da995f5712cd7f9ea3d |
| js/render/glx/post.js | 1–1354 | bee401242ac69ab9a0529848d324b43ba16cd6ea257f9dce73eaafef5b6c86d1 |
| js/render/glx/shaders/glsl-post.js | 1–1620 | a4a4b0e94dd4087164fb43e679c549e11eab171b70f3845352f6e09ff37f9239 |
| js/render/shared/assets.js | 1–1011 | 825cbd606a5813b64c71460c4308d175f6afface9551461c558339e4592431cf |
| js/render/shared/canvas-css-size.js | 1–68 | 6e212edfc56e7e223babaabc2bf9856c5000643780da3ece5739445f689d779f |
| js/render/three/tlx-post.js | 1–1312 | 3d9a328acc1cd51be49e8d853cbfa3a0f2eba4311bad30d3475610b5d5b315b1 |
| js/render/three/tlx.js | 1–6854 | 58669a10791324112e956d2b63adefd0c2b793147945a148d2eda447340922a2 |
| js/render/three/tsl-post.js | 1–1268 | a714785117cdd210bba3d2ed22ca4474a5a647204e004dddf220c9a3caf5d580 |
| js/render/webgpu/wgsl-chunks.js | 1–2636 | b292f62c1e082cc021ac6c566f9ac03a10c1e9b39dae2be6217fc8c645b060ee |
| js/render/webgpu/wgsl-post.js | 1–1494 | da85d59d7f223f6bb030a60f47c79730925c80d843910cf20ec2fc0509b40e79 |
| js/render/webgpu/wgx.js | 1–6085 | 7ce7dd4b81578e15a31cd102eb36229a8c2b7c8e59f65aed837cbfbe1888d855 |
| js/track/core/def.js | 1–311 | db57bd98e7c4a42dc2b3da78f86c4764c554374130a3e775a3f7a4bf059f6070 |
| js/ui/hud-elements.js | 1–273 | dd6fae0a8af4336f2763017995dd5494f302c7a65e0aac601c23395023f81e1e |
| js/ui/hud-layout.js | 1–1355 | 512a4ce001b63fcad4003139cb36aa041fe36be45c5c8cdb1d9248e4aa514895 |
| js/ui/hud-readouts.js | 1–308 | 4a47a3a0d4ea19791fd29f6199d25302f623e95d92d6af3eee4643b805cef8c0 |
| js/ui/hud-tyres.js | 1–88 | 4a63f61a5a22bf11a50f12e2a8eeae0c9f1dcfdfe5887be655c0416ebd17f444 |
| js/ui/hud.js | 1–2541 | 34025c6524ab09293553ea05907cc0e3b063a1d31b00a17e2f6707960477355f |
| package.json | 1–110 | d5ef4eaafe5d034da59e3fcb290f6765d510cd2515805bfa53855459aad83073 |
| tests/data/i18n-lint-allowlist.json | 1–14 | b3a5f52bdc0dcbe8898115bda9e0d7e86a6506dbd076ea1be350d40b0468f3bf |
| tests/data/i18n-migrated.json | 1–13 | 6de96e4e7742a6753d9ed2fd9d0872333b3731d333cb251cae6a8e4c7cc5d2de |
| tests/fixtures/i18n/bad-placeholder/en.json | 1–4 | ac9de60797383773be7b1e0f30509a8f0375d5d27574f93a10ab46e42797de9a |
| tests/fixtures/i18n/bad-placeholder/xx.json | 1–4 | b02829fb38e098c9e879195c3c1d038af8da5197c4892e657022376366447a97 |
| tests/fixtures/i18n/missing-key/en.json | 1–5 | 8989a2b83bea35cebe6b1428c1e5dfab2deacb729c647c4c1545a52363af4957 |
| tests/fixtures/i18n/missing-key/xx.json | 1–5 | 6956b365190178a434039a1339b11a0cc4a86ccb78c94752f839aeef5e582dbb |
| tests/fixtures/i18n/valid/de.json | 1–5 | 59fe14d331f720ec0f048d0c3435edc0e0bf23621edf9c7f3974bda51c3d8118 |
| tests/fixtures/i18n/valid/en.json | 1–5 | ea5a10914230e1d85cbcee9537762cdc25f5a420d86d3a578379cab7cba5e65e |
| tests/fixtures/i18n/wrong-plural/en.json | 1–3 | 5388bf975c06716cffaefc7ef69846c482cd48cd502de5db52d2f4e80031c139 |
| tests/fixtures/i18n/wrong-plural/ru.json | 1–3 | 70746a0285633bfb3d5f9df39e684707e0230180cdbb10b2012ec5171ddbc912 |
| tests/helpers/abs-src.mjs | 1–8 | f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47 |
| tests/helpers/ax26.mjs | 1–57 | 1cffd04947eca8e729b550ac284d5b9fcf998fab904bf45337cafb8c8120d14f |
| tests/helpers/css-rules.mjs | 1–113 | 31386fa434392a93826b1f8197b310378bf00eead431d10fd38a5130b9866a28 |
| tests/helpers/css-source.mjs | 1–2 | 434b8bcb5a8b1b7ff7e3d52b292f8d0a1726db49dbc655b85538bcb005df571a |
| tests/helpers/game-source.mjs | 1–84 | 2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044 |
| tests/helpers/git-fixture-env.mjs | 1–64 | 4c1552f60e11920ca758fd7f913db6604ac90adcbd59437a694576f2e7f9cf82 |
| tests/helpers/key-binds-rig.mjs | 1–210 | 502049f0d846fdc0b0da9256779a6a54fb7a058344a3ca536f6fff9242697db7 |
| tests/helpers/seed-log.mjs | 1–35 | b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1 |
| tests/helpers/seed-save-migrate.mjs | 1–31 | 01e258dd999942cd1633f79d6ef90b693c2b6529bf11d67ebf7160fd6c505295 |
| tests/specs/hud-layout.spec.js | 1–1832 | 164340a787ddb27d75ea0224f9a493c3deb80a2b1bb81d4ae74d3a3609ab7975 |
| tools/check/i18n-lint.mjs | 1–543 | a19b63e8495f2f90ca246d292acdf4b181895f5327b1e64571bfa8d2dd5ca96b |
| tools/ci/geometry-paths.mjs | 1–262 | f5ed0099ffdb374e684d92556b145f64ea34e5d8f59137945681d5521785fba6 |
| tools/ci/inputs-hash.mjs | 1–202 | 777e2fd4cdd7b95f42eb2f37d9b644c48b1ed96e7f275c99ecfdef5fdeb67157 |
| tools/gen/assets.mjs | 1–1890 | 5549fc1414403fc7db6da93c8db441e4dc3122530dcdf3f8236f6b8e6988f417 |
| tools/gen/import-models.mjs | 1–358 | 8f4d7c51673b626af29212337e9658be547a2ef8d92ee03c679473713a8c7471 |
| tools/lib/cli-args.mjs | 1–163 | 8d8c3941f52a9845099e7613fe37650fdc6febe0b8a522c1062a451041870cc1 |
| tools/lib/game-vm.cjs | 1–880 | 2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0 |
| tools/lib/hud-geometry.mjs | 1–148 | c98a90747e10fdfc6411546b1670a21e1a343242615ab63a6fc01be4175cc108 |
| tools/lib/hud-survey-matrix.mjs | 1–993 | 0dd307586d28d18587cd271c79feabd751fe7a261b00bced79115104357a5d6a |
| tools/lib/track-build-vm.cjs | 1–270 | 09e00ae387a0e46bf25c9d7cbe4eb71ab32c891b7aba36e645c5d6614f6f311b |
| tools/lib/ui-mock-core.mjs | 1–126 | 7c86adf62946913943e7eacee8b9f74405b9bd8f2641555f49d0a31024db3881 |
| tools/manifest.cjs | 1–1691 | bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb |
| tools/mcp/apex-tools-mcp.mjs | 1–3376 | 06536ec0f59f9e2d49231db8832aea282980b54f45b28d511f3fc67612f33ecf |
| tools/shot/hud-live-sample.mjs | 1–219 | 481cb76d81486cdca1ca5fd510631fb85b91a23295872eeb0ce8d0775c576cd1 |
| tools/shot/hud-mock.mjs | 1–277 | 5c3bf60f643abbeeb71b7744fee3420b0bb0c0c839a62c316845082f314f9b71 |
| tools/shot/hud-survey.mjs | 1–698 | faceae07b2df8050198f96f280c09fe245242f7b5803c56aab36f0fcde392d08 |
| tools/track/verify-track.cjs | 1–458 | 6eb4174e4ce20105e81c76fcfde2c6b2199818aeb2e22ba4612b909127be0b8b |
| tools/ui/menu-mock.mjs | 1–263 | 4beabca523c97662aaad33f45120e1c3eb671486dcf9bc42f845bb57b7b3664f |
| tools/ui/menu-screens.mjs | 1–629 | 36c767b01ab83fc7bdfd8fa9767477f038a5e34f513bcfe65618dbc20f05232f |

## Production navigation anchors

- js/car/input-ghost.js: round 34–37; byteLength 38–44; contextKey 45–49; currentBuild 50–56; currentPhysRev 57–63; currentDt 64–70; quantizeSteer 72–74; packFlags 75–87; quantizePedal 88–90; decodeStep 91–101; valid 103–123; committed 128–128; compatible 129–140; encodeBytes 145–152; decodeBytes 153–162; encodeValues 163–167; packChannel 168–186; unpackChannel 187–201; packedGhost 208–219; packGhost 220–234; unpackedGhost 235–257; packedBytesBound 262–271; loadStore 274–293; touch 294–297; entryBytes 303–310; storeBytes 311–318; trimStore 319–341; saveStore 342–348; betterGhost 352–361; onStoreChange 362–384; scheduleSave 388–423; materialized 425–428; setTrack 429–441; startLap 443–453; record 455–469; finishLap 471–513; hasGhost 515–515; bestTime 516–516; snapshot 517–528; envelope 529–529; steps 530–530; atStep 532–542; beginReplay 545–549; next 551–556; replayIndex 557–557; clear 559–579; flush 581–593.
- js/core/i18n.js: baseLang 16–21; readQueryLang 23–38; readSavedLang 40–44; detectFromNavigator 46–61; resolveDetectOrder 63–65; setHtmlLang 67–73; fillPlaceholders 75–85; parsePluralForms 87–93; resolvePlural 95–105; formatMessage 107–110; pseudoMaybe 112–115; lookup 117–123; t 125–129; cacheKey 131–133; n 135–140; date 142–147; rel 149–154; list 156–161; country 163–168; compare 170–175; notify 177–183; manifestHash 185–188; fetchJson 190–194; loadManifest 196–205; loadCatalog 207–224; boot 226–236; lang 238–238; dir 240–242; onChange 244–247; ready 249–253; set 255–262; _installCatalog 265–270; _resetForTest 272–280; pluralCategories 282–284.
- js/input/bindings.js: holdModeDefaults 9–9; parseHoldMode 10–18; snapshot 20–24; rows 25–27; isDefault 28–30; claim 31–41; create 43–315; rebuildKeyIndex 98–102; resetKeys 103–103; setKeyMap 107–130; getKeyMap 131–131; keyBindings 132–132; keysAreDefault 133–133; setKeyBinding 136–143; clearKeyBinding 144–147; loadLayoutMap 164–173; layoutLabel 174–180; keyLabel 183–195; notifyPad 227–227; resetPad 228–228; resetPadPublic 230–230; setPadMap 231–252; getPadMap 253–253; padBindings 254–254; padsAreDefault 255–255; setPadBinding 256–263; clearPadBinding 264–267; setPadLabelMode 285–287; padLabelModeOf 288–288; padBrandAuto 289–295; padLabel 300–305.
- js/physics/incident-sim.js: rng32 66–74; fin 75–75; create 78–86; active 88–91; owns 94–96; setFlags 98–111; release 120–126; reset 128–136; notifyWall 139–147; notifyCar 148–156; preStep 158–217; snapOf 220–223; startIncident 226–283; postStep 285–387; _lapCross 401–407; yawOf 409–412; upYOf 413–416; handbackCar 418–495; rescueAI 497–513; finishCar 515–521; forceLaunch 523–523; status 525–538.
- js/render/shared/canvas-css-size.js: create 7–65; markDirty 16–16; read 30–53; dispose 55–62.
- js/ui/hud-tyres.js: band 17–24; state 27–31; label 37–47; cbCuesOn 49–51; compoundChip 54–62; paint 67–84.
- tools/check/i18n-lint.mjs: each 35–40; baseLang 42–47; extractPlaceholders 50–67; extractPluralForms 70–79; pluralCategoriesFor 81–83; braceBalanceOk 85–95; isBadChars 97–99; readJson 101–103; readAllowlist 105–115; readMigrated 117–126; lintLocalePair 132–295; lintLocalesDir 298–344; propName 346–351; isI18nT 353–359; isI18nOnly 362–368; literalHasLetters 370–383; snippetOf 385–388; guardSource 393–445; guardMigrated 448–499; run 501–538.
- tools/ci/inputs-hash.mjs: expandInputPaths 53–87; hashInputs 90–111; inputsHash 114–119; coverageReport 126–141; guardsExpectedPaths 144–161; sweepsPartsExpectedPaths 164–177.
- tools/lib/hud-geometry.mjs: probeHudElements 26–104; rectHit 107–109; controlClash 112–116; analyzeOverlap 122–141; overlapArea 144–148.
- tools/lib/hud-survey-matrix.mjs: validateOffsets 169–190; normalizeCell 193–236; hash6 240–244; cellId 246–260; fullValid 303–307; pairwise 313–369; pairwiseBooted 376–384; exhaustiveRaw 392–419; rgba 497–502; contrastRatio 509–515; camGroupFacts 520–525; evaluateChecks 528–600; expandMatrix 605–639; filterOnly 642–645; bootGroups 648–656; shardCells 660–675; parseShard 676–682; estimateMinutes 687–689; expectedVisibility 696–770; cellViewport 779–783; classifyFindings 787–860; applyChecks 864–872; rankFindings 874–878; countBy 880–884; mergeReports 887–903; renderFindingsMd 906–922; renderIndexHtml 926–944; selfTest 948–993.
- tools/lib/ui-mock-core.mjs: holdLoopInit 19–25; drawBoxes 28–47; captureShot 51–63; sheetArgs 66–70; contactSheet 73–77; inputsHash 80–94; cellKey 97–101; cellCache 104–126.
- tools/shot/hud-live-sample.mjs: analyzeSamples 50–77; summarize 80–93; parseArgs 97–123; main 125–215.
- tools/shot/hud-survey.mjs: parseArgs 102–175; chromiumArgs 179–183; applyCell 186–253; probeWithTransients 258–287; hudFitState 290–302; runExtras 306–341; litFraction 343–350; shotTimeoutMs 361–363; cdpShot 365–384; bootStore 388–392; repaintFrames 396–400; runGroup 403–553; contactSheets 555–573; writeReport 578–606; runMerge 609–631; runSelfTest 633–652; main 654–694.
- tools/ui/menu-mock.mjs: planMenuCells 44–54; groupKey 57–57; probeMenu 60–118; leaveToMenu 122–143; main 147–259.

## tests/unit/hud-survey.test.mjs

Targets: tools/lib/hud-survey-matrix.mjs; tools/lib/hud-geometry.mjs; tools/shot/hud-survey.mjs; tools/shot/hud-live-sample.mjs; tools/mcp/apex-tools-mcp.mjs; tools/shot/hud-mock.mjs; tools/lib/ui-mock-core.mjs; tools/ui/menu-mock.mjs. Evidence P/S/G. Fake DOM, synthetic measured records, child CLI processes and APEX_MCP_MOCK responses; no rendered HUD or real MCP browser launch.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 32–73 | 34, 37, 41, 43, 46, 48, 51, 55, 58, 66–67, 69–72 | survey matrix: the survey's tables lockstep the game's: CamModes, HudLayout, HudElements, hud.js camera sets. |
| 76–87 | 78–79, 82–84, 86 | geometry: geometry: spec rules — circles for round buttons, rects otherwise, containment never clashes. |
| 89–94 | 91–93 | geometry: hud-layout.spec.js measures through the shared probe, not a copy. |
| 118–133 | 126–132 | P/S/G: Self-contained fake-DOM probe records shown/missing/display-hidden nodes, tower containment and zoom-adjusted minimum font size. |
| 135–144 | 140–143 | P/S/G: probeWithTransients forces the radio card / limits / flag on, probes, and restores them. |
| 146–188 | 169–179, 182, 187 | survey matrix: Resets all six camera/profile layout combinations; writes both preset sets before jump; restores then changes live profile; applies element/map/HUD toggles and reports invalid map option. |
| 190–204 | 197–198, 201–203 | P/S/G: Reads fit CSS variable and limits flag; resolves inherited contrast background, reports label scroll clipping and unchanged settle variable. |
| 207–219 | 210, 212–214, 216, 218 | survey matrix: pairwise covers every pair (or only the named ones), deterministically, under constraints. |
| 221–249 | 223–224, 226, 228–230, 232, 237, 239–242, 244–245, 247–248 | survey matrix: Quick plan has 13 cells/three boots; full pairwise stays capped/covered; exhaustive covers every configured device/knob/camera/preset pair and includes lead baselines. |
| 251–268 | 256–257, 259, 264, 266–267 | survey matrix: shards: whole boot groups, a partition, balanced, baselines stay with their leads. |
| 270–280 | 273, 276–279 | survey matrix: cells: validation, stable ids, boot keys. |
| 282–296 | 284–285, 287–288, 291, 294–295 | survey matrix: inline offsets retain unrestricted finite coordinates and positive fractional sizes. |
| 299–338 | 303–317, 321–322, 327–328, 330–333, 335, 337 | survey matrix: Visibility policy for MAP AUTO/on, profile/BCAM sectors, tyre/layout switches, desktop/touch cockpit and helmet, rotate gate, explicit element toggles and HUD-off. |
| 340–368 | 345, 352–358, 362, 365, 367 | survey matrix: findings: the CLEAN-preset map that vanishes, overlaps by severity, offscreen, unsafe, tiny text, rotate cover. |
| 370–380 | 371–373, 375–376, 378–379 | survey matrix: desktop-1440x900: a named 16:10 device, its own short id, not a matrix axis. |
| 382–413 | 386, 388–394, 396–400, 404–405, 409, 412 | survey matrix: portrait mode: race by default (portraitOk at boot, findings keep their severity), gate on request. |
| 415–431 | 420–421, 423–426, 429–430 | survey matrix: classifier viewport: offscreen and lead onScreen judge the measured innerWidth x innerHeight. |
| 433–447 | 442–444, 446 | P/S/G: repaintFrames: the 3D loop back on, then N animation frames before the cell goes headless. |
| 449–487 | 456–458, 460, 462–463, 469–470, 472–475, 477–479, 484–486 | survey matrix: Lead checks classify missing baseline, variable mismatch/unwritten state, displacement, overlaps, camera grouping, contrast, settling and clipping; merge reevaluates cross-shard baseline. |
| 489–500 | 494–496, 498–499 | survey matrix: reports: findings.md ranks and names shots; index.html is static and escaped. |
| 503–521 | 505–506, 508–510, 512, 515–516, 519–520 | CLI/shell: CLI: --self-test passes, --list prints the cost first, --plan, refusals exit 1, no browser. |
| 523–535 | 525–529, 531–532, 534 | P/S/G: CLI parse: one-cell knobs, --track base, --gl, matrix files and --merge. |
| 537–558 | 548, 550–553, 555–556 | survey matrix, CLI/shell: CLI --merge combines two shard dirs into one report, copying shots. |
| 560–583 | 577, 579–581 | survey matrix, CLI/shell: CLI writeReport exits non-zero when any cell has cellError even if others measured. |
| 586–599 | 589–598 | survey matrix, CLI/shell: MCP: apex_hud_* publish bounded schemas and are browser tools in the map. |
| 601–625 | 604, 606–607, 609–610, 612, 622–623 | MCP wrapper: MCP: dryRun argv is pinned, one-cell for apex_hud_shot, and accepted by the CLI's own parser. |
| 627–637 | 633, 635 | MCP wrapper: MCP: a matrix file must be valid survey JSON under scratch/ before any lock. |
| 639–659 | 650–654, 656–658 | CLI/shell: MCP: results carry structuredContent, its serialized copy first, and resource_links (tools/call, mock). |
| 661–677 | 663–667, 669–672, 675 | survey matrix: the dispatch-only workflow shards, runs llvmpipe, merges and stays opt-in. |
| 686–693 | 688–692 | P/S/G: hud-live-sample: a piece that stays on screen reports nothing. |
| 695–708 | 700–707 | P/S/G: hud-live-sample: how far past the edge, and for how long. |
| 710–716 | 712–713, 715 | P/S/G: hud-live-sample: the left and vertical edges count too, and the last sample is one interval long. |
| 718–725 | 720, 722–724 | P/S/G: hud-live-sample: sub-pixel layout noise and a hidden piece are on screen. |
| 727–735 | 731–734 | P/S/G: hud-live-sample: summarize keeps each piece's worst trial and counts the trials that went off screen. |
| 737–758 | 739–746, 748–757 | P/S/G: hud-live-sample: argv parsing — defaults, overrides, and every refusal. |
| 760–768 | 763–764, 766–767 | CLI/shell: hud-live-sample: the CLI refuses a bad device before it launches anything, and --help says what it is. |
| 772–776 | 773–775 | P/S/G: shotTimeoutMs: 60 s up to 1280x800, 180 s for a 1920x1080 frame. |
| 779–793 | 785–788, 790–792 | P/S/G: hud-mock: the default plan is phone landscape × 5 cams × shipped / all-on, and BUTTON SIZE only on touch. |
| 795–815 | 798–803, 805–809, 811–814 | survey matrix, MCP wrapper, CLI/shell: Bounded device/camera/scale schemas, browser description/docs, dryRun argv/error and mocked output links/overlap; job-default claim appears only in title. |
| 818–836 | 820, 823, 829–830, 833, 835 | survey matrix: expectedVisibility: a touch cockpit never expects the floating SPEED, nor chips a NAMED preset holds. |
| 843–849 | 845–848 | UI mock core: ui-mock-core: cellKey ignores key order, and moves with the tool, the tree and every cell field. |
| 851–862 | 857, 859, 861 | UI mock core, CI input hash: ui-mock-core: inputsHash follows js/css/index.html content and nothing else. |
| 864–878 | 869, 872–873, 875–877 | UI mock core: ui-mock-core: cellCache round-trips a row and its image; a null tree hash or enabled:false never hits. |
| 880–882 | 881 | P/S/G: hud-mock: the cell cache key carries the --css content (a prototype stylesheet edit must re-shoot). |
| 884–889 | 885, 887–888 | UI mock core: ui-mock-core: sheetArgs tiles labelled files, and is null for nothing. |
| 891–902 | 893–901 | menu mock: menu-mock: planMenuCells orders race-bound screens last, groups by pointer shape, and refuses unknown ids. |
| 904–908 | 906–907 | P/S/G: menu-mock: OVERLAY_IDS includes photo-studio + loading so a * sweep can reset the title. |
| 910–935 | 931–934 | menu mock: menu-mock: leaveToMenu dismisses ios-install and photo-studio-open. |
| 937–941 | 939–940 | CLI/shell: menu-mock --list needs no browser. |
| 944–977 | 968–970, 973–975 | menu mock: menu-mock: hidden fold controls are excluded while summaries and visible small controls remain. |

## tests/unit/hud-tyres.test.mjs

Targets: js/ui/hud-tyres.js; css/hud.css; index.html. Evidence V/S. VM elements and mocked A11yOpts; CSS glyph and shell checks are text contracts, not accessible rendering.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 19–24 | 21–23 | HudTyres: band: cold below window, hot above, ok inside. |
| 26–33 | 28–32 | HudTyres: state: reads TyreModel.info; missing temp reads ok. |
| 35–44 | 38–39, 41–43 | HudTyres: paint: writes data-temp on the tyre widget, no child nodes. |
| 48–54 | 50–53 | HudTyres: label: compound, heat, laps left in words; ok heat is silent. |
| 56–62 | 61 | HudTyres: paint with extra writes the aria-label, plan appended. |
| 64–95 | 73, 75, 81, 90–91, 94 | HudTyres: compoundChip and paint: COLOURBLIND CUES stamps data-compound on the code chip. |
| 97–106 | 99–103, 105 | V/S: CSS: cold/hot carry a glyph after the letter, not colour alone. |
| 108–112 | 109–111 | V/S: module has no Tracks / curvature / kCur reads. |

## tests/unit/hungaroring-pit-firs-orbit.test.mjs

Targets: js/circuits/scenery/hungaroring.js; js/circuits/hungaroring.js; tools/lib/track-build-vm.cjs. Evidence V/S. Real track builder with primitive capture; geometric tall/slim-foliage heuristic in one start sightline is not a visual or GPU orbit judgment.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 61–95 | 64, 91–92 | V/S: hungaroring pit-straight clears fir-rank foliage (#3317). |
| 97–127 | 111, 119, 121–126 | V/S: hungaroring-pit-complex still emits; dressPit stays pale (#3317). |

## tests/unit/hunt-apex-aiplace-reset-vm.test.mjs

Targets: js/agent/apex.js; js/race/car-fields.js; tools/lib/game-vm.cjs. Evidence V. Game VM plus V8 native fast-property inspection; two lap samples and one reset sequence, no browser performance claim.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 13–26 | 21, 23 | V: aiPlace: prog follows (lap-1)*L + s at lap 0 and lap 2. |
| 28–39 | 36–37 | V: reset(): cars keep fast properties and CarFields keys read undefined. |

## tests/unit/hunt-tlx-create-undo.test.mjs

Targets: js/render/three/tlx.js. Evidence S. Regex/source ordering and listener counts only; no Three.js boot, thrown-init execution or real event delivery.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 14–20 | 15–19 | S: create() registers an undo for every observer/listener it attaches. |
| 22–28 | 24, 26–27 | S: the create() catch runs the undo list before it hands the canvas to the fallback. |
| 30–35 | 33–34 | S: Counts at least four removal sites and at least one attachment; does not syntactically exclude every bare anonymous listener. |

## tests/unit/hw-zones.test.mjs

Targets: js/track/core/def.js; tools/track/verify-track.cjs. Evidence V. Control-polygon arc and built centerline samples; 11 REKEYED tuples (header says twelve), curated apex proximity and three reviewed exceptions, not every road clearance.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 76–87 | 86 | V: re-keyed hwZones narrow the arc window they were authored for. |
| 89–105 | 103–104 | V: every curated turn inside a re-keyed zone's window dips the road within 60 m of its apex. |
| 115–134 | 130–131, 133 | V: every hwZone narrows within 150 m of a curated turn, or is a reviewed exception. |

## tests/unit/i18n-lint.test.mjs

Targets: tools/check/i18n-lint.mjs; tests/data/i18n-migrated.json; tests/data/i18n-lint-allowlist.json. Evidence P/S. Synthetic ICU-lite strings, eight fixture catalogs and current English-only tree; checks lint classifications, not translation quality.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 30–41 | 31–35, 37–40 | P/S: extractPlaceholders sees named holes and plural anchors. |
| 43–47 | 44–46 | P/S: pluralCategoriesFor matches CLDR via Intl. |
| 49–53 | 51–52 | i18n lint: fixture valid: clean. |
| 55–63 | 58–59, 61–62 | i18n lint: fixture missing-key: unknown key fails; absent English key warns. |
| 65–71 | 68–70 | i18n lint: fixture bad-placeholder: placeholder set mismatch fails. |
| 73–78 | 76–77 | i18n lint: fixture wrong-plural: Russian without few/many fails. |
| 80–86 | 83, 85 | i18n lint: lintLocalePair rejects identical-to-English unless keep/allowlisted. |
| 88–93 | 90–92 | P/S: extractPluralForms parses ICU-lite bodies. |
| 95–110 | 96–109 | I18n, i18n lint: guardSource flags literal textContent / aria / Dom.el, skips I18n.t. |
| 112–121 | 114–117 | i18n lint: guardMigrated on the ship tree is clean (empty migrated list). |
| 123–126 | 125 | i18n lint: ship locales/ pass i18n-lint (English-only baseline). |
| 128–134 | 129–133 | CLI/shell: CLI run --dir fixtures and --guard exit codes. |
| 136–144 | 138–141, 143 | P/S: allowlist file exists and is reviewed-shape (no silent hide). |

## tests/unit/i18n.test.mjs

Targets: js/core/i18n.js; js/core/i18n-pseudo.js; js/core/store.js; js/core/dom-apply.js. Evidence V. Fresh VM with fake storage/document/fetch; lookup/Intl/pseudo behavior, not asynchronous locale network success or DOM screen-reader output.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 55–63 | 59, 61–62 | I18n: lookup chain: catalogue, then English default, then key. |
| 65–72 | 68–71 | I18n: placeholders fill {name} holes. |
| 74–80 | 78–79 | I18n: English plural one/other. |
| 82–91 | 87–90 | I18n: Russian plural categories resolve. |
| 93–101 | 98–100 | I18n: Arabic plural categories resolve. |
| 103–116 | 111, 115 | I18n: detection order: query beats saved beats navigator. |
| 118–126 | 123–125 | I18n: en-XA pseudo expands the resolved string. |
| 128–142 | 141 | I18n: plain English does not fetch a locale file. |

## tests/unit/image-grade-shaders.test.mjs

Targets: js/render/glx/shaders/glsl-post.js; js/render/webgpu/wgsl-post.js; js/render/three/tsl-post.js. Evidence S/O. Source-extracted constants plus local JavaScript grade oracle and CPU TSL node shim; no shader compilation or rendered image equivalence.

Shared/module-level assertion spans: 25 (fixture helpers/oracle extraction; inherited by calling cases).

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 96–103 | 98–102 | S/O: GLSL, WGSL and the TLX node graph run the SAME grade numbers (zone edges, tone gains, low-end lift, pivot). |
| 105–112 | 109–111 | grade oracle + backend source: BLACKS / SHADOWS bite: a positive blacks tone brightens near-black more than a mid grey. |
| 114–121 | 118–120 | grade oracle + backend source: tonal masks target ordered luminance ranges. |
| 123–144 | 124–125, 127–143 | S/O: GLSL exposes the exact safe packed HDR grade contract. |
| 146–170 | 147–169 | S/O: WGSL mirrors exact HDR masks, safety guards, and composite order. |
| 172–184 | 182 | grade oracle + backend source: neutral HDR grade preserves representative linear samples. |
| 186–208 | 206 | grade oracle + backend source: every control min/max combination stays finite. |
| 210–222 | 219 | grade oracle + backend source: lift and gain primarily affect their matching channel. |
| 239–252 | 241–243, 245–251 | S/O: the bright pass tests EXPOSED luminance on all three backends, output scene-referred. |
| 254–272 | 261, 266, 268–271 | grade oracle + backend source: exposed-units threshold keeps the shipped bloom at default knobs, and EXPOSURE now moves it. |
| 274–302 | 279–280, 282–285, 288, 290–294, 296–297, 300–301 | S/O: the mirror / PiP inset takes the composite's colour grade and dither on all three backends. |
| 305–343 | 322, 329–330, 336–337, 339 | CamTune: post identity gates skip only exact-neutral work and preserve active sample arithmetic. |

## tests/unit/import-hardening-apxc1.test.mjs

Targets: js/camera/offsets.js. Evidence V. VM store and fake teams; equal paste/decoded caps cause oversized JSON fixture to hit paste limit first, so it does not isolate decoded-size gate.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 39–44 | 41–43 | CamTune: CamTune exports the APXC1 paste/decode ceilings used by decodeShare. |
| 46–57 | 51, 54–56 | InputBindings, CamTune: a normal APXC1 share still round-trips under the size caps. |
| 59–70 | 63–64, 68–69 | CamTune: decodeShare refuses an oversized paste before JSON.parse (#3560 F1). |
| 72–80 | 76, 78–79 | CamTune: decodeShare refuses an oversized APXC1 paste before base64 work (#3560 F1). |
| 82–95 | 91, 93–94 | CamTune: decodeShare refuses JSON whose body exceeds MAX_DECODED_BYTES (#3560 F1) (paste gate may win). |
| 97–105 | 102–104 | CamTune: importText surfaces too-large from decodeShare without wiping stores. |

## tests/unit/import-models-workflow.test.mjs

Targets: .github/workflows/import-models.yml. Evidence S/P. Workflow text and extracted shell in disposable local git repositories; no Actions dispatch, external download or remote live branch mutation.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 12–18 | 13–17 | S/P: imports serialize by their output branch across source refs. |
| 41–55 | 50–51, 53–54 | S/P: dispatch inputs enter shell only through environment variables. |
| 57–61 | 58–60 | S/P: the download step accepts only a quoted HTTPS URL. |
| 63–69 | 64–68 | S/P: the commit step validates and quotes a non-deploy branch. |
| 71–82 | 76–81 | S/P: model imports check the generated shell and commit without a bump. |
| 84–128 | 89–91, 115–117, 120–121, 124, 126 | InputBindings, CLI/shell: 15-F9: the bot never force-pushes a branch it did not create. |

## tests/unit/import-models.test.mjs

Targets: tools/gen/import-models.mjs; tools/gen/assets.mjs; js/render/shared/assets.js; tests/helpers/ax26.mjs. Evidence P/V. Generated tiny glTF/bin/PNG palettes, real importer subprocess and shipped AX26 decoder; not arbitrary third-party asset or rendered material quality.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 73–119 | 82, 85–87, 96–97, 99, 102, 107–108, 112, 114–115 | CLI/shell: import-models bakes gltf+bin+atlas into AX26 with sampled colours. |
| 141–195 | 184, 187, 190–191 | CLI/shell: import-models samples indexed (colour-type 3) Kenney-style colormaps. |
| 197–220 | 207, 216, 218 | CLI/shell: --scale keeps a kit's relative sizes: a uniform metres-per-unit factor when --height is 0. |
| 222–309 | 272, 274–275, 279, 296–297, 299–306 | CLI/shell: import-models reads each palette once per file without changing factors or traversal order. |

## tests/unit/incident-gate.test.mjs

Targets: js/physics/incident-sim.js; js/physics/contact-geometry.js; js/race/race-control.js. Evidence V/O/S. Minimal cars/tracks and stubbed DebrisWorld; scripted poses test ownership, boundary/writeback and handback, not Rapier collision simulation. Algebra-only cases validate local fwd/inv oracle.

Shared/module-level assertion spans: 284, 287 (fixture helpers/oracle extraction; inherited by calling cases).

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 75–85 | 81–84 | IncidentSim: r2-only config: a car-car launch at relV >= R2_CAR_V queues AND promotes as r2. |
| 87–97 | 95–96 | IncidentSim: r2-only config: an r3-band contact promotes NOTHING — no widened authority. |
| 99–105 | 104 | IncidentSim: sub-threshold relV never queues, even with every flag on. |
| 107–113 | 112 | IncidentSim: all flags off: fully inert. |
| 115–121 | 120 | IncidentSim: default config unchanged: a relV=30 pair still resolves as r2. |
| 123–133 | 130, 132 | IncidentSim: incident window scales with time, not car count. |
| 135–148 | 145–147 | IncidentSim: an incident-owned lapped car takes the existing chequered flag at the line. |
| 150–170 | 166, 168–169 | IncidentSim: postStep clamps lateral x to wallAt during takeover. |
| 172–189 | 185, 187–188 | IncidentSim: a car flying outward past wallAt does not trip the teleport guard (bug-hunt 7.1). |
| 191–200 | 196, 199 | IncidentSim: postStep hands a finished car back instead of tracking it. |
| 229–240 | 234–237 | V/O/S: promote -> handback round-trips speed and vLat, at any heading. |
| 242–253 | 246–247, 249–252 | V/O/S: the old hypot handback loses the sign — the defect this replaced. |
| 255–263 | 258–259, 261–262 | V/O/S: a lateral-only promote survives the round trip instead of being zeroed. |
| 265–271 | 266–270 | V/O/S: the shipped handback uses the inverse, not hypot, for speed and vLat. |
| 291–297 | 295–296 | V/O/S: a settled wreck drifting slightly backwards is handed back FORWARD in the retain band. |
| 299–305 | 303–304 | V/O/S: a car still rolling backwards when the window closes keeps its sign at the reverse crawl. |
| 307–317 | 315–316 | V/O/S: an AI spun to face back up the road but travelling forward is handed back forward. |
| 319–327 | 325–326 | V/O/S: a settled human facing back up the road is turned to face it. |
| 337–346 | 343–345 | IncidentSim: promote launches a right slide along the car's right vector (-fz, fx). |
| 348–357 | 355–356 | IncidentSim: handback reads a world drift toward the car's right as +vLat. |
| 363–391 | 383, 389–390 | IncidentSim: an AI car spun round but still sliding forwards is handed back driving forwards. |
| 393–410 | 398–400, 403, 405–406, 409 | IncidentSim: rejection reasons explain threshold, selected kind and ownership without widening gates. |
| 412–417 | 415–416 | IncidentSim: failed dynamic promotion is counted per car. |
| 419–431 | 424–425, 429–430 | IncidentSim: takeover and incident caps report the rejected work. |
| 437–466 | 459, 461–465 | IncidentSim: `takeover uses complete ${kind} boundary (side ${side})`. |
| 471–500 | 484–485, 492, 495, 498–499 | IncidentSim: `takeover retains validated barrier side across raw crossings and moving faces (${side}, lane ${lane})`. |
| 504–525 | 521–522, 524 | IncidentSim: `takeover cannot swap sides through a gantry footprint (${side}, outside ${outside})`. |
| 540–553 | 547–548, 550–552 | IncidentSim: `anomaly handback via ${label} never returns a ${human ? "human" : "AI"} reversing at speed`. |
| 562–574 | 569–573 | IncidentSim: the takeover budget is global across three disjoint clusters of a 22-car field. |
| 576–596 | 583–587, 591–595 | IncidentSim: existing cluster takeovers share the budget with wall strikes and release returns a slot. |
| 598–609 | 603–608 | IncidentSim: failed promotions do not consume slots or hide later cars behind a per-cluster slice. |
| 611–625 | 616, 619–620, 623–624 | IncidentSim: a world-generation handback frees the full budget for the replacement world. |

## tests/unit/incident-rpm.test.mjs

Targets: js/game.js; tools/lib/game-vm.cjs. Evidence S/V. Early-return source contract plus VM rival speed change; does not listen to GameAudio/RivalAudio or verify audible pitch.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 21–27 | 23, 25–26 | S/V: updateCar incident early-out refreshes rpm like net-owned rivals. |
| 29–49 | 34, 44–45 | S/V: incident-owned car: rpm tracks speed each tick, not a stale crossing note. |

## tests/unit/init-owner-resize-observer.test.mjs

Targets: js/render/gfx.js; js/render/shared/canvas-css-size.js. Evidence V. Fake Element/ResizeObserver validates observed target identity; does not trigger real ResizeObserver resize callbacks.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 40–46 | 44–45 | V: the init-owner canvas lease is observable by ResizeObserver (real element reaches observe). |
| 48–52 | 51 | V: a plain canvas still observes itself. |

## tests/unit/input-bindings.test.mjs

Targets: js/input/bindings.js; js/input/input.js; js/input/hold-buttons.js. Evidence V. Bindings factory callbacks and fake keyboard/DOM rig; no browser trusted event or physical gamepad.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 39–49 | 43–48 | InputBindings: claiming a key another action held clears the displaced slot and reports it. |
| 51–59 | 55–58 | InputBindings: claiming a pad button another action held clears it and reports the conflict. |
| 61–69 | 63–65, 67–68 | InputBindings: reserved keys and pad steer buttons are refused; same-slot rebind is a no-op conflict-wise. |
| 71–78 | 75–77 | InputBindings: moving a key onto the same action's other slot clears the duplicate without a foreign conflict. |
| 82–98 | 84–85, 88–89, 93–97 | InputBindings: resetKeys and resetPad restore shipped maps; isDefault tracks drift. |
| 100–112 | 106–108, 110–111 | InputBindings: clearPadBinding notifies onPadBindingChanged (parity with clearKeyBinding → onKeysChanged). |
| 116–165 | 125–128, 132–135, 144–147, 151–153, 161–164 | InputBindings: key and pad maps round-trip; malformed / old-shape entries degrade safely. |
| 167–172 | 171 | InputBindings: setPadMap notifies so a loaded custom map cannot leave a held pedal latched. |
| 176–185 | 178–184 | InputBindings: keyLabel reads like a keycap; Shift/Ctrl sides collapse. |
| 187–213 | 189–191, 194–196, 199–201, 205–207, 209–210, 212 | V: padLabel follows auto-sniffed brand, and setPadLabelMode overrides it. |
| 217–231 | 226–230 | V: InputBindings.parseHoldMode round-trips and rejects junk. |
| 279–291 | 282, 284, 286, 288, 290 | Input: keyboard GAS toggle: tap on, tap off; rebind clears. |
| 293–311 | 305–306, 308, 310 | Input: Input.init is idempotent: a second call refreshes callbacks without stacking key listeners (D·W18d). |
| 313–321 | 316, 318, 320 | Input: keyboard LOOK BACK toggle mirrors GAS semantics. |
| 323–330 | 326, 328–329 | Input: setHoldMode clears a live keyboard toggle. |

## tests/unit/input-clock-rotate.test.mjs

Targets: js/input/input.js; tests/helpers/key-binds-rig.mjs. Evidence V. Owned performance clock and synthetic phone/orientation/blur events; not device sensors or wireless timing.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 19–25 | 21–24 | V: hit-stop slows the live steering ramp with the sim clock; bad scales fall back to 1. |
| 27–37 | 36 | Input: the fixed-step ramp (Input.steer(stepDt)) is the sim's own clock and ignores the time scale. |
| 39–53 | 47, 51–52 | Input: a screen rotation restarts the tilt filter but keeps the calibrated zero. |
| 55–67 | 61, 64, 66 | Input: a window blur is not a phone-controller loss: no onPadLost edge for a link that is still alive (B·H20). |
| 69–80 | 76, 79 | Input: a re-paired phone's tilt starts from its own reading, not the lean the last link held (B·H20). |

## tests/unit/input-ghost-replay-vm.test.mjs

Targets: js/car/input-ghost.js; js/race/session-records.js; js/game.js; js/race/overtake-mode.js. Evidence V. Game VM fixed-step traces and stubbed native controls; different-seed check asserts finite movement, not divergence, despite anti-vacuity comment.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 40–87 | 42, 64–66, 73–75, 77, 79–80, 86 | InputGhost: InputGhost open-loop pack replays identically under one seed; seed 7 only checked for movement. |
| 89–135 | 114–121, 123, 130–133 | InputGhost: native TT fixed-tick tape captures lossless pedals, initial state and auxiliary edges without changing input authority. |
| 137–162 | 145, 148–150, 155, 157, 160 | InputGhost: native tape starts at the next fixed boundary after a lap crossing and settings changes spoil capture. |
| 164–187 | 176–177, 179–180, 182, 184–185 | V: real fixed-tick OT never drains on coast or current brake and toggles off without a stale free push. |

## tests/unit/input-ghost.test.mjs

Targets: js/car/input-ghost.js; js/core/store.js; js/game.js; js/race/session-records.js. Evidence V/S. Map-backed storage, fake revision/build, idle scheduling and Array allocation interception; exact payload behavior, not browser quota capacity, heap measurement or physics replay.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 71–86 | 74–78, 80–85 | InputGhost: InputGhost records fixed-timestep inputs with seed and version. |
| 91–101 | 95–100 | InputGhost: InputGhost drops a lap left open past MAX_LAP_S; a lap under it still records. |
| 103–121 | 107, 110–113, 117–119 | InputGhost: InputGhost atStep / next replay the quantized open-loop inputs. |
| 123–134 | 127, 129–130, 133 | InputGhost: InputGhost refuses a replay when physRev or build drifts. |
| 136–151 | 139–143, 146, 148–150 | InputGhost: InputGhost keeps the faster lap and persists under GameStore. |
| 157–175 | 160, 164–166, 169–172, 174 | InputGhost: an incompatible stored ghost does not block the record test (REVISION flip). |
| 179–205 | 184, 186, 188, 191–192, 196–197, 200, 202, 204 | InputGhost, InputBindings: a foreign tab's input ghost survives this tab's save (two harnesses, one disk). |
| 207–222 | 212–213, 216, 220–221 | InputGhost, InputBindings: flush preserves a faster foreign PB over a pending local lap through reload. |
| 224–244 | 231, 236, 241, 243 | InputGhost, InputBindings: a failed flush retains pending laps across a foreign write for a later retry. |
| 246–268 | 250, 255, 259–260, 264–267 | InputGhost: clear(track) removes all contexts and their pending writes but preserves other tracks. |
| 270–289 | 273, 276, 278, 282–284, 287–288 | InputGhost: clear supports exact context keys and resets a cleared active replay. |
| 291–303 | 294–295, 300–302 | InputGhost: clear() removes every pending input ghost and resets replay state. |
| 305–317 | 307–312, 314–316 | InputGhost: quantizeSteer / packFlags are stable helpers. |
| 319–329 | 322–326, 328 | V/S: game.js and session-records wire InputGhost beside pose Ghost. |
| 331–348 | 337–340, 343–347 | InputGhost: v2 pedal travel survives serialization and legacy v1 remains binary. |
| 361–382 | 363–364, 367, 369, 371–373, 375–376, 381 | InputGhost: 150-second native v3 tape persists losslessly inside unchanged 256KiB budget. |
| 384–398 | 386–389, 394–395, 397 | InputGhost: oversize native tape is refused before evicting a persisted best; quota is explicitly session-only. |
| 401–432 | 414, 417, 419–422, 428, 430–431 | InputGhost: 150-second mixed analog lap keeps all channels exact with sparse braking/coast storage. |
| 434–449 | 440, 442, 444–445, 447–448 | InputGhost: Short idle callback reschedules PB persistence, long idle callback saves it; title mentions cap but no timeout-cap callback is invoked. |
| 451–466 | 454, 465 | InputGhost: the trimmed store on disk is byte-identical to a fresh whole-store pack (#3109). |
| 497–530 | 503–504, 506, 508–509, 512–515, 517–519, 523–524, 526, 528–529 | InputGhost: twenty unselected 36000-step compact tapes stay packed on load, foreign refresh and save. |
| 532–547 | 541–546 | InputGhost: compact LRU trimming keeps valid unrelated tapes and enforces the exact byte cap. |
| 549–572 | 554, 561, 564–565, 568–570 | InputGhost: foreign compact merges preserve compatible winners, stamps and pending retry payloads. |

## tests/unit/input-hud-properties.test.mjs

Targets: js/input/input.js; js/ui/hud-readouts.js; tests/helpers/key-binds-rig.mjs. Evidence V. fast-check 300 samples per property; bounded settings/axis/seconds domains, fake pad, no exhaustive real device response.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 37–44 | 40–42 | V: stick response is odd-symmetric, bounded and finite at every DEAD ZONE / SATURATION. |
| 46–51 | 49 | V: stick response is monotone: more deflection never steers less. |
| 53–59 | 55, 57 | V: inside the dead zone the stick is centred; past the saturation edge it is full lock. |
| 61–66 | 64 | V: leaving the dead zone is continuous: a hair past it steers a hair, never a jump. |
| 76–88 | 79–80, 82, 86 | V: gap chip magnitude: unsigned, within its printed precision, monotone. |
| 90–102 | 93–96, 99–100 | V: REL/tower gap: the sign is the direction, the length is bounded, 99+ past the board, -- for no number. |

## tests/unit/inputs-hash.test.mjs

Targets: tools/ci/inputs-hash.mjs; tools/ci/geometry-paths.mjs; .github/workflows/ci.yml. Evidence P/S. Current checkout plus synthetic staged git tree/symlinks/modes; cache-key invalidation and workflow text, not real CI cache hit correctness.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 20–25 | 21, 23 | CI input hash: JOB_INPUTS names the tree-only jobs the plan lists. |
| 27–30 | 29 | CI input hash: guards path set covers what Structural guards / tooling-fast read. |
| 32–39 | 34, 37–38 | CI input hash: sweeps-parts path set covers the parts-census roots (geometry-paths PARTS_ERE). |
| 41–50 | 44–45, 47, 49 | CI input hash: inputsHash is stable for the same tree and changes when a declared file changes. |
| 52–57 | 54–56 | P/S: expandInputPaths walks directories and skips missing leaves. |
| 59–69 | 60–62, 64, 67–68 | CI input hash: ci.yml wires lookup-only verdict cache for guards shards and honours NO_MEMO. |
| 72–126 | 93, 96, 98, 102, 105, 108, 110, 112, 114, 117, 121, 123, 125 | CI input hash: guard keys cover tracked configuration, helpers, assets and symlink identity. |

## tests/unit/install-chip-overlap.test.mjs

Targets: css/overlays.css; tools/lib/hud-geometry.mjs. Evidence S/G. CSS-source formulas and hard-coded measured rectangles; no current browser cascade/layout assertion.

Shared/module-level assertion spans: 29, 32 (fixture helpers/oracle extraction; inherited by calling cases).

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 35–40 | none (helper-mediated) | S/G: tall title keeps the one-tap INSTALL lift (title-menu-even contract). |
| 42–55 | none (helper-mediated) | S/G: compact-wide / live-wide lift INSTALL two (tap+gap) rows above home-motion. |
| 57–66 | none (helper-mediated) | S/G: compact-wide with ios-install parks INSTALL above the Add-to-Home banner. |
| 68–95 | 76–78, 82–83, 87–88, 90–94 | geometry: 844×390 before/after geometry: one-tap stack vs two-row / above-banner clear. |
| 97–109 | 101, 103–108 | S/G: landscape lift formulas live in the #install-chip region of overlays.css. |

## tests/unit/ios-input-zoom-w25e.test.mjs

Targets: css/appearance-studio.css; css/race-setup.css; css/tuner.css; css/tokens.css. Evidence S. Default-scale parsed font-size floors only in three sheets; ignores inherited font rules without declarations and does not run iOS Safari focus/zoom.

| Case range | Assertion spans | Target / meaning |
|---|---|---|
| 90–100 | 95–99 | S: appearance-studio text inputs / selects use an explicit 16px floor. |
| 102–124 | 122–123 | S: OWNED free sheets: every text-input font-size rule floors at ≥ 16px. |

## Parameterization and non-vacuity notes

- incident-gate registers six boundary kinds × both sides (12 cases), moving barrier sides × lane sides (4), gantry sides × outside/inside (4), and reset/finished anomaly paths × human/AI (4). These share the mapped template registration/assertion ranges; loop inputs are in 435–558. Other registration rows execute once.
- install-chip helper `has`/`lacks` asserts outside test callbacks; their source-rule cases inherit these calls. The geometry row uses historical supplied rectangles rather than evaluating CSS.
- image-grade extracts source values into its oracle and compares backend constants; its fwd/color arithmetic is independently calculated JavaScript and partial CPU TSL emulation. No GPU statement follows.
- input-ghost replay compares selected player state/detailed native fixed-tick traces, not the whole game state. InputGhost compact allocation assertions intercept explicit long Array creation only, not total memory use.
- input-hud-properties uses 300 random cases per property. The assertions set domain/tolerance bounds and do not prove an exhaustive mathematical result.
- i18n detection title mentions navigator fallback, but the case directly asserts query then saved preference. Russian/Arabic behavior depends on Node Intl data.

No execution evidence was produced.
