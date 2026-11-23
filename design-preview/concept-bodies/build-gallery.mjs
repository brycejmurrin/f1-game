import fs from "node:fs";
import { lowerEnvelope } from "./envelope-limits.mjs";
const b64ab = (f) => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
const G = process.env.GAL || "scratch/d1d/gal/", b64 = (f) => "data:image/jpeg;base64," + fs.readFileSync(G + f).toString("base64");
const env = JSON.parse(fs.readFileSync("scratch/d1d/env.json" /* node design-preview/concept-bodies/envelope.mjs --json > scratch/d1d/env.json */, "utf8"));
const ceiling = lowerEnvelope(env.p75);
const R = (process.env.ROUND || "1"), SHA = process.env.SHA || "", FIT = JSON.parse(process.env.FIT || "{}"), SIDE = JSON.parse(process.env.SIDE || "{}");
const BODIES = [
  ["rift", "Rift", "Narrow pod front over a deep sculpted undercut, a dark teardrop scoop on the pod shoulder behind the inlet, pointed nose."],
  ["keel", "Keel", "Wide slab-sided pods that run straight back with a flat, low shoulder and a shallow belly; long flat nose."],
  ["delta", "Delta", "Wedge pods (high, wide front stepping down), a triangular dark cut-in on each flank, chined nose ridges."],
  ["serpent", "Serpent", "S-line pod top that dips mid-car and rises again at the tail, with a dark band climbing along it."],
];
const keys = ["n2.2h", "n1.9w", "pod0.2w", "pod0.2top", "cov-0.95"], lab = { "n2.2h": "nose depth @2.2", "n1.9w": "nose width @1.9", "pod0.2w": "pod half-width", "pod0.2top": "pod top", "cov-0.95": "cover top" };
const SBS = process.env.SBS;   // dir of <id>-front.jpg / <id>-rear.jpg: sheet crop | in-game, same camera
const sbs = (id) => SBS ? `<div class="sbs">${["front", "rear"].map((v) => `<figure><img src="${b64ab(SBS + "/" + id + "-" + v + ".jpg")}" alt="${id} ${v}: sheet left, in-game right"><figcaption>${v === "front" ? "front 3/4" : "rear"} · sheet (left) vs in-game through the camera solved from the sheet, fin off</figcaption></figure>`).join("")}</div>` : "";
const card = ([id, name, blurb]) => `<section class="body" id="${id}"><header><h2>${name}</h2><p>${blurb}</p></header>${sbs(id)}
<div class="views">${["front34", "rear34", "side"].map((v) => `<figure><img src="${b64(`${id}-${v}.jpg`)}" alt="${name} ${v}" loading="lazy"><figcaption>${{ front34: "front 3/4", rear34: "rear 3/4", side: "side" }[v]}</figcaption></figure>`).join("")}</div>
<dl class="nums"><div><dt>fit NEW / WORSE</dt><dd>${FIT[id] || "–"}</dd></div><div><dt>side Δ vs team</dt><dd>${SIDE[id] || "–"}</dd></div>${keys.map((k) => `<div><dt>${lab[k]}</dt><dd>${env.rows[id].dims[k]} <small>/ ceiling ${ceiling[k]} mm</small></dd></div>`).join("")}</dl></section>`;
const html = `<title>Concept Bodies Gallery</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
/* layout: one band per body, three garage frames in a row, a measurement strip under each */
:root{--bg:#e9eaec;--panel:#f7f7f8;--fg:#17181b;--muted:#5d6068;--line:#c9cbd0;--gold:#b77a06;
--display:"Barlow Condensed","Arial Narrow",sans-serif;--body:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121316;--panel:#1b1c20;--fg:#e8e9ec;--muted:#9a9da6;--line:#33353b;--gold:#e5a21a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121316;--panel:#1b1c20;--fg:#e8e9ec;--muted:#9a9da6;--line:#33353b;--gold:#e5a21a;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.5 var(--body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 48px}
main{max-width:1180px;margin:0 auto;display:grid;gap:28px}
h1,h2{font-family:var(--display);letter-spacing:.02em;text-wrap:balance;margin:0}
h1{font-size:2.1rem;text-transform:uppercase}h1 span{color:var(--gold)}
h2{font-size:1.6rem;text-transform:uppercase}
.intro{display:grid;gap:10px;max-width:72ch}.intro p{margin:0;color:var(--muted)}
.state{border-left:3px solid var(--gold);padding:8px 12px;background:var(--panel)}
.ref img{width:100%;border-radius:4px;border:1px solid var(--line)}
.ref figcaption,figcaption{font:12px var(--mono);color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.body{display:grid;gap:12px;padding-top:18px;border-top:1px solid var(--line)}
.body header{display:grid;gap:4px}.body header p{margin:0;color:var(--muted);max-width:70ch}
.sbs{display:grid;gap:10px}.sbs img{width:100%;display:block;border-radius:3px}
.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
figure{margin:0;display:grid;gap:4px}figure img{width:100%;border-radius:3px;display:block}
.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0}
.nums div{background:var(--panel);padding:8px 10px;border-radius:3px}
dt{font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}dd{margin:2px 0 0;font:500 1rem var(--body);font-variant-numeric:tabular-nums}dd small{color:var(--muted);font-weight:400}
@media (max-width:720px){.views{grid-template-columns:1fr}}
</style>
<main>
<div class="intro"><h1>Concept bodies <span>· round ${R}</span></h1>
<p>Rift, Keel, Delta and Serpent as BODY styles, from the concept sheet below. In-game garage renders, TLX, the Chrome catalog livery in gloss (silver body, black wings, gold accent, no sponsors), closest to the sheet. Wings are the aero lane's (D3c); these frames show the body shells only. Branch <code>cursor/design-bodies-aero-d1d-4047</code>${SHA ? " @" + SHA : ""}, PR #3162.</p>
<p class="state">${process.env.STATE || ""}</p></div>
<figure class="ref"><img src="${b64("ref.jpg")}" alt="Concept sheet: Rift, Keel, Delta, Serpent"><figcaption>Bryce's concept sheet (reference)</figcaption></figure>
${BODIES.map(card).join("\n")}
<p class="intro" style="color:var(--muted)">Fit: car-fit-audit --bodies, each body against a zero-offset body on the same team car (a body replaces the team's own style numbers, so that is its fair base). None of the #3156 hood↔chassis, cockpit↔engineCover or bolster↔sidepod overlaps. Sizes: design-preview/concept-bodies/measure.mjs, millimetres, ceiling = the lower of the current shipped p75 and the frozen #3160 measurements.</p>
</main>`;
fs.writeFileSync("scratch/d1d/concept-bodies.html", html);
console.log((html.length / 1024 | 0) + " KB");
