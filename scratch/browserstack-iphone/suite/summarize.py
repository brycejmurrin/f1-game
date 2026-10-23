import json,glob,sys
for f in sorted(glob.glob('results/*.json')):
  d=json.load(open(f))
  print('\n##',d['tag'],'session',d.get('session'),'boot',d.get('bootMs'),'reboot',d.get('rebootMs'),'track',d.get('trackId'),'err',d.get('error'))
  for k in ('gfxMenu','gfxRace','gfx'):
    g=d.get(k)
    if g: print(k,{x:g.get(x) for x in ('liveBackend','bound','fallbackWhy','preset','presetKey','gfxHigh','renderScale','tier','autoTier','userTier','autoRes')},'upscale',g.get('upscale'))
  for s in d['steps']:
    print(' ',{k:v for k,v in s.items()})
  print(' ap',d.get('ap1'),d.get('ap2'),'state',(d.get('info') or {}).get('state') if isinstance(d.get('info'),dict) else None)
  print(' errors',d.get('errors'),'\n logs',[l[:160] for l in (d.get('logs') or [])][-6:] if isinstance(d.get('logs'),list) else d.get('logs'))
