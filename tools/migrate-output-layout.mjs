#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
const PORT = process.env.APEX_PORT || "3456";

if (!/^\d+$/.test(PORT)) {
  throw new Error(`invalid APEX_PORT: ${PORT}`);
}

const legacyTests = [
  "ui-screenshots",
  "track-trace",
  "f1-track-accuracy",
  "f1-circuit-directions",
  "monaco-cam",
  "scenery-shots",
  "trackmap-shots",
  "hooks-demo",
  "monaco-scenery",
  "all-tracks-buildings",
  "monaco-tour",
];

const moves = legacyTests.map((name) => [
  resolve(ROOT, "tests", name),
  resolve(ROOT, "artifacts", `galleries-${Number(PORT)}`, "legacy", name),
]);
moves.push([
  resolve(ROOT, "tests", "galleries", "ui-screenshots"),
  resolve(ROOT, "artifacts", `galleries-${Number(PORT)}`, "legacy", "gallery-ui-screenshots"),
]);
moves.push([
  resolve(ROOT, "tools", "render-out"),
  resolve(ROOT, "scratch", "renders", "legacy-render-out"),
]);

function availableDestination(wanted) {
  if (!existsSync(wanted)) return wanted;
  let n = 1;
  while (existsSync(`${wanted}.legacy-${n}`)) n++;
  return `${wanted}.legacy-${n}`;
}

function movePreserving(source, wanted) {
  if (!existsSync(source)) return;
  if (!APPLY) {
    const destination = availableDestination(wanted);
    console.log(`would move ${source} -> ${destination}`);
    return;
  }
  for (;;) {
    const destination = availableDestination(wanted);
    console.log(`move ${source} -> ${destination}`);
    mkdirSync(dirname(destination), { recursive: true });
    try {
      cpSync(source, destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      rmSync(source, { recursive: true });
      return;
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
}

for (const [source, destination] of moves) {
  movePreserving(source, destination);
}

if (!APPLY) {
  console.log("dry run only; rerun with --apply to move the listed directories");
}
