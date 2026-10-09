import { createHash } from 'node:crypto';
import { reviewerCanonicalBytes, ReviewerAdmissionRequest } from './reviewer';
import { CanonicalNode, encodeCanonicalCbor, digestCanonicalCbor } from '../canonical-cbor';
import { GkosArtifactPacket } from './artifacts';

export const REVIEWER_PROPOSAL_BASIS_PROFILE = 'gkos-reviewer-proposal-basis/1';
/** Implementation-specific captured producer record; not a newly adopted GKOS artifact role. */
export interface ReviewerProposalBasis { profile:typeof REVIEWER_PROPOSAL_BASIS_PROFILE; schemaVersion:'1.0.0'; record:Record<string,any> }
const hash=(bytes:string|Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export class ReviewerProposalBasisError extends Error { readonly implementationCode='PROPOSAL_BASIS_INVALID'; constructor(){super('proposal_basis_invalid');} }
const fail=()=>{throw new ReviewerProposalBasisError();};
const str=(v:any,max=120)=>typeof v==='string'&&v.length>0&&v.length<=max;
const digest=(v:any)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const keys=(v:any,required:string[],optional:string[]=[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const instant=(v:any)=>str(v,30)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);
function context(v:any) {
  return keys(v,['artifactKind','contractVersion','canonicalization','runId','corpusRevision','policy','sources','selectedSourceIds','requiredSourceIds','requiredWarningCodes','warnings','assembledAt','expiresAt','contextDigest'])&&v.artifactKind==='engine.reviewer-context'&&v.contractVersion==='1.0.0'&&v.canonicalization==='engine-reviewer-exact-json-v1'&&str(v.runId)&&str(v.corpusRevision)&&keys(v.policy,['id','version','digest'])&&str(v.policy.id)&&str(v.policy.version)&&digest(v.policy.digest)&&Array.isArray(v.sources)&&v.sources.length<=16&&v.sources.every((s:any)=>keys(s,['id','revision','digest'])&&str(s.id)&&str(s.revision)&&digest(s.digest))&&['selectedSourceIds','requiredSourceIds','requiredWarningCodes'].every(k=>Array.isArray(v[k])&&v[k].length<=16&&v[k].every((s:any)=>str(s)))&&Array.isArray(v.warnings)&&v.warnings.length<=16&&v.warnings.every((w:any)=>keys(w,['code','message'],['sourceId'])&&str(w.code)&&str(w.message,4096)&&(!Object.hasOwn(w,'sourceId')||str(w.sourceId)))&&instant(v.assembledAt)&&instant(v.expiresAt)&&digest(v.contextDigest);
}
export function buildReviewerProposalBasisV1(input:ReviewerProposalBasis, request:ReviewerAdmissionRequest, manifest:GkosArtifactPacket) {
  if(!keys(input,['profile','schemaVersion','record']))fail();
  // Exact JSON snapshot rejects nonrepresentable values before hash calculation.
  const b=JSON.parse(reviewerCanonicalBytes(input)),r=JSON.parse(reviewerCanonicalBytes(request)),p=b?.record;
  if(!keys(b,['profile','schemaVersion','record'])||b.profile!==REVIEWER_PROPOSAL_BASIS_PROFILE||b.schemaVersion!=='1.0.0')fail();
  if(!keys(p,['id','sequence','run_id','kind','actor_id','created_at','context_id','context_digest','base_target','stimulus_metadata','markdown','intended_result_digest','expected_outcome','challenge_id','parent_proposal_id','correction_request','correction_evaluation']))fail();
  const bytes=reviewerCanonicalBytes(p);
  if(Buffer.byteLength(bytes)>262144||!str(p.id)||!Number.isSafeInteger(p.sequence)||p.sequence<1||!str(p.run_id)||!str(p.actor_id)||!instant(p.created_at)||!str(p.context_id)||!digest(p.context_digest)||!str(p.markdown,65536)||Buffer.byteLength(p.markdown)>65536||!str(p.expected_outcome,2000)||!digest(p.intended_result_digest))fail();
  const t=p.base_target;
  if(!keys(t,['target_id','version','result_digest'])||!str(t.target_id)||!Number.isSafeInteger(t.version)||t.version<0||!digest(t.result_digest)||t.target_id!==r.targetId)fail();
  const s=p.stimulus_metadata;
  if(s!==null&&(!keys(s,['markdown','confidence_percent','kind'])||!str(s.markdown,65536)||!Number.isSafeInteger(s.confidence_percent)||s.confidence_percent<0||s.confidence_percent>100||s.kind!=='fixed-synthetic-automation-bias-stimulus'))fail();
  if(p.kind==='proposal') {if([p.challenge_id,p.parent_proposal_id,p.correction_request,p.correction_evaluation].some(v=>v!==null))fail();}
  else if(p.kind==='correction') {
    const c=p.correction_request,e=p.correction_evaluation;
    if(!str(p.challenge_id)||!str(p.parent_proposal_id)||!keys(c,['actor','authorizedReviewerIds','predecessor','replacement','predecessorDecisionId','challengeId','rationale','at'])||!keys(c.actor,['id','class'])||!str(c.actor.id)||!['human','agent','service'].includes(c.actor.class)||!Array.isArray(c.authorizedReviewerIds)||!c.authorizedReviewerIds.length||c.authorizedReviewerIds.length>5||!c.authorizedReviewerIds.every((v:any)=>str(v))||!context(c.predecessor)||!context(c.replacement)||!str(c.predecessorDecisionId)||c.challengeId!==p.challenge_id||!str(c.rationale,4096)||!instant(c.at)||c.actor.id!==p.actor_id||c.replacement.contextDigest!==p.context_digest||c.replacement.runId!==p.run_id||!keys(e,['admitted','reasonCodes','bindingDigest'])||e.admitted!==true||!Array.isArray(e.reasonCodes)||e.reasonCodes.length!==0||!e.reasonCodes.every((v:any)=>str(v))||!digest(e.bindingDigest))fail();
  } else fail();
  if(p.id!==r.proposal.id||p.actor_id!==r.proposal.proposerId||p.run_id!==r.runId||p.context_digest!==r.context.contextDigest||p.intended_result_digest!==r.proposal.intendedResultDigest||hash(p.markdown)!==p.intended_result_digest||hash(bytes)!==r.proposal.digest)fail();
  const document={canonical_profile:'GKX-CBOR-1',artifact_type:'reviewer-proposal-basis',schema_version:'1.0.0',profile:REVIEWER_PROPOSAL_BASIS_PROFILE,proposal_id:p.id,proposal_kind:p.kind,context_manifest_ref:manifest.reference,record_bytes:new TextEncoder().encode(bytes)};
  const node=(v:any):CanonicalNode=>v instanceof Uint8Array?{kind:'bytes',value:v}:typeof v==='string'?{kind:'text',value:v}:{kind:'map',entries:Object.keys(v).map(k=>[k,node(v[k])])};
  const canonicalBytes=encodeCanonicalCbor(node(document)),d=digestCanonicalCbor(canonicalBytes);
  return {profile:REVIEWER_PROPOSAL_BASIS_PROFILE,canonicalHex:Buffer.from(canonicalBytes).toString('hex'),reference:{artifact_id:p.id,artifact_version:'1',digest:{algorithm:d.algorithm,canonical_profile:d.canonical_profile,value:d.digest}},document};
}
