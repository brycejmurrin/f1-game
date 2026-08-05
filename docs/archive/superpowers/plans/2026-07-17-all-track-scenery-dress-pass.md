# All-Track Scenery Dress Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve all 24 circuits with authentic, track-specific scenery and denser hero-sector backgrounds without compromising road clearance, sightlines, deterministic builds, or mobile rendering budgets.

**Architecture:** Each circuit is an independent one-file work unit owned by one agent. Agents may only edit their assigned `js/tracks/<id>.js`; the parent integrates the completed files, performs the single cache/version bump, runs global geometry and scenery regression gates, and conducts the visual lap-tour review.

**Tech Stack:** Pure JavaScript IIFEs, the existing `scenery(api)` helpers, `node tools/verify-track.cjs`, and Playwright.

## Global Constraints

- Preserve each circuit's existing identity; add 4–6 high-value, circuit-specific improvements rather than blanket generic dressing.
- Prioritize authentic landmarks and infrastructure, with dense crowds and background depth concentrated at hero sectors.
- Preserve intentionally open sightlines and sparse high-speed or performance-sensitive sectors.
- Edit only the assigned `js/tracks/<id>.js`; do not edit shared helpers, tests, docs, `index.html`, or `version.json`.
- Use existing helpers documented in `docs/SCENERY-API.md`; do not introduce new shared APIs.
- Keep the props mesh approximately below 50,000 vertices and avoid unbounded or very tight full-lap loops.
- Keep raw primitives and crowds safely behind guarded shells; avoid road, barrier, camera, and braking-marker intrusion.
- Keep all placements deterministic through fixed fractions and `hash()`-based variation.
- Every track must pass `node tools/verify-track.cjs <id>` before handoff.

---

## Track Task Pattern

Every task below follows this exact implementation cycle:

- [ ] Read `docs/SCENERY-API.md` and the assigned track file.
- [ ] Inventory existing hero landmarks, empty sectors, vegetation, crowds, service infrastructure, runoff, kerbs, and background layers.
- [ ] Choose 4–6 additions that are specific to the real circuit and complement existing dressing.
- [ ] Implement only inside the track's existing `scenery(api)` callback, destructuring any newly used helpers.

```js
scenery: function (api) {
  const { n, hash, anchor, building, grandstand, billboard,
          marshalPost, forestEdge, hedge, bush, palm, pine,
          place, backdrop, addBox, addCyl, addCone } = api;
  const K = function (s) { return Math.round(s * n) % n; };

  // Preserve existing dressing. Add fixed hero-sector placements and
  // deterministic sparse repeats using K(fraction) and hash(index).
}
```

- [ ] Keep added raw geometry behind guarded scenery and keep repeated placements sparse.
- [ ] Run the assigned verification command and fix any throw, invalid geometry, or suppressed essential landmark.
- [ ] Return the exact additions, hero fractions, verification output, and any remaining visual/performance risk.

## Independent Track Tasks

### Task 1: Abu Dhabi
**Files:** Modify `js/tracks/abudhabi.js`
**Focus:** Yas Marina event infrastructure, hotel/marina depth, illuminated spectator zones, and restrained desert skyline.
**Verify:** `node tools/verify-track.cjs abudhabi`

### Task 2: Albert Park
**Files:** Modify `js/tracks/albert_park.js`
**Focus:** Lakeside park depth, Melbourne event infrastructure, tree-lined sectors, crowds, and skyline hints.
**Verify:** `node tools/verify-track.cjs albert_park`

### Task 3: Bahrain
**Files:** Modify `js/tracks/bahrain.js`
**Focus:** Sakhir pit complex, desert berms, floodlit grandstands, service compounds, and distant relief.
**Verify:** `node tools/verify-track.cjs bahrain`

### Task 4: Baku
**Files:** Modify `js/tracks/baku.js`
**Focus:** Old-city walls, Flame Towers skyline, dense boulevard façades, balconies, and event infrastructure.
**Verify:** `node tools/verify-track.cjs baku`

### Task 5: COTA
**Files:** Modify `js/tracks/cota.js`
**Focus:** Observation tower identity, amphitheatre terrain, hill crowds, paddock structures, and Texas event color.
**Verify:** `node tools/verify-track.cjs cota`

### Task 6: Hungaroring
**Files:** Modify `js/tracks/hungaroring.js`
**Focus:** Bowl-like spectator hills, wooded perimeter, paddock depth, marshal infrastructure, and Budapest-region relief.
**Verify:** `node tools/verify-track.cjs hungaroring`

### Task 7: Imola
**Files:** Modify `js/tracks/imola.js`
**Focus:** Santerno park woodland, historic circuit buildings, hillside homes, memorial/event details, and layered fencing.
**Verify:** `node tools/verify-track.cjs imola`

### Task 8: Interlagos
**Files:** Modify `js/tracks/interlagos.js`
**Focus:** São Paulo skyline depth, packed grandstands, hillside neighborhoods, paddock structures, and dense event color.
**Verify:** `node tools/verify-track.cjs interlagos`

### Task 9: Jeddah
**Files:** Modify `js/tracks/jeddah.js`
**Focus:** Corniche skyline, waterfront lighting, hospitality structures, palms, and high-density night-event spectators.
**Verify:** `node tools/verify-track.cjs jeddah`

