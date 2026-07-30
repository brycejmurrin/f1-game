import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT="/home/user/f1-game", OUT=ROOT+"/scratch/captures/free-driving";
fs.mkdirSync(OUT,{recursive:true});
const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".glb":"model/gltf-binary",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{"content-type":T[path.extname(f)]||"application/octet-stream"});r.end(d);});});
await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",args:["--use-angle=swiftshader"]});
const pg=await b.newPage({viewport:{width:960,height:540}});
await pg.goto(`http://127.0.0.1:${port}/`,{timeout:90000});
await pg.waitForFunction(()=>window.__apex!=null);
await pg.evaluate(()=>window.__apex.race("monza","day","dry"));
await pg.waitForFunction(()=>window.__apex.info().track==="monza",{timeout:90000});
await pg.evaluate(()=>{window.__apex.go();window.__apex.hud(false);});
for (const cam of ["chase","cockpit","hood"]) {
  await pg.evaluate((c)=>{ window.__apex.camera(c); window.__apex.jump(0.05, 55, 0); }, cam);
  await pg.waitForTimeout(2000);            // let the camera ease settle
  await pg.screenshot({ path: path.join(OUT, cam+".png") });
  console.log("wrote", cam);
}
await b.close(); srv.close();
