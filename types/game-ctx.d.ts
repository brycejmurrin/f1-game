/* Apex 26 — the G ctx façade, as a machine-checked contract.

   BEDROCK PHASE 1 (docs/research/ARCHITECTURE-REDESIGN-2026-08.md §Phase 1).
   js/game.js owns the closure state of the whole game and hands ONE object of
   live getters/setters + stable helpers to every extracted module
   (`Module.create(G)`). That object is declared in exactly one place —
   the `const G = { … }` literal in js/game.js — and until this file existed nothing
   checked that a module's read of `G.foo` corresponded to anything there. The
   defect class that costs is FAÇADE DRIFT: a member written but never declared
   (the old `countT` expando), a member declared but dead (the duplicate
   `setLightTune` key), a write to a getter-only member that silently no-ops.

   HOW THIS FILE IS CHECKED — it is not documentation, it is a gate:
     node tools/check-gctx.mjs        (also: tests/unit/game-ctx-surface.test.mjs)
   1. PARITY. The tool parses `const G = {…}` out of js/game.js with espree and
      asserts the member set here is exactly the member set there, with matching
      writability. Add a G member without adding it here (or vice versa) and the
      unit suite goes red in the same session that introduced the drift.
   2. USAGE. The tool extracts every `G.<member>` reference and every
      `const {…} = G` destructure from every manifest module whose create() takes the ctx, emits them
      as a typed shadow file against this interface, and runs `tsc --noEmit`
      over it. A read of a member that does not exist, or a write to a readonly
      one, is a compile error carrying the real source file:line.
   3. UNREAD. The reverse direction, which no type checker sees: a member no
      module reads at all. Baselined, so a NEW one fails.

   WRITABILITY RULE (mechanical, so the parity check can derive it):
     `readonly` here  <=>  a getter with NO setter, or a plain data property.
     writable here    <=>  an accessor pair (get + set) in game.js.
   Plain data properties (`store`, `clamp`, the hoisted-function shorthands) are
   assignable in JS today but are stable bindings nothing reassigns; marking them
   readonly makes an accidental `G.clamp = …` a compile error now, and matches
   where Phase 4's `Object.seal(G)` is going.

   TYPE PRECISION — honest, not decorative. Primitives, tuples and function
   signatures are transcribed from the code. Domain objects owned by OTHER files
   (the built track, a car, the renderer backend, the career save) are declared
   here only as far as this façade's own contract needs; each carries an index
   signature and a pointer to its owner. Phase 3 types the renderer
   (`RendererBackend`), Phase 6 tightens the rest. `unknown` is used where the
   value genuinely is dynamic; `any` is used nowhere.

   NOT A RUNTIME FILE. Nothing loads it, no `<script>` tag, no ?v=N bump.
*/

// ── Shared primitives ────────────────────────────────────────────────────────

/** World-space or colour triple. +Y up, metres; colours are 0..1 linear RGB. */
type Vec3 = [number, number, number];

/** Anything whose real shape is owned by another file and not yet transcribed. */
type Opaque = { [key: string]: unknown };

// ── Domain objects the façade hands out (owners named per type) ──────────────

/** A circuit data file's def object — js/circuits/<id>.js, via Tracks.LIST. */
interface CircuitDef {
  id: string;
  name: string;
  /** Track defaults to a night race when true (see loadTrack's sessionDark). */
  night?: boolean;
  [key: string]: unknown;
}

/** The BUILT track — centreline, meshes, graph. Owner: js/track/tracks.js. */
interface TrackModel {
  def: CircuitDef;
  /** Lap length in arc metres. Every wrapS()/zone test reads this. */
  total: number;
  [key: string]: unknown;
}

/** A team row from Teams.LIST — js/data/teams.js. */
interface TeamDef {
  id: string;
  name: string;
  color: Vec3;
  tier: number;
  custom?: boolean;
  [key: string]: unknown;
}

/** Per-car performance multipliers (human cars only) — modsFor(). */
interface CarMods { speed: number; accel: number; cornering: number; braking: number; }

/** One grid car, as built by makeCars() in js/game.js. Fields listed are the
    ones the façade's own signatures depend on; the rest is physics/AI state. */
