import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Cloudflare serves only the public game directory without invoking a Worker script', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.workers_dev, true);
  assert.equal(config.assets.directory, './public');
  assert.equal(config.main, undefined);
  assert.equal(config.assets.binding, undefined);
  assert.ok(!config.assets.run_worker_first);
});
