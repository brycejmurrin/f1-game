// vstd-invariant — the PACE invariant, asserted instead of written down.
//
// AGENTS.md, Physics: "Adding anything that divides a speed by VMAX, or
// compares one against a literal, means picking vTop() or vStd()." PACE is a
// GROUND-SPEED SCALE — the OVERALL SPEED slider multiplies the car's real m/s —
// so a threshold written against a raw speed means a different fraction of the
// car's envelope at every setting.
//
// That was prose, nothing checked it, and it has escaped TWICE:
//   A5  — the beached-rescue gate `GRASS_V * 0.6 + 1.5` was true only at PACE 1;
//         above ~1.14 a beached car was never rescued, below ~0.57 a driver in
//         full control was teleported to x = 0.
//   A13 — `c.otArmed` required a bare `c.speed > 15` while the active-aero floor
//         thirty lines below correctly read `vStd(c.speed) > X_MIN_SPEED`.
//         Overtake armed at 42 % of top speed at pace 0.5 and 16 % at pace 1.3,
//         against active aero's constant 35 %.
//
// So this is the guard, in the shape docs/ARCHITECTURE-REVIEW.md records for
// A10 ("plus tests/unit/circuit-def-fields.test.mjs — the guard is the real fix").
// tools/vstd-lint.mjs finds every `.speed` compared against a numeric literal
// without vStd(); ALLOWED below is the set that is legitimately ABSOLUTE, each
// with a written reason. A new absolute speed threshold cannot be added without
// somebody writing down why it is allowed to be one.
//
// ── WHEN THIS TEST FAILS ──────────────────────────────────────────────────────
// It failed because you added (or moved) a `.speed` vs literal comparison.
// Decide which scale the number belongs on:
//
//   * "a fraction of what the car can do flat out" — overtake/active-aero
//     arming, brake-disc glow at racing speed, anything the DIAL would read
//     the same for at every pace — is on the STANDARD (pace-5) scale. Write
//     `vStd(c.speed) > N`. See OT_MIN_SPEED / X_MIN_SPEED in js/game.js.
//   * "crawling, stopped, reversing, or a divide-by-zero floor" is ABSOLUTE,
//     because the bottom of the speed range is GRIP-limited, not power-limited:
//     the AI's corner speed is sqrt(LAT_MAX·bankMu·grip / k) with no PACE in it,
//     and REVERSE_MAX is a flat -5 m/s. Add a row to ALLOWED with the reason.
//
import test from "node:test";
import assert from "node:assert/strict";
import { speedLiteralViolations, stripNonCode, readFiles, violationKey } from "../../tools/vstd-lint.mjs";

