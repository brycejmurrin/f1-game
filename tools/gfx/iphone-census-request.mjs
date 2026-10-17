#!/usr/bin/env node
// iphone-census-request.mjs — read .github/iphone-census-request.json into $GITHUB_ENV (push runs).
// @doc Pushed iphone-census request file -> IC_* env lines through the lib allowlist; rejected fields are warned.
// @skill renderer-debug
import fs from "node:fs";
import { requestEnv } from "./iphone-census-lib.mjs";

const file = process.argv[2] || ".github/iphone-census-request.json";
let req = {};
try { req = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error(`::warning::${file} unreadable (${e.message}); using defaults`); }
const { lines, rejected } = requestEnv(req);
for (const r of rejected) console.error(`::warning::request field "${r}" rejected (unknown key or value outside its allowlist)`);
console.log(lines.join("\n") || "(request overrides nothing: defaults)");
if (process.env.GITHUB_ENV && lines.length) fs.appendFileSync(process.env.GITHUB_ENV, lines.join("\n") + "\n");
