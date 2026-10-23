// Post-process the multi-file report into one self-contained HTML (WebP q80 data URIs, lightbox instead of relative links).
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path";
const sharp = createRequire("/home/box/mcp/apex-f1/package.json")("sharp");
const DIR = "/workspace/f1-game-explore/scratch/live-ui-findings-2026-10-22";
const OUT = "/workspace/apex-status/live-ui-report/live-ui-findings-2026-10-22.single.html";
let html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const cache = new Map();
const uri = async rel => { if (!cache.has(rel)) cache.set(rel, "data:image/webp;base64," + (await sharp(path.join(DIR, rel)).webp({ quality: 80 }).toBuffer()).toString("base64")); return cache.get(rel); };
// unwrap <a href="relative"> around images; keep in-page #anchors
html = html.replace(/<a href="(?:shots|crops)\/[^"]+"(?: target="_blank")?>(<img[^>]*>)<\/a>/g, "$1");
for (const m of [...html.matchAll(/src="((?:shots|crops)\/[^"]+)"/g)]) html = html.split(`src="${m[1]}"`).join(`src="${await uri(m[1])}"`);
html = html.replace(/loading="lazy" /g, "").replace(/click to open full size/g, "tap to zoom");
const lb = `<div id="lb" hidden><img alt="Zoomed screenshot"></div><style>#lb{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:12px;cursor:zoom-out;overflow:auto}#lb[hidden]{display:none}#lb img{max-width:none;width:auto;height:auto;max-height:none}main img{cursor:zoom-in}</style><script>(()=>{const lb=document.getElementById('lb'),im=lb.querySelector('img');document.querySelectorAll('main img').forEach(i=>i.addEventListener('click',()=>{im.src=i.src;im.style.maxWidth=innerWidth<700?'none':'100%';lb.hidden=false}));lb.addEventListener('click',()=>{lb.hidden=true;im.removeAttribute('src')});addEventListener('keydown',e=>{if(e.key==='Escape')lb.hidden=true})})();</script>`;
html = html.replace("</body>", lb + "</body>");
fs.writeFileSync(OUT, html);
const bad = [...html.matchAll(/(?:href|src)="(?!#|data:image\/webp)[^"]*"/g)].map(m => m[0]);
console.log("bytes", fs.statSync(OUT).size, "images", cache.size, "nonlocal refs", bad, "svg-data-uri", /data:image\/svg\+xml/.test(html), "http in url()", /url\(\s*['"]?http/.test(html));
