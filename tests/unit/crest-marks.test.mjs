// Team marks: shape, size, colour and contrast — all without a browser.
//
// This suite exists because nothing asserted ANYTHING about the team emblems
// and the shipped ones were unreadable. assets/logos/haas.png was a traced blob
// with the H's counter-shapes filled in; audi.png was four filled circles where
// the rings should be; four more marks were near-white and one near-black, so
// each read on exactly one kind of background. Every one of those is a
// measurable property, and none of them was measured.
//
// The measurements come from tools/crest-sweep.mjs, which replays the real
// crest code against a recording 2D context. See that file for how.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCrests, replay, cssOf } from "../../tools/crest-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { LiveryTex: LT, Teams, Liveries, RecCtx } = loadCrests();

// The ONLY colours a crest may paint that do not come from the palette, each
// with a reason. A national flag is not a livery colour: re-tinting it from the
// paint job would make it a different flag.
const HARDCODED_OK = new Set([
  cssOf([0.00, 0.55, 0.25]), cssOf([0.95, 0.95, 0.96]), cssOf([0.80, 0.10, 0.12]),
]);

const SIZES = [
  ["cover", LT.REGIONS.crest, false],
  ["badge", LT.REGIONS.finBadge, true],
];

// The paints a mark can land on, as buildAtlas hands them over. The cover gets
// BOTH c1 and c2: drawTailGraphic washes that region with an alpha gradient of
// stripe||c2, so the background runs between them across the panel — the same
// pair INKED_FOR declares in parts-livery-contrast.spec.js.
function fieldsFor(liv, bare) {
  return bare ? [(liv && liv.fin) || (liv && liv.c2)] : [liv && liv.c1, liv && liv.c2];
}
function paletteFor(id, liv, bare) {
  const field = fieldsFor(liv, bare);
  return { P: LT.markPalette(id, liv, field, bare), field };
}
function every(fn) {
  for (const team of Teams.LIST) {
    const liv = Liveries.forTeam(team)[0];      // the team's own livery
    for (const [name, R, bare] of SIZES) {
      const { P } = paletteFor(team.id, liv, bare);
      fn({ team, liv, name, R, bare, P, m: replay(LT, team.id, R, P, bare) });
    }
  }
}

test("every team on the roster has a vector crest", () => {
  // Not `>= 11`, which passes vacuously when a team is renamed. "custom" is the
  // one id that legitimately has none: it draws crestGeneric plus whatever
  // emblem the player uploaded.
  const missing = Teams.LIST.map((t) => t.id).filter((id) => id !== "custom" && !LT.CRESTS[id]);
  // length, not deepEqual: Teams comes out of a vm context, so its arrays carry
  // that realm's Array.prototype and deepStrictEqual fails on two EMPTY arrays.
  // The mirror of that trap bites harder — a cross-realm notDeepEqual passes
  // vacuously — so every comparison in this file is on a scalar or a string.
  assert.equal(missing.length, 0, "teams with no CRESTS entry: " + missing.join(", "));
});

test("every crest takes the same five arguments", () => {
  // Catches a half-migrated function still declared (ctx, R, ink, accent):
  // it would run, silently paint with `undefined`, and pass every other test.
  for (const [id, fn] of Object.entries(LT.CRESTS))
    assert.equal(fn.length, 5, id + " has arity " + fn.length + ", expected (ctx, R, P, bare, teamId)");
});

test("no crest paints outside its fit box", () => {
  // REGIONS.crest ends at x 470 and titleA starts at 500: 30 px of gutter and
  // no more. Williams used to reach x 1.055 of the box.
  every(({ team, name, m }) => {
    const b = m.bbox, w = `${team.id} ${name}`;
    assert.ok(b.x0 >= -0.02 && b.x1 <= 1.02, `${w} bleeds in x: ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}`);
    assert.ok(b.y0 >= -0.02 && b.y1 <= 1.02, `${w} bleeds in y: ${b.y0.toFixed(3)}..${b.y1.toFixed(3)}`);
  });
});

test("every crest fills its box", () => {
  // The rule is about the DOMINANT axis only, and deliberately so. Half these
  // marks are wide by nature — Audi's four rings are a 3.6:1 lockup, Red Bull's
  // two facing bulls 2.6:1, Aston's spread wings 4:1 — and an earlier version of
  // this test demanded 0.55 in the minor axis too, which is a demand that the
  // real proportions be wrong. What actually needs guarding is that a mark uses
  // the space it has in the direction it runs, and that it is not a hairline;
  // the coverage floor below covers the second part.
  every(({ team, name, m }) => {
    const w = `${team.id} ${name}`, major = Math.max(m.bbox.w, m.bbox.h), minor = Math.min(m.bbox.w, m.bbox.h);
    assert.ok(major >= 0.88, `${w} spans only ${major.toFixed(3)} in its dominant axis`);
    assert.ok(minor >= 0.20, `${w} is a hairline: ${minor.toFixed(3)} in its minor axis`);
  });
});

