// Canonical browser-free garage camera metadata, shared by captures and MCP discovery.
// @doc Named garage targets, camera aliases, stations and livery field mappings.
// @skill garage-parts-livery

export const TARGETS = {
  car: null,
  nose:  [0, 0.35, 2.0],
  crown: [0, 0.95, -0.55],
  fin:   [0, 1.05, -1.5],
  flank: [0.6, 0.65, -0.35],
  wall:  [0, 1.8, -6.0],
};

export const CAM_ALIAS = {
  bay:      "hero:0.68pi,0.26,9.2",    // rear-left three-quarter, back wall in frame
  bayFront: "front:0.32pi,0.28,9.4",   // opposite diagonal, same left flank
};

// Room inspection uses the same orbit contract as car close-ups. Author an
// eye/look pair once, then expose ordinary az/el/dist/target so CLI axes and
// persistent garage sessions can override each component without a new rig.
function roomStation(eye, target, subject, purpose) {
  const [dx, dy, dz] = eye.map((n, i) => n - target[i]);
  const dist = Math.hypot(dx, dy, dz);
  return { view: "hero", az: Math.atan2(dx, dz), el: Math.asin(dy / dist),
    dist, target, lamp: "off", clamp: false, subject, purpose };
}

export const STATIONS = {
  // Equipment targets live against the walls; car-centred hero/front/rear
  // cannot show their mounting, floor contact and storage clearances clearly.
  toolWall: roomStation([2.5, 1.6, -0.5], [4.9, 0.9, -1.7],
    "Tool cabinets and wall-mounted wheel guns", "Check drawers, handles and tool mounting above the cabinet tops."),
  serviceCorner: roomStation([2, 1.8, 3.3], [4.4, 0.8, 4.5],
    "Fluid service rig, inspection dolly and spare tyres", "Check floor contact and parking clearances in the door corner."),
  safetyStation: roomStation([-2.5, 1.4, -2.2], [-4.65, 0.4, -3.7],
    "Extinguishers, cooling fan, starter cart and tyre trolleys", "Check safety equipment, castors and aisle-facing details."),
  engineerDesk: roomStation([-2.1, 1.8, 2.2], [-5.0, 1.5, 0.6],
    "Engineer desk and monitor bank", "Check desk legs, work surface and monitor arrangement."),
  roomBack: roomStation([-4.3, 2.7, 5.5], [0.4, 1.9, -4.5],
    "Whole bay toward the back wall", "Review back-wall signage, ceiling and both equipment aisles."),
  roomDoor: roomStation([4.3, 2.7, -5.5], [-0.4, 1.9, 4.5],
    "Whole bay toward the garage door", "Review the opposite side, entrance and storage in context."),
  // crown / SPINE TOP, read top-down nose-up the way the chase camera does
  spineTop:  { view: "rear",      az: 0.92 * Math.PI, el: 0.72, dist: 3.2, target: [0, 0.9, -0.85], lamp: "off", clamp: false },
  // flank / SPINE SIDE at shoulder height, the sidepod line in frame
  spineSide: { view: "side",      az: 0.50 * Math.PI, el: 0.15, dist: 3.4, target: "flank", lamp: "side",     clamp: false },
  finBadge:  { view: "rear",      az: 0.78 * Math.PI, el: 0.30, dist: 3.0, target: "fin",   lamp: "wingRear", clamp: false },
  sidepod:   { view: "side",      az: 0.56 * Math.PI, el: 0.12, dist: 3.6, target: [0.7, 0.45, 0.2], lamp: "side", clamp: false },
  noseFlash: { view: "wingFront", az: 0.18 * Math.PI, el: 0.14, dist: 4.0, target: "nose",  lamp: "front" },
  endplate:  { view: "wingFront", az: 0.35 * Math.PI, el: 0.10, dist: 2.6, target: [0.9, 0.2, 2.3], lamp: "wingFront" },
  rearWing:  { view: "wingRear",  az: 0.72 * Math.PI, el: 0.30, dist: 2.8, target: [0, 1.0, -2.4], lamp: "wingRear" },
  wallCrest: { view: "front",     az: 0.32 * Math.PI, el: 0.28, dist: 9.4, target: "wall",  lamp: "off" },
  // the floor-level nose framing measured 2026-09-10 (eye 9 cm off the floor)
  floorNose: { view: "wingFront", az: 0,              el: 0.04, dist: 3.5, target: [0, -0.15, 2.2] },
  // CLOSE-UPS (--preset=closeup): part fills most of the frame; unique az each.
  fwLow:      { view: "wingFront", az: 8 * Math.PI / 180,   el: 0.04, dist: 2.0, target: [0, -0.05, 2.05], lamp: "front", clamp: false },
  fwSide:     { view: "wingFront", az: 85 * Math.PI / 180,  el: 0.08, dist: 2.1, target: [0.55, 0.12, 2.0], lamp: "wingFront", clamp: false },
  noseTip:    { view: "wingFront", az: 28 * Math.PI / 180,  el: 0.14, dist: 1.9, target: [0, 0.28, 2.2], lamp: "front", clamp: false },
  rwRear:     { view: "wingRear",  az: 175 * Math.PI / 180, el: 0.22, dist: 1.9, target: [0, 1.0, -2.4], lamp: "wingRear", clamp: false },
  rwSide:     { view: "wingRear",  az: 105 * Math.PI / 180, el: 0.20, dist: 2.0, target: [0.35, 1.0, -2.35], lamp: "wingRear", clamp: false },
  rwTop:      { view: "wingRear",  az: 155 * Math.PI / 180, el: 0.85, dist: 2.2, target: [0, 1.05, -2.35], lamp: "off", clamp: false },
  podInlet:   { view: "side",      az: 42 * Math.PI / 180,  el: 0.16, dist: 2.5, target: [0.7, 0.5, 0.55], lamp: "side", clamp: false },
  podFloor:   { view: "side",      az: 98 * Math.PI / 180,  el: 0.04, dist: 2.3, target: [0.75, 0.12, 0.0], lamp: "side", clamp: false },
  wheelF:     { view: "side",      az: 68 * Math.PI / 180,  el: 0.10, dist: 1.7, target: [0.9, 0.32, 1.15], lamp: "front", clamp: false },
  wheelR:     { view: "side",      az: 118 * Math.PI / 180, el: 0.10, dist: 1.7, target: [0.9, 0.32, -1.05], lamp: "rear", clamp: false },
  haloBehind: { view: "rear",      az: 205 * Math.PI / 180, el: 0.55, dist: 2.2, target: [0, 0.95, -0.15], lamp: "off", clamp: false },
  mirror:     { view: "front",     az: 48 * Math.PI / 180,  el: 0.28, dist: 1.9, target: [0.55, 0.78, 0.45], lamp: "front", clamp: false },
  cover:      { view: "rear",      az: 138 * Math.PI / 180, el: 0.42, dist: 2.6, target: [0, 0.88, -0.75], lamp: "off", clamp: false },
};

