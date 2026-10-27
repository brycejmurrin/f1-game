# Unit tests group 04 — complete source map

Scope: all 21 exact paths in unit-batches.json group 04, 4,584 lines, 207 test declarations and 887 assertion calls inside their callbacks (loop-generated cases retain source templates). Fully read; no test suite, browser, source edit or commit was performed. These are asserted contracts, not passing results. Snapshot: HEAD 8a222466bc83de7cdbe6a42989f19f7824ce4c06, branch cursor/project-map-a84f, 2026-10-27 UTC.

## Read ledger

SHA-256 covers raw file bytes. Inclusive ranges cover every line. The first oversized manifest output was not used as a read ledger; group 04 was then extracted alone. All test reads were bounded and nontruncated; body-styles and build-worker were split explicitly.

| File | Read ranges | SHA-256 | Test declarations |
|---|---|---|---|
| `tests/unit/body-styles.test.mjs` | 1–300, 301–600, 601–886 | `b2a2b04446e56c1da41f26a14625917bb568a39c08acf769578be160350e1d74` | 35 |
| `tests/unit/boot-idle-prefetch.test.mjs` | 1–330 | `a232c66297d63e3da24605655a3a1d1585414baee3bf3920dbfdf2aff2a7d60d` | 9 |
| `tests/unit/boot-input-shape.test.mjs` | 1–180 | `182a1d13acc8354b395f0fb4e7c42dc47dfa1ebbd1c137b1a64e5b19d5265e6d` | 5 |
| `tests/unit/boot-load-budget.test.mjs` | 1–84 | `4d4c7ae5733772c344bb01bca10a786aab42da18a53bfc6cb402c3e88ff44709` | 3 |
| `tests/unit/boot-script-repair-overlay.test.mjs` | 1–98 | `ea1e21237ce8a9bc232f8e2cb0436f2d47ba9c1b75b7582a89d4bdc5b89f56b0` | 4 |
| `tests/unit/bootstrap-doctor.test.mjs` | 1–223 | `46433da96466d3034e2724e9a3af019ebd8ace126cefef19dcdd660ae4d59982` | 14 |
| `tests/unit/brake-cue.test.mjs` | 1–147 | `c18ce3b13451259947d2f60ccfcf9ba5865a0ca3b0668a44445ea058aff20477` | 10 |
| `tests/unit/branch-audit.test.mjs` | 1–150 | `87011ad6c6e87bc7ee85748e4ee3ea81542ecf3d46b5e4eb1742541d9c3069ee` | 9 |
| `tests/unit/browser-http-mcp.test.mjs` | 1–141 | `bff917fddcef23e1f049aeb5c7b5f700ef3c873fcf2a55f11a80915f69100887` | 5 |
| `tests/unit/browser-http-up.test.mjs` | 1–15 | `80a5acc617ce10f88b6438c2d8a6f989640ecc496e9db9bbe5dc929d0c46083f` | 2 |
| `tests/unit/browser-workers.test.mjs` | 1–149 | `eb69a1e7a49d467ed249ae20f7ba8c926ade8f60acd56e55cef35fcd71323af2` | 11 |
| `tests/unit/build-client-drop.test.mjs` | 1–259 | `ead1a4f32f77b94f198b3e0f2c28e9c679c91d3d81ef4762f4cb0e073a11dde0` | 14 |
| `tests/unit/build-gallery.test.mjs` | 1–97 | `4dbb518a624166784d93452396bd82f0e36b53a78c5767d1ccc8bf2f7516c67c` | 9 |
| `tests/unit/build-steps.test.mjs` | 1–239 | `6df5cb42fa1f833f04de9118843d88c6e81e26bd8180bfd16791c673f5d29b55` | 8 |
| `tests/unit/build-worker.test.mjs` | 1–250, 251–500, 501–750 | `0c91c52ec6cdc14efc9b44e2d1695c6d1dbece047b5bfb42aef0d2747fde2df4` | 28 |
| `tests/unit/cam-avoid-vm.test.mjs` | 1–131 | `8e049da01e74813c4caa8a179620398d0ea3d6f817deeb8284b0dd547bfc1769` | 5 |
| `tests/unit/cam-avoid.test.mjs` | 1–123 | `cf3860f23449f32c9fdd8219577f942cd03b4442e3bee3519e15d7d2247f5bd7` | 7 |
| `tests/unit/cam-comfort.test.mjs` | 1–167 | `8654b8797b0763b5bd9bd84593faf97563e0aa001060f3cb8975da348fcd157f` | 11 |
| `tests/unit/cam-context-alloc.test.mjs` | 1–94 | `764be7e791d2222bc1f2408e819ba7fceb6d5a446a5c60940c78f9072a4a1964` | 5 |
| `tests/unit/cam-motion.test.mjs` | 1–36 | `b7ef9198e14816c2f5f7c2da90ce34c3801064b9b71147f8bb934c9173edab0a` | 2 |
| `tests/unit/cam-round2.test.mjs` | 1–285 | `692de4c1ea6be5dfa5d2ce564fd5570e009000ba815573776e7712742e152b33` | 11 |

## Navigation and shared evidence

Read root AGENTS.md and .claude/skills/code-nav/SKILL.md. Local code-nav shell (bash tools/mcp/lsp-mcp.sh def) resolved Car3D.bodyStyleKey/bodyAnchors/buildComplete, CarMesh.carDecalData, LazyBundles.create, RendererBoot.create, Assets.load, Teams.sanitizeCustom, BrakeCue.create, TrackBuildClient.build/replay, Tracks.buildSteps/buildPaced, CamAvoid.applies, CamComfort.boot, CamTune.get, GameCams.vantage and ExtraRigs.resetAuto. Car3D.bodyAnchors resolves an export/alias rather than its underlying body. Car3D.buildComplete, CarMesh.carDecalData, Tracks.buildSteps and CamTune.get were explicitly reported as module-file fallback with export/caller coverage unverified. Underlying CarBodyGeom.bodyAnchors and BrakeCue.urgencyOf bodies were then resolved; both carry the same module-file fallback limitation. Remaining tool and hook targets are linked by actual import/source reads; code-nav permits text navigation outside js/. No remote LSP checkout is assumed identical to this checkout.

The complete shared camera-rig helper was read: real CAM_FILES are drive-chase, drive-broadcast, drive-onboard, feel, extra-rigs and vantage; synthetic Tracks uses4m nodes, interpolated samples/curvature and zero banking. CamTune is a stub with default lead/hang but no real stored offsets. abs-src supplies VM filenames, not behavior. Track build-context and game-vm fixtures execute repository modules without browser GPU evidence. Detailed helper and production limits are stated per file below.

## Additional source/fixture evidence ledger

These bounded source reads and LSP anchors support navigation and the coverage limits. A definition-only entry is not a claim to have read its full production file. Hashes identify the full raw source file containing each range. The initial combined production-source output had a truncated middle; the browser handler tail, branch-audit ranges, tunnel decision and gallery ranges were reread separately before use.

| Source | Read ranges or definition anchors | SHA-256 |
|---|---|---|
| `AGENTS.md` | 1–end (tail reread 120–end after initial bounded root read) | `b40fcb879153ce1c19bd2fe13aeaa771a21faa31b04d679828b01684b8295422` |
| `.claude/skills/code-nav/SKILL.md` | 1–end | `ec73c911fa39f0d724037ee74bb963ac6208232a86a3ba33057d28eaa2da1353` |
| `tests/helpers/camera-rig.mjs` | 1–end | `705ccb3e3842a23666a181abe1204fe6f59a03db8d1b9855660ee1924920f1be` |
| `js/car/car3d.js` | 157–159 (LSP body); definition/export anchors 211, 2867, 2888, 2891 | `d2ca91950cf1e65dc4161bda35b23148b409095016ed6618ca8ff7d0f714483e` |
| `js/car/car-body-geom.js` | 1787–1801 (LSP body) | `64e03e1a29424dc31a400125dd58c08d4cc6bb49b5600b61f9922b9774df4ecf` |
| `js/physics/brake-cue.js` | 28–38 (LSP body); create definition57 | `8b707cb2bbb924f7af1d2da59c79583ee0d9b79769501182370680a64a5ca09b` |
| `js/core/lazy-bundles.js` | definition5/export840 (LSP) | `1a25b67bbb1041ef6d4d50cf1c988d101b9ec9026993cb930ff1accec9660e52` |
| `js/render/renderer-boot.js` | definition32/export531 (LSP) | `558313586a3d86144929fa667f5cb608d8b5a43867852febcc332fa13d2757e6` |
| `js/render/shared/assets.js` | definition596/export1006 (LSP) | `825cbd606a5813b64c71460c4308d175f6afface9551461c558339e4592431cf` |
| `js/data/teams.js` | definition364/export393 (LSP) | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| `js/track/build-client.js` | 140–240; LSP definitions178,267/export451 | `77dc8b5e2ca3309594bd2aa172b27ba94d458c6e1695719ed6cba75ce3f504e0` |
| `js/track/tracks.js` | LSP definitions287,493/export859 | `62abbda18aae41e6e016b4fdc1a6dbd346810f72c92058521405fd0b7149f9bb` |
| `js/camera/cam-avoid.js` | 1–98 (complete) | `5ac7a7579ae89f2a941d600a32e02fd9089f4491282d397879fcd400b5ccabd6` |
| `js/camera/cam-comfort.js` | 1–132 (complete) | `a7aecf8ea6e9e78a794c17412613ce25fae02d88445e7f231ce05f7fd869a357` |
| `js/camera/vantage.js` | 790–845; LSP definition441/export966 | `21282adf2988d472d5130f49fb1d45e0e7ba4a5afdabfb0902ae204ae7167b11` |
| `js/camera/extra-rigs.js` | 130–175; LSP resetAuto249/export324 | `81573fd42bb72613dcf325770e961597b04997b643f612ecf209847e45d45872` |
| `js/camera/offsets.js` | 270–330; LSP get267 (module fallback) | `d632655e71861cf92db8c83be426a16e8ed6742649729e87dc62b03f2a5a75a3` |
| `js/car/car-mesh.js` | LSP carDecalData36 (module fallback) | `c13a3031510b4f20ac8c658c300a2e8bcee98f0599c658c5fd59d80deae28003` |
| `tools/car/parts-sweep.mjs` | 96–132 | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| `tools/car/car-fit-audit.mjs` | 1–59 | `ad152bf485c64915653e439bac77caf133e855097109cf3d2dd6dd6b3a2e60c9` |
| `tools/check/doctor.mjs` | 54–201 | `336f523e6cb01700041a0b212cb5276f98bc37cb07ec05afbe551c4b2a30b57c` |
| `tools/mcp/browser-http.mjs` | 59–290 | `f56076f597bb09f0ef3aaba80df200e0c4c53f89f603d05028e96f7c364fe6e2` |
| `tools/mcp/browser-http-up.mjs` | 26–36 | `86edbe2350549e8b0f9f0c73ed2354c3b589979e69d82bdc473cf615ac949f18` |
| `tools/ci/branch-audit.mjs` | 49–140,166–202 | `a6ffcbe8e0b583b2fbb229cf1c6554e2219911e417c0942574cc8ac685e2ad10` |
| `tools/track/build-gallery.cjs` | 127–165,240–261,453–530 | `54529e8707fdaf6c85aceb9d95e7eb25f9bd6f04cc864297f5bbd0e95faa8236` |
| `tools/lib/screenshot-gallery.cjs` | 1–end (complete) | `d1a259d1a2644664b801ac37376e671038fa7027e64c9f5174ba456226aabdc4` |
| `tools/shot/cam-motion.mjs` | 93–144 | `01af8f3d8bc256531594797a908814a1c20b22116b8547eac7fcd9af24069f40` |
| `tools/lib/browser-workers.mjs` | 1–end (complete) | `b9f05f59083a66d78db43b12001ec9858dabe74c54b45ea902837ad2d2d679b8` |

## Proven stale or overbroad commentary

- cam-comfort.test.mjs:1 still calls this a touch/XR auto comfort preset. Actual boot at js/camera/cam-comfort.js:108–116 ignores navigator.xr and removes legacy on from non-touch stores with rawDel; the later tests explicitly require this. detectXr capability detection remains supported, but XR auto activation is not the current boot policy. Source header “A stored choice always wins” and boot JSDoc “No-op when the key is already set” also omit this implemented legacy cleanup exception.
- boot-input-shape.test.mjs:1–18 describes three readers. The file now additionally tests debris latch reset and a fifth reader (steerMode) at its end. This is historical scope framing; the individual contracts remain explicit.
- cam-avoid-vm.test.mjs pit-wall introduction describes absence from CamAvoid.MODES as the historical problem. Current MODES still contains only heli/side/cinematic/low (js/camera/cam-avoid.js:11), while pitwall clearance is now implemented independently by ExtraRigs.pitWall re-siting toward the kerb (js/camera/extra-rigs.js:132–163), rather than adding pitwall to that list or lifting it. Read this paragraph as defect history, not present routing.
- cam-round2 C7 title promises a20–110 clamp; actual predicate checks only maxFov≤110. Source vantage.js:817–818 intentionally preserves a pre-existing lens outside the range (trackside18°) while bounding added motion. The test covers four selected modes, not universal lower and upper clamping.
- cam-motion test/title says each camera moves differently. The checker at tools/shot/cam-motion.mjs:93–144 deliberately requires many eyes to stay fixed and asserts selected ordering/motion relationships, not all18 pairwise signatures.

Historical measured counts/MB/timing in introductory comments were not remeasured and are not declared stale merely because they are dated.

## body-styles.test.mjs

Production targets: Car3D.bodyStyleKey (js/car/car3d.js:157), bodyAnchors (alias from CarBodyGeom at :211), buildComplete (:2867); CarMesh.carDecalData (js/car/car-mesh.js:36), CarShade, Parts/Teams, Liveries.FIELDS; js/car/custom-liveries.js and js/garage/setup-camera.js copy-list source guards.

Fixtures and inputs: loadParts() loads actual car IIFEs in isolated flat and CarShade-enabled realms (tools/car/parts-sweep.mjs:96–125); Ferrari factory tiers are the common reference. ENGINES combines all factory tiers with visual catalog engines; each() crosses bodies, engines and rounding. Other matrices explicitly restrict to available engines, extreme synthetic recipes, standard/dorsal spines or selected teams. skinSection/verticalHits inspect emitted triangles; emittedNoseSupports reconstructs connected wing supports; detailPoints selects painted vertices; auditMesh supplies GAP/PENETRATION observations. No canvas or renderer is involved.

Contracts and coverage limits: Pins body lookup/fallback and concept-only picker IDs, nose flag types, finite and distinct hull/anchor changes, livery propagation, droop floor, pod clamp envelopes, mirror/nose/hoop fit; authored study and expanded/sculpted body silhouettes, winding/closed skins, triangle/accounting ceilings, painted details, wing supports, T-wing/floor clearance, matching aero IDs/stat equivalence, decal UV continuity and stripe drape. Each exact test and predicate appears below. All-engine assertions are only as broad as their explicit fixtures; named point/station bounds do not establish complete surface collision freedom. Byte accounting uses four bytes per numeric entry and is not heap profiling. Paint masks can omit unpainted geometry; no GPU appearance, texture rasterization, physics drive or full-car fit beyond named audit rows is proven.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L33–42: **bodyStyleKey: a known body wins, anything else is the team's own**

