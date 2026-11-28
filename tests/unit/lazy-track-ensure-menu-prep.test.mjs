// #6488: a read-only __apex hook polled through a picker tap's settle (the GPU census,
// devicefarm-iphone and the phone bridge poll menuPrep) must not run lazyTrackEnsure's
// synchronous loadTrack: that froze 0.5-1 s and replaced the stepped build. The picker's
// stepped build still runs to a built world, and a track-needing hook called mid-build
// does not force a second, synchronous one.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const turn = () => new Promise((r) => setImmediate(r));

test("menuPrep()/info() after a picker tap never build synchronously; the stepped build owns the world", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const S = g.sandbox, G = g.G, A = S.__apex;
    let builds = 0;
    const build = S.Tracks.build;
    S.Tracks.build = function () { builds++; return build.apply(this, arguments); };
    A.physState();   // a track-needing hook at the title still forces the boot build (the lazy contract)
    assert.equal(builds, 1, "the first track-needing hook builds once");
    assert.equal(G.track.def.id, S.Tracks.LIST[0].id);

    S.document.getElementById("select").hidden = false;   // the picker is open: the menu prep is live
    G.trackIdx = 1; G.scheduleFlybyTrack(true);           // a tap on another circuit drops the world, settles 400 ms
    assert.equal(G.track, null, "the tap freed the old world");
    const p0 = A.menuPrep();
    A.info(); A.probe(); A.texCensus(); A.agentHelp(); A.garageCam(); A.garagePrebuild();
    assert.equal(builds, 1, "read-only hooks in the settle window ran no synchronous Tracks.build");
    assert.equal(G.track, null);
    assert.equal(p0.world, false);

    g.flushTimers();   // the settle fires: prepare → ensureScenery → loadTrackStepped
    for (let i = 0; i < 400 && !A.menuPrep().building; i++) await turn();
    assert.equal(A.menuPrep().building, true, "the stepped build started");
    A.physState();   // track-needing, but the picker's build owns it: "not ready", no sync build
    assert.equal(builds, 1, "a hook during the stepped build forced no synchronous build");

    let now = 1e5;
    for (let i = 0; i < 4000 && !A.menuPrep().world; i++) { g.flushTimers(); g.pumpFrame(now += 16); await turn(); }
    assert.equal(A.menuPrep().world, true, "the stepped build landed the menu world");
    assert.equal(G.track.def.id, S.Tracks.LIST[1].id);
    assert.equal(builds, 1, "still no synchronous build");
  } finally { g.close(); }
});

// #6962: a def() hook (js/agent/apex-play.js) with readOnly:true is exempt from lazyTrackEnsure's build, any other is not.
test("a readOnly ApexPlay def builds no track; a non-readOnly def at the title builds once", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const S = g.sandbox, G = g.G;
    S.ApexPlay.def("playRo", { readOnly: true, doc: "fixture", args: "()", fn: (gg) => ({ ok: true, track: !!gg.track }) });
    S.ApexPlay.def("playRw", { doc: "fixture", args: "()", fn: (gg) => ({ ok: true, track: !!gg.track }) });
    const A = S.ApexApi.create(G);
    let builds = 0;
    const build = S.Tracks.build;
    S.Tracks.build = function () { builds++; return build.apply(this, arguments); };
    assert.equal(G.track, null, "title: no track yet");
    assert.equal(A.playRo().track, false);
    assert.equal(builds, 0, "the readOnly def forced no build");
    assert.equal(G.track, null);
    assert.equal(A.playRw().track, true, "a non-readOnly def gets the lazy boot build");
    assert.equal(builds, 1);
  } finally { g.close(); }
});

// #7433 (#7147 rows 5-6): every hook documented read-only (scan, sheetFit, logs, hudSecFlash) is exempt, and the
// toolkit counts as resident only by the loader's own check (TrackGraph et al.), not TrackBuildProps alone.
function countBuilds(S) {
  const n = { builds: 0 };
  const build = S.Tracks.build;
  S.Tracks.build = function () { n.builds++; return build.apply(this, arguments); };
  return n;
}

test("read-only hooks at the title (toolkit resident) build no track", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const S = g.sandbox, G = g.G, A = S.__apex;
    assert.ok(S.LazyBundles.live().trackBuildResident(), "fixture: the track toolkit is resident");
    const n = countBuilds(S);
    assert.equal(G.track, null, "title: no track yet");
    A.sheetFit(); A.logs(); A.scan(10); A.hudSecFlash();
    assert.equal(n.builds, 0, "no read-only hook ran Tracks.build");
    assert.equal(G.track, null);
    A.physState();   // the lazy contract still holds for a track-needing hook
    assert.equal(n.builds, 1);
  } finally { g.close(); }
});

test("TrackBuildProps without TrackGraph is not a resident toolkit: a non-exempt hook builds nothing and does not throw", async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const S = g.sandbox, G = g.G, A = S.__apex;
    assert.ok(S.TrackBuildProps, "fixture: TrackBuildProps is defined");
    const graph = S.TrackGraph;
    S.TrackGraph = undefined;   // graph.js still in flight
    const n = countBuilds(S);
    try {
      assert.doesNotThrow(() => A.physState());
      assert.equal(n.builds, 0, "no build against a half-loaded toolkit");
      assert.equal(G.track, null);
    } finally { S.TrackGraph = graph; }
  } finally { g.close(); }
});