interface CarState {
  team: TeamDef;
  name: string;
  code: string;
  driverId: string;
  num: number;
  /** Role flags — see setCarRole. human without local === a networked rival. */
  human: boolean;
  local: boolean;
  isPlayer: boolean;
  mods: CarMods | null;
  aeroLoad: number | null;
  seat: number;
  /** Arc position (m) and lateral offset (m, +right). */
  s: number;
  x: number;
  speed: number;
  prog: number;
  lap: number;
  rank?: number;
  /** Active-aero blend 0..1. Read this, never xOn — see docs/PHYSICS.md. */
  aeroX: number;
  xOn: boolean;
  retired: boolean;
  dnf: string | null;
  [key: string]: unknown;
}

/** The season standings/calendar save — js/core/store.js migrateSeasonPoints. */
type SeasonState = Opaque;

/** The career save. Owner: js/career/career.js (Career.data()). */
type CareerSave = Opaque;

/** What Career.settleRound() resolved for the round just finished, or null. */
type CareerSettlement = Opaque;

/** Per-frame lighting/scene uniforms handed to the renderer — see atmosphere.js. */
type FrameState = Opaque;

/** The renderer backend handle (GLX by default; TLX/WGX when opted in).
    Phase 3 replaces this with the authored `RendererBackend` interface. */
type GfxBackend = Opaque;

/** The cached localStorage wrapper — js/core/store.js. All keys "apex26."-prefixed. */
interface StoreApi {
  /** Parsed value for `k`, or `d` when absent/unreadable. */
  get<T>(k: string, d: T): T;
  get(k: string, d?: unknown): unknown;
  set(k: string, v: unknown): void;
  /** The raw string lane: bare "1"/"0" flags and ids, read live (no cache), key with or without the prefix. */
  raw(k: string): string | null;
  rawSet(k: string, v: string): boolean;
  rawDel(k: string): boolean;
  /** Bumped on every set() so memo caches can self-invalidate. */
  rev: number;
  /** The DOMException name once a read or write has failed, else null. */
  broken: string | null;
  [key: string]: unknown;
}

/** One time-trial leaderboard row — GameStore.ttBoard(trackId). */
type TTBoardRow = Opaque;

/** A free-camera override installed by __apex (view/orbit/studio/…). */
interface DebugCam {
  eye: Vec3;
  target: Vec3;
  fov: number;
  far?: number;
  fog?: unknown;
}

/** The horizon-facing sky override __apex.sky() installs, or null. */
interface SkyViewOverride { eye: Vec3; tgt: Vec3; fov: number; }

/** The car-photography lamp rig __apex.studio() installs. */
interface StudioRig {
  n: number; dist: number; h: number; intensity: number;
  color: Vec3; radius: number; spin: number; fill: number;
  /** Ambient stashed while the rig lifts it; restored by studio(false). */
  _ambStash?: [unknown, unknown];
}

/** Test-only control override (null = read the real Input). __apex.setInput(). */
interface TestInput { steer: number; throttle: boolean; brake: boolean; }

/** A scheduled weather transition — startWeatherArc(). */
interface WeatherArc { from: string; to: string; t: number; dur: number; seq: unknown; }

/** An ACTIVE AERO activation zone, in arc metres. Owner: js/physics/aero-zones.js. */
interface AeroZone { start: number; end: number; len: number; }

/** A pooled centreline sample (position, tangent, right, half-width). */
interface TrackSample { p: Vec3; t: Vec3; r: Vec3; hw: number; }

/** Free-fly photo camera pose. */
interface PhotoCam { pos: Vec3; yaw: number; pitch: number; fov: number; }

/** Held keys for the photo camera (WASD + up/down + page up/down). */
type PhotoKeys = Record<string, boolean>;

/** Photo-camera pointer drag state. */
interface PhotoMouse { dx: number; dy: number; drag: boolean; px: number; py: number; pid: number | null; }

/** A 2-axis photo-camera stick (move or look). */
interface PhotoAxis { x: number; y: number; }

/** The lighting profile store, keyed "track|timeOfDay|weather" (plus "*").
    Owner: js/lighting/profiles.js; tuner.js mutates it for RESET/COPY VALUES. */
type LightProfiles = Record<string, Record<string, unknown>>;

