#!/usr/bin/env node
/** Print @electron/fuses read for the current --dir binary (CI assertion helper). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnpackedBinary } from "./unpacked-bin.mjs";

const SELF = fileURLToPath(import.meta.url);
const DESKTOP = path.resolve(path.dirname(SELF), "..");

/**
 * Drop ANSI SGR (colour/style) sequences. desktop.yml greps this script's output for the
 * plain line `EnableNodeCliInspectArguments is Enabled`; @electron/fuses 2.x styles the
 * fuse name and the state separately (node:util styleText), and colours even a piped
 * stream when FORCE_COLOR is set (it beats NO_COLOR) or on a Node whose styleText does
 * not look at the stream, so the env alone cannot guarantee plain text.
 * @param {string} s
 * @returns {string}
 */
export function stripAnsi(s) {
  return String(s == null ? "" : s).replace(/\u001b\[[0-9;]*m/g, "");
}

/** Env for the fuses CLI child: ask for no colour (both 1.8 chalk and 2.x styleText honour it). */
export function plainEnv(env = process.env) {
  return { ...env, NO_COLOR: "1", FORCE_COLOR: "0" };
}

function main() {
  const { path: bin } = findUnpackedBinary({ desktopRoot: DESKTOP });
  let appPath = bin;
  if (process.platform === "darwin") {
    const i = bin.indexOf(".app/");
    if (i >= 0) appPath = bin.slice(0, i + 4);
  }
  const binJs = path.join(DESKTOP, "node_modules/@electron/fuses/dist/bin.js");
  const r = spawnSync(process.execPath, [binJs, "read", "--app", appPath], { encoding: "utf8", env: plainEnv() });
  process.stdout.write(stripAnsi(r.stdout));
  process.stderr.write(stripAnsi(r.stderr));
  process.exit(r.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main();