// ── the approved absolute sites ───────────────────────────────────────────────
// Every row is a speed that is legitimately NOT pace-normalised, and says why.
// `code` is the line it lives on, so moving code around does not silently widen
// the exemption: a threshold that migrates to a new line must be re-justified.
const ALLOWED = [
  // ── relative closing speed between two cars in contact ──
  // (Was: (dProg >= 0 ? b.speed - a.speed : …) > 0.5 — now uses hoisted
  // aSp/bSp on _ct, so the .speed-literal scanner no longer sees it. The
  // 0.5 m/s noise floor remains a relative closing-direction test.)

  // ── AI traffic / stuck detection ──
  {
    file: "js/game.js",
    expr: "c.speed < 7",
    code: 'if (state === "race" && c.speed < 7 && boxed) c.stuckT = (c.stuckT || 0) + dt;',
    // "Boxed in AND going nowhere". The bottom of the speed range does not move
    // with PACE: the AI's corner speed is sqrt(LAT_MAX·bankMu·gripMult()/kMax)
    // and LAT_MAX is one of the deliberately-absolute force constants, so even
    // the slowest hairpin sits well above 7 m/s at every OVERALL SPEED setting.
    // 7 m/s therefore means "crawling" at every pace, never "a fraction of top".
    why: "crawl detector below the GRIP-limited corner floor, which carries no PACE term",
  },

  // ── divide-by-zero guards ──
  {
    file: "js/game.js",
    expr: "c.speed > 1",
    code: "gapAhead = ahead && c.speed > 1 ? gapAhead / c.speed : Infinity;",
    // Re-keyed 2026-09-02: `ahead` is now the car ahead ON THE ROAD (a scan
    // above this line), so the metres are already in gapAhead; the guard is the same.
    why: "divide-by-zero guard — the same expression divides by c.speed",
  },
  {
    file: "js/game.js",
    expr: "player.speed > 1",
    code: "const slipRaw = player && player.speed > 1 ? (player.vLat || 0) / player.speed : 0;",
    why: "divide-by-zero guard — the same expression divides by player.speed",
  },

  // ── sign tests: direction, not magnitude ──
  {
    file: "js/game.js", expr: "c.speed > 0", code: "if (c.speed > 0) {",
    why: "sign test — braking forwards vs. dropping into the reverse crawl",
  },
  {
    file: "js/game.js", expr: "c.speed > 0",
    code: "if (c.speed > 0) c.speed = Math.max(0, c.speed - cd * dt);",
    why: "sign test — coast drag decelerates toward zero from the positive side",
  },
  {
    file: "js/game.js", expr: "c.speed < 0",
    code: "else if (c.speed < 0) c.speed = Math.min(0, c.speed + cd * dt);",
    why: "sign test — the negative half of the same coast-drag branch",
  },
  {
    file: "js/game.js", expr: "c.speed > 0",
    code: "if (c.speed > 0) c.speed = Math.max(0, c.speed + a * dt);",
    why: "sign test — uphill slope bleed applies only while moving forwards",
  },
  {
    file: "js/game.js", expr: "c.speed < 0",
    code: "const vx = Math.max(Math.abs(c.speed), 4), dirS = c.speed < 0 ? -1 : 1;",
    // The `, 4)` on the same line is the well-conditioning floor the slip angle
    // needs (slip is undefined at zero speed); the comparison itself is a sign.
    // Re-keyed 2026-09-02: slip is measured against |vx| in both directions now
    // (the reverse-crawl plateau bug); the sign only flips the steer term.
    why: "sign test — the direction of travel, which flips the steer term of the front slip angle",
  },
  {
    file: "js/game.js", expr: "c.speed > 0",
    code: "if (c.speed > 0) c.speed = Math.max(0, c.speed - scrub);",
    why: "sign test — wall scrub bleeds toward zero from the positive side",
  },
  {
    file: "js/game.js", expr: "c.speed < 0",
    code: "else if (c.speed < 0) c.speed = Math.min(0, c.speed + scrub);",
    why: "sign test — the negative half of the same wall-scrub branch",
  },
  {
    file: "js/game.js", expr: "c.speed > 0.5", code: "if (c.speed > 0.5 && c.speed < 12)",
    why: "sign test with a noise floor — 'the car is actually moving' before the launch window",
  },

  // ── the reverse-crawl regime: stopped / wedged / spun ──
  // REVERSE_MAX is a flat -5 m/s and REVERSE_ACCEL a flat 5 m/s^2, neither
  // PACE-scaled, so "stopped" and "crawling" are absolute by construction. Each
  // of these gates exists to sit inside or just outside that crawl.
  {
    file: "js/game.js", expr: "c.speed < 3",
    code: "const stoppedOnTrack = gasPressed && c.speed < 3 && raceT > 2 && !(braking && ds < -0.01);",
    // Re-keyed 2026-09-02: gated on the DRIVER's pedal (gasPressed), not the
    // touch auto-throttle; the 3 m/s threshold and its reason are unchanged.
    why: "stopped detector, on the absolute scale REVERSE_MAX (-5 m/s) sets",
  },
  {
    file: "js/game.js", expr: "c.speed < 4",
    code: "const stuck = beached || c.wrongWay || (c.speed < 4 && (c.wallT || 0) > 0) || stoppedOnTrack;",
    // Its sibling on the very next line, `beached`, IS pace-scaled
    // (GRASS_V * 0.6 * max(PACE, 0.05) + 1.5) — because that one must clear the
    // grass-drag FLOOR, which is pace-scaled. This one must clear a standstill,
    // which is not. The two being different is correct, not an oversight.
    why: "pinned-against-a-wall standstill detector, same absolute regime as REVERSE_MAX",
  },
  {
    file: "js/game.js", expr: "c.speed < 5",
    code: "(c.speed < 5 && raceT > 2 && (c.contactT || 0) === 0 && !unstuckActive);",
    why: "AI standstill detector — exactly |REVERSE_MAX|, the absolute crawl bound",
  },
  // ── world-space visual emission ──
  // These gate PARTICLES and MARKS that live in world metres, and each one's own
  // emission velocity is real ground speed (c.speed * 0.35, 4 + c.speed * 0.22,
  // …). At low pace the car genuinely covers less ground per second, so it
  // genuinely throws less. Normalising the gate but not the velocity it feeds
  // would make the two disagree. All sit below the grip-limited corner floor,
  // i.e. they separate "crawling" from "driving" at every pace.
  {
    file: "js/game.js", expr: "c.speed > 10",
    code: "skids.stamp(tmpMat, (skid > 0.25 || c.offroad) && c.speed > 10);",
    // The justification did not change when the SkidMarks extraction rewrote this
    // line from an `if` into a stamp() argument — but the `code` match did, and the
    // lint correctly reported the site as unapproved until this text followed it.
    // That is the guard working: an approval that survives a refactor without being
    // re-read is an approval nobody has actually re-granted.
    why: "world-space emission gate — skid marks are laid at real ground travel",
  },
  {
    file: "js/game.js", expr: "c.speed > 14",
    code: "if (c.isPlayer && c.speed > 14 && Math.random() < dt * 22) {",
    why: "world-space emission gate — wall-scrape sparks fly at 4 + c.speed * 0.22 real m/s",
  },
  {
    file: "js/game.js", expr: "c.speed > 10",
    code: "if (c.speed > 10) smokeI = Math.max(smokeI, clamp((_pvl - 3) / 5, 0, 1));",
    why: "world-space emission gate — modulated by lateral slip (m/s), itself grip-limited and absolute",
  },
  {
    file: "js/game.js", expr: "c.speed < 12", code: "if (c.speed > 0.5 && c.speed < 12)",
    // The launch-wheelspin window. Pulling away from a standstill is an
    // ACCEL/grip event in the absolute regime, and 12 m/s is below the
    // grip-limited corner floor at every pace.
    why: "upper bound of the launch window — the standstill/getaway regime, below the grip floor",
  },
  {
    file: "js/game.js", expr: "c.speed > 10", code: "if (c.offroad && c.speed > 10) {",
    why: "world-space emission gate — kickup flies at c.speed * 0.35 real m/s",
  },

  // ── exhaust after-fire, and the test hook that must mirror it ──
  {
    file: "js/game.js", expr: "c.speed > 8",
    code: "const lifted = !!c.wasOnThrottle && !onThrottle && c.speed > 8;",
    why: "'not parked' floor for the lift-off after-fire — below the grip-limited corner floor",
  },
  {
    file: "js/agent/apex.js", expr: "G.player.speed > 8",
    code: "if (G.player && G._testInput && G._testInput.throttle && next && !next.throttle && G.player.speed > 8)",
    // setInput() reproduces js/game.js's `lifted` condition so a scripted
    // throttle lift pops the exhaust the same way a real one does. It must use
    // the SAME number as the site above: normalising one and not the other would
    // make the debug hook and the driving model disagree about what a lift is.
    why: "mirrors js/game.js's exhaustPop gate and must carry the identical number",
  },
];

