import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire("/workspace/f1-game-explore/package.json");
const sharp = require("sharp");
const SRC = "/workspace/apex-status/live-pages-2026-10-22";
const OUT = "/workspace/f1-game-explore/scratch/live-ui-findings-2026-10-22";
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["shots", "crops"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const SHA = "9f9db7fc4", URL_ = "https://brycejmurrin.github.io/f1-game/?apex";
// cov: covered PR/agent or "new"
const ISSUES = [
 { sec:"garage", id:"g-budget", shot:"g-garage-844x390.png", box:[385,62,118,70], vp:"844×390 phone landscape", sev:"medium",
   title:"Budget line wraps to 3 lines", sym:"“FREE BUILD — no budget limit” breaks into three ragged lines beside the FREE BUILD: ON chip.", sel:"#cs-budget", ref:"css/carsetup.css:227 (compact rule :491)", cov:"new" },
 { sec:"garage", id:"g-picker", shot:"g-teampicker-844x390.png", box:[10,248,812,70], vp:"844×390 phone landscape", sev:"medium",
   title:"Team picker cuts off row 3", sym:"Driver names wrap to two lines, so cards grow and the third row (Haas, Williams, Audi) is clipped under the footer. #sel-teams scrollHeight 448 vs clientHeight 256.", sel:"#sel-teams", ref:"css/select.css:798", cov:"new" },
 { sec:"garage", id:"g-tabs", shot:"g-tabs-end-390x844.png", box:[36,245,316,51], vp:"390×844 phone portrait", sev:"low",
   title:"Tab strip: 15 tabs in 290px", sym:"Strip is 2002px wide inside 290px; labels are cut mid-word (“HEELS”) at the edge and the active tab isn't auto-scrolled into view.", sel:"#cs-tabs", ref:"css/carsetup.css:392", cov:"new" },
 { sec:"garage", id:"g-photo", shot:"g-photo-390x844.png", box:[12,478,366,282], vp:"390×844 phone portrait", sev:"medium",
   title:"Photo Studio shows one control", sym:"Panel starts at 58svh; only SUBJECT fits. Room / crew rows sit at y 859–999, below the fold.", sel:"#photo-studio", ref:"css/photo-studio.css:79", cov:"#3482" },
 { sec:"hud", id:"h-clean", shot:"h-clean-1280x720.png", box:[500,628,200,90], vp:"1280×720 desktop", sev:"high",
   title:"CLEAN: speed sits on AERO ZONE", sym:"#hud-speed “0 KPH” overlaps the AERO ZONE chip.", sel:"#hud-speed", ref:"js/ui/hud-layout.js:168", cov:"#3524" },
 { sec:"hud", id:"h-big", shot:"h-big-1280x720.png", box:[400,590,200,120], vp:"1280×720 desktop", sev:"high",
   title:"BIG: speed collides with gear dock", sym:"hud-speed × hud-gear 657px², dock × gear 3389px², dock × tach 4837px²; position box overlaps both gap chips (617px²).", sel:"#hud-speed, #hud-gear, #hud-tach", ref:"js/ui/hud-layout.js:170", cov:"#3524" },
 { sec:"hud", id:"h-announce", shot:"h-shipped-844x390.png", box:[426,62,200,80], vp:"844×390 phone landscape", sev:"high",
   title:"Radio card covers sector times", sym:"Team radio card overlaps the S1–S3 column and its quote text is clipped (“RACE STILL…”).", sel:"#announce", ref:"css/hud.css:19", cov:"new" },
 { sec:"menus", id:"m-daily", shot:"m-title-844x390.png", box:[350,86,480,46], vp:"844×390 phone landscape", sev:"low",
   title:"DAILY tile loses its layout", sym:"#mb-daily is left-aligned, icon jammed against text, subtitle hidden; PRACTICE / GARAGE row leaves two empty cells.", sel:"#mb-daily (.menu-destination)", ref:"css/menu-destinations.css:17–23", cov:"new" },
 { sec:"menus", id:"m-career-l", shot:"m-career-844x390.png", box:[10,40,812,284], vp:"844×390 phone landscape", sev:"low",
   title:"Career column 1100px tall", sym:"#cr-left measures 1100px in a 390px viewport (overflow visible); only one slot fits above the footer.", sel:"#cr-left", ref:"css/career.css:83", cov:"D·W16" },
 { sec:"menus", id:"m-career-d", shot:"m-career-1280x720.png", box:[130,90,490,560], vp:"1280×720 desktop", sev:"low",
   title:"Career column clips 5px", sym:"#cr-left scrollWidth 491 > clientWidth 486 with overflow-x hidden.", sel:"#cr-left", ref:"css/career.css:112", cov:"D·W16" },
];
const OK = [
 ["garage","g-garage-390x844.png","Sticky footer CLOSE GARAGE stays in view (y 585–654)","#cs-inner > .sheet-foot","css/carsetup.css:140","390×844"],
 ["garage","g-garage-844x390.png","Footer folds into the header (CLOSE GARAGE at y 42)","#cs-done","css/carsetup.css:1002","844×390"],
 ["garage","g-livery-844x390.png","Livery cards readable","#cs-options","—","844×390"],
 ["garage","g-garage-1280x720.png","Desktop garage: vertical tab rail","#cs-tabs","css/carsetup.css:344","1280×720"],
 ["hud","h-shipped-1280x720.png","SHIPPED preset: only the intended energy fill/number overlap","#hud","—","1280×720"],
 ["hud","h-shipped-s70-1280x720.png","70% HUD scale: labels ~11px on desktop (touch base 14px → 9.8px; #3524 adds 10px floor)",".hud-label","css/hud.css:101","1280×720"],
 ["hud","h-shipped-844x390.png","#hud-speed floats beside the gear dock (y 277)","#hud-speed","css/touch-controls.css:620","844×390"],
 ["menus","m-title-1280x720.png","Title menu","#menu-buttons","css/menu-destinations.css:78","1280×720"],
 ["menus","m-title-390x844.png","Title menu, portrait","#menu-buttons","css/menu-destinations.css:78","390×844"],
 ["menus","m-settings-844x390.png","Settings: search + categories visible","#settings","js/ui/settings-tabs.js:141","844×390"],
 ["menus","m-career-390x844.png","Career portrait scrolls (#cr-left 1321px, minor)","#cr-left","css/career.css:83","390×844"],
];
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const RED = "#ff1e00";
async function boxed(file, box, out) {
  const img = sharp(path.join(SRC, file)); const m = await img.metadata();
  const [x,y,w,h] = box;
  const svg = `<svg width="${m.width}" height="${m.height}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${RED}" stroke-width="4" rx="6"/></svg>`;
  await sharp(path.join(SRC, file)).composite([{ input: Buffer.from(svg) }]).png().toFile(out);
  const p = 24, cx = Math.max(0,x-p), cy = Math.max(0,y-p), cw = Math.min(m.width-cx, w+2*p), ch = Math.min(m.height-cy, h+2*p);
  const scale = Math.min(3, 900 / cw);
  const crop = await sharp(out).extract({ left:cx, top:cy, width:cw, height:ch }).resize(Math.round(cw*scale), Math.round(ch*scale), { kernel:"lanczos3" }).png().toBuffer();
  return { crop, w:m.width, h:m.height };
}
const cards = {};
for (const it of ISSUES) {
  const shotOut = path.join(OUT, "shots", it.id + ".png");
  const r = await boxed(it.shot, it.box, shotOut);
  fs.writeFileSync(path.join(OUT, "crops", it.id + ".png"), r.crop);
  it.w = r.w; it.h = r.h;
}
for (const o of OK) fs.copyFileSync(path.join(SRC, o[1]), path.join(OUT, "shots", "ok-" + o[1]));
const SECS = [["garage","Garage & livery"],["hud","HUD & race"],["menus","Menus, career & settings"],["perf","Performance"]];
const badge = c => c === "new" ? `<span class="b new">NEW</span>` : `<span class="b cov">COVERED · ${esc(c)}</span>`;
const card = it => `<article class="issue" id="${it.id}">
 <header><span class="sev ${it.sev}">${it.sev.toUpperCase()}</span>${badge(it.cov)}<h3>${esc(it.title)}</h3></header>
 <p class="sym">${esc(it.sym)}</p>
 <dl><div><dt>Viewport</dt><dd>${esc(it.vp)}</dd></div><div><dt>Selector</dt><dd><code>${esc(it.sel)}</code></dd></div><div><dt>Source @${SHA}</dt><dd><code>${esc(it.ref)}</code></dd></div></dl>
 <figure class="crop"><a href="crops/${it.id}.png" target="_blank"><img src="crops/${it.id}.png" alt="Zoomed crop: ${esc(it.title)}"></a><figcaption>Problem area, zoomed</figcaption></figure>
 <figure class="full"><a href="shots/${it.id}.png" target="_blank"><img src="shots/${it.id}.png" width="${it.w}" height="${it.h}" loading="lazy" alt="Full screenshot ${esc(it.vp)}: ${esc(it.title)}"></a><figcaption>Full ${it.w}×${it.h} capture, red box marks the problem · click to open full size</figcaption></figure>
</article>`;
// perf charts
const LT = [227,212,206,166,83,73,71], ltRest = 1269 - LT.reduce((a,b)=>a+b,0);
const bars = (rows, max, unit, ref) => { const H = 30*rows.length+30; return `<svg viewBox="0 0 640 ${H}" class="chart" role="img">${ref?`<line x1="${150+ref/max*460}" x2="${150+ref/max*460}" y1="0" y2="${H-20}" class="ref"/><text x="${154+ref/max*460}" y="${H-6}" class="t">${ref} ${unit} long-task line</text>`:""}${rows.map(([l,v,c],i)=>`<text x="140" y="${i*30+20}" text-anchor="end" class="t">${esc(l)}</text><rect x="150" y="${i*30+6}" height="20" width="${Math.max(2,v/max*460)}" rx="3" fill="${c||RED}"/><text x="${156+v/max*460}" y="${i*30+21}" class="v">${v} ${unit}</text>`).join("")}</svg>`; };
const ltChart = bars([...LT.map((v,i)=>[`load task ${i+1}`,v]), [`4 more (sum)`, ltRest, "#777"], ["race task max",88,"#ffb000"]], 280, "ms", 50);
const ftChart = `<svg viewBox="0 0 640 230" class="chart" role="img">${[["Menu idle 5s",[17,17,33]],["Race 10s",[17,17,100]],["renderScale 600f",[16.7,16.8,216.7]]].map(([l,v],i)=>{const y=i*70+10;const s=x=>150+Math.min(x,260)/260*400;return `<text x="140" y="${y+28}" text-anchor="end" class="t">${l}</text><line x1="${s(0)}" x2="${s(v[2])}" y1="${y+24}" y2="${y+24}" class="whisk"/><rect x="${s(0)}" y="${y+12}" width="${s(v[1])-150}" height="24" fill="#3a3f47"/><rect x="${s(v[0])-2}" y="${y+8}" width="4" height="32" fill="${RED}"/><circle cx="${s(v[2])}" cy="${y+24}" r="6" fill="#ffb000"/><text x="${s(v[2])+10}" y="${y+28}" class="v">max ${v[2]}</text><text x="${s(v[0])+6}" y="${y+54}" class="t">p50 ${v[0]} · p95 ${v[1]} ms</text>`;}).join("")}<line x1="${150+16.7/260*400}" x2="${150+16.7/260*400}" y1="0" y2="215" class="ref"/><text x="${154+16.7/260*400}" y="226" class="t">16.7 ms = 60 fps</text></svg>`;
const rfChart = bars([["readCssRgbFrom",17],["screenBounds",16],["observe",12],["shownLayer",11],["classifyBody",8],["create (hud)",8],["usablePad",7],["show (settings)",6]], 20, "ms");
const nNew = ISSUES.filter(i=>i.cov==="new").length;
const perSec = s => ISSUES.filter(i=>i.sec===s);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Apex 26 · Live UI findings · 2026-10-22</title><style>
:root{--bg:#0d0f12;--p:#16191e;--p2:#1e2228;--line:#2b3038;--tx:#eef1f4;--mu:#9aa3ad;--red:${RED};--amb:#ffb000;--grn:#2fd27a;--cy:#36c5f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--cy)}code{font:13px/1.4 ui-monospace,Menlo,monospace;background:#0a0c0f;padding:2px 6px;border-radius:4px;overflow-wrap:anywhere}
.top{border-bottom:3px solid var(--red);background:linear-gradient(90deg,#1a0d0b,#0d0f12 60%);padding:28px clamp(16px,4vw,48px)}
.kick{letter-spacing:.2em;color:var(--red);font-weight:800;font-size:13px;margin:0}
h1{font-style:italic;font-weight:900;font-size:clamp(30px,6vw,56px);margin:6px 0;line-height:1.05}
.meta{color:var(--mu);font-size:14px;margin:0}
nav.toc{position:sticky;top:0;z-index:5;background:rgba(13,15,18,.95);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px;padding:10px clamp(16px,4vw,48px)}
nav.toc a{color:var(--tx);text-decoration:none;padding:6px 12px;border:1px solid var(--line);border-radius:999px;font-size:14px}
main{max-width:1180px;margin:auto;padding:0 clamp(12px,3vw,32px) 60px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}
.stat{background:var(--p);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:10px;padding:14px 16px}.stat b{display:block;font-size:34px;font-style:italic;line-height:1}.stat span{color:var(--mu);font-size:13px}
.summary{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 24px}.summary td,.summary th{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}.summary th{color:var(--mu);font-weight:600}
.tw{overflow-x:auto}
h2{font-style:italic;font-weight:900;font-size:clamp(24px,4vw,34px);margin:48px 0 6px;scroll-margin-top:64px;border-left:6px solid var(--red);padding-left:12px}
.lede{color:var(--mu);margin:0 0 18px}
.issue{background:var(--p);border:1px solid var(--line);border-radius:14px;padding:clamp(14px,2.5vw,24px);margin:18px 0;scroll-margin-top:64px}
.issue header{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.issue h3{flex-basis:100%;margin:6px 0 0;font-size:clamp(19px,3vw,24px)}
.sym{font-size:17px;margin:10px 0}
.b,.sev{font-size:12px;font-weight:800;letter-spacing:.08em;padding:3px 10px;border-radius:999px}
.b.new{background:var(--red);color:#fff}.b.cov{background:#12321f;color:var(--grn);border:1px solid #1f6b40}
.sev{border:1px solid var(--line);color:var(--mu)}.sev.high{color:#ff6b57;border-color:#6b2219}.sev.medium{color:var(--amb);border-color:#5e4610}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 18px;margin:12px 0 16px}dt{color:var(--mu);font-size:12px;text-transform:uppercase;letter-spacing:.08em}dd{margin:2px 0 0}
figure{margin:12px 0}figure img{display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid var(--line);background:#000}
.crop img{border:2px solid var(--red)}figcaption{color:var(--mu);font-size:13px;margin-top:6px}
.full img{width:100%;cursor:zoom-in}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:16px}
.cbox{background:var(--p);border:1px solid var(--line);border-radius:14px;padding:16px}.cbox h3{margin:0 0 8px;font-size:17px}
.chart{width:100%;height:auto}.chart .t{fill:var(--mu);font-size:15px}.chart .v{fill:var(--tx);font-size:15px;font-weight:700}.chart .ref{stroke:var(--mu);stroke-dasharray:4 4}.chart .whisk{stroke:#555;stroke-width:2}
.note{background:#211a08;border:1px solid #5e4610;color:#ffd77a;border-radius:10px;padding:12px 16px}
details.ok{background:var(--p);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-top:40px}details.ok summary{cursor:pointer;font-weight:800;font-size:18px}
.okg{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;margin-top:14px}.okg figure{background:var(--p2);border-radius:10px;padding:10px;margin:0}.okg p{margin:6px 0 0;font-size:14px}
@media(max-width:700px){nav.toc{position:static}}
.gaps li{margin:4px 0;color:var(--mu)}
</style></head><body>
<div class="top"><p class="kick">APEX 26 · LIVE BUILD UI REVIEW</p><h1>${ISSUES.length} issues on the live build</h1>
<p class="meta">${esc(URL_)} · deploy tip ${SHA} (build 20566) · captured 2026-10-22 PT with Playwright + Chrome DevTools · SwiftShader (no GPU)</p></div>
<nav class="toc">${SECS.map(([k,l])=>`<a href="#${k}">${l}${k!=="perf"?` · ${perSec(k).length}`:""}</a>`).join("")}<a href="#ok">OK items · ${OK.length}</a></nav>
<main>
<div class="stats"><div class="stat"><b>${ISSUES.length}</b><span>issues found</span></div><div class="stat"><b>${nNew}</b><span>new (no Fleet D owner)</span></div><div class="stat" style="border-left-color:var(--grn)"><b>${ISSUES.length-nNew}</b><span>already covered by Fleet D</span></div><div class="stat" style="border-left-color:var(--amb)"><b>227 ms</b><span>worst long task (race load)</span></div></div>
<div class="tw"><table class="summary"><tr><th>Issue</th><th>Area</th><th>Viewport</th><th>Status</th></tr>${ISSUES.map(i=>`<tr><td><a href="#${i.id}">${esc(i.title)}</a></td><td>${esc(SECS.find(s=>s[0]===i.sec)[1])}</td><td>${esc(i.vp.split(" ")[0])}</td><td>${badge(i.cov)}</td></tr>`).join("")}</table></div>
<p class="meta">Coverage: #3524 HUD presets · #3482 Photo Studio · D·W16 Career agent. W18 hunter coverage was not checked, so anything marked NEW may already be on a hunter's list.</p>
${SECS.filter(s=>s[0]!=="perf").map(([k,l])=>`<h2 id="${k}">${l}</h2><p class="lede">${perSec(k).length} issues · ${perSec(k).filter(i=>i.cov==="new").length} new</p>${perSec(k).map(card).join("")}`).join("")}
<h2 id="perf">Performance</h2><p class="lede">1280×720 · Chrome DevTools trace + in-page PerformanceObserver/rAF sampling</p>
<p class="note">Box has no GPU: WebGL/WebGPU run on SwiftShader (CPU). Absolute times are inflated and 60 fps is vsync-capped. Read these as relative hotspots, not device budgets.</p>
<div class="stats"><div class="stat"><b>1196 ms</b><span>LCP (render delay 1184)</span></div><div class="stat" style="border-left-color:var(--grn)"><b>0.01</b><span>CLS</span></div><div class="stat"><b>1269 ms</b><span>long tasks during Monza load (11)</span></div><div class="stat" style="border-left-color:var(--amb)"><b>38 ms</b><span>forced reflow at boot</span></div></div>
<div class="charts"><div class="cbox"><h3>Long tasks (ms)</h3>${ltChart}</div><div class="cbox"><h3>Frame time: p50 · p95 box, max dot (ms)</h3>${ftChart}</div><div class="cbox"><h3>Forced reflow at boot, by function (ms)</h3>${rfChart}</div></div>
<p class="meta">Frame-time chart uses the sampled percentiles (raw per-frame series wasn't kept). The race trace returned no insights. Reflow functions: appearance-opts.js:117, hud-layout.js:377, sheet-shape.js:299/382, layers.js:97, hud.js:48, dock-layout.js:64, settings-tabs.js:141.</p>
<details class="ok" id="ok"><summary>OK items (${OK.length}): checked, no action</summary><div class="okg">${OK.map(o=>`<figure><a href="shots/ok-${o[1]}" target="_blank"><img loading="lazy" src="shots/ok-${o[1]}" alt="${esc(o[2])}"></a><p>${esc(o[2])}</p><p class="meta">${esc(o[5])} · <code>${esc(o[3])}</code> · <code>${esc(o[4])}</code></p></figure>`).join("")}</div></details>
<h2 id="gaps" style="font-size:22px">Not captured</h2><ul class="gaps"><li>CORNERS preset screenshot timed out (30s, SwiftShader). DOM shows 16 overlaps and #hud-tach off-screen at x 1222–1394; covered by #3524.</li><li>Desktop team picker (1280×720) measured visible but didn't paint in the headless capture.</li><li>Race-view 3D scene renders black in some desktop HUD shots (SwiftShader); HUD overlays are unaffected.</li><li>apex-tools screenshot tools are local-only and refuse the deploy URL, so shots came from Playwright.</li></ul>
</main></body></html>`;
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log(OUT, fs.readdirSync(path.join(OUT,"shots")).length, fs.readdirSync(path.join(OUT,"crops")).length);
