// @doc Shared CLI flag reader: both `--name=v` and `--name v`, and an unknown flag is an ERROR not a shrug.
//
// WHY THIS EXISTS. Four garage/car tools each hand-rolled a `flag()` and they
// did not agree, so the same spelling meant different things per tool.
// Measured 2026-09-09:
//
//   spine-station    --team=redbull -> redbull     --team redbull -> MCLAREN
//   flank-occlusion  --team=redbull -> redbull     --team redbull -> MCLAREN
//   garage-angles    both forms work
//   garage-frame     both forms work
//
// The space form was silently dropped by the two OFFLINE MEASUREMENT tools —
// the ones whose whole output is numbers you then act on. They printed a full
// table of McLaren placements under a heading the caller believed was Red Bull,
// and nothing anywhere said otherwise. spine-station's own header even
// cross-references garage-angles in the space form, so the docs taught the
// spelling that broke it.
//
// A measurement tool that measures the wrong thing quietly is worse than one
// that crashes, so this rejects what it does not recognise rather than falling
// back to a default. That also catches the typo case (`--tema=redbull`), which
// every hand-rolled version answered with the default team and a straight face.
const VALUE = /^--[a-z0-9][a-z0-9-]*=/i;

/** A flag mistake is the CALLER's typo, not a crash in the tool — print the
 *  one line that says what to type and exit 1, never a node stack trace. */
export class CliArgError extends Error {}
export function runCli(main) {
  return main().catch((e) => {
    console.error(e instanceof CliArgError ? e.message : e);
    process.exit(1);
  });
}

/** Top-level form: a tool that parses at MODULE scope has no main() for
 *  runCli to wrap, and a CliArgError there escapes as an unhandled rejection
 *  with a stack trace. Use this when the parse is not inside main(). */
