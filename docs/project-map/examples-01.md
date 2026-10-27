# Examples batch 01: Visor Lab capture authoring and A/B viewer

This batch covers 160,000 text bytes in ten files and 74 content-addressed WebP assets. examples-01-evidence.json records every assigned half-open range, planned and observed whole-file SHA-256, part and read-chunk hashes, image metadata, usage and capture provenance. All assigned hashes match. This is a static source map: no tests, browser, runtime evaluation, network or source changes were used.

## Coverage and boundaries

README.md, app.js, the four capture recipes, comparisons.css, comparisons.html and comparisons.js were read completely. comparisons.json was read textually only through byte 116541, inside the Silverstone dusk left-sun phone pair's provenance.identity.info.n. Batch 02 owns the remaining text. A separate whole-file JSON parse inventories all 34 records and joins asset references without claiming that the remaining text was read. The evidence preserves that distinction, as well as every full recipe object and complete parsed comparison record.

Instruction context is AGENTS.md; there is no nested examples AGENTS.md. js-nav.md scopes its navigation rules to js/**. These standalone demo scripts do not expose game-runtime modules; this map follows local source and literal DOM/data contracts. No runtime symbol lookup or runtime behavior claim was needed. Support reads cover the entire exporter and gallery producer; repository text references identify their test consumers.

## Files and responsibilities

| File | Role and contract |
| --- | --- |
| README.md | Authoring/export guide; distinguishes animated optics from the original 112-shot gallery and appendable screenshot pairs. Documents matched-camera capture, independent side defaults, asynchronous decoding, reduced motion, wetness limitations and approximate optics. |
| app.js | Original static gallery controller. Fetches shots.json; requires verdict PASS; indexes captures by scene + variant; expects scenes with id/label/track/tod/weather/note and captures with scene/variant/file/thumb. Source fingerprint, backend and patch metadata populate provenance. |
| capture-example.json | One Bahrain rainy-night helmet comparison at lap fraction 0.18: Original versus clear visor with strong reflection/refraction. |
| capture-lens-study.json | Ten controlled reflection/refraction pairs. Six Bahrain dry-night intensity comparisons, two Monza daylight pairs and two Bahrain dawn-fog pairs. Clear visor on both sides; omitted settings reset to producer defaults. |
| capture-visor-beams.json | Four beam-slider comparisons: Bahrain 0→100 and 100→160, Spa low sun 0→160, Monaco tunnel 60→160. Reflection medium and refraction light remain constant. Percent values are strings accepted by the producer, not light/medium/strong levels. |
| capture-visor-optics.json | Eighteen scene recipes across Bahrain, Monza, Monaco, Singapore, Spa, Vegas, Silverstone, Suzuka and COTA. Mostly Off versus clear/medium reflections/light refraction; includes tinted maximum and quiet clear/light variants, wet scenes and directional low sun. |
| comparisons.html | Standalone deferred-script viewer shell. Six dependent selectors, pair picker, three 4× lens inspections, hide/show panel, two downloads, provenance disclosure, live status and native wipe range. Optional gallery/optics links start hidden. |
| comparisons.css | Dark responsive presentation; 260px sidebar collapses to one column below 1000px, hidden selector grants full width, full-size images share clipping and transform origin, visible keyboard focus and 44px controls. Pointer divider suppresses touch actions while the stage permits vertical scrolling. |
| comparisons.js | Fetches version-1 comparisons.json, validates pairs array, initializes preferred reflections pair, builds cascading selectors and manages atomic image swaps. Whitelists only comparison-images/ + 64 lowercase hex characters + .webp as image paths. |
| comparisons.json | Versioned appendable catalog. Pair id/title/dimensions plus a/b file/hash/label; optional provenance, selection and note. Provenance captures source revision and dirty flag, frozen scene, backend/frame/performance identity, settings, reduced-motion state and phone viewport/touch metadata. |

## User flows and state

The original gallery starts at Bahrain daytime dry with amber medium tint. Mode changes choose off, clear or smoke; smoke expands color + intensity into the variant key. Scene dropdown and preview cards share state. Rendering decodes both images first, uses a monotonically increasing generation to reject stale completions, then updates main images, thumbnails, labels, download and pressed states together. Missing comparisons or decode errors leave status feedback. Color/intensity fields disable outside smoke mode. The range changes the CSS wipe; scene-card scrolling honors reduced motion. Selector visibility initializes from the 1100px media query.

The screenshot viewer filters in race → timing → weather → camera → effect → position order. Each selector derives available values from the preceding filtered set; prior selections survive only if still valid. Scene provenance supplies defaults, explicit selection overrides them, and absent values become Unspecified. Reset clears filters. Full frame and left/right/upper inspection apply the same scale and transform origin to both images. Native range input provides keyboard interaction; pointer capture on the visible divider supports dragging. The panel toggle updates hidden state, layout class, label and aria-expanded.

Selecting a pair increments a generation token, sets aria-busy, validates both asset paths and decodes both images. Only the latest request installs the images and updates labels, shared aspect ratio, downloads and details. Failure keeps the previous comparison and reports a status; finally clears busy only for the active generation. The fetch layer handles unavailable/invalid catalogs and an empty catalog. visorLab controls visibility of links to the other lab surfaces. No local persistence or game mutation is present in these demo controllers.

## Producers, consumers and integration

ab-gallery.mjs reads recipe pairs or imports equal-size still PNG/JPEG/WebP inputs. Recipe validation allows 1–64 distinct slug IDs, constrained time/weather/position/camera fields, known visor setting enums and numeric beams 0–200 rounded to percent strings. Each side independently merges defaults. Effect metadata distinguishes a single reflection/refraction change from combined changes. Imports reject files over 32 MiB, animation and dimension mismatch before changing the index. A lock excludes concurrent writers; content-addressed lossless WebP assets remain immutable; matching IDs replace records; a temporary index is renamed atomically. The viewer templates come from this directory.

Its capture path uses one disposable WebGL2 context with reduced motion and Ultra settings, one frozen scene reused for consecutive identical recipes, pinned wetness, per-side visor settings and seeded stationary droplets. It records source/identity/provenance and checks capture identity, surface wetness and meaningful pixels before importing pairs. These are producer source contracts, not newly executed observations.

visor-lab-export.mjs copies authoring files, original images and comparison assets to an absolute destination distinct from the authoring directory. It merges incoming comparison IDs into the destination so prior destination-only pairs remain. It refreshes three visor runtime aliases from game source instead of storing duplicate runtime code here. The original full-resolution/thumbnail gallery needs existing capture output; the committed originals alone support animated optics after aliases are exported. Tests referenced by text are shot-jobs.test.mjs for import/export behavior and f1-dev-tools.test.mjs for optics scheduling/control extraction; neither was run.

## Catalog and binary asset map

The whole structured catalog contains 34 pairs: 12 at 1920×1080 and 22 at 844×390. Eighteen phone captures record a clean source revision, ten lens studies and the first optics capture record dirty revisions, and five imported comparisons have null provenance. The full parsed records and source revisions are preserved in JSON evidence. Captured performance fields describe historical software rendering and cannot establish player GPU performance.

All 74 binary assets were inspected using image headers/metadata, full byte hashes and the catalog usage join. They are still RGB WebP: 30 Full-HD and 44 phone-sized images. Each filename equals the byte SHA-256. Fifty-seven assets are referenced by the current catalog; seventeen have no current pair reference. Shared baseline images are intentionally reused (the Bahrain dry-night lens baseline serves six pairs). Every file has its own dimensions, mode, frame count, embedded metadata keys and side/pair/provenance usage rows in evidence. Unreferenced assets have no inferred scene identity: filenames alone cannot establish provenance. No pixels were visually assessed.

## Maintenance and limits

The @doc comments correctly identify the demo and producer responsibilities. README.md's statement that reflections are procedural shield highlights is older than the optics recipe notes describing scene-light glints and beams; assess that wording against current runtime optics before reusing it as a current implementation description. The Spa rain recipe note mentions visor rain, while its omitted visorRain setting resets to off in the producer and stored phone capture: notes are intent/context, settings are the mechanical contract. Neither comment was edited.

Keep recipe settings, viewer DOM IDs, catalog schema and producer defaults synchronized. Comparisons are still-image evidence; atomic load guards prevent stale selections, but this map does not verify drag behavior, narrow-screen appearance, rendered optics or downloadable content. No assigned file declares a dedicated asset license or attribution grant. Recorded screenshot provenance does not establish redistribution permission. Missing/export-only aliases and historical artifact paths are retained only in JSON evidence; they are not new Markdown links.
