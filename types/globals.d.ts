/* Apex 26 — ambient IIFE globals for the editor language service.

   BEDROCK Phase 1 second half (docs/research/ARCHITECTURE-REDESIGN-2026-08.md).
   Every js/ file is a script-tag IIFE that assigns one global. Cursor/VS Code
   already run TypeScript's language service; this file is what that service
   needs to know those names exist. It is NOT a runtime file (no <script> tag,
   no ?v=N bump).

   Names come from tools/scan-globals.mjs. types/game-ctx.d.ts already declares
   the GameModuleFactory roster — those names are omitted here so the two
   files cannot collide. tests/unit/jsconfig-globals.test.mjs asserts the
   union of `declare const` names equals the scanner's assigned set, and that
   `tsc -p jsconfig.json` stays clean with checkJs:false.

   checkJs stays OFF. Turning it on without per-file // @ts-check and a
   Window/globals tranche floods implicit-any (measured 89 errors on five
   files). That opt-in is still the later half of Phase 1.

   NOT A RUNTIME FILE. Nothing loads it.
*/

// Anything whose real shape is owned by another file and not yet transcribed.
type ApexOpaque = { [key: string]: unknown };

interface LogApi {
  readonly SILENT: 0;
  readonly ERROR: 1;
  readonly WARN: 2;
  readonly INFO: 3;
  readonly DEBUG: 4;
  readonly TRACE: 5;
  readonly LEVELS: { readonly [name: string]: number };
  readonly NAMESPACES: { readonly [ns: string]: number };
  error(ns: string, ...args: unknown[]): void;
  warn(ns: string, ...args: unknown[]): void;
  info(ns: string, ...args: unknown[]): void;
  debug(ns: string, ...args: unknown[]): void;
  enabled(ns: string, level?: number): boolean;
  level(spec?: string | null): {
    console: string;
    buffer: string;
    consoleNs: { [ns: string]: string };
    bufferNs: { [ns: string]: string };
  };
  persist(spec: string | null): boolean;
  records(filter?: { ns?: string; level?: string | number; since?: number; limit?: number }): unknown[];
  clear(): boolean;
  time(ns: string, label: string): (extra?: string) => void;
}

interface M4Api {
  ident(): Float32Array;
  mulTo(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>): Float32Array;
  perspectiveTo(out: Float32Array, fovy: number, aspect: number, near: number, far: number): Float32Array;
  lookAtTo(out: Float32Array, eye: ArrayLike<number>, target: ArrayLike<number>, up: ArrayLike<number>): Float32Array;
  orthoTo(out: Float32Array, left: number, right: number, bottom: number, top: number, near: number, far: number): Float32Array;
  invertTo(out: Float32Array, a: ArrayLike<number>): Float32Array;
  clamp(v: number, lo: number, hi: number): number;
  lerp(a: number, b: number, t: number): number;
  wrapDelta(d: number, period: number): number;
}

interface V3Api {
  norm(a: ArrayLike<number>): [number, number, number];
}

