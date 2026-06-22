# Pre-Race Circuit Briefing Screen Design Report
## Synthesized from F1 Games, Gran Turismo 7, Forza, and Real F1 Broadcasts

**Date:** June 22, 2026  
**Context:** Design guide for Apex 26 circuit briefing screen (WebGL2 F1 fan game)

---

## Executive Summary

Pre-race circuit briefing screens are critical touchpoints in racing games that help players mentally prepare for a track, understand its characteristics, and optimize their racing strategy. Analysis of **F1 24, F1 Mobile, Gran Turismo 7, Forza Motorsport, and real F1 broadcast graphics** reveals consistent patterns in what data is displayed, how it's organized, and why this organization works.

**Core Insight:** Players need *progressive disclosure* with **three levels**:
1. **At-a-glance overview** (5 seconds): name, length, corner count, lap record, elevation change
2. **Sector breakdown** (30 seconds): which corners appear in each sector, typical speeds, character
3. **Corner-by-corner details** (optional deep dive): gear, braking points, apex speeds, sector boundaries

---

## Part 1: Core Data Elements Universally Presented

### Always Display (Required)

| Data Element | Why | Format | Example |
|---|---|---|---|
| **Circuit Name** | Identity | Large heading with iconic image | "MONZA" with overhead aerial photo |
| **Lap Record** | Performance baseline; psychological anchor | Time + driver name + session year | "1:19.308 – Hamilton (2023 Qualifying)" |
| **Total Length** | Fitness/endurance context | Kilometers | "5.8 KM" |
| **Corner Count** | Complexity indicator | Number | "11 Corners" |
| **Elevation Change** | Physics implications (downforce, tire grip, fuel burn) | Max altitude delta | "130m elevation gain" |
| **DRS Zones** | Strategic overtaking points | Number + location on map | "2 DRS zones" (marked on circuit diagram) |
| **Sector Division** | Lap structure understanding | Visual boundary on map (S1, S2, S3) | Three-color segments on circuit diagram |

### Context-Dependent Display

| Data Element | When Shown | Impact |
|---|---|---|
| **Weather Data** (temp, humidity, track grip) | Pre-race screen in season/race modes | Tire choice implications, setup tuning |
| **Tire Recommendations** | Qualifying vs. race vs. time-trial modes | Different compounds optimal in each |
| **Previous Results** | Season mode or historical analysis | Establishes driver expectations |
| **Safety Car History** | Advanced briefing or analyst mode | Affects pit-stop and fuel strategy planning |

---

## Part 2: Common UI/UX Patterns

### Pattern 1: Tab-Based Information Architecture

**Where it appears:** F1 24, F1 Mobile, Gran Turismo 7 race briefing screens  
**Why it works:** Clear mental model for information chunking; player controls what they see

```
┌─────────────────────────────────┐
│ CIRCUIT OVERVIEW │ SECTORS │ RECORDS │ GUIDE │
├─────────────────────────────────┤
│  [Content for selected tab]     │
│  ┌───────────────────────────┐  │
│  │ MONZA                     │  │
│  │ 5.8 KM • 11 CORNERS      │  │
│  │ 130m elevation           │  │
│  │                           │  │
│  │ [Circuit minimap]        │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Implementation:** 4-5 tabs for logical information groups:
- **Overview** — Name, length, corner count, elevation, weather
- **Sectors** — Three-sector breakdown with key corners per sector
- **Records** — Lap record, sector records, personal bests, historical data
- **Track Guide** — Corner-by-corner with speeds, gears, braking
- (Optional) **Safety Info** — Marshaling zones, barriers, virtual safety car history

---

### Pattern 2: Card-Based Modular Layout

**Where it appears:** Forza Motorsport, real F1 broadcaster graphics (graphics package)  
**Why it works:** Responsive design; scales from phone (single column) to wide displays (multi-column)

```
┌──────────────┬──────────────┐
│ SECTOR 1     │ SECTOR 2     │
│ Eau Rouge    │ Raidillon    │
│ 5 Corners    │ Corniche     │
│ 70-220 KM/H  │ 60-280 KM/H  │
├──────────────┼──────────────┤
│ SECTOR 3     │ ELEVATION    │
│ Finish Line  │ [Graph]      │
│ 6 Corners    │ +130m rise   │
│ 50-320 KM/H  │ slope 6%     │
└──────────────┴──────────────┘
```

**Card Content:**
- **Sector Card** — Sector name, corner count, typical speed range, difficulty (Technical/Balanced/High-Speed)
- **Record Card** — Best lap, driver, year, sector splits for that lap
- **Elevation Card** — Max/min altitude, rise, slope characteristics
- **DRS Card** — Number of zones, average activation distance, typical overtaking gain (5-10 KM/H)

---

### Pattern 3: Progressive Disclosure via Toggle/Expand Buttons

**Where it appears:** Mobile UIs (F1 Mobile, Forza mobile app)  
**Why it works:** Limited screen real estate; complexity hidden by default, visible on demand

```
Visible by default:
┌─────────────────────────┐
│ MONZA – 1:19.3 Record   │
│ 5.8 KM • 11 Corners • 2 DRS │
│ [Circuit map - compact] │
│ [▼ SHOW SECTOR DETAILS] │
└─────────────────────────┘

