import pathlib,json,hashlib,tarfile,io,subprocess,re,shutil,datetime
base=pathlib.Path(__file__).parent/'hosted-c6112d5'
repo=pathlib.Path('C:/Users/FAC/Documents/_AI_builds_GPT/GKOS-Engine-reviewer')
ref='c6112d59b4219cae1293ff543fd487382420e5fb'
tree=subprocess.check_output(['git','rev-parse',ref+'^{tree}'],cwd=repo).decode().strip()
tar=tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git','archive',ref],cwd=repo)))
expected={m.name:hashlib.sha256(tar.extractfile(m).read()).hexdigest() for m in tar if m.isfile()}
records=[];hashes={}
for p in sorted(base.rglob('current-runtime.json')):
 r=json.loads(p.read_bytes());files={f['path']:f['sha256'] for f in r['source']['files']}
 assert files==expected,(p,'source bytes')
 assert r['source']['tree']==tree,(p,'source tree')
 assert r['status']=='PASS' and len(r['commands'])==2,(p,'status')
 source={k:v for k,v in r['source'].items() if k!='sha256'}
 assert hashlib.sha256(json.dumps(source,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==r['source']['sha256'],(p,'snapshot hash')
 for c in r['commands']:
  log=p.parent/c['log'];raw=log.read_bytes();assert hashlib.sha256(raw).hexdigest()==c['log_sha256'] and c['exit_code']==0,(p,'log or exit')
  text=raw.decode();assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',text),(p,'private material')
  hashes[str(log.relative_to(base)).replace('\\','/')]=hashlib.sha256(raw).hexdigest()
  if 'counts' in c:
   for k,v in c['counts'].items():
    vals=re.findall(r'^(?:#|ℹ)\s+'+k+r'\s+(\d+)\s*$',text,re.M);assert vals==[str(v)],(p,k,vals)
   assert c['counts']['tests']==c['counts']['pass'] and all(c['counts'][k]==0 for k in ['fail','cancelled','skipped','todo'])
   assert 'current-test-selection.test.mjs' in text and 'reviewer-artifacts.test.mjs' in text and 'canonical-cbor-runtime.test.mjs' in text
 hashes[str(p.relative_to(base)).replace('\\','/')]=hashlib.sha256(p.read_bytes()).hexdigest()
 records.append({'lane':str(p.parent.relative_to(base)).replace('\\','/'),'status':r['status'],'source_head':r['source']['head'],'source_tree':tree,'source_files':len(files),'node':r['node'],'platform':r['platform'],'counts':r['commands'][-1]['counts'],'started_at':r['started_at'],'ended_at':r['ended_at'],'log_hashes_verified':True,'test_denominators_verified':True,'source_file_hashes_verified':True})
assert len(records)==12,('expected12receipts',len(records))
checks=json.loads(subprocess.check_output(['gh','pr','checks','96','--json','name,state,workflow'],cwd=repo))
assert not any(c['state'] in ['IN_PROGRESS','PENDING','FAILURE','ERROR'] for c in checks),checks
index={'schema_id':'observatory.engine-hosted-source-qualification.v1','verified_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate_commit':ref,'candidate_tree':tree,'runs':{'pr':37577860192,'push':37577856013},'receipts':records,'checks':checks,'file_sha256':hashes,'sanitization':'Successful build/test outputs and source-hash receipts only; private-key material scan negative; original bytes retained so recorded hashes remain verifiable. No credential payloads included.','scope':'Source-qualified runtime tests, not full normative profile, human assessment, retrieval workload or release approval.'}
(base/'verification-index.json').write_text(json.dumps(index,indent=2)+'\n')
dest=pathlib.Path('C:/Users/FAC/.codex/worktrees/observatory-completion-20261006/GKOS-Observatory/.local/qualification/engine-hosted-c6112d5')
dest.mkdir(parents=True,exist_ok=True)
shutil.copytree(base,dest,dirs_exist_ok=True)
print(json.dumps({'receipts':len(records),'checks':len(checks),'states':{s:sum(c['state']==s for c in checks) for s in set(c['state'] for c in checks)},'destination':str(dest)}))
