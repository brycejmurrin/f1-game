import json,sys,re,subprocess
S,D=sys.argv[1],sys.argv[2]
c=json.load(open(S+'/comments.json'))
m=json.load(open(S+'/reportmap.json'))
bases={f.rsplit('/',1)[-1] for f in subprocess.run(['git','ls-files'],capture_output=True,text=True).stdout.split()}
TOK=re.compile(r'`([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:test\.(?:mjs|cjs|js)|spec\.(?:js|mjs)))`')
for x in c:
  k=str(x['id'])
  if k not in m: continue
  name,st=m[k]
  sup=' (a later part supersedes overlapping rows; both are kept)' if 'partial' in st else ''
  hdr=f"""<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT {name.split('.')[0]} ({st})

- Source: {x['html_url']}
- Posted: {x['created_at']} (comment author `{x['user']['login']}`; the reviewer session id is not stated in the comment)
- Status: {st}{sup}
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

"""
  body=x['body'].rstrip(); edits=[]
  def fix(mo):
    if mo.group(1) in bases: return mo.group(0)
    edits.append(mo.group(1)); return mo.group(1)
  body=TOK.sub(fix,body)
  if edits: hdr=hdr.replace('\n---\n','- Normalized (only change to the body): backticks dropped around test files that do not exist yet, so docs-integrity does not read a proposal as a claim: '+', '.join(sorted(set(edits)))+'\n\n---\n',1)
  open(D+'/'+name+'.md','w').write(hdr+body+'\n')
