#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
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
  const destination = availableDestination(wanted);
  console.log(`${APPLY ? "move" : "would move"} ${source} -> ${destination}`);
  if (!APPLY) return;
  mkdirSync(dirname(destination), { recursive: true });
  try {
    renameSync(source, destination);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    cpSync(source, destination, { recursive: true, errorOnExist: true });
    rmSync(source, { recursive: true });
  }
}

for (const [source, destination] of moves) {
  movePreserving(source, destination);
}

if (!APPLY) {
  console.log("dry run only; rerun with --apply to move the listed directories");
}
