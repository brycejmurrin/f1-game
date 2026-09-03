# Per-track foundation checklist

> The migration this checklist was written for is COMPLETE — all 40 circuits
> set `sceneryCoordinates` (39 racing, monaco source). It stays live as the
> checklist for a NEW circuit or a foundation-touching edit to an existing one.

Use one isolated track-scoped change at a time.

## Coordinates and elevation
- Choose and set `sceneryCoordinates: "source"` or `"racing"`.
- Verify start/finish, turn landmarks, elevation peaks, bridges, and half-width zones at their intended racing fractions.
- Replace local fraction arithmetic with `TrackSpace` conversions.

## Terrain and grounding
- Confirm `terrainOuter` is wide enough for the scene and does not cross a nearby foldback.
- Probe both ribbon edges and major prop feet with `__apex.groundY()`.
- Replace broad flat land boxes with `groundPatch`; use `groundedSegments` for long walls, roofs, stands, and stepped models.
- Confirm terrain reaches the universal floor continuously and no triangle exceeds the road tolerance.

## Models
- Wrap hero composites in `modelGroup` with complete bounds and `required: true`.
- Replace water-colored land boxes with `waterSurface`.
- Replace raw cross-track roofs, bridges, tunnels, arches, and gantries with `overheadSpan`; assert at least 4.8 m underside clearance and safe support feet.
- Check `__apex.modelDiagnostics()` for suppressed, invalid, unsafe, or incomplete required entries in both day and night sessions.

## Collision and shared dressing
- Register collision for every solid visible boundary; use `recordBarrier(0, 1, ...)` for a full lap.
- Enable `groundPatch({collision:true})` where a visual patch is also a solid boundary.
- Add narrow `dressingExclusions` for waterfronts, parks, stadium interiors, open desert, and hero-model sightlines.
- Confirm visible runoff matches `wallAt`/`wallStats().tightFrac`.

## Verification
- `node tools/track/verify-track.cjs <id>`
- Pure foundation Node tests.
- Focused terrain-over-road, props-over-road, wall, elevation, and track survey tests.
- Day/night driver-eye and orbit captures.
- `__apex.geometryDiagnostics()` contains only `ok:true` entries.
- No non-finite geometry, unintended road intrusion, floating/sunk hero model, incomplete required model, or unsafe overhead span.
