# Classic paint layouts — design preview (2026-10-19)

Five cover patterns (`LiveryDesign.PATTERNS`, `js/car/livery-design.js`) that say
WHERE colours go on the car, each after a real F1 scheme. They are generic
geometry: no team's crest, sponsor mark or text. All five use the second design
colour; `tricolour`, `tartanBand` and `deckSplit` also use the car's accent.

| id | label | layout | reference |
|---|---|---|---|
| `tartanBand` | Tartan band | a broad band woven from crossing stripes over the second colour, thin accent sett lines | Stewart SF01 (1997) tartan band — https://en.wikipedia.org/wiki/Stewart_SF01, https://www.kinlochanderson.com/tartan/stewart-racing |
| `borderedStripe` | Bordered stripe | one centre stripe with a keyline each side, a body-colour gap between | McLaren MCL35M Gulf livery, Monaco 2021 (orange stripe on Gulf blue) — https://www.formula1.com/en/latest/article/breaking-mclaren-to-run-one-off-livery-for-monaco-grand-prix-gulf.4hkyBhSrcmPhpwK8WVIwu7 |
| `tricolour` | Tricolour sweep | three equal raked bands across the rear half | Alpine A521 (2021) interim livery: three flag stripes breaking up the black rear — https://www.f1technical.net/news/23007 |
| `spearhead` | Spearhead | one arrowhead from the nose opening to the full panel, notched tail, keylined | Brabham BT52 (1983) two-colour block scheme drawn to read on TV — https://motorsportmagazine.com/articles/single-seaters/f1/f1s-master-of-liveries-names-his-greatest-designs |
| `deckSplit` | Deck split | a level split, one colour per deck, double pinline on the seam | Lotus 49B Gold Leaf (1968) red / white / gold — https://f1colours.sebpatrick.co.uk/best-liveries-ever/1968-gold-leaf-team-lotus/ |

Gate: `node --test tests/unit/livery-design.test.mjs` ("classic paint layouts").
