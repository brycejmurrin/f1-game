#!/usr/bin/env node
/**
 * notices.mjs — the ONE generator of third-party notices (audit W13, 2026-11-10).
 * @doc Builds THIRD-PARTY-NOTICES (repo root), the in-game ABOUT & CREDITS block in index.html and desktop/build/THIRD-PARTY-NOTICES.txt from the vendor licence/MANIFEST files and the assets CREDITS files; `--check` fails on drift.
 *
 *   node desktop/scripts/notices.mjs            # write THIRD-PARTY-NOTICES + the index.html block
 *   node desktop/scripts/notices.mjs --check    # exit 1 when either committed copy ≠ generated
 *   node desktop/scripts/notices.mjs --desktop  # write desktop/build/THIRD-PARTY-NOTICES.txt (gitignored)
 *
 * Every component's licence id is READ from its licence file (detectLicence), its
 * version from the vendor MANIFEST / package.json / folder name, and the asset rows
 * from the CREDITS files, so the credits panel cannot drift from what ships.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.resolve(HERE, "../build/THIRD-PARTY-NOTICES.txt");
export const ROOT_NOTICES = "THIRD-PARTY-NOTICES";
export const CREDITS_OPEN = "<!-- @gen-notices:credits -->";
export const CREDITS_CLOSE = "<!-- /@gen-notices:credits -->";

/** Repo-relative licence / credits files that must exist in git, in output order. */
export const NOTICE_SOURCES = [
  "assets/music/CREDITS.txt",
  "assets/sfx/CREDITS.txt",
  "assets/voice/CREDITS.txt",
  "assets/pack/CREDITS.md",
  "assets/atlases/README.md",
  "assets/icons/lucide-LICENSE.txt",
  "assets/fonts/titillium-web-OFL.txt",
  "assets/fonts/barlow-condensed-OFL.txt",
  "assets/fonts/saira-OFL.txt",
  "vendor/three-0.187.0/LICENSE.txt",
  "vendor/rapier-0.19.3/LICENSE",
  "vendor/jsqr-1.4.0/LICENSE",
  "vendor/trystero-0.25.4/LICENSE-trystero",
  "vendor/trystero-0.25.4/LICENSE-noble-secp256k1",
  "vendor/gpu-capture/SPECTOR-LICENSE.txt",
  "vendor/gpu-capture/WEBGL-LINT-LICENSE.md",
  "vendor/sgsr/LICENSE",
];

/** The shipped third-party code, fonts and icons. `licence` is a licence FILE; the id is read from it. */
export const COMPONENTS = [
  { name: "three.js", group: "software", licence: "vendor/three-0.187.0/LICENSE.txt", url: "https://threejs.org", use: "3D renderer, including the opt-in Inspector panel",
    version: (root) => readJson(root, "vendor/three-0.187.0/MANIFEST.json").three },
  { name: "Rapier (rapier3d-compat)", group: "software", licence: "vendor/rapier-0.19.3/LICENSE", url: "https://rapier.rs", use: "physics engine",
    version: (root) => readJson(root, "vendor/rapier-0.19.3/package.json").version },
  { name: "jsQR", group: "software", licence: "vendor/jsqr-1.4.0/LICENSE", url: "https://github.com/cozmo/jsQR", use: "QR code reader (phone controller pairing)" },
  { name: "Trystero", group: "software", licence: "vendor/trystero-0.25.4/LICENSE-trystero", url: "https://github.com/dmotz/trystero", use: "peer-to-peer rooms (RACE A FRIEND)" },
  { name: "noble-secp256k1", group: "software", licence: "vendor/trystero-0.25.4/LICENSE-noble-secp256k1", url: "https://github.com/paulmillr/noble-secp256k1", use: "signing for Trystero's Nostr signalling",
    version: () => "" },
  { name: "Spector.js", group: "software", licence: "vendor/gpu-capture/SPECTOR-LICENSE.txt", url: "https://spector.babylonjs.com", use: "opt-in GPU frame capture (developer tool)",
    version: (root) => readJson(root, "vendor/gpu-capture/MANIFEST.json").packages.spectorjs },
  { name: "webgl-lint", group: "software", licence: "vendor/gpu-capture/WEBGL-LINT-LICENSE.md", url: "https://github.com/greggman/webgl-lint", use: "opt-in WebGL checker (developer tool)",
    version: (root) => readJson(root, "vendor/gpu-capture/MANIFEST.json").packages.webglLint },
  { name: "Snapdragon Game Super Resolution 1", group: "software", licence: "vendor/sgsr/LICENSE", url: "https://github.com/SnapdragonStudios/snapdragon-gsr", use: "upscaling shader, adapted",
    version: () => "" },
  { name: "Titillium Web", group: "fonts", licence: "assets/fonts/titillium-web-OFL.txt", url: "https://fonts.google.com/specimen/Titillium+Web", use: "typeface" },
  { name: "Barlow Condensed", group: "fonts", licence: "assets/fonts/barlow-condensed-OFL.txt", url: "https://github.com/jpt/barlow", use: "typeface" },
  { name: "Saira", group: "fonts", licence: "assets/fonts/saira-OFL.txt", url: "https://github.com/Omnibus-Type/Saira", use: "typeface (subset)" },
  { name: "Lucide icons", group: "fonts", licence: "assets/icons/lucide-LICENSE.txt", url: "https://lucide.dev", use: "menu icons" },
];

