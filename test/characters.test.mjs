import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { characters, pickCharacter } from '../public/characters.mjs';
import { createGameServer, parseOptions, resolveBinding } from '../server.mjs';

test('each eighth of the random range selects a different character', () => {
  assert.equal(characters.length, 8);
  assert.equal(new Set(characters.map(({ id }) => id)).size, 8);
  assert.deepEqual(
    characters.map((_, index) => pickCharacter(index / characters.length)),
    characters,
  );
  assert.equal(pickCharacter(1 - Number.EPSILON), characters.at(-1));
});

test('the game server serves eight distinct local WebP portraits', async (t) => {
  const binding = resolveBinding(parseOptions([]));
  const server = createGameServer(binding);
  await once(server.listen(0, binding.host), 'listening');
  t.after(() => promisify(server.close).call(server));
  const origin = `http://${binding.host}:${server.address().port}`;

  assert.equal(new Set(characters.map(({ src }) => src)).size, 8);
  for (const { src } of characters) {
    const url = new URL(src, origin);
    assert.equal(url.origin, origin, src);
    const response = await fetch(url);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, src);
    assert.equal(response.headers.get('content-type'), 'image/webp', src);
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', src);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', src);
  }
});
