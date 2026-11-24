import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { puzzles } from '../public/puzzles.mjs';
import { inspectBoard } from '../public/rules.mjs';
import { cellEdges, size, solvePuzzle } from '../scripts/puzzle-solver.mjs';

const ranges = {
  easy: { clues: [31, 35], nodes: [1, 12] },
  medium: { clues: [24, 28], nodes: [13, 80] },
  hard: { clues: [26, 29], nodes: [501, 2500] },
};

function enclosedCells(solution) {
  const edges = new Set(solution);
  let area = 0;
  for (let row = 0; row < size; row++) {
    let inside = false;
    for (let column = 0; column < size; column++) {
      // A row starts outside and changes sides at each vertical loop edge.
      if (edges.has(`v-${row}-${column}`)) inside = !inside;
      if (inside) area++;
    }
  }
  return area;
}

function zeroClues({ clues }) {
  return clues.flat().filter((clue) => clue === 0).length;
}

function blankCells({ clues }) {
  return clues.flat().filter((clue) => clue === null).length;
}

function mean(levels, measure) {
  return levels.reduce((sum, level) => sum + measure(level), 0) / levels.length;
}

for (const [difficulty, { clues: [minClues, maxClues], nodes: [minNodes, maxNodes] }] of Object.entries(ranges)) {
  describe(`${difficulty} puzzle bank`, () => {
    test('offers 30 levels', () => assert.equal(puzzles[difficulty].length, 30));

    test('has 7×7 boards of the expected clue density', () => {
      puzzles[difficulty].forEach(({ clues }, index) => {
        assert.equal(clues.length, 7);
        assert.ok(clues.every((row) => row.length === 7));
        assert.ok(clues.flat().every((clue) => [null, 0, 1, 2, 3].includes(clue)));
        const clueCount = clues.flat().filter((clue) => clue !== null).length;
        assert.ok(clueCount >= minClues && clueCount <= maxClues, `level ${index + 1} has ${clueCount} clues`);
      });
    });

    test('has a unique solution and search effort within this difficulty range', () => {
      puzzles[difficulty].forEach(({ clues, solution }, index) => {
        const result = solvePuzzle(clues);
        assert.deepEqual(result.solutions, [solution], `level ${index + 1} solution`);
        assert.ok(result.nodes >= minNodes && result.nodes <= maxNodes, `level ${index + 1} needed ${result.nodes} nodes`);
      });
    });
  });
}

test('all 90 levels have distinct clues and loop shapes', () => {
  const levels = Object.values(puzzles).flat();
  assert.equal(new Set(levels.map(({ clues }) => JSON.stringify(clues))).size, 90);
  assert.equal(new Set(levels.map(({ solution }) => [...solution].sort().join(','))).size, 90);
});

test('every hard puzzle encloses 36–42 cells', () => {
  puzzles.hard.forEach(({ solution }, index) => {
    const area = enclosedCells(solution);
    assert.ok(area >= 36 && area <= 42, `level ${index + 1} encloses ${area} cells`);
  });
});

test('every hard puzzle hides all zero clues', () => {
  puzzles.hard.forEach((level, index) => {
    assert.equal(zeroClues(level), 0, `level ${index + 1} shows a zero`);
  });
});

test('average enclosure grows with difficulty', () => {
  const { easy, medium, hard } = puzzles;
  const averageArea = (levels) => mean(levels, ({ solution }) => enclosedCells(solution));
  assert.ok(averageArea(easy) < averageArea(medium));
  assert.ok(averageArea(medium) < averageArea(hard));
});

test('the average number of visible zero clues drops with difficulty', () => {
  const { easy, medium, hard } = puzzles;
  assert.ok(mean(easy, zeroClues) > mean(medium, zeroClues));
  assert.ok(mean(medium, zeroClues) > mean(hard, zeroClues));
});

test('hard puzzles have fewer blank cells on average than medium puzzles', () => {
  const { medium, hard } = puzzles;
  assert.ok(mean(hard, blankCells) < mean(medium, blankCells));
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