/** The live data feeds (docs/DECISIONS.md D-031: both are non-commercial). */
export const DATA_SOURCES = [
  { name: "Jolpica F1", url: "https://github.com/jolpica/jolpica-f1", licence: "CC BY-NC-SA 4.0", use: "schedule and standings (the Ergast-compatible API)" },
  { name: "OpenF1", url: "https://openf1.org", licence: "CC BY-NC-SA 4.0", use: "results, live timing, telemetry, WATCH replays and team radio captions" },
];

export const TRADEMARK = "This game is unofficial and is not associated in any way with the Formula 1 companies. "
  + "F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of Formula One Licensing B.V.";

function readJson(root, rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }
function readText(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`notices: missing ${rel} (expected at ${abs})`);
  return fs.readFileSync(abs, "utf8");
}

/** The SPDX id a licence text states. Throws on an unknown text: a new licence is a human read. */
export function detectLicence(text) {
  const t = String(text);
  if (/SPDX-License-Identifier:\s*BSD-3-Clause/.test(t) || /Neither the name of the copyright holder/.test(t)) return "BSD-3-Clause";
  if (/Apache License\s+Version 2\.0/.test(t)) return "Apache-2.0";
  if (/SIL Open Font License,? Version 1\.1/.test(t)) return "OFL-1.1";
  if (/^\s*ISC License/.test(t)) return "ISC";
  if (/Permission is hereby granted, free of charge/.test(t)) return "MIT";
  throw new Error("notices: unrecognised licence text: " + t.slice(0, 80).replace(/\s+/g, " "));
}

