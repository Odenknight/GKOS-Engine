import { evaluateReviewerAdmission, ReviewerAdmissionRequest, reviewerCanonicalDigest } from './reviewer';
import { sha256Bytes } from '../canonical';
import { registeredDiagnosticPairs, reviewerRegisteredDiagnostics } from './artifact-diagnostics';
import { GkosArtifactError, GkosArtifactPacket, gkosArtifactEncode, gkosArtifactValidate, gkosCapturedInputDigest, GKOS_ARTIFACT_STANDARD } from './artifacts';
import { validateCanonicalTimestamp } from '../canonical-cbor';

export type ReviewerRecoveryKind = 'correction'|'compensation'|'rollback'|'escalation';
export interface ReviewerRecoveryRoute { kind:ReviewerRecoveryKind; procedureRef:string; evidenceRef:string; available:boolean }
export interface ReviewerArtifactBasisV2 {
  request:ReviewerAdmissionRequest;
  issuedAt:string;
  issuer:{actor_id:string;actor_class:'human'|'agent'|'service'|'tool'|'organization'};
  proofMechanism:string;
  selectedByClass?:'human'|'agent';
  selectedById?:string;
  proposingActorClass?:'human'|'agent';
  compilerRef:{component_id:string;component_version:string;digest:{algorithm:'sha-256';canonical_profile:'GKX-CBOR-1';value:string}};
  requiredRecoveryKinds:ReviewerRecoveryKind[];
  recoveryRoutes:ReviewerRecoveryRoute[];
  retention:ReviewerRetentionRequest;
  escalation?:{required:boolean;resolution:'unresolved'|'resolved';resolverId?:string;resolutionRecordId?:string;evidenceDigest?:string;proposalId?:string;contextDigest?:string;policyDigest?:string;validUntil?:string;resolverClass?:'human'};
}
const micro = (time:string) => { const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(time);if(!match)throw new GkosArtifactError('captured_utc_timestamp_required','GKOS-GATE-L6-004','GKOS-CANON-004');const value=match[1]+'.'+(match[2]||'').padEnd(6,'0')+'Z'; validateCanonicalTimestamp(value); return value; };
const inputRef = (id:string,version:string,value:unknown) => ({artifact_id:id,artifact_version:version,digest:gkosCapturedInputDigest(value)});
const componentRef = (id:string,version:string,value:unknown) => ({component_id:id,component_version:version,digest:gkosCapturedInputDigest(value)});
const actor = (id:string,actor_class:string) => ({actor_id:id,actor_class});
const nativeScope = (s:ReviewerAdmissionRequest['requestedEffect']) => ({effect_class:s.operation,resources:[s.targetId],environment:s.environment,audience:[s.audience],sensitivity_ceiling:s.sensitivity,reversibility:'irreversible',maximum_affected_count:s.maxAffected});

/** Deterministic, bounded mapping from captured host state to five adopted artifact roles.
 * Opaque input commitments are not claims that source notes themselves satisfy a GKOS schema. */