test("no limb is thinner than the smallest size the atlas ships at", () => {
  // STROKE_MIN is 1.9 px at the 34 px fit box the mobile-AI fin badge gets.
  every(({ team, name, m }) => {
    if (m.minStroke == null) return;
    assert.ok(m.minStroke >= LT.STROKE_MIN - 1e-6,
      `${team.id} ${name} strokes at ${m.minStroke.toFixed(4)} of the box, floor ${LT.STROKE_MIN}`);
  });
});

test("lettering is floored, and absent from the fin badge", () => {
  // Racing Bulls drew "RB" at 0.2 of the box unconditionally: 7 px on the
  // desktop badge, 2.7 px on the mobile-AI cover. Text inside a mark is also a
  // portability hazard — headless SwiftShader and a phone metric fonts
  // differently — so the badge carries none at all.
  every(({ team, name, bare, m }) => {
    if (bare) assert.equal(m.fonts.length, 0, `${team.id} badge draws text: ${m.fonts.map((f) => f.text)}`);
    for (const f of m.fonts)
      assert.ok(f.rel >= LT.TEXT_MIN - 1e-6,
        `${team.id} ${name} sets "${f.text}" at ${f.rel.toFixed(3)}, floor ${LT.TEXT_MIN}`);
  });
});

test("a crest paints only palette colours", () => {
  // THE assertion that keeps this from rotting. Half these marks used to be
  // drawn in a baked BRAND constant reached through module-level state, so a
  // livery could recolour some of a crest and silently skip the rest.
  every(({ team, name, P, m }) => {
    const ok = new Set([cssOf(P.mark), cssOf(P.alt), cssOf(P.plate), cssOf(P.part),
                        cssOf(P.halo), ...HARDCODED_OK]);
    for (const c of m.colours)
      assert.ok(ok.has(c), `${team.id} ${name} paints ${c}, which is not in its palette`);
  });
});

test("no crest uses alpha or a knockout", () => {
  // Behind the atlas is drawTailGraphic's gradient on the car and the lightbox
  // field in the garage. An alpha fill's effective colour is therefore
  // unprovable, and destination-out punches to a colour no palette controls.
  every(({ team, name, m }) => {
    for (const c of m.colours)
      assert.ok(!/rgba|hsla/.test(String(c)), `${team.id} ${name} paints with alpha: ${c}`);
    assert.equal(m.composite, null, `${team.id} ${name} sets globalCompositeOperation=${m.composite}`);
  });
});

test("no crest is a blob, and none is a smear", () => {
  // The haas.png failure, measured. Coverage is of the fit box; the upper bound
  // skips the backing plate, because a shield is not ink and counting it puts a
  // healthy mark at 0.65 where a genuinely filled-in one sits at 0.9.
  every(({ team, name, P, m }) => {
    const total = m.coverageAt(430), markOnly = m.coverageAt(430, cssOf(P.plate));
    const small = m.coverageAt(40);
    const w = `${team.id} ${name}`;
    // 0.10, not the 0.12 this started at. That number was picked when every
    // mark was a chunky hand-drawn shape; Red Bull's fin badge is two bulls
    // facing each other across an empty middle and inks 0.118, which is the
    // real mark, not a smear. The floor is here to catch a hairline.
    assert.ok(total >= 0.10, `${w} inks only ${total.toFixed(3)} of its box`);
    assert.ok(markOnly <= 0.62, `${w} inks ${markOnly.toFixed(3)} of its box — counters are closed`);
    assert.ok(Math.abs(small - total) / Math.max(total, 1e-6) <= 0.35,
      `${w} coverage moves ${total.toFixed(3)} -> ${small.toFixed(3)} between 430 px and 40 px`);
  });
});