export const FIELD_STATIONS = {
  bodyStyle: ["sidepod", "noseFlash"],
  engineShape: ["sidepod"], aeroShape: ["fwSide", "rwSide"], floorShape: ["podFloor"],
  suspensionShape: ["wheelF"], brakesShape: ["wheelF"], tyresShape: ["wheelF"], wheelsShape: ["wheelF"],
  ersShape: ["sidepod"], gearboxShape: ["cover"], fuelShape: ["spineTop"], exhaustShape: ["rwRear"], cockpitShape: ["haloBehind"],
  spineLogo: ["spineTop"], spineTint: ["spineTop"], bandTint2: ["spineTop"], sunTint: ["spineTop", "spineSide"],
  spineHeight: ["spineTop", "spineSide"], cover: ["spineTop", "spineSide"], coverVents: ["spineTop"],
  coverBind: ["spineTop", "spineSide"], halo: ["spineTop"], tcam: ["spineTop"],
  spineSide: ["spineSide"], sideTint: ["spineSide"], plateTint: ["spineSide"], saddleTint: ["spineSide"],
  numFont: ["spineSide"], sponsors: ["spineSide", "sidepod"],
  fin: ["finBadge"], finArt: ["finBadge"], finStyle: ["finBadge"], finBadge: ["finBadge"],
  finShape: ["finBadge"], finHandoff: ["finBadge"],
  nose: ["noseFlash"], noseStripe: ["noseFlash"], pod: ["sidepod"], stripe: ["sidepod"],
  accent: ["sidepod", "noseFlash"], finish: ["sidepod"], bodySplit: ["sidepod"], lower: ["sidepod"],
  wing: ["endplate"], wingCarbon: ["endplate"], rearWing: ["rearWing"],
  logo: ["wallCrest", "spineTop"], logo2: ["wallCrest", "spineTop"], logo3: ["wallCrest", "spineTop"],
};
