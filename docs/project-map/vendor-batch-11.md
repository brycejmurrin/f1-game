# Vendor batch 11: Three core tail

Fully read `vendor/three-0.186.1/three.core.min.js` bytes `[302048,389329)` (87,281 bytes), in consecutive source-return calls of at most 10,000 bytes. Every return was untruncated. Byte coordinates are half-open UTF-8 offsets. This is source reading, supplemented by static text extraction; no vendor code was executed.

## SHA-256 read ledger

- Whole file: `dae72ed2eea6703b95e6b57e26469ffa95733a9320675b4bfd1b5f5df1c12f8b` (389,329 bytes).
- Assigned part `[302048,389329)`: `e3e7143a2c2a8799621e354b9165d1622261e6b6f04e676187dfb78673e101ab`.

| Source slice | Bytes | SHA-256 |
|---|---:|---|
| `[302048,312048)` | 10000 | `ba251efb5f20c9a9f41b85c9ba1c7cc48315e0e054273d9f42d4a789ab2cec16` |
| `[312048,322048)` | 10000 | `8b97ec8735476ab42eb991c95fe0611789030b19ecef7772b44ff79eec3fbf95` |
| `[322048,332048)` | 10000 | `ac2ec6288f4acbf739f64a84cec0fb8955043d462689445743408f39f55e8832` |
| `[332048,342048)` | 10000 | `ccf457be299f514a8021bb11cdae80267a0ff65fad8ff8312cc5359a6c35a2ab` |
| `[342048,352048)` | 10000 | `d144faa82505639dd6593919ea3d39b3c91b96868d42fa4c06457bf4087ac5ed` |
| `[352048,362048)` | 10000 | `57d3410ca28a47091203b1a89c4ca7b145fc625948e05edc7b747200983f6bcd` |
| `[362048,372048)` | 10000 | `1f9e79e7ca1f042027c75a10dcfb62e40baa861c1d478faa324cd085f76212b1` |
| `[372048,382048)` | 10000 | `d74873b15007bb85bb4099e8015940680ff71727698116e2a0beb556ebffce3b` |
| `[382048,389329)` | 7281 | `63f96c17a3d89a3bff573ba9d73152d101473d6e92e23319e09e19c308e4751b` |

## Semantic fragments and API

The interval starts inside `Su` / `ObjectLoader.parseImages` (its declaration and earlier parsing are in batch 10). Its tail resolves image URLs, array/cube images and serialized typed pixels; `parseTextures` reconstructs sources, sampling/wrapping/color-space/transform flags. `parseObject` dispatches Scene, cameras, all listed lights, mesh/skinned/instanced/batched meshes, LOD, lines, points, sprite/group/bone/default Object3D, recursively restores children and animations, then binds skeleton UUIDs and light targets. `_u`, `Au`, `Tu` are legacy string-to-numeric mapping/wrapping/filter maps.