/** The caution/flag picture race control publishes — js/race/race-control.js. */
interface CautionInfo {
  level: number; sector: number; frac: number; total: number;
  sectors: [number, number, number]; sinceT: number; cause: string;
  [key: string]: unknown;
}

/** A camera solution: where the eye is, what it looks at, and the FOV. */
interface CamVantage { eye: Vec3; tgt: Vec3; fov: number; }

/** The multiplayer session driver — js/net/netplay.js (NetPlay.create(G)). */
type NetPlayApi = Opaque;

/** The lobby/room state machine — js/net/lobby.js (NetLobby.create(G)). */
type NetLobbyApi = Opaque;

/** A countdown pending on the SESSION's clock: `at` is lights-out. */
interface NetStart { at: number; hold: number; now(): number | null; }

/** A seat another player holds, so the garage can refuse to hand it out. */
interface PeerSeat { team: string; driver: number; }

/** One row of the qualifying model's classification (cars stripped out). */
type QualiRow = Opaque;

/** The UI/HUD scale readout setScale() returns. */
interface ScaleState { pct: number; stored: unknown; min: number; max: number; [key: string]: unknown; }

/** What drawAeroFlaps() is handed in the garage: the resolved level and style. */
interface FlapArgs { aLvl: number; style: string | null; }

/** A resolved parts setup for one team — Parts.resolveSetup()/getTeamParts(). */
type PartsSetup = Opaque;

/** The static DOM the shell guarantees (index.html). `$()` itself returns
    HTMLElement | null; every id here is in the shipped shell, so the members are
    typed non-null and a missing one is a shell bug, not a type-system concern. */
interface GameEls {
  hud: HTMLElement; pos: HTMLElement; lap: HTMLElement; time: HTMLElement;
  best: HTMLElement; speed: HTMLElement; energy: HTMLElement;
  ot: HTMLElement; aero: HTMLElement;
  gapA: HTMLElement; gapB: HTMLElement;
  hudSectors: HTMLElement;
  flag: HTMLElement; minimap: HTMLElement;
  lights: HTMLElement; announce: HTMLElement;
  overlay: HTMLElement; subtitle: HTMLElement; audiostate: HTMLElement;
  select: HTMLElement; selTitle: HTMLElement; selTeams: HTMLElement;
  selTracks: HTMLElement;
  selPreviewMap: HTMLElement; selPreviewName: HTMLElement;
  selPreviewGp: HTMLElement; selPreviewMeta: HTMLElement;
  selPreviewRec: HTMLElement;
  selTrackSection: HTMLElement; selCircuitLabel: HTMLElement;
  selBack: HTMLElement; selGo: HTMLElement;
  customize: HTMLElement;
  results: HTMLElement; resultsTitle: HTMLElement;
  resultsTable: HTMLElement; resMenu: HTMLElement; resNext: HTMLElement;
  pmStandings: HTMLElement;
  pausebtn: HTMLElement; pausemenu: HTMLElement; pmsettings: HTMLElement; btnCam: HTMLElement;
  howtoplay: HTMLElement; datahub: HTMLElement; soundbtn: HTMLElement;
  btnBoost: HTMLElement; btnOT: HTMLElement; btnAero: HTMLElement; btnBrake: HTMLElement;
  btnThrottle: HTMLElement;
  btnSteerLeft: HTMLElement; btnSteerRight: HTMLElement;
  shiftUp: HTMLElement; shiftDown: HTMLElement;
  gear: HTMLElement; rpmFill: HTMLElement; tach: HTMLElement;
}

// ── Enumerated string states ─────────────────────────────────────────────────

/** Screen/flow state machine — js/game.js `let state`. */
type GameState = string;
/** "gp" | "season" | "career" — flow is the authority, seasonMode a derived view. */
type FlowMode = string;
/** "race" | "tt" — session is the authority, timeTrial a derived view. */
type SessionMode = string;
/** "dry" | "wet" | "rain". */
type Weather = string;
/** "default" | "day" | "dusk" | "dawn" | "night". */
type TimeOfDay = string;
/** "off" | "low" | "normal" | "high" — Reliability.isLevel() gates the setter. */
type ReliabilityLevel = string;
/** "manual" | "auto" — the ACTIVE AERO race setting. */
type AeroMode = string;

