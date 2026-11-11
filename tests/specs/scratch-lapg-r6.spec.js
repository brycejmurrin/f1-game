// SCRATCH (#5387 round 7) — never merged.
import { test } from "../helpers/fixtures.js";
import { lapBody } from "../helpers/scratch-lapg.mjs";
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
test.describe.configure({ retries: 0 });
test.setTimeout(1200000);
test("SCRATCH lapg r6 monaco a", lapBody({ track: "monaco", knobs: { PruneIdleMs: 600000 } }));
