"""Package reviewed local diffs; never commit, deploy, or edit a candidate index."""
from pathlib import Path
import atexit, hashlib, json, os, shutil, subprocess, uuid

ROOT = Path(__file__).resolve().parents[1]
FINAL = ROOT / 'deliverables'
OUT = ROOT / ('.deliverables-stage-' + uuid.uuid4().hex)
OUT.mkdir()
published={'value':False}
def cleanup_stage():
    if not published['value'] and OUT.exists() and OUT.resolve().parent == ROOT.resolve():
        shutil.rmtree(OUT)
atexit.register(cleanup_stage)
def sha(data): return hashlib.sha256(data).hexdigest()
def git(repo, *args, env=None):
    return subprocess.check_output(['git','-C',str(repo),*args],env=env)
consumer=json.loads((ROOT/'reports/consumer-source-ledger.json').read_text(encoding='utf-8'))
engine=json.loads((ROOT/'engine/contracts/runtime-qualification/v1/change-inventory.json').read_text(encoding='utf-8'))
specs={
 'engine':dict(base=engine['audited'],paths=[e['path'] for e in engine['candidate_changes']]+['contracts/runtime-qualification/v1/change-inventory.json']),
 'standard-r18':dict(base='aa9a05315a9a767bd672aa2bb5179c963d9d66ca',paths=[
  'conformance/runner/authority-window.mjs','conformance/runner/canonical.mjs','conformance/runner/gate-evaluator.mjs',
  'conformance/runner/registry-lint.mjs','conformance/runner/test/canonical-replay.test.mjs',
  'conformance/runner/canonical-time.mjs','conformance/runner/test/fail-closed-inputs.test.mjs',
  'conformance/runner/test/track-a-evidence.test.mjs','conformance/runner/track-a-evidence.mjs']),
 'kosmos':dict(base=consumer['kosmos']['git_base'],paths=[x['path'] for x in consumer['kosmos']['changed']]),
 'observatory':dict(base='8da1d2239a9ce0af5570fe1bfa264934d8aabbe4',git_base=consumer['observatory']['git_base'],paths=[x['path'] for x in consumer['observatory']['changed']]),
}
lite_manifest=ROOT/'reports/lite-package-paths.json'
if lite_manifest.exists(): specs['lite']=json.loads(lite_manifest.read_text(encoding='utf-8'))
manifest={'version':'gkos-isolated-upgrades/1','status':'local-candidates-not-release-qualified','repositories':{}}
for name,spec in specs.items():
    repo=ROOT/name; head=git(repo,'rev-parse','HEAD').decode().strip()
    assert head==spec.get('git_base',spec['base']), (name,head)
    paths=sorted(set(spec['paths'])); records=[]
    # Rebuild the candidate payload from an empty directory so a reseal cannot
    # retain files removed from the new manifest.
    files_root=OUT/name/'files'
    if files_root.exists(): shutil.rmtree(files_root)
    files_root.mkdir(parents=True)
    for path in paths:
        target=repo/path
        assert target.is_file() and not target.is_symlink(), path
        data=target.read_bytes()
        before=subprocess.run(['git','-C',str(repo),'show',head+':'+path],capture_output=True)
        dest=files_root/path; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(data)
        records.append(dict(path=path,before_sha256=sha(before.stdout) if before.returncode==0 else None,after_sha256=sha(data),bytes=len(data)))
    # An isolated index includes new source/tests without staging any user changes.
    # Force text normalization so Windows worktree CRLF bytes do not become a
    # repository-wide line-ending rewrite in the portable patch.
    index=OUT/f'.{name}-index-{uuid.uuid4().hex}'
    env={**os.environ,'GIT_INDEX_FILE':str(index)}
    try:
        git(repo,'read-tree','HEAD',env=env)
        git(repo,'-c','core.autocrlf=true','add','--',*paths,env=env)
        patch=git(repo,'-c','core.autocrlf=true','diff','--cached','--binary','HEAD','--',*paths,env=env)
    finally:
        index.unlink(missing_ok=True)
        Path(str(index)+'.lock').unlink(missing_ok=True)
    patch_path=OUT/(name+'.patch'); patch_path.write_bytes(patch)
    # Prove the sealed patch against a second clean HEAD index. This catches
    # normalization defects that a reverse check against a dirty worktree can
    # conceal.
    verify_index=OUT/f'.{name}-verify-index-{uuid.uuid4().hex}'
    verify_env={**os.environ,'GIT_INDEX_FILE':str(verify_index)}
    try:
        git(repo,'read-tree','HEAD',env=verify_env)
        forward=subprocess.run(['git','-C',str(repo),'apply','--cached','--binary','--check',str(patch_path)],env=verify_env,capture_output=True)
        if forward.returncode: raise RuntimeError(name+': forward patch verification failed: '+forward.stderr.decode())
        applied=subprocess.run(['git','-C',str(repo),'apply','--cached','--binary',str(patch_path)],env=verify_env,capture_output=True)
        if applied.returncode: raise RuntimeError(name+': isolated index apply failed: '+applied.stderr.decode())
        whitespace=subprocess.run(['git','-C',str(repo),'-c','core.autocrlf=true','diff','--cached','--check'],env=verify_env,capture_output=True)
        if whitespace.returncode: raise RuntimeError(name+': normalized diff check failed: '+whitespace.stdout.decode()+whitespace.stderr.decode())
        for record in records:
            staged=git(repo,'show',':'+record['path'],env=verify_env)
            record['git_blob_sha256']=sha(staged)
            record['git_blob_bytes']=len(staged)
        reverse=subprocess.run(['git','-C',str(repo),'apply','--cached','--binary','--reverse','--check',str(patch_path)],env=verify_env,capture_output=True)
        if reverse.returncode: raise RuntimeError(name+': reverse patch verification failed: '+reverse.stderr.decode())
    finally:
        verify_index.unlink(missing_ok=True)
        Path(str(verify_index)+'.lock').unlink(missing_ok=True)
    manifest['repositories'][name]={
      'base_source':spec['base'],'local_git_head':head,'paths':records,
      'patch':patch_path.name,'patch_sha256':sha(patch),'forward_index_apply_check':'PASS',
      'normalized_diff_check':'PASS','reverse_apply_check':'PASS',
      'note':'Observatory base is verified reconstructed main content; patch paths are unchanged between old Git base and reconstructed main.' if name=='observatory' else 'Isolated candidate; no commit, merge, tag, or deployment.'}
(OUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
backup=ROOT/('.deliverables-backup-'+uuid.uuid4().hex)
try:
    if FINAL.exists(): FINAL.rename(backup)
    OUT.rename(FINAL)
except Exception:
    if backup.exists() and not FINAL.exists(): backup.rename(FINAL)
    raise
if backup.exists() and backup.resolve().parent == ROOT.resolve(): shutil.rmtree(backup)
published['value']=True
print(json.dumps({k:len(v['paths']) for k,v in manifest['repositories'].items()}))
