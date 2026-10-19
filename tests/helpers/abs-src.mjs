// @doc Absolute vm `filename` for a repo-relative source path, so V8 reports a file:// URL breakpoints and coverage map back (vm-filename-lint).
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** `absSrc("js/game.js")` → `/repo/js/game.js`; an already-absolute path passes through. */
export const absSrc = (rel) => (path.isAbsolute(rel) ? rel : path.join(ROOT, rel));
