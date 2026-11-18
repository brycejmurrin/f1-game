// @ts-check
// THE CIRCUIT FOUNDATIONS, ONE SPEC (TK2-17, #3039). Each circuit's track-owned
// foundation cases (required models, props clear of the racing surface,
// terrain grounded, water safe, walls sane) live in tests/specs/foundation/<id>.js,
// moved verbatim from the per-circuit `<id>-foundation.spec.js` files: same
// titles, same per-test timeouts, same fixture (raw @playwright/test page +
// BOOT_MS, or ../helpers/fixtures.js) and same pageErrors guards.
//
// Honours process.env.APEX_CIRCUITS (tools/ci/select-specs.mjs CIRCUIT_FILTERED_TESTS):
// a circuit-only diff registers only the touched circuits' cases, and an
// empty or unmatched scope registers every circuit (foundationScope fails closed).
//
// The three ADAPTED foundations (albert-park, cota, imola) stay their own files:
// they run under the vm-page adapter (tools/ci/twinned-specs.mjs ADAPTED), one
// child per spec, which a merged browser spec cannot be.
import { foundationScope } from "../helpers/foundation-roster.js";
import abudhabi from "./foundation/abudhabi.js";
import bahrain from "./foundation/bahrain.js";
import hungaroring from "./foundation/hungaroring.js";
import interlagos from "./foundation/interlagos.js";
import monaco from "./foundation/monaco.js";
import montreal from "./foundation/montreal.js";
import monza from "./foundation/monza.js";
import qatar from "./foundation/qatar.js";
import redbull from "./foundation/redbull.js";
import spa from "./foundation/spa.js";
import suzuka from "./foundation/suzuka.js";
import vegas from "./foundation/vegas.js";
import zandvoort from "./foundation/zandvoort.js";

const REGISTER = { abudhabi, bahrain, hungaroring, interlagos, monaco, montreal, monza, qatar, redbull, spa, suzuka, vegas, zandvoort };

for (const id of foundationScope(Object.keys(REGISTER), process.env.APEX_CIRCUITS)) REGISTER[id]();