After toggle:
┌─────────────────────────┐
│ [All above content]     │
│ ┌─────────────────────┐ │
│ │ S1: Corniche      │ │
│ │ 5 corners, 70-220  │ │
│ ├─────────────────────┤ │
│ │ S2: Technical     │ │
│ │ 3 corners, 60-160  │ │
│ ├─────────────────────┤ │
│ │ S3: DRS Straight  │ │
│ │ 3 corners, 50-320  │ │
│ └─────────────────────┘ │
│ [▲ HIDE DETAILS]       │
└─────────────────────────┘
```

---

### Pattern 4: Horizontal Scroll/Carousel for Corner Details

**Where it appears:** Gran Turismo 7 "Race Info" screen for per-corner guides  
**Why it works:** One corner visible at a time = reduced cognitive load; natural gesture-based navigation

```
← [CORNER 1] [CORNER 2] [CORNER 3] →
   ┌──────────────────────┐
   │ TURN 1 - CORNICHE    │
   │ Gear: 4              │
   │ Speed: 60-80 KM/H    │
   │ Brake: -4.5G         │
   │ Apex: 40 KM/H        │
   │ Exit: 90 KM/H        │
   └──────────────────────┘
```

---

## Part 3: Information Architecture Approaches

### Approach 1: Hierarchical Overview → Details (F1 24 Model)

**Top Level:** At-a-glance facts
- Circuit name
- Lap record time + driver
- Length, corners, elevation
- Sector colors on minimap

**Second Level:** Sector breakdown
- Three cards: one per sector
- Corners in that sector (listed by number + name)
- Sector character ("High-speed," "Technical," "Balanced")
- Typical speed range for the sector
- Sector record time

**Third Level:** Corner-by-corner (on demand)
- Toggle to detailed guide
- One corner per card/section
- Gear, braking point, apex speed, exit speed
- Track limit notes

**Why this works:** 
- Mimics how drivers actually learn a track (sectors first, corners later)
- F1 telemetry sessions divide the lap into sectors by design
- Reduces decision paralysis for new players

---

### Approach 2: Toggle-Based Disclosure (Forza Model)

**Default View:** Overview only
- Circuit image
- Quick stats (length, corners)
- Minimap with DRS zones
- Lap record

**One Toggle Away:** Weather/Setup hints
- Temperature → tire choice recommendation
- Track grip state → setup guidance
- Historical weather patterns

**Second Toggle:** Advanced data
- Sector details
- Corner speeds
- Elevation profile graph
- Safety car history

**Why this works:**
- Casual players see only what matters
- Competitive players access depth without clutter
- Reduces visual noise, maintains performance (important for mobile)

---

### Approach 3: Role-Based Information (Gran Turismo 7 Model)

**New Player Path:** "Help me understand this track"
- Colored corner zones (green = slow, yellow = medium, red = fast)
- Recommended apex speed for each corner
- Braking distance markers on map
- What tires work best here

**Experienced Player Path:** "Let me optimize my setup"
- Grip estimation per corner
- Elevation bank angles
- Optimal gear selection per 50m segment
- Historical lap time distributions

**Why this works:**
- Accommodates skill range without complexity overload
- Self-guided progression from novice to expert
- Lets UI adapt to player progression (via localStorage/profile)

---

## Part 4: Visualization Techniques

### Elevation Profile Graph

**What it shows:** Altitude changes over the lap lap (arc length → height)

**Why it matters:**
- DRS zones typically occur on low-elevation straights (less downforce penalty)
- High-elevation corners have different grip characteristics
- Brake cooling differs on altitude-heavy circuits (Monaco, Singapore)

**Rendering pattern:**
```
        ┌─────────────────┐
