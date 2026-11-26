import { pickCharacters, pickSpecialReward } from './characters.mjs';
import { puzzles as puzzles9 } from './puzzles-9.mjs';
import { puzzles as puzzles7 } from './puzzles.mjs';
import { SIZE, edgesFor, inspectBoard } from './rules.mjs';
import { changeMark, completeAttempt, createAttempt, elapsedAt, formatTime, undoMark } from './session.mjs';

const DIFFICULTIES = { easy: '簡單', medium: '中等', hard: '困難' };
const WIN_CHARACTER_COUNTS = { easy: 1, medium: 2, hard: 3 };
const PUZZLES_BY_SIZE = { [SIZE]: puzzles7, 9: puzzles9 };
const SIZE_KEY = 'slitherlink/size';
const ATTEMPT_BANKS = { medium: 'medium-v2', hard: 'hard-v2' };
const STATE_NAMES = { line: '已畫線', cross: '已標記空邊', empty: '未標記' };

const get = (id) => document.getElementById(id);
const board = get('board');
const boardSize = get('board-size');
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
const resultBoard = get('result-board');
const resultCharacters = get('result-characters');
const resultButton = get('open-result');
const sizeButtons = [...document.querySelectorAll('button[data-size]')];
const difficultyButtons = [...document.querySelectorAll('[data-difficulty]')];
const toolButtons = [...document.querySelectorAll('[data-tool]')];
const edgeButtons = new Map();
const edgesById = new Map();
const edgePositions = new Map();
const clueElements = [];
const levelButtons = [];

const storageKey = (size) => `slitherlink-${size}x${size}-v1`;
const sizeLabel = (size) => `${size} × ${size}`;
const numberLabel = (index) => String(index + 1).padStart(2, '0');

function levelKey(size, mode, level) {
  const bank = size === SIZE ? ATTEMPT_BANKS[mode] ?? mode : mode;
  return `${storageKey(size)}/${bank}/${level}`;
}

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

function loadAttempt(size, mode, level) {
  const saved = read(levelKey(size, mode, level));
  if (
    !saved ||
    !Number.isFinite(saved.elapsedMs) ||
    !['ready', 'playing', 'solved'].includes(saved.phase) ||
    !saved.marks ||
    !Array.isArray(saved.history)
  ) return createAttempt();
  return saved;
}

function validLevel(size, mode, index) {
  return Number.isInteger(index) && PUZZLES_BY_SIZE[size][mode][index] ? index : 0;
}

function loadSelection(size) {
  const saved = read(`${storageKey(size)}/selection`);
  const mode = Object.hasOwn(DIFFICULTIES, saved?.mode) ? saved.mode : 'easy';
  return { mode, level: validLevel(size, mode, saved?.level) };
}

const savedSize = read(SIZE_KEY);
let size = Number.isInteger(savedSize) && Object.hasOwn(PUZZLES_BY_SIZE, savedSize) ? savedSize : SIZE;
let { mode, level } = loadSelection(size);
let attempt = loadAttempt(size, mode, level);
let tool = 'line';
let showingAnswer = false;
let startedAt = null;
let pendingAction = null;

function setPosition(element, column, row) {
  element.style.setProperty('--x', `${column / size * 100}%`);
  element.style.setProperty('--y', `${row / size * 100}%`);
}

function makeBoard() {
  board.dataset.size = size;
  board.style.setProperty('--unit', size);
  board.setAttribute('aria-label', `${sizeLabel(size)} 數迴棋盤`);
  boardSize.textContent = `${sizeLabel(size)} 棋盤`;
  clueElements.length = 0;
  edgeButtons.clear();
  edgesById.clear();
  edgePositions.clear();
  const elements = document.createDocumentFragment();

  for (let row = 0; row < size; row += 1) {
    clueElements[row] = [];
    for (let column = 0; column < size; column += 1) {
      const clue = document.createElement('span');
      clue.className = 'clue';
      clue.setAttribute('aria-hidden', 'true');
      setPosition(clue, column + 0.5, row + 0.5);
      clueElements[row][column] = clue;
      elements.append(clue);
    }
  }

  for (const edge of edgesFor(size)) {
    const horizontal = edge.orientation === 'h';
    const x = edge.col + (horizontal ? 0.5 : 0);
    const y = edge.row + (horizontal ? 0 : 0.5);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `edge edge-${edge.orientation}`;
    button.dataset.edge = edge.id;
    button.tabIndex = edgeButtons.size === 0 ? 0 : -1;
    setPosition(button, x, y);
    edgesById.set(edge.id, edge);
    edgeButtons.set(edge.id, button);
    edgePositions.set(`${x * 2},${y * 2}`, button);
    elements.append(button);
  }

  for (let row = 0; row <= size; row += 1) {
    for (let column = 0; column <= size; column += 1) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      setPosition(dot, column, row);
      elements.append(dot);
    }
  }

  board.replaceChildren(elements);
}