```js
// L34
assert.equal(Car3D.bodyStyleKey("ferrari", "needle"), "needle");
// L35
assert.equal(Car3D.bodyStyleKey("ferrari", "mclaren"), "mclaren");
// L36
assert.equal(Car3D.bodyStyleKey("ferrari", v), "ferrari");
// L39
assert.equal(Car3D.ALLOW_TEAM_BODY_SWAP, false);
// L40
assert.deepEqual([...Car3D.BODY_STYLE_IDS].sort(), [...Object.keys(Car3D.BODY_STYLES)].sort());
// L41
assert.ok(!Car3D.BODY_STYLE_IDS.includes(id));
```

- L46–53: **nose shape flags keep one type each across every body**

```js
// L48
assert.ok(s.noseSculpt === undefined || typeof s.noseSculpt === "boolean");
// L49
assert.ok(s.noseCurve === undefined || (typeof s.noseCurve === "number" && s.noseCurve > 0));
// L51
assert.ok(!(s.noseSculpt && s.noseCurve));
```

- L55–81: **every body builds a finite car whose hull differs from the team's own**

```js
// L63
assert.ok(d.pos.every(Number.isFinite));
// L66
assert.ok(moved >= 0.05);
// L75
assert.ok(outline >= 0.04);
// L79
assert.ok(rb.pos.every(Number.isFinite));
// L80
assert.equal(Car3D.bodyStyleKey(team.id, "redbull"), "redbull");
```

- L83–90: **decal anchors follow the body the mesh is built from**

```js
// L87
assert.notEqual(a.key, own.key);
// L88
assert.notDeepEqual(a.noseAt(2.1), own.noseAt(2.1));
```

- L92–98: **no concept body lowers the flap solver's nose-droop floor**

```js
// L97
assert.ok(worst(Object.values(Car3D.BODY_STYLES)) >= worst(teams));
```

- L115–131: **every body x engine: pod top above bottom, outer edge outboard, undercut in the team envelope**

```js
// L130
assert.deepEqual(bad.slice(0, 12), []);
```

- L133–151: **the pod clamp never binds on a grid car (team stations clear every floor)**

```js
// L150
assert.deepEqual(bad.slice(0, 12), []);
```

- L153–164: **every body x engine: the pod shoulder stays under the mirror housings**

```js
// L163
assert.deepEqual(bad.slice(0, 12), []);
```

- L166–182: **every body: the nose meets the tub and clears the front-wing flap ceiling**

```js
// L176
assert.ok(Math.abs(last.z - -9) < 1e-9 && Math.abs(n.noseAt(tub.z).bottom - (root.y - root.h / 2)) < 1e-9 && Math.abs(n.noseAt(tub.z).top - (root.y + root.h / 2)) < 1e-9);
// L178
assert.ok(n.noseAt(tub.z).side * 2 <= tub.w + 1e-9);
// L179
assert.ok(n.noseAt(z).bottom >= floor[i] - 1e-9);
```

- L184–197: **every body x engine x spine: the engine cover stays under the roll hoop**

```js
// L196
assert.deepEqual(bad.slice(0, 12), []);
```

- L199–203: **bodyStyle is a published livery field and the garage's copy list carries it**

```js
// L200
assert.ok(Liveries.FIELDS.includes("bodyStyle"));
// L201
assert.match(fs.readFileSync("js/car/custom-liveries.js", "utf8"), /"bodyStyle"\]/);
// L202
assert.match(fs.readFileSync("js/garage/setup-camera.js", "utf8"), /SP_HULL_GEOM_FIELDS = \[[^\]]*"bodyStyle"/);
```

- L226–237: **six studies have distinct emitted nose/pod/spine silhouettes with common paint**

```js
// L234
assert.ok(Math.max(...profiles[a].map((n, i) => Math.abs(n - profiles[b][i]))) >= .08);
```

- L255–269: **Blender bodies emit short broad noses with a curved descending crown**

```js
// L261
assert.ok(tipZ >= 2.44 && tipZ <= 2.56 + 1e-9);
// L263
assert.ok(tipWidth >= 0.25);
// L266
assert.ok(top(z0) > top(zm) && top(zm) > top(z1));
// L267
assert.ok(top(zm) - (top(z0) + top(z1)) / 2 > 0.035);
```

- L271–286: **Blender noses carry a broad painted shoulder over the front axle**

```js
// L280
assert.ok(Math.max(...verticalHits(m, m.noseSkin, x, Car3D.AXLES.frontZ)) > 0.43);
// L282
assert.deepEqual(m.pos, plain.pos);
// L284
assert.deepEqual(Array.from(m.col.slice(i * 3, i * 3 + 3)), paint);
```

- L288–326: **study nose, pod and spine skins are closed, consistently wound and sampled by their anchors**

```js
// L294
assert.ok(range && range.to > range.from);
// L310
assert.ok(zs.size >= 9 && zs.size <= 10);
// L311
assert.equal(zs.size, 9);
// L312
assert.equal(count, 284);
// L313
assert.ok(count >= 68 && count <= 300);
// L315
assert.ok(count <= (["caldra", "talven"].includes(bodyStyle) ? 480 : 400));
// L316
assert.ok(volume6 > 0);
// L317
assert.ok([...edges.values()].every((e) => e.count === 2 && e.direction === 0));
// L321
assert.ok(Math.abs(actual - anchors.coverAt(z).top) < 1e-8);
```

- L328–342: **thin study pods keep the accent flash above the sponsor board**

```js
// L338
assert.ok(y>=p.bottom+(p.top-p.bottom)*.82);
// L340
assert.ok(count>0);
```

- L344–353: **Blender noses retain seated wing mounts and suspension roots**

```js
// L349
assert.deepEqual(rows.filter(r=>r.fail && r.a==="frontWing" && ["chassis","aeroFlaps"].includes(r.b)), []);
// L350
assert.deepEqual(rows.filter(r=>r.fail && r.check==="PENETRATION" && r.a==="suspension" && r.b==="chassis"), []);
// L351
assert.deepEqual(rows.filter(r=>r.fail && r.check==="PENETRATION" && r.a==="bodyDetail" && r.b==="sidepods"), []);
```

- L355–369: **Caldra bathtub and Talven waterslide are recessed emitted roofs with different widths and depths**

```js
// L364
assert.ok(datum(.50) - roof(.50) > minimumDepth);
// L365
assert.ok(roof(shoulderU) > roof(.50) + .015);
// L366
assert.ok(datum(.75) - roof(.75) > .03);
// L367
assert.ok(datum(.30) - roof(.30) < .07);
```

- L373–392: **expanded bodies have independent, recognizable profile relationships**

```js
// L375
assert.ok(Car3D.BODY_STYLE_IDS.includes(id));
// L377
assert.ok(tip.side > neck.side * 1.5);
// L378
assert.ok(tip.top - tip.bottom < 0.05);
// L379
assert.ok(at("swan").noseAt(2.78).bottom > 0.39);
// L381
assert.ok(manta.podAt(0.62).x > manta.podAt(-0.62).x * 2);
// L383
assert.ok(wasp.podAt(-0.62).x > wasp.podAt(0.62).x * 1.5);
// L384
assert.ok(wasp.podAt(-0.62).top > wasp.podAt(0.62).top + 0.10);
// L387
assert.ok(scorpion.coverAt(-2).top > scorpion.coverAt(-0.55).top + 0.04);
// L391
assert.ok(blade.top - blade.bottom > blade.side * 3.5);
```

- L394–445: **expanded profiles retain canonical station order, positive sections and bounded mesh streams**

```js
// L416
assert.equal(a.podStations.length, 7);
// L419
assert.ok(a.podStations[i - 1].z > p.z);
// L420
assert.ok(p.outer > p.inner && p.outerTop > p.outerBottom && p.innerTop > p.innerBottom);
// L427
assert.ok(f.top > f.bottom && r.top > r.bottom);
// L430
assert.ok(Math.abs(top - crowns[1][i]) < 1e-12);
// L438
assert.ok(d.idx.length / 3 <= bodyTriangles);
// L439
assert.ok(accountingBytes(d) <= bodyBytes);
// L440
assert.ok(c.idx.length / 3 <= ceiling.completeTriangles);
// L441
assert.ok(accountingBytes(c) <= ceiling.completeBytes);
// L443
assert.equal(JSON.stringify(Car3D.AXLES), reference);
```

- L448–476: **expanded pod sections stay open across every team's available engine and extreme recipes**

```js
// L468
assert.ok(p.outer - p.inner >= 0.08 - 1e-12);
// L469
assert.ok(p.outerTop > p.outerBottom && p.innerTop > p.innerBottom);
// L473
assert.ok(inlet.x - inlet.inner >= 0.08 - 1e-12);
```

- L513–543: **expanded wing supports penetrate the nose while retaining their lower wing mounts**

```js
// L520
assert.equal(supports.length, 2);
// L528
assert.equal(half, name === "rounded" ? 10 : 4);
// L531
assert.ok(Math.abs(lower[1] - 0.085) < 1e-9 && lower[2] >= 2.42 - 1e-9 && lower[2] <= 2.54 + 1e-9 && lower[0] * side > 0 && Math.abs(lower[0]) <= 0.09 + 1e-9);
// L537
assert.ok(insideSection(upper, hull));
// L538
assert.ok(support.slice(half).every((p) => p[2] <= Car3D.CHASSIS.nose[0].z + Car3D.BODY_STYLES[id].noseTipZ));
```

- L555–572: **expanded cover stripes stay on the crown instead of bridging to the roll structure**

```js
// L564
assert.ok(points.length >= 48);
// L567
assert.ok(Math.abs(p[0]) < profile.pts[profile.pts.length - 1][0]);
// L569
assert.ok(gap >= -0.016 && gap <= 0.006);
```

- L574–602: **scorpion cover clears actual factory T-wings and their supports bridge the gap**

```js
// L585
assert.ok(wing.length > 0);
// L588
assert.ok(p[1] > skin + 0.002);
// L592
assert.ok(stem.length > 0);
// L595
assert.ok(floor < skin && floor > skin - 0.020);
// L596
assert.ok(top >= Math.min(...wing.map((p) => p[1])) && top <= Math.max(...wing.map((p) => p[1])));
// L601
assert.ok(checked >= 4);
```

- L605–626: **expanded nose roots meet the chassis nose root without moving their tip or mid sections**

```js
// L613
assert.equal(root.side, root0.w / 2);
// L614
assert.equal(root.topSide, root0.w * root0.t / 2);
// L615
assert.equal(root.top, root0.y + root0.h / 2);
// L616
assert.equal(root.bottom, root0.y - root0.h / 2);
// L618
assert.ok(Math.abs(forward.top - root.top) < 0.0001 && Math.abs(forward.bottom - root.bottom) < 0.0001);
// L624
assert.ok(Math.abs(wasp.side - 0.15858) < 1e-6 && Math.abs(wasp.top - 0.38185) < 1e-6);
```

- L628–647: **Wasp airbox and principal hoop remain below the fixed hoop crowns**

```js
// L630
assert.equal(Car3D.BODY_STYLES.wasp.coverLift, 0);
// L633
assert.ok(t);
// L638
assert.equal(parts._ids.engine, setup.engine);
// L643
assert.ok(points.length >= 8);
// L644
assert.ok(points.every((p) => p[1] <= cap + 1e-9));
```

- L650–689: **low concept floor fences clear the emitted tray with every engine and lowest available suspension**

```js
// L655
assert.ok(t);
// L659
assert.equal(parts._ids.engine, engine.id);
// L682
assert.ok(carbon.length >= 2);
// L685
assert.ok(rail.length >= 2 && outer <= 0.95);
// L686
assert.ok(rail.every((p) => p[1] >= trayBottom - 1e-9 && p[1] >= 0));
```

- L691–702: **renamed sculpted bodies and matching aero options expose unique new IDs**

```js
// L695
assert.ok(Car3D.BODY_STYLE_IDS.includes(id));
// L696
assert.equal(Car3D.bodyStyleKey(team.id, id), id);
// L698
assert.equal(opt.label, id[0].toUpperCase() + id.slice(1) + " Contour");
// L699
assert.equal(opt[key], medium[key]);
// L700
assert.equal(opt.equivalent, "medium");
```

- L704–724: **Auralis, Cevora, Vantrel and Orynth have distinct post-clamp silhouettes**

```js
// L709
assert.ok(riftRing[5][1] < (riftPod.innerTop + riftPod.top) / 2 - 0.04);
// L710
assert.ok(cevora.podAt(0.22).x < vantrel.podAt(0.22).x - 0.20);
// L711
assert.ok(cevora.podAt(0.22).bottom > vantrel.podAt(0.22).bottom + 0.08);
// L712
assert.ok(vantrel.noseAt(2.95).side > cevora.noseAt(2.95).side * 1.5);
// L713
assert.ok(orynth.podAt(-0.62).top > orynth.podAt(0.22).top + 0.06);
// L719
assert.ok(mesh.pos.every(Number.isFinite));
// L722
assert.equal(hashes.size, 4);
```

- L726–758: **sculpted pods keep mirrored, positive closed sections and sampled detail stops**

```js
// L729
assert.ok(X.Car3D.BODY_STYLES[id].noseTipZ <= 0.12);
// L731
assert.equal(a.podStops.length, 7);
// L733
assert.ok(cover.xb < cover.x * 0.60);
// L734
assert.ok(profile.d >= (cover.top - cover.bottom) * 0.30);
// L736
assert.ok(!measured.parts.some(p => p.name === "sponsorBoard"));
// L739
assert.equal(right.length, 7);
// L741
assert.ok(v.every(Number.isFinite));
// L742
assert.ok(Math.abs(v[0] + left[i][0]) < 1e-12 && v[1] === left[i][1] && v[2] === left[i][2]);
// L743
assert.ok(v[1] >= Math.min(p.innerBottom, p.outerBottom) - 1e-9);
// L746
assert.ok(Math.abs(skin.x - p.outer) < 1e-12 && Math.abs(skin.top - p.outerTop) < 1e-12);
// L747
assert.ok(right[5][1] > Math.min(p.innerBottom, p.outerBottom) + 0.02);
// L748
assert.ok(right[2][0] < right[3][0] && right[4][0] < right[3][0]);
// L751
assert.ok(point.every(Number.isFinite));
// L752
assert.ok(point[0] <= p.outer && point[0] >= p.inner);
// L753
assert.ok(Math.abs(point[1] - (skin.bottom + (skin.top - skin.bottom) * f)) < 1e-12);
```

- L760–773: **reference study smooth rings curve off their chords and Orynth belly recovers aft**

```js
// L765
assert.ok(Math.abs(sample.x - (p.outer + (q.outer - p.outer) / 3)) > 0.002);
// L766
assert.equal(a.podRing(z, 1)[3][0], sample.x);
// L769
assert.ok(body.podAt(-0.62).bottom > body.podAt(-1.05).bottom + 0.04);
// L771
assert.ok(ring[3][0] - ring[2][0] > 0.10);
```

- L775–791: **complete concepts emit shaped cover rings, deep ducts and full finite car assemblies**

```js
// L778
assert.equal(a.coverStops.length, 5);
// L780
assert.ok(Math.abs(m.top - (f.top + r.top) / 2) > 0.01);
// L781
assert.ok(recipe.ductDepth >= 0.10 && recipe.exitDepth >= 0.04);
// L786
assert.ok(mesh[key].every(Number.isFinite));
// L787
assert.ok(mesh.idx.length / 3 < 24000);
// L789
assert.ok(mesh.parts.some(p => p.name === name && p.vertices > 0));
```

- L793–827: **complete concept cover skins are welded, closed and outward in both LODs**