| Fragment | Public API and behavior |
|---|---|
| Image/audio loading | `Cu` ImageBitmapLoader caches pending/resolved fetches under image-bitmap keys, shares failure bookkeeping in WeakMap `zu`, combines abort signals where available, calls createImageBitmap with color conversion disabled; abort replaces its controller. `Bu` AudioContext lazily creates/sets the shared context; `ku` AudioLoader fetches arraybuffer and decodes a copied buffer with manager accounting. |
| Cameras | `Eu` StereoCamera caches lens parameters and offsets two asymmetric projections; `Vu` CubeCamera owns six children, switches WebGL/WebGPU orientations, temporarily disables XR/mipmaps and restores renderer target/face/mip/XR after six renders. `Nu=-90` is cube camera FOV. `Lu` ArrayCamera wraps subcameras. |
| Time/audio | `Fu` Timer tracks scaled milliseconds, visibility connection/reset and elapsed/delta seconds (`Du` visibility handler). `Hu` AudioListener updates listener position/orientation from world matrix and handles master gain/filter; `Xu` Audio supports controlled buffers and uncontrolled node/media sources, scheduling, pause/stop progress, loop/detune/rate/filters; `Qu` PositionalAudio adds HRTF panner attenuation/cone/world transforms; `Ku` AudioAnalyser returns byte FFT bins/mean. |
| Animation binding | `td` PropertyMixer uses alternating, original and additive buffer regions; selects bool/string, lerps numbers and slerps quaternions. `od` PropertyBinding parses/sanitizes track names via regex constants `ed/sd/id/rd/nd`, special object names `ad`, resolves bones/materials/map/morph indices, and selects getter/setter tables by binding and versioning kind. Composite fans out over AnimationObjectGroup. |
| Animation orchestration | `hd` AnimationObjectGroup maintains cached/active object partitions, UUID indices and subscribed bindings. `ld` AnimationAction owns interpolants, blend mode, playback scheduling, repeat/pingpong/once, fades, crossfades/warp and loop/finished events. `ud` AnimationMixer pools actions/bindings/control interpolants, advances/apply alternating accumulators, resolves clips and uncaches roots/actions/clips. `cd` is shared scalar control-interpolant result storage. |
| Buffers/uniforms | `dd` RenderTarget3D replaces target textures with Data3DTexture; `pd` Uniform clones cloneable values; `yd` UniformsGroup allocates incrementing `md` ids, clones uniform entries and emits dispose. `gd` InstancedInterleavedBuffer preserves meshPerAttribute; `fd` GLBufferAttribute wraps an external GPU buffer and increments version on needsUpdate. |
| Geometry/math/time | `bd` Raycaster sets rays from perspective/orthographic/XR transforms, layer-filters recursive raycasts and sorts by distance (`vd`, `wd`). `Md` Clock is deprecated in favor of Timer. `Sd` Spherical clamps polar angle; `_d` Cylindrical converts Cartesian coordinates; `Ad` Matrix2 stores column-major entries; `zd` Box2 supplies bounds/containment/intersection/distance; `Ed` Line3 supplies projection and robust segment-to-segment closest distance. |
| Visual helpers | `Vd` SpotLightHelper, `Ud` SkeletonHelper (`jd` recursive bone collection), `Wd` PointLightHelper, `Xd` HemisphereLightHelper, `Yd` GridHelper, `Gd` PolarGridHelper, `Kd` DirectionalLightHelper, `sp` CameraHelper (`ip` unprojection writer), `np` BoxHelper, `ap` Box3Helper, `op` PlaneHelper, `up` ArrowHelper, `dp` AxesHelper build/update debug geometry and explicitly dispose owned resources. Scratch vectors/matrices/colors are reused; arrow geometry `lp/cp` is shared lazily. |
| Shape/control/texture utilities | `pp` ShapePath collects subpaths, computes area/interior points/containment, resolves nonzero/evenodd winding and assigns holes to outer Shape objects. `mp` Controls is the base enabled/input/state/lifecycle interface. `yp` getByteLength computes uncompressed/packed and block-compressed texture storage, throwing for unknown formats/types. `gp` TextureUtils exposes contain/cover/fill repeat/offset transformations and getByteLength. |

After TextureUtils, module-level registration emits a devtools register event and sets/checks `window.__THREE__` for duplicate imports. The final export block exposes the whole core, including declarations outside this interval. It does not make those earlier implementations part of this read.

## Bundle and local consumers

`three.webgpu.min.js` statically imports and re-exports core APIs from `./three.core.min.js`. `index.html:3640` maps `three/webgpu`; `js/render/three/tlx.js:203` dynamically imports that namespace, so core reaches the TLX backend transitively. `tlx.js` constructs geometry, textures, scene objects, cameras and materials from that namespace. Export membership is availability, not proof of use: audio, animation groups, helpers and loaders above are not all established local call sites by this inspection.

## Complete export alias ledger