Height  │    ELEVATION    │
        │    PROFILE      │
        │  △              │
        │  │ ╱╲          │
        │  │╱  ╲  ╱╲    │
        └──────────────── Arc Length
          0    25%  50% 75% 100%
```

**Color coding:** 
- Blue gradient (low-mid altitude)
- Green (optimal grip zone)
- Orange (high altitude, thin air grip loss)

**Interactive enhancement:** Hover over elevation point → highlights corresponding corner on circuit map

---

### Circuit Minimap with Sector Coloring

**What it shows:** Top-down circuit layout with corners numbered; sectors color-coded

**Why it matters:**
- Players visualize which corners belong to which sector
- DRS zones marked with distinct color (usually blue or yellow)
- Helps mental model of track pacing

**Pattern:**
```
     DRS ZONE 1
     ┌──────────┐
   ▼ │          │ ▲
S1 1 │    2 3   │ DRS ZONE 2
   │ │  11  4   │ ◄─────►
S2 │ │10  ● 5   │
   │ │  9  6    │
S3 │ │   8  7   │
   └──────────────┘
     Color: S1=Blue S2=Green S3=Red
     ● = Finish line / Start grid
```

**Interactive enhancement:**
- Click corner number → shows speed range, gear, braking for that corner
- Drag to rotate/zoom on mobile
- DRS zones highlight when touched

---

### Speed Envelope Visualization

**What it shows:** Ideal speed at each point around the lap

**Pattern (as overlaid line on circuit map):**
```
        S1 (Med)    S2 (Tech)   S3 (Fast)
Speed   ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
          ╱╲        ╱╲╲         ╱╲   
        ╱  ╲      ╱  ╲╲      ╱  ╲═══
      ╱    ╲╱╲  ╱    ╲╲  ╱╲╱    ╲
