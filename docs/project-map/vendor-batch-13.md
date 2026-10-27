# Vendor batch 13 — Three WebGPU node foundations

## Scope and read evidence

Fully read `vendor/three-0.186.1/three.webgpu.min.js` byte interval **[2048,102048)** (100000 bytes), as ten consecutive 10000-byte UTF-8 source returns, each untruncated. This is a complete interval reading, not a declaration/AST-only survey. Byte offsets are half-open. No vendor code was executed; no runtime, network, browser, tests, or commits were used. Repository `AGENTS.md` was read. Prefix [0,2048) belongs to the earlier vendor map; later bytes belong to other batches.

Whole file: 714087 bytes; SHA-256 `02a9bd70c638f841e62d76925f5cddea5950720ee2a2689927fdecfd26fb40db`.

Interval SHA-256: `02bf87ef91329a4c92077fbc5158f2dc927e9222723eee11591d0046b06b3545`.

| Source slice | Bytes | SHA-256 |
|---|---:|---|
| [2048,12048) | 10000 | `62fb471bb5984344425aefe66c712ae399e4350b9f2044df41685313a9af903f` |
| [12048,22048) | 10000 | `6f5f2d69832e12f17e0e5fea493e02970329c312229c017d3bd62128946ff8bf` |
| [22048,32048) | 10000 | `93b55c7bfc279178d49121646c8da8b330cb786f912beaea83b51b0f231ec39f` |
| [32048,42048) | 10000 | `4d649bfe888b8ca0c61e7bc284f308ec691f332742ad117ba425e79d40c79fc8` |
| [42048,52048) | 10000 | `83d03b9a095cffd0e0da16efae9e1a41c7166cc4279ec66824345341b5be9429` |
| [52048,62048) | 10000 | `84d3d8688d64ca97c9eb71b81977cc681787c54eb2fb90b0730bde59f1926019` |
| [62048,72048) | 10000 | `ac80067c7234e619a8127c87dd8f8fbf833e07805b807dba4949aa76d620d077` |
| [72048,82048) | 10000 | `33e008dbd8157fd8f0b2d7ab52165f8448dc78179ffd392901b924ae2dd70a25` |
| [82048,92048) | 10000 | `87cb204983e8ada6143b190ee728da5704b8917fd34051d19e538ec052a5eed4` |
| [92048,102048) | 10000 | `df41312265547ac442916625824e2cd3ea28f3bb335fc23ff1986b03daa8090e` |

## Semantic map

This is one ESM bundle, not independent application modules. The interval begins inside the import list from `./three.core.min.js`, includes a large direct core re-export list, and defines the node graph/TSL foundations consumed by the rest of this same bundle. It ends inside the high precision model-view matrix callback `Tc`; that callback is not completely covered here.

