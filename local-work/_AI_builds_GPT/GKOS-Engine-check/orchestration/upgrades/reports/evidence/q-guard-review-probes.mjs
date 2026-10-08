import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceSnapshot, executeQualification } from '../../engine/scripts/runtime-qualification.mjs';

const base=mkdtempSync(resolve(import.meta.dirname,'q-guard-review-fixture-'));
const root=join(base,'repository'),out=join(base,'receipts');
mkdirSync(root);mkdirSync(out);
const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
git('init');git('config','user.name','Disposable Review Probe');git('config','user.email','probe@example.invalid');
writeFileSync(join(root,'source.txt'),'synthetic fixture only\n');
git('add','source.txt');git('-c','commit.gpgsign=false','commit','-m','synthetic source');
const first=sourceSnapshot(root);
git('-c','commit.gpgsign=false','commit','--allow-empty','-m','synthetic changed coordinate');
const second=sourceSnapshot(root);
const sentinel=JSON.stringify({status:'PASS',synthetic_sentinel:true});
writeFileSync(join(out,'current-runtime.json'),sentinel);
let thrown;
try {executeQualification({root,output:out});} catch(error) {thrown=error.message;}
console.log(JSON.stringify({
  fixture_root:base,
  source_identity_drift:{first_head:first.head,second_head:second.head,heads_differ:first.head!==second.head,snapshot_digests_equal:first.sha256===second.sha256},
  preflight_failure:{thrown,old_receipt_preserved:readFileSync(join(out,'current-runtime.json'),'utf8')===sentinel},
},null,2));
