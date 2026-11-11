// SCRATCH (#5387) — never merged.
import { test } from "../helpers/fixtures.js";
import { scratchBody } from "../helpers/scratch-churnf.mjs";
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
test.describe.configure({ retries: 0 });
test("SCRATCH churnf r4 burn40 prune0", scratchBody({ burn: 40, pruneIdleMs: 0 }));
