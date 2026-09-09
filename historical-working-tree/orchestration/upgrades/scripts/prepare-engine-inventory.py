"""Orchestrator-only review tool. Runtime qualification never calls this tool."""
from pathlib import Path
import hashlib, json, subprocess

ROOT = Path(__file__).resolve().parents[1] / 'engine'
HISTORY = '97ae3560a4fa2e771b60fa63d6dc0349d0b4c864'
AUDITED = '8207958047b3361ae21ac07c5a2abbd26a42a684'
MANIFEST = 'contracts/runtime-qualification/v1/change-inventory.json'
def git(*args): return subprocess.check_output(['git','-C',str(ROOT),*args])
def tree(ref):
    entries={}
    for line in git('ls-tree','-r','-z',ref).split(b'\0'):
        if not line: continue
        head,path=line.split(b'\t',1)
        entries[path.decode()]=head.decode().split()[2]
    return entries
def digest(data): return hashlib.sha256(data).hexdigest()
def gitblob(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
prior, base=tree(HISTORY),tree(AUDITED)
frozen=[p for p in prior if p.startswith('contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1/') or p in ['scripts/generate-agent-identity-mcp-contract-draft1.mjs','test/agent-identity-mcp-contract.test.mjs','.github/workflows/phase6-identity-contract.yml']]
changed=sorted(set(p for p in prior.keys()|base.keys() if prior.get(p)!=base.get(p)))
actual=sorted(set(git('ls-files','-z','--cached','--others','--exclude-standard').decode().split('\0'))|set(base))
candidate=[]
for path in actual:
    if not path or path==MANIFEST: continue
    target=ROOT/path
    data=target.read_bytes() if target.exists() else None
    if base.get(path)==(gitblob(data) if data is not None else None): continue
    rationale='Q-GUARD: separate exact historical replay and versioned current-runtime evidence; no release qualification.'
    if path in ['src/service/mcp.ts','src/service/server.ts'] or 'freshness' in path or 'reference-integrity' in path:
        rationale='T01: fail-closed references and authorized snapshot continuations; retain established successful wire bytes.'
    candidate.append(dict(path=path,before=base.get(path),after=digest(data) if data is not None else None,rationale=rationale))
value=dict(version='gkos-current-runtime-qualification/1',historical=HISTORY,audited=AUDITED,
    historical_changes=[dict(path=p,before=prior.get(p),after=base.get(p),rationale='Existing audited main change, preserved as historical provenance; current behavior requires runtime tests.') for p in changed],
    frozen=[dict(path=p,sha256=digest(git('show',HISTORY+':'+p))) for p in sorted(frozen)],candidate_changes=candidate)
dest=ROOT/MANIFEST; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes((json.dumps(value,indent=2)+'\n').encode('utf-8'))
print(json.dumps({'historical_changes':len(changed),'frozen':len(frozen),'candidate_changes':len(candidate),'manifest_sha256':digest(dest.read_bytes())}))