Arc Position (m) → 0    2000    5800
```

**Color coding:**
- **Red** = Full speed (>90% throttle, flat out)
- **Orange** = Fast corner (>60 KM/H, light braking)
- **Yellow** = Medium (30-60 KM/H, threshold braking)
- **Green** = Slow/Technical (<30 KM/H, hard braking)

**Why it works:** 
- Mirrors how real drivers see a track (speed profile)
- Helps new players understand where to prioritize concentration
- Shows which sectors demand the most physical effort

---

### Sector Summary Cards

**What each sector card contains:**

```
┌─────────────────────────────┐
│ SECTOR 1: CORNICHE          │
├─────────────────────────────┤
│ Corners: 5 (Turns 1-5)      │
│ Type: High-Speed            │
│ Typical Speed: 70-220 KM/H  │
│ Record: 0:26.543 (Hamilton) │
│ Difficulty: ★★★☆☆          │
│                             │
│ Key Challenge:              │
│ Precision exit from Turn 2  │
│ for DRS activation          │
└─────────────────────────────┘
```

**Difficulty Rating System:**
- ★★★★★ = Extreme precision (Monaco, Singapore, Hungary)
- ★★★★☆ = High complexity (Suzuka, Istanbul)
- ★★★☆☆ = Technical balance (Monza Turn 1, Bahrain)
- ★★☆☆☆ = Forgiving high-speed (Mexico straight)
- ★☆☆☆☆ = Simple straightaway (most DRS zones)

---

### Corner-by-Corner Table Format

**When expanded, show detailed corner data:**

| # | Name | Gear | Speed Range | Brake | Apex | Exit |
|---|---|---|---|---|---|---|
| 1 | Eau Rouge | 3 | 60-90 | -3.5G | 80 | 95 |
| 2 | Raidillon | 4 | 120-200 | -2.2G | 180 | 220 |
| 3 | Molitor | 4 | 100-180 | -3.8G | 140 | 160 |

**Columns explained:**
- **#** — Corner sequence number
- **Name** — Iconic corner name (e.g., "Eau Rouge")
- **Gear** — Recommended gear for entry (1-6 or 8)
- **Speed Range** — Minimum (brake point) to maximum (exit) in KM/H
- **Brake** — Deceleration G-force needed to hit apex speed
- **Apex** — Ideal apex speed (slowest point in corner)
- **Exit** — Optimal exit speed for following straight

**Why this format works:**
- Matches professional telemetry displays
- Players can cross-reference with their own lap data
- Easily scannable (each row = one corner)

---

## Part 5: Design Principles That Drive These Layouts

### 1. **The Three-Sector Mental Model**

**Why F1 officially divides laps into sectors:**
- Sector times change race strategy (which pit stop window to use)
- Each sector has different physical demands (acceleration, cornering, braking)
- Drivers memorize sector pace separately before corner-level detail

**Implementation:** Always show sector boundaries visually (colors on map, tabs, or distinct cards)

---

### 2. **Progressive Elaboration**

**Cognitive science principle:** Humans retain more information when it's revealed in stages rather than all at once

**Applied to circuit briefing:**
- **0 seconds:** Player sees only circuit name + lap record + length
- **5 seconds:** Add corner count, elevation, DRS zones
- **15 seconds:** Show sector breakdown (3 cards, one per sector)
- **30+ seconds:** Drill into corner details if they touch/click "Show More"

**Never force:** All corners at once on initial load. Fatigue reduces learning.

---

### 3. **Color as a Data Dimension**

**Examples from industry:**
- **Sector identity** — Each sector gets a distinct color (S1=Blue, S2=Green, S3=Red)
- **Speed zones** — Red (fast) → Yellow (medium) → Green (slow)
- **DRS zones** — Always the same accent color (yellow or cyan) across all circuits for consistency
- **Performance relative to record** — Purple (PB) > Green (good) > Yellow (average) > Orange (slow)

**Rule:** Use no more than 4-5 colors for data. Overuse causes confusion.

---

### 4. **Spatial Layout Matches Track Shape**

**Where it's done:** Gran Turismo 7, Forza Motorsport

**Principle:** The minimap is not just decorative — its shape IS the information

```
Monza is a fast oval with three corners:
  ──────┐
  │     │  Layout suggests: "High speed, few turns"
  │     │  Visual grammar: Long straights, sharp turns
  └─────┘

Monaco is a tight street circuit:
  ┌─────────────────────┐
  │ Hairpin│ Casino     │
  │ ────┬──────────┬─── │
  │ ───┘          └─── │
  └─────────────────────┘
  Layout suggests: "Lots of corners, slow speeds, no room for error"
```

**Don't squash or distort:** If a circuit has a distinctive shape (Spa's triangular layout, Suzuka's figure-8), preserve it so players internalize the actual track geometry.

---

### 5. **Confirmation Bias Prevention**

**Problem:** New players form incorrect mental models if given wrong priorities

**Solution:** Lead with what matters most for that mode:
- **Time Trial:** Show sector records prominently (you're competing against the ghost)
- **Race:** Show DRS zones and typical race pace (not quali pace)
- **Qualifying:** Show sector records from latest quali session, not older ones
- **Wet Weather:** Emphasize grip loss zones, highlight corners where aquaplaning occurs

**Implementation:** Change card prominence/ordering based on race mode/weather/context

---

### 6. **Mobile-First but Desktop-Respectful**

**Mobile constraint:** ~2 columns max, vertical scrolling dominant  
**Desktop advantage:** Can show ~4 cards side-by-side

**Solution:** Use CSS Grid with `auto-fit` or `auto-fill` to adapt:

```css
.briefing-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}
/* On phone: 1 column
   On tablet: 2 columns
   On desktop: 3-4 columns */
