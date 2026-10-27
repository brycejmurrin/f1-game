# Vendor batch 10 — Three core curves, geometry, materials, animation and loading

Static source inspection of `vendor/three-0.186.1/three.core.min.js`, half-open UTF-8 byte interval **[202048, 302048)** (100,000 bytes). Read the entire interval in ten consecutive 10,000-byte calls, each returned without truncation. No vendored JavaScript was executed. Python was used only to read bytes, compute SHA-256, and inspect source text. No network, browser, tests, or commits.

## Integrity ledger

Whole file: 389,329 bytes; SHA-256 `dae72ed2eea6703b95e6b57e26469ffa95733a9320675b4bfd1b5f5df1c12f8b`.

Assigned part SHA-256: `3e2159a8a4f4c69149cfe92caa324de198f371306270f4521f311057d690eb8d`.

| Read byte interval | SHA-256 |
|---|---|
| [202048, 212048) | `ce5f4ebc9799940ab1235ed0bd993579114a9e7e17bac1c628e5783a13325eb2` |
| [212048, 222048) | `d8cec2bb11ed03b7fa3008086837aef559f20482e2f7d1e18bdd41072b57f45e` |
| [222048, 232048) | `77fb436540f5ef255bf9d4c1770699731e5e82ff8da5ff43b7893893f5d27235` |
| [232048, 242048) | `09aba6229920dffdfea062cb473b1e0bdfbfdd5f03995604ceb74bca49083e8a` |
| [242048, 252048) | `46e01182c9f15fdfa8ceab791a9bd41817f7e750c6053dcf54e5f7491996b4ad` |
| [252048, 262048) | `6fe462343b3acce637204758ead915f1069b6c34ac4a5033015948c302e1d4f1` |
| [262048, 272048) | `cc197012b17932fb5634f9c9bd2b0c4bb7a1c389718afc0bfe6bc990c7190d5b` |
| [272048, 282048) | `24825ac4316d28063bb998295f5e5db736783068725688684dd0b6a5d20f64ff` |
| [282048, 292048) | `cc02e83bea9c4b3b966c9909650a4a0a3a2baa92a1bb98d12cdd6c4af2ea030a` |
| [292048, 302048) | `dbbe5b70ce20b86e58c169c84f2bc7780e6a5ef10cf4d5f120ae31d5e21a10c7` |

## Semantic map

The first byte is inside `EllipseCurve` (`zh`) rotation arithmetic and the last byte is inside `ObjectLoader.parseImagesAsync`. Both classes cross batch boundaries. The following names describe source semantics; minified identifiers are local bundle bindings.

