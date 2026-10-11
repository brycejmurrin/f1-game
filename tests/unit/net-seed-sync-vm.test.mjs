/* Friend race: host and guest must build the SAME AI field and grid.
 * makeCars draws a lane and a skill roll per car and gridUp a jitter per car
 * from the sim stream. The guest's applySettings rewinds that stream to the
 * host's seed; the host used to keep wherever its earlier races left it
 * (lobby.beginRace now rewinds it with the same `G.seed = G.seed`). Two real
 * game VMs, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const grid = (G) => G.cars.slice().sort((a, b) => a.gridPos - b.gridPos).map((c) => c.code).join(",");
const skills = (G) => G.cars.map((c) => c.skill).join(",");

test("a host that has raced before builds the guest's field once both rewind to the host's seed", async () => {
  const host = await createGame({}), guest = await createGame({});
  try {
    await host.G.startRace();
    host.apex.headless(true); host.apex.go(); host.step(120);
    host.G.quitToMenu();
    // lobby.beginRace on the host, then the second race through the host path.
    host.G.seed = host.G.seed;
    await host.G.startRace();
    // The guest: applySettings sets the host's seed (rewinds), then beginRace re-sets it.
    guest.G.seed = host.G.seed;
    guest.G.seed = guest.G.seed;
    await guest.G.startRace();
    assert.equal(skills(guest.G), skills(host.G), "same AI skills");
    assert.equal(grid(guest.G), grid(host.G), "same grid order");
  } finally { host.close(); guest.close(); }
});

test("without the host rewind the second race diverges (the premise of the fix)", async () => {
  const host = await createGame({}), guest = await createGame({});
  try {
    await host.G.startRace();
    host.apex.headless(true); host.apex.go(); host.step(120);
    host.G.quitToMenu();
    await host.G.startRace();                 // no rewind: the old host path
    guest.G.seed = host.G.seed;
    await guest.G.startRace();
    assert.notEqual(skills(guest.G), skills(host.G));
  } finally { host.close(); guest.close(); }
});
