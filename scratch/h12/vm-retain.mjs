import { createRequire } from "node:module";
import v8 from "node:v8";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const g = await createGame({ track: "monza" });
await g.race("monza");
g.apex.headless(true); g.apex.setInput({ throttle: true, steer: 0.02 }); g.apex.step(1 / 60, 300); g.apex.clearInput(); g.apex.headless(false);
class H12OldTrackMarker { constructor() { this.tag = "old"; } }
g.G.track.__h12 = new H12OldTrackMarker();
g.G.quitToMenu();
await g.race("spa");
const f = v8.writeHeapSnapshot("scratch/h12/vm-retain.heapsnapshot");
console.log("wrote", f);
g.close();
