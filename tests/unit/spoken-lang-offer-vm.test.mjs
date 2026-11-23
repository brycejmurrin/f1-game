// #5946 1A: SPOKEN LANGUAGE offers only AUTO and ENGLISH until radio.* translations
// ship — any other pick made a foreign system voice read English lines. A stored
// non-English pick migrates to AUTO at boot (js/audio/panel.js); ENGLISH and AUTO
// are kept. A settings import skips a non-offered value for this key only (settings-export.js oneOf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

for (const [stored, want] of [["de", "auto"], ["ja", "auto"], ["en", "en"], ["auto", "auto"]]) {
  test(`a stored spokenLang "${stored}" boots as "${want}"`, async () => {
    const g = await createGame({ track: "monza", storage: { spokenLang: stored } });
    try {
      assert.equal(g.G.store.get("spokenLang"), want);
      assert.equal(g.ctx.localStorage.getItem("apex26.spokenLang"), JSON.stringify(want), "the migration is saved");
    } finally { g.close(); }
  });
}
