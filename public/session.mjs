export function createAttempt(bestMs = null) {
  return { marks: {}, history: [], elapsedMs: 0, phase: 'ready', bestMs };
}

function setMark(attempt, edge, mark) {
  if (mark === null) {
    delete attempt.marks[edge];
  } else {
    attempt.marks[edge] = mark;
  }
}

export function changeMark(attempt, edge, mark) {
  const previous = attempt.marks[edge] ?? null;
  attempt.history.push([edge, previous]);
  setMark(attempt, edge, previous === mark ? null : mark);
  attempt.phase = 'playing';
}

export function undoMark(attempt) {
  const move = attempt.history.pop();
  if (!move) return false;
  setMark(attempt, ...move);
  attempt.phase = 'playing';
  return true;
}

export function completeAttempt(attempt) {
  attempt.phase = 'solved';
  attempt.bestMs = Math.min(attempt.bestMs ?? Infinity, attempt.elapsedMs);
}

export function elapsedAt(attempt, startedAt, now) {
  return attempt.elapsedMs + (startedAt === null ? 0 : Math.max(0, now - startedAt));
}

export function formatTime(milliseconds) {
  const wholeSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const seconds = wholeSeconds % 60;
  const clock = [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  return hours > 0 ? `${hours}:${clock}` : clock;
}