export function parseFlags(argv, known) {
  try {
    return makeFlags(argv, known);
  } catch (e) {
    if (!(e instanceof CliArgError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

/** STRICT ENTRY for a CLI the rulebook names (audit3 T7/T8, audit4 cli-help).
 *  `--help`/`-h` prints `usage` and exits 0; an unknown `--flag` prints the
 *  near-miss line plus the usage on stderr and exits 2 (a usage error, the
 *  POSIX/sysexits convention, distinct from a tool's own exit 1 = red).
 *  Call it FIRST, before any fetch, spawn or file write: a typo'd
 *  `deploy.mjs --gate-onyl` used to run the full deploy. Any `known` flag the
 *  usage text never mentions is appended as a `flags:` line, so `--help` can
 *  never omit a parsed flag again (test-bg's `--timeout`, deploy's `--train`).
 *  `exit` is injectable for tests. Returns the makeFlags reader. */
export function strictFlags(argv, known, usage, { exit = (c) => process.exit(c) } = {}) {
  const all = [...new Set([...known, "--help"])];
  const text = String(usage).replace(/\s+$/, "");
  const missing = all.filter((k) => k !== "--help" && !new RegExp(`${k}(?![a-z0-9-])`).test(text));
  const full = missing.length ? `${text}\n  flags: ${missing.join(" ")}` : text;
  if (argv.includes("--help") || argv.includes("-h")) { console.log(full); exit(0); return null; }
  try { return makeFlags(argv, all); }
  catch (e) {
    if (!(e instanceof CliArgError)) throw e;
    console.error(`${e.message}\n\n${full}`);
    exit(2);
    return null;
  }
}

/** `known` is every flag the tool accepts, WITH the leading dashes. Anything
 *  else in argv that looks like a flag throws, naming the near misses. */
export function makeFlags(argv, known) {
  const set = new Set(known);
  for (const a of argv) {
    if (!a.startsWith("--") || a === "--") continue;
    const name = VALUE.test(a) ? a.slice(0, a.indexOf("=")) : a;
    if (set.has(name)) continue;
    // A typo is nearly always one edit away from a real flag; say which.
    const near = known.filter((k) => k.startsWith(name.slice(0, 4)) || name.startsWith(k.slice(0, 4)));
    throw new CliArgError(`unknown flag ${name}${near.length ? ` — did you mean ${near.join(" or ")}?` : ""}`
      + `\n  accepts: ${known.join(" ")}`);
  }
  const read = (name, dflt) => {
    const eq = argv.find((a) => a.startsWith(name + "="));
    if (eq) return eq.slice(name.length + 1) || dflt;
    const i = argv.indexOf(name);
    // `--a --b` must not read "--b" as a's value; a bare "-" prefix ends it.
    if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("-")) return argv[i + 1];
    return dflt;
  };
  return {
    flag: read,
    /** Comma list; empty entries drop out so `--x=a,,b` is two. */
    list: (name, dflt) => (read(name, dflt) || "").split(",").map((s) => s.trim()).filter(Boolean),
    has: (name) => argv.includes(name) || argv.some((a) => a.startsWith(name + "=")),
  };
}

/** TYRE WEAR for the AI instruments (`ai-pace` / `ai-field` / `ai-line` /
 *  `ai-human`), which parse at module scope and share a hand-rolled `flag()`
 *  each, so this reads argv itself rather than going through makeFlags.
 *
 *  WHY IT EXISTS. tools/lib/game-vm.cjs seeds `tyreWear: "off"` so a physics
 *  trace measures the driving model rather than this month's product default
 *  (see the comment there). The shipped default is `store.get("tyreWear",
 *  "light")`, so everything downstream of wear — AiDrive.stintPlan, pitNow,
 *  compoundFor, degCost and pits.think — is INERT in all four instruments.
 *  Every strategy claim measured with them is therefore a no-wear claim.
 *  `--wear light|real` turns the seam on so it can be measured at all.
 *
 *  DEFAULT STAYS "off" on purpose: the numbers already recorded in
 *  docs/notes/AI-FIELD-RESEARCH.md were taken with wear off, and a flag that
 *  silently moved them would invalidate the record it is meant to extend.
 *  The levels are TyreModel.LEVELS (js/physics/tyre-model.js); an unknown one
 *  is the caller's typo and exits 1 rather than quietly racing on slicks. */
export const WEAR_LEVELS = ["off", "light", "real"];
export function wearArg(argv, dflt = "off") {
  const eq = argv.find((a) => a.startsWith("--wear="));
  let v = dflt;
  if (eq) v = eq.slice("--wear=".length);
  else {
    const i = argv.indexOf("--wear");
    if (i >= 0) v = argv[i + 1] !== undefined && !argv[i + 1].startsWith("-") ? argv[i + 1] : "";
  }
  if (!WEAR_LEVELS.includes(v)) {
    console.error(`--wear: expected one of ${WEAR_LEVELS.join("|")}, got ${JSON.stringify(v)}`);
    process.exit(1);
  }
  return v;
}

/** Resolve a `--only=a,b` style id filter against the ids that exist.
 *  `raw` null (flag absent) means "no filter" and returns null. Otherwise each
 *  token must select at least one id (`match: "substring"` or exact, a trailing
 *  `*` meaning prefix), else throw a CliArgError naming the valid ids.
 *
 *  WHY. `menu-fit --only=title` matched no screen (the id is `menu`), ran zero
 *  cells, printed nothing and exited 0, so a clipped screen looked clean
 *  (#3305). A filter that selects nothing is the caller's typo, never a pass. */
export function pickIds(raw, ids, { flag = "--only", match = "substring" } = {}) {
  if (raw == null) return null;
  const toks = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  const hit = (tok, id) => (tok.endsWith("*") ? id.startsWith(tok.slice(0, -1))
    : match === "substring" ? id.includes(tok) : id === tok);
  const bad = toks.filter((t) => !ids.some((id) => hit(t, id)));
  if (!toks.length || bad.length) {
    throw new CliArgError(`${flag}: ${toks.length ? `no match for ${bad.map((b) => JSON.stringify(b)).join(", ")}` : "needs at least one id"}`
      + `\n  valid ids: ${ids.join(" ")}`);
  }
  return toks;
}

/** Print usage and exit 0 when argv asks for help. Browser/shot tools that
 *  parse positionals first used to treat `--help` as a track id or ignore it
 *  and launch Chromium (skilltest probe-debug, 2026-10-01). Call this BEFORE
 *  any launch / bind. Returns false when argv is not a help ask. */
export function exitIfHelp(argv, text) {
  if (!argv.includes("--help") && !argv.includes("-h") && argv[0] !== "help") return false;
  console.log(String(text).replace(/\s+$/, ""));
  process.exit(0);
}