const versionOf = (c, root) => (c.version ? c.version(root) : (/-(\d+\.\d+\.\d+)\//.exec(c.licence) || [])[1]) || "";

/** Asset rows: `file: … | source: … | author: … | licence: …` from a CREDITS file. */
export function creditRows(root, rel) {
  const rows = [];
  for (const line of readText(root, rel).split("\n")) {
    const m = /^file: (\S+) \| source: (.+?) \| author: (.+?) \| licence: (.+)$/.exec(line.trim());
    if (m) rows.push({ file: m[1], source: m[2].trim(), author: m[3].trim(), licence: m[4].trim() });
  }
  return rows;
}

/** The baked pack's CREDITS.md table, grouped by author + licence. */
export function packGroups(root) {
  const groups = new Map();
  for (const line of readText(root, "assets/pack/CREDITS.md").split("\n")) {
    const cells = line.split("|").map((s) => s.trim());
    if (cells.length < 7 || cells[1] === "kind" || /^-+$/.test(cells[1])) continue;
    // Read from the right: an id may itself hold a "|" (the env rows' `*|day`).
    const n = cells.length, author = cells[n - 4], licence = cells[n - 3], key = author + " · " + licence;
    groups.set(key, { author, licence, n: (groups.get(key)?.n || 0) + 1, kinds: new Set([...(groups.get(key)?.kinds || []), cells[1]]) });
  }
  return [...groups.values()].sort((a, b) => b.n - a.n || a.author.localeCompare(b.author));
}

/** Everything the panel and the notices file say, as data. */
export function noticeModel(root = ROOT) {
  const components = COMPONENTS.map((c) => ({ ...c, version: versionOf(c, root), spdx: detectLicence(readText(root, c.licence)) }));
  const audio = [
    { label: "Music (6 tracks)", credits: "assets/music/CREDITS.txt" },
    { label: "Engine sound", credits: "assets/sfx/CREDITS.txt" },
    { label: "Radio voices", credits: "assets/voice/CREDITS.txt" },
  ].map((a) => {
    const rows = creditRows(root, a.credits);
    const licences = [...new Set(rows.map((r) => r.licence))];
    const authors = [...new Set(rows.map((r) => r.author))];
    return { ...a, licence: licences.join(", "), author: authors.join(", "), unknown: licences.some((l) => /^unknown$/i.test(l)) };
  });
  return { components, audio, pack: packGroups(root), data: DATA_SOURCES };
}

export function buildNoticesText(root = ROOT) {
  const m = noticeModel(root);
  const parts = [
    "Apex 26 — third-party notices",
    "",
    "Generated by `node desktop/scripts/notices.mjs` from the licence and CREDITS files",
    "below; do not hand-edit. The game's own code and assets are not open-licensed:",
    "the root package.json says UNLICENSED and LICENSE reserves all rights to the",
    "project owner. Third-party components keep the licences listed here.",
    "",
    TRADEMARK,
    "",
    "Components",
    "----------",
    ...m.components.map((c) => `${c.name}${c.version ? " " + c.version : ""} — ${c.spdx} — ${c.use} — ${c.url} (${c.licence})`),
    "",
    "Live data",
    "---------",
    ...m.data.map((d) => `${d.name} — ${d.licence}, non-commercial use only — ${d.use} — ${d.url}`),
    "",
    "Audio",
    "-----",
    ...m.audio.map((a) => `${a.label} — licence: ${a.licence} — author: ${a.author} (${a.credits})`),
    "",
    "Baked asset pack (assets/pack/CREDITS.md)",
    "-----------------------------------------",
    ...m.pack.map((g) => `${g.author} — ${g.licence} — ${g.n} ${[...g.kinds].sort().join("/")} item${g.n === 1 ? "" : "s"}`),
    "",
  ];
  for (const rel of NOTICE_SOURCES) {
    const text = readText(root, rel);
    parts.push("=".repeat(72));
    parts.push(rel);
    parts.push("=".repeat(72));
    parts.push(text.replace(/\s+$/, ""));
    parts.push("");
  }
  return parts.join("\n") + "\n";
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ext = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

/** The body of the ABOUT & CREDITS settings page (between the markers in index.html). */
export function buildCreditsHtml(root = ROOT) {
  const m = noticeModel(root);
  const I = "          ";
  const li = (inner) => `${I}  <li>${inner}</li>`;
  const fold = (id, title, items, open = false) => [
    `${I}<details${open ? " open" : ""} id="${id}">`,
    `${I}  <summary class="adv-more-btn">${esc(title)}</summary>`,
    `${I}  <ul>`,
    ...items.map((x) => "  " + li(x)),
    `${I}  </ul>`,
    `${I}</details>`,
  ];
  return [
    `${I}<p class="adv-help" data-help="keep">${esc(TRADEMARK)}</p>`,
    ...fold("credits-data", "LIVE DATA", m.data.map((d) =>
      `${ext(d.url, d.name)} &middot; ${esc(d.licence)}, non-commercial use only &middot; ${esc(d.use)}`), true),
    ...fold("credits-software", "SOFTWARE", m.components.filter((c) => c.group === "software").map((c) =>
      `${ext(c.url, c.name)}${c.version ? " " + esc(c.version) : ""} &middot; <a href="${esc(c.licence)}" target="_blank" rel="noopener">${esc(c.spdx)}</a> &middot; ${esc(c.use)}`)),
    ...fold("credits-fonts", "FONTS & ICONS", m.components.filter((c) => c.group === "fonts").map((c) =>
      `${ext(c.url, c.name)} &middot; <a href="${esc(c.licence)}" target="_blank" rel="noopener">${esc(c.spdx)}</a> &middot; ${esc(c.use)}`)),
    ...fold("credits-assets", "SOUND & ART", [
      ...m.audio.map((a) => `${esc(a.label)} &middot; ${a.unknown ? "licence not on record" : esc(a.licence)} &middot; <a href="${esc(a.credits)}" target="_blank" rel="noopener">credits</a>`),
      ...m.pack.map((g) => `${esc(g.author)} &middot; ${esc(g.licence)} &middot; ${g.n} ${esc([...g.kinds].sort().join(" / "))} item${g.n === 1 ? "" : "s"} in the asset pack`),
    ]),
    `${I}<p class="adv-help" data-help="keep">Full licence texts ship beside each component (the links above) and in THIRD-PARTY-NOTICES in the project&rsquo;s repository.</p>`,
  ].join("\n");
}

/** index.html with its credits block regenerated. Throws when the markers are missing. */
export function withCreditsBlock(html, root = ROOT) {
  const a = html.indexOf(CREDITS_OPEN), b = html.indexOf(CREDITS_CLOSE);
  if (a < 0 || b < a) throw new Error(`notices: ${CREDITS_OPEN} … ${CREDITS_CLOSE} not found in index.html`);
  return html.slice(0, a + CREDITS_OPEN.length) + "\n" + buildCreditsHtml(root) + "\n          " + html.slice(b);
}

export function writeNotices(root = ROOT, dest = OUT) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buildNoticesText(root));
  return dest;
}

/** Write (or with check, compare) the two committed outputs. Returns the exit code. */
export function syncCommitted(root = ROOT, { check = false } = {}) {
  const targets = [
    [ROOT_NOTICES, buildNoticesText(root)],
    ["index.html", withCreditsBlock(fs.readFileSync(path.join(root, "index.html"), "utf8"), root)],
  ];
  let code = 0;
  for (const [rel, want] of targets) {
    const abs = path.join(root, rel);
    const have = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    if (have === want) { if (check) process.stdout.write(`${rel}: up to date\n`); continue; }
    if (check) { process.stdout.write(`${rel}: STALE — regenerate with \`node desktop/scripts/notices.mjs\`\n`); code = 1; continue; }
    fs.writeFileSync(abs, want);
    process.stdout.write(`wrote ${rel}\n`);
  }
  return code;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => !["--check", "--desktop"].includes(a));
  if (unknown.length) { process.stderr.write(`notices: unknown argument ${unknown.join(" ")}\n`); process.exit(2); }
  if (argv.includes("--desktop")) {
    const dest = writeNotices();
    console.log(JSON.stringify({ ok: true, dest, sources: NOTICE_SOURCES.length }));
  } else process.exit(syncCommitted(ROOT, { check: argv.includes("--check") }));
}
