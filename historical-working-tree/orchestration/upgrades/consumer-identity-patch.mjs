import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('./',import.meta.url);
function edit(path,from,to){const f=new URL(path,root),s=readFileSync(f,'utf8');if(!s.includes(from))throw Error(path+': missing '+from);writeFileSync(f,s.replaceAll(from,to));}
for(const prefix of ['kosmos/','observatory/web/vendor/kosmos-oden/source/']){
 const f=prefix+'src/renderer/renderer.ts';
 edit(f,'agent?: string, replay?: boolean','agent?: string, replay?: boolean, agentId?: string');
 edit(f,'agent?: string, replay = false','agent?: string, replay = false, agentId?: string');
 edit(f,'id: string; t: number; agent: string','id: string; t: number; agent: string; label: string');
 edit(f,'const who = String(agent || "").trim() || DEFAULT_AGENT;',`const displayLabel = String(agent || "").trim() || DEFAULT_AGENT;
    // Explicit identity is opaque and separate from legacy label-only identity.
    const who = typeof agentId === "string" && agentId.trim()
      ? JSON.stringify(["id", agentId]) : JSON.stringify(["label", displayLabel]);`);
 edit(f,'last.t = now; touched = true;', 'last.t = now; last.label = displayLabel; touched = true;');
 edit(f,'agentSteps.push({ id, t: now, agent: who })','agentSteps.push({ id, t: now, agent: who, label: displayLabel })');
 edit(f,'if (m.name.textContent !== s.agent) m.name.textContent = s.agent;','if (m.name.textContent !== s.label) m.name.textContent = s.label;');
 edit(f,'`Replay · ${who}` : (who === DEFAULT_AGENT ? "Agent traversal" : who + " traversal")','`Replay · ${displayLabel}` : (displayLabel === DEFAULT_AGENT ? "Agent traversal" : displayLabel + " traversal")');
 edit(f,'__agentColors.set(key, val);','if (__agentColors.size >= 64) __agentColors.delete(__agentColors.keys().next().value!);\n    __agentColors.set(key, val);');
 edit(f,'agentTraversalHops: agentSteps.length,','agentTraversalHops: agentSteps.length, agentTraversalAgents: new Set(agentSteps.map(s => s.agent)).size, agentColorCacheEntries: __agentColors.size,');
}
edit('kosmos/src/standalone/standalone.ts','event.agent_label, false)','event.agent_label, false, event.agent_id)');
edit('kosmos/src/standalone/standalone.ts','event.agent_label, true)','event.agent_label, true, event.agent_id)');
edit('observatory/web/live-frame.mjs','v.agent_label,false)','v.agent_label,false,v.agent_id)');