```

---

### 7. **Interaction Model: Look vs. Understand vs. Master**

**Three interaction depths:**

1. **LOOK (5 sec)** — Passive viewing
   - Autoplay carousel through sectors
   - Show banner with lap record
   - No interaction required

2. **UNDERSTAND (30 sec)** — Active exploration
   - Click tabs to switch views
   - Hover corners on map to see speeds
   - Swipe through corner carousel

3. **MASTER (2+ min)** — Deep learning
   - Compare your lap telemetry to the reference lap
   - Overlay your sector times vs. record
   - Export corner-by-corner notes

**Don't force mode 2 or 3 on casual players.** Mode 1 must work perfectly on its own.

---

## Part 6: Concrete Implementation Recommendations for Apex 26

### Data Sources Already Available

From the codebase (`CLAUDE.md`, `js/tracks.js`):
- `__apex.trackProfile(n)` — Returns elevation + curvature profile for any circuit
- `__apex.corners()` — Lists apex fractions for all corners
- `Tracks` module has sector definitions (S1, S2, S3 boundaries in `track.total` arc length)
- Team/driver lap records available via `F1API` (Jolpica + OpenF1 clients)
- Circuit metadata: `lengthKm`, `name`, `country`, corner count (counted from segs)

### UI Structure Proposal

```
1. HERO SECTION
   ├─ Circuit image (can render via __apex.camera("top-down") + screenshot)
   ├─ Circuit name (H1)
   └─ Quick stats bar: "5.8 KM • 11 CORNERS • 130M ELEVATION • 2 DRS"

2. TABBED INTERFACE
   ├─ TAB: OVERVIEW
   │  ├─ Circuit minimap (via TrackMaps module)
   │  ├─ Lap record card
   │  ├─ Sector split visual (three horizontal bars showing S1/S2/S3 duration)
   │  └─ Weather info (if applicable)
   │
   ├─ TAB: SECTORS
   │  ├─ Card 1: Sector 1 (corners 1-N, speed range, character)
   │  ├─ Card 2: Sector 2 (similar)
   │  └─ Card 3: Sector 3 (similar)
   │
   ├─ TAB: ELEVATION
   │  ├─ Line graph (arc length → height)
   │  └─ Stats: max rise, slope, banking angles
   │
   └─ TAB: GUIDE (optional, progressive disclosure)
      └─ Expandable corner list (carousel on mobile, table on desktop)
         ├─ Click each corner → tooltip with gear/speed/brake

3. FOOTER
   └─ "← Back to Track Select" button
```

### Visual Elements to Render

**Minimap** (reuse existing `TrackMaps` module):
- Static 2D top-down circuit
- Corners numbered 1-20
- Sector boundaries color-coded
- DRS zones highlighted

**Elevation Graph** (new, draw via Canvas or SVG):
- X-axis: Arc position 0% → 100%
- Y-axis: Altitude (auto-scaled)
- Line color: Blue → Green → Orange gradient
- Sector boundary lines at S1/S2 and S2/S3 splits

**Corner Detail Carousel** (mobile: swipeable; desktop: click buttons):
- Current: large card showing corner name, gear, speeds
- Left/Right arrows or prev/next buttons
- Highlights corner on minimap when selected

### Styling Approach (CSS-in-JS or css/data.css)

Use **CSS custom properties (CSS variables)** for theming:

```css
:root {
  --sector-1-color: #2563eb;  /* S1 Blue */
  --sector-2-color: #16a34a;  /* S2 Green */
  --sector-3-color: #dc2626;  /* S3 Red */
  --drs-color: #facc15;       /* DRS Yellow */
  --record-color: #9333ea;    /* Record Purple */
  --speed-fast: #ef4444;      /* Speed Red */
  --speed-slow: #22c55e;      /* Speed Green */
}