export interface ReviewerContextArtifactInputV2 { context:ReviewerAdmissionRequest["context"]; runId:string; corpusRevision:string; policy:ReviewerAdmissionRequest["policy"]; authoritativeSources:ReviewerAdmissionRequest["authoritativeSources"]; purpose:string; recipientId:string; selectedById:string; selectedByClass?:'human'|'agent'; compilerRef:ReviewerArtifactBasisV2["compilerRef"] }
export function buildReviewerContextArtifactsV2(input:ReviewerContextArtifactInputV2) {
  const b=structuredClone(input),r={...b,requestedEffect:{purpose:b.purpose},actor:{id:b.recipientId},proposal:{proposerId:b.selectedById}},c=b.context;
  const sources=r.authoritativeSources.map(source=>({source,ref:inputRef(source.id,source.revision,source)}));
  const sourceRef=(id:string)=> {const source=sources.find(s=>s.source.id===id);if(!source)throw new TypeError('Missing authoritative selected source');return source.ref;};
  const policy=componentRef(r.policy.id,r.policy.version,r.policy);
  const eligible=inputRef('eligible:'+r.runId,c.corpusRevision,{runId:r.runId,corpusRevision:r.corpusRevision,sources:[...r.authoritativeSources].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)});
  const omissions=sources.filter(s=>!c.selectedSourceIds.includes(s.source.id)).map(s=>({object_ref:s.ref,reason:'eligible-but-not-selected'}));
  const warnings=c.warnings.map(w=>inputRef('warning:'+r.runId+':'+w.code,'1',w));
  const closure=c.requiredSourceIds.map(id=>({kind:'restriction',object_ref:sourceRef(id)})).concat(warnings.map(ref=>({kind:'warning',object_ref:ref})));
  const selection=gkosArtifactEncode({canonical_profile:'GKX-CBOR-1',artifact_type:'selection-envelope',schema_version:'1.0.0',selection_set_id:'selection:'+r.runId+':'+c.contextDigest,selection_set_version:'1',purpose:r.requestedEffect.purpose,recipient:r.actor.id,selected_by:actor(r.proposal.proposerId,b.selectedByClass||'agent'),eligible_snapshot_ref:eligible,selection_policy_ref:policy,selected_at:micro(c.assembledAt),members:c.selectedSourceIds.map(id=>({object_ref:sourceRef(id),score_type:'not-applicable',score:null,inclusion_reason:'captured-host-selection'})),known_omissions:omissions,closure_inputs:closure});
  const context=gkosArtifactEncode({canonical_profile:'GKX-CBOR-1',artifact_type:'context-manifest',schema_version:'1.0.0',manifest_id:'context:'+r.runId+':'+c.contextDigest,manifest_version:'1',purpose:r.requestedEffect.purpose,recipient:r.actor.id,selection_set_ref:selection.reference,policy_ref:policy,compiler_ref:b.compilerRef,compiled_at:micro(c.assembledAt),expires_at:micro(c.expiresAt),members:[...c.selectedSourceIds.map(id=>({kind:'evidence-anchor',object_ref:sourceRef(id)})),...closure],known_omissions:omissions});
  return {selection,context};
}
export function buildReviewerArtifactsV2(input:ReviewerArtifactBasisV2) {
  const b=structuredClone(input),r=b.request,a=r.authority;
  const {selection,context}=buildReviewerContextArtifactsV2({...r,purpose:r.requestedEffect.purpose,recipientId:r.actor.id,selectedById:b.selectedById||r.proposal.proposerId,selectedByClass:b.selectedByClass,compilerRef:b.compilerRef});
  const policy=context.document.policy_ref;
  const proposal=inputRef(r.proposal.id,'1',{...r.proposal,context_manifest_ref:context.reference,intended_result_digest:r.intendedResultDigest});
  const authority=gkosArtifactEncode({canonical_profile:'GKX-CBOR-1',artifact_type:'authority-receipt',schema_version:'1.0.0',receipt_id:a.id,receipt_version:String(r.expectedAuthorityRevision),issuer:b.issuer,grantor:actor(a.authorizerId,'human'),grantee:actor(a.actorId,r.actor.class),authority_source_ref:proposal,permitted_action_classes:a.operations,effect_scope:nativeScope(a.effectScope),purpose_scope:[a.effectScope.purpose],delegation_permitted:false,issued_at:micro(b.issuedAt),valid_from:micro(a.validFrom),valid_until:micro(a.validUntil),policy_ref:policy,revocation:{status:'not-revoked',checked_at:micro(b.issuedAt),method:'serialized-authoritative-host-state'},nonce:a.id,proof_mechanism:b.proofMechanism});
  return {selection,context,authority};
}
export interface ReviewerAdmissionRequestV2 extends ReviewerArtifactBasisV2 { artifacts:{selection:GkosArtifactPacket;context:GkosArtifactPacket;authority:GkosArtifactPacket} }
/** New authority requires canonical artifacts; legacy evaluator remains for historical replay. */
export async function evaluateReviewerAdmissionV2(input:ReviewerAdmissionRequestV2) {
  const b=structuredClone(input),r=b.request;
  const base=await evaluateReviewerAdmission(r);
  const reasons=base.reasonCodes.filter(code=>code!=='RECOVERY_ROUTE_UNAVAILABLE');
  const readinessPredicates=[{id:'engine:reviewer-v2-execution-state-ready',version:'2.0.0',input:r.executionState,outcome:r.executionState==='ready'?'pass':'held'},
    {id:'engine:reviewer-v2-challenge-standing-clear',version:'2.0.0',input:r.challengeDisposition,outcome:['none','dismissed'].includes(r.challengeDisposition)?'pass':'held'}];
  const genericControlReasons=['DELEGATION_PREDICATE_DENIED','DETERMINISTIC_CONTROLS_INVALID','NONDETERMINISTIC_RELAXATION_DENIED'];
  const diagnostics:{code:string;requirementId:string;reason:string;predicateId?:string;predicateVersion?:string}[]=reasons.flatMap(reason=>!genericControlReasons.includes(reason)&&reviewerRegisteredDiagnostics[reason]?[{...reviewerRegisteredDiagnostics[reason],reason}]:[]);
  const productRefusals:any[]=['EXECUTION_HOLD','CHALLENGE_HOLD'].flatMap((reason,index)=>reasons.includes(reason)?[{reason,predicate:readinessPredicates[index],scope:'product-readiness; no registered GKOS gate applicability asserted'}]:[]);
  for(const reason of genericControlReasons)if(reasons.includes(reason))productRefusals.push({reason,predicate:{id:'engine:reviewer-v2-captured-control-policy',version:'2.0.0',input:r.controls,outcome:'held'},scope:'product-control; governed supersession applicability not established'});
  const reject=(code:string,requirementId:string,reason:string)=>{diagnostics.push({code,requirementId,reason});reasons.push(reason);};
  try {
    const expected=buildReviewerArtifactsV2(b);
    for(const role of ['selection','context','authority'] as const) {
      const artifact=gkosArtifactValidate(b.artifacts?.[role]);
      if(artifact.canonicalHex!==expected[role].canonicalHex)reject('GKOS-GATE-L6-006','GKOS-CANON-006','CANONICAL_ARTIFACT_BINDING_MISMATCH');
    }
  } catch(error) {reject((error as any).code||'GKOS-GATE-L6-006',(error as any).requirementId||'GKOS-CANON-006','CANONICAL_ARTIFACT_INVALID');}
  const kinds=['correction','compensation','rollback','escalation'];
  if(!Array.isArray(b.requiredRecoveryKinds)||!b.requiredRecoveryKinds.length||new Set(b.requiredRecoveryKinds).size!==b.requiredRecoveryKinds.length||!Array.isArray(b.recoveryRoutes)||new Set(b.recoveryRoutes.map(v=>v.kind)).size!==b.recoveryRoutes.length||b.recoveryRoutes.some(v=>!kinds.includes(v.kind)||typeof v.available!=='boolean'||!v.procedureRef||!v.evidenceRef)||b.requiredRecoveryKinds.some(kind=>!kinds.includes(kind)||!b.recoveryRoutes.some(route=>route.kind===kind&&route.available)))reject('GKOS-GATE-L7-006','GKOS-AUTHUSE-006','RECOVERY_ROUTE_UNAVAILABLE');
  const e=b.escalation,needed=r.review.mandatoryEscalation||r.controls.checker.recommendation==='escalate';
  if(needed&&(!e?.required||e.resolution!=='resolved'||e.resolverClass!=='human'||!e.resolverId||!e.resolutionRecordId||e.evidenceDigest!==r.expectedReviewEvidenceDigest||e.proposalId!==r.proposal.id||e.contextDigest!==r.context.contextDigest||e.policyDigest!==r.policy.digest||!Number.isFinite(Date.parse(e.validUntil||''))||Date.parse(r.at)>=Date.parse(e.validUntil!)))reject('GKOS-GATE-L5-005','GKOS-REVIEW-003','HUMAN_ESCALATION_REQUIRED');
  if(!b.retention)reject('GKOS-GATE-L4-001','GKOS-RETENTION-003','RETENTION_EVIDENCE_UNAVAILABLE');
  else {const retention=await evaluateReviewerRetention(b.retention);if(b.retention.operation!=='effect'||b.retention.at!==r.at)reject('GKOS-GATE-L4-001','GKOS-RETENTION-003','RETENTION_BINDING_MISMATCH');for(const d of retention.diagnostics)reject(d.code,d.requirementId,d.reason);}
  let bindingDigest:string|null=null;
  try {bindingDigest='sha256:'+gkosCapturedInputDigest({basis:b,readinessPredicates,reasonCodes:[...new Set(reasons)].sort()}).value;}
  catch(error) {reject((error as any).code||'GKOS-GATE-L6-006',(error as any).requirementId||'GKOS-CANON-006','CANONICAL_BINDING_UNAVAILABLE');}
  return {contractVersion:'2.0.0',standardCommit:GKOS_ARTIFACT_STANDARD,admitted:reasons.length===0,reasonCodes:[...new Set(reasons)].sort(),diagnostics,productRefusals,readinessPredicates,bindingDigest,legacyBasisDigest:base.bindingDigest};
}

