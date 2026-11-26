export const SIZE = 7;

function buildEdges(size) {
  const edges = [];
  for (const orientation of ['h', 'v']) {
    const rows = orientation === 'h' ? size + 1 : size;
    const cols = orientation === 'v' ? size + 1 : size;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        edges.push({ id: `${orientation}-${row}-${col}`, row, col, orientation });
      }
    }
  }
  return edges;
}

const edgesBySize = new Map();

export function edgesFor(size) {
  if (!edgesBySize.has(size)) edgesBySize.set(size, buildEdges(size));
  return edgesBySize.get(size);
}

export const EDGES = edgesFor(SIZE);

function inspectClue(clue, row, col, marks) {
  if (clue === null) return 'neutral';

  const sides = [
    marks[`h-${row}-${col}`],
    marks[`h-${row + 1}-${col}`],
    marks[`v-${row}-${col}`],
    marks[`v-${row}-${col + 1}`],
  ];
  const lines = sides.filter((side) => side === 'line').length;
  const available = sides.filter((side) => side !== 'cross').length;

  if (lines > clue || available < clue) return 'conflict';
  return lines === clue ? 'met' : 'neutral';
}

function formsSingleLoop(size, marks) {
  const neighbors = new Map();
  const stride = size + 1;

  for (const { id, row, col, orientation } of edgesFor(size)) {
    if (marks[id] !== 'line') continue;

    const start = row * stride + col;
    const end = start + (orientation === 'h' ? 1 : stride);
    if (!neighbors.has(start)) neighbors.set(start, []);
    if (!neighbors.has(end)) neighbors.set(end, []);
    neighbors.get(start).push(end);
    neighbors.get(end).push(start);
  }

  if (neighbors.size === 0) return false;
  for (const adjacent of neighbors.values()) {
    if (adjacent.length !== 2) return false;
  }

  const visited = new Set();
  const remaining = [neighbors.keys().next().value];
  while (remaining.length > 0) {
    const vertex = remaining.pop();
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    remaining.push(...neighbors.get(vertex));
  }
  return visited.size === neighbors.size;
}

export function inspectBoard(clues, marks) {
  const clueStates = clues.map((cells, row) => cells.map((clue, col) => inspectClue(clue, row, col, marks)));
  const cluesMet = clues.every((cells, row) => cells.every((clue, col) => (
    clue === null || clueStates[row][col] === 'met'
  )));

  return { clueStates, solved: cluesMet && formsSingleLoop(clues.length, marks) };
}