| Area | Local identities and behavior |
|---|---|
| Material observation | `Is` is the refreshable material property allowlist; WeakMaps `Vs/ks/Gs/zs` retain lights/material/geometry/texture observations. `$s` stores render-object snapshots, tracks disposal cache versions, attributes/index/draw range, matrices, morph influences, instancing/batching texture versions, lights and environment. `needsRefresh` chooses NONE/SHARED/FULL, forcing full refresh for node materials, skinned animation, dynamic instancing, initialization and velocity output; static objects/bundles can bypass equality checks. |
| Diagnostics and utilities | `Ws` filters library stack frames; `Hs` parses stack locations and decorates errors. `js` implements seeded mixed integer hashing; `qs/Xs/Ks` wrap string/array/variadic hashing. `Ys/Qs` map lengths to types and objects to side data. `Zs/Js/ei/ti/ri` resolve shader types, typed arrays, logical/storage length and alignment. `si/ii/ni` infer value/texture types and construct typed defaults; `ai/oi/ui/li` provide side data, base64 conversions and argument-shape detection. `di` freezes these NodeUtils names. |
| Build contract | `ci` shader stages, `hi` update scopes, `pi` node types, `gi` storage access, `mi/fi/yi/bi/xi` stage/component/prerequisite tables. `Ti` owns IDs, UUIDs, versions, children, traversal, update callbacks, hashes/cache keys, shared-node overrides, the setup→analyze→generate lifecycle, recursion diagnostics, serialization/deserialization and JSON meta resource collection. |
| Basic expressions | `vi` array indexing, `Si` conversions, `Ni` shared temporary generation, `Ai` joins, `Ri` swizzles, `wi` component replacement, `Ci` component flipping, `Mi` typed input serialization, `Pi` constants, `Li` struct-member validation. |
| TSL DSL | `Fi` active stack; `Ui/Di` register node chaining and Assign companions. `Oi/Vi/Ii/ki/Gi/zi` normalize and install xyzw/rgba/stpq swizzles and numeric indices 0–31. `$i/Wi/Hi/ji` convert object/array arguments and construct checked node factories. `qi/Xi/_n/Tn/dn` implement shader calls, layouts, Fn proxies, once/subbuild caching and callback invocation. `Ki/Yi/Qi/Zi/Ji/en/tn/rn/sn/nn` cache common constants; `an/on/un/ln/cn/hn/pn/gn/mn/fn/yn/bn` normalize values, infer types and create proxies/factories. `vn/Sn/Nn/An` manage stack/If/toStack. |
| Typed values and properties | `En/Rn/wn/Cn/Mn` are color/float/int/uint/bool factories; `Bn..Hn` are vector and matrix factories. `jn/qn` expose element/convert. `Xn`, `Kn/Yn` create properties and varying properties; `Qn..wa` define named shader material slots (diffuse, emissive, roughness, metalness, clearcoat, sheen, iridescence, anisotropy, specular, output, transmission, attenuation, AO and related parameters). |
| Uniforms and arrays | `Ca/Ma/Ba` create uniform groups; `Pa/La/Fa` are frame/render/object groups. `Ua/Da` generate shared uniforms, convert boolean inputs to uint storage and support update callbacks. `Oa/Ia` represent shader arrays. `pd/gd` add buffer update ranges; `md/fd/yd` implement padded uniform arrays, including mat3→mat4 packing and scalar/vector→vec4 storage. |
| Assignment/operators/math | `Va/ka` emit single-use assignments with per-component fallback for unsupported swizzle assignment. `Ga/za` validate positional/named function calls and pointer arguments. `$a/Wa` map operators to typed output and coordinate-system-specific generation. `Ha..ho` are arithmetic, comparison, logical and bit operators; `po/go/mo/fo` are pre/post increments/decrements. `yo` defines built-in shader math, arity checks and platform/stage differences. `bo/xo/_o/To/vo/So` are epsilon, infinity and PI constants; `No..Iu` include trig/hyperbolic, rounding, vector/matrix operations, interpolation, powers, normal transforms, random, saturate and cbrt helpers. Chaining registrations are explicit. |
| Flow/context/variables | `Vu/ku` conditional blocks or uniform-flow ternaries; `Gu/zu` temporarily replace builder context; `$u/Wu/Hu/ju/qu/Xu` add uniform flow, names, shadow/AO/GI contexts and deprecated label compatibility. `Ku/Yu/Qu/Zu/Ju` handle variables, consts and declaration intent, including loop/stack forcing. `el/tl` isolate named subbuilds; `rl/sl/il` emit vertex-to-fragment varyings and interpolation metadata. |
| Color/output | `nl/al` implement sRGB EOTF/OETF; `ol/ul/ll/dl` convert working/output color spaces, primaries and transfer functions through core ColorManagement. `hl/cl/pl/gl` resolve object/renderer dotted-property references. `ml/fl/yl` invoke registered tone mapping with renderer exposure. `Hl/jl` premultiply/unpremultiply alpha; `ql/Xl` clamp alpha, unpremultiply, tone-map/color-convert and premultiply output. |
| Attributes/compute | `bl/xl/_l/Tl/vl/Sl/Nl` wrap and cache buffer attributes, split matrix attributes, propagate usage/instancing and insert varyings for fragment access. `Al/El/Rl/wl/Cl/Ml/Bl` expose vertex/instance/draw/subgroup/invocation indices. `Pl/Ll/Fl` validate workgroup dimensions, schedule compute updates and emit count guards. `Ul/Dl/Ol` isolate builder cache; `Il/Vl` sequence bypass calls; `kl/Gl` remap values; `zl/$l/Wl` emit expressions/discard. |
| Inspection | `Kl/Yl` print or callback with generated shader text. `Ql` is the base inspector lifecycle/event interface; `Zl/Jl` schedule frame inspection and optional inspector-context transforms, warning for unsupported backend usage. |
| Textures | `ed/td/rd` resolve named geometry attributes/UV channels; `sd/id` texture dimensions; `nd/ad` maximum mip from image size; `od` carries node errors. `ud` default texture; `ld/dd/cd/hd` uniform-backed textures, clone/reference sharing, matrix/flipY UV transforms, compare fallback, color-space conversion, sample/load/bias/level/gradient/gather/depth/offset variants and JSON texture references. Generation routes through builder texture primitives and caches sample temporaries. |
| View and model | `bd/xd` raw builtin nodes; `vd` screen size/coordinate/viewport/UV scopes; `Sd/Nd/Ad/Ed/Rd/wd/Cd/Md` pixel ratio and screen/viewport expressions. `Hd` camera-index varying; `jd/qd` camera clipping uniforms; `Xd/Kd/Yd/Qd/Zd/Jd/ec` projection/inverse/view/world/normal/position/viewport nodes with array-camera and multiview selection. `rc/sc/ic/nc/ac/oc/uc` read object direction/world matrix/position/scale/view position/radius. `dc/cc/hc/pc/gc/mc/fc` bind these to current model. `yc/bc/xc/_c` supply normal/inverse-world/model-view matrices; `Tc` begins high precision model-view handling at the ending boundary. |