### Task 10: Madrid
**Files:** Modify `js/tracks/madrid.js`
**Focus:** IFEMA-style exhibition buildings, urban avenues, La Monumental banking-sector spectacle, bridges, and skyline depth.
**Verify:** `node tools/verify-track.cjs madrid`

### Task 11: Mexico
**Files:** Modify `js/tracks/mexico.js`
**Focus:** Foro Sol stadium density, Mexico City skyline, paddock buildings, colorful crowds, and volcanic relief.
**Verify:** `node tools/verify-track.cjs mexico`

### Task 12: Miami
**Files:** Modify `js/tracks/miami.js`
**Focus:** Stadium campus, marina illusion, hospitality decks, palms, colorful bridges, and dense event compounds.
**Verify:** `node tools/verify-track.cjs miami`

### Task 13: Monaco
**Files:** Modify `js/tracks/monaco.js`
**Focus:** Harbor/yacht depth, casino and hotel massing, hillside apartments, tunnel context, and packed balconies.
**Verify:** `node tools/verify-track.cjs monaco`

### Task 14: Montreal
**Files:** Modify `js/tracks/montreal.js`
**Focus:** Île Notre-Dame woodland, Olympic basin water context, rowing tower silhouettes, grandstands, and city hints.
**Verify:** `node tools/verify-track.cjs montreal`

### Task 15: Monza
**Files:** Modify `js/tracks/monza.js`
**Focus:** Royal Park forest depth, old banking remnants, tifosi camps, historic structures, and braking-zone crowds.
**Verify:** `node tools/verify-track.cjs monza`

### Task 16: Qatar
**Files:** Modify `js/tracks/qatar.js`
**Focus:** Lusail floodlit architecture, desert horizon, modern paddock structures, grandstands, and night-event lighting cues.
**Verify:** `node tools/verify-track.cjs qatar`

### Task 17: Red Bull Ring
**Files:** Modify `js/tracks/redbull.js`
**Focus:** Styrian mountains, hillside crowds, bull/event identity, farm structures, woodland, and paddock depth.
**Verify:** `node tools/verify-track.cjs redbull`

### Task 18: Shanghai
**Files:** Modify `js/tracks/shanghai.js`
**Focus:** Lotus-inspired grandstands, lake/water context, modern Shanghai skyline, bridges, and spectator clusters.
**Verify:** `node tools/verify-track.cjs shanghai`

### Task 19: Silverstone
**Files:** Modify `js/tracks/silverstone.js`
**Focus:** Wing/paddock identity, airfield heritage, large grandstand fields, camping, service roads, and open rural horizon.
**Verify:** `node tools/verify-track.cjs silverstone`

### Task 20: Singapore
**Files:** Modify `js/tracks/singapore.js`
**Focus:** Marina Bay skyline, illuminated hotels, waterfront depth, dense grandstands, bridges, and tropical streetscape.
**Verify:** `node tools/verify-track.cjs singapore`

### Task 21: Spa
**Files:** Modify `js/tracks/spa.js`
**Focus:** Ardennes forest layering, elevation spectacle, hillside crowds, cabins, marshal infrastructure, and distant ridges.
**Verify:** `node tools/verify-track.cjs spa`

### Task 22: Suzuka
**Files:** Modify `js/tracks/suzuka.js`
**Focus:** Ferris wheel/amusement identity, figure-eight bridge context, wooded sectors, Japanese event structures, and crowds.
**Verify:** `node tools/verify-track.cjs suzuka`

### Task 23: Las Vegas
**Files:** Modify `js/tracks/vegas.js`
**Focus:** Strip resort massing, neon skyline, Sphere-like landmark context, bridges, packed hospitality, and night crowds.
**Verify:** `node tools/verify-track.cjs vegas`

### Task 24: Zandvoort
**Files:** Modify `js/tracks/zandvoort.js`
**Focus:** Coastal dunes, beach-club hints, orange crowds, dune vegetation, grandstands, and North Sea atmosphere.
**Verify:** `node tools/verify-track.cjs zandvoort`

## Parent Integration Task

- [ ] Review every track diff for file isolation, circuit specificity, bounded loops, and safe helper usage.
- [ ] Run all 24 track build checks:

```bash
for id in abudhabi albert_park bahrain baku cota hungaroring imola interlagos jeddah madrid mexico miami monaco montreal monza qatar redbull shanghai silverstone singapore spa suzuka vegas zandvoort; do
  node tools/verify-track.cjs "$id" || exit 1
done
```

- [ ] Run scenery geometry regressions:

```bash
npm test -- tests/props-over-road.spec.js tests/terrain-over-road.spec.js tests/f1-track-accuracy.spec.js
```

- [ ] Use the cache-bump skill once to update every `?v=` reference and `version.json` to one shared build number.
- [ ] Capture representative lap-tour screenshots for every circuit, emphasizing each agent's reported hero fractions.
- [ ] Review screenshots for road intrusion, floating/sunken props, repetitive placement, blocked sightlines, incoherent scale, and weak track identity.
- [ ] Correct only confirmed issues, rerun the affected track check, and repeat the relevant visual capture.