// ══ The façade ═══════════════════════════════════════════════════════════════

/** The one object js/game.js hands to every extracted module. Member order and
    grouping follow the `const G = {…}` literal in js/game.js exactly. */
interface GameCtx {
  // ── DOM + formatting helpers ───────────────────────────────────────────────
  readonly $: (id: string) => HTMLElement | null;
  readonly els: GameEls;
  readonly fmtTime: (t: number) => string;
  /** The DASH number for a ground speed — km/h on the pace-5 scale (see vTop). */
  readonly dashKph: (v: number) => number;
  readonly ttBoard: (trackId: string) => TTBoardRow[];
  readonly teamById: (id: string) => TeamDef | undefined;
  readonly cssCol: (c: Vec3) => string;

  // ── Session identity: what is on screen and which mode it is ───────────────
  state: GameState;
  readonly track: TrackModel | null;
  readonly cars: CarState[];
  readonly player: CarState | null;
  season: SeasonState | null;
  /** flow/session are the authority; seasonMode/timeTrial are derived views. */
  flow: FlowMode;
  session: SessionMode;
  /** Read-through to js/career/career.js — one copy, never a stale mirror. */
  readonly career: CareerSave;
  readonly careerSettlement: CareerSettlement | null;
  readonly openCareer: () => void;
  seasonMode: boolean;
  /** The championship round in a season/career, else the session race counter. */
  readonly seasonRound: number;
  readonly ttNewRecord: boolean;
  readonly ttSessionTs: number;
  ttRecord: number;
  timeTrial: boolean;
  readonly lapsTarget: number;

  // ── Reliability: the race setting, the arming path, the manual retire ──────
  raceReliability: ReliabilityLevel;
  readonly armReliability: (field?: CarState[]) => CarState[];
  readonly retireCar: (c: CarState, reason?: string) => void;
  readonly ranked: CarState[];
  readonly sectorLast: [number | null, number | null, number | null];

  // ── Determinism: the sim RNG seed (setting it rewinds the stream) ──────────
  seed: number;
  readonly simSeed: (v?: number) => number;

  // ── Driving-model tunables (let-s in game.js; PACE re-inits the cameras) ───
  DRIFT: number;
  FRONT_GRIP: number;
  /** A ground-speed SCALE, not a cap — compare speeds via vTop()/aTop() only. */
  PACE: number;
  PLAYER_GRIP: number;
  ROAD_FOLLOW: number;
  STEER_EXPO: number;
  STEER_MAX_SLIP: number;
  STEER_SPEED_REF: number;
  WHEELBASE: number;
  YAW_DAMP: number;
  YAW_INERTIA: number;
  raceLineAssist: number;

  // ── Debug/test scratch state ──────────────────────────────────────────────
  _lastFloodEmit: number;
  _studioRig: StudioRig | null;
  _testInput: TestInput | null;
  builtTrackNight: boolean | null;

  // ── Camera state (cam-modes.js, cam-tuner.js, photomode.js, apex.js) ───────
  camEye: Vec3;
  camFov: number;
  camMode: number;
  camCutT: number;
  camRoll: number;
  camTgt: Vec3;
  dbgCam: DebugCam | null;

  // ── Per-frame render + race clocks ────────────────────────────────────────
  frame: FrameState;
  frameSky: FrameState;
  frozen: boolean;
  headlessMode: boolean;
  hideMeshes: Record<string, boolean>;
  paused: boolean;
  raceLaps: number;
  raceT: number;
  /** The RENDER clock (sky drift, flag cloth) — pin it for a pixel comparison. */
  skyT: number;
  raceTimeOfDay: TimeOfDay;
  raceWeather: Weather;
  sectorBests: [number, number, number];
  sectorIdx: number;
  sectorStartT: number;
  skyViewOverride: SkyViewOverride | null;
  trackIdx: number;
  ttLaps: number[];
  weatherArc: WeatherArc | null;

  // ── Atmosphere state (js/lighting/atmosphere.js) ──────────────────────────────
  _cloudBase: number;
  _ltBase: unknown;
  _ltFlash: number;
  _ltNextT: number;

