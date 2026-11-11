// SCRATCH (#5387) — never merged.
import { test } from "../helpers/fixtures.js";
import { primeBody } from "../helpers/scratch-primeft.mjs";
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
test.describe.configure({ retries: 0 });
test.setTimeout(900000);
test("SCRATCH primeft m5 gl=true off=false", primeBody({ forceGL: true, off: false }));
