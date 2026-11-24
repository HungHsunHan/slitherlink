import { pickCharacter } from './characters.mjs';
import { puzzles } from './puzzles.mjs';
import { EDGES, SIZE, inspectBoard } from './rules.mjs';
import { changeMark, completeAttempt, createAttempt, elapsedAt, formatTime, undoMark } from './session.mjs';

const DIFFICULTIES = { easy: '簡單', medium: '中等', hard: '困難' };
const STORAGE = 'slitherlink-7x7-v1';
const ATTEMPT_BANKS = { medium: 'medium-v2', hard: 'hard-v2' };
const STATE_NAMES = { line: '已畫線', cross: '已標記空邊', empty: '未標記' };
const EDGES_BY_ID = new Map(EDGES.map((edge) => [edge.id, edge]));

const get = (id) => document.getElementById(id);
const board = get('board');
const levels = get('levels');
const clueTable = get('clue-table');
const time = get('time');
const status = get('game-status');
const bestTime = get('best-time');
const levelTitle = get('level-title');
const undo = get('undo');
const restart = get('restart');
const answer = get('answer');
const confirmDialog = get('confirm-dialog');
const resultDialog = get('result-dialog');
const resultCharacter = get('result-character');
const resultButton = get('open-result');
const difficultyButtons = [...document.querySelectorAll('[data-difficulty]')];
const toolButtons = [...document.querySelectorAll('[data-tool]')];
const edgeButtons = new Map();
const edgePositions = new Map();
const clueElements = [];
const levelButtons = [];

const levelKey = (mode, level) => `${STORAGE}/${ATTEMPT_BANKS[mode] ?? mode}/${level}`;
const numberLabel = (index) => String(index + 1).padStart(2, '0');

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current game remains playable when browser storage is unavailable.
  }
}

function loadAttempt(mode, level) {
  const saved = read(levelKey(mode, level));
  if (
    !saved ||
    !Number.isFinite(saved.elapsedMs) ||
    !['ready', 'playing', 'solved'].includes(saved.phase) ||
    !saved.marks ||
    !Array.isArray(saved.history)
  ) return createAttempt();
  return saved;
}

const savedSelection = read(`${STORAGE}/selection`);
let mode = Object.hasOwn(DIFFICULTIES, savedSelection?.mode) ? savedSelection.mode : 'easy';
let level = Number.isInteger(savedSelection?.level) && puzzles[mode][savedSelection.level]
  ? savedSelection.level
  : 0;
let attempt = loadAttempt(mode, level);
let tool = 'line';
let showingAnswer = false;
let startedAt = null;
let pendingAction = null;

function setPosition(element, column, row) {
  element.style.setProperty('--x', `${column / SIZE * 100}%`);
  element.style.setProperty('--y', `${row / SIZE * 100}%`);
}

function makeBoard() {
  const elements = document.createDocumentFragment();

  for (let row = 0; row < SIZE; row += 1) {
    clueElements[row] = [];
    for (let column = 0; column < SIZE; column += 1) {
      const clue = document.createElement('span');
      clue.className = 'clue';
      clue.setAttribute('aria-hidden', 'true');
      setPosition(clue, column + 0.5, row + 0.5);
      clueElements[row][column] = clue;
      elements.append(clue);
    }
  }

  for (const edge of EDGES) {
    const horizontal = edge.orientation === 'h';
    const x = edge.col + (horizontal ? 0.5 : 0);
    const y = edge.row + (horizontal ? 0 : 0.5);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `edge edge-${edge.orientation}`;
    button.dataset.edge = edge.id;
    button.tabIndex = edgeButtons.size === 0 ? 0 : -1;
    setPosition(button, x, y);
    edgeButtons.set(edge.id, button);
    edgePositions.set(`${x * 2},${y * 2}`, button);
    elements.append(button);
  }

  for (let row = 0; row <= SIZE; row += 1) {
    for (let column = 0; column <= SIZE; column += 1) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      setPosition(dot, column, row);
      elements.append(dot);
    }
  }

  board.append(elements);
}

function makeLevels() {
  for (let index = 0; index < puzzles.easy.length; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = numberLabel(index);
    button.addEventListener('click', () => {
      selectLevel(mode, index);
      if (levelTitle.getBoundingClientRect().top < 0) {
        levelTitle.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
    });
    levelButtons.push(button);
    levels.append(button);
  }
}

function renderClues() {
  const clues = puzzles[mode][level].clues;
  const table = document.createDocumentFragment();
  const caption = document.createElement('caption');
  caption.textContent = '題目數字';
  table.append(caption);
  const header = document.createElement('thead').insertRow();
  for (let column = 0; column <= SIZE; column += 1) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = column === 0 ? '列' : `第 ${column} 欄`;
    header.append(cell);
  }
  table.append(header.parentElement);
  const rows = document.createElement('tbody');
  for (const [rowIndex, row] of clues.entries()) {
    const tableRow = rows.insertRow();
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = `第 ${rowIndex + 1} 列`;
    tableRow.append(label);
    for (const [column, clue] of row.entries()) {
      clueElements[rowIndex][column].textContent = clue ?? '';
      tableRow.insertCell().textContent = clue ?? '空白';
    }
  }
  table.append(rows);
  clueTable.replaceChildren(table);
}

