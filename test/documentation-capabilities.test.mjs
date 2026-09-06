import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICE_MCP_TOOLS } from '../dist/service-node.mjs';
import { getNavigationEffectsCapabilities } from '../dist/navigation-effects.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');

test('current capability guide names the exact executable MCP tool inventory', () => {
  const documented = [...read('docs/CURRENT_CAPABILITIES.md').matchAll(/^\| (gkos_[a-z_]+) \|/gm)].map(match => match[1]).sort();
  assert.deepEqual(documented, SERVICE_MCP_TOOLS.map(tool => tool.name).sort());
  assert.equal(documented.length, 10);
  assert.ok(SERVICE_MCP_TOOLS.every(tool => tool.annotations.readOnlyHint === true));
});

test('capability guide covers every Effects flag without inventing a live writer', () => {
  const guide = read('docs/CURRENT_CAPABILITIES.md');
  const report = getNavigationEffectsCapabilities();
  for (const name of Object.keys(report.navigation_effects)) assert.ok(guide.includes(name), name);
  assert.equal(report.navigation_effects.apply_managed_moc, false);
  assert.equal(report.navigation_effects.agent_note_delete, false);
  assert.match(guide, /do NOT mean MCP agent-write tools exist/);
  assert.match(guide, /dedicated durable no-op audit receipt/i);
});

test('current audience guides have resolvable repository-relative Markdown links', () => {
  const files = ['README.md', 'ROADMAP.md', 'BEGINNERS_GUIDE.md', 'TECHNICAL_README.md', 'docs/CURRENT_CAPABILITIES.md'];
  for (const file of files) {
    for (const match of read(file).matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const path = decodeURIComponent(target.split('#')[0]);
      assert.ok(existsSync(resolve(root, dirname(file), path)), `${file}: ${target}`);
    }
  }
});
