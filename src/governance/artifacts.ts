import Ajv2020 from 'ajv/dist/2020';
import { isDeepStrictEqual } from 'node:util';
import { registeredDiagnosticPairs } from './artifact-diagnostics';
import { artifactSchemas } from './artifact-schemas';
import { CanonicalNode, decodeCanonicalCbor, encodeCanonicalCbor, digestCanonicalCbor, validateCanonicalTimestamp } from '../canonical-cbor';

export const GKOS_ARTIFACT_STANDARD = 'b308ff7137bdbb109c31f0ace7e6c49b8988e0d5';
export function gkosArtifactCapabilities() {
  try {encodeCanonicalCbor({kind:'text',value:'canonical-profile-probe'});return {available:true,canonicalProfile:'GKX-CBOR-1',standardCommit:GKOS_ARTIFACT_STANDARD,roles:Object.keys(schemaNames)};}
  catch(error) {return {available:false,canonicalProfile:'GKX-CBOR-1',standardCommit:GKOS_ARTIFACT_STANDARD,roles:Object.keys(schemaNames),diagnostic:{code:(error as any).code,requirementId:(error as any).requirementId,reason:(error as any).reason}};}
}
export class GkosArtifactError extends Error {
  constructor(readonly reason: string, readonly code = 'GKOS-GATE-L6-006', readonly requirementId = 'GKOS-CANON-006') { super(reason); }
}
const fail = (reason: string, code?: string, requirement?: string): never => { throw new GkosArtifactError(reason, code, requirement); };
const schemaNames = { 'selection-envelope':'selection-set', 'context-manifest':'context-manifest', 'authority-receipt':'authority-receipt', 'authorized-use-record':'authorized-use-record', 'refusal-receipt':'refusal-receipt' };
const ajv = new Ajv2020({strict:false, allErrors:true, validateFormats:false});
for (const schema of Object.values(artifactSchemas)) ajv.addSchema(schema);
const validators = Object.fromEntries(Object.entries(schemaNames).map(([type,name]) => [type, ajv.getSchema(artifactSchemas[name].$id)!]));
const compare = (a: Uint8Array,b: Uint8Array) => { for(let i=0;i<Math.min(a.length,b.length);i++) if(a[i]!==b[i]) return a[i]-b[i]; return a.length-b.length; };
function referenceSchema(schema: any): any {
  if(!schema.$ref) return schema;
  const [file,fragment] = schema.$ref.split('#');
  const base = file ? Object.values(artifactSchemas).find((s:any)=>s.$id.endsWith('/'+file)) : artifactSchemas['gkx-common.defs'];
  if(!base || !fragment?.startsWith('/$defs/')) fail('unsupported_schema_reference');
  return (base as any).$defs[fragment.slice(7)];
}
function checkNode(node: CanonicalNode, rawSchema:any): void {
  const schema=referenceSchema(rawSchema);
  if(schema.type==='integer' && node.kind!=='integer') fail('schema_integer_encoded_as_float','GKOS-GATE-L6-003','GKOS-CANON-003');
  if(schema===artifactSchemas['gkx-common.defs'].$defs.canonicalTimestamp) {
    if(node.kind!=='text') fail('timestamp_text_required','GKOS-GATE-L6-004','GKOS-CANON-004');
    validateCanonicalTimestamp((node as {kind:'text';value:string}).value);
  }
  if(node.kind==='map') {
    const fields=Object.fromEntries(node.entries);
    for(const [key,value] of node.entries) if(schema.properties?.[key]) checkNode(value,schema.properties[key]);
    // JSON Schema cannot distinguish an integral-valued CBOR float from integer.
    if(fields.score_type?.kind==='text') {
      const expected=fields.score_type.value==='not-applicable'?'null':fields.score_type.value;
      if(fields.score?.kind!==expected) fail('selection_score_type_mismatch','GKOS-GATE-L6-003','GKOS-CANON-003');
    }
  }
  if(node.kind==='array') {
    if(schema['x-gkx-set-order']) {
      const bytes=node.items.map(encodeCanonicalCbor);
      for(let i=1;i<bytes.length;i++) if(compare(bytes[i-1],bytes[i])>=0) fail('set_order_or_duplicate');
    }
    if(schema.items) for(const item of node.items) checkNode(item,schema.items);
  }
}
function plain(node:CanonicalNode):any {
  switch(node.kind) {
    case 'null':return null;
    case 'integer': { const n=Number(node.value); if(!Number.isSafeInteger(n)) fail('artifact_safe_integer_limit'); return n; }
    case 'boolean': case 'float':case 'text': return node.value;
    case 'bytes':return fail('schema_binary_value_not_supported');
    case 'array':return node.items.map(plain);
    case 'map':return Object.fromEntries(node.entries.map(([k,v])=>[k,plain(v)]));
  }
}
function nodeFromDocument(value:any,schema:any={},depth=0):CanonicalNode {
  if(depth>64)fail('document_depth_limit','GKOS-GATE-L6-001','GKOS-CANON-001');
  schema=referenceSchema(schema);
  if(value===null)return {kind:'null'};
  if(typeof value==='string')return {kind:'text',value};
  if(typeof value==='boolean')return {kind:'boolean',value};
  if(typeof value==='number') {
    if(schema.type==='number' && Number.isFinite(value) && !Object.is(value,-0))return {kind:'float',value};
    if(!Number.isSafeInteger(value) || Object.is(value,-0)) fail('document_number_requires_safe_integer_or_typed_rendering','GKOS-GATE-L6-003','GKOS-CANON-003');
    return {kind:'integer',value:BigInt(value)};
  }
  if(Array.isArray(value)) {
    const items=value.map(v=>nodeFromDocument(v,schema.items||{},depth+1));
    if(schema['x-gkx-set-order'])items.sort((a,b)=>compare(encodeCanonicalCbor(a),encodeCanonicalCbor(b)));
    return {kind:'array',items};
  }
  if(!value || typeof value!=='object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('plain_artifact_document_required');
  const entries:[string,CanonicalNode][]=Object.keys(value).map(key=>[key,nodeFromDocument(value[key],key==='score'&&value.score_type==='float'?{type:'number'}:schema.properties?.[key]||{},depth+1)]);
  if(value.score_type==='float') { const score=entries.find(([k])=>k==='score'); if(score&&typeof value.score==='number'&&Number.isFinite(value.score)&&!Object.is(value.score,-0))score[1]={kind:'float',value:value.score}; }
  return {kind:'map',entries};
}
function rendered(node:CanonicalNode):any {
  if(node.kind==='integer')return {kind:node.kind,value:node.value.toString()};
  if(node.kind==='bytes')return {kind:node.kind,value:Buffer.from(node.value).toString('hex')};
  if(node.kind==='array')return {kind:node.kind,items:node.items.map(rendered)};
  if(node.kind==='map')return {kind:node.kind,entries:node.entries.map(([k,v])=>[k,rendered(v)])};
  return node;
}
export interface GkosArtifactPacket { canonicalHex:string; rendering?:unknown; digest?:unknown; reference?:unknown; document?:unknown }
/** Validates canonical bytes, exact adopted schema and schema-specific CBOR types/sets. */
export function gkosArtifactValidate(packet:GkosArtifactPacket) {
  if(!packet || typeof packet.canonicalHex!=='string' || packet.canonicalHex.length>2097152 || !/^(?:[0-9a-f]{2})+$/.test(packet.canonicalHex)) fail('canonical_hex_required','GKOS-GATE-L6-001','GKOS-CANON-001');
  const bytes=new Uint8Array(Buffer.from(packet.canonicalHex,'hex')), node=decodeCanonicalCbor(bytes), document=plain(node);
  const type=document?.artifact_type, validator=validators[type];
  if(!Object.prototype.hasOwnProperty.call(validators,type))fail('artifact_schema_invalid');
  checkNode(node,artifactSchemas[schemaNames[type]]);
  if(!validator(document))fail('artifact_schema_invalid');
  if(type==='refusal-receipt'&&!registeredDiagnosticPairs[document.gate_code]?.includes(document.requirement_id))fail('unregistered_refusal_diagnostic');
  const digest={algorithm:'sha-256' as const,canonical_profile:'GKX-CBOR-1' as const,value:digestCanonicalCbor(bytes).digest};
  const rendering={rendering_format:'gkos.cbor.typed-json.v1',algorithm:digest.algorithm,canonical_profile:digest.canonical_profile,digest:digest.value,node:rendered(node)};
  if(packet.digest!==undefined&&!isDeepStrictEqual(packet.digest,digest))fail('artifact_digest_mismatch','GKOS-GATE-L6-007','GKOS-CANON-007');
  if(packet.document!==undefined&&!isDeepStrictEqual(packet.document,document))fail('document_rendering_mismatch','GKOS-GATE-L6-008','GKOS-CANON-008');
  if((packet.rendering as any)?.digest!==undefined&&(packet.rendering as any).digest!==digest.value)fail('rendered_digest_mismatch','GKOS-GATE-L6-007','GKOS-CANON-007');
  if(packet.rendering!==undefined) {
    const supplied=structuredClone(packet.rendering) as any;
    if(supplied?.canonical_hex!==undefined){if(supplied.canonical_hex!==packet.canonicalHex)fail('rendered_bytes_mismatch','GKOS-GATE-L6-008','GKOS-CANON-008');delete supplied.canonical_hex;}
    if(!isDeepStrictEqual(supplied,rendering))fail('incomplete_or_mismatched_rendering','GKOS-GATE-L6-008','GKOS-CANON-008');
  }
  const artifact_id=document.selection_set_id||document.manifest_id||document.receipt_id||document.record_id;
  const artifact_version=document.selection_set_version||document.manifest_version||document.receipt_version||document.record_version||document.schema_version;
  if(packet.reference!==undefined&&!isDeepStrictEqual(packet.reference,{artifact_id,artifact_version,digest}))fail('artifact_reference_mismatch');
  return {canonicalHex:packet.canonicalHex,digest,reference:{artifact_id,artifact_version,digest},rendering,document};
}
/** Producer sorts schema-declared logical sets; validator never silently repairs wire bytes. */
export function gkosArtifactEncode(document:unknown) {
  const snapshot=structuredClone(document) as any, schema=artifactSchemas[schemaNames[snapshot?.artifact_type]];
  if(!Object.prototype.hasOwnProperty.call(schemaNames,snapshot?.artifact_type)||!schema)fail('unsupported_artifact_role');
  return gkosArtifactValidate({canonicalHex:Buffer.from(encodeCanonicalCbor(nodeFromDocument(snapshot,schema))).toString('hex')});
}
/** Canonical commitment to opaque captured input; this does not validate a GKOS artifact role. */
export function gkosCapturedInputDigest(value:unknown) {
  // Capture text as byte strings: source evidence may be non-NFC and must never be normalized.
  let nodes=0;
  const active=new Set<object>();
  const opaque=(v:any,depth=0):CanonicalNode=> {
    if(depth>64||++nodes>10000)fail('captured_input_resource_limit','GKOS-GATE-L6-001','GKOS-CANON-001');
    if(typeof v==='string') { for(let i=0;i<v.length;i++){const n=v.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=v.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))fail('invalid_captured_unicode','GKOS-GATE-L6-005','GKOS-CANON-005');}else if(n>=0xdc00&&n<=0xdfff)fail('invalid_captured_unicode','GKOS-GATE-L6-005','GKOS-CANON-005');} return {kind:'bytes',value:new TextEncoder().encode(v)}; }
    if(v&&typeof v==='object') {
      if(active.has(v))fail('captured_input_cycle');
      active.add(v);
      if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail('plain_captured_input_required');
      const result:CanonicalNode=Array.isArray(v)?{kind:'array',items:v.map(item=>opaque(item,depth+1))}:{kind:'map',entries:Object.keys(v).map(k=>[k,opaque(v[k],depth+1)])};
      active.delete(v);return result;
    }
    return nodeFromDocument(v);
  };
  const bytes=encodeCanonicalCbor(opaque(structuredClone(value)));
  return {algorithm:'sha-256' as const,canonical_profile:'GKX-CBOR-1' as const,value:digestCanonicalCbor(bytes).digest};
}
