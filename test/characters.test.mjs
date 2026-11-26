import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { characters, pickCharacters, pickSpecialReward } from '../public/characters.mjs';
import { createGameServer, parseOptions, resolveBinding } from '../server.mjs';

const rewardSamples = Array.from({ length: 7 }, (_, index) => (index + 0.5) / 7);

test('each ninth of the random range can select a different celebration category', () => {
  assert.equal(characters.length, 9);
  assert.equal(new Set(characters.map(({ id }) => id)).size, 9);
  assert.deepEqual(
    characters.map((_, index) => pickCharacters(1, () => (index + 0.5) / 9)[0].id),
    characters.map(({ id }) => id),
  );
  assert.equal(pickCharacters(1, () => 1 - Number.EPSILON)[0].id, characters.at(-1).id);
});

test('the Christmas category can select each of its ten images', () => {
  const categoryIndex = characters.findIndex(({ id }) => id === 'christmas');
  assert.notEqual(categoryIndex, -1);
  const categorySample = (categoryIndex + 0.5) / 9;
  const selected = Array.from({ length: 10 }, (_, index) => {
    const samples = [categorySample, (index + 0.5) / 10];
    return pickCharacters(1, () => samples.shift())[0];
  });

  assert.deepEqual(selected.map(({ src }) => src), characters[categoryIndex].images);
  assert.equal(new Set(selected.map(({ src }) => src)).size, 10);
});

test('a celebration can include the Christmas category only once', () => {
  const categoryIndex = characters.findIndex(({ id }) => id === 'christmas');
  const categorySample = (categoryIndex + 0.5) / 9;
  const selected = pickCharacters(3, () => categorySample);

  assert.equal(selected.filter(({ id }) => id === 'christmas').length, 1);
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

for (const [difficulty, limitMs] of [['easy', 90_000], ['medium', 150_000], ['hard', 180_000]]) {
  test(`${difficulty} awards a special image at the time limit`, () => {
    assert.ok(pickSpecialReward(difficulty, limitMs, () => 0));
  });

  test(`${difficulty} does not award a special image one millisecond over the limit`, () => {
    assert.equal(pickSpecialReward(difficulty, limitMs + 1, () => assert.fail('unexpected draw')), null);
  });
}

test('each seventh of the random range can select a different special reward', () => {
  const sources = rewardSamples.map((sample) => pickSpecialReward('easy', 0, () => sample).src);
  assert.equal(new Set(sources).size, 7);
});

test('the game server serves all character portraits and special rewards as local WebP images', async (t) => {
  const binding = resolveBinding(parseOptions([]));
  const server = createGameServer(binding);
  await once(server.listen(0, binding.host), 'listening');
  t.after(() => promisify(server.close).call(server));
  const origin = `http://${binding.host}:${server.address().port}`;

  for (const { id, images } of characters) assert.equal(images.length, id === 'christmas' ? 10 : 3, id);
  const sources = characters.flatMap(({ images }) => images);
  assert.equal(new Set(sources).size, 34);
  const rewards = rewardSamples.map((sample) => pickSpecialReward('easy', 0, () => sample).src);
  for (const src of [...sources, ...rewards]) {
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
