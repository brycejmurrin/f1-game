#!/usr/bin/env node
/** Print @electron/fuses read for the current --dir binary (CI assertion helper). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnpackedBinary } from "./unpacked-bin.mjs";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { path: bin } = findUnpackedBinary({ desktopRoot: DESKTOP });
let appPath = bin;
if (process.platform === "darwin") {
  const i = bin.indexOf(".app/");
  if (i >= 0) appPath = bin.slice(0, i + 4);
}
const binJs = path.join(DESKTOP, "node_modules/@electron/fuses/dist/bin.js");
const r = spawnSync(process.execPath, [binJs, "read", "--app", appPath], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
