function patternCount(mask) {
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
}

function patternsOfDegree(edgeCount, degrees) {
  return Array.from({ length: 1 << edgeCount }, (_, mask) => mask)
    .filter((mask) => degrees.includes(patternCount(mask)));
}

const cluePatterns = Array.from({ length: 5 }, (_, clue) => patternsOfDegree(4, [clue]));

const unknown = -1;
const empty = 0;
const line = 1;

function propagate(values, checks) {
  let changed;
  let branch;
  do {
    changed = false;
    branch = null;

    for (const { edges, patterns } of checks) {
      let drawn = 0;
      let excluded = 0;
      for (let index = 0; index < edges.length; index++) {
        const value = values[edges[index]];
        if (value === line) drawn |= 1 << index;
        if (value === empty) excluded |= 1 << index;
      }

      const allBits = (1 << edges.length) - 1;
      let alwaysDrawn = allBits;
      let possiblyDrawn = 0;
      let optionCount = 0;
      for (const mask of patterns) {
        if ((mask & drawn) !== drawn || (mask & excluded) !== 0) continue;
        optionCount++;
        alwaysDrawn &= mask;
        possiblyDrawn |= mask;
      }
      if (optionCount === 0) return false;

      const undecided = allBits ^ (drawn | excluded);
      const forced = undecided & (alwaysDrawn | (allBits ^ possiblyDrawn));
      for (let index = 0; index < edges.length; index++) {
        if (forced & (1 << index)) {
          values[edges[index]] = (alwaysDrawn >> index) & 1;
          changed = true;
        }
      }

      if (optionCount > 1 && (branch === null || optionCount < branch.optionCount)) {
        branch = { edges, patterns, drawn, excluded, optionCount };
      }
    }
  } while (changed);
  return branch;
}

export function createPuzzleSolver(size) {
  const edgeIds = [];
  const edgeVertices = [];
  const vertexEdges = Array.from({ length: (size + 1) ** 2 }, () => []);
  const vertexIndex = (row, column) => row * (size + 1) + column;

  function addEdge(direction, row, column, endRow, endColumn) {
    const index = edgeIds.length;
    const start = vertexIndex(row, column);
    const end = vertexIndex(endRow, endColumn);
    edgeIds.push(`${direction}-${row}-${column}`);
    edgeVertices.push([start, end]);
    vertexEdges[start].push(index);
    vertexEdges[end].push(index);
    return index;
  }

  const horizontal = Array.from({ length: size + 1 }, (_, row) =>
    Array.from({ length: size }, (_, column) => addEdge('h', row, column, row, column + 1)),
  );
  const vertical = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size + 1 }, (_, column) => addEdge('v', row, column, row + 1, column)),
  );

  const cellEdges = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => [
      horizontal[row][column], horizontal[row + 1][column],
      vertical[row][column], vertical[row][column + 1],
    ]),
  );

  const vertexChecks = vertexEdges.map((edges) => ({
    edges, patterns: patternsOfDegree(edges.length, [0, 2]),
  }));

  function inspectLines(values) {
    const parents = new Int16Array(vertexEdges.length).fill(-1);
    let components = 0;
    let cycles = 0;
    const root = (vertex) => {
      while (parents[vertex] !== vertex) vertex = parents[vertex];
      return vertex;
    };

    for (let index = 0; index < edgeVertices.length; index++) {
      if (values[index] !== line) continue;
      const [start, end] = edgeVertices[index];
      for (const vertex of [start, end]) {
        if (parents[vertex] < 0) {
          parents[vertex] = vertex;
          components++;
        }
      }
      const startRoot = root(start);
      const endRoot = root(end);
      if (startRoot === endRoot) {
        cycles++;
      } else {
        parents[endRoot] = startRoot;
        components--;
      }
    }
    return { components, cycles };
  }

  function solvePuzzle(clues, nodeLimit = Infinity) {
    const cells = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const clue = clues[row][column];
        if (clue !== null) {
          cells.push({ edges: cellEdges[row][column], patterns: cluePatterns[clue] });
        }
      }
    }

    const checks = [...cells, ...vertexChecks];
    const solutions = [];
    let nodes = 0;
    let exhausted = false;

    function search(values) {
      if (solutions.length >= 2 || exhausted) return;
      if (nodes === nodeLimit) {
        exhausted = true;
        return;
      }
      nodes++;

      const branch = propagate(values, checks);
      if (branch === false) return;

      const { components, cycles } = inspectLines(values);
      if (cycles > 0) {
        // Once a cycle closes, every remaining edge must be empty.
        if (cycles === 1 && components === 1 && checks.every(({ edges, patterns }) => {
          const mask = edges.reduce((bits, edge, index) => bits | (values[edge] === line ? 1 << index : 0), 0);
          return patterns.includes(mask);
        })) {
          solutions.push(edgeIds.filter((_, index) => values[index] === line));
        }
        return;
      }
      if (branch === null) return;

      const { edges, patterns, drawn, excluded } = branch;
      for (const mask of patterns) {
        if ((mask & drawn) !== drawn || (mask & excluded) !== 0) continue;
        const next = values.slice();
        edges.forEach((edge, index) => { next[edge] = (mask >> index) & 1; });
        search(next);
      }
    }

    search(new Int8Array(edgeIds.length).fill(unknown));
    return { solutions, nodes, exhausted };
  }

  return { edgeIds, cellEdges, inspectLines, solvePuzzle };
}

export const size = 7;
export const { edgeIds, cellEdges, inspectLines, solvePuzzle } = createPuzzleSolver(size);