function renderPicker() {
  difficultyButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.difficulty === mode));
  });

  let completed = 0;
  levelButtons.forEach((button, index) => {
    const levelAttempt = index === level ? attempt : read(levelKey(mode, index));
    const done = Number.isFinite(levelAttempt?.bestMs);
    if (done) completed += 1;
    button.toggleAttribute('data-complete', done);
    button.setAttribute('aria-pressed', String(index === level));
    button.setAttribute('aria-label', `第 ${index + 1} 關${done ? '，已完成' : ''}`);
  });
  get('completion').textContent = `${completed} / ${puzzles[mode].length} 完成`;
}

function renderToolButtons() {
  toolButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    button.disabled = showingAnswer || attempt.phase === 'solved';
  });
}

function renderPlay() {
  const puzzle = puzzles[mode][level];
  const solution = showingAnswer ? new Set(puzzle.solution) : null;
  const { clueStates } = inspectBoard(puzzle.clues, attempt.marks);
  const locked = showingAnswer || attempt.phase === 'solved';

  for (const edge of EDGES) {
    const mark = (solution ? (solution.has(edge.id) ? 'line' : null) : attempt.marks[edge.id]) ?? 'empty';
    const button = edgeButtons.get(edge.id);
    button.dataset.mark = mark;
    const orientation = edge.orientation === 'h' ? '橫邊' : '直邊';
    button.setAttribute('aria-label', `第 ${edge.row + 1} 列，第 ${edge.col + 1} 欄${orientation}，${STATE_NAMES[mark]}`);
    button.setAttribute('aria-disabled', String(locked));
  }

  clueElements.forEach((row, r) => row.forEach((element, c) => {
    element.dataset.state = showingAnswer && puzzle.clues[r][c] !== null ? 'met' : clueStates[r][c];
  }));

  board.dataset.locked = String(locked);
  const message = showingAnswer ? '目前顯示解答' : {
    ready: '點選兩個圓點之間的邊開始',
    playing: '沿著圓點，圍成一條封閉迴路',
    solved: '解題成功！',
  }[attempt.phase];
  if (status.textContent !== message) status.textContent = message;
  status.parentElement.dataset.state = showingAnswer ? 'answer' : attempt.phase;
  bestTime.hidden = attempt.bestMs === null;
  bestTime.textContent = attempt.bestMs === null ? '' : `最佳 ${formatTime(attempt.bestMs)}`;
  resultButton.hidden = showingAnswer || attempt.phase !== 'solved';
  undo.disabled = showingAnswer || attempt.history.length === 0;
  restart.disabled = showingAnswer || attempt.phase === 'ready';
  get('answer-label').textContent = showingAnswer ? '返回棋盤' : '查看解答';
  answer.setAttribute('aria-pressed', String(showingAnswer));

  renderToolButtons();
  renderTime();
}

function renderTime() {
  const display = formatTime(elapsedAt(attempt, startedAt, performance.now()));
  if (time.textContent !== display) time.textContent = display;
}

function pauseClock() {
  attempt.elapsedMs = elapsedAt(attempt, startedAt, performance.now());
  startedAt = null;
}

function syncClock() {
  if (attempt.phase === 'playing' && !showingAnswer && !document.hidden) {
    startedAt ??= performance.now();
  } else {
    pauseClock();
  }
}

function saveAttempt() {
  write(levelKey(mode, level), {
    ...attempt,
    elapsedMs: elapsedAt(attempt, startedAt, performance.now()),
  });
}

function showResult(celebrate = false) {
  if (attempt.phase !== 'solved' || showingAnswer) return;

  const snapshot = board.cloneNode(true);
  snapshot.removeAttribute('id');
  snapshot.removeAttribute('aria-describedby');
  snapshot.inert = true;
  get('result-board').replaceChildren(snapshot);
  get('result-level').textContent = levelTitle.textContent;
  get('result-time').textContent = formatTime(attempt.elapsedMs);
  resultCharacter.replaceChildren();
  resultCharacter.hidden = !celebrate;
  if (celebrate) {
    const character = pickCharacter();
    const image = new Image(180, 180);
    image.alt = '';
    image.src = character.src;
    const caption = document.createElement('figcaption');
    caption.textContent = character.name;
    resultCharacter.append(image, caption);
  }
  resultDialog.toggleAttribute('data-celebrate', celebrate);
  resultDialog.showModal();
}

