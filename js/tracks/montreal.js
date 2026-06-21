/* Apex 26 — MONTREAL circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "montreal",
    name: "MONTREAL",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    pal: { zenith: [0.28, 0.44, 0.7], horizon: [0.68, 0.74, 0.8], grass: [0.22, 0.48, 0.18], runoff: [0.42, 0.4, 0.38], fogDensity: 0.0014, sunDir: [0.5134360308102702, 0.6067880364121376, 0.6067880364121376], sun: [1, 0.92, 0.78], sunColor: [1, 0.9, 0.76] },
    segs: [
      { t: 0, l: 380 }, { t: 80, l: 90 }, { t: -90, l: 100 }, { t: 0, l: 300 }, { t: 90, l: 90 }, { t: 0, l: 420 },
      { t: -80, l: 90 }, { t: 60, l: 70 }, { t: -60, l: 70 }, { t: 0, l: 220 }, { t: 100, l: 110 }, { t: -100, l: 110 },
    ],
    scenery: function (api) {
      const { out, n, px, pz, place, prop, backdrop, groundPlane, wall, grandstand,
        tree, building, anchor, addBox, addCyl, addFrustum, addCone, vadd, hash,
        fence, guardrail, tyreWall, hedge, billboard, gantry, marshalPost, bush,
        ferrisWheel, tower, onTrack } = api;
      const K = (s) => Math.round(s * n) % n;

      // ---- Île Notre-Dame palette (bright June day) ----
      const WALL = [0.78, 0.79, 0.80];      // pale concrete
      const RIVER = [0.22, 0.45, 0.58];     // St. Lawrence
      const BASIN = [0.20, 0.50, 0.60];     // Olympic rowing lake
      const GRASS = [0.30, 0.55, 0.28];     // park green
      const FOLIAGE = [0.18, 0.42, 0.22];   // deep tree green
      const FOLIAGE2 = [0.24, 0.48, 0.24];  // lighter June foliage
      const HEDGE = [0.20, 0.40, 0.20];     // clipped hedge green
      const PATH = [0.62, 0.60, 0.55];      // paved cycle path

      const KERB_R = [0.82, 0.20, 0.18], KERB_W = [0.90, 0.90, 0.90];

      // ===================================================================
      // Continuous pale concrete walls lining both edges (FLAT island)
      // ===================================================================
      wall(0.0, 1.0, -1, 2.5, 1.5, WALL);
      wall(0.0, 1.0, 1, 2.5, 1.5, WALL);

      // Catch / debris fence behind the walls — the tight street-style corridor.
      fence(0.0, 1.0, -1, 3.4, 3.0, [0.74, 0.76, 0.80]);
      fence(0.0, 1.0, 1, 3.4, 3.0, [0.74, 0.76, 0.80]);

      // Grass strips of parkland just beyond the walls, both sides
      for (let i = 0; i < n; i += 3) {
        const side = (i % 2) ? 1 : -1;
        place(i, side, 7, [10, 0.4, 12], GRASS);
      }

      // Continuous low clipped hedge / treeline ribbon framing both verges
      hedge(0.13, 0.24, 1, 9, 1.6, HEDGE);
      hedge(0.62, 0.78, -1, 9, 1.6, HEDGE);
      hedge(0.78, 0.90, 1, 9, 1.6, HEDGE);

      // Marshal posts spaced around the lap (orange-roofed bunkers + flag pole)
      for (const s of [0.05, 0.18, 0.32, 0.47, 0.56, 0.68, 0.82, 0.94]) {
        marshalPost(K(s), (Math.round(s * 100) % 2) ? 1 : -1, 8.5);
      }

      // ===================================================================
      // s 0.02 R — Pit wall & main grandstand on the start straight
      // ===================================================================
      grandstand(0.02, 1, 8, 120, [0.50, 0.51, 0.56], [0.62, 0.34, 0.30]);
      grandstand(0.0, -1, 10, 90, [0.46, 0.47, 0.52], [0.55, 0.40, 0.38]);
      grandstand(0.06, 1, 9, 90, [0.48, 0.49, 0.55], [0.58, 0.36, 0.34]);
      grandstand(0.96, -1, 11, 80, [0.47, 0.48, 0.53], [0.56, 0.38, 0.36]);

      // Start/finish gantry spanning the main straight + a second timing arch
      gantry(0.005, 7.5, [0.14, 0.14, 0.18]);
      gantry(0.97, 6.5, [0.16, 0.16, 0.20]);

      // Pit lane garages / paddock buildings behind the left pit wall (long low row)
      for (let i = 0; i < 6; i++) {
        const s = 0.965 + i * 0.012;
        building(K(s), -1, 13, 16, 9, 14,
          { wall: [0.66, 0.67, 0.71], window: [0.42, 0.50, 0.60], floor: 4 });
      }
      // Paddock hospitality block + media centre, taller, set further back
      building(K(0.0), -1, 30, 26, 16, 22,
        { wall: [0.72, 0.74, 0.78], window: [0.50, 0.62, 0.74], floor: 4, setback: true, roof: true });
      building(K(0.03), -1, 32, 22, 13, 20,
        { wall: [0.68, 0.70, 0.74], window: [0.48, 0.58, 0.70], floor: 4, roof: true });

      // Pit-straight billboards / advertising hoardings (right verge, well clear)
      for (const s of [0.01, 0.04, 0.97, 0.94]) {
        billboard(K(s), 1, 10, 14, 4, [0.88, 0.82, 0.22]);
      }
      billboard(K(0.07), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // ===================================================================
      // s 0.04 both — Senna S chicane: angled kerb slabs + tyre-wall funnel
      // ===================================================================
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          place(K(0.04 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
        }
      }
      // Tyre barriers stacked against the apex walls of the Senna S
      tyreWall(0.038, 0.058, 1, 3.2, [0.85, 0.30, 0.20]);
      tyreWall(0.042, 0.06, -1, 3.2, [0.90, 0.90, 0.30]);
      marshalPost(K(0.05), 1, 9);

      // ===================================================================
      // s 0.10 L — Olympic Basin rowing lake (continuous teal water band)
      // ===================================================================
      for (let i = 0; i < 5; i++) {
        groundPlane(K(0.07 + i * 0.022), -1, 14, [200, 2, 260], BASIN);
      }
      // Far bank of the basin: low green treeline ridge across the water
      for (let i = 0; i < 14; i++) {
        const k = K(0.07 + (i / 14) * 0.12);
        backdrop(k, -1, 150 + hash(i * 7) * 30, [22, 8 + hash(i * 3) * 6, 22], [0.20, 0.40, 0.22]);
      }

      // ===================================================================
      // s 0.15 both — Parkland trees (green cube canopies on trunks)
      // ===================================================================
      for (let i = 0; i < 34; i++) {
        const s = 0.13 + i * 0.0022;
        const side = (i % 2) ? 1 : -1;
        tree(K(s), side, 7 + hash(i * 5) * 12, 6 + hash(i * 3) * 4, (i % 3) ? FOLIAGE : FOLIAGE2);
      }
      // Shrub clumps dotted between the trees for low-level greenery
      for (let i = 0; i < 16; i++) {
        bush(K(0.135 + i * 0.0045), (i % 2) ? 1 : -1, 8 + hash(i * 9) * 5,
          (i % 2) ? [0.22, 0.42, 0.20] : [0.18, 0.36, 0.18]);
      }

      // ===================================================================
      // s 0.25 R far — Casino de Montréal (faceted pale Expo pavilion)
      // ===================================================================
      {
        const k = K(0.25);
        building(k, 1, 170, 40, 70, 40, { wall: [0.80, 0.82, 0.86], window: [0.62, 0.74, 0.86], floor: 6 });
        // stepped faceted upper blocks
        const a = anchor(k, 1, 190);
        addBox(out, vadd(a.c, a.u, 78), [30, 16, 30], [0.84, 0.86, 0.90], [a.r, a.u, a.t]);
        addBox(out, vadd(a.c, a.u, 90), [20, 14, 20], [0.86, 0.88, 0.92], [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.30 L far — Biosphère dome (sphere via stacked frustums + cone)
      // ===================================================================
      {
        const k = K(0.30);
        const a = anchor(k, -1, 200);
        const DOME = [0.80, 0.82, 0.85];
        const rings = [[40, 36, 14], [36, 28, 14], [28, 16, 14], [16, 6, 12]];
        let y = 0;
        for (const [rb, rt, h] of rings) {
          addFrustum(out, vadd(a.c, a.u, y + h / 2), rb, rt, h, DOME, 12, [a.r, a.u, a.t]);
          y += h;
        }
        addCone(out, vadd(a.c, a.u, y), 6, 8, DOME, 10, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.38 L far — Montreal CBD skyline across the river
      // ===================================================================
      // Continuous St. Lawrence water band between island and downtown
      for (let i = 0; i < 5; i++) {
        groundPlane(K(0.30 + i * 0.022), -1, 30, [260, 2, 240], RIVER);
      }
      // Front rank: dense unbroken band of towers (no gaps, varied heights)
      for (let i = 0; i < 30; i++) {
        const k = K(0.30 + (i / 30) * 0.16);
        const dist = 190 + hash(i * 7) * 50;
        const w = 18 + hash(i * 3) * 16;
        const h = 70 + hash(i * 11) * 150;
        building(k, -1, dist - w / 2, w, h, w, { wall: [0.55, 0.58, 0.64], window: [0.66, 0.74, 0.84], floor: 6 });
      }
      // Mid rank: fills the gaps behind the front rank
      for (let i = 0; i < 26; i++) {
        const k = K(0.305 + (i / 26) * 0.155);
        const dist = 260 + hash(i * 13) * 60;
        const w = 16 + hash(i * 5) * 14;
        const h = 60 + hash(i * 9) * 120;
        building(k, -1, dist - w / 2, w, h, w, { wall: [0.52, 0.55, 0.61], window: [0.62, 0.70, 0.80], floor: 6 });
      }
      // hazed back silhouette band — continuous wrap
      for (let i = 0; i < 28; i++) {
        const k = K(0.30 + (i / 28) * 0.17);
        backdrop(k, -1, 340 + hash(i * 17) * 60, [26, 50 + hash(i * 13) * 90, 26], [0.50, 0.55, 0.62]);
      }

      // ===================================================================
      // s 0.45 R close — Casino corner + footbridge spanning the track
      // ===================================================================
      {
        const k = K(0.45);
        const a = anchor(k, 1, 4);
        // deck spanning over to the left edge
        addBox(out, vadd(a.c, a.u, 8), [30, 1.2, 5], [0.70, 0.72, 0.74], [a.r, a.u, a.t]);
        addCyl(out, a.c, 0.6, 8, [0.66, 0.68, 0.70], 6, [a.r, a.u, a.t]);
      }

      // ===================================================================
      // s 0.45 R far — La Ronde amusement park ferris wheel across the water
      // ===================================================================
      ferrisWheel(K(0.42), 1, 150, 34);
      // a couple of fairground towers beside it
      tower(K(0.40), 1, 175, 14, 46, { col: [0.78, 0.62, 0.40], seg: 6, cap: true, capCol: [0.8, 0.3, 0.2], mast: 10 });

      // ===================================================================
      // s 0.55 both — L'Épingle hairpin: tight U of walls + grandstand
      // ===================================================================
      grandstand(0.55, 1, 12, 70, [0.48, 0.49, 0.54], [0.60, 0.36, 0.32]);
      grandstand(0.53, -1, 12, 60, [0.46, 0.47, 0.52], [0.58, 0.38, 0.34]);
      grandstand(0.57, 1, 13, 60, [0.50, 0.51, 0.55], [0.62, 0.38, 0.34]);
      for (const side of [-1, 1]) {
        for (let j = 0; j < 3; j++) place(K(0.55 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_R : KERB_W);
      }
      // Tyre walls + marshal post packed around the slow hairpin apex
      tyreWall(0.545, 0.565, -1, 3.0, [0.90, 0.85, 0.20]);
      tyreWall(0.548, 0.568, 1, 3.0, [0.85, 0.30, 0.20]);
      marshalPost(K(0.55), -1, 9);
      billboard(K(0.52), 1, 11, 12, 4, [0.30, 0.50, 0.85]);
      billboard(K(0.58), -1, 11, 12, 4, [0.88, 0.82, 0.22]);

      // ===================================================================
      // s 0.60 L mid — Casino Straight flanked by Olympic Basin water
      // ===================================================================
      for (let i = 0; i < 4; i++) {
        groundPlane(K(0.58 + i * 0.024), -1, 14, [190, 2, 240], BASIN);
      }
      for (let i = 0; i < 18; i++) {
        tree(K(0.575 + i * 0.0035), 1, 7 + hash(i * 4) * 9, 5 + hash(i * 2) * 4, FOLIAGE);
      }

      // ===================================================================
      // s 0.69–0.90 — leafy back stretch through Parc Jean-Drapeau
      // ===================================================================
      // Dense parkland trees both verges (filling the previously bare stretch)
      for (let i = 0; i < 44; i++) {
        const s = 0.66 + i * 0.0055;
        const side = (i % 2) ? 1 : -1;
        tree(K(s), side, 7 + hash(i * 6) * 12, 5 + hash(i * 3) * 5, (i % 3) ? FOLIAGE : FOLIAGE2);
      }
      // Shrubs + grass mounds threaded between
      for (let i = 0; i < 20; i++) {
        bush(K(0.665 + i * 0.0115), (i % 2) ? -1 : 1, 8 + hash(i * 11) * 6,
          (i % 2) ? [0.20, 0.40, 0.18] : [0.24, 0.44, 0.22]);
      }
      // Paved cycle-path slabs hinting the park's bike trails (well off track)
      for (let i = 0; i < 10; i++) {
        place(K(0.70 + i * 0.018), 1, 12 + hash(i * 5) * 4, [3, 0.3, 9], PATH);
      }
      // A small grandstand + bridge canal scenery on the back straight
      grandstand(0.74, -1, 11, 64, [0.47, 0.48, 0.53], [0.56, 0.40, 0.36]);
      // Canal water slab off the right verge (island laced with canals)
      for (let i = 0; i < 3; i++) {
        groundPlane(K(0.78 + i * 0.02), 1, 16, [120, 2, 150], RIVER);
      }
      // Treeline ridge on the canal's far bank
      for (let i = 0; i < 10; i++) {
        backdrop(K(0.78 + (i / 10) * 0.08), 1, 130 + hash(i * 7) * 30, [20, 9, 20], [0.20, 0.40, 0.22]);
      }
      billboard(K(0.84), -1, 11, 12, 4, [0.86, 0.30, 0.26]);

      // ===================================================================
      // s 0.92 both — Final chicane: tight kerb funnel + tyre walls
      // ===================================================================
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) place(K(0.92 + j * 0.004), side, 3, [3, 0.2, 4], (j % 2) ? KERB_W : KERB_R);
      }
      tyreWall(0.915, 0.935, -1, 3.0, [0.90, 0.85, 0.20]);
      marshalPost(K(0.93), -1, 9);
      grandstand(0.93, -1, 12, 70, [0.48, 0.49, 0.54], [0.58, 0.36, 0.32]);

      // ===================================================================
      // s 0.96 R — WALL OF CHAMPIONS: unbroken pale concrete wall on exit
      // ===================================================================
      wall(0.955, 0.99, 1, 0.8, 1.8, [0.82, 0.83, 0.84], 0.7);
      // "Bienvenue au Québec" graphic band along it (signature red stripe)
      {
        const k = K(0.97);
        const a = anchor(k, 1, 0.8);
        addBox(out, vadd(a.c, a.u, 1.4), [0.85, 0.6, 18], [0.85, 0.30, 0.30], [a.r, a.u, a.t]);
        // white sponsor stripe beneath the red band
        addBox(out, vadd(a.c, a.u, 0.8), [0.86, 0.4, 18], [0.92, 0.92, 0.94], [a.r, a.u, a.t]);
      }
      // Packed grandstand opposite the Wall of Champions watching the chicane
      grandstand(0.97, -1, 12, 90, [0.49, 0.50, 0.55], [0.60, 0.36, 0.30]);
      billboard(K(0.96), -1, 12, 14, 4, [0.88, 0.82, 0.22]);
    },
  }
  );
})();
