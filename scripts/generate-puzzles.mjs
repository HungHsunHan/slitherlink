import { writeFile } from 'node:fs/promises';
import { cellEdges, edgeIds, inspectLines, size, solvePuzzle } from './puzzle-solver.mjs';

const difficulties = {
  easy: { minClues: 31, maxClues: 35, minNodes: 1, maxNodes: 12 },
  medium: { minClues: 24, maxClues: 28, minNodes: 13, maxNodes: 80 },
  hard: { minClues: 16, maxClues: 21, minNodes: 81, maxNodes: 2500 },
};
const allCells = Array.from({ length: size * size }, (_, index) => index);
const positions = allCells.map((index) => [Math.floor(index / size), index % size]);
const neighbors = positions.map(([row, column]) => [
  [row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1],
].filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size).map(([r, c]) => r * size + c));

// Fixed seed so regenerating the published bank leaves level numbers stable.
let seed = 0x61ce408d;
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

function createBoundary() {
  const edges = new Uint8Array(edgeIds.length);
  const region = new Uint8Array(allCells.length);
  toggleCell(region, edges, pickIndex(allCells.length));

  let area = 1;
  const targetArea = 15 + pickIndex(23);
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

  for (let index = 0; index < 35; index++) {
    const cell = pickIndex(allCells.length);
    const areaAfter = area + (region[cell] ? -1 : 1);
    if (areaAfter < 13 || areaAfter > 40) continue;
    if (!neighbors[cell].some((other) => region[other])) continue;
    toggleCell(region, edges, cell);
    if (hasOneBoundary(edges)) area = areaAfter;
    else toggleCell(region, edges, cell);
  }

  const perimeter = edges.reduce((sum, value) => sum + value, 0);
  if (perimeter < 28 || perimeter > 54) return null;
  const occupied = positions.filter((_, index) => region[index]);
  for (const axis of [0, 1]) {
    const coordinates = occupied.map((cell) => cell[axis]);
    if (Math.max(...coordinates) - Math.min(...coordinates) < 5) return null;
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
  const { minClues, maxClues, minNodes, maxNodes } = difficulty;
  const target = minClues + pickIndex(maxClues - minClues + 1);
  const clues = cellEdges.map((row) => row.map((edgesOfCell) =>
    edgesOfCell.reduce((sum, edge) => sum + edges[edge], 0),
  ));
  let count = allCells.length;
  let result;

  // A clue that is necessary now stays necessary after further clues are removed.
  for (const cell of shuffled(allCells)) {
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
  const levels = [];
  for (let attempt = 0; levels.length < 30 && attempt < 3000; attempt++) {
    const boundary = createBoundary();
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
await writeFile(new URL('../public/puzzles.mjs', import.meta.url), source.join('\n'));