// ── open findings ─────────────────────────────────────────────────────────────
// Sites the audit could NOT justify as absolute. They are recorded rather than
// silently exempted, and deliberately NOT fixed here: this file is the guard,
// not the repair. Fixing one means deleting its row.
//
// EMPTY, and that is the point: the one finding this list ever held — the rain
// spray's `wet && c.speed > 15` with its `clamp((c.speed - 15) / 45, 0, 1)` ramp,
// which capped spray strength at 0.47 at pace 0.5 — was repaired as A16 in
// docs/ARCHITECTURE-REVIEW.md and both halves now read vStd(c.speed). A row here
// is a debt, not a licence; deleting one is what closing it looks like.
const SUSPECT = [];

const APPROVED = [...ALLOWED, ...SUSPECT];

// ── unit tests: the matcher itself ────────────────────────────────────────────
const scan = (src) => speedLiteralViolations(new Map([["synthetic.js", src]])).map((v) => v.expr);

test("flags the A13 shape — a bare speed against a literal", () => {
  assert.deepEqual(
    scan("c.otArmed = otEnabled() && gap < OT_GAP && c.speed > 15;"),
    ["c.speed > 15"],
  );
});

test("accepts the A13 fix and every other vStd()-wrapped threshold", () => {
  assert.deepEqual(scan("c.otArmed = otEnabled() && vStd(c.speed) > OT_MIN_SPEED;"), []);
  assert.deepEqual(scan("const heating = braking && vStd(c.speed) > 12;"), []);
  assert.deepEqual(scan("const lockTaper = 1 - vStd(Math.abs(c.speed)) / STEER_SPEED_REF;"), []);
  assert.deepEqual(scan("if (vStd(Math.abs(c.speed)) > 25) foo();"), []);
});

test("flags every comparison operator, in both operand orders", () => {
  assert.deepEqual(scan("if (c.speed >= 20) f();"), ["c.speed >= 20"]);
  assert.deepEqual(scan("if (player.speed <= 4.5) f();"), ["player.speed <= 4.5"]);
  assert.deepEqual(scan("if (15 < c.speed) f();"), ["15 < c.speed"]);
  assert.deepEqual(scan("if (0 > c.speed) f();"), ["0 > c.speed"]);
});

