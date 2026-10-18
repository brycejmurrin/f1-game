// Parent-only browser shim; no timers/GPU queries/readbacks are introduced.
// await page.evaluate(installRenderSubmitMetrics);
// await page.evaluate(() => { __renderSubmitMetrics.attach(window.renderer); __renderSubmitMetrics.start(); });
// ... wait until desired actual main-render counter, not N rAF callbacks ...
// const result=await page.evaluate(() => __renderSubmitMetrics.stop());
export function installRenderSubmitMetrics() {
  if (globalThis.__renderSubmitMetrics) return;
  let on=false, depth=0, mainRenders=0, failed=0, rows=new Map(), targets=new WeakMap(), nextTarget=0;
  const quantile=(a,q)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*q))]:null;
  const api=globalThis.__renderSubmitMetrics={
    attach(renderer) {
      if (!renderer || renderer.__renderSubmitMetricsAttached) return false;
      const original=renderer.render;
      renderer.render=function(scene,camera) {
        if (!on || depth) return original.apply(this,arguments);
        const target=this.getRenderTarget();
        let id=0;
        if(target){id=targets.get(target);if(!id){id=++nextTarget;targets.set(target,id);}}
        const name=target?.texture?.name||target?.name||'unnamed';
        const key=target?`${name} ${target.width}x${target.height} #${id}`:'canvas';
        const main=!!target&&name==='output'||!target&&scene?.isScene===true;
        const info=this.info.render,c0=info.drawCalls,t0=info.triangles;
        const start=performance.now();let completed=false;
        depth++;
        try {const out=original.apply(this,arguments);completed=true;return out;}
        finally {
          const elapsed=performance.now()-start;depth--;
          if(!completed){failed++;}
          else {
            const c1=info.drawCalls,t1=info.triangles;
            let row=rows.get(key);
            if(!row){row={key,name,width:target?.width??null,height:target?.height??null,main,renders:0,calls:0,triangles:0,submitWallMs:[]};rows.set(key,row);}
            row.renders++;row.calls+=c1>=c0?c1-c0:c1;row.triangles+=t1>=t0?t1-t0:t1;row.submitWallMs.push(elapsed);
            if(main)mainRenders++;
          }
        }
      };
      renderer.__renderSubmitMetricsAttached=true;return true;
    },
    start(){on=false;depth=0;mainRenders=0;failed=0;rows=new Map();targets=new WeakMap();nextTarget=0;on=true;},
    get mainRenders(){return mainRenders;},
    stop(){on=false;return {mainRenders,failedRenderCalls:failed,rows:[...rows.values()].map(r=>{
      const ms=r.submitWallMs, sum=ms.reduce((a,b)=>a+b,0);
      return {...r,submitWallMs:undefined,callsPerRender:r.calls/r.renders,trianglesPerRender:r.triangles/r.renders,
        callsPerMainRender:mainRenders?r.calls/mainRenders:null,trianglesPerMainRender:mainRenders?r.triangles/mainRenders:null,
        submitWallTotalMs:sum,submitWallMeanMs:sum/r.renders,submitWallP50Ms:quantile(ms,.5),submitWallP95Ms:quantile(ms,.95),
        submitWallMsPerMainRender:mainRenders?sum/mainRenders:null};}),
      scope:'Synchronous renderer.render wall duration and renderer-accounted geometry. Excludes async soft readback/putImageData after render, includes native submission waits inside render. This is neither GPU time nor pure JS self time. No shader stubbing. Main target is named output. Other target rows retain identity; classify mirror explicitly by captured target size/identity, not every unnamed target.',
      warning:'Window must start after warm and end at the same application phase in both arms. Require mainRenders>0, zero failed calls, matching dimensions/backend/tier/scale/fog/camera, and no source edits during either arm. No GPU timer samples are read or duplicated.'};},
  };
}