```js
// L817
assert.ok(shell);
// L824
assert.equal(count, 1);
// L824
assert.equal(edges.get(b + ">" + a), 1);
// L825
assert.ok(volume > 0);
```

- L829–851: **complete cover artwork keeps continuous UVs at shared longitudinal rings**

```js
// L836
assert.ok(d.uv[v * 2] >= region.x / size - 1e-8 && d.uv[v * 2] <= (region.x + region.w) / size + 1e-8);
// L847
assert.ok(front.length && rear.length);
// L848
assert.deepEqual(front.sort(), rear.sort());
```

- L853–886: **reference noses are short, broad and curved downward; spines have rounded crown sections**

```js
// L856
assert.equal(a.noseStops.length, 9);
// L858
assert.ok(tip.z<=2.48 && tip.side*2>=0.14);
// L859
assert.ok(tip.top<0.30);
// L862
assert.ok(frontSlope>rearSlope+0.08);
// L864
assert.equal(profile.pts.length, 10);
// L865
assert.ok(profile.pts[4][1]>profile.shoulder && profile.pts[4][1]<profile.top);
// L870
assert.ok(Math.abs(d.pos[v*3+1]-a.noseAt(d.pos[v*3+2]).top-0.020)<1e-8);
// L872
assert.ok(label.length>4);
// L873
assert.equal(X.Car3D.BODY_STYLES[id].wingStyle.canard, 0);
// L878
assert.ok(Math.abs(m.pos[v*3+1]-a.noseAt(m.pos[v*3+2]).top)<0.025);
// L880
assert.ok(painted>48);
// L884
assert.equal(whiteSupport.length, 0);
```

## boot-idle-prefetch.test.mjs

Production targets: LazyBundles.create (js/core/lazy-bundles.js:5), nested raceAssets/scheduleIdle; TrackBuildClient.idleWarm/spawn (js/track/build-client.js); RendererBoot.create (js/render/renderer-boot.js:32) nested gpuAdapterAvailable; Assets.load (js/render/shared/assets.js:596).

Fixtures and inputs: Real ScriptLoader/LazyBundles and build-client run in VMs with tiny rosters, captured idle callbacks, fake Worker/DOM/storage. Adapter helper brace-extracts the actual probe and controls timer settlement. Asset strip uses three synthetic manifest layers, counted bitmap closure/upload and scheduler.yield versus timer queues. Network Information fixture compares absent/4g/3g/saveData/2g/slow-2g.

Contracts and coverage limits: Checks microtask scenery versus idle light/session/audio schedules, no title worker spawn, agent-only warm, worker-off no-op; adapter hang cap 4000ms and slow/absent distinction, timer cleanup and no-timer fixture; idle modulepreload source shape; one real task between decoded layers and close-once upload; constrained connections suppress idle prefetch but retain scenery. Regex guards freeze spelling as well as intent. Adapter extraction excludes eval-time early request; fake time does not measure boot latency or real network/GPU scheduling.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L14–29: **raceAssets schedules scenery on microtask and LAZY_RACE on idle**

```js
// L16
assert.match(src, /function scheduleIdle\(fn, timeoutMs\)/);
// L17
assert.match(src, /requestIdleCallback\(fn, \{ timeout: ms \}\)/);
// L18
assert.match(src, /else setTimeout\(fn, Math\.min\(ms, 800\)\)/);
// L19
assert.match(src, /function raceAssets\(\)/);
// L20
assert.match(src, /queueMicrotask\(kickScenery\)/);
// L21
assert.match(src, /scheduleIdle\(\(\) => \{ ensureLightPresets\(\); \}, 8000\)/);
// L22
assert.match(src, /function ensureLightPresets\(\) \{\s*if \(window\.LightPresets\) return/);
// L23
assert.doesNotMatch(src, /ensureCircuit\(deps\.getContext\(\)\.trackIdx\);\s*ensureScenery/);
// L27
assert.match(src.replace(/\/\/.*$/gm, ""), /TrackBuildClient\.idleWarm\(wantAgentSurface\(\)\)/);
```

- L31–94: **raceAssets microtask kicks scenery; idle injects lights**

```js
// L83
assert.equal(idles.length, 3);
// L85
assert.ok(lightIdle);
// L86
assert.ok(idles.some((i) => i.opts && i.opts.timeout === 9000));
// L87
assert.ok(idles.some((i) => i.opts && i.opts.timeout === 12000));
// L89
assert.equal(lightLoads, 0);
// L92
assert.equal(lightLoads, 1);
// L93
assert.ok(ctx.window.LightPresets);
```

- L100–151: **the title's idle prefetch spawns no build worker on a multi-core device (3-F4)**

```js
// L135
assert.equal(ctx.TrackBuildClient.enabled(), true);
// L150
assert.equal(workers, 0);
```

- L155–175: **TrackBuildClient.idleWarm is agent-gated; spawn() no-ops when build worker is off**

```js
// L157
assert.match(src, /function idleWarm\(agentSurface\)/);
// L158
assert.match(src, /if \(!enabled\(\)\) return null/);
// L159
assert.match(src, /requestIdleCallback\(kick, \{ timeout: 3000 \}\)/);
// L172
assert.equal(typeof main.TrackBuildClient.idleWarm, "function");
// L173
assert.equal(main.TrackBuildClient.idleWarm(true), null);
// L174
assert.equal(main.TrackBuildClient.spawn(), null);
```

- L202–213: **renderer-boot: a never-resolving requestAdapter hits the 4 s cap and reads as SLOW, not absent**

```js
// L206
assert.equal(h.timers.length, 1);
// L207
assert.equal(h.timers[0].ms, 4000);
// L210
assert.equal(r.ok, false);
// L211
assert.equal(r.slow, true);
// L212
assert.deepEqual(h.cleared, [1]);
```

- L215–226: **renderer-boot: an adapter that settles first wins, clears the timer, and null reads as absent**

```js
// L218
assert.deepEqual({ ok: g.ok, slow: g.slow }, { ok: true, slow: false });
// L219
assert.deepEqual(good.cleared, [1]);
// L222
assert.deepEqual({ ok: n.ok, slow: n.slow }, { ok: false, slow: false });
// L223
assert.match(n.why, /returned null/);
// L225
assert.equal((await noTimers.probe()).ok, true);
```

- L228–233: **renderer-boot idle-preloads the three vendor island on an idle slice**

```js
// L230
assert.match(boot, /requestIdleCallback\(kick, \{ timeout: 800 \}\)/);
// L232
assert.match(boot, /rel = "modulepreload"/);
```

- L235–272: **Assets strip decode gives a future task a turn between successive layers**

```js
// L243
assert.equal(delay, 0);
// L256
assert.deepEqual(decoded, [1]);
// L257
assert.equal(uploads, 0);
// L259
assert.equal(turns.length, 1);
// L261
assert.equal(turn.kind, schedulerAvailable ? "scheduler" : "timer");
// L263
assert.deepEqual(decoded, Array.from({ length: layer }, (_, i) => i + 1));
// L264
assert.equal(uploads, 0);
// L266
assert.equal(await pending, true);
// L267
assert.equal(microtasks, 0);
// L268
assert.equal(uploads, 1);
// L268
assert.equal(installed, 1);
// L269
assert.deepEqual(closed, [1, 2, 3]);
// L270
assert.equal(turns.length, 0);
```