test("sees through Math.abs / a || 0 default / a wrapping paren", () => {
  assert.deepEqual(scan("const lifted = Math.abs(c.speed) > 8;"), ["Math.abs(c.speed) > 8"]);
  assert.deepEqual(scan("if ((c.speed || 0) > 8) f();"), ["(c.speed || 0) > 8"]);
  assert.deepEqual(scan("if (Math.max(0, c.speed) > 12) f();"), ["Math.max(0, c.speed) > 12"]);
  assert.deepEqual(scan("if (ds < -0.03 &&\n    c.speed >\n    15) f();"), ["c.speed > 15"]);
});

test("does not flag a named constant, a division, or a shift", () => {
  assert.deepEqual(scan("if (c.speed > OT_MIN_SPEED) f();"), []);
  assert.deepEqual(scan("if (c.speed > X_MIN_SPEED) f();"), []);
  assert.deepEqual(scan("const spN = clamp(c.speed / vTop(), 0, 1);"), []);
  assert.deepEqual(scan("const n = c.speed >> 2;"), []);
  assert.deepEqual(scan("const f = (c) => c.speed;"), []);
});

test("comments and strings are not code", () => {
  assert.deepEqual(scan("// the old gate was c.speed > 15, see A13\nconst a = 1;"), []);
  assert.deepEqual(scan("/* c.speed > 15 */ const a = 1;"), []);
  assert.deepEqual(scan('Log.warn("game", "c.speed > 15");'), []);
  assert.deepEqual(scan("Log.warn(`game`, `c.speed > 15`);"), []);
});

test("stripNonCode preserves every byte offset", () => {
  const src = 'const a = 1; // c.speed > 15\nconst b = "c.speed > 15";\n/* x */\n';
  const out = stripNonCode(src);
  assert.equal(out.length, src.length);
  assert.equal(out.split("\n").length, src.split("\n").length);
  const [l0, l1, l2] = out.split("\n");
  assert.equal(l0.trimEnd(), "const a = 1;");        // code kept, comment blanked
  assert.equal(l1.replace(/ +/g, " "), 'const b = " ";');
  assert.equal(l2.trim(), "");
});

// ── the real thing ────────────────────────────────────────────────────────────
test("js/game.js and every manifest module that reads a speed contain only APPROVED absolute speed thresholds", () => {
  const found = speedLiteralViolations(readFiles());
  const approved = new Set(APPROVED.map(violationKey));
  const unapproved = found.filter((v) => !approved.has(violationKey(v)));

  assert.deepEqual(
    unapproved.map((v) => `${v.file}:${v.line}  ${v.expr}`),
    [],
    "A speed compared against a numeric literal is PACE-sensitive: the OVERALL SPEED\n" +
    "slider scales real m/s, so this threshold is a different fraction of the car's\n" +
    "envelope at every setting. Wrap it in vStd() — or, if it is genuinely absolute\n" +
    "(a force, a divide-by-zero floor, a sign test, the reverse crawl), add it to\n" +
    "ALLOWED in tests/unit/vstd-invariant.test.mjs WITH the reason.",
  );

  // The exemption must not outlive the code it exempts.
  const seen = new Set(found.map(violationKey));
  assert.deepEqual(
    APPROVED.filter((a) => !seen.has(violationKey(a))).map((a) => `${a.file}  ${a.expr}`),
    [],
    "stale entry: this site no longer exists (or its line changed). Delete the row.",
  );

  // Set comparison alone would hide a second, byte-identical copy of an already
  // approved line, so pin the count too. (The `closing` test used to appear
  // twice — once per collision pass — until the passes were deduplicated into
  // pairContact(); every approved expression is unique in the source now.)
  assert.equal(found.length, APPROVED.length);
});

test("every approved site carries a written justification", () => {
  for (const a of APPROVED) {
    assert.ok(a.why && a.why.length > 20, `${a.file} ${a.expr}: no justification`);
    assert.ok(a.file && a.expr && a.code, `${a.file} ${a.expr}: incomplete row`);
  }
});

test("open findings are recorded, not quietly exempted", () => {
  // SUSPECT is a defect register, not a second allow-list: each row must explain
  // the arithmetic, so "we already know" never decays into "we accepted it".
  for (const s of SUSPECT) {
    assert.match(s.why, /UNJUSTIFIED/, `${s.file} ${s.expr}: SUSPECT rows must say so`);
    assert.ok(s.note && s.note.length > 200, `${s.file} ${s.expr}: needs the measured detail`);
  }
  assert.ok(SUSPECT.length <= 1, "a growing suspect list means the guard is being used as an allow-list");
});
