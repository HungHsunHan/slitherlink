import { writeFile } from 'node:fs/promises';
import { createPuzzleSolver } from './puzzle-solver.mjs';

const banks = {
  7: {
    file: 'puzzles.mjs', refinements: 35, perimeterRange: [28, 54], minSpan: 6,
    difficulties: {
      easy: {
        seed: 0x61ce408d, minClues: 31, maxClues: 35, minNodes: 1, maxNodes: 12,
        areaRange: [13, 40], targetAreaRange: [15, 37],
      },
      medium: {
        seed: 0x099f7999, minClues: 24, maxClues: 26, minNodes: 80, maxNodes: 300,
        areaRange: [33, 35], minZeros: 2, maxZeros: 4,
      },
      hard: {
        seed: 0x142685c2, minClues: 26, maxClues: 29, minNodes: 501, maxNodes: 2500,
        areaRange: [36, 42], maxZeros: 0,
      },
    },
  },
  9: {
    file: 'puzzles-9.mjs', refinements: 60, perimeterRange: [40, 86], minSpan: 8,
    difficulties: {
      easy: {
        seed: 0xb63886a2, minClues: 52, maxClues: 59, minNodes: 1, maxNodes: 20,
        areaRange: [31, 48],
      },
      medium: {
        seed: 0xd470b547, minClues: 40, maxClues: 49, minNodes: 21, maxNodes: 300,
        areaRange: [49, 55], minZeros: 3, maxZeros: 6,
      },
      hard: {
        seed: 0x802a6bb6, minClues: 40, maxClues: 50, minNodes: 301, maxNodes: 1800,
        areaRange: [56, 66], maxZeros: 0,
      },
    },
  },
};

const [, , sizeArgument = '7', ...extraArgs] = process.argv;
if (extraArgs.length || !Object.hasOwn(banks, sizeArgument)) {
  throw new Error('Usage: node scripts/generate-puzzles.mjs [7|9]');
}
const size = Number(sizeArgument);
const { file, refinements, perimeterRange, minSpan, difficulties } = banks[size];
const { cellEdges, edgeIds, inspectLines, solvePuzzle } = createPuzzleSolver(size);
const allCells = Array.from({ length: size * size }, (_, index) => index);
const positions = allCells.map((index) => [Math.floor(index / size), index % size]);
const neighbors = positions.map(([row, column]) => [
  [row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1],
].filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size).map(([r, c]) => r * size + c));