  // ── Garage / setup preview (js/garage/setup-sheet.js) ──────────────────────────
  livDraftOverride: unknown;
  _spMeshKey: string;
  setupPreviewOn: boolean;
  readonly setupPreviewSpin: boolean;
  readonly setupPreviewAz: number;
  readonly setupPreviewEl: number;
  readonly setupPreviewDist: number;
  /** Last frame's RESOLVED turntable distance — what the camera used, which is
   *  setupPreviewDist only when the auto-fit is off. */
  readonly spEffDist: number;
  /** The auto fit BEFORE its cap/clamp, so a test can see the fit diverge on a
   *  narrow viewport rather than only the clamped symptom. */
  readonly spEffFit: number;
  /** Fraction of the canvas width the docked settings sheet covered. */
  readonly spEffPanel: number;
  readonly setupPreviewPan: Vec3;
  readonly setupPreviewAeroX: number;

  // ── Active aero: the race setting and the loaded circuit's zones ──────────
  raceAeroMode: AeroMode;
  readonly aeroZones: AeroZone[];
  readonly aeroZoneAt: (s: number) => AeroZone | null;
  /** Metres to the next zone; 0 inside one, Infinity on a circuit with none. */
  readonly aeroZoneAhead: (s: number) => number;
  readonly stepSetupAero: (dt: number) => void;
  readonly setupFlapArgs: () => FlapArgs;
  readonly setSetupAero: (on: boolean) => void;
  readonly setupPreviewXOn: boolean;

  // ── Player settings persisted through store ───────────────────────────────
  soundOn: boolean;
  musicEnabled: boolean;
  unlimitedBudget: boolean;
  teamIdx: number;

  // ── Livery/parts persistence helpers (js/garage/setup-sheet.js) ────────────────
  readonly arrToHex: (a: Vec3) => string;
  readonly hexToArr: (h: string) => Vec3;
  /** Arm-then-confirm for destructive buttons (the career DELETE? idiom, shared): first call arms in place and returns false, second runs `action`; disarm = the caller rebuilding the node. */
  readonly armConfirm: (btn: HTMLElement, armedText: string, action: () => void) => boolean;
  readonly getTeamParts: (teamId: string) => PartsSetup;
  readonly saveTeamParts: (teamId: string, parts: PartsSetup) => void;
  readonly getLiveryId: (teamId: string) => string;
  readonly saveLiveryId: (teamId: string, id: string) => void;
  readonly getCustomLiveries: (teamId: string) => unknown[];
  readonly setCustomLiveries: (teamId: string, arr: unknown[]) => void;
  readonly getLiveries: (team: TeamDef) => unknown[];
  readonly invalidateDecalTextures: (teamId: string) => void;

  // ── Menus: selection state + the screens game.js still owns ───────────────
  driverIdx: number;
  difficulty: string;
  readonly store: StoreApi;
  readonly tickUi: () => void;
  readonly scheduleFlybyTrack: () => void;
  readonly buildSetup: () => void;
  readonly setTeamPicker: (open: boolean, host?: HTMLElement) => void;
  readonly teamSwatch: (t: TeamDef) => HTMLElement;
  readonly openGarage: (from?: string) => void;
  readonly openCustomize: () => void;
  readonly openRaceSettings: (from?: string) => void;
  /** Open #season-setup (the calendar + weekend format editor). */
  readonly openSeasonSetup: () => void;
  /** Rebuild #select — season-ui.js calls it after APPLY changes the calendar. */
  readonly buildSelect: () => void;
  /** The read-only qualifying model for the CURRENT track (__apex.qualiSim). */
  readonly qualiSim: (playerTime?: number) => QualiRow[] | null;
  readonly refreshCareerButton: () => void;
  /** The R&D gate for the garage listing: fittable option ids, or null. */
  readonly careerOwned: () => Set<string> | null;

  // ── Photo mode + the lighting tuner's live profile object ─────────────────
  photoMode: boolean;
  _photoPrevScale: number;
  photoAlt: number;
  photoVertT: number;
  _ltStore: LightProfiles;
  readonly photoCam: PhotoCam;
  readonly photoKeys: PhotoKeys;
  readonly photoMouse: PhotoMouse;
  readonly photoMove: PhotoAxis;
  readonly photoLook: PhotoAxis;
  readonly applyResMode: () => void;
  /** Select-screen track card refresh — Menus owns it; UiScale calls it on zoom. */
  readonly updateTrackPreview: () => void;
  readonly ltKey: () => string;
  readonly exitPhotoMode: () => void;