/** Writer: js/game/agentview-raster.js */
declare const AgentRaster: ApexOpaque;
/** Writer: js/game/ai-drive.js */
declare const AiDrive: ApexOpaque;
/** Writer: js/game/ariastate.js */
declare const AriaState: ApexOpaque;
/** Writer: js/render/assets.js */
declare const Assets: ApexOpaque;
/** Writer: js/game/cam-tune.js */
declare const CamTune: ApexOpaque;
/** Writer: js/car/car3d.js */
declare const Car3D: ApexOpaque;
/** Writer: js/game/carmesh.js */
declare const CarMesh: ApexOpaque;
/** Writer: js/game/career.js */
declare const Career: ApexOpaque;
/** Writer: js/track/circuit-kit.js */
declare const CircuitKit: ApexOpaque;
/** Writer: js/track/markings.js */
declare const CircuitMarkings: ApexOpaque;
/** Writer: js/track/geo-paths.js */
declare const CircuitPaths: ApexOpaque;
/** Writer: js/game/cockpit-opts.js */
declare const CockpitOpts: ApexOpaque;
/** Writer: js/game/css-zoom.js */
declare const CssZoom: ApexOpaque;
/** Writer: js/data/export.js */
declare const DataExport: ApexOpaque;
/** Writer: js/data/hub.js */
declare const DataHub: ApexOpaque;
/** Writer: js/data/lastrace.js */
declare const DataLastRace: ApexOpaque;
/** Writer: js/data/live.js */
declare const DataLive: ApexOpaque;
/** Writer: js/data/schedule.js */
declare const DataSchedule: ApexOpaque;
/** Writer: js/data/standings.js */
declare const DataStandings: ApexOpaque;
/** Writer: js/data/telemetry.js */
declare const DataTelemetry: ApexOpaque;
/** Writer: js/car/driver-ratings.js */
declare const DriverRatings: ApexOpaque;
/** Writer: js/data/api.js */
declare const F1API: ApexOpaque;
/** Writer: js/render/gltf.js */
declare const GLTF: ApexOpaque;
/** Writer: js/render/glx.js */
declare const GLX: ApexOpaque;
/** Writer: js/render/glx/chunked.js */
declare const GLXChunked: ApexOpaque;
/** Writer: js/render/shaders/chunks.js */
declare const GLXChunks: ApexOpaque;
/** Writer: js/render/glx/post.js */
declare const GLXPost: ApexOpaque;
/** Writer: js/render/shaders/lit.js, js/render/shaders/sky.js, js/render/shaders/fx.js, js/render/shaders/post.js */
declare const GLXShaders: ApexOpaque;
/** Writer: js/render/glx/shadow.js */
declare const GLXShadow: ApexOpaque;
/** Writer: js/game/audio.js */
declare const GameAudio: ApexOpaque;
/** Writer: js/game/cameras.js */
declare const GameCams: ApexOpaque;
/** Writer: js/game/store.js */
declare const GameStore: ApexOpaque;
/** Writer: js/game/tables.js */
declare const GameTables: ApexOpaque;
/** Writer: js/render/gfx.js */
declare const Gfx: ApexOpaque;
/** Writer: js/game/gfx-quality.js */
declare const GfxQuality: ApexOpaque;
/** Writer: js/car/ghost.js */
declare const Ghost: ApexOpaque;
/** Writer: js/game/input.js */
declare const Input: ApexOpaque;
/** Writer: js/track/landmark-kit.js */
declare const LandmarkKit: ApexOpaque;
/** Writer: js/game/light-presets.js */
declare const LightPresets: ApexOpaque;
/** Writer: js/game/lighting.js */
declare const LightTune: ApexOpaque;
/** Writer: js/car/liveries.js */
declare const Liveries: ApexOpaque;
/** Writer: js/car/liverytex.js */
declare const LiveryTex: ApexOpaque;
/** Writer: js/log.js */
declare const Log: LogApi;
/** Writer: js/mat4.js */
declare const M4: M4Api;
/** Writer: js/game/menunav.js */
declare const MenuNav: ApexOpaque;
/** Writer: js/game/music-lib.js */
declare const MusicLib: ApexOpaque;
/** Writer: js/net/handshake.js */
declare const NetHandshake: ApexOpaque;
/** Writer: js/net/nostr.js */
declare const NetNostr: ApexOpaque;
/** Writer: js/net/qr.js */
declare const NetQr: ApexOpaque;
/** Writer: js/net/rendezvous.js */
declare const NetRendezvous: ApexOpaque;
/** Writer: js/net/scan.js */
declare const NetScan: ApexOpaque;
/** Writer: js/net/sdp.js */
declare const NetSdp: ApexOpaque;
/** Writer: js/net/session.js */
declare const NetSession: ApexOpaque;
/** Writer: js/net/snapshot.js */
declare const NetSnapshot: ApexOpaque;
/** Writer: js/net/transport.js */
declare const NetTransport: ApexOpaque;
/** Writer: js/game/particles.js */
declare const Particles: ApexOpaque;
/** Writer: js/car/parts.js */
declare const Parts: ApexOpaque;
/** Writer: js/game/perf.js */
declare const PerfGov: ApexOpaque;
/** Writer: js/game/perf-try.js */
declare const PerfTry: ApexOpaque;
/** Writer: js/game/physics-consts.js */
declare const PhysicsConsts: ApexOpaque;
/** Writer: js/game/reliability.js */
declare const Reliability: ApexOpaque;
/** Writer: js/track/scenery-city.js */
declare const SceneryCity: ApexOpaque;
/** Writer: js/track/scenery-identity.js */
declare const SceneryIdentity: ApexOpaque;
/** Writer: js/track/scenery-nature.js */
declare const SceneryNature: ApexOpaque;
/** Writer: js/track/scenery-structures.js */
declare const SceneryStructures: ApexOpaque;
/** Writer: js/track/themes.js */
declare const SceneryThemes: ApexOpaque;
/** Writer: js/game/scrollfade.js */
declare const ScrollFade: ApexOpaque;
/** Writer: js/game/season-cal.js */
declare const SeasonCal: ApexOpaque;
/** Writer: js/game/sheetshape.js */
declare const SheetShape: ApexOpaque;
/** Writer: js/game/spotify.js */
declare const SpotifyMusic: ApexOpaque;
/** Writer: js/render/three/tlx.js */
declare const TLX: ApexOpaque;
/** Writer: js/render/three/tsl-chunks.js, js/render/three/tsl-lit.js, js/render/three/tsl-sky.js, js/render/three/tsl-fx.js, js/render/three/tsl-post.js, js/render/three/tlx-shadow.js, js/render/three/tlx-chunked.js, js/render/three/tlx-post.js */
declare const TLXShaders: ApexOpaque;
/** Writer: js/car/teams.js */
declare const Teams: ApexOpaque;
/** Writer: js/game/topmodal.js */
declare const TopModal: ApexOpaque;
/** Writer: js/circuits/bahrain.js, js/circuits/monaco.js, js/circuits/silverstone.js, js/circuits/spa.js, js/circuits/monza.js, js/circuits/suzuka.js, js/circuits/singapore.js, js/circuits/cota.js, js/circuits/interlagos.js, js/circuits/vegas.js, js/circuits/madrid.js, js/circuits/zandvoort.js, js/circuits/jeddah.js, js/circuits/albert_park.js, js/circuits/shanghai.js, js/circuits/miami.js, js/circuits/imola.js, js/circuits/montreal.js, js/circuits/redbull.js, js/circuits/hungaroring.js, js/circuits/baku.js, js/circuits/mexico.js, js/circuits/qatar.js, js/circuits/abudhabi.js, js/circuits/hockenheim.js, js/circuits/nurburgring.js, js/circuits/catalunya.js, js/circuits/sepang.js, js/circuits/istanbul.js, js/circuits/paul_ricard.js, js/circuits/portimao.js, js/circuits/sochi.js, js/circuits/mugello.js, js/circuits/magny_cours.js, js/circuits/estoril.js, js/circuits/kyalami.js, js/circuits/watkins_glen.js, js/circuits/indianapolis.js, js/circuits/buenos_aires.js, js/circuits/jacarepagua.js */
declare const TrackDefs: ApexOpaque;
/** Writer: js/track/geom.js */
declare const TrackGeom: ApexOpaque;
/** Writer: js/track/graph.js */
declare const TrackGraph: ApexOpaque;
/** Writer: js/track/maps.js */
declare const TrackMaps: ApexOpaque;
/** Writer: js/track/mesh.js */
declare const TrackMesh: ApexOpaque;
/** Writer: js/track/models.js */
declare const TrackModels: ApexOpaque;
/** Writer: js/track/scenery-data.js */
declare const TrackSceneryData: ApexOpaque;
/** Writer: js/track/space.js */
declare const TrackSpace: ApexOpaque;
/** Writer: js/track/spline.js */
declare const TrackSpline: ApexOpaque;
/** Writer: js/track/surface.js */
declare const TrackSurface: ApexOpaque;
/** Writer: js/track/tracks.js */
declare const Tracks: ApexOpaque;
/** Writer: js/game/uilayers.js */
declare const UiLayers: ApexOpaque;
/** Writer: js/mat4.js */
declare const V3: V3Api;
/** Writer: js/render/webgpu/wgsl-chunks.js */
declare const WGSLChunks: ApexOpaque;
/** Writer: js/render/webgpu/wgsl-fx.js */
declare const WGSLFx: ApexOpaque;
/** Writer: js/render/webgpu/wgsl-post.js */
declare const WGSLPost: ApexOpaque;
/** Writer: js/render/webgpu/wgx.js */
declare const WGX: ApexOpaque;
/** Writer: js/game.js */
declare const __apex: ApexOpaque;

