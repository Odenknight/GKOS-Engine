import {createKosmosApp} from './vendor/renderer.mjs';
const send=path=>parent.postMessage({type:'engine:selected',path},location.origin);
const app=createKosmosApp({autoStart:'wait',onOpenNote:send});
let paths=new Set(),start=null;
window.addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==location.origin)return;
 if(e.data.type==='engine:graph'){
  const graph=e.data.graph;if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.links))return;
  paths=new Set(graph.nodes.filter(n=>n.kind==='file').map(n=>n.path));
  // The Engine already returns GkxGraph. Preserve its semantic fields verbatim.
  app.renderGraph(graph,'Authenticated Engine');app.setVaultStatus(true);app.showHint('Drag to orbit · scroll to zoom · click to inspect the authorized summary');
 }
 if(e.data.type==='engine:event'){const v=e.data.event;if(v.schema_version===1&&Array.isArray(v.paths))app.notifyAgentTraversal(v.paths.filter(p=>paths.has(p)),v.tool,v.agent_label,false,v.agent_id);}
});
function inspect(target,x,y){target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:x,clientY:y}));const menu=document.getElementById('kosmosCtx');if(menu?.style.display==='block'){const path=document.getElementById('insPath').textContent;if(paths.has(path))send(path);menu.style.display='none';}}
document.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};},true);
window.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'||e.target.tagName!=='CANVAS'||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;e.stopImmediatePropagation();window.dispatchEvent(new PointerEvent('pointerup',{pointerId:e.pointerId,pointerType:'mouse',clientX:e.clientX,clientY:e.clientY}));inspect(e.target,e.clientX,e.clientY);},true);
document.addEventListener('click',e=>{if(e.target.tagName!=='CANVAS'||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;e.stopImmediatePropagation();e.preventDefault();inspect(e.target,e.clientX,e.clientY);},true);
parent.postMessage({type:'engine:ready',ok:app.ok},location.origin);