  // ── Atmosphere helpers ────────────────────────────────────────────────────
  readonly clamp: (v: number, a: number, b: number) => number;
  readonly satAdjust: (rgb: Vec3, amt: number) => Vec3;
  readonly isRaining: () => boolean;
  readonly isWetRoad: () => boolean;
  readonly initRainDrops: () => void;
  readonly isFloodActiveSession: () => boolean;
  readonly _nightAmbientBand: () => number;
  readonly applyLightTune: (fromApplyRace?: boolean) => void;

  // ── Renderer + local (s,x) <-> world conversion ───────────────────────────
  readonly smp: TrackSample;
  readonly smp2: TrackSample;
  readonly canvas: HTMLCanvasElement;
  readonly gfx: GfxBackend | null;
  /** LOCAL predictor + Newton read — never a global search. See its comment. */
  readonly trackFrom: (px: number, pz: number, sPredicted: number) => { s: number; x: number };
  readonly worldFromTrack: (s: number, x: number) => { x: number; z: number };

  // ── Model constants published for js/race/quali-model.js and the net layer ──────
  readonly GAME_LAPS: number;
  readonly TT_LAPS: number;
  readonly LONG_GRIP: number;
  readonly COUNTDOWN_S: number;
  /** Absolute in the driving model — they do NOT scale with PACE. */
  readonly LAT_MAX: number;
  readonly BRAKE: number;
  readonly vTop: () => number;
  readonly aTop: () => number;
  readonly applyRaceSettings: () => void;

  // ── Race flow + the shared physics/energy formulas ────────────────────────
  readonly announce: (msg: string, dur?: number) => void;
  readonly applyCaution: (d: unknown) => void;
  readonly camVantage: (mode: number, s: number, x: number, spd: number, now: number, extra?: Opaque) => CamVantage;
  readonly endRace: (forcedOrder?: CarState[]) => void;
  readonly gridUp: (preOrder?: CarState[]) => void;
  readonly gripMult: (c?: any) => number;
  readonly isErsDeploying: (c: CarState) => boolean;
  readonly cautionInfo: () => CautionInfo;
  readonly aeroDfMult: (c: CarState) => number;
  readonly xVmaxGain: (c: CarState) => number;
  readonly xDfLoss: (c: CarState) => number;
  readonly drainFor: (c: CarState) => number;
  readonly regenFor: (c: CarState) => number;
  readonly otTimeFor: (c: CarState) => number;
  readonly otCoolFor: (c: CarState) => number;
  readonly setCautionEnabled: (on: boolean) => void;
  readonly otEnabled: () => boolean;

  // ── Multiplayer seam (js/net/*) ──────────────────────────────────────────
  readonly netPlay: NetPlayApi;
  netStart: NetStart | null;
  /** A SESSION's clock, not the page's — netplay nulls it between sessions. */
  netNow: number | null;
  /** The countdown clock and how many lamps are lit. */
  countT: number;
  lightsLit: number;
  readonly netLobby: NetLobbyApi;

  // ── Loading, lighting persistence, camera + car plumbing ─────────────────
  readonly loadCarModel: (url: string) => Promise<unknown>;
  readonly loadTrack: (idx: number) => void;
  readonly persistLightTune: () => void;
  readonly copyLightTune: (mode?: string) => unknown;
  readonly restoreLightTune: (undo?: unknown) => unknown;
  readonly refreshLightTunePanel: () => void;
  readonly setCamMode: (m: number) => void;
  readonly rescuePlayer: (c: CarState) => void;
  readonly setLightTune: (id: string, v: unknown) => void;
  readonly setWeatherLive: (w: Weather) => void;
  /** Live time-of-day (read with no arg, write with tod). Rebuilds track when day/night flips. */
  readonly setTimeOfDay: (tod?: TimeOfDay) => TimeOfDay;
  /** Live weather (read with no arg, write with w). Same path as __apex.weather(). */
  readonly weather: (w?: Weather) => Weather;
  readonly snapGameCam: () => void;
  readonly setCarRole: (c: CarState, human: boolean, local: boolean) => void;
  readonly modsFor: (team: TeamDef, setup: PartsSetup) => CarMods;
  readonly swapGridSlots: (a: number, b: number) => boolean;
  /** Stable cross-peer car identity: teamIndex*2 + seat, or -1. */
  readonly wireId: (c: CarState) => number;
  /** UI SIZE / HUD SIZE — see __apex.uiScale. */
  readonly setScale: (key: string, prop: string, v: number) => ScaleState;
  /** Publish current race state to the HUD/minimap immediately. */
  readonly refreshHud: (force?: boolean) => void;

