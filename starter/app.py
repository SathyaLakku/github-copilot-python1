import os
import secrets
from random import choice
from threading import Lock

from flask import Flask, jsonify, render_template, request, session

import sudoku_logic

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)
GAMES = {}
GAMES_LOCK = Lock()


def _validated_board(value):
    if not isinstance(value, list) or len(value) != sudoku_logic.SIZE:
        return None
    board = []
    for row in value:
        if not isinstance(row, list) or len(row) != sudoku_logic.SIZE:
            return None
        if any(
            not isinstance(cell, int)
            or isinstance(cell, bool)
            or not 0 <= cell <= sudoku_logic.SIZE
            for cell in row
        ):
            return None
        board.append(row)
    return board


def _current_game():
    game_id = session.get("game_id")
    if game_id is None:
        return None
    with GAMES_LOCK:
        return GAMES.get(game_id)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/new")
def new_game():
    difficulty = request.args.get("difficulty", "Medium")
    try:
        if "clues" in request.args:
            clues = int(request.args["clues"])
            puzzle, solution = sudoku_logic.generate_puzzle(clues=clues)
        else:
            puzzle, solution = sudoku_logic.generate_puzzle(difficulty=difficulty)
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400

    game_id = secrets.token_urlsafe(18)
    with GAMES_LOCK:
        previous_game_id = session.get("game_id")
        if previous_game_id is not None:
            GAMES.pop(previous_game_id, None)
        GAMES[game_id] = {"puzzle": puzzle, "solution": solution}
    session["game_id"] = game_id
    return jsonify({"puzzle": puzzle, "difficulty": difficulty})


@app.route("/check", methods=["POST"])
def check_solution():
    game = _current_game()
    if game is None:
        return jsonify({"error": "Start a new game before checking your puzzle."}), 400
    solution = game["solution"]
    if not request.is_json:
        return jsonify({"error": "Send the board as JSON to check the puzzle."}), 400

    payload = request.get_json(silent=True)
    board = _validated_board(payload.get("board") if isinstance(payload, dict) else None)
    if board is None:
        return jsonify({"error": "The board must contain 9 rows of 9 digits (1-9) or empty cells."}), 400

    incorrect = []
    empty = []
    for row in range(sudoku_logic.SIZE):
        for col in range(sudoku_logic.SIZE):
            if board[row][col] == sudoku_logic.EMPTY:
                empty.append([row, col])
            elif board[row][col] != solution[row][col]:
                incorrect.append([row, col])
    return jsonify({"incorrect": incorrect, "empty": empty})


@app.route("/hint", methods=["POST"])
def get_hint():
    game = _current_game()
    if game is None:
        return jsonify({"error": "Start a new game before requesting a hint."}), 400
    puzzle = game["puzzle"]
    solution = game["solution"]
    if not request.is_json:
        return jsonify({"error": "Send the board as JSON to request a hint."}), 400

    payload = request.get_json(silent=True)
    board = _validated_board(payload.get("board") if isinstance(payload, dict) else None)
    if board is None:
        return jsonify({"error": "The board must contain 9 rows of 9 digits (1-9) or empty cells."}), 400

    available = [
        (row, col)
        for row in range(sudoku_logic.SIZE)
        for col in range(sudoku_logic.SIZE)
        if puzzle[row][col] == sudoku_logic.EMPTY
        and board[row][col] != solution[row][col]
    ]
    if not available:
        return jsonify({"error": "There are no incorrect or empty cells left for a hint."}), 409

    row, col = choice(available)
    return jsonify({"row": row, "col": col, "value": solution[row][col]})


if __name__ == "__main__":
    app.run(debug=True)
