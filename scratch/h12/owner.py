import json,sys
s=json.load(open(sys.argv[1]))
m=s["snapshot"]["meta"]; nf=m["node_fields"]; ef=m["edge_fields"]; N=len(nf); E=len(ef)
nodes=s["nodes"]; edges=s["edges"]; strings=s["strings"]
ni=nf.index("name"); ii=nf.index("id"); eci=nf.index("edge_count")
eto=ef.index("to_node"); ename=ef.index("name_or_index"); etype=ef.index("type"); etypes=m["edge_types"][0]
acc=0
for k in range(len(nodes)//N):
    n=nodes[k*N+eci]
    for e in range(acc, acc+n*E, E):
        if etypes[edges[e+etype]]=="property" and strings[edges[e+ename]]=="__h12": print("TRACK", nodes[k*N+ii])
    acc+=n*E