  // ── The waiting room reuses the real menus rather than reimplementing them ─
  readonly setNetRoom: (on: boolean) => void;
  readonly openRaceSetup: () => void;
  readonly netRoom: boolean;
  /** Seats held by the OTHER players; empty off-line. */
  readonly peerSeats: () => PeerSeat[];
  readonly onPeerQuali: (d: unknown) => void;
  readonly onPeerQualiLive: (d: unknown) => void;
  readonly openQualiForNet: (done: () => void) => void;
  readonly refreshQualiGate: () => void;
  raceQuali: boolean;
  readonly openGarageFrom: (from?: string) => void;
  readonly startRace: () => void;
  readonly startWeatherArc: (from: Weather, to: Weather, dur?: number) => void;
  readonly update: (dt: number) => void;
  /** Arc position wrapped into [0, track.total). */
  readonly wrapS: (s: number) => number;
  readonly quitToMenu: () => void;
}

// ── Module.create(G) ─────────────────────────────────────────────────────────

/* Every js/game/*.js and js/net/*.js module is a "use strict" IIFE assigning ONE
   global whose sole entry point is `create(ctx)`: game.js builds G, then calls
   `const api = Module.create(G)` in load order and keeps the returned api. The
   modules never reach back into game.js — G is the entire seam, which is why
   typing G types the boundary.

   The returned API shape is per-module and stays `Record<string, unknown>` here;
   Phase 6 authors the individual api interfaces. What this declaration pins is
   the part that is uniform and the part that drifts: the argument is a GameCtx,
   so a module that reads `ctx.fooo` is a compile error against this file. */
interface GameModuleFactory<TApi = Record<string, unknown>> {
  create(ctx: GameCtx): TApi;
}

/* The modules constructed with the ctx itself — `X.create(G)` in game.js, plus
   AgentView, which js/agent/apex.js builds off the ctx it was handed.
   tools/check-gctx.mjs resolves every `X.create(<ctx>)` call site through
   eslint-scope and asserts the two lists agree, so a new ctx module that is not
   declared here fails the surface test. NOT here, deliberately: AgentRaster
   (the AgentRaster.create call in js/agent/agentview.js hands it a bespoke bag, not the ctx) and
   NetSession (js/net/session.js takes {transport}) — same `create()` spelling,
   different contract. */
declare const AeroZones: GameModuleFactory;
declare const AgentView: GameModuleFactory;
declare const ApexApi: GameModuleFactory;
declare const Atmosphere: GameModuleFactory;
declare const AudioPanel: GameModuleFactory;
declare const BodyAttitude: GameModuleFactory;
declare const BrakeCue: GameModuleFactory;
declare const CamModes: GameModuleFactory;
declare const CamTunerPanel: GameModuleFactory;
declare const CareerUI: GameModuleFactory;
declare const SeasonUI: GameModuleFactory;
declare const DebrisWorld: GameModuleFactory;
declare const GameHud: GameModuleFactory;
declare const GameResults: GameModuleFactory;
declare const IncidentSim: GameModuleFactory;
declare const LightStore: GameModuleFactory;
declare const Menus: GameModuleFactory;
declare const NetLobby: GameModuleFactory;
declare const NetPlay: GameModuleFactory;
declare const Photomode: GameModuleFactory;
declare const Quali: GameModuleFactory;
declare const QualiSheet: GameModuleFactory;
declare const RaceControl: GameModuleFactory;
declare const SetupUI: GameModuleFactory;
declare const SkidMarks: GameModuleFactory;
declare const SteerTuning: GameModuleFactory;
declare const TunerPanel: GameModuleFactory;
declare const UiScale: GameModuleFactory;