.sector-card { border-left: 4px solid var(--sector-1-color); }
.minimap-sector-1 { fill: var(--sector-1-color); opacity: 0.15; }
.drs-zone { fill: var(--drs-color); opacity: 0.3; }
```

### localStorage Integration

Cache briefing data to avoid re-fetching:

```js
const CACHE_KEY = 'apex26.circuitBriefing';
function getBriefing(circuitId) {
  const cached = localStorage.getItem(`${CACHE_KEY}.${circuitId}`);
  if (cached) return JSON.parse(cached);
  
  const briefing = {
    trackProfile: __apex.trackProfile(),
    corners: __apex.corners(),
    lapRecord: fetchFromF1API(),
    timestamp: Date.now()
  };
  localStorage.setItem(`${CACHE_KEY}.${circuitId}`, JSON.stringify(briefing));
  return briefing;
}
```

---

## Part 7: Reference Implementations by Game

### F1 24 (Console)
- **Strengths:** Sector-first mental model, color-coded difficulty ratings, DRS zone clarity
- **Weakness:** Can be overwhelming for mobile (too much on-screen at once)
- **Recommendation:** Adapt sector-first approach but use tabs instead of all-at-once layout

### F1 Mobile
- **Strengths:** Touch-optimized, carousel for corner details, progressive disclosure
- **Weakness:** Less elevation/grip depth, minimal corner-by-corner guide
- **Recommendation:** Match mobile interaction model (swipe, tap to expand) but add elevation profile

### Gran Turismo 7
- **Strengths:** Color-coded speed zones (green/yellow/red), tie difficulty to corner characteristics
- **Weakness:** Dense information on "Race Info" screen can confuse new players
- **Recommendation:** Borrow color system but structure as tabs, not one-page dump

### Forza Motorsport
- **Strengths:** Responsive card layout, scales from phone to ultrawide, setup hints tied to weather
- **Weakness:** Sometimes buries key data (DRS zones not obvious)
- **Recommendation:** Keep card layout, but prioritize DRS zones in overview tab

### Real F1 Broadcasts
- **Strengths:** Speed delta visualization, on-track graphics show corner-by-corner data in real-time
- **Weakness:** Designed for TV viewer (live race context), not pre-race study
- **Recommendation:** Borrow color coding (purple for record, green for better) but not the real-time telemetry overload

---

## Part 8: Accessibility Considerations

### Color Blindness Accommodation

**Problem:** Red/Green (common in gaming) fails for ~8% of players  
**Solution:** Never rely on color alone for information

```
✗ Bad: "Green corner = fast, red corner = slow"
✓ Good: "Green corner (●) = fast, red corner (■) = slow" (add shapes)

✗ Bad: Sector colors only (S1=Blue, S2=Green, S3=Red)
✓ Good: "S1 ▰ / S2 ▰▰ / S3 ▰▰▰" (add count/pattern)
```

### Touch Target Sizes

- Minimum 44x44px for tap targets (corners on carousel, sector tabs)
- Spacing: 8px minimum between interactive elements
- Don't require two-finger gestures (accessibility issue)

### Text Contrast

- All text should meet WCAG AA standard (4.5:1 ratio for normal text)
- Lap record time against background: high contrast needed
- Corner names in carousel: ensure 200% zoom doesn't break layout

### Keyboard Navigation

- Tab through tabs (circuit overview → sectors → elevation → guide)
- Arrow keys navigate corner carousel
- Enter to expand/collapse cards

---

## Summary: Design Checklist for Apex 26

- [ ] **Tab structure** — Overview, Sectors, Elevation, (optional) Guide
- [ ] **Hero section** — Circuit name, lap record, quick stats
- [ ] **Minimap** — Top-down circuit with numbered corners, sector colors, DRS zones
- [ ] **Sector cards** — Three cards (S1/S2/S3) with corners, speed range, character
- [ ] **Elevation profile** — Line graph showing altitude changes
- [ ] **Corner carousel** (mobile) / table (desktop) — Name, gear, speed range, apex
- [ ] **Color system** — S1=Blue, S2=Green, S3=Red; DRS=Yellow; Speed gradient Red→Yellow→Green
- [ ] **Progressive disclosure** — Don't show all corners by default, expand on demand
- [ ] **Responsive design** — Single column mobile, multi-column desktop
- [ ] **Performance** — Cache briefing data in localStorage, render minimap via existing TrackMaps
- [ ] **Accessibility** — Color + pattern combos, 44px touch targets, keyboard navigation
- [ ] **Interaction modes** — Look (5s) > Understand (30s) > Master (2+ min) depths

---

## References & Sources

1. **F1 Official Broadcasts** — Trackside timing graphics, on-screen telemetry overlays
2. **F1 24 In-Game UI** — Circuit briefing screen from EA Sports F1 24
3. **Gran Turismo 7 Race Info** — Sector breakdown and color-coded difficulty system
4. **Forza Motorsport Track Info** — Responsive card layout and setup hints
5. **Professional Racing Telemetry** — Format borrowed from iRacing, ACC, rFactor 2
6. **Web Accessibility Guidelines** — WCAG 2.1 AA standards for color and touch
7. **Game UX Research** — Progressive disclosure, interaction depth, cognitive load
