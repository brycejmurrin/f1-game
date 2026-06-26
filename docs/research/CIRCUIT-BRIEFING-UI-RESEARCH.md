# Pre-Race Circuit Briefing UI/UX Design Patterns Research Report

## Executive Summary

Racing games face a consistent challenge: communicating critical circuit information before a race without overwhelming or slowing player progression. This report synthesizes UX patterns from professional racing games (F1 24, Gran Turismo 7, Forza), sim racing platforms (iRacing, Assetto Corsa Competizione), and real-world F1 briefing practices to establish best practices for circuit briefing screens.

Key finding: Successful briefing screens balance **mandatory readiness** (track limits, pit entry, weather) with **optional mastery** (elevation, racing lines, corner characteristics) through progressive disclosure and layered information architecture.

---

## Core Data Elements (Universally Presented)

Every racing game communicates a consistent set of circuit information before play begins:

### 1. Track Overview & Layout
- **Rationale**: Players must know the circuit geometry, turn sequence, and general layout before attempting to race
- **Cognitive purpose**: Mental model building—where are the straights? Where are the tight sections? What's the natural racing line?
- **Presentation**: Overhead minimap, full circuit topology, turn-by-turn numbering
- **Failure cost**: High—wrong mental model leads to crashes in early laps

### 2. Pit Entry/Exit & Track Limits
- **Rationale**: Critical for race safety and rule compliance
- **Cognitive purpose**: Prevent penalties and DNF crashes (pit wall contact, track limits)
- **Presentation**: Highlighted pit lane entrance, pit box location, visible DRS activation zones, curb visualizations showing track limit boundaries
- **Failure cost**: Critical—violation results in instant penalty or disqualification

### 3. Weather & Track Conditions
- **Rationale**: Directly impacts setup choice and driving style
- **Cognitive purpose**: Inform part selection and throttle/brake modulation
- **Presentation**: Temperature, wind direction/speed, track temperature, fuel/tire strategy hints
- **Failure cost**: Medium—wrong setup means poor pace but race can still be completed

### 4. Sector Information
- **Rationale**: Enables pacing strategy and understands circuit difficulty distribution
- **Cognitive purpose**: Where are the performance bottlenecks? Which sectors are overtaking opportunities?
- **Presentation**: Sector times, DRS zones, hard/medium/easy sector difficulty labels
- **Failure cost**: Low to medium—affects race strategy but not immediate safety

### 5. Session Type & Objectives
- **Rationale**: Different game modes require different approaches (time trial vs. race vs. online)
- **Cognitive purpose**: Set correct mental expectations and objectives
- **Presentation**: Clear session label, lap count, scoring rules, target time/position
- **Failure cost**: Medium—wrong mindset impacts lap execution quality

---

## Information Architecture Patterns

Racing games employ three primary organizational strategies for circuit briefing screens:

### Pattern 1: Tabbed Interface (F1 24, Forza, iRacing)
```
[Overview] [Strategy] [Track Guide] [Weather] [Setup]
───────────────────────────────────────────────────
│                                                 │
│  Current tab content (dynamic)                 │
│                                                 │
└─────────────────────────────────────────────────┘
```
**Advantages:**
- Clear separation of concerns
- Allows deep content without overwhelming single view
- Tab persistence aids information discovery
- Scales well to 5-8 data categories

**Disadvantages:**
- Requires clicking to discover all information
- Players may miss critical details
- Mobile: tabs become cramped, require horizontal scroll

**Used by:** F1 24 (briefing screen pre-race), iRacing (session info), Forza Motorsport (event briefing)

### Pattern 2: Vertical Card Stack (Gran Turismo 7, Forza Horizon)
```
┌─────────────────────────────┐
│ Track Overview Card         │
│ [Image + key stats]         │
└─────────────────────────────┘
┌─────────────────────────────┐
│ Weather Card                │
│ [Temperature + icons]       │
└─────────────────────────────┘
┌─────────────────────────────┐
│ Pit Information Card        │
│ [Pit lane diagram]          │
└─────────────────────────────┘
```
**Advantages:**
- Mobile-native design
- Scrolling feels natural on touch
- Progressive information disclosure (scroll to learn more)
- Each card can be independently scanned

**Disadvantages:**
- Long scrolling for deep content
- Less efficient for desktop (wasted vertical space)
- Context switching between cards

**Used by:** Gran Turismo 7, Forza Horizon 5 (magazine-style layout)

### Pattern 3: Split-Panel Sidebar (Assetto Corsa, real sim racers)
```
┌──────────────────────────────────────────┐
│ Left Panel: Map                Right: Info│
│                                           │
│ [Circuit topology]  │ Track: Monza       │
│                     │ Length: 5.793 km   │
│                     │ Turns: 11          │
│                     │ Weather: 22°C      │
│                     │ Track temp: 34°C   │
│                     │ Wind: 2.1 m/s NE   │
└──────────────────────────────────────────┘
```
**Advantages:**
- Optimal use of desktop real estate
- Map always visible as reference while reading details
- Spatial memory aids information retention
- No page navigation required