test("every mark clears MARK_FLOOR on every livery, on every surface it lands on", () => {
  // team x livery x the four backgrounds a mark can be drawn on. This is the
  // guarantee the whole palette exists to make, and 4.2 is deliberately the
  // same bound tests/specs/parts-livery-contrast.spec.js proves for the sponsor
  // inks — two legibility guards that disagree drift apart.
  const bad = [];
  let scored = 0;
  for (const team of Teams.LIST) {
    for (const liv of Liveries.forTeam(team)) {
      const base = LT.markBase(team.id, liv);
      const cases = [
        ["cover", fieldsFor(liv, false), false],
        ["badge", fieldsFor(liv, true), true],
        ["garage-dark", [liv.c1.map((v) => v * 0.30)], false],
        ["garage-lit", [LT.inkOn([base])], false],
      ];
      for (const [where, fields, bare] of cases) {
        const P = LT.markPalette(team.id, liv, fields, bare);
        // An opaque plate replaces what is behind it; without one the mark
        // still faces every paint in the list.
        const under = P.plate ? [P.plate] : fields.filter(Boolean);
        scored++;
        // PER BACKGROUND, and this is the whole point of carrying a halo. No
        // single colour is 4.2 from both Mercedes' near-black c1 and its teal
        // c2 — white manages 19 and 2.4 — so demanding one would be demanding
        // the impossible. A white mark with a dark halo is legible on both,
        // because wherever the mark fails its outline does not.
        // A team's OWN brand mark on its OWN brand plate is exempt, and only
        // that: Red Bull's red-on-gold is 3.25 and is the actual mark. The
        // plate is still held to its own floor against the field below, so the
        // lockup as a whole can never disappear into the paint.
        if (!P.brandPair) for (const f of under) {
          const best = Math.max(LT.contrast(P.mark, f), P.halo ? LT.contrast(P.halo, f) : 0);
          if (best < LT.MARK_FLOOR)
            bad.push(`${team.id}/${liv.id}/${where} mark+halo ${best.toFixed(2)} on ${f.join()}`);
        }
        if (LT.contrast(P.alt, under[0]) < 2.0 || LT.contrast(P.alt, P.mark) < 2.0)
          bad.push(`${team.id}/${liv.id}/${where} alt ${LT.contrast(P.alt, under[0]).toFixed(2)}` +
                   `/${LT.contrast(P.alt, P.mark).toFixed(2)}`);
        if (P.plate && LT.contrast(P.plate, fields[0]) < 1.6)
          bad.push(`${team.id}/${liv.id}/${where} plate ${LT.contrast(P.plate, fields[0]).toFixed(2)}`);

      }
    }
  }
  assert.ok(scored > 400, "expected the full team x livery grid, scored " + scored);
  assert.equal(bad.length, 0, `${bad.length} of ${scored} below floor: ` + bad.slice(0, 8).join(" | "));
});

test("a team's own livery keeps its brand mark; any other livery recolours it", () => {
  // The whole point of the liv.id === "default" branch. Liveries.forTeam puts
  // the synthesized own-colours livery first.
  for (const team of Teams.LIST) {
    const all = Liveries.forTeam(team);
    const own = all[0], other = all.find((l) => l.id !== "default");
    if (!other) continue;
    assert.equal(own.id, "default", team.id + " own livery is not id 'default'");
    // join(), not notDeepEqual — see the realm note above: comparing two
    // vm-realm arrays for INEQUALITY would pass no matter what they hold.
    const a = LT.markBase(team.id, own).join(), b = LT.markBase(team.id, other).join();
    assert.notEqual(a, b,
      `${team.id} draws the same mark colour on "${own.id}" and "${other.id}"`);
  }
});

