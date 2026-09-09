from pathlib import Path
import hashlib, json, os, subprocess, sys, uuid
root=Path(__file__).resolve().parents[1]
bundle=root/'deliverables'
value=json.loads((bundle/'MANIFEST.json').read_text(encoding='utf-8'))
errors=[]
for name,repo in value['repositories'].items():
    patch=bundle/repo['patch']
    if not patch.is_file() or hashlib.sha256(patch.read_bytes()).hexdigest()!=repo['patch_sha256']:
        errors.append(name+': patch hash mismatch')
    if repo.get('forward_index_apply_check')!='PASS': errors.append(name+': missing forward check')
    if repo.get('normalized_diff_check')!='PASS': errors.append(name+': missing normalized diff check')
    if repo.get('reverse_apply_check')!='PASS': errors.append(name+': missing reverse check')
    expected={item['path'] for item in repo['paths']}
    files_root=bundle/name/'files'
    actual={path.relative_to(files_root).as_posix() for path in files_root.rglob('*') if path.is_file()} if files_root.is_dir() else set()
    for extra in sorted(actual-expected): errors.append(name+': unmanifested '+extra)
    for item in repo['paths']:
        path=bundle/name/'files'/item['path']
        if not path.is_file() or path.is_symlink(): errors.append(name+': missing or unsafe '+item['path']); continue
        data=path.read_bytes()
        if len(data)!=item['bytes'] or hashlib.sha256(data).hexdigest()!=item['after_sha256']:
            errors.append(name+': file mismatch '+item['path'])
    source=root/name
    index=bundle/f'.verify-{name}-{uuid.uuid4().hex}'
    env={**os.environ,'GIT_INDEX_FILE':str(index)}
    try:
        subprocess.run(['git','-C',str(source),'read-tree',repo['local_git_head']],env=env,check=True,capture_output=True)
        forward=subprocess.run(['git','-C',str(source),'apply','--cached','--binary','--check',str(patch)],env=env,capture_output=True)
        if forward.returncode: errors.append(name+': forward apply failed')
        else:
            applied=subprocess.run(['git','-C',str(source),'apply','--cached','--binary',str(patch)],env=env,capture_output=True)
            if applied.returncode: errors.append(name+': isolated apply failed')
            else:
                diffcheck=subprocess.run(['git','-C',str(source),'-c','core.autocrlf=true','diff','--cached','--check'],env=env,capture_output=True)
                if diffcheck.returncode: errors.append(name+': normalized diff check failed')
                for item in repo['paths']:
                    staged=subprocess.run(['git','-C',str(source),'show',':'+item['path']],env=env,capture_output=True)
                    if staged.returncode or len(staged.stdout)!=item.get('git_blob_bytes') or hashlib.sha256(staged.stdout).hexdigest()!=item.get('git_blob_sha256'):
                        errors.append(name+': staged blob mismatch '+item['path'])
                reverse=subprocess.run(['git','-C',str(source),'apply','--cached','--binary','--reverse','--check',str(patch)],env=env,capture_output=True)
                if reverse.returncode: errors.append(name+': reverse apply failed')
    finally:
        index.unlink(missing_ok=True)
        Path(str(index)+'.lock').unlink(missing_ok=True)
result={'result':'PASS' if not errors else 'FAIL','repositories':len(value['repositories']),'files':sum(len(x['paths']) for x in value['repositories'].values()),'errors':errors}
(root/'reports'/'deliverable-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
sys.exit(1 if errors else 0)