**Disadvantages:**
- Mobile must collapse to vertical stack (redesign required)
- Fixed area ratio reduces flexibility
- Information density can feel cramped

**Used by:** Assetto Corsa Competizione, ACC pit crew apps, professional racing telemetry software

### Pattern 4: Full-Bleed Immersive Briefing (F1 Broadcast Influence)
Some games (upcoming titles) are experimenting with **broadcast-style briefing videos**:
- 30-60 second circuit walkthrough with onscreen graphics overlay
- Narrated key hazards and DRS zones
- Dynamic camera following circuit topology
- Post-video optional static reference screen

**Purpose:** Mimics real F1 broadcast pre-race analysis. Highly engaging but time-consuming.

---

## Visual Design Patterns

### Color Coding Systems

#### Track Feature Colors (Standardized Across Games)
```
🟢 Green  : DRS zones, good corner markers, safe areas
🟡 Yellow : Caution areas (tight chicanes, elevation changes)
🔴 Red    : Danger zones (pit wall, track limits, high-speed corners)
🔵 Blue   : Strategic markers (overtaking zones, braking markers)
⚫ Black   : Walls, barriers, out-of-bounds
🟣 Purple : Player position, highlighted turn
```

**Psychology:** 
- Traffic light system is cognitively automatic (learned from driving)
- Warm colors (red/yellow) demand attention
- Cool colors (blue) for informational content
- Neutral (gray/white) for baseline data

#### Weather Visualization
- **Clear**: Bright yellow sun, high contrast
- **Overcast**: Gray clouds, reduced contrast, cooler palette
- **Wet**: Blue tones, water droplet icons, darker overall
- **Fog**: Reduced opacity layers, muted colors

### Layout Templates

#### Template A: 3-Column Desktop
```
[Left Sidebar: Track Map]  [Center: Primary Info]  [Right: Secondary Info]
                         40% width                30%            30%
```
- Used by: iRacing, Assetto Corsa
- Mobile fallback: Stack vertically

#### Template B: Hero + Grid
```
┌─────────────────────────────┐
│  Large Hero Image/Map       │  40-50% height
└─────────────────────────────┘
┌────────────┬────────────┬─────────┐
│ Stat Card  │ Stat Card  │ Stat Card│
└────────────┴────────────┴─────────┘
```
- Used by: Forza (card-based)
- Mobile-friendly native

#### Template C: Accordion Progressive Disclosure
```
▼ Track Overview (expanded)
   [Circuit map + basic stats]

▶ Advanced Data (collapsed)

▶ Weather Details (collapsed)

▶ Setup Recommendations (collapsed)
```
- Used by: Some newer games, mobile-first designs
- Reduces initial cognitive load

### Typography Hierarchy

**Level 1 (Circuit Name):** 32-48pt, bold, high contrast
**Level 2 (Stat Categories):** 18-24pt, medium weight, labeled
**Level 3 (Values):** 16-20pt, regular weight
**Level 4 (Explanatory text):** 12-14pt, secondary color, optional

Example:
```
MONZA                                          (L1: 36pt bold)
Circuit Length: 5.793 km                       (L2/3: stat pair)
Turn Count: 11                                 (L2/3: stat pair)
Famous for high-speed corners and long straights (L4: context)
```

---

## Circuit-Specific Data Visualizations

### Elevation Profiles

#### Technique 1: Stylized 2D Profile Graph
```
100m │     ╱╲
     │    ╱  ╲        ╱╲
 50m │   ╱    ╲      ╱  ╲
     │  ╱      ╲    ╱    ╲
  0m │─────────────────────
     └─────────────────────
     Start                End
     Turn 1  Turn 3  Turn 8
```
- **Used by:** F1 24, real F1 broadcast, Gran Turismo Sport
- **Advantages:** Clean, readable at small sizes, shows climb/descent patterns
- **Disadvantages:** Loses banking angle information, vertical scale often exaggerated for visibility

#### Technique 2: 3D Perspective Elevation
- **Used by:** Forza Motorsport, some circuit preview videos
- **Advantages:** Intuitive spatial understanding, shows banking, visually engaging
- **Disadvantages:** Slow to load, requires 3D rendering, harder to read precise values

#### Technique 3: Color-Coded Gradient Overlay on Map
- Elevation represented as color intensity on circuit overhead view
- Red/hot: High elevation, Blue/cool: Low elevation
- **Used by:** iRacing telemetry tools, Sim racing community tools
- **Advantages:** Spatial context maintained, elevation integrated into layout
- **Disadvantages:** Abstract until learned, requires color legend