test("the roster no longer reaches for a logo PNG", () => {
  // The rework is undone by one person dropping a file back into assets/logos,
  // because the LOGOS[teamId] branch in buildAtlas still wins when one is there.
  // Cheap, exact, and the only thing that stops it.
  const src = fs.readFileSync(path.join(ROOT, "js/car/liverytex.js"), "utf8");
  // Quote-anchored: the comments in that file explain WHY the path is gone, and
  // a bare substring check would forbid saying so.
  assert.ok(!/["'`]assets\/logos\//.test(src), "liverytex.js still builds an assets/logos URL");
  for (const t of Teams.LIST) {
    if (t.id === "custom") continue;
    const f = path.join(ROOT, "assets/logos", t.id + ".png");
    assert.ok(!fs.existsSync(f), `${t.id}.png is back on disk and would override the vector crest`);
  }
});

test("an authored TEAM LOGO colour is painted, or no halo could have carried it", () => {
  // The editor's TEAM LOGO row writes liv.logo. markPalette used to overrule it
  // whenever it fell under MARK_FLOOR against the paint, which on Audi is
  // almost every mid-tone in the picker — its fin is [0.96,0.02,0.22], and only
  // near-white and near-black clear 4.2 against that. The player set a colour
  // and the car came back in a different one, with no way to tell why.
  //
  // The rule now: keep the colour and outline it. This asserts the rule EXACTLY
  // rather than as a percentage — every substitution has to be one no halo
  // could have rescued, so the fallback cannot quietly widen again.
  const PICKS = [
    [0.97, 0.97, 0.98], [0.06, 0.06, 0.08], [1.00, 0.55, 0.00], [0.10, 0.80, 0.90],
    [0.55, 0.90, 0.20], [0.90, 0.20, 0.70], [0.90, 0.72, 0.20], [0.10, 0.16, 0.45],
  ];
  const INK_LIGHT = [0.97, 0.97, 0.98], INK_DARK = [0.06, 0.06, 0.08];
  const bad = [];
  let scored = 0, kept = 0;
  for (const team of Teams.LIST) {
    for (const liv of Liveries.forTeam(team)) {
      for (const logo of PICKS) {
        for (const [where, bare] of [["cover", false], ["badge", true]]) {
          const L = { ...liv, logo };
          const under = fieldsFor(L, bare).filter(Boolean);
          const P = LT.markPalette(team.id, L, fieldsFor(L, bare), bare);
          scored++;
          if (P.mark.every((v, i) => Math.abs(v - logo[i]) < 1e-6)) { kept++; continue; }
          // Substituted. That is only allowed when NEITHER ink can serve as a
          // halo that clears the field and still separates from the mark.
          const rescuable = [INK_LIGHT, INK_DARK].some((h) => {
            const f = Math.min(...under.map((u) => LT.contrast(h, u)));
            return f >= LT.MARK_FLOOR && LT.contrast(h, logo) >= LT.INK_FLOOR;
          });
          if (rescuable)
            bad.push(`${team.id}/${liv.id}/${where} dropped ${logo.join()} a halo could carry`);
        }
      }
    }
  }
  assert.ok(scored > 8000, "expected the full grid, scored " + scored);
  assert.equal(bad.length, 0, `${bad.length} authored colours overruled: ` + bad.slice(0, 6).join(" | "));
  // And the badge — the shark-fin surface the report was about — has to keep
  // the great majority, or the "keep it" path has stopped being reached at all.
  assert.ok(kept / scored > 0.6, `only ${(100 * kept / scored).toFixed(1)}% of authored colours survive`);
});

test("the LOGO DETAIL colour reaches the canvas on every mark, on both surfaces", () => {
  // One editor row, three destinations: a mark's second colour is a backing
  // plate (redbull, ferrari), a second painted layer (cadillac, haas, the
  // monogram box), or — for the seven single-colour silhouettes, Audi's four
  // rings among them — an outline that only exists once the player asks for
  // one. markPalette picks the slot; this asserts the colour actually lands in
  // PIXELS rather than merely in the palette object, which is a different
  // claim: haas resolved a perfectly good `alt` for the fin badge while
  // crestHaas was dropping the ring that would have painted it.
  const D = [1, 0.55, 0];          // nothing else in any palette resolves to it
  const want = cssOf(D);
  const paints = (teamId, liv, bare) => {
    const R = bare ? LT.REGIONS.finBadge : LT.REGIONS.crest;
    const fields = bare ? [(liv.fin || liv.c2)] : [liv.c1, liv.c2];
    const ctx = new RecCtx();
    LT.drawCrest(ctx, teamId, R, { palette: LT.markPalette(teamId, liv, fields, bare), bare });
    return ctx.ops.some((o) => o.style === want || o.shadow === want);
  };
  const dead = [];
  for (const team of Teams.LIST) {
    for (const liv of Liveries.forTeam(team)) {
      for (const bare of [false, true]) {
        const where = `${team.id}/${liv.id}/${bare ? "badge" : "cover"}`;
        // The control: without the colour set, nothing may already be this
        // orange, or "it paints" would prove nothing at all.
        if (paints(team.id, liv, bare)) { dead.push(where + " painted D with logo2 UNSET"); continue; }
        if (!paints(team.id, { ...liv, logo2: D }, bare)) dead.push(where + " swallowed LOGO DETAIL");
      }
    }
  }
  assert.deepEqual(dead, [], "a mark takes the second colour and paints nothing with it");
});

test("LOGO DETAIL is opt-in — an unset one leaves every shipped mark untouched", () => {
  // The outline slot adds a pass no mark had before. If it could fire without
  // the player asking, every crest in the game would change on this commit.
  for (const team of Teams.LIST) {
    for (const liv of Liveries.forTeam(team)) {
      for (const bare of [false, true]) {
        const fields = bare ? [(liv.fin || liv.c2)] : [liv.c1, liv.c2];
        const P = LT.markPalette(team.id, liv, fields, bare);
        assert.equal(P.outline, null, `${team.id}/${liv.id} outlines with no LOGO DETAIL set`);
      }
    }
  }
});

test("an UPLOADED emblem takes LOGO DETAIL as a rim, tinted or not", () => {
  // The custom team can upload its own mark, and that is the ONE logo path
  // that never reaches markPalette — arbitrary art has no second element to
  // recolour, so its second colour can only be an outline. This grid is not
  // reachable from Teams.LIST (the custom team is not in it), which is exactly
  // how the gap survived the census above: the palette guard cannot see a path
  // that has no palette.
  const OUT = [1, 0.55, 0], HALO = [0.97, 0.97, 0.98], TINT = [0.1, 0.8, 0.9];
  const img = { naturalWidth: 64, naturalHeight: 64, _avg: [0.5, 0.5, 0.5] };
  const shadows = (tint, halo, outline) => {
    const ctx = new RecCtx();
    LT.drawLogoImage(ctx, img, LT.REGIONS.crest, tint, halo, outline);
    return ctx.imageOps.map((o) => o.shadow);
  };
  for (const tint of [null, TINT]) {
    const label = tint ? "tinted" : "untinted";
    // The rim must be painted, and the final unshadowed draw must still land
    // on top of it — an outline that covers the mark is not an outline.
    const rim = shadows(tint, null, OUT);
    assert.ok(rim.includes(cssOf(OUT)), `${label}: LOGO DETAIL never painted`);
    assert.equal(rim[rim.length - 1], null, `${label}: the emblem itself is under its own rim`);
    // The halo used to be dropped on the tinted branch, which returned before
    // any halo pass existed — so a tinted emblem got no legibility rescue at
    // all, and the argument was accepted and ignored.
    const both = shadows(tint, HALO, OUT);
    assert.ok(both.includes(cssOf(HALO)), `${label}: the halo was accepted and ignored`);
    assert.ok(both.indexOf(cssOf(HALO)) < both.indexOf(cssOf(OUT)),
      `${label}: the rim must sit INSIDE the halo, as it does on a vector crest`);
    // Opt-in, here too.
    assert.deepEqual(shadows(tint, null, null), [null], `${label}: painted a rim nobody asked for`);
  }
});

test("an authored SAME-INK island stays legible and is opt-in", () => {
  // `part` is a shape the trace found to share no pixel with the rest of its
  // layer — Racing Bulls' bull beside its RB letters. It is the one slot that
  // lets a single-INK mark take a second colour, so it needs its own floor.
  //
  // This test drives logo2 itself rather than riding the shipped-livery grid.
  // It has to: NO shipped livery authors logo2, so a `P.part` rule placed in
  // that grid scores 0 of 1514 palettes and asserts nothing at all. Measured
  // before writing this — the count guard below is what keeps it honest.
  const { LiveryTex: LT, Teams, Liveries } = loadCrests();
  const PICKS = [[1, 0.55, 0], [0.1, 0.1, 0.12], [0.95, 0.95, 0.96],
                 [0.8, 0.1, 0.12], [0.15, 0.5, 0.9], [0.5, 0.5, 0.5]];
  const bad = [], unset = [];
  let scored = 0;
  for (const team of Teams.LIST) {
    for (const liv of Liveries.forTeam(team)) {
      for (const field of [[0.1, 0.1, 0.12], [0.9, 0.9, 0.92], [0.8, 0.1, 0.1]]) {
        for (const bare of [false, true]) {
          // Opt-in: with logo2 absent the island must resolve to null, which is
          // what makes crestTraced fall back to the mark and keeps every
          // shipped crest pixel-identical to what it was before parts existed.
          if (LT.markPalette(team.id, liv, field, bare).part !== null)
            unset.push(`${team.id}/${liv.id}`);
          for (const pick of PICKS) {
            const P = LT.markPalette(team.id, { ...liv, logo2: pick }, field, bare);
            if (!P.part) continue;          // this mark spends logo2 elsewhere
            scored++;
            // Same test the mark answers: the ink OR its outline must carry it.
            // Wherever the fill fails, the halo does not.
            const best = Math.max(LT.contrast(P.part, field),
                                  P.halo ? LT.contrast(P.halo, field) : 0);
            if (best < 2.0)
              bad.push(`${team.id}/${liv.id} part+halo ${best.toFixed(2)} on ${field.join()}`);
          }
        }
      }
    }
  }
  assert.deepEqual(unset, [], "an unset LOGO DETAIL left a same-ink island painted");
  assert.ok(scored > 0,
    "no mark has a `part` island, so this test scored nothing — if the crest " +
    "data lost its per-island roles, that is the bug, not this assertion");
  assert.deepEqual(bad, [], "an authored same-ink island vanished into the field");
});
