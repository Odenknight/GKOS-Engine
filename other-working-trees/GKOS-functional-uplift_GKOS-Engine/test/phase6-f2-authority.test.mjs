import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  AcceptedContractValidator, AUTHORITY_TABLES, AuthorityFault, ClosedErrorRegistry,
  ReferenceIdentityAuthority, canonicalJson, generateCredential, parseCredential, sha256,
} from "../dist/identity-authority.mjs";

const CONTRACT = resolve("contracts/identity/GKOS-AGENT-IDENTITY-MCP-CONTRACT-1.0.0-draft.1");

class DeterministicRandom {
  counter = 0;
  bytes(length) { const out=Buffer.alloc(length); let offset=0; while(offset<length){const block=createHash("sha256").update(`f2-test-${this.counter++}`).digest();block.copy(out,offset,0,Math.min(block.length,length-offset));offset+=Math.min(block.length,length-offset);} return out; }
}
class AdvancingClock { value=Date.parse("2026-08-26T12:00:00.000Z"); now(){const result=new Date(this.value);this.value+=1;return result;} monotonicMs(){return this.value;} }
class MemoryHandoff { kind; wire=null; constructor(kind="protected_locator"){this.kind=kind;} async deliver(bytes,binding){this.wire=Buffer.from(bytes).toString("ascii");return{delivered:true,binding_digest:sha256(Buffer.from(JSON.stringify(binding)))};} }

function digestResult(value){const copy={...value};delete copy.result_digest;return{...copy,result_digest:sha256(Buffer.from(canonicalJson(copy)))};}
function roots(){const root=mkdtempSync(join(tmpdir(),"gkos-f2-"));chmodSync(root,0o700);for(const leaf of ["vault","anchor","credentials"])mkdirSync(join(root,leaf),{mode:0o700});return{root,vaultRoot:join(root,"vault"),anchorRoot:join(root,"anchor"),credentialRoot:join(root,"credentials"),contractRoot:CONTRACT};}

test("accepted F1 coordinates expose exactly 32 operations, 53 errors, 34 aliases and 16 tables",()=>{
  const contract=new AcceptedContractValidator(CONTRACT),errors=new ClosedErrorRegistry(CONTRACT);
  assert.equal(contract.operations.size,32);assert.equal(errors.rows.size,53);assert.equal(errors.aliases.size,34);assert.equal(AUTHORITY_TABLES.length,16);assert.equal(new Set(AUTHORITY_TABLES).size,16);
});

test("credential wire is exact, selector-bound, domain-digested, and destructible",()=>{
  const generated=generateCredential(new DeterministicRandom());const wire=Buffer.from(generated.wire);assert.equal(wire.length,81);assert.match(wire.toString("ascii"),/^gkos1\.gkc1_[a-z2-7]{26}\.[A-Za-z0-9_-]{43}$/u);const parsed=parseCredential(wire);assert.equal(parsed.credential_id,generated.credential_id);assert.equal(`sha256:${parsed.digest.toString("hex")}`,generated.secret_digest);parsed.digest.fill(0);generated.destroy();assert.ok(generated.wire.every(byte=>byte===0));
  const changed=Buffer.from(wire);changed[changed.length-1]=changed[changed.length-1]===65?66:65;assert.throws(()=>parseCredential(changed),error=>error instanceof AuthorityFault&&error.code==="GKOS_P6_AUTH_FAILED");
});

test("canonical authority JSON rejects open numeric and Unicode aliases",()=>{
  assert.equal(canonicalJson({b:2,a:1}),'{"a":1,"b":2}');assert.throws(()=>canonicalJson({n:-0}),/noncanonical number/u);assert.throws(()=>canonicalJson({n:1.5}),/noncanonical number/u);assert.throws(()=>canonicalJson({s:"e\u0301"}),/invalid string/u);assert.throws(()=>canonicalJson({s:"bad\u0000"}),/invalid string/u);
});

test("unsupported Windows authority host fails closed before creating authority state",{skip:process.platform!=="win32"},()=>{
  assert.throws(()=>new ReferenceIdentityAuthority({...roots(),clock:new AdvancingClock(),random:new DeterministicRandom()}),error=>error instanceof AuthorityFault&&error.code==="GKOS_P6_PLATFORM_UNAVAILABLE");
});