/** After independent target observation; never manufacture completed outcome before commit. */
export function buildReviewerUseRecordV2(b:ReviewerArtifactBasisV2,result:{id:string;at:string;outcome:'completed'|'refused'|'failed'|'partial';recoveryKind:ReviewerRecoveryKind}) {
  const r=b.request,a=buildReviewerArtifactsV2(b),route=b.recoveryRoutes.find(v=>v.kind===result.recoveryKind&&v.available);
  if(!route)throw new TypeError('Available recorded recovery route required');
  return gkosArtifactEncode({canonical_profile:'GKX-CBOR-1',artifact_type:'authorized-use-record',schema_version:'1.0.0',record_id:result.id,record_version:'1',action_class:r.operation,purpose:r.requestedEffect.purpose,context_manifest_ref:a.context.reference,policy_ref:a.context.document.policy_ref,compiler_ref:b.compilerRef,proposing_actor:actor(r.proposal.proposerId,b.proposingActorClass||'agent'),reviewing_actor:actor(r.review.reviewerId,r.review.reviewerClass),authorizing_actor:actor(r.authority.authorizerId,'human'),executing_actor:actor(r.actor.id,r.actor.class),delegation_chain:[a.authority.reference],requested_effect_scope:nativeScope(r.requestedEffect),authorized_effect_scope:nativeScope(r.authority.effectScope),authority_basis_ref:a.authority.reference,acted_at:micro(result.at),outcome:result.outcome,recovery_route:{kind:route.kind,procedure_ref:route.procedureRef}});
}

