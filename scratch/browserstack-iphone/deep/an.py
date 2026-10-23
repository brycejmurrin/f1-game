import json,sys,glob
for f in sys.argv[1:]:
  d=json.load(open(f)); print('\n=====',d['tag'],d.get('session'),d.get('startPT'),'err',d.get('error'),'reload',d.get('reloadedAfterBoot'))
  g=d.get('gfxRace') or d.get('gfx') or {}; print(' gfx',{k:g.get(k) for k in ['liveBackend','preset','renderScale','tier','autoTier','userTier','dpr','vp']})
  for s in d['steps']+[dict(x,name='soak%d'%x['ix']) for x in d.get('soak',[])]:
    print(' ##',s['name'],s['ms'],{k:s.get(k) for k in ['entryMs','avgFps','p5Fps','p1Fps','gt33','gt50','worstMs','gapsTotalMs','gapsN','buckets','error'] if s.get(k) is not None})
    if s.get('perf'): print('   perf mean',{k:v['mean'] for k,v in s['perf'].items()})
    r=s.get('render') or {}
    if r: 
      m=r.get('mem') if isinstance(r.get('mem'),dict) else {}
      print('   render',{k:r.get(k) for k in ['scale','tier','autoTier','floorMs','heapMB']}, 'mem', {k:m.get(k) for k in ['calls','draws','progs','rGeo','rTex','presentMs','resources','size']} if m else r.get('mem'))
    if 'stages' in s and s['stages']: print('   stages',[(x['n'],x['ms']) for x in s['stages'].get('stages',[])]); print('   gaps',s.get('gapsTop',[])[:8])
    if 'gaps' in s: print('   gaps',s['gaps'][:6],'res',(s.get('res') or {}).get('by'))