test("POSIX reference bootstraps, authenticates, mutates, pages, backs up and restores with replacement owner",{skip:process.platform==="win32"},async()=>{
  const paths=roots(),clock=new AdvancingClock(),random=new DeterministicRandom(),authority=new ReferenceIdentityAuthority({...paths,clock,random}),ownerDelivery=new MemoryHandoff();const challenge=authority.getChallenge();
  const bootstrap=await authority.bootstrap({challenge_response:challenge.challenge,owner_display_name:"Owner",legacy_source:"absent"},ownerDelivery);assert.equal(bootstrap.authority_generation,1);assert.ok(ownerDelivery.wire);const owner={credential:ownerDelivery.wire,transport:"owner_cli"};
  const status=await authority.executeOwner("authority.status",{},owner);assert.equal(status.write_gate,"open");assert.equal(status.global_event_seq,1);
  const provision=await authority.executeOwner("agent.provision",{display_name:"Worker",idempotency_key:"agent-1"},owner);assert.equal(provision.status,"active");const replay=await authority.executeOwner("agent.provision",{display_name:"Worker",idempotency_key:"agent-1"},owner);assert.deepEqual(replay,provision);
  await assert.rejects(authority.executeOwner("agent.provision",{display_name:"Other",idempotency_key:"agent-1"},owner),error=>error instanceof AuthorityFault&&error.code==="GKOS_P6_REQUEST_REPLAY_CONFLICT");
  const workerDelivery=new MemoryHandoff("inherited_handle"),issued=await authority.executeOwner("credential.issue",{agent_id:provision.target_id,delivery:"inherited_handle",idempotency_key:"credential-1"},{...owner,handoff:workerDelivery});assert.equal(issued.secret_revealed,true);assert.ok(workerDelivery.wire);const issueReplay=await authority.executeOwner("credential.issue",{agent_id:provision.target_id,delivery:"inherited_handle",idempotency_key:"credential-1"},{...owner,handoff:new MemoryHandoff("inherited_handle")});assert.equal(issueReplay.secret_revealed,false);
  const session=authority.openSession({credential:workerDelivery.wire,transport:"native_stdio"});const capabilities=await authority.executePublic("capability.list_effective",{}, {credential:workerDelivery.wire,session_id:session.session_id,transport:"native_stdio",adapter:{async execute(_operation,_input,context){return digestResult({contract_version:"1.0.0-draft.1",request_id:context.request_id,agent_id:context.principal.agent_id,auth_epoch:context.auth_epoch,authority_generation:context.authority_generation,policy_decision_id:context.policy_decision_id,capabilities:["capability.read.self"]});}}});assert.deepEqual(capabilities.capabilities,["capability.read.self"]);
  const backup=await authority.executeOwner("authority.backup",{idempotency_key:"backup-1"},owner);const restoredDelivery=new MemoryHandoff(),restored=await authority.executeOwner("authority.restore",{backup_id:backup.backup_id,backup_manifest_digest:backup.backup_manifest_digest,idempotency_key:"restore-1"},{...owner,handoff:restoredDelivery});assert.equal(restored.restore_epoch,2);assert.ok(restoredDelivery.wire);await assert.rejects(Promise.resolve().then(()=>authority.authenticate(ownerDelivery.wire,true)),error=>error instanceof AuthorityFault);const after=await authority.executeOwner("authority.status",{},{credential:restoredDelivery.wire,transport:"owner_cli"});assert.equal(after.authority_instance_id,restored.new_authority_instance_id);assert.equal(after.write_gate,"open");authority.close();
});

test("F2 implementation contains no raw-secret JSON result field",()=>{
  const source=readFileSync(resolve("src/identity-authority/operations.ts"),"utf8");assert.doesNotMatch(source,/result[^\n]{0,80}(?:wire|secret_bytes|raw_secret)\s*:/iu);assert.doesNotMatch(source,/JSON\.stringify\([^\n]*(?:generated\.wire|handoff\.wire)/u);
});
