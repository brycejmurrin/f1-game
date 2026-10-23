import json,sys,collections
p=json.load(open(sys.argv[1])); target=sys.argv[2]
nodes={n['id']:n for n in p['nodes']}; parent={}
for n in p['nodes']:
  for c in n.get('children',[]): parent[c]=n['id']
t=collections.Counter(); dt=p['timeDeltas']
for i,s in enumerate(p['samples']): t[s]+=dt[i]
agg=collections.Counter()
for nid,us in t.items():
  if nodes[nid]['callFrame']['functionName']!=target: continue
  chain=[];x=parent.get(nid)
  while x and len(chain)<int(sys.argv[3] if len(sys.argv)>3 else 6):
    f=nodes[x]['callFrame']; chain.append(f"{f['functionName'] or '(anon)'}@{f['url'].split('/')[-1].split('?')[0]}:{f['columnNumber']}"); x=parent.get(x)
  agg[' < '.join(chain)]+=us
for k,v in agg.most_common(8): print(round(v/1000),'ms',k)