/** A registered canonical refusal carries its actual predicate/input basis, not a renamed product verdict. */
export function buildReviewerRefusalRecordV2(b:ReviewerArtifactBasisV2,result:{id:string;at:string;diagnostic:{code:string;requirementId:string;reason:string};predicateId:string;predicateVersion:string;escalationRoute?:string}) {
  const r=b.request,d=result.diagnostic;
  if(!registeredDiagnosticPairs[d.code]?.includes(d.requirementId))throw new TypeError('Pinned registered diagnostic pair required');
  return gkosArtifactEncode({canonical_profile:'GKX-CBOR-1',artifact_type:'refusal-receipt',schema_version:'1.0.0',receipt_id:result.id,gate_code:d.code,requirement_id:d.requirementId,predicate_ref:componentRef(result.predicateId,result.predicateVersion,{standard:GKOS_ARTIFACT_STANDARD,diagnostic:d}),result:'refused',input_refs:[inputRef('attempt:'+result.id,'1',b)],evaluated_at:micro(result.at),actor_context:[actor(r.actor.id,r.actor.class)],requested_effect_scope:nativeScope(r.requestedEffect),refusal_effect:'unchanged-target; '+d.reason,...(result.escalationRoute?{escalation_route:result.escalationRoute}:{}),policy_ref:componentRef(r.policy.id,r.policy.version,r.policy)});
}
export interface ReviewerRetentionRequest {
  policy:{id:string;version:string;digest:string;requiredEvidenceIds:string[]};
  evaluation:{id:string;policyDigest:string;state:'clear'|'held'|'unavailable'|'indeterminate'|'conflict';evidence:{id:string;revision:string;content:string;digest:string}[];evaluatedAt:string;validUntil:string;dispositionId:string|null;predecessorId?:string};
  disposition:null|{id:string;evaluationId:string;policyDigest:string;evidenceDigest:string;actorId:string;actorClass:'human';decision:'retain'|'release';at:string};
  manualHold:boolean;operation:'effect'|'retention-delete';at:string;
}
/** Host supplies authorized append-only policy/evaluation/disposition records, inside its transaction. */
export async function evaluateReviewerRetention(input:ReviewerRetentionRequest) {
  const r=structuredClone(input),reasons:string[]=[];
  const reject=(test:boolean,code:string)=>{if(test)reasons.push(code);};
  const p=r.policy,e=r.evaluation,d=r.disposition;
  const validText=(v:unknown)=>typeof v==='string'&&v.length>0;
  const required=Array.isArray(p?.requiredEvidenceIds)?p.requiredEvidenceIds:[];
  reject(!p||![p.id,p.version,p.digest].every(validText)||!/^sha256:[0-9a-f]{64}$/.test(p.digest)||!Array.isArray(p.requiredEvidenceIds)||required.length===0||required.some(id=>!validText(id))||new Set(required).size!==required.length,'RETENTION_POLICY_INVALID');
  reject(!e||!validText(e.id)||e.policyDigest!==p?.digest||!Array.isArray(e.evidence)||!['clear','held','unavailable','indeterminate','conflict'].includes(e.state),'RETENTION_EVIDENCE_INVALID');
  const evidence=Array.isArray(e?.evidence)?e.evidence.filter(v=>v&&typeof v==='object'):[];
  reject(evidence.length!==e?.evidence?.length,'RETENTION_EVIDENCE_INVALID');
  const evidenceDigest=await reviewerCanonicalDigest(evidence);
  reject(new Set(evidence.map(v=>v.id)).size!==evidence.length||evidence.some(v=>![v.id,v.revision,v.content,v.digest].every(validText))||required.some(id=>!evidence.some(v=>v.id===id)),'RETENTION_EVIDENCE_UNAVAILABLE');
  for(const item of evidence)reject(typeof item.content!=='string'||await sha256Bytes(item.content)!==item.digest,'RETENTION_EVIDENCE_DIGEST_MISMATCH');
  const at=Date.parse(r.at),start=Date.parse(e?.evaluatedAt),end=Date.parse(e?.validUntil);
  try {micro(r.at);micro(e?.evaluatedAt);micro(e?.validUntil);if(d)micro(d.at);}catch{reasons.push('RETENTION_EVALUATION_EXPIRED');}
  reject(!Number.isFinite(at)||!Number.isFinite(start)||!Number.isFinite(end)||start>=end||at<start||at>=end,'RETENTION_EVALUATION_EXPIRED');
  reject(typeof r.manualHold!=='boolean'||r.manualHold||e?.state!=='clear','RETENTION_HOLD');
  reject(!['effect','retention-delete'].includes(r.operation),'RETENTION_OPERATION_INVALID');
  if(e?.dispositionId!==null)reject(!d||d.id!==e?.dispositionId||d.evaluationId!==(e?.predecessorId||e?.id)||d.policyDigest!==p?.digest||d.evidenceDigest!==evidenceDigest||d.actorClass!=='human'||!validText(d.actorId)||d.decision!=='release'||!Number.isFinite(Date.parse(d.at))||Date.parse(d.at)>start,'RETENTION_DISPOSITION_INVALID');
  else reject(d!==null||!!e?.predecessorId,'RETENTION_DISPOSITION_INVALID');
  const diagnostics=[...new Set(reasons)].sort().map(reason=>({code:reason==='RETENTION_HOLD'||reason==='RETENTION_DISPOSITION_INVALID'?'GKOS-GATE-L4-002':'GKOS-GATE-L4-001',requirementId:'GKOS-RETENTION-003',reason}));
  return {admitted:reasons.length===0,reasonCodes:[...new Set(reasons)].sort(),diagnostics,evidenceDigest,bindingDigest:await reviewerCanonicalDigest({contract:'reviewer-retention-v2',request:r,reasons})};
}
