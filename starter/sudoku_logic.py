import copy
import random

SIZE = 9
EMPTY = 0

DIFFICULTY_CLUES = {
    "Easy": 40,
    "Medium": 34,
    "Hard": 28,
}


def deep_copy(board):
    return copy.deepcopy(board)


def create_empty_board():
    return [[EMPTY for _ in range(SIZE)] for _ in range(SIZE)]


def is_safe(board, row, col, num):
    if any(board[row][x] == num or board[x][col] == num for x in range(SIZE)):
        return False

    start_row = row - row % 3
    start_col = col - col % 3
    return all(
        board[start_row + i][start_col + j] != num
        for i in range(3)
        for j in range(3)
    )


def _candidates(board, row, col):
    used = set(board[row])
    used.update(board[x][col] for x in range(SIZE))
    start_row = row - row % 3
    start_col = col - col % 3
    used.update(
        board[start_row + i][start_col + j]
        for i in range(3)
        for j in range(3)
    )
    return set(range(1, SIZE + 1)) - used


def _best_empty_cell(board):
    best = None
    best_candidates = None
    for row in range(SIZE):
        for col in range(SIZE):
            if board[row][col] == EMPTY:
                candidates = _candidates(board, row, col)
                if best_candidates is None or len(candidates) < len(best_candidates):
                    best = (row, col)
                    best_candidates = candidates
                    if not candidates:
                        return best, candidates
    return best, best_candidates


def fill_board(board):
    cell, candidates = _best_empty_cell(board)
    if cell is None:
        return True
    if not candidates:
        return False

    row, col = cell
    possible = list(candidates)
    random.shuffle(possible)
    for candidate in possible:
        board[row][col] = candidate
        if fill_board(board):
            return True
        board[row][col] = EMPTY
    return False


def _is_valid_partial_board(board):
    if not isinstance(board, list) or len(board) != SIZE:
        return False
    if any(not isinstance(row, list) or len(row) != SIZE for row in board):
        return False
    if any(
        not isinstance(value, int)
        or isinstance(value, bool)
        or not EMPTY <= value <= SIZE
        for row in board
        for value in row
    ):
        return False

    for row in range(SIZE):
        values = [value for value in board[row] if value != EMPTY]
        if len(values) != len(set(values)):
            return False

    for col in range(SIZE):
        values = [board[row][col] for row in range(SIZE) if board[row][col] != EMPTY]
        if len(values) != len(set(values)):
            return False

    for start_row in range(0, SIZE, 3):
        for start_col in range(0, SIZE, 3):
            values = [
                board[start_row + row][start_col + col]
                for row in range(3)
                for col in range(3)
                if board[start_row + row][start_col + col] != EMPTY
            ]
            if len(values) != len(set(values)):
                return False
    return True


def _count_solutions(board, limit):
    cell, candidates = _best_empty_cell(board)
    if cell is None:
        return 1
    if not candidates:
        return 0

    row, col = cell
    solutions = 0
    for candidate in candidates:
        board[row][col] = candidate
        solutions += _count_solutions(board, limit - solutions)
        board[row][col] = EMPTY
        if solutions >= limit:
            break
    return solutions


def count_solutions(board, limit=2):
    """Count valid solutions up to limit, restoring the supplied board before return."""
    if limit <= 0 or not _is_valid_partial_board(board):
        return 0
    return _count_solutions(board, limit)


def remove_cells(board, clues):
    if not isinstance(clues, int) or isinstance(clues, bool) or not 17 <= clues <= 81:
        raise ValueError("Clues must be an integer between 17 and 81.")

    cells = [(row, col) for row in range(SIZE) for col in range(SIZE)]
    random.shuffle(cells)
    removed = 0
    target_removals = SIZE * SIZE - clues
    for row, col in cells:
        if removed >= target_removals:
            break
        value = board[row][col]
        board[row][col] = EMPTY
        if count_solutions(board) == 1:
            removed += 1
        else:
            board[row][col] = value


def generate_puzzle(clues=None, difficulty="Medium"):
    if clues is None:
        if difficulty not in DIFFICULTY_CLUES:
            raise ValueError("Difficulty must be Easy, Medium, or Hard.")
        clues = DIFFICULTY_CLUES[difficulty]

    solution = create_empty_board()
    if not fill_board(solution):
        raise RuntimeError("Could not generate a complete Sudoku board.")

    puzzle = deep_copy(solution)
    remove_cells(puzzle, clues)
    return puzzle, solution
