const SIZE = 9;
const SCORE_KEY = 'sudoku-top-scores-v1';
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
let puzzle = [];
let difficulty = 'Medium';
let hintsUsed = 0;
let startedAt = 0;
let timerInterval = null;
let gameComplete = false;
let requestPending = false;

const boardElement = document.getElementById('sudoku-board');
const messageElement = document.getElementById('message');
const leaderboardMessage = document.getElementById('leaderboard-message');
const timerElement = document.getElementById('timer');

function setMessage(message, state = '') {
  messageElement.textContent = message;
  if (state) {
    messageElement.dataset.state = state;
  } else {
    delete messageElement.dataset.state;
  }
}

function setBusy(busy) {
  requestPending = busy;
  document.querySelectorAll('.game-controls button').forEach((button) => {
    button.disabled = busy || (gameComplete && button.id !== 'new-game');
  });
  boardElement.querySelectorAll('.sudoku-cell').forEach((cell) => {
    cell.disabled = busy || gameComplete || cell.dataset.locked === 'true';
  });
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error('Could not reach the game server. Check your connection and try again.');
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('The game server returned an unreadable response. Please try again.');
  }
  if (!response.ok) {
    throw new Error(data.error || 'The request could not be completed.');
  }
  return data;
}

function createBoard() {
  boardElement.replaceChildren();
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.maxLength = 1;
      input.className = 'sudoku-cell';
      input.dataset.row = String(row);
      input.dataset.col = String(col);
      input.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}`);
      boardElement.appendChild(input);
    }
  }
}

function renderPuzzle(newPuzzle) {
  puzzle = newPuzzle;
  const cells = boardElement.querySelectorAll('.sudoku-cell');
  cells.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const value = puzzle[row][col];
    cell.value = value === 0 ? '' : String(value);
    cell.dataset.locked = String(value !== 0);
    cell.disabled = value !== 0;
    cell.className = value === 0 ? 'sudoku-cell' : 'sudoku-cell prefilled';
    cell.removeAttribute('aria-invalid');
  });
}

function readBoard() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  boardElement.querySelectorAll('.sudoku-cell').forEach((cell) => {
    const value = Number(cell.value);
    board[Number(cell.dataset.row)][Number(cell.dataset.col)] = value || 0;
  });
  return board;
}

function markConflicts() {
  const cells = Array.from(boardElement.querySelectorAll('.sudoku-cell'));
  cells.forEach((cell) => {
    cell.classList.remove('invalid');
    cell.removeAttribute('aria-invalid');
  });

  for (let first = 0; first < cells.length; first += 1) {
    const firstCell = cells[first];
    if (!firstCell.value) continue;
    const firstRow = Number(firstCell.dataset.row);
    const firstCol = Number(firstCell.dataset.col);

    for (let second = first + 1; second < cells.length; second += 1) {
      const secondCell = cells[second];
      if (firstCell.value !== secondCell.value) continue;
      const secondRow = Number(secondCell.dataset.row);
      const secondCol = Number(secondCell.dataset.col);
      const sameRow = firstRow === secondRow;
      const sameColumn = firstCol === secondCol;
      const sameBox = Math.floor(firstRow / 3) === Math.floor(secondRow / 3)
        && Math.floor(firstCol / 3) === Math.floor(secondCol / 3);
      if (sameRow || sameColumn || sameBox) {
        firstCell.classList.add('invalid');
        secondCell.classList.add('invalid');
        firstCell.setAttribute('aria-invalid', 'true');
        secondCell.setAttribute('aria-invalid', 'true');
      }
    }
  }
}

function handleBoardInput(event) {
  if (requestPending || gameComplete) return;
  const cell = event.target.closest('.sudoku-cell');
  if (!cell || cell.disabled) return;
  cell.value = cell.value.replace(/[^1-9]/g, '').slice(-1);
  cell.classList.remove('incorrect');
  markConflicts();

  if (cell.classList.contains('invalid')) {
    setMessage('That number conflicts with another square in its row, column, or box.', 'error');
  } else {
    setMessage('');
  }

  if (!gameComplete && readBoard().every((row) => row.every((value) => value !== 0))) {
    checkPuzzle();
  }
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function elapsedSeconds() {
  return startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
}

function updateTimer() {
  timerElement.textContent = formatTime(elapsedSeconds());
}

function startTimer() {
  if (timerInterval !== null) clearInterval(timerInterval);
  startedAt = Date.now();
  updateTimer();
  timerInterval = window.setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  updateTimer();
}

function readScores() {
  const stored = localStorage.getItem(SCORE_KEY);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error('Saved leaderboard data has an invalid format.');
  return parsed.filter((score) => (
    score
    && typeof score.name === 'string'
    && typeof score.timeSeconds === 'number'
    && typeof score.hints === 'number'
    && DIFFICULTIES.has(score.difficulty)
  ));
}

function renderLeaderboard() {
  let scores;
  try {
    scores = readScores();
    leaderboardMessage.textContent = '';
  } catch (error) {
    leaderboardMessage.textContent = 'Saved scores could not be read. Clear this site’s stored data to reset the leaderboard.';
    scores = [];
  }

  const body = document.getElementById('leaderboard-body');
  body.replaceChildren();
  if (scores.length === 0) {
    const row = document.createElement('tr');
    row.className = 'empty-leaderboard';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Complete a puzzle to set your first score.';
    row.appendChild(cell);
    body.appendChild(row);
    return scores;
  }

  scores.slice(0, 10).forEach((score, index) => {
    const row = document.createElement('tr');
    const values = [
      String(index + 1),
      score.name,
      formatTime(score.timeSeconds),
      String(score.hints),
      score.difficulty,
    ];
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  return scores;
}

function saveScore(name, timeSeconds) {
  let scores;
  try {
    scores = readScores();
    scores.push({ name, timeSeconds, hints: hintsUsed, difficulty });
    scores.sort((left, right) => left.timeSeconds - right.timeSeconds || left.hints - right.hints);
    localStorage.setItem(SCORE_KEY, JSON.stringify(scores.slice(0, 10)));
  } catch (error) {
    leaderboardMessage.textContent = 'Your result was solved, but the leaderboard could not be saved in this browser.';
    renderLeaderboard();
    return;
  }
  renderLeaderboard();
}

function celebrateWin() {
  if (gameComplete) return;
  gameComplete = true;
  stopTimer();
  document.querySelectorAll('.game-controls button').forEach((button) => {
    button.disabled = button.id !== 'new-game';
  });
  const timeSeconds = elapsedSeconds();
  setMessage(`Congratulations! Solved in ${formatTime(timeSeconds)} with ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}.`, 'success');

  const enteredName = window.prompt('Puzzle solved! Enter your name for the Top 10 leaderboard:');
  if (enteredName === null || !enteredName.trim()) return;
  saveScore(enteredName.trim().slice(0, 30), timeSeconds);
}

function applyCheckResult(data) {
  const incorrect = new Set(data.incorrect.map(([row, col]) => row * SIZE + col));
  const cells = boardElement.querySelectorAll('.sudoku-cell');
  cells.forEach((cell, index) => {
    cell.classList.remove('incorrect');
    if (incorrect.has(index)) cell.classList.add('incorrect');
  });

  if (data.incorrect.length === 0 && data.empty.length === 0) {
    celebrateWin();
    return;
  }
  if (data.empty.length > 0 && data.incorrect.length === 0) {
    setMessage(`${data.empty.length} square${data.empty.length === 1 ? ' is' : 's are'} still empty.`, 'error');
  } else if (data.empty.length > 0) {
    setMessage(`${data.incorrect.length} incorrect square${data.incorrect.length === 1 ? '' : 's'} and ${data.empty.length} empty square${data.empty.length === 1 ? '' : 's'}.`, 'error');
  } else {
    setMessage(`${data.incorrect.length} square${data.incorrect.length === 1 ? ' is' : 's are'} incorrect.`, 'error');
  }
}

async function checkPuzzle() {
  if (requestPending || gameComplete) return;
  setBusy(true);
  try {
    const data = await requestJson('/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: readBoard() }),
    });
    applyCheckResult(data);
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function giveHint() {
  if (requestPending || gameComplete) return;
  setBusy(true);
  try {
    const data = await requestJson('/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: readBoard() }),
    });
    const cell = boardElement.querySelector(`[data-row="${data.row}"][data-col="${data.col}"]`);
    cell.value = String(data.value);
    cell.dataset.locked = 'true';
    cell.disabled = true;
    cell.classList.add('hinted');
    cell.removeAttribute('aria-invalid');
    hintsUsed += 1;
    markConflicts();
    setMessage(`Hint ${hintsUsed}: row ${data.row + 1}, column ${data.col + 1} is ${data.value}.`, 'success');

    if (readBoard().every((row) => row.every((value) => value !== 0))) {
      setBusy(false);
      await checkPuzzle();
    }
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function newGame() {
  if (requestPending) return;
  const selectedDifficulty = document.getElementById('difficulty').value;
  setBusy(true);
  try {
    const data = await requestJson(`/new?difficulty=${encodeURIComponent(selectedDifficulty)}`);
    difficulty = data.difficulty;
    hintsUsed = 0;
    gameComplete = false;
    renderPuzzle(data.puzzle);
    markConflicts();
    startTimer();
    setMessage(`${difficulty} puzzle ready. Good luck!`);
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

createBoard();
renderLeaderboard();
boardElement.addEventListener('input', handleBoardInput);
document.getElementById('new-game').addEventListener('click', newGame);
document.getElementById('check-puzzle').addEventListener('click', checkPuzzle);
document.getElementById('hint').addEventListener('click', giveHint);
document.getElementById('difficulty').addEventListener('change', () => {
  setMessage('Difficulty updated. Select “New game” to start a puzzle at this level.');
});
newGame();