function makeLevels() {
  for (let index = 0; index < PUZZLES_BY_SIZE[size][mode].length; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = numberLabel(index);
    button.addEventListener('click', () => {
      selectLevel(size, mode, index);
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
  const { clues } = PUZZLES_BY_SIZE[size][mode][level];
  const table = document.createDocumentFragment();
  const caption = document.createElement('caption');
  caption.textContent = '題目數字';
  table.append(caption);
  const header = document.createElement('thead').insertRow();
  for (let column = 0; column <= size; column += 1) {
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
  sizeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.size) === size));
  });
  difficultyButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.difficulty === mode));
  });

  let completed = 0;
  levelButtons.forEach((button, index) => {
    const levelAttempt = index === level ? attempt : read(levelKey(size, mode, index));
    const done = Number.isFinite(levelAttempt?.bestMs);
    if (done) completed += 1;
    button.toggleAttribute('data-complete', done);
    button.setAttribute('aria-pressed', String(index === level));
    button.setAttribute('aria-label', `第 ${index + 1} 關${done ? '，已完成' : ''}`);
  });
  get('completion').textContent = `${completed} / ${PUZZLES_BY_SIZE[size][mode].length} 完成`;
}

function renderToolButtons() {
  toolButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    button.disabled = showingAnswer || attempt.phase === 'solved';
  });
}

function renderPlay() {
  const puzzle = PUZZLES_BY_SIZE[size][mode][level];
  const solution = showingAnswer ? new Set(puzzle.solution) : null;
  const { clueStates } = inspectBoard(puzzle.clues, attempt.marks);
  const locked = showingAnswer || attempt.phase === 'solved';

  for (const edge of edgesFor(size)) {
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
  write(levelKey(size, mode, level), {
    ...attempt,
    elapsedMs: elapsedAt(attempt, startedAt, performance.now()),
  });
}

function createResultPortrait({ name, src }) {
  const figure = document.createElement('figure');
  figure.className = 'result-character';
  const image = new Image(180, 180);
  image.alt = '';
  image.src = src;
  const caption = document.createElement('figcaption');
  caption.textContent = name;
  figure.append(image, caption);
  return figure;
}

function createResultReward({ alt, src }) {
  const image = new Image();
  image.className = 'result-reward';
  image.alt = alt;
  image.src = src;
  return image;
}

function showResult(animate = false) {
  if (attempt.phase !== 'solved' || showingAnswer) return;

  const snapshot = board.cloneNode(true);
  snapshot.removeAttribute('id');
  snapshot.removeAttribute('aria-describedby');
  snapshot.inert = true;
  resultBoard.dataset.size = size;
  resultBoard.replaceChildren(snapshot);
  get('result-level').textContent = `${sizeLabel(size)} · ${levelTitle.textContent}`;
  get('result-time').textContent = formatTime(attempt.elapsedMs);
  const { reward, portraits = [] } = attempt.celebration ?? {};
  const images = reward ? [createResultReward(reward)] : portraits.map(createResultPortrait);
  get('result-title').textContent = reward ? '超厲害！！' : '解題成功！';
  resultCharacters.replaceChildren(...images);
  resultCharacters.hidden = images.length === 0;
  resultDialog.dataset.portraitCount = portraits.length;
  resultDialog.toggleAttribute('data-has-images', images.length > 0);
  resultDialog.toggleAttribute('data-celebrate', animate);
  resultDialog.toggleAttribute('data-special-reward', Boolean(reward));
  resultDialog.showModal();
}

function updateAfterMove() {
  const { clues } = PUZZLES_BY_SIZE[size][mode][level];
  const { solved } = inspectBoard(clues, attempt.marks);
  if (solved) {
    pauseClock();
    const reward = pickSpecialReward(mode, attempt.elapsedMs);
    const portraits = reward ? [] : pickCharacters(WIN_CHARACTER_COUNTS[mode]);
    completeAttempt(attempt, { reward, portraits });
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

function selectLevel(nextSize, nextMode, nextLevel) {
  const sizeChanged = nextSize !== size;
  if (!sizeChanged && nextMode === mode && nextLevel === level) return;
  pauseClock();
  saveAttempt();
  size = nextSize;
  mode = nextMode;
  level = nextLevel;
  attempt = loadAttempt(size, mode, level);
  showingAnswer = false;
  tool = 'line';
  write(SIZE_KEY, size);
  write(`${storageKey(size)}/selection`, { mode, level });
  write(`${storageKey(size)}/last/${mode}`, level);
  if (sizeChanged) makeBoard();
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
  const { row, col, orientation } = edgesById.get(button.dataset.edge);
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

sizeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = Number(button.dataset.size);
    if (next === size) return;
    const { mode, level } = loadSelection(next);
    selectLevel(next, mode, level);
  });
});

difficultyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.difficulty;
    const recent = read(`${storageKey(size)}/last/${next}`);
    selectLevel(size, next, validLevel(size, next, recent));
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