interface Window {
  AeroZones: typeof AeroZones;
  AgentRaster: typeof AgentRaster;
  AgentView: typeof AgentView;
  AiDrive: typeof AiDrive;
  ApexApi: typeof ApexApi;
  AriaState: typeof AriaState;
  Assets: typeof Assets;
  Atmosphere: typeof Atmosphere;
  AudioPanel: typeof AudioPanel;
  BodyAttitude: typeof BodyAttitude;
  CamModes: typeof CamModes;
  CamTune: typeof CamTune;
  CamTunerPanel: typeof CamTunerPanel;
  Car3D: typeof Car3D;
  CarMesh: typeof CarMesh;
  Career: typeof Career;
  CareerUI: typeof CareerUI;
  CircuitKit: typeof CircuitKit;
  CircuitMarkings: typeof CircuitMarkings;
  CircuitPaths: typeof CircuitPaths;
  CockpitOpts: typeof CockpitOpts;
  CssZoom: typeof CssZoom;
  DataExport: typeof DataExport;
  DataHub: typeof DataHub;
  DataLastRace: typeof DataLastRace;
  DataLive: typeof DataLive;
  DataSchedule: typeof DataSchedule;
  DataStandings: typeof DataStandings;
  DataTelemetry: typeof DataTelemetry;
  DebrisWorld: typeof DebrisWorld;
  DriverRatings: typeof DriverRatings;
  F1API: typeof F1API;
  GLTF: typeof GLTF;
  GLX: typeof GLX;
  GLXChunked: typeof GLXChunked;
  GLXChunks: typeof GLXChunks;
  GLXPost: typeof GLXPost;
  GLXShaders: typeof GLXShaders;
  GLXShadow: typeof GLXShadow;
  GameAudio: typeof GameAudio;
  GameCams: typeof GameCams;
  GameHud: typeof GameHud;
  GameResults: typeof GameResults;
  GameStore: typeof GameStore;
  GameTables: typeof GameTables;
  Gfx: typeof Gfx;
  GfxQuality: typeof GfxQuality;
  Ghost: typeof Ghost;
  IncidentSim: typeof IncidentSim;
  Input: typeof Input;
  LandmarkKit: typeof LandmarkKit;
  LightPresets: typeof LightPresets;
  LightStore: typeof LightStore;
  LightTune: typeof LightTune;
  Liveries: typeof Liveries;
  LiveryTex: typeof LiveryTex;
  Log: typeof Log;
  M4: typeof M4;
  MenuNav: typeof MenuNav;
  Menus: typeof Menus;
  MusicLib: typeof MusicLib;
  NetHandshake: typeof NetHandshake;
  NetLobby: typeof NetLobby;
  NetNostr: typeof NetNostr;
  NetPlay: typeof NetPlay;
  NetQr: typeof NetQr;
  NetRendezvous: typeof NetRendezvous;
  NetScan: typeof NetScan;
  NetSdp: typeof NetSdp;
  NetSession: typeof NetSession;
  NetSnapshot: typeof NetSnapshot;
  NetTransport: typeof NetTransport;
  Particles: typeof Particles;
  Parts: typeof Parts;
  PerfGov: typeof PerfGov;
  PerfTry: typeof PerfTry;
  Photomode: typeof Photomode;
  PhysicsConsts: typeof PhysicsConsts;
  Quali: typeof Quali;
  RaceControl: typeof RaceControl;
  Reliability: typeof Reliability;
  SceneryCity: typeof SceneryCity;
  SceneryIdentity: typeof SceneryIdentity;
  SceneryNature: typeof SceneryNature;
  SceneryStructures: typeof SceneryStructures;
  SceneryThemes: typeof SceneryThemes;
  ScrollFade: typeof ScrollFade;
  SeasonCal: typeof SeasonCal;
  SeasonUI: typeof SeasonUI;
  SetupUI: typeof SetupUI;
  SheetShape: typeof SheetShape;
  SkidMarks: typeof SkidMarks;
  SpotifyMusic: typeof SpotifyMusic;
  SteerTuning: typeof SteerTuning;
  TLX: typeof TLX;
  TLXShaders: typeof TLXShaders;
  Teams: typeof Teams;
  TopModal: typeof TopModal;
  TrackDefs: typeof TrackDefs;
  TrackGeom: typeof TrackGeom;
  TrackGraph: typeof TrackGraph;
  TrackMaps: typeof TrackMaps;
  TrackMesh: typeof TrackMesh;
  TrackModels: typeof TrackModels;
  TrackSceneryData: typeof TrackSceneryData;
  TrackSpace: typeof TrackSpace;
  TrackSpline: typeof TrackSpline;
  TrackSurface: typeof TrackSurface;
  Tracks: typeof Tracks;
  TunerPanel: typeof TunerPanel;
  UiLayers: typeof UiLayers;
  V3: typeof V3;
  WGSLChunks: typeof WGSLChunks;
  WGSLFx: typeof WGSLFx;
  WGSLPost: typeof WGSLPost;
  WGX: typeof WGX;
  __apex: typeof __apex;
}
