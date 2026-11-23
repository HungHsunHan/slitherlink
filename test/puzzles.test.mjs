import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { puzzles } from '../public/puzzles.mjs';
import { inspectBoard } from '../public/rules.mjs';
import { cellEdges, solvePuzzle } from '../scripts/puzzle-solver.mjs';

const ranges = {
  easy: { clues: [31, 35], nodes: [1, 12] },
  medium: { clues: [24, 28], nodes: [13, 80] },
  hard: { clues: [16, 21], nodes: [81, 2500] },
};

for (const [difficulty, { clues: [minClues, maxClues], nodes: [minNodes, maxNodes] }] of Object.entries(ranges)) {
  describe(`${difficulty} puzzle bank`, () => {
    test('offers 30 levels', () => assert.equal(puzzles[difficulty].length, 30));

    test('has 7×7 boards of the expected clue density', () => {
      for (const { clues } of puzzles[difficulty]) {
        assert.equal(clues.length, 7);
        assert.ok(clues.every((row) => row.length === 7));
        assert.ok(clues.flat().every((clue) => [null, 0, 1, 2, 3].includes(clue)));
        const clueCount = clues.flat().filter((clue) => clue !== null).length;
        assert.ok(clueCount >= minClues && clueCount <= maxClues);
      }
    });

    test('has a unique solution and search effort within this difficulty range', () => {
      puzzles[difficulty].forEach(({ clues, solution }, index) => {
        const result = solvePuzzle(clues);
        assert.deepEqual(result.solutions, [solution], `level ${index + 1} solution`);
        assert.ok(result.nodes >= minNodes && result.nodes <= maxNodes, `level ${index + 1} effort`);
      });
    });
  });
}

test('all 90 levels have distinct clues and loop shapes', () => {
  const levels = Object.values(puzzles).flat();
  assert.equal(new Set(levels.map(({ clues }) => JSON.stringify(clues))).size, 90);
  assert.equal(new Set(levels.map(({ solution }) => [...solution].sort().join(','))).size, 90);
});

test('the browser game recognizes every supplied answer as solved', () => {
  for (const [difficulty, levels] of Object.entries(puzzles)) {
    levels.forEach(({ clues, solution }, index) => {
      const marks = Object.fromEntries(solution.map((edge) => [edge, 'line']));
      assert.ok(inspectBoard(clues, marks).solved, `${difficulty} level ${index + 1}`);
    });
  }
});

test('solver rejects a layout that requires two separate loops', () => {
  const lines = new Set([...cellEdges[1][1], ...cellEdges[5][5]]);
  const clues = cellEdges.map((row) => row.map((edges) => edges.filter((edge) => lines.has(edge)).length));
  assert.deepEqual(solvePuzzle(clues).solutions, []);
});

test('solver distinguishes a unique puzzle from a board with multiple solutions', () => {
  const clues = cellEdges.map((row) => row.map(() => null));
  assert.equal(solvePuzzle(clues).solutions.length, 2);
});
