// SCRATCH (#5387) — never merged.
import { test } from "../helpers/fixtures.js";
import { prebuildBody } from "../helpers/scratch-prebuild.mjs";
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
test.describe.configure({ retries: 0 });
test.setTimeout(1200000);
test("SCRATCH prebuild m2 spa tour=false", prebuildBody({ track: "spa", tour: false }));
