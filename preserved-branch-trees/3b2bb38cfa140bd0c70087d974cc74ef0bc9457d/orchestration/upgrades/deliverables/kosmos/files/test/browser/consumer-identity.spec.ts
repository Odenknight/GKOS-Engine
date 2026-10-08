import {test,expect} from '@playwright/test';
test('stable identity survives live, replay, and buffered-live adapters without label conflation',async({page})=>{
 await page.goto('/kosmos-oden-stand-alone.html?capture=1&seed=1907&time=0&animation=off');
 await page.waitForFunction(()=>(window as any).__kosmos?.ok===true);
 const base={schema_version:1,agent_id:'agent:a',agent_label:'Shared label',session_id:'session:a',operation_id:'op:a',sequence:1,offset_ms:0,cost_units:null,tool:'note_read',status:'completed',paths:['10_Research/Literature Radar.md']};
 const live=await page.evaluate(({base})=>{
  const w=window as any,s=w.__kosmosStandalone,k=w.__kosmos;k.clearTraversalObservability();
  s.receiveTraversalForTest(base);s.receiveTraversalForTest({...base,agent_id:'agent:b',sequence:2});
  return k.getDiagnostics();
 },{base});
 expect(live.agentTraversalHops).toBe(2);expect(live.agentTraversalAgents).toBe(2);
 await page.evaluate(({base})=>{
  const s=(window as any).__kosmosStandalone;
  s.loadReplayForTest({schema_version:1,metadata:{started_at:'2026-08-31T00:00:00.000Z',service_protocol:'draft.1',viewer_version:'0.8.0',corpus_hash:null,redaction:'Traversal envelopes only; no note bodies, tokens, prompts, credentials, or raw errors.'},truncated:false,events:[base,{...base,sequence:2,agent_id:'agent:b',offset_ms:1}]});
  s.replayActionForTest('play');
 },{base});
 await page.waitForFunction(()=>(window as any).__kosmosStandalone.getObservabilityInfo().replay.ended);
 expect(await page.evaluate(()=>(window as any).__kosmos.getDiagnostics().agentTraversalAgents)).toBe(2);
 const buffered=await page.evaluate(({base})=>{
  const s=(window as any).__kosmosStandalone;
  s.receiveTraversalForTest({...base,sequence:3});s.receiveTraversalForTest({...base,sequence:4,agent_id:'agent:b'});
  s.replayActionForTest('live');return (window as any).__kosmos.getDiagnostics();
 },{base});
 expect(buffered.agentTraversalHops).toBe(2);expect(buffered.agentTraversalAgents).toBe(2);
});
