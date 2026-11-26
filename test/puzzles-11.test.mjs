import assert from 'node:assert/strict';
import { test } from 'node:test';
import { puzzles } from '../public/puzzles-11.mjs';
import { inspectBoard } from '../public/rules.mjs';
import { createPuzzleSolver } from '../scripts/puzzle-solver.mjs';

const size = 11;
const { solvePuzzle } = createPuzzleSolver(size);
const tiers = {
  easy: { clues: [78, 88], nodes: [1, 30] },
  medium: { clues: [62, 76], nodes: [31, 300] },
  hard: { clues: [62, 76], nodes: [301, 1800] },
};

for (const [tier, { clues: [minClues, maxClues], nodes: [minNodes, maxNodes] }] of Object.entries(tiers)) {
  test(`the 11×11 ${tier} bank offers 30 boards with the expected clues`, () => {
    assert.equal(puzzles[tier].length, 30);
    for (const { clues } of puzzles[tier]) {
      assert.equal(clues.length, size);
      assert.ok(clues.every((row) => row.length === size));
      assert.ok(clues.flat().every((clue) => [null, 0, 1, 2, 3].includes(clue)));
      const count = clues.flat().filter((clue) => clue !== null).length;
      assert.ok(count >= minClues && count <= maxClues, `${count} clues`);
    }
  });

  test(`the 11×11 ${tier} bank contains unique solutions and is ordered by search effort`, () => {
    let previousNodes = minNodes;
    for (const [index, { clues, solution }] of puzzles[tier].entries()) {
      const result = solvePuzzle(clues, maxNodes);
      assert.equal(result.exhausted, false, `level ${index + 1} search exhausted`);
      assert.deepEqual(result.solutions, [solution], `level ${index + 1} solution`);
      assert.ok(result.nodes >= previousNodes && result.nodes <= maxNodes, `level ${index + 1} needed ${result.nodes} nodes`);
      previousNodes = result.nodes;
    }
  });
}

test('all 90 11×11 levels have distinct clues and solutions', () => {
  const levels = Object.values(puzzles).flat();
  assert.equal(new Set(levels.map(({ clues }) => JSON.stringify(clues))).size, 90);
  assert.equal(new Set(levels.map(({ solution }) => [...solution].sort().join(','))).size, 90);
});

test('the browser game recognizes every supplied 11×11 answer as solved', () => {
  for (const [tier, levels] of Object.entries(puzzles)) {
    for (const [index, { clues, solution }] of levels.entries()) {
      const marks = Object.fromEntries(solution.map((edge) => [edge, 'line']));
      assert.ok(inspectBoard(clues, marks).solved, `${tier} level ${index + 1}`);
    }
  }
});
