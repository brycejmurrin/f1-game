// SCRATCH (#5387) — never merged.
import { test } from "../helpers/fixtures.js";
import { primeBody } from "../helpers/scratch-primeft.mjs";
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
test.describe.configure({ retries: 0 });
test.setTimeout(900000);
test("SCRATCH primeft b3", primeBody({ forceGL: false, off: false, mode: "nodecals" }));
