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
