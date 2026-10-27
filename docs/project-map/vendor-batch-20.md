# Vendor batch 20: loaders and final public exports

## Read coverage and provenance

Group 20 assigns `vendor/three-0.186.1/three.webgpu.min.js` half-open UTF-8 byte interval **[702048,714087)**, 12039 bytes. I directly read the entire interval in two untruncated source calls: 10000 bytes and 2039 bytes. The interval starts inside `VP.parseNodes`; no claim is made here to having read the preceding groups. No library code was executed.

| Scope | Bytes | SHA-256 |
|---|---:|---|
| Whole file | 714087 | `02a9bd70c638f841e62d76925f5cddea5950720ee2a2689927fdecfd26fb40db` |
| Assigned part | 12039 | `afd67f7625ff77fca3c733b10e5475de637207e1a442cc168adad99dfeb02de6` |
| Read slice [702048,712048) | 10000 | `3f9711a41b1b17bde532c882d8a30be8afe87a2274a4b09d0c0239f400b0955a` |
| Read slice [712048,714087) | 2039 | `c65ef5315ad89a040bae5a6c2a5d990233ad8d9465fa5cd8127570498aa1e4ac` |

## Semantic map

- `VP` is exported as `NodeLoader`. Its visible `parseNodes` continuation first creates every node by type and UUID, then deserializes each with a temporary `{nodes,textures}` metadata object, deleting that metadata afterward. `parse` creates a root node and parses its dependency graph. Fluent setters install textures and node constructors. Missing registered types report `NodeLoader: Node type not found:` and return `Rn()`; this interval does not define that fallback.
- `kP` is `NodeMaterialLoader`, extending the imported material loader `Ds`. It parses the base material, replaces each `inputNodes` entry with the corresponding node object, supports fluent node/material registries, and constructs registered material types before falling back to the parent factory.
- `GP` is `NodeObjectLoader`, extending `Os`. Synchronous and asynchronous parsing temporarily store `e.nodes` in `_nodesJSON`, delegate to the parent, then clear it. Material parsing reconstructs the shared node graph with textures and feeds it to `kP` for each material UUID. Clearing follows successful return/await; there is no `finally` in these visible wrappers.
- `zP`, exported as `BasicNodeLibrary`, registers nine light implementations (point, directional, rect-area, spot, ambient, hemisphere, probe, IES spot and projector) and six tone mappings (linear, Reinhard, Cineon, ACES filmic, AgX and neutral).
- `$P`, exported as `ClippingGroup`, extends `Group`; defaults are `isClippingGroup=true`, empty `clippingPlanes`, `enabled=true`, `clipIntersection=false`, `clipShadows=false`.
- The final named export statement has **448 bindings**. It exposes core scene/math/texture/material/constants alongside node graph types, shader builders, renderer/backend types, storage/compute facilities and pipeline helpers. Export aliases establish `CP → WebGPURenderer`, `AP → WebGPUBackend`, `yR → WebGLBackend`, `zB → WGSLNodeBuilder`, `qE → GLSLNodeBuilder`, `VN → TSL`, `wP → StandardNodeLibrary`, `BP → RenderPipeline`, `PP → DirectRenderPipeline`, `LP → PostProcessing`, and `A_ → QuadMesh`. Their implementations belong to earlier intervals; this final export confirms their public names only.

## Local consumers and integration

`index.html:3639` maps both `three` and `three/webgpu` to this bundle, and `three/tsl` to its sibling. `js/render/renderer-boot.js:11` preloads WebGPU, core and TSL after choosing Three. `js/render/three/tlx.js:203` imports the WebGPU namespace and TSL, disables ColorManagement at line 206, and constructs `THREE.WebGPURenderer` at line 524. Thus the final `CP` alias is consumed by the actual TLX entry point. The TSL sibling statically imports `TSL` from `three/webgpu` and re-exports namespace functions.

