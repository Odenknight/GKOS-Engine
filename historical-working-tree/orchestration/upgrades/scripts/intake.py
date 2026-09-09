"""Read/hash original Markdown and recover locally available Git objects without network."""
from pathlib import Path
import hashlib, json, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'upgrades' / 'reports'
OUT.mkdir(parents=True, exist_ok=True)

def inventory():
    records = []
    for path in sorted(ROOT.rglob('*.md')):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith('upgrades/') or '.git' in path.parts:
            continue
        data = path.read_bytes()
        text = data.decode('utf-8', errors='replace')
        dependency = any(p in {'node_modules', 'target', 'hindsight-audit-venv', 'npm-cache', 'pip-cache'} for p in path.parts)
        lane = next((p for p in path.parts if p in {'engine-audit','standard-audit','product-audit','observatory-audit'}), 'orchestrator')
        records.append(dict(path=rel, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data),
                            classification='third_party_dependency' if dependency else 'project_document', reviewer=lane,
                            headings=[s for s in text.splitlines() if s.startswith('#')][:100]))
    (OUT / 'markdown-intake.json').write_text(json.dumps({'scope':'Original orchestration tree; generated upgrades excluded', 'files':records}, indent=2)+'\n', encoding='utf-8')
    from collections import Counter
    print(json.dumps({'files':len(records),'classification':dict(Counter(r['classification'] for r in records)), 'lanes':dict(Counter(r['reviewer'] for r in records if r['classification']=='project_document'))}))

def objects(target, donor):
    def git(cwd, *args, input=None):
        return subprocess.run(['git','-C',str(cwd),*args], input=input, capture_output=True)
    missing = [line[1:] for line in git(target,'rev-list','--objects','--all','--missing=print').stdout.decode().splitlines() if line.startswith('?')]
    copied, unavailable = [], []
    for oid in missing:
        typ = git(donor,'cat-file','-t',oid)
        if typ.returncode:
            unavailable.append(oid)
            continue
        kind = typ.stdout.decode().strip()
        body = git(donor,'cat-file',kind,oid)
        if body.returncode:
            unavailable.append(oid)
            continue
        saved = git(target,'hash-object','-w','-t',kind,'--stdin',input=body.stdout)
        if saved.returncode or saved.stdout.decode().strip()!=oid:
            raise RuntimeError('Git object import identity mismatch')
        copied.append(oid)
    print(json.dumps({'target':str(target),'missing':len(missing),'copied':len(copied),'unavailable':len(unavailable)}))
    (OUT / (Path(target).name+'-object-recovery.json')).write_text(json.dumps({'donor':str(donor),'copied':copied,'unavailable':unavailable}, indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':
    if len(sys.argv)==1: inventory()
    elif sys.argv[1]=='objects': objects(Path(sys.argv[2]),Path(sys.argv[3]))
    else: raise SystemExit('Unknown command')
