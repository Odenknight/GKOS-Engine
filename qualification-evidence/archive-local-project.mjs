import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
const base='[LOCAL_PATH]';
const out=join(base,'GKOS-Engine-local-archive-20260909');mkdirSync(out,{recursive:true});
const rows=[],excluded=[];const hash=b=>createHash('sha256').update(b).digest('hex');
const secret=/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|npm_[A-Za-z0-9]{30,})/;
function save(src,dst,sanitize=false){const bytes=readFileSync(src);if(bytes.length>4e6||bytes.includes(0)){excluded.push({path:dst,reason:'binary_or_large',sha256:hash(bytes)});return;}let text=bytes.toString('utf8');if(secret.test(text)){excluded.push({path:dst,reason:'credential_pattern',sha256:hash(bytes)});return;}if(sanitize)text=text.replace(/C:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\s"'<>]+/g,'[LOCAL_PATH]').replace(/\/home\/[^\s"'<>]+/g,'[HOST_PATH]');const target=join(out,dst);mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,text);rows.push({path:dst,original_sha256:hash(bytes),published_sha256:hash(Buffer.from(text)),sanitized:text!==bytes.toString('utf8')});}
const root=join(base,'GKOS-Engine-check');const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',maxBuffer:64e6});
const selected=['contracts','docs','src','test','scripts','build_instruct','orchestration','lite-docs','future-build-phase6','future-build-readme-reconciliation'];
const names=new Set(git(root,'ls-files','--others','--exclude-standard','--',...selected).trim().split('\n').filter(Boolean));
for(const p of git(root,'diff','--name-only').trim().split('\n').filter(Boolean))names.add(p);
for(const p of readdirSync(root))if(/\.(md|patch|mjs)$/.test(p)&&!git(root,'ls-files','--',p).trim())names.add(p);
for(const p of names){if(/(?:^|\/)(?:node_modules|\.git|\.gkx|\.local|cache|dist)(?:\/|$)/.test(p)||!lstatSync(join(root,p)).isFile())continue;save(join(root,p),'historical-working-tree/'+p,true);}
writeFileSync(join(out,'local-branches.txt'),git(root,'branch','--format=%(refname:short) %(objectname) %(upstream:short)'));
const evidence=join(base,'GKOS-Engine-release-220-evidence');
function walk(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const p=join(dir,ent.name),r=relative(evidence,p).replaceAll('\\','/');if(ent.isSymbolicLink())continue;if(ent.isDirectory()){if(/^(?:vault|moc-vault|consumer|node_modules|\.gkx|\.local|source|fixture|fixtures|state|runtime|journal|moc)$/i.test(ent.name))continue;walk(p);}else if(/\.(?:md|json|jsonl|log|tap|mjs|py|sh|txt)$/.test(ent.name)){save(p,'qualification-evidence/'+r,true);}}}walk(evidence);
writeFileSync(join(out,'manifest.json'),JSON.stringify({version:1,archive_kind:'sanitized_public_copy_not_original_qualification_receipt',files:rows,excluded},null,2)+'\n');
writeFileSync(join(out,'README.md'),'# Local project preservation snapshot\n\nOwner-authorized archive before the next directive. Historical working-tree files are reference material, not replacements for current main. Qualification evidence remains bound to each original source revision. Public copies redact local host paths; the manifest records original and published SHA-256. Original evidence remains local and unchanged.\n\nExcluded: credentials, runtime tokens, generated vault/state databases, caches, dependency trees, duplicate package tarballs, nested repositories and large generated outputs. Packed artifact digests and source references are retained. This snapshot does not assert release readiness or a completed soak. Completed implementations are integrated through PRs48/49/50; old branch identities are recorded in local-branches.txt.\n');
console.log(JSON.stringify({out,files:rows.length,excluded,bytes:rows.reduce((n,r)=>n+readFileSync(join(out,r.path)).length,0)}));
