/* Ambient globals for files that opt in with `// @ts-check` (see
   docs/notes/CHECKJS-ROLLOUT-2026-10-18.md). Declare ONLY a global whose source
   file is outside tsconfig.checkjs.json's `include`; a file inside it is inferred from
   its own JS, and declaring it here too is a duplicate-declaration error. */

/** js/core/log.js — the project logger (never bare console.*).
 * Emit methods match the live export; optional `debug?` was wrong (always present)
 * and omitted `trace`, which caused false TS2304 under // @ts-check. */
declare const Log: {
  info(tag: string, ...args: unknown[]): void;
  warn(tag: string, ...args: unknown[]): void;
  error(tag: string, ...args: unknown[]): void;
  debug(tag: string, ...args: unknown[]): void;
  trace(tag: string, ...args: unknown[]): void;
};
