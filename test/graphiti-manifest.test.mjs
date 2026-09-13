import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildManagedGraphitiManifest, managedEpisodeJson, reconcileManagedGraphitiPublication} from 'gkos-engine/graphiti';

const episode = () => ({name:'é😀', episode_body:'{"x":"雪"}', source_description:'a\r\nb\rc\n\u007f', reference_time:'2026-09-13T00:00:00Z'});
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

test('public reconciliation captures receipt before host work and does not turn malformed status into publication', async () => {
  const manifest=await buildManagedGraphitiManifest([{source_id:'source',raw:Buffer.from('original'),episode:episode()}]);
  const authority={corpus_id:'corpus',scope_digest:hash('scope'),configuration_digest:hash('config'),policy_digest:hash('policy')};
  const projection_id=`gkos_${'a'.repeat(32)}`;
  const mappings=[{projection_episode_id:'episode',source_digest:manifest.manifest[0].source_digest,source_id:'source'}];
  const binding={configuration_digest:authority.configuration_digest,corpus_id:authority.corpus_id,policy_digest:authority.policy_digest,
    scope_digest:authority.scope_digest,source_snapshot_digest:manifest.source_snapshot_digest};
  const observation=hash(JSON.stringify({binding,mappings,milestone:'persistence-verified',projection_id,searchability:'unverified'}));
  const publication={binding:{...binding,projection_id},mappings,observation,sequence:1};
  const result=await reconcileManagedGraphitiPublication(async()=>{
    publication.mappings[0].source_id='changed'; authority.corpus_id='changed'; return manifest;
  },authority,publication);
  assert.equal(result.binding.corpus_id,'corpus');
  assert.equal(result.episodes.get('episode').source_id,'source');
  assert.equal(await reconcileManagedGraphitiPublication(async()=>assert.fail('malformed receipt invoked source preparation'),authority,{searchable:true}),null);
});

test('managed manifest preserves raw bytes and Python ledger string canonicalization', async () => {
  const value = episode();
  const canonical = '{"episode_body":"{\\"x\\":\\"\\u96ea\\"}","name":"\\u00e9\\ud83d\\ude00","reference_time":"2026-09-13T00:00:00Z","source_description":"a\\r\\nb\\rc\\n\\u007f"}';
  assert.equal(managedEpisodeJson(value), canonical);
  const raw = Buffer.from([0xef,0xbb,0xbf,0x0d,0x0a,0xff]);
  const expected = [{episode_digest:hash(canonical), source_digest:hash(raw), source_id:'source:one'}];
  assert.deepEqual(await buildManagedGraphitiManifest([{source_id:'source:one',raw,episode:value}]), {
    manifest:expected, source_snapshot_digest:hash(JSON.stringify(expected)),
  });
});

test('managed manifest captures the entire input before hashing and preserves order', async () => {
  const inputs = ['one','two'].map(id => ({source_id:id, raw:Buffer.from(id), episode:episode()}));
  const expected = await buildManagedGraphitiManifest(inputs);
  const pending = buildManagedGraphitiManifest(inputs);
  inputs[1].raw.fill(0); inputs[1].episode.name = 'changed'; inputs.reverse();
  assert.deepEqual(await pending, expected);
  const reversed = await buildManagedGraphitiManifest(['two','one'].map(id => ({source_id:id,raw:Buffer.from(id),episode:episode()})));
  assert.notEqual(reversed.source_snapshot_digest, expected.source_snapshot_digest);
});

test('managed manifest rejects ambiguous identities and malformed string envelopes', async () => {
  const input = {source_id:'one',raw:Buffer.from('x'),episode:episode()};
  for (const inputs of [[], [input,input], [{...input,source_id:'../one'}], [{...input,episode:{...episode(),name:'\ud800'}}], [{...input,episode:{...episode(),extra:true}}]]) {
    await assert.rejects(buildManagedGraphitiManifest(inputs), TypeError);
  }
});

test('one source can bind distinct episodes but cannot mix source versions', async () => {
  const first = {source_id:'one',raw:Buffer.from('same source'),episode:episode()};
  const second = {...first,episode:{...episode(),name:'relationship'}};
  const result = await buildManagedGraphitiManifest([first,second]);
  assert.equal(result.manifest.length,2);
  assert.equal(result.manifest[0].source_digest,result.manifest[1].source_digest);
  assert.notEqual(result.manifest[0].episode_digest,result.manifest[1].episode_digest);
  await assert.rejects(buildManagedGraphitiManifest([first,{...second,raw:Buffer.from('changed source')}]),TypeError);
});