Static `THREE.*` references in `js/render/three/` connect the public surface to geometry/attribute construction (`tlx-chunked.js`), depth targets, scene/camera and node materials (`tlx-shadow.js`), texture formats/render targets/QuadMesh (`tlx-post.js`), and shader materials, math, texture and blending constants (`tsl-lit.js`, `tsl-fx.js`, `tsl-post.js`, `tsl-sky.js`, `tsl-viewport.js`). A targeted text search found no local JS references to NodeLoader, NodeMaterialLoader, NodeObjectLoader, BasicNodeLibrary or ClippingGroup. This is a static reference observation, not proof against dynamic property access.

## Whole-bundle range and hash reconciliation

Manifest groups 13–19 are adjacent 100000-byte ranges starting at 2048; group 20 ends at 714087. The union of prefix **[0,2048)** and groups **13–20** is exactly **[0,714087)**: no gap, overlap or trailing bytes. Each manifest byte count equals end minus start; all eight manifest whole-file hashes match the current whole-file SHA above. Prefix SHA-256 is `256029b8f9a2dc629d8b3d4fb3c59b870834399f3c53881f59ee8a017b9da0e7`.

A separate static hash reconciliation checked the slice-ledger rows in `vendor-batch-13.md` through `vendor-batch-19.md` against these bytes: respectively 10, 10, 11, 10, 10, 10 and 10 matched rows. This checks their recorded hashes, not their source-reading claims. My direct source-reading claim covers group 20 only.

## Limits

This is a static source map. No runtime, browser, network, tests or library execution was used, and no GPU behavior is established. Minified aliases are tied to this exact file hash. Loader inheritance behavior and previously defined constructors require their own intervals. The export list establishes availability rather than proving every export has a local consumer.

## Complete final export alias inventory

Each entry below is `local → public`; this inventory is extracted statically from the fully read final export statement.

