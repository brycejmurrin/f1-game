# Vendor batch 08 — Three.js core foundations

Read-only static review of `vendor/three-0.186.1/three.core.min.js`, assigned half-open byte interval **[2048, 102048)** (100,000 bytes). All assigned bytes were displayed and read in ten consecutive, untruncated 10,000-byte calls. No library execution, runtime, network, browser, tests, or commit was used. This is a semantic source map, not a runtime correctness claim.

## Identity and coverage

- Whole file: 389,329 bytes; SHA-256 `dae72ed2eea6703b95e6b57e26469ffa95733a9320675b4bfd1b5f5df1c12f8b` (matches batch manifest).
- Assigned part SHA-256: `d372f6843e170eda6cc263d37a1d1c0ab8281a4d9e92011ccc51e91e1b8e162e`.
- Slice SHA-256 values below are over original bytes, without formatting or normalization.

| Byte slice | SHA-256 |
|---|---|
| [2048, 12048) | `b455db35923b28d3fc4027836c0d03feff68356bc565e4fdfffd6075467aa8d7` |
| [12048, 22048) | `9ec194ec48ee36fe694d29cd7ac3d5f6d19a2cc9047ac0d30713278f99144136` |
| [22048, 32048) | `d6b68197a15b1fcfc92e6887e095adda5b72636693999dc7b82fe1546c4d1252` |
| [32048, 42048) | `fd55d8e1da9ff9acb352259b96fdbce0609b0dee4c2398bab94eb66de4931ea3` |
| [42048, 52048) | `f602fe10914f12c88f388ddf9cc07358abe606ead2a62ea60d7e322d53286a83` |
| [52048, 62048) | `f74395ebfa0d919c5d02e455578fad803cb89e88b69132ef097a1ab716f4618d` |
| [62048, 72048) | `6093edb1a5b326521c27688eb7d226848fe790280edf73f3818694194142bf81` |
| [72048, 82048) | `2a24308e652edf02b23ede718411e8844310cb3165beb9ea2deb5086327a4df0` |
| [82048, 92048) | `d229c80f85e2d524c36082996d60f6813afb5f7ef59f88aed3587c01357cd82a` |
| [92048, 102048) | `858be80121f88f98f050a3c509732d8251ea1e902d8421439a2e602f5ad226b8` |

## Semantic map

The file is a minified ES module, with shared lexical identifiers rather than separate webpack module wrappers in this interval. Public class identities below follow `is*` flags, error strings, fields and method behavior in the displayed source. The interval begins inside a typed-array constructor table and ends inside `BufferGeometry.setIndex`; neither edge is a complete declaration.