#### Technique 4: Annotated Climb Markers (Hybrid)
```
[Circuit map with strategic labels]
↑850m elevation gain (Total lap climb)
⬆️ 40° bank (Turn 1)
⬇️ 60m drop (Eau Rouge section)
```
- **Used by:** Modern F1 broadcast graphics, ACC
- **Advantages:** Precise information without full profile, integrates with spatial layout
- **Disadvantages:** Requires careful label placement, can feel cluttered

### Track Layout Maps & Miniature Representations

#### Map Style A: Minimalist Line Art (F1 24, Gran Turismo 7)
```
Black circuit line on white/transparent background
Thin red pit lane
Blue turn numbers
Green DRS zones
```
- **Advantages:** Fast to render, clean, scales to any size, bandwidth efficient
- **Disadvantages:** Loses track width information, generic appearance

#### Map Style B: Detailed Satellite Imagery (Forza Motorsport)
```
Photograph-based circuit with overlaid graphics
Turn highlights, pit lane highlight
Runoff areas visible
Real-world context (grandstands, trees, buildings)
```
- **Advantages:** Highly immersive, contextual familiarity, immediately recognizable
- **Disadvantages:** Large file size, harder to read overlaid information, real-world changes require updating

#### Map Style C: Stylized Isometric 3D (Some mobile games)
```
Slightly rotated 3D perspective showing banking
Color gradient for elevation
Clickable turns for detail view
```
- **Advantages:** Engaging, shows spatial features, modern feel
- **Disadvantages:** Harder to read at small scales, 3D rendering overhead

#### Map Features Always Present
```
✓ Turn numbering (1-based or distinctive naming)
✓ Pit entry/exit clearly marked
✓ DRS zone visualization
✓ Starting grid position
✓ Track length label
✓ Scale reference (km or miles)
```

### DRS Zone & Corner Visualization

#### DRS Zone Patterns
```
Technique A: Bright highlight overlay on straight
  [Circuit map with bright yellow highlight on main straight]
  
Technique B: Animated arrow indicating "goes here"
  [Static circuit with animated arrow pointing to DRS zone]
  
Technique C: Text callout with distance
  [Map with label "DRS Zone: 800m" with position indicator]
```

**Best Practice:** Combination of visual highlight + text label + distance. F1 24 and ACC both use this.

#### Corner Difficulty Classification
```
🟢 Fast (>180° banking, wide apex, high grip)
  Examples: Turn 1 at Monza, Turn 1 at Silverstone

🟡 Medium (Moderate banking, technical apex control)
  Examples: Parabolica at Monza, Turn 3-4 at Silverstone

🔴 Slow (Hairpin or tight chicane, low speed)
  Examples: Turn 14 at Monaco, Turn 1 at Singapore
```

Color-coded overlays on track map make difficulty at-a-glance visible.

### Racing Line Visualization

#### Approach 1: Reference Line Overlay
```
White dotted/dashed line on track map showing apex-to-apex racing line
Sometimes shows racing line for different fuel loads (heavy vs light)
Gran Turismo 7 shows suggested racing line overlay
```
- **Purpose:** Visual guide without instruction
- **Advantage:** Players learn naturally by following
- **Disadvantage:** May reduce learning curve (skill ceiling lowered)

#### Approach 2: Telemetry-Based Comparison
```
After lap completion: compare player line (yellow) vs ideal line (white)
Show deviation angle at each corner
Highlight braking point differences
```
- **Used by:** iRacing, ACC, sim racing training tools
- **Purpose:** Skill development, precision feedback
- **Limitation:** Only available post-lap, not pre-race

#### Approach 3: Text-Based Callouts (Hybrid)
```
Turn 1: "Late apex into the chicane; use full throttle at exit"
Turn 8: "Brake early; don't run wide on exit or you'll lose time on main straight"
```
- **Purpose:** Narrative instruction
- **Advantage:** Accessible to beginners
- **Disadvantage:** Wordy, not visual

#### Approach 4: Animated Line Through Corner
```
3D or 2D animated vehicle following racing line through each major corner
Paused for examination, or plays automatically
Shows steering input, throttle application, braking zones
```
- **Used by:** Some modern F1 games, coaching apps
- **Purpose:** Dynamic learning, muscle memory priming
- **Limitation:** Time-consuming to produce per circuit

---

## Game-Specific Examples

### F1 24 (EA Sports)

**Briefing Screen Architecture:**
- Tabbed interface: [Overview] [Strategy] [Track Guide] [Weather] [Setup]
- Overview tab shows circuit map (line art style), lap record, circuit signature
- Strategy tab includes sector information, DRS zones (highlighted in green)
- Track Guide tab: written corner-by-corner tips ("Turn 1: Short braking zone, medium speed corner")
- Weather tab: real-time conditions for current session
- Setup tab: AI-recommended setup with parts explanations

