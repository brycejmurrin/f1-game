import { Builder } from "selenium-webdriver";
import { writeFileSync } from "node:fs";
const [device, os] = [process.argv[2], process.argv[3]];
const tag = device.replace(/\s+/g,"-")+"-ios"+os;
const caps = { browserName:"safari", "bstack:options":{ deviceName:device, osVersion:os, realMobile:"true",
  userName:"REDACTED", accessKey:process.env.BROWSERSTACK_ACCESS_KEY, projectName:"Apex", buildName:"iphone-profiling-2026-10-21",
  sessionName:tag+"-landscape", video:"true", consoleLogs:"verbose", idleTimeout:180, deviceOrientation:"landscape" } };
const out = { device, os, tag };
const d = await new Builder().usingServer("https://hub-cloud.browserstack.com/wd/hub").withCapabilities(caps).build();
try {
  out.session = (await d.getSession()).getId();
  await d.manage().setTimeouts({ script: 150000, pageLoad: 120000 });
  const t0 = Date.now();
  await d.get("https://brycejmurrin.github.io/f1-game/?apex&t="+Date.now());
  // boot: wait for __apex.race
  let ok=false; for (let i=0;i<120;i++){ ok = await d.executeScript("return !!(window.__apex&&window.__apex.race)"); if(ok)break; await new Promise(r=>setTimeout(r,1000)); }
  out.bootMs = Date.now()-t0; out.booted = ok;
  out.preInfo = await d.executeScript(`try{const i=window.__apex&&__apex.info&&__apex.info();return JSON.parse(JSON.stringify(i||null))}catch(e){return String(e)}`);
  if (ok) {
    const t1 = Date.now();
    await d.executeScript("window.__bsErr=[];addEventListener('error',e=>__bsErr.push(String(e.message)));addEventListener('unhandledrejection',e=>__bsErr.push('rej:'+String(e.reason)));window.__raceP=Promise.resolve(__apex.race('monza')).then(()=>window.__raceDone=Date.now(),e=>window.__raceErr=String(e))");
    for (let i=0;i<120;i++){ const s = await d.executeScript("return window.__raceDone||window.__raceErr||null"); if(s)break; await new Promise(r=>setTimeout(r,1000)); }
    out.raceEntryMs = Date.now()-t1;
    out.raceErr = await d.executeScript("return window.__raceErr||null");
    out.perf = await d.executeAsyncScript(`const cb=arguments[arguments.length-1];const f=[];let last=performance.now();const end=last+75000;
      function tick(t){f.push(t-last);last=t;if(t<end)requestAnimationFrame(tick);else{const s=[...f].sort((a,b)=>a-b);const q=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];
      const avg=f.reduce((a,b)=>a+b,0)/f.length;cb({frames:f.length,avgFps:1000/avg,p5Fps:1000/q(0.95),p1Fps:1000/q(0.99),maxMs:s[s.length-1],long50:f.filter(x=>x>50).length,long100:f.filter(x=>x>100).length,
      heap:performance.memory?{used:performance.memory.usedJSHeapSize}:null});}}requestAnimationFrame(tick);`);
    out.info = await d.executeScript(`try{return JSON.parse(JSON.stringify(__apex.info()))}catch(e){return String(e)}`);
    out.backend = await d.executeScript(`return {gpu:!!navigator.gpu,pin:localStorage.getItem('apex26.gfxBackend'),dpr:devicePixelRatio,w:innerWidth,h:innerHeight,ua:navigator.userAgent}`);
    out.errors = await d.executeScript("return window.__bsErr");
  }
  writeFileSync(tag+".png", await d.takeScreenshot(), "base64");
  await d.executeScript(`browserstack_executor: {"action":"setSessionStatus","arguments":{"status":"${out.booted?'passed':'failed'}","reason":"profiling"}}`);
} catch(e){ out.error=String(e).slice(0,500); } finally { await d.quit().catch(()=>{}); }
writeFileSync(tag+".json", JSON.stringify(out,null,1)); console.log(JSON.stringify(out).slice(0,3000));