- L277–330: **raceAssets skips the lighting, race-session and audio prefetches under Save-Data or 2G, keeps them otherwise (#3110)**

```js
// L321
assert.deepEqual((await run(undefined)).idles, [8000, 9000, 12000]);
// L322
assert.deepEqual((await run({ saveData: false, effectiveType: "4g" })).idles, [8000, 9000, 12000]);
// L323
assert.deepEqual((await run({ saveData: false, effectiveType: "3g" })).idles, [8000, 9000, 12000]);
// L326
assert.deepEqual(sd.idles, []);
// L327
assert.ok(sd.sceneryKicks > 0);
// L328
assert.deepEqual((await run({ saveData: false, effectiveType: "slow-2g" })).idles, []);
// L329
assert.deepEqual((await run({ saveData: false, effectiveType: "2g" })).idles, []);
```

## boot-input-shape.test.mjs

Production targets: idxOr in js/game.js; loadCustomTeam/identityGet in js/career/custom-team.js with Teams.sanitizeCustom (js/data/teams.js:364); DebrisWorld.reset in js/physics/debris-world.js; boot steerMode through game-vm and Input.debugState.

Fixtures and inputs: Brace-extracted shipped functions execute through new Function; real Teams IIFE sanitizes malformed/malicious stores. Reset runs with controlled active/enabled/load-state combinations and destroyWorld stub. Final steerMode case actually boots createGame twice and closes both fixtures.

Contracts and coverage limits: Checks noncoercing integer index acceptance plus no hand-rolled comparison-shaped readers, repair preserving custom fields/default roster and custom ID, capped team/driver text/numbers and roster length, reset latch rearming only when enabled and loaded, unknown steer mode → buttons and valid touch retained. Extraction omits surrounding side effects; the index source regex is not a semantic proof that every future reader uses idxOr. Debris reset does not run Rapier or trigger a real trapped step. Five readers/behaviors are present although the historical introduction says three.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L49–66: **idxOr rejects every non-index, not just out-of-range numbers**

```js
// L55
assert.equal(idxOr(bad, 21, 2), 2);
// L58
assert.equal(idxOr(good, 21, 2), good);
// L60
assert.equal(idxOr(0, 0, 3), 3);
// L64
assert.deepEqual(handRolled, []);
```

- L74–107: **a corrupt custom team is repaired, not pushed into Teams.LIST as it lies**

```js
// L92
assert.ok(Array.isArray(t.drivers) && t.drivers.length > 0);
// L94
assert.equal(t.id, "custom");
// L95
assert.ok(d && typeof d === "object");
// L99
assert.equal(half.name, "Scuderia Me");
// L100
assert.deepEqual(half.color, [1, 0, 0]);
// L101
assert.deepEqual(half.drivers, plain(DEFAULT_CUSTOM.drivers));
// L105
assert.deepEqual(load(sound), sound);
// L106
assert.deepEqual(load(undefined), plain(DEFAULT_CUSTOM));
```

- L114–133: **a loaded custom team is capped to the dialog's limits (malicious store)**

```js
// L124
assert.equal(t.name, "N".repeat(22));
// L125
assert.equal(t.short, "TOOL");
// L126
assert.equal(t.engine, "Custom");
// L127
assert.equal(t.drivers.length, 2);
// L129
assert.ok(d.name.length <= 22);
// L130
assert.equal(d.code, "ABC");
// L131
assert.equal(d.num, 99);
```

- L142–165: **DebrisWorld.reset() re-arms the latch a trapped step lowered**

```js
// L145
assert.match(src, /_active = false;\s*\n\s*try \{ destroyWorld\(\)/);
// L156
assert.equal(run({ _active: false, _enabled: true, _loadState: 2 }), true);
// L159
assert.equal(run({ _active: false, _enabled: false, _loadState: 2 }), false);
// L161
assert.equal(run({ _active: true, _enabled: true, _loadState: -1 }), false);
// L163
assert.equal(run({ _active: false, _enabled: true, _loadState: 0 }), false);
```

- L171–180: **an unknown stored steerMode boots as BUTTONS, a valid one is kept**

```js
// L178
assert.equal(await steerOf("foo"), "buttons");
// L179
assert.equal(await steerOf("touch"), "touch");
```

## boot-load-budget.test.mjs

Production targets: index.html eager script references; tools/manifest.cjs LAZY_*/DEFERRED; RendererBoot.create/start in js/render/renderer-boot.js:32.

Fixtures and inputs: Comment-stripped HTML script-src parser sums local file stat sizes. Actual manifest is imported. RendererBoot VM uses synthetic backend roster, storage pick null/three/webgpu, counted requestAdapter, stub Gfx.create and backend loads.

Contracts and coverage limits: Freezes ≤320 eager local script entries and ≤8,200,000 raw bytes; lazy/deferred files absent from eager list; bound boot uses at most one adapter request for all three stored picks. Does not measure compressed transfer, parsing CPU, dynamic imports, real backend initialization or GPU request inside Three. HTML matching recognizes the tested double-quoted src form.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L32–37: **the eager shell stays inside its script budget (count and raw bytes)**

```js
// L35
assert.ok(files.length <= MAX_EAGER_SCRIPTS);
// L36
assert.ok(bytes <= MAX_EAGER_BYTES);
```

- L39–50: **no lazy or deferred group is back on the boot wall**

```js
// L47
assert.ok(lazy.length > 20);
// L49
assert.deepEqual(back, []);
```

- L52–84: **the renderer boot spends at most one adapter request before Gfx.create, for every pick**

```js
// L81
assert.equal(r.bound, true);
// L82
assert.ok(asked <= 1);
```

## boot-script-repair-overlay.test.mjs

Production targets: index.html inline ON-SCREEN ERROR CATCHER and one-shot scriptRetry repair flag.

Fixtures and inputs: Extracts actual inline script from HTML, fake DOM/listener table, sessionStorage first/second pass, hanging or resolved fetch, fake caches. Events are injected manually.

Contracts and coverage limits: Checks __apexScriptRepair near RETRY_KEY set, error/rejection logging while repair suppresses overlay, normal overlay visibility, and pinned second-pass module failure overriding suppression. DOM rendering, real cache sweep/reload/network repair and listener registration in a real browser remain unverified; near-string flag check freezes a 120-character placement window.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L40–46: **index.html sets __apexScriptRepair when the one-shot scriptRetry repair starts**

```js
// L43
assert.ok(at > 0);
// L45
assert.equal(snippet.includes("window.__apexScriptRepair = 1"), true);
```

- L48–60: **with __apexScriptRepair set, rejections and errors are logged but the overlay stays hidden**

```js
// L53
assert.equal(h.last().kind, "rejection");
// L54
assert.equal(h.last().msg, "DriveTune is not defined");
// L55
assert.equal(h.overlayVisible(), false);
// L57
assert.equal(h.last().kind, "error");
// L58
assert.equal(h.last().msg, "DriveTune is not defined");
// L59
assert.equal(h.overlayVisible(), false);
```

- L62–68: **without __apexScriptRepair, the overlay still shows for rejections and errors**

```js
// L65
assert.equal(h.overlayVisible(), true);
// L67
assert.equal(h.overlayVisible(), true);
```

- L70–98: **pinned overlay (second scriptRetry pass) still shows even if __apexScriptRepair were set**

```js
// L96
assert.equal(overlay && overlay.style.display, "block");
// L97
assert.equal(overlay.textContent.indexOf("Module failed to load") >= 0, true);
```

## bootstrap-doctor.test.mjs

Production targets: tools/check/doctor.mjs diagnose (:54), doctorMain (:202); tools/lib/chromium-path.mjs and harness.mjs; .claude/hooks/protect-files.sh; tools/env/mirror-skills.sh; tools/mcp/probe-mcp.py daemon lifecycle.

Fixtures and inputs: Scratch temp package/skill trees and symlinks with cleanup; spawnSync CLI/hook shells, fake git reporting fixture root, actual mirror script copied into fixture, fake executable browser paths. Python imports probe-mcp and monkeypatches urllib/tmux/which/sleep/state path. Host catalog fixtures intentionally contain a credential sentinel.

Contracts and coverage limits: Checks package-derived minimum Node versions/unsupported-range warning, SDK server subpath resolution, YAML syntax/duplicates, missing refs/mirrors without repair, catalog conflict/secret omission/remote unverified resources, CLI read-only shape and unknown flags, generated-span/script guard including huge writes and escaped keys, mirror repair/copy drift, executable discovery/override/cache fallback, daemon service+root identity, failure state retention and invalid-port early refusal. Fixtures write isolated trees and mirror links; no real browser/npm/cloud/remote Git activity. Diagnose scans actual supplied paths; Python daemon behavior is mostly controlled dependencies, not tmux or Chrome integration.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L36–51: **doctor checks the inspected package Node engine rather than a stale minimum**

```js
// L41
assert.equal(check("20.19.0").status, "fail");
// L42
assert.equal(check("21.7.3").status, "fail");
// L43
assert.equal(check("22.0.0").status, "pass");
// L44
assert.match(check("22.0.0").message, />=22/);
// L46
assert.equal(check("22.3.0").status, "fail");
// L47
assert.equal(check("22.3.1").status, "pass");
// L48
assert.equal(check("23.0.0").status, "pass");
// L50
assert.equal(check("25.0.0").status, "warn");
```

- L53–62: **doctor checks the MCP SDK entry used by the project**

```js
// L59
assert.equal(check().status, "fail");
// L61
assert.equal(check().status, "pass");
```

- L64–75: **doctor parses real YAML and rejects colon descriptions and duplicate keys**

```js
// L67
assert.equal(diagnose({ root: dir }).ok, true);
// L70
assert.equal(result.ok, false);
// L71
assert.equal(result.checks.find((c) => c.id === "skills.demo.yaml").status, "fail");
// L74
assert.ok(result.checks.find((c) => c.id === "skills.demo.yaml").details.codes.includes("DUPLICATE_KEY"));
```

- L77–89: **doctor detects missing resources and wrong symlinks without repairing them**

```js
// L85
assert.equal(result.ok, false);
// L86
assert.equal(result.checks.find((c) => c.id === "skills.demo.mirror").status, "fail");
// L87
assert.equal(result.checks.find((c) => c.id === "skills.demo.refs.SKILL.md").status, "fail");
// L88
assert.equal(fs.readlinkSync(link), "../../.claude/skills/absent");
```

- L91–104: **doctor diagnoses supplied host capabilities and conflicting connector metadata without leaking credentials**

```js
// L100
assert.ok(result.checks.some((c) => c.id === "session.BROWSER_PRIMITIVES_ABSENT"));
// L101
assert.equal(result.checks.find((c) => c.id === "session.skill.0.resources").status, "warn");
// L102
assert.equal(result.checks.find((c) => c.id === "session.connector.0").details.state, "conflict");
// L103
assert.doesNotMatch(JSON.stringify(result), /SECRET_SHOULD_NOT_APPEAR/);
```

- L106–130: **doctor keeps remote skill locators unverified and resolves local resources relative to inspected root**

```js
// L120
assert.equal(checks[0].details.state, "unverified");
// L121
assert.equal(checks[0].details.remoteResources, 2);
// L122
assert.doesNotMatch(checks[0].message, /missing|unavailable/i);
// L123
assert.equal(checks[1].details.state, "local-present");
// L124
assert.equal(checks[1].status, "pass");
// L125
assert.equal(checks[2].details.state, "local-present");
// L127
assert.equal(check.details.state, "missing");
// L128
assert.equal(check.status, "warn");
```

- L132–143: **doctor help and tree JSON CLI stay read-only and reject unknown flags**

```js
// L136
assert.equal(run("node", [script, "--help"]).status, 0);
// L137
assert.equal(run("node", [script, "--boot"]).status, 2);
// L140
assert.equal(result.status, 0);
// L141
assert.equal(JSON.parse(result.stdout).mode, "tree");
// L142
assert.deepEqual(fs.readdirSync(dir).sort(), before);
```

- L145–163: **guard blocks edits enclosing generated spans and new generated-script insertions; large stdin stays usable**

```js
// L154
assert.equal(guard("Edit", { file_path: file, old_string: shell, new_string: "replaced" }).status, 2);
// L155
assert.equal(guard("MultiEdit", { file_path: file, edits: [{ old_string: shell, new_string: "replaced" }] }).status, 2);
// L157
assert.equal(guard("Edit", { file_path: pkg, old_string: '"scripts": {', new_string: '"scripts": {"test:new.group":"node new",' }).status, 2);
// L158
assert.equal(guard("Edit", { file_path: pkg, old_string: "node old", new_string: "node changed" }).status, 2);
// L159
assert.equal(guard("Edit", { file_path: pkg, old_string: '"scripts": {', new_string: '"scripts": {"test\\u003anew":"node new",' }).status, 2);
// L160
assert.equal(guard("Edit", { file_path: pkg, old_string: '"scripts": {', new_string: '"scripts": {"serve":"node server",' }).status, 0);
// L161
assert.equal(guard("Write", { file_path: file, content: shell + "x".repeat(400000) }).status, 0);
// L162
assert.equal(guard("Write", { file_path: file, content: shell.replace("GENERATED", "CHANGED") + "x".repeat(400000) }).status, 2);
```

- L165–180: **mirror check detects broken/wrong existing links, repair replaces them, copies are checked for drift**

```js
// L172
assert.equal(run("bash", [script, "--check"]).status, 1);
// L173
assert.equal(run("bash", [script]).status, 0);
// L174
assert.equal(fs.readlinkSync(link), "../../.claude/skills/demo");
// L175
assert.equal(run("bash", [script, "--check"]).status, 0);
// L176
assert.equal(run("bash", [script, "--copy"]).status, 0);
// L177
assert.equal(run("bash", [script, "--check"]).status, 0);
// L179
assert.equal(run("bash", [script, "--check"]).status, 1);
```

- L182–190: **Chromium PATH discovery and harness agree, ignore nonexecutables, and retain explicit precedence**

```js
// L187
assert.deepEqual(resolveChromium(opts), { path: found, source: "PATH:google-chrome-stable" });
// L188
assert.equal(pickChromium(opts), found);
// L189
assert.equal(resolveChromium({ ...opts, env: { ...opts.env, PW_CHROMIUM: "/explicit" } }).path, "/explicit");
```

- L192–196: **browser cache selection falls back from nonwritable preferred and shared directories**

```js
// L194
assert.equal(browserCachePath({ env, writable: (p) => p.startsWith("/writable/") }), "/writable/user-cache/ms-playwright");
// L195
assert.equal(browserCachePath({ env, writable: () => false }), undefined);
```

- L198–208: **doctor reports unusable configured browser cache and the selected fallback**

```js
// L203
assert.equal(cache.status, "warn");
// L204
assert.equal(cache.details.configuredWritable, false);
// L205
assert.equal(cache.details.configured, "/dev/null/not-a-directory");
// L206
assert.equal(cache.details.fallback, true);
// L207
assert.notEqual(cache.details.selected, cache.details.configured);
```

- L210–217: **daemon health requires service/root identity, missing tmux is actionable, failed stop retains state**

```js
// L214
assert.equal(result.status, 0);
// L215
assert.match(result.stdout, /daemon safety passed/);
// L216
assert.match(result.stderr, /tmux is required/);
```

- L219–223: **daemon invalid port is rejected before a browser can start**

```js
// L221
assert.equal(result.status, 2);
// L222
assert.match(result.stderr, /port must be between/);
```

## brake-cue.test.mjs

Production targets: BrakeCue in js/physics/brake-cue.js (create :57, urgencyOf/conditionCapacity/fromSlider/labelOf); DrivingCues.urgencyOf in js/audio/driving-cues.js.

Fixtures and inputs: Real IIFEs VM-loaded with clamp and clock stubs. cueRig supplies a straight then 20m-radius hairpin, mutable time/G, captured audio/vibration/rumble; pure capacity/urgency matrices include both braking and grip conditions.

Contracts and coverage limits: Checks slider/off labels/lookahead, safe corner silence, excess-speed urgency and braking relief, bounded output; monotone smoothed conservative capacity without player mutation; off avoids track/haptic calls; pace-scaled stopping-distance cap, urgency-dependent pulse period and both haptics, paused/menu/finished silence; 864 input combinations compare the two urgency functions. Function equality checks agreement rather than independent correctness. Range 0..1 does not by itself prove absence of brake actuation; physical/haptic/audio outputs are stubs and no device delivery is exercised.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L25–31: **slider 1 is OFF; 6 is CUE with mid lookahead**

```js
// L26
assert.equal(BrakeCue.fromSlider(1).on, false);
// L27
assert.equal(BrakeCue.fromSlider(6).on, true);
// L28
assert.ok(BrakeCue.fromSlider(6).lookSec > 1 && BrakeCue.fromSlider(6).lookSec < 2);
// L29
assert.equal(BrakeCue.labelOf(1), "OFF");
// L30
assert.match(BrakeCue.labelOf(6), /^CUE 6$/);
```

- L33–37: **a corner you can already take is silent**

```js
// L36
assert.equal(u, 0);
```

- L39–45: **too fast for the apex raises urgency, and braking already done cuts it**

```js
// L43
assert.ok(coast > 0.3);
// L44
assert.ok(braking < coast);
```

- L47–50: **urgency is never a brake command — output is 0..1 only**

```js
// L49
assert.ok(u >= 0 && u <= 1);
```

- L53–66: **condition estimate is conservative, smoothly monotone, and sensory-only**

```js
// L58
assert.ok(c.lat <= previous.lat && c.brake <= previous.brake);
// L59
assert.ok(previous.lat - c.lat < .6 && previous.brake - c.brake < .6);
// L61
assert.ok(u >= urgency);
// L63
assert.equal(JSON.stringify(player), before);
// L65
assert.equal(dry.lat, 22);
// L65
assert.equal(dry.brake, 22);
```

- L68–75: **condition cues default off and OFF performs no curvature reads or haptics**

```js
// L72
assert.equal(cue.debug().conditionAware, false);
// L74
assert.equal(cue.debug().urgency, 0);
```

- L98–109: **tick ON: the look-ahead is bounded by the stopping distance, which rides the pace scale**

```js
// L102
assert.equal(slow.cue.debug().urgency, 0);
// L103
assert.equal(slow.pulses.length, 0);
// L107
assert.ok(fast.cue.debug().urgency > 0.5);
// L108
assert.equal(fast.pulses.length, 1);
```

- L111–125: **tick ON: pulse period shrinks as urgency rises, and each pulse drives sound and both haptics**

```js
// L118
assert.ok(near.pulses.length >= 2 && far.pulses.length >= 2);
// L120
assert.ok(gap(near) < gap(far));
// L121
assert.ok(gap(near) >= 0.09 - 0.02 && gap(far) <= 0.55 + 0.02);
// L123
assert.ok(kinds.has("vibrate") && kinds.has("rumble"));
// L124
assert.equal(near.haptics.filter((h) => h[0] === "rumble").length, near.pulses.length);
```

- L127–134: **tick ON: paused, off-race and finished cars are silent**

```js
// L132
assert.equal(r.pulses.length, 0);
```

- L136–147: **BrakeCue.urgencyOf and DrivingCues.urgencyOf are the same function of their inputs**

```js
// L143
assert.equal(DC.urgencyOf(v, k, d, ax, lat, br), BrakeCue.urgencyOf(v, k, d, ax, lat, br));
// L146
assert.ok(checked > 500);
```

## branch-audit.test.mjs

Production targets: tools/ci/branch-audit.mjs addedLines :88, presence :75, indexPrs :101, indexRuns :116, verdictFor :128, inSurvey :51, audit :166, renderMarkdown :203, parseRefs :224, main :240.

Fixtures and inputs: Pure diff/PR/run/time fixtures plus a real throwaway bare origin/work Git repo under artifacts. git-fixture-env is imported first; actual merges, independent equivalent commit and orphan branch feed audit. Fixture cleans up and restores process cwd.

Contracts and coverage limits: Checks meaningful added-line extraction, same-file versus moved-line percentage, newest/open PR and newest run precedence, conservative verdict order/NaN ages/zero lines, 48h survey and exclusions/custom interval, CLI PR-list requirement, report evidence, real ancestor/absorbed/unmerged/no-history and survey filtering. No actual remote-host PR retrieval or deletion/pruning is executed. Line-presence similarity is heuristic and is not code equivalence; absorbed is established by merge-tree tree equality for these repositories.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L19–23: **addedLines keeps added lines worth matching, per file, and skips deletions and short lines**

```js
// L22
assert.deepEqual(addedLines(diff), [{ file: "a.js", text: "const kept = 2;" }]);
```

- L25–31: **presence counts same-file and anywhere separately — moved code is found anywhere**

```js
// L29
assert.deepEqual(presence(added, (f) => files.get(f), all), { lines: 3, samePct: 33, anyPct: 67 });
// L30
assert.deepEqual(presence([], () => null, all), { lines: 0, samePct: 100, anyPct: 100 });
```

- L33–42: **indexPrs keeps the newest PR per branch, and an open one always wins**

```js
// L40
assert.deepEqual([m.get("x").number, m.get("x").state], [9, "closed"]);
// L41
assert.deepEqual([m.get("y").number, m.get("y").state], [3, "open"]);
```

- L44–48: **indexRuns keeps the newest run per head sha**

```js
// L47
assert.equal(m.get("s").conclusion, "success");
```

- L50–65: **verdict precedence: open PR, merged, too recent, absorbed, no history, superseded, post-merge, pr-closed, unmerged**

```js
// L53
assert.equal(v({ pr: { state: "open" }, ancestor: true }), "active");
// L54
assert.equal(v({ ancestor: true }), "merged");
// L55
assert.equal(v({ pr: { state: "merged", headSha: "h" } }), "merged");
// L56
assert.equal(v({ ageDays: 0.2, absorbed: true }), "active");
// L57
assert.equal(v({ absorbed: true, anyPct: 0 }), "absorbed");
// L58
assert.equal(v({ noHistory: true }), "no-history");
// L59
assert.equal(v({ anyPct: SUPERSEDED_PCT, pr: { state: "closed" } }), "superseded");
// L60
assert.equal(v({ anyPct: SUPERSEDED_PCT, lines: 0 }), "unmerged");
// L61
assert.equal(v({ pr: { state: "merged", headSha: "other" } }), "post-merge");
// L62
assert.equal(v({ pr: { state: "closed" } }), "pr-closed");
// L63
assert.equal(v({}), "unmerged");
// L64
assert.equal(v({ ageDays: NaN }), "active");
```

- L67–85: **the survey: no PR ever, or the last PR closed UNMERGED 48 h ago, and no commit for 48 hours**

```js
// L68
assert.equal(SURVEY_QUIET_HOURS, 48);
// L79
assert.deepEqual(pick([b("quiet", 49), b("busy", 47), b("closed-old", 300), b("closed-new", 300), b("closed-no-date", 300), b("merged", 300), b("open-pr", 300), b("claude/claims/x", 300), b("claude/claims-board", 300), { name: "no-time", sha: "n", time: NaN }]), ["quiet", "closed-old"]);
// L83
assert.deepEqual([inSurvey(b("q", 10), { prs, now, quietHours: 6 }), inSurvey(b("q", 10), { prs, now, quietHours: 12 })], [true, false]);
// L84
assert.match(surveyScope(48), /never had a pull request, or whose last one closed unmerged 48\+ hours ago, and have had no commit for 48\+ hours/);
```

- L87–92: **the CLI refuses to survey without the PR list (an unknown PR set would survey everything)**

```js
// L90
assert.equal(main([]), 2);
// L91
assert.match(said, /needs --prs/);
```

- L94–101: **renderMarkdown tallies the verdicts and lists every branch with its evidence**

```js
// L99
assert.match(md, /\| \*\*absorbed\*\* \| 1 \|/);
// L100
assert.match(md, /\| `b` \| 4 \| 5 \| 10% \/ 40% of 50 \| #7 closed \| CI: failure \|/);
```

- L103–150: **against real git: ancestor, absorbed, unmerged and an unrelated branch are told apart**

```js
// L136
assert.equal(by["merged-one"].verdict, "merged");
// L137
assert.equal(by["absorbed-one"].verdict, "absorbed");
// L138
assert.equal(by["real-work"].verdict, "unmerged");
// L139
assert.equal(by["real-work"].anyPct, 0);
// L140
assert.equal(by["unrelated"].verdict, "no-history");
// L145
assert.deepEqual(only.map((r) => r.name), ["real-work"]);
```

## browser-http-mcp.test.mjs

Production targets: tools/mcp/browser-http.mjs startBrowserMcp :78, tokenOk :59, presentedToken :66; HTTP/RPC handler :193 onward and close :270.

Fixtures and inputs: Actual loopback ephemeral HTTP server/fetch and raw net socket for incomplete uploads; static initialize envelope. Always closes server. Status/early-eval exercise tools without browser_open.

Contracts and coverage limits: Checks malformed envelope 400/-32600, parse 400/-32700, oversized 413, recovery; aborted/incomplete upload shutdown, shared close promise and refused connection afterward; auth via bearer/query, wrong tokens and bearer priority; exact four tool names, initialization/notification/ping/status/unknown tool/early eval/unknown method. No Chromium is launched: successful browser_open/eval/shot, orientation changes, real game serving and browser cleanup paths are outside coverage.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L42–60: **browser MCP rejects malformed envelopes and oversized uploads, then still answers**

```js
// L47
assert.equal(response.status, 400);
// L48
assert.equal((await response.json()).error.code, -32600);
// L52
assert.equal(response.status, 400);
// L53
assert.equal((await response.json()).error.code, -32700);
// L56
assert.equal(large.status, 413);
// L57
assert.match((await large.json()).error.message, /64000/);
// L58
assert.equal((await (await post(mcp.url, init, "secret")).json()).result.serverInfo.name, "apex-browser");
```

- L62–79: **browser MCP survives an aborted upload and shuts down with an incomplete upload**

```js
// L70
assert.equal((await (await post(mcp.url, init, "secret")).json()).result.serverInfo.name, "apex-browser");
// L74
assert.equal(mcp.close(), shutdown);
// L77
assert.rejects(fetch(mcp.url + "?token=secret"), /fetch failed/);
```

- L81–100: **browser MCP rejects a missing token and lists its tools**

```js
// L85
assert.equal(denied.status, 401);
// L87
assert.equal(opened.status, 200);
// L89
assert.equal(hello.result.serverInfo.name, "apex-browser");
// L94
assert.deepEqual(names, ["browser_eval", "browser_open", "browser_shot", "browser_status"]);
// L96
assert.equal(quiet.status, 202);
```

- L102–115: **browser MCP refuses a WRONG token (same and different length), even beside a valid query token**

```js
// L107
assert.equal(r.status, 401);
// L111
assert.equal(mixed.status, 401);
```

- L117–141: **browser MCP answers ping, tools/call (status, unknown tool, no page yet) and an unknown method**

```js
// L121
assert.deepEqual(ping, { jsonrpc: "2.0", id: 7, result: {} });
// L125
assert.equal(body.browser, false);
// L126
assert.equal(body.href, null);
// L129
assert.equal(unknown.result.isError, true);
// L130
assert.match(unknown.result.content[0].text, /unknown tool nope/);
// L133
assert.equal(early.result.isError, true);
// L134
assert.match(early.result.content[0].text, /call browser_open first/);
// L137
assert.equal(nomethod.error.code, -32601);
```

## browser-http-up.test.mjs

Production targets: tools/mcp/browser-http-up.mjs tunnelUrlFromLog :26 and decide :31.

Fixtures and inputs: Three supplied local/public health combinations and URL strings; one cloudflared-style log and a not-ready string.

Contracts and coverage limits: Checks reuse/start-both/start-tunnel decisions and extraction/null tunnel host. This 15-line suite never invokes bringUp, downloads cloudflared, starts daemons, opens a tunnel or proves public reachability. Missing-URL and all remaining combinations are not directly enumerated.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L5–9: **a live local server and a live public host is reused**

```js
// L6
assert.equal(decide({ localOk: true, publicOk: true, url: "https://x.trycloudflare.com/mcp?token=a" }), "reuse");
// L7
assert.equal(decide({ localOk: false, publicOk: false, url: "" }), "start-both");
// L8
assert.equal(decide({ localOk: true, publicOk: false, url: "https://x.trycloudflare.com/mcp?token=a" }), "start-tunnel");
```

- L11–15: **the tunnel host is read from the cloudflared log**

```js
// L13
assert.equal(tunnelUrlFromLog(log), "https://floyd-establishment-physician-travelers.trycloudflare.com");
// L14
assert.equal(tunnelUrlFromLog("still starting"), null);
```

## browser-workers.test.mjs

Production targets: tools/lib/browser-workers.mjs captureCpuBudget :9, captureChromiumArgs :22, captureGpuOptions :32, glStack :97, defaultCaptureWorkers :111, scriptIsRenderHeavy :132, defaultRemoteWorkers :152; playwright.config.js and package.json scripts.

Fixtures and inputs: Injected env/CPU/job/quota/existence functions, actual package script map and render-spec source list; child Node imports Playwright config under CI true/empty.

Contracts and coverage limits: Checks GL env selection; explicit/default bounded pools and zero jobs; affinity/quota fallback; requested stack Chromium args; software env cleanup for hardware; Mesa per-worker threads and validation, required EGL but no /dev/dri, CI exemption; lavapipe ICD/current override and invalid profile rejection; basename-only render-heavy matching, remote pools/override range, spec roster parity and CI isolated retry policy. No driver is loaded, browser launched, cgroup modified or timing measured. Thread/default rules are policy assertions, not proof chosen concurrency is performant.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L22–27: **glStack reads APEX_GL / GL**

```js
// L23
assert.equal(glStack({}), "swiftshader");
// L24
assert.equal(glStack({ APEX_GL: "llvmpipe" }), "llvmpipe");
// L25
assert.equal(glStack({ GL: "llvmpipe" }), "llvmpipe");
// L26
assert.equal(glStack({ APEX_GL: "angle,llvmpipe" }), "llvmpipe");
```

- L29–39: **defaultCaptureWorkers: explicit override, CPU headroom and actual jobs bound pools**

```js
// L30
assert.equal(defaultCaptureWorkers({ env: { APEX_WORKERS: "3" }, cpus: 8 }), 3);
// L31
assert.equal(defaultCaptureWorkers({ env: {}, cpus: 4, defSwift: 2 }), 1);
// L32
assert.equal(defaultCaptureWorkers({ env: {}, cpus: 8, defSwift: 2 }), 2);
// L33
assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 8 }), 4);
// L34
assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 2 }), 1);
// L35
assert.equal(defaultCaptureWorkers({ env: {}, cpus: 1 }), 1);
// L36
assert.equal(defaultCaptureWorkers({ env: { APEX_WORKERS: "8" }, jobs: 1 }), 1);
// L37
assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 32, jobs: 3 }), 3);
// L38
assert.equal(defaultCaptureWorkers({ env: {}, jobs: 0 }), 0);
```

- L41–48: **capture CPU budget respects affinity and fractional cgroup quota**

```js
// L43
assert.equal(captureCpuBudget({ parallelism: 32, read: read('400000 100000') }), 4);
// L44
assert.equal(captureCpuBudget({ parallelism: 2, read: read('400000 100000') }), 2);
// L45
assert.equal(captureCpuBudget({ parallelism: 32, read: read('150000 100000') }), 1);
// L46
assert.equal(captureCpuBudget({ parallelism: 3, read: read('max 100000') }), 3);
// L47
assert.equal(captureCpuBudget({ parallelism: 3, read: () => { throw new Error('not Linux'); } }), 3);
```

- L50–58: **capture launcher uses the same requested GL stack as the worker budget**

```js
// L51
assert.ok(captureChromiumArgs({}).includes('--use-angle=swiftshader'));
// L53
assert.ok(args.includes('--use-angle=gl'));
// L54
assert.ok(args.includes('--use-gl=angle'));
// L55
assert.ok(args.includes('--ignore-gpu-blocklist'));
// L56
assert.ok(!args.includes('--use-angle=swiftshader'));
// L57
assert.ok(!args.includes('--disable-frame-rate-limit'));
```

- L60–75: **explicit GPU stacks avoid fallback pins and divide Mesa threads across workers**

```js
// L62
assert.ok(!hardware.args.some((arg) => arg.includes('swiftshader')));
// L63
assert.equal(hardware.env.LIBGL_ALWAYS_SOFTWARE, undefined);
// L64
assert.equal(hardware.env.GALLIUM_DRIVER, undefined);
// L65
assert.equal(hardware.env.VK_DRIVER_FILES, undefined);
// L67
assert.equal(mesa.env.LP_NUM_THREADS, '2');
// L68
assert.equal(mesa.env.LIBGL_ALWAYS_SOFTWARE, '1');
// L69
assert.equal(mesa.env.GALLIUM_DRIVER, 'llvmpipe');
// L70
assert.ok(mesa.args.includes('--use-angle=gl'));
// L71
assert.equal(captureGpuOptions({ gpu: 'llvmpipe', env: { LP_NUM_THREADS: '3' }, cpus: 8, workers: 4, exists: () => true }).env.LP_NUM_THREADS, '3');
// L72
assert.throws(() => captureGpuOptions({ gpu: 'llvmpipe', env: { LP_NUM_THREADS: 'bogus' } }), /LP_NUM_THREADS/);
// L73
assert.equal(defaultCaptureWorkers({ env: { APEX_GPU: 'hardware' }, cpus: 8 }), 4);
// L74
assert.equal(defaultCaptureWorkers({ env: { APEX_GPU: 'lavapipe' }, cpus: 4 }), 1);
```

- L77–87: **llvmpipe without Mesa EGL fails fast instead of falling back to SwiftShader; /dev/dri is not required**

```js
// L82
assert.throws(() => captureGpuOptions({ gpu: 'llvmpipe', env: {}, exists: noEgl }), /llvmpipe needs Mesa EGL \(libEGL\.so\.1 missing/);
// L83
assert.equal(captureGpuOptions({ gpu: 'llvmpipe', env: {}, exists: eglNoDri }).env.GALLIUM_DRIVER, 'llvmpipe');
// L85
assert.equal(captureGpuOptions({ gpu: 'llvmpipe', env: { GITHUB_ACTIONS: 'true' }, exists: noEgl }).env.GALLIUM_DRIVER, 'llvmpipe');
// L86
assert.doesNotThrow(() => captureGpuOptions({ gpu: 'swiftshader', env: {}, exists: noEgl }));
```

- L89–97: **lavapipe uses the current Vulkan loader override and rejects missing ICD**

```js
// L91
assert.equal(gpu.env.VK_DRIVER_FILES, '/lvp.json');
// L92
assert.equal(gpu.env.VK_ICD_FILENAMES, undefined);
// L93
assert.equal(gpu.env.LP_NUM_THREADS, '2');
// L94
assert.ok(gpu.args.includes('--use-angle=vulkan'));
// L95
assert.throws(() => captureGpuOptions({ gpu: 'lavapipe', env: {}, exists: () => false }), /installed Mesa Vulkan ICD/);
// L96
assert.throws(() => captureGpuOptions({ gpu: 'other', env: {} }), /unsupported GPU/);
```

- L99–109: **scriptIsRenderHeavy matches spec basenames, not substrings**

```js
// L100
assert.equal(scriptIsRenderHeavy("node tools/ci/run-playwright.mjs --project=render", "x"), true);
// L101
assert.equal(scriptIsRenderHeavy("", "render"), true);
// L102
assert.equal(scriptIsRenderHeavy( "node tools/ci/run-playwright.mjs tests/specs/hud-audit.spec.js", "ui"), true);
// L104
assert.equal(scriptIsRenderHeavy( "node tools/ci/run-playwright.mjs tests/specs/debris.spec.js", "physics-core"), false);
// L107
assert.equal(scriptIsRenderHeavy( "node tools/ci/run-playwright.mjs tests/specs/multiplayer-lobby.spec.js", "net"), false);
```

- L111–131: **defaultRemoteWorkers: render-heavy → 1, light llvmpipe → 2, swiftshader → 1**

```js
// L112
assert.deepEqual(defaultRemoteWorkers({ group: "render", gl: "llvmpipe", script: SCRIPTS["test:render"], }), { workers: "1" });
// L115
assert.deepEqual(defaultRemoteWorkers({ group: "ui", gl: "llvmpipe", script: SCRIPTS["test:ui"], }), { workers: "1" });
// L118
assert.deepEqual(defaultRemoteWorkers({ group: "physics-core", gl: "llvmpipe", script: SCRIPTS["test:physics-core"] || "", }), { workers: "2" });
// L121
assert.deepEqual(defaultRemoteWorkers({ group: "net", gl: "llvmpipe", script: SCRIPTS["test:net"] || "", }), { workers: "2" });
// L124
assert.deepEqual(defaultRemoteWorkers({ group: "net", gl: "swiftshader", script: SCRIPTS["test:net"] || "", }), { workers: "1" });
// L127
assert.deepEqual(defaultRemoteWorkers({ group: "net", gl: "llvmpipe", script: SCRIPTS["test:net"] || "", requested: "3", }), { workers: "3" });
// L130
assert.ok(defaultRemoteWorkers({ requested: "9" }).error);
```

- L133–139: **RENDER_HEAVY_SPEC_IDS stays aligned with playwright.config.js RENDER_SPECS**

```js
// L136
assert.ok(block);
// L138
assert.deepEqual([...RENDER_HEAVY_SPEC_IDS].sort(), [...ids].sort());
```

- L141–149: **CI retries run isolated at the end of the shard; local runs keep immediate (#1716)**

```js
// L147
assert.deepEqual(JSON.parse(read(true)), { r: 1, s: "isolated" });
// L148
assert.deepEqual(JSON.parse(read(false)), { r: 0, s: "immediate" });
```

## build-client-drop.test.mjs

Production targets: TrackBuildClient in js/track/build-client.js (build :178, replay :267); ScriptLoader URL hash support; Tracks.diagnosticBuild/setCompactProps in js/track/tracks.js.

Fixtures and inputs: Two fake-worker client harnesses: manual timers/warnings for drop lifecycle, async init/error replies plus captured idle and content-hash map for warm/cache keys. Replay uses recorded mesh/chunk operations, fake handles/time/rAF and generator TLX preparation with identity config.

Contracts and coverage limits: Checks off-during-init, wedged-ready/unready worker null fallback and busy reset, prompt result timer cleanup, exception during model comparison settlement; player/agent idle warm split; build/scenery content-hash URLs with build fallback; diagnostic worker bypass and mode detection; cancellation across upload/preparation boundaries frees prior uploads or creates none, consumes replay once and drops prepared data; upload failures reject. Artificial caps are fired without 30s waiting, and fake worker never executes real build-worker. Replay resource ownership is verified on stub handles, not GPU driver allocations.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L51–62: **turning BUILD IN BACKGROUND off while the worker is still loading settles the build with null**

```js
// L54
assert.equal(workers.length, 1);
// L57
assert.equal(client.busy(), true);
// L59
assert.equal(await built, null);
// L60
assert.equal(client.busy(), false);
// L61
assert.equal(workers[0].terminated, true);
```

- L64–77: **a worker that is up but never answers is dropped after the answer cap**

```js
// L70
assert.equal(workers[0].posts.at(-1).type, "build");
// L71
assert.equal(client.busy(), true);
// L73
assert.equal(await built, null);
// L74
assert.equal(client.busy(), false);
// L75
assert.equal(workers[0].terminated, true);
// L76
assert.ok(warns.some((m) => /no answer/.test(m)));
```

- L79–87: **a worker that never reports ready is dropped after the same cap**

```js
// L84
assert.equal(await built, null);
// L85
assert.equal(client.busy(), false);
// L86
assert.equal(workers[0].terminated, true);
```

- L89–101: **a prompt answer is unaffected and clears its timer**

```js
// L98
assert.equal(m.type, "built");
// L100
assert.equal(workers[0].terminated, false);
```

- L103–121: **a reply whose model comparison throws still settles the build with null and clears busy()**

```js
// L115
assert.equal(await built, null);
// L116
assert.equal(client.busy(), false);
// L117
assert.ok(warns.some((m) => /model table unreadable/.test(m)));
// L118
assert.equal(workers[0].terminated, false);
// L120
assert.equal(workers[0].terminated, false);
```

- L156–165: **idleWarm spawns nothing for a player; the first posted build does**

```js
// L158
assert.equal(C.idleWarm(false), null);
// L159
assert.equal(C.idleWarm(), null);
// L160
assert.equal(idles.length, 0);
// L161
assert.equal(made.length, 0);
// L162
assert.equal(await C.build(0, DEF, OPTS, GFX, null), null);
// L163
assert.equal(made.length, 1);
// L164
assert.deepEqual(made[0].posted, ["init", "build"]);
```

- L167–174: **idleWarm still warms the worker for the agent surface**

```js
// L170
assert.equal(idles.length, 1);
// L172
assert.equal(made.length, 1);
// L173
assert.equal(await C.spawn(), true);
```

- L176–185: **the worker and its scenery import use the deploy's content-hash key (R3-PHONE-8)**

```js
// L180
assert.equal(made[0].url, "http://x/js/track/build-worker.js?v=0123456789ab");
// L181
assert.equal(made[0].messages[1].scenery, "http://x/js/circuits/scenery/monza.js?v=ba9876543210");
// L184
assert.equal(bare.made[0].url, "http://x/js/track/build-worker.js?v=7");
```

- L187–196: **page diagnostic settings bypass worker requests and defaults remain eligible**

```js
// L190
assert.equal(await client.build(0, def, opts, gfx, null), null);
// L191
assert.equal(workers.length, 0);
// L194
assert.equal(workers.length, 1);
// L195
assert.equal(await pending, null);
```

- L198–208: **Tracks reports compact-off and unchunked diagnostic modes**

```js
// L204
assert.equal(tracks.diagnosticBuild(), false);
// L205
assert.equal(tracks.diagnosticBuild(), true);
// L206
assert.equal(tracks.diagnosticBuild(), true);
// L207
assert.equal(tracks.diagnosticBuild(), false);
```

- L210–224: **replay cancellation between upload slices frees uploads and returns null without uploading the rest**

```js
// L220
assert.equal(uploads, 1);
// L221
assert.equal(await result, null);
// L221
assert.equal(uploads, 1);
// L222
assert.deepEqual(freed, [1]);
// L223
assert.equal(await client.replay(msg, def, gfx, 1, () => true), null);
```

- L226–230: **replay upload failures still reject instead of masquerading as cancellation**

```js
// L229
assert.rejects(client.replay(msg, def, { createMesh() { throw new Error("upload refused"); } }, 8, () => true), /upload refused/);
```

- L233–241: **replay cancellation while plain preparation awaits its microtask allocates no uploads**

```js
// L239
assert.equal(await result, null);
// L240
assert.equal(uploads, 0);
```

- L243–259: **replay cancellation during cooperative preparation releases pending payload and allocates no uploads**

```js
// L254
assert.equal(steps, 1);
// L254
assert.equal(typeof resume, "function");
// L256
assert.equal(await result, null);
// L256
assert.equal(steps, 1);
// L257
assert.equal(uploads, 0);
// L257
assert.equal(rec.prepared, null);
// L258
assert.equal(data._tlxPrepared, undefined);
```

## build-gallery.test.mjs

Production targets: tools/track/build-gallery.cjs parseShotMeta :127, collectInputShots :240, build :453, buildHtml imported/exported; tools/lib/screenshot-gallery.cjs screenshotCard :26/renderGallery :37; tools/lib/track-shot-survey.mjs buildTrackShotSurveyPlan.

Fixtures and inputs: Synthetic sharp-generated red/blue PNGs and capture sidecars in cleaned scratch dirs; actual image conversion/gallery output and child CLI; adversarial metadata/URLs and 65 duplicate-name camera jobs.

Contracts and coverage limits: Checks storm/weather-first names, sidecar precedence, distinct same-stem identities/output bytes, standalone embedded webp equality and script-free HTML, output/input nonoverwrite, invalid circuit IDs, escaped captions/metadata, safe image protocols, native link/expansion/empty HTML, missing CLI value and camera-plan download fidelity/chunk sizes 32/32/1 with unique names. No survey branch fetch/capture or real browser rendering/accessibility interaction occurs. Regex markup checks cover supplied strings and do not prove universal HTML sanitization, especially trusted links/body/head injection options.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L11–15: **upstream storm and weather-first filename parsing survives integration**

```js
// L13
assert.equal(m.tod, tod);
// L13
assert.equal(m.condition, weather);
// L13
assert.equal(m.sector, 'orbit');
```

- L16–41: **local capture metadata wins over filenames and same-stem images stay distinct**

```js
// L25
assert.equal(raw.length, 2);
// L25
assert.equal(raw[0].condition, 'rain');
// L25
assert.equal(raw[0].tod, 'dusk');
// L28
assert.doesNotMatch(html, /<script\b|<select\b|\sonclick=/i);
// L30
assert.equal(embedded.length, 2);
// L31
assert.deepEqual(Buffer.from(embedded[0].split(',')[1], 'base64'), fs.readFileSync(path.join(out, m.shots[0].web)));
// L32
assert.rejects(build({input,outRoot:path.join(dir,'invalid'),standalone:true,skipImages:true}), /requires local images/);
// L33
assert.equal(m.shots.length, 2);
// L33
assert.deepEqual(m.surveyBranches, []);
// L34
assert.notEqual(m.shots[0].web, m.shots[1].web);
// L35
assert.notDeepEqual(fs.readFileSync(path.join(out,m.shots[0].web)), fs.readFileSync(path.join(out,m.shots[1].web)));
// L36
assert.equal(m.shots[0].fraction, .25);
// L36
assert.ok(fs.existsSync(path.join(out,'index.html')));
// L37
assert.rejects(build({input,outRoot:out}), /already exists/);
// L38
assert.equal(fs.readFileSync(path.join(out,'sentinel'),'utf8'), 'keep');
// L39
assert.rejects(build({input,outRoot:input}), /already exists/);
// L39
assert.ok(fs.existsSync(path.join(input,'first.png')));
```

- L42–46: **invalid path-like circuit metadata is refused**

```js
// L44
assert.throws(()=>collectInputShots(dir), /Invalid circuit/);
```

- L47–52: **untrusted capture captions cannot introduce executable markup**

```js
// L49
assert.ok(!page.includes('</script><script>window.fixture'));
// L50
assert.match(page, /&lt;\/script&gt;/);
// L51
assert.doesNotMatch(page, /<script\b/i);
```

- L53–56: **CLI rejects a missing output value instead of silently using its default**

```js
// L55
assert.equal(r.status, 1);
// L55
assert.match(r.stderr, /--out requires a value/);
```

- L58–70: **shared screenshot pages expose native group links, expansion and empty states**

```js
// L63
assert.doesNotMatch(page, /<script\b|<select\b|\son[a-z]+=/i);
// L64
assert.match(page, /href="#gallery-1"/);
// L65
assert.match(page, /id="section-1"/);
// L66
assert.match(page, /class="image-view"/);
// L67
assert.match(page, /No captures recorded/);
// L68
assert.match(page, /View &lt;A&gt;/);
// L69
assert.match(page, /&lt;script&gt;bad/);
```

- L72–77: **screenshot images reject executable URLs and retain safe embedded media**

```js
// L74
assert.doesNotMatch(screenshotCard({ title: 'Bad', image }), /<img\b/);
// L76
assert.match(screenshotCard({ title: 'Good', image: 'data:image/png;base64,AAAA' }), /src="data:image\/png;base64,AAAA"/);
```

- L79–87: **capture plans are prebuilt data downloads with faithful camera jobs**

```js
// L83
assert.ok(match);
// L85
assert.deepEqual(plan.shots, [job]);
// L86
assert.doesNotMatch(page, /Export selected|Compare selected|<script/);
```

- L89–97: **large circuit recipe downloads stay executable and preserve every duplicate-named job**

```js
// L94
assert.deepEqual(plans.map(plan => plan.shots.length), [32, 32, 1]);
// L95
assert.equal(buildTrackShotSurveyPlan(plan).shots.length, plan.shots.length);
// L96
assert.equal(new Set(plans.flatMap(plan => plan.shots.map(shot => shot.name))).size, 65);
```

## build-steps.test.mjs

Production targets: Tracks.buildSteps js/track/tracks.js:287, buildPaced :493, build/free; TrackMesh.buildTerrainSteps; tools/track/verify-track.cjs buildContext.

Fixtures and inputs: Actual track VM and Monza/Spa/Vegas builds; recorder hashes pos/nrm/col/idx/mat and instancing channels into SHA1 prefixes after Float64 normalization. PHYS hashes px/py/pz/hw/barL/barR/lineX/lineK. Interleaved Monaco centerline, fake clock/timer, terrain child wrapper and upload/free ledgers inject abandonment/allocation faults.

Contracts and coverage limits: Checks stepped versus synchronous upload order, selected physics arrays/total/phase order, ≥20 yields and interleaving safety; early generator return/rebuild; rafEvery static/dynamic waits with same uploads; synchronous supersession and partial-track handback; terrain profile excludes suspension and child return closes once/free only completed uploads; synchronous/partial prop-batch exceptions free all prior handles and permit rebuild. Recorder comparison is normalized numeric-content equality via truncated digest, not byte-for-byte raw storage type equality, and omits trk unlike build-worker. No actual render-frame timing or GPU free is observed.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L45–70: **`${id}: a stepped build uploads exactly what build() uploads`**

```js
// L65
assert.ok(steps >= 20);
// L66
assert.deepEqual(b.log, a.log);
// L67
assert.deepEqual(physics(tB), physics(tA));
// L68
assert.equal(tB.total, tA.total);
// L69
assert.deepEqual(tB.buildProfile.map((p) => p.n + "/" + p.k), tA.buildProfile.map((p) => p.n + "/" + p.k));
```

- L73–82: **a stepped build abandoned part-way leaves the module able to build again**

```js
// L81
assert.deepEqual(a.log, b.log);
```

- L87–118: **buildPaced: pace.rafEvery keeps one frame wait per N slices, the rest are task yields; same uploads**

```js
// L98
assert.ok(plain.length > 6 && plain.every((ms) => ms === 16));
// L100
assert.ok(frames > 0 && tasks > 0);
// L101
assert.ok(Math.abs(frames * 2 - tasks) <= 2);
// L102
assert.equal(paced[i], 16);
// L103
assert.deepEqual(b.log, a.log);
// L111
assert.ok(before >= 1 && waits.slice(0, before).every((ms) => ms === 16));
// L115
assert.ok(after.some((ms) => ms === 0));
// L116
assert.deepEqual(c.log, a.log);
```

- L120–132: **buildPaced: a newer synchronous build supersedes a paced one in flight, which hands back its partial track**

```js
// L126
assert.equal(await paced, null);
// L127
assert.equal(calls, 1);
// L128
assert.ok(abandoned && abandoned.meshes);
// L131
assert.ok(whole && whole.meshes && whole.total > 0);
```

- L136–158: **terrain slices exclude suspended frames from the geometry profile**

```js
// L147
assert.equal(r.done, false);
// L155
assert.ok(active.slices > 8);
// L156
assert.equal(suspended.slices, active.slices);
// L157
assert.equal(suspended.ms, active.ms);
```

- L160–194: **return during terrain closes the child once and frees only completed uploads**

```js
// L180
assert.equal(r.done, false);
// L184
assert.equal(uploads.length, 2);
// L185
assert.equal(partial.terrainGeo, undefined);
// L186
assert.equal(partial.meshes.terrain, undefined);
// L188
assert.equal(closed, 1);
// L190
assert.deepEqual(freed, uploads);
// L192
assert.ok(completed.terrainGeo && completed.meshes.terrain);
// L193
assert.equal(closed, 1);
```

- L215–225: **a synchronous build that throws frees every upload it made before the throw**

```js
// L220
assert.throws(() => Tracks.build(def, { gfx: L.gfx }), /allocation/);
// L221
assert.ok(L.made.length >= 3);
// L222
assert.deepEqual(liveAfter(L), []);
// L224
assert.ok(again && again.meshes && again.total > 0);
```

- L227–239: **prop batches are owned as each lands, so a batch that throws part-way frees the earlier ones**

```js
// L231
assert.ok(nBatches >= 2);
// L236
assert.throws(() => Tracks.build(def, { gfx: L.gfx }), /device lost/);
// L237
assert.equal(L.made.filter((h) => h.kind === "inst").length, nBatches - 1);
// L238
assert.deepEqual(liveAfter(L), []);
```

## build-worker.test.mjs

Production targets: js/track/build-worker.js worker protocol; TrackBuildClient.build js/track/build-client.js:178 and replay :267; Tracks.build/build/free, Assets model APIs, TrackSurface.profile; TLXShaders preparation in js/render/three/tlx-chunked.js; tools/gfx/gpu-game-check.mjs profile-summary slice.

Fixtures and inputs: Actual worker IIFE VM with importScripts reading manifest TRACK_VM/circuits, postMessage structuredClone with transfer (buffers detach). Main VM recorder hashes geometry including trk and selected PHYS arrays. Bridged pageWithWorker adds disk-fetch pack, customized Teams row and stub PitSigns upload; smallClient/Bridge simulate protocol failures/liveness. Synthetic large records isolate TLX preparation admission.

Contracts and coverage limits: Checks ready, transient import retry/cache-bust, Monza/Vegas parity after replay and repeated transferred-buffer builds, typed channel/index transfer, reconstructed surface/def/real handles, retained geometry/ribbon fallback and once-only replay, worker error replies/default multicore switch/termination, failure cleanup; baked pack/pit-sign/MY TEAM parity, typed CSR terrain grid reuse, exact circuit model IDs/subset fetching/no init fetch, missing-model and custom-circuit fallback; init/send/decode/permit/stale-worker race recovery; fallback resource ownership; liveness cancels only obsolete owners and deduplicates equal owner/key; partial import retry preserves successful const prefix, evaluation failures terminal; immutable TLX F32-before-binning/raw fallback transfer, CPU summary avoiding double-count, largest-first ≤64MiB preparation budget. Protocol is VM/emulated Worker, not browser worker scheduling or GPU execution. Real-transfer path and bridged pack path differ: bridge clones without transfer, while spawnWorker explicitly detaches buffers. Hashes normalize numeric representation and compare selected physics arrays, not every state property; sign painter is stubbed.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L79–81: **the worker loads the page's build modules and answers ready**

```js
// L80
assert.deepEqual(worker.posted.map((m) => m.type), ["ready"]);
```

- L83–105: **importScripts retries transient scenery failures with a cache-busted URL**

```js
// L102
assert.ok(Date.now() - t0 >= 350);
// L103
assert.ok(attempts.some((u) => /retry=1/.test(u)));
// L104
assert.equal(w.posted.at(-1).type, "built");
```

- L108–141: **`${id}: worker build + replay uploads exactly what build() uploads`**

```js
// L117
assert.equal(msg.type, "built");
// L118
assert.ok(msg.recs.length > 5 && msg.ms > 0);
// L122
assert.ok(ArrayBuffer.isView(g[k]));
// L123
assert.ok(g.idx instanceof Uint32Array);
// L125
assert.ok(ArrayBuffer.isView(msg.track.roadGeo.trk));
// L129
assert.deepEqual(b.log, a.log);
// L130
assert.deepEqual(physics(tB), physics(tA));
// L131
assert.equal(tB.total, tA.total);
// L132
assert.equal(tB.def, def);
// L133
assert.deepEqual(Object.keys(tB.meshes).sort(), Object.keys(tA.meshes).sort());
// L136
assert.ok(flat.every((x) => !x || x.__rec === undefined));
// L139
assert.equal(tB.surface.heightAt ? tB.surface.heightAt(s, 0) : 0, tA.surface.heightAt ? tA.surface.heightAt(s, 0) : 0);
```

- L144–159: **a second build in the SAME worker, after its buffers were transferred, still uploads exactly what build() uploads**

```js
// L151
assert.equal(msg.type, "built");
// L152
assert.ok(worker.transferred[before] > 0);
// L156
assert.deepEqual(b.log, a.log);
// L157
assert.deepEqual(physics(tB), physics(tA));
```

- L161–177: **replay stamps _keepPositions when the page asked for trackGeometry**

```js
// L166
assert.equal(msg.type, "built");
// L169
assert.equal(typeof main.Tracks.keepGeometry, "function");
// L170
assert.equal(main.Tracks.setKeepGeometry(true), true);
// L173
assert.ok(tB.propsGeo && tB.propsGeo.pos && tB.propsGeo.pos.length > 0);
// L175
assert.equal(tB.propsGeo._keepFullGeometry, true);
```

- L179–194: **a ribbon the backend did not chunk is re-seated as tracks.js does it**

```js
// L185
assert.ok(ribbons.length > 0);
// L190
assert.equal(t.meshes[k], null);
// L191
assert.equal(t.meshes[k.slice(0, -7)].kind, "small");
// L193
assert.equal(await main.TrackBuildClient.replay(msg, def, small.gfx), null);
```

- L196–201: **a worker error answers an error message, never a throw**

```js
// L199
assert.equal(worker.posted[0].type, "error");
// L200
assert.equal(worker.posted[0].seq, 3);
```

- L203–217: **BUILD IN BACKGROUND's write flips exactly what enabled() (and loadTrackStepped) reads**

```js
// L209
assert.equal(C.enabled(), true);
// L211
assert.equal(C.enabled(), false);
// L213
assert.equal(mem.get("apex26.buildWorker"), "0");
// L213
assert.equal(C.enabled(), false);
// L214
assert.equal(C.enabled(), true);
// L215
assert.equal(C.enabled(), false);
```

- L221–243: **turning BUILD IN BACKGROUND off terminates the worker; on spawns a fresh one**

```js
// L234
assert.equal(made.length, 1);
// L235
assert.deepEqual(made[0].posted, ["init"]);
// L237
assert.equal(made[0].terminated, 1);
// L239
assert.equal(made[0].terminated, 1);
// L241
assert.equal(made.length, 2);
// L242
assert.equal(made[1].terminated, 0);
```

- L245–262: **a replay whose upload throws frees the handles it had already made**

```js
// L259
assert.rejects(main.TrackBuildClient.replay(msg, def, gfx), /allocation/);
// L260
assert.ok(made.length >= 2);
// L261
assert.deepEqual(made.filter((h) => !freed.includes(h)), []);
```

- L335–359: **worker world == main-thread world WITH baked models, pit signs and MY TEAM**

```js
// L339
assert.ok(resident > 20);
// L342
assert.match(String(tA.meshes.pitSignTex), /ZEPHYR RACING/);
// L347
assert.ok(msg);
// L348
assert.deepEqual([...msg.models].sort(), [...circuitIds(page, id)].sort());
// L350
assert.deepEqual(b.log, a.log);
// L351
assert.equal(tB.meshes.pitSignTex, tA.meshes.pitSignTex);
// L352
assert.deepEqual(physics(tB), physics(tA));
// L358
assert.notDeepEqual(c.log, a.log);
```

- L361–377: **the worker's reply carries the terrain lookup grid as flat typed arrays (perf hunt #3113 F3)**

```js
// L366
assert.ok(msg);
// L370
assert.ok(grid);
// L371
assert.ok(ArrayBuffer.isView(grid[k]));
// L372
assert.equal(grid.geo, msg.track.terrainGeo);
// L374
assert.ok(Number.isFinite(y));
// L375
assert.equal(msg.track._terrGrid, grid);
```

- L379–385: **a worker holding fewer models than the page answers null (build in steps)**

```js
// L384
assert.equal(msg, null);
```

- L390–406: **the worker fetches only the circuit's own models, none at init**

```js
// L395
assert.ok(want.length > 0 && want.length < page.Assets.models().length);
// L396
assert.equal(await page.TrackBuildClient.spawn(), true);
// L397
assert.deepEqual(workerFetched.filter((u) => /\.ax26|models\//.test(u)), []);
// L399
assert.ok(msg);
// L403
assert.ok(modelFetches.length > 0);
// L404
assert.ok([...files].some((f) => bare(u).endsWith("/" + f)));
// L405
assert.deepEqual([...msg.models].sort(), [...want].sort());
```

- L408–426: **a worker missing one of the circuit's model ids answers null, whatever its count**

```js
// L416
assert.ok(want.every((m) => page.Assets.modelSync(m)));
// L419
assert.equal(await page.TrackBuildClient.spawn(), true);
// L423
assert.ok(have >= want.length);
// L425
assert.equal(msg, null);
```

- L428–434: **a custom circuit never goes to the worker**

```js
// L431
assert.equal(msg, null);
// L432
assert.deepEqual(posts, []);
```

- L447–478: **caught worker import failure settles the build, drops the worker and allows a retry**

```js
// L465
assert.equal(c.busy(), true);
// L471
assert.equal(settled, true);
// L472
assert.equal(await build, null);
// L473
assert.equal(c.busy(), false);
// L474
assert.equal(workers[0].terminated, true);
// L475
assert.equal(await c.spawn(), true);
// L477
assert.equal(workers[1].terminated, undefined);
```

- L480–495: **synchronous init post failure and unreadable replies also settle readiness**

```js
// L491
assert.equal(await c.build(0, { id: "monza" }, {}, {}, null), null);
// L492
assert.equal(c.busy(), false);
// L493
assert.equal(worker.terminated, true);
```

- L497–525: **build postMessage failure clears pending timers, falls back and permits a later request**

```js
// L513
assert.equal(await c.build(0, { id: "monza" }, {}, {}, null), null);
// L514
assert.equal(c.busy(), false);
// L515
assert.equal(timers.size, 0);
// L516
assert.equal(workers[0].terminated, true);
// L518
assert.equal(answer.type, "built");
// L519
assert.equal(workers.length, 2);
// L520
assert.equal(c.busy(), false);
// L521
assert.equal(timers.size, 0);
// L524
assert.equal(workers[1].terminated, undefined);
```

- L528–554: **`replay owns fallback resources through reconstruction (${failure || "success"})`**

```js
// L544
assert.rejects(c.replay(msg, { id: "monza" }, gfx), new RegExp(failure + " allocation"));
// L545
assert.deepEqual(new Set(freed), new Set(made));
// L546
assert.equal(freed.length, made.length);
// L549
assert.deepEqual(freed, [made[1]]);
// L550
assert.equal(t.meshes.road, made[2]);
// L551
assert.equal(t.meshes.props, made[0]);
// L552
assert.equal(t.meshes.roadChunked, null);
```

- L558–609: **opt-in liveness cancels obsolete init/model waits without canceling independent owners**

```js
// L591
assert.equal(await a, null);
// L591
assert.equal(await b, null);
// L592
assert.deepEqual(posts.filter(p => p.type === "build").map(p => p.id), ["c"]);
// L593
assert.equal((await c).id, "c");
// L594
assert.equal((await duplicateC).id, "c");
// L595
assert.deepEqual(built, ["c"]);
// L598
assert.equal(await stale, null);
// L600
assert.equal((await current).id, "b");
// L601
assert.deepEqual(built, ["c", "b"]);
// L604
assert.equal(await backedOut, null);
// L607
assert.deepEqual((await Promise.all(independent)).map(m => m.id), ["a", "b", "c"]);
// L608
assert.equal(client.busy(), false);
// L608
assert.equal(bridge.terminated, undefined);
```

- L612–634: **a rejected liveness permit send settles its owner and permits worker recovery**

```js
// L628
assert.equal(await c.build(0, { id: "a" }, {}, {}, null, () => true), null);
// L629
assert.equal(c.busy(), false);
// L629
assert.equal(workers[0].terminated, true);
// L632
assert.equal((await fresh).id, "b");
// L633
assert.equal(workers[1].terminated, undefined);
```

- L637–659: **a ready result cannot post an old request to a same-turn replacement worker**

```js
// L653
assert.equal(await old, null);
// L654
assert.equal(posts.filter(p => p.data.type === "build").length, 0);
// L656
assert.equal((await fresh).id, "fresh");
// L657
assert.deepEqual(posts.filter(p => p.data.type === "build").map(p => p.data.id), ["fresh"]);
// L658
assert.equal(c.busy(), false);
```

- L661–673: **partial import retry evaluates the successful const prefix once**

```js
// L671
assert.equal(w.posted.at(-1).type, "ready");
// L672
assert.deepEqual(attempts, ["first.js", "second.js", "second.js?retry=1"]);
```

- L675–683: **import evaluation errors are terminal without reexecuting a changed global**

```js
// L680
assert.equal(w.posted.at(-1).type, "error");
// L681
assert.equal(calls, 1);
```

- L685–709: **worker prepares immutable TLX buffers after build and transfers raw fallback inputs once**

```js
// L700
assert.equal(msg.type, "built");
// L701
assert.equal(msg.seq, 71);
// L703
assert.equal(prepared.attributes.position.array[0], 72);
// L704
assert.equal(prepared.lampCells[0].gx, 1025);
// L705
assert.equal(args[0].pos[0], 71.9999999);
// L706
assert.ok(msg.prepareMs >= 0);
// L707
assert.equal(w.transferred.at(-1), 5);
// L708
assert.equal(vm.runInContext("geometry.pos.byteLength", w.ctx), 0);
```

- L711–731: **worker profile summary counts elapsed worker CPU once and records main replay CPU**

```js
// L721
assert.equal(summary.workerCpuMs, 125);
// L722
assert.equal(summary.workerPrepareMs, 25);
// L723
assert.equal(summary.mainCpuMs, 20);
// L724
assert.equal(summary.totalMs, 145);
// L725
assert.equal(summary.upMs, 20);
// L726
assert.equal(summary.gpuWaitMs, null);
// L728
assert.equal(main.totalMs, 100);
// L728
assert.equal(main.geoShare, 0.8);
// L730
assert.equal(legacy.totalMs, 100);
// L730
assert.equal(legacy.mainCpuMs, null);
```

- L733–750: **worker preparation admits Monaco-sized props ahead of earlier terrain within its cumulative budget**

```js
// L744
assert.equal(msg.type, "built");
// L745
assert.deepEqual(msg.recs.map(r=>r.args[0].pos.length), [300000,1004124,3000]);
// L746
assert.equal(msg.recs[0].prepared, undefined);
// L747
assert.ok(msg.recs[1].prepared);
// L748
assert.ok(msg.recs[2].prepared);
// L749
assert.ok(msg.preparationBytes<=64*1048576);
```

## cam-avoid-vm.test.mjs

Production targets: G.camVantage → GameCams.vantage (js/camera/vantage.js:441), CamAvoid.freeEye/roadClear; ExtraRigs pitWall (js/camera/extra-rigs.js:132); __apex.cinematic → FlybySight/FlybySeq clearance.

Fixtures and inputs: createGame real Monza/Monaco/Vegas/Singapore/Mexico VMs with cleanup. Snap/reduceMotion/dt0 static solves; 1m lap sweep excluding horizontal cuts ≥3m; ±10m seam/L/2 half-metre samples, 5m pitwall samples and 50 cinematic fractions.

Contracts and coverage limits: Checks <1.5m vertical heave for low/cinematic Monza/Monaco, Monza gantry delta <.5m, 20 shipped modes finite at seam/L/2 with rounded 0.52m eye step, pitwall no off-road solid intersections for three circuits, clear cinematic eye/sight transmission ≥.5 versus ≥10 blocked default samples for two. Seam test checks target finiteness but its distance predicate uses only eye xyz. Finite/discrete samples do not prove continuous clearance or all circuits/moving damper behavior; the exact 20-mode count makes additions fail until updated.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L67–70: **`${id} ${mode}: no overhead structure heaves the eye`**

```js
// L69
assert.ok(max < 1.5);
```

- L74–78: **the start gantry (Monza s=5) no longer lifts the LOW eye**

```js
// L77
assert.ok(Math.abs(y(5) - y(2)) < 0.5);
```

- L80–100: **every mode steps <= 0.52 m (2 dp) per 0.5 m of arc across the s=0 seam and L/2**

```js
// L83
assert.equal(modes.length, 20);
// L91
assert.ok(e.every(Number.isFinite));
// L94
assert.ok(+d.toFixed(2) <= 0.52);
```

- L103–112: **`${id} pitwall: the eye is never inside a solid prop off the road`**

```js
// L111
assert.deepEqual(bad.slice(0, 5), []);
```

- L116–130: **`${id} __apex.cinematic({clear}): every lap sample has a clear eye and sightline`**

```js
// L123
assert.equal(r0.clear, undefined);
// L128
assert.ok(before >= 10);
// L129
assert.deepEqual(after, []);
```

## cam-avoid.test.mjs

Production targets: CamAvoid js/camera/cam-avoid.js applies :20, roadClear :43, freeEye :68; vantage integration js/camera/vantage.js:824.

Fixtures and inputs: Real module VM with box-based FlybySeq/straight-road Tracks stubs and captured clearEye count. Synthetic gantry/stand cases cover corridor and margin geometry; source regex inspects vantage.

Contracts and coverage limits: Checks four broadcast modes apply while chase/trackside/cockpit do not; open circuit steps inward, street preserves lateral position, both roof-net behavior; road-spanning/margin-only boxes exempt eye, off-corridor solid lifts to roof+2m; source has avoidance call and trackside branch. This is not a real scenery sweep and integration regex does not prove call order despite test title saying after look-back; that order is separately visible at vantage:797–825. Does not assert applies false for every other mode or MAX_STEP work bound.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L18–27: **applies only to broadcast modes (heli/side/cinematic/low)**

```js
// L20
assert.equal(CamAvoid.applies("heli"), true);
// L21
assert.equal(CamAvoid.applies("side"), true);
// L22
assert.equal(CamAvoid.applies("cinematic"), true);
// L23
assert.equal(CamAvoid.applies("low"), true);
// L24
assert.equal(CamAvoid.applies("chase"), false);
// L25
assert.equal(CamAvoid.applies("trackside"), false);
// L26
assert.equal(CamAvoid.applies("cockpit"), false);
```

- L29–55: **open circuit: steps eye toward the road until clear, then clearEye lifts**

```js
// L51
assert.ok(eye[0] < 20);
// L52
assert.ok(eye[0] >= frame.hw);
// L53
assert.equal(clears, 1);
// L54
assert.equal(FlybySeq.insideProp(track, eye, 2), null);
```

- L57–69: **street circuit: skips lateral step-in (corr already owns width), keeps the lift net**

```js
// L67
assert.equal(eye[0], 25);
// L68
assert.equal(clears, 1);
```

- L93–100: **the road is clear: an eye on the corridor is not lifted by a box over the tarmac**

```js
// L99
assert.equal(eye[1], 0.8);
```

- L102–108: **the road is clear: a box that only its 2 m margin reaches does not lift a road-edge eye**

```js
// L107
assert.equal(eye[1], 0.8);
```

- L110–116: **off the corridor a solid box still lifts the eye**

```js
// L115
assert.equal(eye[1], 12);
```

- L118–123: **vantage.js calls CamAvoid for broadcast modes after look-back**

```js
// L120
assert.match(v, /CamAvoid\.applies\(mode\)/);
// L121
assert.match(v, /CamAvoid\.freeEye\(track, eye, cvA\)/);
// L122
assert.match(v, /mode === "trackside"/);
```

## cam-comfort.test.mjs

Production targets: CamComfort js/camera/cam-comfort.js detectTouch/Xr, active :41, boot :100, fxGet/Set/applyFx; mode-switch boot and game comfort source references.

Fixtures and inputs: Real standalone IIFE with raw/JSON Map store, optional revision counters/rawDel, fake navigator/window/matchMedia and optional renderer-hook capture.

Contracts and coverage limits: Checks touch/XR detection (not XR-based auto activation), first-touch auto on/no overwrite, desktop no-op, reduced-motion FX notch1/default units and stored hook payload, preference/explicit motion-off precedence, textual integration, desktop XR ignore/legacy on deletion but phone retention; revision memoization and no-rev rereads; finite numeric rounded/clamped FX knobs and unknown IDs rejected. Renderer hook is optional and stubbed; no shader effect, user settings interaction, headset session, OS accessibility or actual storage event observed.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L31–38: **detectTouch / detectXr read navigator capabilities**

```js
// L33
assert.equal(CC.detectTouch({ maxTouchPoints: 2 }, {}), true);
// L34
assert.equal(CC.detectTouch({ maxTouchPoints: 0 }, {}), false);
// L35
assert.equal(CC.detectTouch({ maxTouchPoints: 0 }, { ontouchstart: null }), true);
// L36
assert.equal(CC.detectXr({ xr: {} }), true);
// L37
assert.equal(CC.detectXr({}), false);
```

- L40–50: **boot writes on when touch and key unset; never overwrites a choice**

```js
// L43
assert.equal(CC.boot(s1, { maxTouchPoints: 5 }, {}), "on");
// L44
assert.equal(s1.raw(CC.KEY), "on");
// L45
assert.equal(CC.boot(s1, { maxTouchPoints: 5 }, {}), null);
// L48
assert.equal(CC.boot(s2, { maxTouchPoints: 5 }, {}), null);
// L49
assert.equal(s2.raw(CC.KEY), "off");
```

- L52–57: **boot is a no-op on desktop without XR**

```js
// L55
assert.equal(CC.boot(s, { maxTouchPoints: 0 }, {}), null);
// L56
assert.equal(s.raw(CC.KEY), null);
```

- L59–76: **reduced-motion boot preselects both renderer comfort hooks off**

```js
// L61
assert.equal(CC.FX_DEFS.every((d) => d.unit === ""), true);
// L66
assert.equal(s.get("motionBlur"), 1);
// L67
assert.equal(s.get("speedLines"), 1);
// L73
assert.deepEqual({ ...CC.applyFx(G, s) }, { motionBlur: 7, speedLines: 4 });
// L74
assert.deepEqual({ ...applied }, { motionBlur: 7, speedLines: 4 });
```

- L78–83: **active follows the stored preference**

```js
// L80
assert.equal(CC.active(rawStore({ [CC.KEY]: "on" })), true);
// L81
assert.equal(CC.active(rawStore({ [CC.KEY]: "off" })), false);
// L82
assert.equal(CC.active(rawStore()), false);
```

- L85–90: **mode-switch boots CamComfort; game.js camComfort ORs it**

```js
// L87
assert.match(ms, /CamComfort\.boot/);
// L89
assert.match(g, /CamComfort\.active\(\)/);
```

- L92–97: **boot ignores navigator.xr: desktop Chromium exposes it with no headset**

```js
// L95
assert.equal(CC.boot(s, { maxTouchPoints: 0, xr: {} }, {}), null);
// L96
assert.equal(s.raw(CC.KEY), null);
```

- L99–109: **boot drops the old XR auto value on a non-touch device, keeps it on touch**

```js
// L103
assert.equal(CC.boot(desk, { maxTouchPoints: 0, xr: {} }, {}), null);
// L104
assert.equal(desk.raw(CC.KEY), null);
// L105
assert.equal(CC.active(desk), false);
// L108
assert.equal(phone.raw(CC.KEY), "on");
```

- L111–121: **an explicit REDUCE MOTION: OFF wins over the touch auto-pick**

```js
// L116
assert.equal(CC.active(s), true);
// L118
assert.equal(CC.active(s), false);
// L120
assert.equal(CC.active(s), true);
```

- L123–148: **active() is memoised on the store's rev / rawRev: no raw read per frame, every store write re-reads**

```js
// L134
assert.equal(CC.active(s), true);
// L135
assert.equal(CC.active(s), true);
// L136
assert.equal(reads, 1);
// L138
assert.equal(CC.active(s), false);
// L139
assert.equal(reads, 2);
// L141
assert.equal(CC.active(s), false);
// L143
assert.equal(CC.active(s), true);
// L145
assert.equal(CC.active(plain), true);
// L147
assert.equal(CC.active(plain), false);
```

- L150–167: **fxSet clamps to the knob range, rounds to a notch, and rejects non-numbers**

```js
// L154
assert.equal(CC.fxSet(s, "motionBlur", d.max + 50), true);
// L155
assert.equal(s.get("motionBlur"), d.max);
// L157
assert.equal(s.get("motionBlur"), d.min);
// L159
assert.equal(s.get("motionBlur"), d.min + 1);
// L160
assert.equal(CC.fxGet(s, "motionBlur"), d.min + 1);
// L162
assert.equal(CC.fxSet(s, "motionBlur", bad), false);
// L164
assert.equal(s.get("motionBlur"), d.min + 1);
// L165
assert.equal(CC.fxSet(s, "nope", 3), false);
// L166
assert.equal(s._disk.has("nope"), false);
```

## cam-context-alloc.test.mjs

Production targets: CamTune js/camera/offsets.js get :267, scopeKey/refreshStoredContext/importPack/values/comfortGet/setContext.

Fixtures and inputs: Real offsets VM with counting GameStore, three-team array and v2 profile pack (car dist 2/4/6, Monza track dist3), injected writes/revision and roster replacement; no-rev variant.

Contracts and coverage limits: Checks ≤one read pair across 200 get/comfortGet/values rounds, immediate team and track override after revision, stored scope overrides explicit context, LIST replacement remaps team without store write, nonnumeric/missing revision rereads and sees direct disk mutation. Counts reads, not allocations or actual heap bytes/CPU. It tests LIST identity replacement, not in-place same-array edits; memo validity depends on real store revision discipline.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L47–55: **knob reads with storage unchanged re-read the stored context at most once**

```js
// L53
assert.ok(reads.trackId <= 1 && reads.team <= 1);
// L54
assert.equal(C.get("chase", "dist"), 2);
```

- L57–65: **a Store write is seen by the next read**

```js
// L60
assert.equal(C.get("chase", "dist"), 2);
// L62
assert.equal(C.get("chase", "dist"), 4);
// L64
assert.equal(C.get("chase", "dist"), 3);
```

- L67–75: **setContext is still overridden by stored values on the next read**

```js
// L70
assert.equal(C.get("chase", "dist"), 2);
// L73
assert.equal(C.get("chase", "dist"), 2);
// L74
assert.deepEqual({ ...C.context() }, { track: "spa", car: "mclaren" });
```

- L77–83: **a Teams.LIST swap with no Store write re-reads the team**

```js
// L80
assert.equal(C.get("chase", "dist"), 2);
// L82
assert.equal(C.get("chase", "dist"), 6);
```

- L85–94: **a store without a numeric rev keeps reading every call**

```js
// L91
assert.ok(reads.team >= 10);
// L93
assert.equal(C.get("chase", "dist"), 4);
```

## cam-motion.test.mjs

Production targets: Tools checkCamMotion tools/shot/cam-motion.mjs:93 → actual camera IIFEs; GameCams.vantage js/camera/vantage.js:441 and CamFeel; tests/helpers/camera-rig.mjs synthetic BEND.

Fixtures and inputs: checkCamMotion loads independent straight fixture with corner knobs zero and compares parked/live/braked/slid solves; shared loadRig uses real drive/feel/extra-rigs/vantage with synthetic curved track and CamTune stub. chaseAimLat toggles null(default) versus zero corner lead and resets follow.

Contracts and coverage limits: Checks aggregate motion checker ok with exactly18 modes; checker pins speed opening/height/lens/signature separation, fixed eyes for non-opening modes, drift slide and chase braking; curved chase aim sign/magnitude in left/right turns and centered straight. Test name each camera moves differently overstates pairwise uniqueness: checker uses selected relationships and many modes deliberately stay bolted. No full mode-pair signature uniqueness, pixels or shipped tuner persistence is proven.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L9–13: **on a straight, each camera moves differently through speed, a brake, and a slide**

```js
// L11
assert.equal(r.ok, true);
// L12
assert.equal(r.rows.length, 18);
```

- L27–36: **chase corner lead swings the aim into a bend, left bend one way, right the other, none on a straight**

```js
// L31
assert.ok(K(left) > 0.01 && K(right) < -0.01 && Math.abs(K(straight)) < 1e-9);
// L33
assert.ok(swing(left) < -0.1);
// L34
assert.ok(swing(right) > 0.1);
// L35
assert.ok(Math.abs(swing(straight)) < 0.02);
```

## cam-round2.test.mjs

Production targets: GameCams.vantage js/camera/vantage.js:441, CamFeel drive/follow/free-look, ExtraRigs droneFollow/pit auto/resetAuto js/camera/extra-rigs.js:249; director noLook source guard.

Fixtures and inputs: Shared camera-rig CAM_FILES real solvers but CamTune/synthetic Tracks stubs; lazy realEnv uses real centerline Monaco/Spa/Monza, with TrackPit and TrackSurface only when asked. approach warms60 frames; pastWall finds nearest node in bounded arc neighborhood. Synthetic chicane/damper and 30/60/144Hz paths, NaN inputs and custom pit modes.

Contracts and coverage limits: Checks Monaco broadcast hang/barrier and chase/far/drift/reverse outside-wall cases, Spa reverse ≥.45m ground clearance, look-back/glance player-only with PiP/TV controls, upper FOV ≤110 after lens delta, NaN finite/hold, bend-side ≤6 crossings and stateless sign, eight modes RMS<.2m versus144Hz, ten modes finite Monza lap and ≤3m residual horizontal jumps, drone lag within .15m and pit reset no stale restore. Real tracks are centerlines/surfaces, not full scenery builds; CamTune stub isolates rig behavior. FOV title says20–110 but assertion only measures maximum. Frame-rate test adds a modeled outer damper rather than invoking game render loop; Monza jump guard checks horizontal residual only.

Per-test assertion ledger follows. Each title states the intended contract; the exact predicate/expected-value expressions expose the actual oracle and limits. Locations refer to the hashed test file. Assertion messages are omitted; expressions are whitespace-normalized without shortening. Callback-local helper assertions are included, so a row is a source contract rather than a count of runtime evaluations.

- L71–85: **C2/C5: Monaco CORNER HANG 2 keeps heli/side/cinematic inside the barrier (the pinched 3.3 m wall too)**

```js
// L82
assert.ok(worst <= 0);
```

- L87–101: **C3: Monaco chase/far/drift/reverse hang stays inside the barrier with the car at the outside wall**

```js
// L99
assert.ok(worst <= 0);
```

- L103–127: **C6: Spa reverse keeps real clearance over the Raidillon crest (ground read at the eye's arc)**

```js
// L126
assert.ok(minClr >= 0.45);
```

- L129–151: **C4: the player's look-back key and free-look glance do not spin the PiP or a TV-director solve**

```js
// L138
assert.deepEqual(solve(pip), base);
// L140
assert.ok(Math.abs(Math.abs(aim(player) - aim(base)) - Math.PI) < 1e-6);
// L142
assert.ok(Math.abs(aim(tv) - aim(base)) < 1e-6);
// L145
assert.ok(Math.abs(rig.feel.freeLookState().yaw) > 0.1);
// L146
assert.ok(Math.abs(aim(solve(pip)) - aim(base)) < 1e-6);
// L147
assert.ok(Math.abs(aim(solve({ att: {}, noLook: true })) - aim(base)) < 1e-6);
// L148
assert.ok(Math.abs(aim(solve({ att: {} })) - aim(base)) > 0.1);
// L150
assert.match(dir, /att: car, noLook: true/);
```

- L153–166: **C7: the solved FOV stays inside the documented 20-110 clamp after CamFeel.drive adds its lens delta**

```js
// L165
assert.ok(maxFov <= 110 + 1e-9);
```

- L168–182: **C8: a non-finite input never reaches the camera damper (inputs sanitised, last finite pose held)**

```js
// L174
assert.ok(finite(rig.cams.vantage(track, "chase", 200, 0, NaN, 0, ex)));
// L176
assert.ok(finite(lastOk));
// L179
assert.ok(finite(bad));
// L180
assert.deepEqual(bad.eye, g.eye);
// L181
assert.equal(bad.fov, g.fov);
```

- L184–206: **C9: a chicane does not flip the heli/side/cinematic bend side faster than the dwell allows**

```js
// L199
assert.ok(crossings <= 6);
// L205
assert.ok(lat(1 / 80) > 5 && lat(-1 / 80) < -5);
```

- L208–236: **eye path stays frame-rate independent (30/60 vs 144 Hz rms < 0.2 m), through the hysteresis too**

```js
// L233
assert.ok(rms < 0.2);
```

- L238–256: **a real Monza lap at 60 Hz solves finite in every mode and never jumps beyond the car's own travel**

```js
// L249
assert.ok(v.eye.concat(v.tgt, [v.fov]).every(Number.isFinite));
// L254
assert.ok(worst <= 3);
```

- L258–271: **C13: the drone's steady-state lag behind a moving car is the same at 30, 60 and 144 Hz**

```js
// L270
assert.ok(Math.abs(l30 - l144) < 0.15 && Math.abs(l60 - l144) < 0.15);
```

- L273–285: **C12: ExtraRigs.resetAuto clears the pit auto-cut bookkeeping**

```js
// L276
assert.equal(typeof ER.resetAuto, "function");
// L281
assert.equal(ER.tickPitAuto(G), "pitwall");
// L284
assert.equal(ER.tickPitAuto(G), null);
```