## Public class export aliases

The final export clause was statically inspected for these exact aliases (supplemental identity evidence outside this interval; not a claim to full reading of later source):

- `vi as ArrayElementNode`
- `Oa as ArrayNode`
- `Va as AssignNode`
- `ed as AttributeNode`
- `_l as BufferAttributeNode`
- `pd as BufferNode`
- `bd as BuiltinNode`
- `Il as BypassNode`
- `ul as ColorSpaceNode`
- `Pl as ComputeNode`
- `Vu as ConditionalNode`
- `Pi as ConstNode`
- `Gu as ContextNode`
- `Si as ConvertNode`
- `Kl as DebugNode`
- `zl as ExpressionNode`
- `Ci as FlipNode`
- `Ga as FunctionCallNode`
- `Al as IndexNode`
- `Mi as InputNode`
- `Ql as InspectorBase`
- `Zl as InspectorNode`
- `Ul as IsolateNode`
- `Ai as JoinNode`
- `yo as MathNode`
- `nd as MaxMipLevelNode`
- `Li as MemberNode`
- `dc as ModelNode`
- `Ti as Node`
- `od as NodeError`
- `$s as NodeMaterialObserver`
- `rc as Object3DNode`
- `Wa as OperatorNode`
- `Xn as PropertyNode`
- `hl as ReferenceBaseNode`
- `cl as ReferenceElementNode`
- `ql as RenderOutputNode`
- `pl as RendererReferenceNode`
- `vd as ScreenNode`
- `wi as SetNode`
- `Ri as SplitNode`
- `Hs as StackTrace`
- `el as SubBuildNode`
- `Ni as TempNode`
- `ld as TextureNode`
- `sd as TextureSizeNode`
- `ml as ToneMappingNode`
- `fd as UniformArrayNode`
- `Ca as UniformGroupNode`
- `Ua as UniformNode`
- `Ku as VarNode`
- `rl as VaryingNode`

## Bundle and local consumers

`index.html:3639–3642` maps both `three` and `three/webgpu` to this bundle, `three/tsl` to its facade and addon imports to the local addon directory. `js/render/three/tlx.js:203–204` dynamically imports WebGPU and TSL, then passes them into the TLX shader factories. `tools/manifest.cjs:980–985` orders TSL chunks/viewport/lit/sky/fx/post modules. `js/render/three/tsl-viewport.js` creates Vector2-backed uniforms; `tsl-post.js` creates NodeMaterial and numerous uniforms/vectors/matrices for postprocessing. Those consumers use the type/uniform/math/texture foundation mapped above through public TSL names rather than minified local names. The earlier `vendor-map.md` records preload/service-worker and provenance context.

Limits: static source understanding establishes available behavior and dependency direction, not successful GPU compilation, browser support, render correctness, active usage of every exported node, or coverage of later renderer/backend implementations. Core names in the opening import tail are dependencies or direct re-exports, not classes implemented by this batch. No tests were run per assigned scope.
