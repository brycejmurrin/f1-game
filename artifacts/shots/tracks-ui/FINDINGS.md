# Tracks UI findings (≤5)

Live: https://brycejmurrin.github.io/f1-game/ · `version.json` build **14034** · 2026-10-05

1. **CLASSICS filter keeps prior season selection** — Activating CLASSICS swaps the flag strip to classics (Zandvoort…), but the preview/hero stayed on Bahrain until a classics row was clicked (`03-select-filter-classics.png`). Expect first-visible classic (or clear selection) on filter change.
2. **Phone landscape select compresses the preview** — At 852×393 the select sheet drops the stats grid / elevation chart; only turns + length remain under the hero (`19-phone-select-list.png`). Detail sheet still works (`20-phone-track-detail-spa.png`).
3. **Designer coach card covers tools in edit state** — After RANDOMISE, the “RANDOMISE gave you a circuit…” coach still overlays SHAPE tools until GOT IT (`16-designer-edit-randomise.png`). Intentional onboarding, but first edit feels blocked.
4. **Header “52 CIRCUITS · MORE →”** — Affordance is ambiguous (scroll cue vs link). Strip already scrolls; the chip invites a dead-end tap (`01` / `04`).
5. **DRS zones that wrap past S/F** — Detail sheets list wraparound ranges without a lap cue (e.g. Monza Zone 2 `5149 m – 522 m` in `08-track-detail-monza.png`). Readable to engineers, easy to misread for players.
