import assert from 'node:assert/strict';
import test from 'node:test';
import { EDGES, SIZE, edgesFor, inspectBoard } from '../public/rules.mjs';

function blankClues(size = SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function cellLoop(row, col) {
  return {
    [`h-${row}-${col}`]: 'line',
    [`h-${row + 1}-${col}`]: 'line',
    [`v-${row}-${col}`]: 'line',
    [`v-${row}-${col + 1}`]: 'line',
  };
}

test('7×7 的棋盤有 112 條唯一邊，包含底部和右側外框', () => {
  assert.equal(SIZE, 7);
  assert.equal(new Set(EDGES.map(({ id }) => id)).size, 112);
  assert.equal(EDGES.length, 112);
  assert.ok(EDGES.some(({ id }) => id === 'h-7-6'));
  assert.ok(EDGES.some(({ id }) => id === 'v-6-7'));
});

test('9×9 的棋盤有 180 條唯一邊，包含底部和右側外框', () => {
  const ids = new Set(edgesFor(9).map(({ id }) => id));
  assert.equal(ids.size, 180);
  assert.ok(ids.has('h-9-8'));
  assert.ok(ids.has('v-8-9'));
});

test('9×9 接受最右下角符合線索的閉環', () => {
  const clues = blankClues(9);
  clues[7][8] = 1;
  clues[8][7] = 1;
  assert.ok(inspectBoard(clues, cellLoop(8, 8)).solved);
});

test('9×9 拒絕原範圍外另一個分離的閉環', () => {
  assert.equal(inspectBoard(blankClues(9), { ...cellLoop(0, 0), ...cellLoop(8, 8) }).solved, false);
});

test('空白或開放的線段都不構成閉環', () => {
  const clues = blankClues();
  assert.equal(inspectBoard(clues, {}).solved, false);
  assert.equal(inspectBoard(clues, { 'h-0-0': 'line' }).solved, false);
});

test('允許一個符合所有線索的閉環，其他邊可以留白或打叉', () => {
  const clues = blankClues();
  clues[0][1] = 1;
  clues[1][0] = 1;
  clues[1][1] = 0;
  assert.equal(inspectBoard(clues, { ...cellLoop(0, 0), 'v-0-2': 'cross' }).solved, true);
});

test('單一閉環仍須符合所有線索', () => {
  const clues = blankClues();
  clues[1][1] = 1;
  assert.equal(inspectBoard(clues, cellLoop(0, 0)).solved, false);
});

test('禁止互相分離的兩個閉環', () => {
  assert.equal(inspectBoard(blankClues(), { ...cellLoop(0, 0), ...cellLoop(6, 6) }).solved, false);
});

test('禁止共享同一個交叉點的兩個閉環', () => {
  assert.equal(inspectBoard(blankClues(), { ...cellLoop(0, 0), ...cellLoop(1, 1) }).solved, false);
});

test('已經有足夠的線段時標示達成線索', () => {
  const clues = blankClues();
  clues[0][0] = 1;
  assert.equal(inspectBoard(clues, { 'h-0-0': 'line' }).clueStates[0][0], 'met');
});

test('邊數超過線索時標示衝突', () => {
  const clues = blankClues();
  clues[0][0] = 1;
  const marks = { 'h-0-0': 'line', 'v-0-0': 'line' };
  assert.equal(inspectBoard(clues, marks).clueStates[0][0], 'conflict');
});

test('打叉造成剩餘可用的邊不足時標示衝突', () => {
  const clues = blankClues();
  clues[0][0] = 3;
  const marks = { 'h-0-0': 'cross', 'v-0-0': 'cross' };
  assert.equal(inspectBoard(clues, marks).clueStates[0][0], 'conflict');
});

test('未達線索但還有足夠可用的邊時保持中立', () => {
  const clues = blankClues();
  clues[0][0] = 3;
  const marks = { 'h-0-0': 'line', 'v-0-0': 'cross' };
  assert.equal(inspectBoard(clues, marks).clueStates[0][0], 'neutral');
});