Each pair is `minified binding → public export`; this includes preceding-batch bindings referenced by the final export statement.

```text
st -> ACESFilmicToneMapping
w -> AddEquation
$ -> AddOperation
Je -> AdditiveAnimationBlendMode
g -> AdditiveBlending
rt -> AgXToneMapping
Dt -> AlphaFormat
ks -> AlwaysCompare
j -> AlwaysDepth
Ss -> AlwaysStencilFunc
pu -> AmbientLight
ld -> AnimationAction
Ic -> AnimationClip
Fc -> AnimationLoader
ud -> AnimationMixer
hd -> AnimationObjectGroup
uc -> AnimationUtils
Ch -> ArcCurve
Lu -> ArrayCamera
up -> ArrowHelper
at -> AttachedBindMode
Xu -> Audio
Ku -> AudioAnalyser
Bu -> AudioContext
Hu -> AudioListener
ku -> AudioLoader
dp -> AxesHelper
d -> BackSide
Ye -> BasicDepthPacking
o -> BasicShadowMap
Ro -> BatchedMesh
gc -> BezierInterpolant
Ga -> Bone
Mc -> BooleanKeyframeTrack
zd -> Box2
tn -> Box3
ap -> Box3Helper
mh -> BoxGeometry
np -> BoxHelper
_n -> BufferAttribute
qn -> BufferGeometry
wu -> BufferGeometryLoader
Ct -> ByteType
kc -> Cache
eu -> Camera
sp -> CameraHelper
lh -> CanvasTexture
yh -> CapsuleGeometry
Eh -> CatmullRomCurve3
et -> CineonToneMapping
gh -> CircleGeometry
yt -> ClampToEdgeWrapping
Md -> Clock
Er -> Color
Sc -> ColorKeyframeTrack
Ei -> ColorManagement
Ys -> Compatibility
ah -> CompressedArrayTexture
oh -> CompressedCubeTexture
nh -> CompressedTexture
Dc -> CompressedTextureLoader
xh -> ConeGeometry
F -> ConstantAlphaFactor
V -> ConstantColorFactor
mp -> Controls
Vu -> CubeCamera
dh -> CubeDepthTexture
lt -> CubeReflectionMapping
ct -> CubeRefractionMapping
hh -> CubeTexture
Wc -> CubeTextureLoader
pt -> CubeUVReflectionMapping
Fh -> CubicBezierCurve
Dh -> CubicBezierCurve3
pc -> CubicInterpolant
r -> CullFaceBack
n -> CullFaceFront
a -> CullFaceFrontBack
i -> CullFaceNone
Th -> Curve
Xh -> CurvePath
b -> CustomBlending
it -> CustomToneMapping
fh -> CylinderGeometry
_d -> Cylindrical
Qi -> Data3DTexture
Zi -> DataArrayTexture
Za -> DataTexture
Jc -> DataTextureLoader
vn -> DataUtils
ds -> DecrementStencilOp
ms -> DecrementWrapStencilOp
Rc -> DefaultLoadingManager
Wt -> DepthFormat
Jt -> DepthStencilFormat
uh -> DepthTexture
ot -> DetachedBindMode
du -> DirectionalLight
Kd -> DirectionalLightHelper
yc -> DiscreteInterpolant
vh -> DodecahedronGeometry
p -> DoubleSide
O -> DstAlphaFactor
R -> DstColorFactor
Fs -> DynamicCopyUsage
Ps -> DynamicDrawUsage
Ns -> DynamicReadUsage
Ah -> EdgesGeometry
zh -> EllipseCurve
Ts -> EqualCompare
q -> EqualDepth
xs -> EqualStencilFunc
ut -> EquirectangularReflectionMapping
dt -> EquirectangularRefractionMapping
cr -> Euler
pi -> EventDispatcher
ph -> ExternalTexture
Tl -> ExtrudeGeometry
Lc -> FileLoader
On -> Float16BufferAttribute
Pn -> Float32BufferAttribute
Pt -> FloatType
Lr -> Fog
Vr -> FogExp2
rh -> FramebufferTexture
u -> FrontSide
po -> Frustum
yo -> FrustumArray
fd -> GLBufferAttribute
Us -> GLSL1
js -> GLSL3
Cs -> GreaterCompare
X -> GreaterDepth
Bs -> GreaterEqualCompare
H -> GreaterEqualDepth
Ms -> GreaterEqualStencilFunc
vs -> GreaterStencilFunc
Yd -> GridHelper
Cr -> Group
ch -> HTMLTexture
Rt -> HalfFloatType
Xc -> HemisphereLight
Xd -> HemisphereLightHelper
Cl -> IcosahedronGeometry
Cu -> ImageBitmapLoader
jc -> ImageLoader
Fi -> ImageUtils
us -> IncrementStencilOp
ps -> IncrementWrapStencilOp
to -> InstancedBufferAttribute
vu -> InstancedBufferGeometry
gd -> InstancedInterleavedBuffer
ho -> InstancedMesh
Cn -> Int16BufferAttribute
Bn -> Int32BufferAttribute
An -> Int8BufferAttribute
kt -> IntType
Hn -> InterleavedBuffer
Yn -> InterleavedBufferAttribute
dc -> Interpolant
Fe -> InterpolateBezier
Ne -> InterpolateDiscrete
Ve -> InterpolateLinear
Le -> InterpolateSmooth
Xs -> InterpolationSamplingMode
Hs -> InterpolationSamplingType
ys -> InvertStencilOp
ls -> KeepStencilOp
vc -> KeyframeTrack
ba -> LOD
Il -> LatheGeometry
ur -> Layers
As -> LessCompare
W -> LessDepth
zs -> LessEqualCompare
J -> LessEqualDepth
bs -> LessEqualStencilFunc
fs -> LessStencilFunc
Hc -> Light
gu -> LightProbe
$c -> LightShadow
Wo -> Line
Ed -> Line3
Eo -> LineBasicMaterial
Uh -> LineCurve
jh -> LineCurve3
nc -> LineDashedMaterial
Yo -> LineLoop
Xo -> LineSegments
Mt -> LinearFilter
mc -> LinearInterpolant
Tt -> LinearMipMapLinearFilter
_t -> LinearMipMapNearestFilter
At -> LinearMipmapLinearFilter
St -> LinearMipmapNearestFilter
ss -> LinearSRGBColorSpace
K -> LinearToneMapping
is -> LinearTransfer
Ec -> Loader
bu -> LoaderUtils
Pc -> LoadingManager
Pe -> LoopOnce
Ee -> LoopPingPong
Re -> LoopRepeat
e -> MOUSE
ea -> Material
v -> MaterialBlending
xu -> MaterialLoader
_i -> MathUtils
Ad -> Matrix2
Bi -> Matrix3
tr -> Matrix4
A -> MaxEquation
Va -> Mesh
Aa -> MeshBasicMaterial
sc -> MeshDepthMaterial
ic -> MeshDistanceMaterial
ec -> MeshLambertMaterial
rc -> MeshMatcapMaterial
tc -> MeshNormalMaterial
Ql -> MeshPhongMaterial
$l -> MeshPhysicalMaterial
Zl -> MeshStandardMaterial
Kl -> MeshToonMaterial
_ -> MinEquation
gt -> MirroredRepeatWrapping
Z -> MixOperation
x -> MultiplyBlending
G -> MultiplyOperation
ft -> NearestFilter
wt -> NearestMipMapLinearFilter
bt -> NearestMipMapNearestFilter
vt -> NearestMipmapLinearFilter
xt -> NearestMipmapNearestFilter
nt -> NeutralToneMapping
_s -> NeverCompare
U -> NeverDepth
gs -> NeverStencilFunc
m -> NoBlending
ts -> NoColorSpace
ns -> NoNormalPacking
Q -> NoToneMapping
We -> NormalAnimationBlendMode
y -> NormalBlending
os -> NormalGAPacking
as -> NormalRGPacking
Is -> NotEqualCompare
Y -> NotEqualDepth
ws -> NotEqualStencilFunc
_c -> NumberKeyframeTrack
zr -> Object3D
Su -> ObjectLoader
Ke -> ObjectSpaceNormalMap
Bl -> OctahedronGeometry
z -> OneFactor
D -> OneMinusConstantAlphaFactor
L -> OneMinusConstantColorFactor
P -> OneMinusDstAlphaFactor
E -> OneMinusDstColorFactor
k -> OneMinusSrcAlphaFactor
I -> OneMinusSrcColorFactor
cu -> OrthographicCamera
h -> PCFShadowMap
l -> PCFSoftShadowMap
Yh -> Path
nu -> PerspectiveCamera
Qn -> Plane
kl -> PlaneGeometry
op -> PlaneHelper
lu -> PointLight
Wd -> PointLightHelper
th -> Points
Go -> PointsMaterial
Gd -> PolarGridHelper
bh -> PolyhedronGeometry
Qu -> PositionalAudio
od -> PropertyBinding
td -> PropertyMixer
Wh -> QuadraticBezierCurve
Jh -> QuadraticBezierCurve3
Ti -> Quaternion
Tc -> QuaternionKeyframeTrack
Ac -> QuaternionLinearInterpolant
he -> R11_EAC_Format
fi -> RAD2DEG
ke -> RED_GREEN_RGTC2_Format
Ie -> RED_RGTC1_Format
t -> REVISION
ce -> RG11_EAC_Format
Ge -> RGBADepthPacking
jt -> RGBAFormat
Zt -> RGBAIntegerFormat
Se -> RGBA_ASTC_10x10_Format
ve -> RGBA_ASTC_10x5_Format
we -> RGBA_ASTC_10x6_Format
Me -> RGBA_ASTC_10x8_Format
_e -> RGBA_ASTC_12x10_Format
Ae -> RGBA_ASTC_12x12_Format
de -> RGBA_ASTC_4x4_Format
pe -> RGBA_ASTC_5x4_Format
me -> RGBA_ASTC_5x5_Format
ye -> RGBA_ASTC_6x5_Format
ge -> RGBA_ASTC_6x6_Format
fe -> RGBA_ASTC_8x5_Format
xe -> RGBA_ASTC_8x6_Format
be -> RGBA_ASTC_8x8_Format
Te -> RGBA_BPTC_Format
oe -> RGBA_ETC2_EAC_Format
re -> RGBA_PVRTC_2BPPV1_Format
ie -> RGBA_PVRTC_4BPPV1_Format
Qt -> RGBA_S3TC_DXT1_Format
Kt -> RGBA_S3TC_DXT3_Format
te -> RGBA_S3TC_DXT5_Format
Ze -> RGBDepthPacking
Ut -> RGBFormat
Gt -> RGBIntegerFormat
ze -> RGB_BPTC_SIGNED_Format
Ce -> RGB_BPTC_UNSIGNED_Format
ne -> RGB_ETC1_Format
ae -> RGB_ETC2_Format
se -> RGB_PVRTC_2BPPV1_Format
ee -> RGB_PVRTC_4BPPV1_Format
$t -> RGB_S3TC_DXT1_Format
$e -> RGDepthPacking
Xt -> RGFormat
Yt -> RGIntegerFormat
Gl -> RawShaderMaterial
_a -> Ray
bd -> Raycaster
mu -> RectAreaLight
qt -> RedFormat
Ht -> RedIntegerFormat
tt -> ReinhardToneMapping
Gs -> RenderObjectRefreshType
Yi -> RenderTarget
dd -> RenderTarget3D
mt -> RepeatWrapping
cs -> ReplaceStencilOp
S -> ReverseSubtractEquation
di -> ReversedDepthFuncs
Ol -> RingGeometry
le -> SIGNED_R11_EAC_Format
Oe -> SIGNED_RED_GREEN_RGTC2_Format
Be -> SIGNED_RED_RGTC1_Format
ue -> SIGNED_RG11_EAC_Format
es -> SRGBColorSpace
rs -> SRGBTransfer
Fr -> Scene
Yl -> ShaderMaterial
jl -> ShadowMaterial
Gh -> Shape
Pl -> ShapeGeometry
pp -> ShapePath
Sl -> ShapeUtils
It -> ShortType
Ka -> Skeleton
Ud -> SkeletonHelper
Ya -> SkinnedMesh
Wi -> Source
Vn -> Sphere
Rl -> SphereGeometry
Sd -> Spherical
yu -> SphericalHarmonics3
qh -> SplineCurve
ou -> SpotLight
Vd -> SpotLightHelper
ya -> Sprite
sa -> SpriteMaterial
B -> SrcAlphaFactor
N -> SrcAlphaSaturateFactor
C -> SrcColorFactor
Ls -> StaticCopyUsage
Os -> StaticDrawUsage
Es -> StaticReadUsage
Eu -> StereoCamera
Ds -> StreamCopyUsage
Rs -> StreamDrawUsage
Vs -> StreamReadUsage
zc -> StringKeyframeTrack
M -> SubtractEquation
f -> SubtractiveBlending
s -> TOUCH
Qe -> TangentSpaceNormalMap
El -> TetrahedronGeometry
Hi -> Texture
qc -> TextureLoader
Ui -> TextureSource
gp -> TextureUtils
Fu -> Timer
qs -> TimestampQuery
Nl -> TorusGeometry
Vl -> TorusKnotGeometry
Kr -> Triangle
Xe -> TriangleFanDrawMode
He -> TriangleStripDrawMode
qe -> TrianglesDrawMode
Ll -> TubeGeometry
ht -> UVMapping
In -> Uint16BufferAttribute
kn -> Uint32BufferAttribute
Tn -> Uint8BufferAttribute
zn -> Uint8ClampedBufferAttribute
pd -> Uniform
yd -> UniformsGroup
Xl -> UniformsUtils
zt -> UnsignedByteType
Ft -> UnsignedInt101111Type
Vt -> UnsignedInt248Type
Lt -> UnsignedInt5999Type
Ot -> UnsignedIntType
Et -> UnsignedShort4444Type
Nt -> UnsignedShort5551Type
Bt -> UnsignedShortType
c -> VSMShadowMap
Ai -> Vector2
zi -> Vector3
Xi -> Vector4
Cc -> VectorKeyframeTrack
ih -> VideoFrameTexture
sh -> VideoTexture
Ki -> WebGL3DRenderTarget
$i -> WebGLArrayRenderTarget
Ws -> WebGLCoordinateSystem
Gi -> WebGLRenderTarget
Js -> WebGPUCoordinateSystem
Br -> WebXRController
Fl -> WireframeGeometry
je -> WrapAroundEnding
De -> ZeroCurvatureEnding
T -> ZeroFactor
Ue -> ZeroSlopeEnding
hs -> ZeroStencilOp
Wl -> cloneUniforms
ti -> createCanvasElement
Ks -> createElementNS
hi -> error
yp -> getByteLength
ri -> getConsoleFunction
Hl -> getUnlitUniformColorSpace
Qs -> isTypedArray
ni -> log
Jl -> mergeUniforms
ui -> probeAsync
ii -> setConsoleFunction
oi -> warn
li -> warnOnce
ci -> yieldToMain
```

## Limits

Full assigned bytes were read as source, not just an AST summary. Static text extraction produced the ledger. No runtime, browser, network, tests, build, commit or shader execution was performed; behavior here describes source branches, not validated platform support. Cross-boundary dependencies are identified without claiming to have read their implementations.