function updateAfterMove() {
  const { solved } = inspectBoard(puzzles[mode][level].clues, attempt.marks);
  if (solved) {
    pauseClock();
    completeAttempt(attempt);
    renderPicker();
  }
  syncClock();
  saveAttempt();
  renderPlay();
  if (solved) showResult(true);
}

function playEdge(button, mark) {
  if (showingAnswer || attempt.phase === 'solved') return;
  changeMark(attempt, button.dataset.edge, mark);
  updateAfterMove();
}

function renderLevel() {
  const dot = document.createElement('span');
  dot.textContent = '·';
  levelTitle.replaceChildren(`${DIFFICULTIES[mode]} `, dot, ` 第 ${numberLabel(level)} 關`);
  renderClues();
  renderPicker();
  syncClock();
  renderPlay();
}

function selectLevel(nextMode, nextLevel) {
  if (nextMode === mode && nextLevel === level) return;
  pauseClock();
  saveAttempt();
  mode = nextMode;
  level = nextLevel;
  attempt = loadAttempt(mode, level);
  showingAnswer = false;
  tool = 'line';
  write(`${STORAGE}/selection`, { mode, level });
  write(`${STORAGE}/last/${mode}`, level);
  renderLevel();
}

function confirmChoice(title, description, actionLabel, callback) {
  get('confirm-title').textContent = title;
  get('confirm-description').textContent = description;
  get('confirm-action').textContent = actionLabel;
  pendingAction = callback;
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
}

function setAnswer(visible) {
  showingAnswer = visible;
  syncClock();
  saveAttempt();
  renderPlay();
}

board.addEventListener('click', ({ target }) => {
  const button = target.closest('[data-edge]');
  if (button) playEdge(button, tool);
});

board.addEventListener('contextmenu', (event) => {
  const button = event.target.closest('[data-edge]');
  if (!button) return;
  event.preventDefault();
  playEdge(button, 'cross');
});

board.addEventListener('focusin', (event) => {
  const button = event.target.closest('[data-edge]');
  if (!button) return;
  const previous = board.querySelector('[tabindex="0"]');
  if (previous) previous.tabIndex = -1;
  button.tabIndex = 0;
});

const DIRECTIONS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

board.addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-edge]');
  if (!button) return;
  if (event.key.toLowerCase() === 'x') {
    if (!event.repeat) playEdge(button, 'cross');
    return;
  }

  const direction = DIRECTIONS[event.key];
  if (!direction) return;
  event.preventDefault();
  const { row, col, orientation } = EDGES_BY_ID.get(button.dataset.edge);
  const x = col * 2 + Number(orientation === 'h');
  const y = row * 2 + Number(orientation === 'v');
  const [dx, dy] = direction;
  const aligned = edgePositions.get(`${x + dx * 2},${y + dy * 2}`);
  const firstTurn = edgePositions.get(`${x + dx + dy},${y + dy + dx}`);
  const secondTurn = edgePositions.get(`${x + dx - dy},${y + dy - dx}`);
  const sameAxis = orientation === 'h' ? dx !== 0 : dy !== 0;
  const next = sameAxis ? aligned ?? firstTurn ?? secondTurn : firstTurn ?? secondTurn ?? aligned;
  next?.focus();
});

difficultyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.difficulty;
    const recent = read(`${STORAGE}/last/${next}`);
    selectLevel(next, Number.isInteger(recent) && puzzles[next][recent] ? recent : 0);
  });
});

toolButtons.forEach((button) => {
  button.addEventListener('click', () => {
    tool = button.dataset.tool;
    renderToolButtons();
  });
});

undo.addEventListener('click', () => {
  if (!showingAnswer && undoMark(attempt)) updateAfterMove();
});

restart.addEventListener('click', () => {
  confirmChoice('重新開始這一關？', '這一關的標記與本次用時將清除，最佳紀錄會保留。', '重新開始', () => {
    startedAt = null;
    attempt = createAttempt(attempt.bestMs);
    saveAttempt();
    renderPlay();
    board.querySelector('[tabindex="0"]')?.focus();
  });
});

answer.addEventListener('click', () => {
  if (showingAnswer) {
    setAnswer(false);
  } else {
    confirmChoice('查看本關解答？', '解答會顯示完整迴路，返回時可繼續你的進度。', '顯示解答', () => setAnswer(true));
  }
});

resultButton.addEventListener('click', () => showResult());

get('open-help').addEventListener('click', () => get('help-dialog').showModal());

confirmDialog.addEventListener('close', () => {
  const action = pendingAction;
  pendingAction = null;
  if (confirmDialog.returnValue === 'confirm') action?.();
});

document.addEventListener('visibilitychange', () => {
  syncClock();
  saveAttempt();
  renderTime();
});

window.addEventListener('pagehide', () => {
  pauseClock();
  saveAttempt();
});
window.addEventListener('pageshow', () => {
  syncClock();
  renderTime();
});

makeBoard();
makeLevels();
renderLevel();
setInterval(renderTime, 200);