- Ms → ACESFilmicToneMapping; xg → AONode; nt → AddEquation; Ne → AddOperation; ir → AdditiveBlending; Bs → AgXToneMapping; f → AlphaFormat; Jr → AlwaysCompare.
- cr → AlwaysDepth; ds → AlwaysStencilFunc; Ns → AmbientLight; AA → AmbientLightNode; MS → AnalyticLightNode; vt → ArrayCamera; vi → ArrayElementNode; Oa → ArrayNode.
- Va → AssignNode; hv → AtomicFunctionNode; ed → AttributeNode; $ → BackSide; YE → Backend; uv → BarrierNode; Sm → BasicEnvironmentNode; Nm → BasicLightMapNode.
- zP → BasicNodeLibrary; gt → BasicShadowMap; nx → BitcastNode; lx → BitcountNode; Jb → BlendMode; ye → BoxGeometry; Oe → BufferAttribute; _l → BufferAttributeNode.
- Pe → BufferGeometry; pd → BufferNode; bd → BuiltinNode; Wh → BumpMapNode; MP → BundleGroup; Il → BypassNode; qe → ByteType; gE → CanvasTarget.
- Cs → CineonToneMapping; Be → ClampToEdgeWrapping; $P → ClippingGroup; $g → ClippingNode; zT → CodeNode; r → Color; E → ColorManagement; ul → ColorSpaceNode.
- D → Compatibility; tv → ComputeBuiltinNode; Pl → ComputeNode; Vu → ConditionalNode; Pi → ConstNode; zt → ConstantAlphaFactor; Wt → ConstantColorFactor; Gu → ContextNode.
- Si → ConvertNode; Te → CubeCamera; mt → CubeDepthTexture; xm → CubeMapNode; j → CubeReflectionMapping; q → CubeRefractionMapping; ym → CubeRenderTarget; H → CubeTexture.
- sh → CubeTextureNode; De → CubeUVReflectionMapping; er → CullFaceBack; tr → CullFaceFront; Jt → CullFaceNone; At → CustomBlending; Rt → CylinderGeometry; ae → DataArrayTexture.
- se → DataTexture; Kl → DebugNode; gs → DecrementStencilOp; hs → DecrementWrapStencilOp; g → DepthFormat; m → DepthStencilFormat; le → DepthTexture; PP → DirectRenderPipeline.
- vs → DirectionalLight; EA → DirectionalLightNode; W → DoubleSide; Xt → DstAlphaFactor; Kt → DstColorFactor; e → DynamicDrawUsage; Ty → EnvironmentNode; Zr → EqualCompare.
- ur → EqualDepth; os → EqualStencilFunc; ve → EquirectangularReflectionMapping; Se → EquirectangularRefractionMapping; T → EventDispatcher; Fp → EventNode; zl → ExpressionNode; Us → FileLoader.
- Ci → FlipNode; xt → Float16BufferAttribute; dt → Float32BufferAttribute; ne → FloatType; oe → FramebufferTexture; Bc → FrontFacingNode; Nt → FrontSide; Lt → Frustum.
- Pt → FrustumArray; Ga → FunctionCallNode; WT → FunctionNode; qx → FunctionOverloadingNode; qE → GLSLNodeBuilder; $A → GLSLNodeParser; V → GreaterCompare; ar → GreaterDepth.
- k → GreaterEqualCompare; or → GreaterEqualDepth; as → GreaterEqualStencilFunc; ns → GreaterStencilFunc; Ls → Group; Me → HalfFloatType; As → HemisphereLight; RA → HemisphereLightNode.
- EP → IESSpotLight; CA → IESSpotLightNode; ms → IncrementStencilOp; ps → IncrementWrapStencilOp; Al → IndexNode; IP → IndirectStorageBufferAttribute; Mi → InputNode; Ql → InspectorBase.
- Zl → InspectorNode; te → InstancedBufferAttribute; re → InstancedInterleavedBuffer; c → IntType; B → InterleavedBuffer; M → InterleavedBufferAttribute; fs → InvertStencilOp; vg → IrradianceNode.
- Ul → IsolateNode; Ai → JoinNode; xs → KeepStencilOp; O → LessCompare; dr → LessDepth; I → LessEqualCompare; lr → LessEqualDepth; us → LessEqualStencilFunc.
- ls → LessStencilFunc; Es → LightProbe; MA → LightProbeNode; rE → Lighting; _g → LightingContextNode; Am → LightingModel; bg → LightingNode; tS → LightsNode.
- hm → Line2NodeMaterial; ce → LineBasicMaterial; em → LineBasicNodeMaterial; he → LineDashedMaterial; rm → LineDashedNodeMaterial; _e → LinearFilter; ut → LinearMipMapLinearFilter; ue → LinearMipmapLinearFilter.
- yt → LinearMipmapNearestFilter; Ue → LinearSRGBColorSpace; Rs → LinearToneMapping; ts → LinearTransfer; Fs → Loader; cg → LoopNode; sx → MRTNode; de → Material.
- at → MaterialBlending; Ds → MaterialLoader; qh → MaterialNode; lh → MaterialReferenceNode; yo → MathNode; v → MathUtils; a → Matrix2; o → Matrix3.
- u → Matrix4; Ot → MaxEquation; nd → MaxMipLevelNode; Li → MemberNode; be → Mesh; Re → MeshBasicMaterial; wm → MeshBasicNodeMaterial; we → MeshLambertMaterial.
- Um → MeshLambertNodeMaterial; Ge → MeshMatcapMaterial; Oy → MeshMatcapNodeMaterial; ge → MeshNormalMaterial; gm → MeshNormalNodeMaterial; Ce → MeshPhongMaterial; Om → MeshPhongNodeMaterial; Ve → MeshPhysicalMaterial.
- wy → MeshPhysicalNodeMaterial; My → MeshSSSNodeMaterial; Ie → MeshStandardMaterial; Ey → MeshStandardNodeMaterial; ke → MeshToonMaterial; Fy → MeshToonNodeMaterial; It → MinEquation; Xr → MirroredRepeatWrapping.
- Ae → MixOperation; dc → ModelNode; rr → MultiplyBlending; Ee → MultiplyOperation; G → NearestFilter; bt → NearestMipmapLinearFilter; Yr → NearestMipmapNearestFilter; Ps → NeutralToneMapping.
- es → NeverCompare; hr → NeverDepth; cs → NeverStencilFunc; pe → NoBlending; P → NoColorSpace; K → NoNormalPacking; w → NoToneMapping; Ti → Node.
- gi → NodeAccess; HN → NodeAttribute; vA → NodeBuilder; QN → NodeCache; KN → NodeCode; od → NodeError; SA → NodeFrame; NA → NodeFunctionInput.
- VP → NodeLoader; Zg → NodeMaterial; kP → NodeMaterialLoader; $s → NodeMaterialObserver; GP → NodeObjectLoader; ci → NodeShaderStage; pi → NodeType; jN → NodeUniform.
- hi → NodeUpdateType; di → NodeUtils; qN → NodeVar; XN → NodeVarying; rt → NormalBlending; Q → NormalGAPacking; kh → NormalMapNode; Y → NormalRGPacking.
- Qr → NotEqualCompare; nr → NotEqualDepth; is → NotEqualStencilFunc; ot → Object3D; rc → Object3DNode; Os → ObjectLoader; Z → ObjectSpaceNormalMap; Zt → OneFactor.
- Gt → OneMinusConstantAlphaFactor; $t → OneMinusConstantColorFactor; Ht → OneMinusDstAlphaFactor; jt → OneMinusDstColorFactor; it → OneMinusSrcAlphaFactor; qt → OneMinusSrcColorFactor; Wa → OperatorNode; Le → OrthographicCamera.
- Qb → OutputStructNode; $b → OverrideContextNode; pt → PCFShadowMap; Bt → PCFSoftShadowMap; cy → PMREMGenerator; by → PMREMNode; gx → PackFloatNode; _x → Packed4x8IntegerNode.
- jb → ParameterNode; MT → PassNode; Fe → PerspectiveCamera; Lm → PhongLightingModel; Bf → PhysicalLightingModel; lt → Plane; St → PlaneGeometry; Ts → PointLight.
- LS → PointLightNode; wS → PointShadowNode; q_ → PointUVNode; $e → PointsMaterial; Wy → PointsNodeMaterial; LP → PostProcessing; RP → ProjectorLight; PA → ProjectorLightNode.
- Xn → PropertyNode; A_ → QuadMesh; wt → Quaternion; Ar → R11_EAC_Format; J → RED_GREEN_RGTC2_Format; Hr → RED_RGTC1_Format; Tt → REVISION; ee → RG11_EAC_Format.
- ie → RGBAFormat; Ft → RGBAIntegerFormat; Vr → RGBA_ASTC_10x10_Format; Dr → RGBA_ASTC_10x5_Format; Or → RGBA_ASTC_10x6_Format; Ir → RGBA_ASTC_10x8_Format; kr → RGBA_ASTC_12x10_Format; Gr → RGBA_ASTC_12x12_Format.
- wr → RGBA_ASTC_4x4_Format; Cr → RGBA_ASTC_5x4_Format; Mr → RGBA_ASTC_5x5_Format; Br → RGBA_ASTC_6x5_Format; Pr → RGBA_ASTC_6x6_Format; Lr → RGBA_ASTC_8x5_Format; Fr → RGBA_ASTC_8x6_Format; Ur → RGBA_ASTC_8x8_Format.
- zr → RGBA_BPTC_Format; Nr → RGBA_ETC2_EAC_Format; Tr → RGBA_PVRTC_2BPPV1_Format; _r → RGBA_PVRTC_4BPPV1_Format; mr → RGBA_S3TC_DXT1_Format; fr → RGBA_S3TC_DXT3_Format; yr → RGBA_S3TC_DXT5_Format; x → RGBFormat.
- _ → RGBIntegerFormat; $r → RGB_BPTC_SIGNED_Format; Wr → RGB_BPTC_UNSIGNED_Format; vr → RGB_ETC1_Format; Sr → RGB_ETC2_Format; xr → RGB_PVRTC_2BPPV1_Format; br → RGB_PVRTC_4BPPV1_Format; gr → RGB_S3TC_DXT1_Format.
- y → RGFormat; b → RGIntegerFormat; D_ → RTTNode; JT → RangeNode; FP → ReadbackBuffer; Ss → RectAreaLight; DA → RectAreaLightNode; h → RedFormat.
- p → RedIntegerFormat; hl → ReferenceBaseNode; cl → ReferenceElementNode; ah → ReferenceNode; x_ → ReflectorNode; ws → ReinhardToneMapping; t → RenderObjectRefreshType; ql → RenderOutputNode.
- BP → RenderPipeline; fe → RenderTarget; SE → Renderer; pl → RendererReferenceNode; F_ → RendererUtils; Kr → RepeatWrapping; ys → ReplaceStencilOp; Vt → ReverseSubtractEquation.
- Iy → RotateNode; Er → SIGNED_R11_EAC_Format; qr → SIGNED_RED_GREEN_RGTC2_Format; jr → SIGNED_RED_RGTC1_Format; Rr → SIGNED_RG11_EAC_Format; me → SRGBColorSpace; R → SRGBTransfer; W_ → SampleNode.
- xe → Scene; vd → ScreenNode; wi → SetNode; nS → ShadowBaseNode; We → ShadowMaterial; mS → ShadowNode; Xy → ShadowNodeMaterial; Ke → ShortType.
- z → Sphere; ft → SphereGeometry; Ri → SplitNode; _s → SpotLight; wA → SpotLightNode; ze → SpriteMaterial; Gy → SpriteNodeMaterial; st → SrcAlphaFactor.
- Yt → SrcAlphaSaturateFactor; Qt → SrcColorFactor; qb → StackNode; Hs → StackTrace; wP → StandardNodeLibrary; C → StaticDrawUsage; DP → Storage3DTexture; Vp → StorageArrayElementNode.
- OP → StorageArrayTexture; j_ → StorageBufferAttribute; Gp → StorageBufferNode; H_ → StorageInstancedBufferAttribute; UP → StorageTexture; tT → StorageTexture3DNode; J_ → StorageTextureNode; Yb → StructNode.
- Kb → StructTypeNode; el → SubBuildNode; mv → SubgroupFunctionNode; kt → SubtractEquation; sr → SubtractiveBlending; VN → TSL; X → TangentSpaceNormalMap; Ni → TempNode.
- U → Texture; iT → Texture3DNode; ld → TextureNode; sd → TextureSizeNode; Ut → TimestampQuery; ml → ToneMappingNode; BT → ToonOutlinePassNode; ct → UVMapping.
- je → Uint16BufferAttribute; He → Uint32BufferAttribute; fd → UniformArrayNode; Ca → UniformGroupNode; Ua → UniformNode; Ix → UnpackFloatNode; Xe → UnsignedByteType; tt → UnsignedInt101111Type.
- Je → UnsignedInt248Type; et → UnsignedInt5999Type; d → UnsignedIntType; Qe → UnsignedShort4444Type; Ze → UnsignedShort5551Type; Ye → UnsignedShortType; aT → UserDataNode; ht → VSMShadowMap.
- Ku → VarNode; rl → VaryingNode; s → Vector2; i → Vector3; n → Vector4; uT → VelocityNode; Yg → VertexColorNode; Pg → ViewportDepthNode.
- Mg → ViewportDepthTextureNode; AT → ViewportSharedTextureNode; Ng → ViewportTextureNode; Jy → VolumeNodeMaterial; zB → WGSLNodeBuilder; yR → WebGLBackend; cR → WebGLCapabilities; N → WebGLCoordinateSystem.
- AP → WebGPUBackend; A → WebGPUCoordinateSystem; CP → WebGPURenderer; Ct → WebXRController; cv → WorkgroupInfoNode; Et → ZeroFactor; bs → ZeroStencilOp; Dt → createCanvasElement.
- fi → defaultBuildStages; mi → defaultShaderStages; l → error; L → log; yi → shaderStages; bi → vectorComponents; S → warn; F → warnOnce.
