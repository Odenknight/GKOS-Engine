// Isolated client transport test. Mocked Engine data is test-only, never shipped.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createObservatory,loadPublicArtifacts} from '../server/index.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.argv[2]||'playwright');
const server=createObservatory({loaded:await loadPublicArtifacts()});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const note={id:'file:Test/note.md',path:'Test/note.md',label:'Transport test note',uid:null,type:'note',sensitivity:'public'};
const graph={nodes:[{...note,kind:'file',area:'Test',depth:1,tags:[],aliases:[],color:'#83cff0',outgoing:0,incoming:0,gkx:{sensitivity:'public',supersedesIds:[],supersededByIds:[]}}],links:[],areas:['Vault','Test'],stats:{},diagnostics:{}};
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/engine/**',async route=>{const request=route.request();requests.push({url:request.url(),auth:request.headers().authorization});assert.equal(request.headers().authorization,'Bearer viewer-test-credential');assert.equal(request.url().includes('viewer-test-credential'),false);const path=new URL(request.url()).pathname;if(path==='/engine/events')return route.fulfill({status:200,contentType:'text/event-stream',headers:{'GKOS-Event-Session':'fixture:stream'},body:[1,2].map(i=>'data: '+JSON.stringify({schema_version:1,sequence:i,agent_id:'agent:'+i,session_id:'session:one',operation_id:'operation:one',offset_ms:1250,cost_units:null,paths:['Test/note.md'],tool:'gkos_record_validate',agent_label:'test agent',status:'completed'})+'\n\n').join('')});return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(path==='/engine/graph'?graph:{notes:[note],count:1})});});
 await page.goto(`http://127.0.0.1:${server.address().port}/live.html`);assert.equal(requests.length,0);await page.locator('#engine-token').fill('viewer-test-credential');await page.locator('#connect-form button[type=submit]').click();await page.waitForSelector('#live-notes button',{state:'attached'});assert.equal(await page.locator('#engine-token').inputValue(),'');
 const frame=page.frames().find(f=>f.url().endsWith('/live-frame.html'));await frame.waitForFunction(()=>window.__kosmos?.getRenderStats().frames>3);
 await page.locator('.live-section').first().locator('summary').click();await page.locator('#live-notes button').click();await page.waitForFunction(()=>document.querySelector('#note-title').textContent==='Transport test note');assert.match(await page.locator('#note-detail').textContent(),/Test\/note.md/);assert.equal(requests.filter(r=>r.url.endsWith('/engine/notes')).length,2);
 await page.locator('#refresh-note').click();await page.waitForFunction(()=>document.querySelector('#note-detail').textContent.includes('"sensitivity"'));await page.locator('#events').click();await page.waitForSelector('#live-events>details');assert.equal(await page.locator('#live-events>details').count(),2);await page.locator('#live-events>details>summary').first().click();await page.waitForSelector('#live-events li');assert.match(await page.locator('#live-events').textContent(),/gkos_record_validate/);

 await frame.waitForFunction(()=>window.__kosmos?.getDiagnostics()?.agentTraversalHops>0);
 const rendererState=await frame.evaluate(()=>({diagnostics:window.__kosmos.getDiagnostics(),render:window.__kosmos.getRenderStats()}));
 console.log(JSON.stringify({probe:'mocked SSE event reaches actual renderer; same-label agents',eventCount:2,distinctAgentIds:2,distinctLabels:1,rendererHops:rendererState.diagnostics.agentTraversalHops,frames:rendererState.render.frames,drawCalls:rendererState.render.drawCalls}));
 assert.equal(rendererState.diagnostics.agentTraversalHops,2,'same-label distinct IDs must retain two independent renderer heads');
 assert.ok(rendererState.render.frames>3);
 assert.ok(rendererState.render.drawCalls>0);
 assert.equal(rendererState.diagnostics.agentTraversalAgents,2);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'../reports/consumer-identity-observatory.png',fullPage:true});
 const checks=await frame.evaluate(()=>{
  const app=window.__kosmos,path=['Test/note.md'];
  app.clearTraversalObservability();
  app.notifyAgentTraversal(path,'read','same',true,'stable:a');
  app.notifyAgentTraversal(path,'read','renamed',true,'stable:a');
  const renamed=app.getDiagnostics();
  app.notifyAgentTraversal(path,'read','renamed',true,'stable:b');
  const distinct=app.getDiagnostics();
  app.clearTraversalObservability();
  app.notifyAgentTraversal(path,'read','legacy');app.notifyAgentTraversal(path,'read','legacy');
  const legacy=app.getDiagnostics();
  app.notifyAgentTraversal(path,'read','legacy',false,'legacy');
  const namespaces=app.getDiagnostics();
  app.clearTraversalObservability();
  for(let i=0;i<200;i++)app.notifyAgentTraversal(path,'read','churn',false,'id:'+i);
  const bounded=app.getDiagnostics();
  app.clearTraversalObservability();
  return {renamed,distinct,legacy,namespaces,bounded,cleared:app.getDiagnostics()};
 });
 assert.equal(checks.renamed.agentTraversalHops,1,'renaming a stable ID does not fork identity');
 assert.equal(checks.distinct.agentTraversalAgents,2,'replay uses stable IDs');
 assert.equal(checks.legacy.agentTraversalHops,1,'label-only compatibility remains explicit');
 assert.equal(checks.namespaces.agentTraversalAgents,2,'legacy labels never alias explicit IDs');
 assert.equal(checks.bounded.agentTraversalHops,25);assert.ok(checks.bounded.agentColorCacheEntries<=64);
 assert.equal(checks.cleared.agentTraversalAgents,0);
 console.log(JSON.stringify({identityRegression:'pass',checks}));
 assert.equal(await page.locator('#live-events li details[open]').count(),0);assert.match(await page.locator('#live-events time').first().textContent(),/Received .*Engine \+1250 ms/);const downloading=page.waitForEvent('download');await page.locator('#download-events').click();const download=await downloading;const saved=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(saved.entries.length,2);assert.equal(saved.entries[0].event.agent_id,'agent:1');assert.equal(JSON.stringify(saved).includes('viewer-test-credential'),false);assert.equal(saved.entries[0].event.offset_ms,1250);await download.delete();assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#disconnect').click();assert.equal(await page.locator('#live-notes button').count(),0);assert.equal(await page.locator('#live-events li').count(),0);assert.equal(await page.locator('#download-events').isDisabled(),true);assert.match(await page.locator('#archive-status').textContent(),/0 archived/);assert.equal(await page.locator('#refresh').isDisabled(),true);assert.equal(await page.locator('#note-detail').textContent(),'No note selected.');assert.deepEqual(errors,[]);
 console.log('Live client mocked transport: header-only auth, actual renderer, summary/refetch, event feed, disconnect clearing and mobile width passed. This is not a real Engine integration test.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
