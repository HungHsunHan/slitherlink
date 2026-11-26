import assert from 'node:assert/strict';
import test from 'node:test';
import { changeMark, completeAttempt, createAttempt, elapsedAt, formatTime, undoMark } from '../public/session.mjs';

const timedCelebration = {
  reward: { src: './rewards/speed-8.webp', alt: '吉伊卡哇、小八貓和兔兔在遊樂園拿著點心' },
  portraits: [],
};

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
  const completed = createAttempt();
  completed.elapsedMs = 2112;
  completeAttempt(completed, timedCelebration);

  assert.deepEqual(createAttempt(completed.bestMs), {
    marks: {},
    history: [],
    elapsedMs: 0,
    phase: 'ready',
    bestMs: 2112,
    celebration: null,
  });
});

test('the original award is saved with the completed attempt', () => {
  const attempt = createAttempt();
  completeAttempt(attempt, timedCelebration);

  assert.deepEqual(JSON.parse(JSON.stringify(attempt)).celebration, timedCelebration);
});

test('undoing a solved move clears the completed attempt’s award', () => {
  const attempt = createAttempt();
  changeMark(attempt, 'h-0-0', 'line');
  completeAttempt(attempt, timedCelebration);
  undoMark(attempt);

  assert.equal(attempt.celebration, null);
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

test('the first completion saves the actual elapsed time as the best time', () => {
  const attempt = createAttempt();
  attempt.elapsedMs = 5630;

  completeAttempt(attempt);

  assert.equal(attempt.phase, 'solved');
  assert.equal(attempt.bestMs, 5630);
});

test('a slower completion retains its actual time and the faster personal best', () => {
  const attempt = createAttempt(2050);
  attempt.elapsedMs = 3380;

  completeAttempt(attempt);

  assert.equal(formatTime(attempt.elapsedMs), '00:03');
  assert.equal(attempt.bestMs, 2050);
});
