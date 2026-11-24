import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { characters, pickCharacters } from '../public/characters.mjs';
import { createGameServer, parseOptions, resolveBinding } from '../server.mjs';

test('each eighth of the random range can select a different character', () => {
  assert.equal(characters.length, 8);
  assert.equal(new Set(characters.map(({ id }) => id)).size, 8);
  assert.deepEqual(
    characters.map((_, index) => pickCharacters(1, () => index / characters.length)[0].id),
    characters.map(({ id }) => id),
  );
  assert.equal(pickCharacters(1, () => 1 - Number.EPSILON)[0].id, characters.at(-1).id);
});

test('a celebration selects the requested number of different characters even when samples repeat', () => {
  for (const count of [1, 2, 3]) {
    const selected = pickCharacters(count, () => 0);
    assert.equal(selected.length, count);
    assert.equal(new Set(selected.map(({ id }) => id)).size, count);

    for (const { id, name, src } of selected) {
      const character = characters.find((entry) => entry.id === id);
      assert.equal(name, character.name);
      assert.equal(src, character.images[0]);
    }
  }
});

test('a celebration chooses a separate image variant for each character', () => {
  const samples = [0, 1 / 3, 2 / 3, 0, 1 / 3, 2 / 3];
  const selected = pickCharacters(3, () => samples.shift());
  const variantIndexes = selected.map(({ id, src }) => {
    const character = characters.find((entry) => entry.id === id);
    return character.images.indexOf(src);
  });

  assert.deepEqual(variantIndexes.sort(), [0, 1, 2]);
});

test('the game server serves three distinct local WebP portraits for each character', async (t) => {
  const binding = resolveBinding(parseOptions([]));
  const server = createGameServer(binding);
  await once(server.listen(0, binding.host), 'listening');
  t.after(() => promisify(server.close).call(server));
  const origin = `http://${binding.host}:${server.address().port}`;

  for (const { id, images } of characters) assert.equal(images.length, 3, id);
  const sources = characters.flatMap(({ images }) => images);
  assert.equal(new Set(sources).size, 24);
  for (const src of sources) {
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
