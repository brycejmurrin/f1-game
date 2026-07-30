import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT="/home/user/f1-game";
const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".glb":"model/gltf-binary",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{"content-type":T[path.extname(f)]||"application/octet-stream"});r.end(d);});});
await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",args:["--use-angle=swiftshader"]});
const pg=await b.newPage({viewport:{width:1000,height:562}});
pg.on("pageerror",e=>console.error("PAGEERR",e.message));
await pg.goto(`http://127.0.0.1:${port}/`,{timeout:90000});
await pg.waitForFunction(()=>window.__apex!=null);
await pg.evaluate(()=>window.__apex.race("monza","day","dry"));
await pg.waitForFunction(()=>window.__apex.info().track==="monza",{timeout:90000});
await pg.evaluate(()=>window.__apex.go());
const out=await pg.evaluate(async ()=>{
  const rows=[];
  for (const cam of ["chase","cockpit","hood"]) {
    window.__apex.camera(cam);
    window.__apex.jump(0.20, 30, 0);
    window.__apex.setInput({steer:0,throttle:false,brake:false});
    for(let i=0;i<40;i++) window.__apex.step(1/60,1);
    window.__apex.clearInput();
    // let the camera damping actually converge (it eases toward the rig target)
    for (let i=0;i<120;i++) await new Promise(r=>requestAnimationFrame(r));
    const cs=window.__apex.camState();
    const car=window.__apex.carOrbit(0,0,10,5).target;   // true car world pos
    window.__apex.camera(cam);
    const ex=cs.eye[0], ez=cs.eye[2], tx=cs.tgt?cs.tgt[0]:cs.target[0], tz=cs.tgt?cs.tgt[2]:cs.target[2];
    // horizontal angle between (eye->target) and (eye->car): 0 = car dead centre
    const a1=Math.atan2(tx-ex,tz-ez), a2=Math.atan2(car[0]-ex,car[2]-ez);
    let d=a1-a2; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    rows.push({cam, offCentreDeg:+(d*180/Math.PI).toFixed(2),
               eyeToCar:+Math.hypot(car[0]-ex,car[2]-ez).toFixed(2)});
  }
  return rows;
});
console.table(out);
console.log("offCentreDeg ~0 => the rig points at the car (fov is 52-78 deg, so >26 puts it off screen)");
await b.close(); srv.close();