| Region / identifiers | Meaning and behavior read |
|---|---|
| Opening fragment, `$s`, `Qs`, `Ks`, `ti` | Typed-array construction by constructor-name lookup; view detection excludes DataView; XHTML namespace element creation; canvas helper sets display block. |
| `ei`, `si`, `ii`, `ri`, `ni`, `ai`, `oi`, `hi`, `li` | Replaceable log callback, THREE-prefixed log/warn/error, TSL stack-trace location decoration and warning deduplication keyed by joined message text. |
| `ci`, `ui`, `di` | Cooperative yield chooses scheduler.yield, MessageChannel, or timer; WebGL sync polling rejects WAIT_FAILED and retries TIMEOUT_EXPIRED; small symbolic-to-numeric lookup depends on constants in preceding prefix. |
| `pi` (EventDispatcher) | Unique listeners by identity; copied listener list during dispatch; event target assigned then cleared. |
| `mi`, `yi`, `gi`, `fi`, `xi`, `bi`, `vi`, `wi`, `Mi`, `Si`, `_i` | UUID hex table and random UUID generation; degree/radian constants; clamp, Euclidean modulo and lerp; signed/unsigned normalized integer conversion; MathUtils object includes mappings, damping, pingpong, smoothstep variants, random/seeded random, power-of-two helpers and proper Euler quaternion conversion. Invalid component constructors throw. |
| `Ai` (Vector2), `Ti` (Quaternion), `zi` (Vector3) | Mutable chainable arithmetic, geometric transforms, normalized directions, interpolation, arrays/buffer attributes and iterators. Quaternion supports flat-array multiplication/slerp, Euler orders, axis/matrix/unit-vector conversion, change callbacks and shortest-sign slerp. Vector3 includes projection/unprojection, reflection, spherical/cylindrical coordinates and matrix extraction. Shared scratch `Ci`/`Ii` avoid per-call allocation. |
| `Bi` (Matrix3), `ki`, `Oi`, `Pi` | Column-major matrix storage; product, inverse (zero matrix on singular), transpose/normal matrix, UV transform and deprecated mutator wrappers. Oi/Pi are linear-sRGB/XYZ conversion matrices. |
| `Ri`, `Ei`, `Ni`, `Vi` | ColorManagement singleton defaults to linear working color space; source transfer decode, primaries conversion through XYZ and destination transfer encode; space definitions/luminance/output configs. Piecewise sRGB transfer functions; renamed compatibility methods warn. |
| `Fi`, `Li`, `Ui`, `Di`, `ji`, `Wi` | ImageUtils canvas/data URL and sRGB pixel conversion; cached canvas. TextureSource owns image data, ready/version/UUID, video/frame/image size detection and cached JSON image serialization. `Source` compatibility subclass warns of rename. |
| `Hi`, `Ji`, `qi` (Texture) | Source, sampler/format/type, UV offset/repeat/center/matrix, mipmaps, update ranges, version and PMREM version. Copy shares source but copies transforms and mipmap list, JSON deduplicates by UUID; dispose emits event; transformUv applies mapping, wrap and flip; needsUpdate increments source and texture version. Defaults: null image, default mapping constant, anisotropy 1. |
| `Xi` (Vector4) | Four-component math, rectangle width/height aliases, matrix transform, axis-angle extraction, array/attribute conversion and iteration. |
| `Yi`, `Gi`, `Zi`, `$i`, `Qi`, `Ki` | RenderTarget and WebGLRenderTarget; typed array/3D texture and target subclasses. Targets own texture arrays, viewport/scissor, depth linkage, resolve/store multisample flags; resize edits image dimensions and emits dispose. Copy creates independent image source records. DataArrayTexture tracks per-layer updates; 3D/array defaults disable mipmaps/flip and use unpack alignment 1. |
| `tr` (Matrix4), `er`…`lr` | Column-major transforms; basis/rotation/lookAt, matrix multiplication/inversion, affine determinant, translation/rotation/scale/shear, compose/decompose, perspective/orthographic with coordinate-system and reverse-depth handling. Singular inverse produces zero matrix; singular affine decomposition gives identity rotation/unit scale. Reusable matrix/vector/quaternion temporaries follow. |
| `cr` (Euler), `ur` (Layers) | Six rotation-order conversions with gimbal thresholds and callback synchronization; default XYZ. Layers is a 32-bit mask with enable/disable/toggle/test operations. |
| `zr` (Object3D), `Cr` (Group) | Scene hierarchy with synchronized Euler/quaternion, position/scale, local/world matrices, visibility/layers/shadow settings and optional pivot. Transform/rotate/translate/lookAt; add/remove/attach lifecycle events; recursive searches/traversals; conditional matrix propagation; cloning and JSON caches for geometry/material/texture/image/shapes/skeletons/animations/nodes. JSON handles scene, instanced/batched/skinned meshes; dispose emits event. Defaults use Y-up and automatic matrices. |
| `Br`, `Ir` (WebXRController) | Lazy target-ray/grip/hand groups, connection/disconnection, pose/velocity updates and visibility. Hand joints are groups; thumb/index distance toggles pinch at 0.02 m with 0.005 m hysteresis. Dispatch fans out across spaces. |
| `kr`, `Or`, `Pr`, `Rr`, `Er`, `Nr` (Color) | CSS named-color integer table; HSL helper/scratch; hex/RGB/HSL/style parsing with working-color conversion and ignored-alpha warnings; transfer conversions, output styles, arithmetic/interpolation, matrix/attribute/array support and hex JSON. |
| `Vr`, `Lr`, `Fr` | FogExp2, linear Fog, Scene. Scene contains background/environment/fog, rotation/intensity/blurriness and override material; clone/copy and JSON; optional devtools observe event. |
| `Kr`, `Dr`…`Qr` (Triangle) | Normal, barycentric coordinates, point containment, interpolated values/attributes, front-facing test, area/centroid, box intersection and closest-point Voronoi-region selection. Degenerate barycentric query returns null. |
| `tn`, `en`…`mn`, `yn` (Box3) | Empty infinity bounds; construction from arrays/attributes/objects; precise mesh vertex expansion or bounding-box fallback; containment/intersection with box/sphere/plane/triangle; clamp/distance/bounding sphere, union/intersection and transformed eight-corner bounds. `yn` implements separating-axis projection checks for triangle intersection. |
| `gn`, `fn`, `xn`, `bn`, `vn` (DataUtils) | Shared bit reinterpretation and precomputed half-float tables; float-to-half warns and clamps outside ±65504; half-to-float table decode; static wrapper methods. |
| `_n`, `Sn`, `wn`, `Mn`; `An`, `Tn`, `zn`, `Cn`, `In`, `Bn`, `kn`, `On`, `Pn` | BufferAttribute rejects ordinary arrays; item size/count, normalized storage, GPU type/usage/version/update ranges; matrix and direction transforms, component access, upload callback, cloning, JSON and disposal. Typed subclasses use Int8/Uint8/Uint8Clamped/Int16/Uint16/Int32/Uint32/Float16/Float32 storage. Float16 subclass overrides component writes/reads through half conversion. |
| `Vn`, `Rn`, `En`, `Nn` (Sphere) | Empty radius -1, bounds from points, containment/distance/intersections, point clamp, bounding box, transform by maximum axis scale, translation, point expansion and sphere union, JSON. |
| `Ln`, `Fn`, `Dn`, `Un`, `jn`, `Wn`, `Jn`, `qn` | BufferGeometry begins: ID/UUID, nullable index/indirect, attributes/morph attributes, groups, bounds and infinite draw range. `getIndex` complete; `setIndex` begins selecting wider index storage when an array value reaches 65535, but the method continues into batch 09. |

## Local consumer context

`index.html:3639–3642` maps `three` and `three/webgpu` to the vendored WebGPU module, TSL to its sibling and addons to the pinned addon directory. The WebGPU module's static import list consumes core math, ColorManagement, EventDispatcher, Texture, Sphere and other exports, so this foundation is shared by rendering rather than independently injected as an IIFE. `js/render/three/tlx.js:203–204` dynamically imports `three/webgpu` and `three/tsl` during initialization. `js/render/renderer-boot.js:11–30` explicitly preloads all three modules after choosing THREE; its comment records that core is a static WebGPU dependency and needs its own preload to avoid a fetch round trip. This explains why pure math, scene data, texture ownership and geometry buffers appear together here.

## Limits

This review covers every byte of the assigned interval, including repeated arithmetic and serialization bodies, rather than only a declaration inventory. Prefix constants, public export aliases and declarations after byte 102048 are outside this assignment. Symbol identities are source-based mappings; no complete export audit or GPU/browser behavior was exercised. DOM/canvas, scheduler, WebGL sync, XR pose and devtools code describe potential runtime effects only. File hashes establish exact source identity, not upstream equivalence or security validation. No changes were made to vendor or application source.