let seed;
function pickIndex(length) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor(seed / 2 ** 32 * length);
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = pickIndex(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function toggleCell(region, edges, cell) {
  region[cell] ^= 1;
  const [row, column] = positions[cell];
  for (const edge of cellEdges[row][column]) edges[edge] ^= 1;
}

function hasOneBoundary(edges) {
  const { components, cycles } = inspectLines(edges);
  return components === 1 && cycles === 1;
}

function createBoundary({ areaRange, targetAreaRange = areaRange }) {
  const [minArea, maxArea] = areaRange;
  const [minTarget, maxTarget] = targetAreaRange;
  const edges = new Uint8Array(edgeIds.length);
  const region = new Uint8Array(allCells.length);
  toggleCell(region, edges, pickIndex(allCells.length));

  let area = 1;
  const targetArea = minTarget + pickIndex(maxTarget - minTarget + 1);
  while (area < targetArea) {
    const nearby = allCells.filter((cell) => !region[cell] && neighbors[cell].some((other) => region[other]));
    const next = shuffled(nearby).find((cell) => {
      toggleCell(region, edges, cell);
      if (hasOneBoundary(edges)) return true;
      toggleCell(region, edges, cell);
      return false;
    });
    if (next === undefined) return null;
    area++;
  }

  for (let index = 0; index < refinements; index++) {
    const cell = pickIndex(allCells.length);
    const areaAfter = area + (region[cell] ? -1 : 1);
    if (areaAfter < minArea || areaAfter > maxArea) continue;
    if (!neighbors[cell].some((other) => region[other])) continue;
    toggleCell(region, edges, cell);
    if (hasOneBoundary(edges)) area = areaAfter;
    else toggleCell(region, edges, cell);
  }

  const perimeter = edges.reduce((sum, value) => sum + value, 0);
  const [minPerimeter, maxPerimeter] = perimeterRange;
  if (perimeter < minPerimeter || perimeter > maxPerimeter) return null;
  const occupied = positions.filter((_, index) => region[index]);
  for (const axis of [0, 1]) {
    const coordinates = occupied.map((cell) => cell[axis]);
    if (Math.max(...coordinates) - Math.min(...coordinates) + 1 < minSpan) return null;
  }
  return { region, edges };
}

function symmetricKey(region) {
  const variants = [];
  for (const reflected of [false, true]) {
    for (let turns = 0; turns < 4; turns++) {
      const coordinates = positions.map(([row, column]) => {
        if (reflected) column = size - 1 - column;
        for (let turn = 0; turn < turns; turn++) [row, column] = [column, size - 1 - row];
        return row * size + column;
      });
      variants.push(coordinates.map((cell) => region[cell]).join(''));
    }
  }
  return variants.sort()[0];
}

function removeClues(edges, difficulty) {
  const { minClues, maxClues, minNodes, maxNodes, minZeros = 0, maxZeros } = difficulty;
  const target = minClues + pickIndex(maxClues - minClues + 1);
  const clues = cellEdges.map((row) => row.map((edgesOfCell) =>
    edgesOfCell.reduce((sum, edge) => sum + edges[edge], 0),
  ));
  let cells = shuffled(allCells);
  if (maxZeros !== undefined) {
    const values = clues.flat();
    const zeros = cells.filter((cell) => values[cell] === 0);
    if (zeros.length < minZeros) return null;
    const zerosToKeep = minZeros === maxZeros ? minZeros : minZeros + pickIndex(maxZeros - minZeros + 1);
    // Try hiding the remaining zeros before touching other clues.
    cells = [
      ...zeros.slice(zerosToKeep),
      ...cells.filter((cell) => values[cell] !== 0),
    ];
  }
  let count = allCells.length;
  let result;

  // A clue that is necessary now stays necessary after further clues are removed.
  for (const cell of cells) {
    const [row, column] = positions[cell];
    const clue = clues[row][column];
    clues[row][column] = null;
    const candidate = solvePuzzle(clues, maxNodes);
    if (candidate.exhausted || candidate.solutions.length !== 1) {
      clues[row][column] = clue;
      continue;
    }
    count--;
    result = candidate;
    if (count <= target) break;
  }

  if (count > maxClues || !result || result.nodes < minNodes) return null;
  if (maxZeros !== undefined && clues.flat().filter((clue) => clue === 0).length > maxZeros) return null;
  return { clues, solution: result.solutions[0], nodes: result.nodes };
}

function writeLevel({ clues, solution }) {
  const clueRows = clues.map((row) => `        [${row.map(String).join(', ')}],`);
  const solutionRows = [];
  for (let index = 0; index < solution.length; index += 10) {
    const edges = solution.slice(index, index + 10).map((edge) => `'${edge}'`);
    solutionRows.push(`        ${edges.join(', ')},`);
  }
  return [
    '    {', '      clues: [', ...clueRows, '      ],',
    '      solution: [', ...solutionRows, '      ],', '    },',
  ].join('\n');
}

const seenBoundaries = new Set();
const source = ['// Generated by scripts/generate-puzzles.mjs.', 'export const puzzles = {'];
for (const [name, difficulty] of Object.entries(difficulties)) {
  // Reset to this tier's seed so earlier tiers do not advance its random sequence.
  seed = difficulty.seed;
  const levels = [];
  for (let attempt = 0; levels.length < 30 && attempt < 3000; attempt++) {
    const boundary = createBoundary(difficulty);
    if (!boundary) continue;
    const key = symmetricKey(boundary.region);
    if (seenBoundaries.has(key)) continue;
    const level = removeClues(boundary.edges, difficulty);
    if (!level) continue;
    levels.push(level);
    seenBoundaries.add(key);
  }

  if (levels.length !== 30) throw new Error(`Only generated ${levels.length} ${name} levels`);
  levels.sort((a, b) => a.nodes - b.nodes);
  console.log(`${name}: ${levels.length} levels, ${levels[0].nodes}–${levels.at(-1).nodes} search nodes`);
  source.push(`  ${name}: [`, ...levels.map(writeLevel), '  ],');
}
source.push('};', '');
await writeFile(new URL(`../public/${file}`, import.meta.url), source.join('\n'));