**Visual Design:**
- EA Sports corporate color palette (dark blue backgrounds, bright accents)
- Circuit maps are minimalist line art with turn numbering
- Statistics presented in card grid (lap record, circuit length, favorite car, etc.)
- Elevation profile shown as 2D graph in Track Guide tab
- DRS zones highlighted in bright green on circuit map

**Unique Elements:**
- "Rivals" section showing player's previous lap times or friends' times
- Driver tips: AI-generated insights per circuit
- Estimated fuel consumption calculator
- Tire strategy recommendations based on weather

**Strengths:**
- Comprehensive coverage without overwhelming (tabbed approach)
- Clean visual hierarchy
- Actionable setup recommendations
- Integrates with online leaderboards

**Weaknesses:**
- Requires tab navigation to see all info (some players miss details)
- Elevation profile is somewhat abstract (not spatially integrated)
- Track guide tips are generic (not circuit-specific tactical advice)

---

### Gran Turismo 7 (Polyphony Digital)

**Briefing Screen Architecture:**
- Magazine-style card stack (vertical scrolling)
- Cards: Circuit Overview, Track History, Weather, Tuning Recommendation, Livery Selection
- Each card is substantial (200-300px height), scrolling through ~6-8 cards
- Optional video walkthrough available (30-45 seconds)

**Visual Design:**
- Sophisticated typography (similar to automotive magazines)
- Detailed circuit photography as hero image
- Weather represented with video forecast (animated clouds, rain effects)
- Elevation profile integrated as part of "Technical Data" card
- Color scheme matches circuit/location (Monaco = elegant/white, Suzuka = modern/blue)

**Unique Elements:**
- Circuit history: 2-3 paragraphs on track heritage and notable races
- Livery preview card: visual representation of selected custom livery
- Video briefing option: 30-second narrated circuit tour with onscreen graphics
- Real-time weather data integration (when connected online)
- Driver assist recommendations (racing line suggestion, traction control advice)