| Bindings / public names | Responsibilities and links |
|---|---|
| `zh` EllipseCurve tail; `Ch` ArcCurve | Ellipse rotation, copy and JSON fields; ArcCurve delegates equal x/y radii to ellipse. |
| `Ih`, `Bh/kh`, `Oh/Ph/Rh`; `Eh` CatmullRomCurve3 | Cubic polynomial initialization/evaluation, shared scratch vectors/polynomials; closed/open endpoint extrapolation, centripetal/chordal nonuniform knots with near-zero spacing guards, or tension-based Catmull-Rom. |
| `Nh`, `Vh`, `Lh`; `Fh/Dh`, `Uh/jh`, `Wh/Jh`, `qh` | Scalar Catmull-Rom, quadratic and cubic Bézier basis helpers; public CubicBezierCurve/3, LineCurve/3, QuadraticBezierCurve/3 and SplineCurve. Point/tangent methods, deep vector copy and JSON round trips. |
| `Hh`, `Xh`, `Yh`, `Gh` | Frozen curve constructor lookup; CurvePath caches cumulative curve lengths and samples composite paths; Path builds line/Bézier/spline/arc/ellipse segments while tracking currentPoint; Shape adds UUID and hole Paths, extraction and JSON. |
| `Zh`, `$h`, `Qh`, `Kh`, `tl/el`, `sl/il`, `rl/nl/al`, `ol/hl`, `ll/cl`, `ul/dl/pl/ml/yl/gl/fl`, `xl/bl/vl/wl` | Ear clipping triangulator: linked rings, duplicate/collinear removal, hole bridging, Morton z-order acceleration for larger inputs, ordinary/hashed ear tests, local intersection cure and split fallback. Remaining helpers implement orientation, intersection, point containment, diagonal validity and linked-node mutations. `Ml.triangulate` wraps it. |
| `Sl`, `_l`, `Al` | Public ShapeUtils: signed area, clockwise test and triangulateShape; strips duplicate terminal vertices, flattens contour/holes and groups triangle indices. |
| `Tl`, `zl` | ExtrudeGeometry, with cap/side material groups, shape winding normalization, close-point removal, optional bevel layers and bevel movement vectors, optional extrudePath/Frenet frames (disables bevel), generated positions/UVs/normals; default top/side UV generator. Serializes shape references and optional curve path. |
| `Cl`, `Il`, `Bl`, `kl`, `Ol`, `Pl`, `Rl`, `El`, `Nl`, `Vl`, `Ll`, `Fl`, `Dl` | Icosahedron, Lathe, Octahedron, Plane, Ring, Shape, Sphere, Tetrahedron, Torus, TorusKnot, Tube and Wireframe geometry constructors. Indexed position/normal/UV generation except wireframe edges; Tube exposes Frenet frame arrays; wireframe helper `Dl` deduplicates both edge directions. Copy/fromJSON retain construction parameters. |
| `Ul` | Frozen geometry registry, also including earlier-batch Box/Capsule/Circle/Cone/Cylinder/Dodecahedron/Edges/Polyhedron; consumed by ObjectLoader. |
| `jl`, `Yl`, `Gl`, `Zl`, `$l`, `Ql`, `Kl`, `tc`, `ec`, `sc`, `ic`, `rc`, `nc` | Public ShadowMaterial, ShaderMaterial, RawShaderMaterial, MeshStandardMaterial, MeshPhysicalMaterial, MeshPhongMaterial, MeshToonMaterial, MeshNormalMaterial, MeshLambertMaterial, MeshDepthMaterial, MeshDistanceMaterial, MeshMatcapMaterial and LineDashedMaterial. Constructors establish flags/defaults and call setValues; copy methods clone value objects but share texture references. ShaderMaterial handles uniforms, shader strings, defines/extensions and typed JSON. PhysicalMaterial feature setters increment version when crossing enabled/disabled thresholds; reflectivity derives from IOR. |
| `Wl`, `Jl`, `ql`, `Hl`, `Xl` | cloneUniforms, mergeUniforms, cloneable-value predicate, getUnlitUniformColorSpace and UniformsUtils alias object. Render-target textures warn and clone as null; ordinary recognized vectors/matrices/colors/textures/quaternions clone; arrays copy or clone elements. Output color space depends on default versus XR/ordinary render target. |
| `ac/oc/hc/lc/cc`, `uc` | AnimationUtils conversion, tangent detection, sorted key order, stride-based reordering and JSON flattening. subclip filters frame range and shifts earliest key to zero; makeClipAdditive subtracts reference samples, or quaternion-conjugate multiplies, then sets additive blend mode. |
| `dc`, `pc`, `mc`, `yc`, `gc`, `fc/xc/bc` | Interpolant with cached interval search and endpoint sample copying; CubicInterpolant ending rules, LinearInterpolant, DiscreteInterpolant, BezierInterpolant. Bézier time inversion uses bounded Newton iterations; missing tangents fall back to linear. |
| `vc`, `wc`, `Mc/Sc/_c/Tc/zc/Cc`, `Ac` | KeyframeTrack factories for discrete/linear/smooth/Bézier interpolation, shift/scale/trim/validate/optimize/clone and JSON; tangent time scaling helper. Boolean/Color/Number/Quaternion/String/Vector track subclasses; QuaternionLinearInterpolant uses flat quaternion slerp. Boolean/string disable linear/smooth. |
| `Ic`, `Bc` | AnimationClip parse/serialize, morph-target sequence construction/grouping, lookup, duration reset, trimming, validation, optimization and cloning. Track parser chooses subclass by type aliases, flattens legacy keys and restores tangent arrays. |
| `kc/Oc`, `Pc/Rc`, `Ec`, `Nc`, `Vc`, `Lc` | Cache (disabled by default; skips blob URLs), LoadingManager/DefaultLoadingManager (progress counters, normalized URL modifier, handlers, AbortController), Loader base; in-flight FileLoader callback deduplication map and response-bearing error. FileLoader fetches with headers/credentials/cancellation, streams progress, decodes configured response types, caches results, and balances manager end/error notifications. These are source behaviors, not actions performed during inspection. |
| `Fc`, `Dc`, `Uc/jc`, `Wc`, `Jc`, `qc` | AnimationLoader, CompressedTextureLoader, ImageLoader (WeakMap of waiting image callbacks), CubeTextureLoader, DataTextureLoader and TextureLoader. Coordinate file/image loading, six-face cube completion, parser-provided texture metadata and needsUpdate. |
| `Hc`, `Xc`, `$c`, `Yc/Gc/Zc` | Light, HemisphereLight and LightShadow with shared matrix/vector scratch values. Shadow maintains camera, map/viewport/frustum settings and projection-to-texture transforms respecting coordinate system/reversed depth; copies, serializes and disposes maps. |
| `eu`, `Qc/Kc/tu`, `nu`, `su/iu/ru`, `cu` | Camera, PerspectiveCamera, OrthographicCamera; inverse world matrix excludes camera scale, view offsets and projection inverse updates; perspective focal/film/view bounds APIs, orthographic zoom/tile bounds. Scratch objects support calculations. |
| `au/ou`, `hu/lu`, `uu/du`, `pu`, `mu`, `yu/gu` | SpotLightShadow/SpotLight, PointLightShadow/PointLight, DirectionalLightShadow/DirectionalLight, AmbientLight, RectAreaLight, SphericalHarmonics3/LightProbe. Light power conversions, shadow ownership/copy/dispose and serialization; spot shadow tracks angle/distance/map aspect. SH stores nine Vector3 coefficients and evaluates basis/radiance/irradiance, arithmetic and arrays. |
| `fu/xu`, `bu`, `vu`, `wu`, `Mu/Su` | Extensible MaterialLoader registry, LoaderUtils URL resolution/base, InstancedBufferGeometry and BufferGeometryLoader with typed/interleaved/index/morph/group/bounds restoration. Extensible ObjectLoader starts load/async parse pipelines: animations, shapes, geometry registry, images, textures/materials, scene object, skeleton binding and light target binding. Image loading supports URLs, cube arrays and typed pixel data; async image routine continues in batch 11. |

