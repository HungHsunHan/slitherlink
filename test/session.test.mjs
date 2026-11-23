import assert from 'node:assert/strict';
import test from 'node:test';
import { changeMark, createAttempt, elapsedAt, formatTime, undoMark } from '../public/session.mjs';

test('drawing the same mark again clears the edge', () => {
  const attempt = createAttempt();
  changeMark(attempt, 'h-0-0', 'line');
  changeMark(attempt, 'h-0-0', 'line');
  assert.deepEqual(attempt.marks, {});
});

test('undo restores the previous mark before undoing the original move', () => {
  const attempt = createAttempt();
  changeMark(attempt, 'h-0-0', 'line');
  changeMark(attempt, 'h-0-0', 'cross');
  assert.equal(undoMark(attempt), true);
  assert.equal(attempt.marks['h-0-0'], 'line');
  assert.equal(undoMark(attempt), true);
  assert.deepEqual(attempt.marks, {});
  assert.equal(undoMark(attempt), false);
});

test('restart clears the active attempt and keeps its personal best', () => {
  assert.deepEqual(createAttempt(2112), {
    marks: {},
    history: [],
    elapsedMs: 0,
    phase: 'ready',
    bestMs: 2112,
  });
});

test('elapsed time includes only the current running interval plus the saved time', () => {
  const attempt = createAttempt();
  attempt.elapsedMs = 2500;
  assert.equal(elapsedAt(attempt, 2000, 4500), 5000);
  assert.equal(elapsedAt(attempt, null, 9000), 2500);
});

test('time is displayed in minutes and seconds, including after an hour', () => {
  assert.equal(formatTime(59999), '00:59');
  assert.equal(formatTime(3601000), '1:00:01');
});