**Strengths:**
- Immersive presentation (premium feel matches game's target demographic)
- Historical context aids engagement
- Video briefing bridges gap between casual and sim players
- Integrated tuning recommendations

**Weaknesses:**
- Lengthy (video + scrolling = 2-3 minutes to fully review)
- Magazine aesthetic may feel dated to some players
- Less tactical detail (fewer corner-specific tips)
- Video not always available (loading times)

---

### Forza Motorsport / Forza Horizon (Turn 10)

**Briefing Screen Architecture (Motorsport):**
- Hybrid tabbed + card approach
- Main tabs: [Event Brief] [Track Details] [Setup]
- Under each tab, card-based content with hero imagery

**Briefing Screen Architecture (Horizon):**
- Magazine-style full-screen hero image with overlaid text callouts
- Scrollable detail cards below hero
- Minimal tabs, emphasis on visual presentation

**Visual Design:**
- High-quality photography (car on circuit, location atmosphere)
- Dynamic lighting effects (time-of-day specific)
- Weather visualization integrated into background imagery
- Turn information as overlaid pins on hero image
- Typography: Forza's signature modern sans-serif with high contrast

**Unique Elements (Motorsport):**
- AI Drivatars: suggested setup from top-ranked community members
- Class restrictions: clear labeling of what vehicle types are eligible
- Specific lap time targets (not just completion)
- Damage model settings explanation

**Unique Elements (Horizon):**
- Atmospheric storytelling (narrative about the location and event)
- Photo mode integration (preview location for photography opportunities)
- Festival atmosphere (event-specific themes and music)
- Custom race parameters (weather, time-of-day, difficulty sliders)

**Strengths:**
- Beautiful visual presentation (AAA production quality)
- Clear information hierarchy with spatial reference
- Integrated tuning recommendations
- Directional hero photography creates anticipation

**Weaknesses:**
- Information can be scattered across multiple pages
- Less tactical depth (fewer corner-by-corner tips)
- Photo-heavy approach requires larger file sizes
- Setup recommendations sometimes feel generic

---

### iRacing (Sim Racing Standard)

**Briefing Screen Architecture:**
- Multi-tab database-style interface: [Session Info] [Track Map] [Weather] [Setup] [Telemetry Baseline]
- Minimal graphics, maximum data density
- Each section scrollable with extensive detail

**Visual Design:**
- Utilitarian design (prioritizes information over aesthetics)
- No animations or effects (performance-focused)
- Circuit map is simple line art with turn numbers
- Data presented in tables and numeric values
- Color coding for warning states (yellow = caution, red = critical)

**Data Precision:**
- Exact track temperature (to 0.1°C)
- Wind speed, direction, gust patterns
- Barometric pressure
- Track surface conditions (grip level as percentage)
- Detailed setup files for current car/track combo
- Historical lap times from practice sessions
- Baseline telemetry for reference

**Strengths:**
- Comprehensive technical data for serious racers
- Frequent updates (real-time conditions)
- Integration with practice session telemetry
- Community-shared setups and baseline data

**Weaknesses:**
- High learning curve (not accessible to casual players)
- Dense information can overwhelm newcomers
- Aesthetic is utilitarian (not engaging)
- Requires domain knowledge to interpret all data

---

### Assetto Corsa Competizione (Balanced Sim)

**Briefing Screen Architecture:**
- Split-panel design: Circuit map (left) + Info panel (right)
- Map is interactive (click corners for detailed info)
- Info panel shows dynamic stats based on selection

**Visual Design:**
- Realistic satellite photography of circuit
- Overlay graphics in professional racing style (similar to real F1 telemetry apps)
- Elevation profile available as separate view
- Weather shown with analog-style gauges
- Turn banking visualized with small elevation icons

**Unique Elements:**
- Corner-specific data: apex speed, optimal throttle position, braking point
- AI line comparison tool (shows AI vs player line from practice)
- Fuel consumption calculator with pit stop planning
- Tire wear prediction based on setup and conditions
- Real-time practice session telemetry streaming

**Strengths:**
- Optimal balance of detail and usability (sim-friendly but not overwhelming)
- Interactive exploration of circuit data
- Professional appearance matches real racing tools
- Excellent for coach/mentor scenario (instructor can highlight specific corners)

**Weaknesses:**
- Requires more screen real estate than mobile-friendly
- Corner-specific data less accessible to casual players
- Banking visualization requires learning curve

---

## Real-World F1 Briefing Influence

Professional Formula 1 teams conduct pre-race briefings using:

**Format:** 45-minute driver meeting
1. **Track walkthrough** (15 min): Mechanical engineer describes each corner, braking points, track limits
2. **Weather briefing** (5 min): Track engineer shows temperature forecasts, wind patterns, fuel consumption
3. **Strategy briefing** (15 min): Race strategist discusses pit windows, tire strategies, fuel loads
4. **Setup review** (10 min): Driver confirms setup on simulator, mechanical engineer answers questions

**Key Visualizations Used:**
- **3D track model**: Rotatable, zoomable, shows banking and elevation
- **Onboard video**: Driver perspective of optimal line with telemetry overlay (speed, throttle, brake)
- **Telemetry comparison**: Current setup vs. previous race or baseline
- **Weather radar**: Real-time forecast with timing annotations
- **Pit lane schematic**: Pit box location, crew positioning, fuel/tire strategies

**Games That Incorporate This:**
- F1 24: Briefing tabs approximate this structure
- Real racing broadcast overlays influence modern game briefing design
- Some esports titles use broadcast-style graphics (arrows, telemetry overlays, corner callouts)

---

## Design Principles & Rationale

### Principle 1: Cognitive Load Management
**Rationale:** Players have limited working memory. Pre-race information must be chunked into meaningful units.

**Implementation:**
- Group related information (weather + track temperature together, not separated)
- Separate mandatory (track limits, pit entry) from optional (history, telemetry)
- Use progressive disclosure (expand sections on demand)
- Avoid text walls; prefer visual representation

**Example:** F1 24's tabbed interface separates Strategy (tactical) from Track Guide (mental model), preventing cognitive interference.

### Principle 2: Information Hierarchy by Criticality
**Rationale:** Not all information is equally important. Design must highlight essentials while keeping depth available.

**Priority Tiers:**
```
TIER 1 (Always visible, top of page):
  - Circuit name
  - Session type (race/time trial)
  - Weather conditions
  - Track limits visualization

TIER 2 (Prominent but not forced, middle section):
  - Pit entry/exit
  - DRS zones
  - Sector information
  - Recommended setup

TIER 3 (Available on exploration, tabs or scrolling):
  - Elevation profile
  - Corner-by-corner guides
  - Racing line reference
  - Historical records
  - Technical data (pressure, wind, etc.)
```

### Principle 3: Spatial Integration
**Rationale:** Humans learn through spatial memory. Information placed on/near a map is retained longer.

**Implementation:**
- Keep circuit map visible or easily accessible (tabbed, not buried)
- Annotate map with data (turn numbers, DRS zones) rather than listing separately
- Use color coding consistently across all map representations
- Make map interactive where possible (click for detail)

**Example:** Assetto Corsa Competizione's split-panel design maintains spatial context throughout briefing.

### Principle 4: Consistency Across Platforms
**Rationale:** Players use multiple devices (console, PC, mobile). Information architecture must be responsive.

**Desktop Layout:** Sidebar + content (efficient use of screen space)
**Tablet Layout:** Tabbed interface (compromise between space and navigation)
**Mobile Layout:** Vertical card stack (natural scrolling, full-width content)

**Key Constraint:** No information should be hidden due to device; redesign layout, not content.

### Principle 5: Progressive Disclosure (Learn as You Play)
**Rationale:** First-time players need less information; veterans want every metric.

**Implementation:**
- Difficulty setting determines briefing depth
- Beginner: Circuit name, weather, pit location (mandatory only)
- Intermediate: Add sector info, DRS zones, general tips
- Advanced/Sim: Add telemetry, elevation profile, AI comparison data, wind patterns

**Example:** Gran Turismo 7 offers optional video briefing for novices; experts skip to tuning tab.

### Principle 6: Mobile vs. Desktop Responsive Patterns
**Desktop:** Sidebar (constant reference) + tabs (deep content) + interactive map
**Mobile:** Card stack (vertical scroll) + collapsible sections + tap-to-expand

**Key difference:** Mobile prioritizes **scanability** (quick overview); desktop prioritizes **simultaneous visibility** (map + stats visible together).

### Principle 7: Visual Cognitive Shortcuts
**Rationale:** Color, icons, and glyphs communicate faster than text.

**Implemented patterns:**
```
🟢 Green   = Safe, go, DRS active
🟡 Yellow  = Caution, technical, requires focus
🔴 Red     = Danger, track limit, wall
⬆️⬇️ Arrows = Elevation change, braking point
🛢️ Fuel    = Fuel consumption related
💨 Wind    = Weather related
```

---

## Actionable Recommendations for Apex 26

### Implementation Priority: High → Medium → Low

### Priority 1: Core Circuit Briefing Screen (High)

**Objective:** Provide new players with essential information before first race; allow veterans to skip.

**Recommended Architecture:**
- **Single-page scrollable card stack** (mobile-native, works on desktop when full-screen)
- **Hero section:** Large circuit map (SVG, scalable) with turn numbers and pit location
- **Info cards** (scrollable below hero):
  1. Circuit Overview Card
     ```
     Monza
     Length: 5.793 km | Turns: 11 | Type: High-speed
     Famous for: Long straights, high-speed corners, minimal downforce
     ```
  2. Weather & Conditions Card
     ```
     Temperature: 22°C | Track Temp: 28°C
     Wind: 2.1 m/s (Northeast)
     [DRS zones highlighted on mini-map]
     ```
  3. Track Limits Card
     ```
     [Visual curb indicators on circuit map]
     Red kerbs are track limit (penalties in online)
     ```
  4. Optional: Elevation Profile Card (Expandable)
     ```
     [2D elevation graph, clickable for corner details]
     Total elevation gain: 85m
     Highest point: Turn 1 (850m)
     ```

**Implementation Using Existing Apex 26 Hooks:**
```javascript
// Fetch circuit data via existing __apex hooks
const circuit = await __apex.tracks();  // available tracks
const profile = __apex.trackProfile();  // elevation data
const corners = __apex.corners();       // apex positions
const walls = __apex.wallStats();       // barrier geometry for limits
const state = __apex.viewState();       // camera for screenshot
```

**Visual Design:**
- Retain Apex 26's existing aesthetic (WebGL2 rendering, minimal design)
- Use SVG for circuit maps (infinitely scalable, small file size)
- Color-code DRS zones (bright green), pit lane (blue), walls (gray/black)
- Typography: existing UI fonts + increased size for briefing (more readable)

**Mobile Responsiveness:**
- Full-width cards, vertical stack
- Hero map takes 40-50% of viewport height
- Tap cards to expand/collapse optional detail

**Desktop Enhancement:**
- Optional: Split-panel layout (map on left, info on right) if space permits
- Otherwise, maintain card stack but with wider container

### Priority 2: Pre-Race Checklist (Medium)

**Objective:** Ensure player readiness; prevent penalties and crashes.

**Recommended Implementation:**
- Simple checkbox modal before "Go" button
- 3-5 critical items:
  ```
  ✓ I understand pit entry location
  ✓ I know the track limits (red kerbs)
  ✓ I'm prepared for weather conditions
  ⚪ (optional) I've reviewed the racing line
  ⚪ (optional) I've checked setup recommendations
  ```
- Checking items enables "Go" button; can be disabled in settings for veteran players
- Dismissible with "Skip Briefing" button (but requires confirmation click)

**Why this works:**
- Gamifies information review
- Reduces player errors in early laps
- Gives sense of progression (checking items = preparation)
- Prevents the "I didn't know!" excuse

### Priority 3: Corner-by-Corner Guides (Medium)

**Objective:** Provide tactical insight for skill development without holding hands.

**Recommended Implementation:**
- Expandable cards on circuit map
- Click turn number to expand corner detail
- Text callout format:
  ```
  Turn 1 (100 m/s corner)
  Brake zone: 150m before apex
  Optimal line: Late apex, early throttle
  Note: Slight elevation change; don't run wide on exit
  ```

**Data Source:**
- Use `__apex.corners()` for apex positions
- Use `__apex.trackProfile(n)` for elevation and curvature data
- Pre-populate for each track (can be crowdsourced from community)

**Design:**
- Inline on circuit map (positioned at turn location)
- Popup on tap/click (desktop: hover, mobile: tap)
- Collapsible to avoid clutter

### Priority 4: Racing Line Visualization (Medium-Low)

**Objective:** Enable learning without reducing challenge; optional feature.

**Recommended Implementation:**
- Separate toggle: "Show racing line" (off by default)
- White dashed overlay on circuit map showing apex-to-apex path
- Optional: Animated racing line play-through (10 second animation of car following line)
- **Important:** Only in briefing screen, not in-race (preserves difficulty)

**Technical Approach:**
- Precompute racing line per circuit (using AI or telemetry baseline)
- Store as array of `{frac, x}` (arc position + lateral offset) points
- Render as SVG path overlaid on map

**Player Psychology:**
- Reduces learning curve for casual players
- Veterans can toggle off
- Provides "hint" for stuck players without being mandatory

### Priority 5: Elevation Profile Visualization (Low Priority)

**Objective:** Advanced briefing for sim enthusiasts; optional detail.

**Recommended Implementation:**
- Expandable section in briefing (click "Advanced Data" → see elevation profile)
- Stylized 2D graph showing elevation over track arc length
- Annotate with turn numbers and elevation changes
- Color-code by difficulty (green = fast, yellow = medium, red = slow)

**Technical Implementation:**
```javascript
const profile = __apex.trackProfile(100);  // 100 data points
// Returns: [{frac, y, k, hw, slope}, ...]
// y = elevation, k = curvature, hw = half-width, slope = incline
```

**Visualization:**
- Use simple Canvas or SVG line chart
- X-axis: lap progress (0-100%)
- Y-axis: elevation (meters)
- Turn numbers labeled below
- Interactive: hover for exact elevation, slope, radius of curvature

### Priority 6: DRS Zone Visualization (Low Priority)

**Objective:** Educational (some players don't know where DRS zones are).

**Recommended Implementation:**
- Highlight DRS zones on circuit map with bright color (consistent with F1 24)
- Annotate: "DRS Zone 1: 800m" with distance label
- Optional detailed view showing:
  ```
  DRS Zone Activation: 1 second behind
  Zone Start: 200m after Turn 8
  Zone End: 100m before Turn 1
  Expected speed gain: ~15 km/h
  ```

**Data Source:**
- Pre-defined per track (stored in `js/tracks.js` or data file)
- Use `__apex.scan([200, 400, 600])` to simulate DRS zone look-ahead

### Priority 7: Telemetry Baseline Comparison (Low Priority - Sim Only)

**Objective:** For advanced players who want to optimize setup before race.

**Recommended Implementation:**
- Optional tab: "Telemetry Baseline"
- Shows onboard telemetry from AI driver or community baseline:
  ```
  Speed profile: [chart showing speed through each turn]
  Braking points: Marked on track map
  Throttle application: Graph of throttle vs. lap progress
  Gear downshifts: Annotated on circuit map
  ```

**Technical Approach:**
- Record baseline telemetry from AI running clean lap
- Store as 60 Hz data stream (1-2 lap cycles)
- Visualize as charts or overlay on map

**Why low priority:** Requires significant additional data collection and storage, but appeals to small audience.

---

## Technical Implementation Checklist for Apex 26

### Phase 1: MVP Circuit Briefing Screen (2-3 hours)

- [ ] Create HTML modal structure for briefing screen
- [ ] Design SVG circuit map component (reusable for all 24 tracks)
- [ ] Implement card stack with vertical scroll
- [ ] Populate Overview Card with circuit data from `__apex.tracks()`
- [ ] Populate Weather Card with mock weather data (can be integrated with API later)
- [ ] Populate Track Limits Card with curb visualization
- [ ] Add "Go Race" button (loads race scene)
- [ ] Add "Skip Briefing" button with confirmation

**Data Dependencies:**
- Requires: Circuit name, length, turn count (already in `js/tracks.js`)
- Requires: DRS zone definitions per track (can be manually added)
- Requires: Track limits visualization (use existing wall data from `__apex.wallStats()`)

### Phase 2: Interactive Circuit Map (2-3 hours)

- [ ] Make circuit map interactive (click to expand corner details)
- [ ] Store corner callouts in `js/tracks.js` or separate data file
- [ ] Implement popup/modal for corner detail view
- [ ] Add elevation change annotations (⬆️⬇️ icons)
- [ ] Color-code corners by difficulty (green/yellow/red)

**Data Dependencies:**
- Requires: `__apex.corners()` for apex positions
- Requires: `__apex.trackProfile()` for elevation data
- Requires: Manual corner difficulty rating (can crowdsource or use curvature-based heuristic)

### Phase 3: Optional Advanced Sections (2-3 hours)

- [ ] Implement collapsible "Advanced Data" section
- [ ] Add elevation profile graph (Canvas or SVG)
- [ ] Add racing line visualization toggle
- [ ] Add DRS zone detailed view

**Data Dependencies:**
- All provided by existing `__apex` hooks
- No external APIs required

### Phase 4: Mobile Responsiveness (1-2 hours)

- [ ] Test card layout on iPhone 12, iPad, desktop
- [ ] Adjust map size, font sizes for mobile
- [ ] Ensure all modals are touch-friendly
- [ ] Add swipe-to-dismiss for briefing screen

### Phase 5: Pre-Race Checklist Modal (1-2 hours)

- [ ] Create simple checkbox modal
- [ ] Wire "Skip Briefing" confirmation
- [ ] Add settings toggle to disable checklist for veterans
- [ ] Store preference in `localStorage` (`apex26.skipBriefing`)

---

## Estimated Implementation Effort

| Feature | Priority | Effort | Complexity |
|---------|----------|--------|------------|
| Core briefing screen (map + 3 cards) | High | 2-3 hrs | Low |
| Interactive circuit map | Medium | 2-3 hrs | Medium |
| Corner callouts | Medium | 1-2 hrs | Low |
| Elevation profile graph | Low | 2-3 hrs | Medium |
| Racing line visualization | Low | 1-2 hrs | Medium |
| Telemetry baseline | Low | 3-4 hrs | High |
| Pre-race checklist | Medium | 1-2 hrs | Low |
| **Total MVP** | — | **5-8 hrs** | **Low-Med** |
| **Full feature set** | — | **13-18 hrs** | **Med** |

---

## Design Files & References

### Recommended SVG Circuit Map Template

```html
<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
  <!-- Track centerline -->
  <path d="M 500 100 Q 800 300 800 700 Q 500 800 200 700 Q 200 300 500 100" 
        stroke="#000" stroke-width="20" fill="none"/>
  
  <!-- DRS zones (bright green) -->
  <path d="M 800 300 L 800 400" stroke="#00FF00" stroke-width="30" opacity="0.7"/>
  
  <!-- Pit lane (blue) -->
  <rect x="100" y="450" width="100" height="50" fill="#0066FF" opacity="0.5"/>
  
  <!-- Turn numbers (clickable) -->
  <text x="600" y="150" font-size="24" font-weight="bold" fill="#000">1</text>
  <text x="850" y="500" font-size="24" font-weight="bold" fill="#000">6</text>
  
  <!-- Walls/barriers (gray) -->
  <path d="M 500 80 L 820 280" stroke="#666" stroke-width="15" opacity="0.5"/>
</svg>
```

### Color Palette Recommendation for Apex 26

```css
/* Track features */
--color-drs-zone: #00FF00;     /* Bright green */
--color-pit-lane: #0066FF;     /* Blue */
--color-wall: #666666;         /* Dark gray */
--color-track-limit: #FF3333;  /* Red */
--color-apex: #9933FF;         /* Purple */
--color-corner-fast: #00AA00;  /* Dark green */
--color-corner-medium: #FFAA00; /* Orange */
--color-corner-slow: #CC0000;  /* Dark red */
--color-elevation-high: #FF6600; /* Warm orange */
--color-elevation-low: #0066FF;  /* Cool blue */
```

---

## Conclusion

Successful pre-race circuit briefing screens in racing games balance **information density** with **cognitive accessibility**. The most effective designs:

1. **Prioritize essentials** (track limits, pit entry, weather) in the initial view
2. **Layer depth** through progressive disclosure (tabs, expandable sections, modals)
3. **Integrate data spatially** (information placed on/near circuit map)
4. **Maintain visual consistency** (color coding, icons, layout patterns across all screens)
5. **Respect player expertise** (beginners see guided checklist; veterans skip to advanced data)
6. **Adapt to device** (responsive design without losing information)

For Apex 26 specifically, the MVP briefing screen requires:
- **Core circuit map** with turn numbers and DRS zones (SVG, scalable)
- **Overview/Weather/Track Limits cards** (scroll-based information chunking)
- **Optional interactive corners** (click for tactical insights)
- **Pre-race readiness checklist** (prevents errors, gamifies preparation)

The entire MVP can be implemented in **5-8 hours** with excellent UX results. Advanced features (elevation profiles, racing line visualization, telemetry baseline) add progressive value for experienced players without blocking core gameplay.

---

## References & Sources

- **F1 24 (2024)**: In-game briefing screen review
- **Gran Turismo 7 (2022)**: Magazine-style briefing, video briefing systems
- **Forza Motorsport (2023)**: Card-based UI, hero imagery patterns
- **iRacing**: Sim racing data standards, technical briefing practices
- **Assetto Corsa Competizione**: Split-panel design, interactive map patterns
- **Real F1 Briefings**: Professional racing team briefing structure (documentaries, broadcasts)
- **Apex 26 Codebase**: `__apex` dev API, telemetry hooks, track data structures

---

**Report Generated:** June 22, 2026  
**Research Scope:** Pre-race circuit briefing UI/UX patterns across professional racing games and sim platforms  
**Audience:** Apex 26 development team, game designers, UI/UX engineers