## Public API and local consumers

Public names above are exposed by the core module export table (inspected statically outside this assigned interval for naming context); internal helpers/registries remain implementation details. Minified bindings must not be used as stable APIs. The physically adjacent Three WebGPU bundle imports and re-exports core names: its import declaration includes Loader, FileLoader, MaterialLoader, ObjectLoader, SpotLight, PointLight, DirectionalLight, RectAreaLight, AmbientLight, HemisphereLight and LightProbe, providing concrete bundle-to-bundle consumers for these definitions.

`index.html:3639–3640` maps both `three` and `three/webgpu` to the vendored WebGPU module. `js/render/renderer-boot.js:16` preloads that module plus this core file and TSL. `js/render/three/tlx.js:1252` constructs PerspectiveCamera, and its mirror camera at line 1484 constructs another; `js/render/three/tlx-shadow.js:234` constructs a PerspectiveCamera for shadow work. These are verified local consumers of this interval's Camera implementation through the WebGPU namespace. The listed presence of other exported APIs does not prove Apex calls them.

## Limits

This is complete byte coverage of the assigned fragment, not an execution or compatibility verdict. EllipseCurve begins earlier; ObjectLoader continues later. Imported/base classes (Curve, BufferGeometry, Material, Object3D, vectors/matrices, texture types) are outside the interval. Registries here explicitly refer to earlier definitions. Public export context and targeted consumer searches supplement the full raw reads; a broad supplemental search over the one-line WebGPU bundle truncated and was used only to locate its import declaration, which was then read as a bounded untruncated excerpt. No claim relies on that truncated search as coverage.
