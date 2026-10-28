/**
 * Nigerian Draughts rules engine (pure, no DOM) — usable in the browser and in Node.
 *
 * Board: 10x10, rows 0..9 top→bottom, cols 0..9 left→right as seen by White (bottom).
 * Playable (dark) squares are those with (row + col) even, so the bottom-right corner (9,9) is dark:
 * the long diagonal runs to each player's right-hand side (the Nigerian "mirrored" board).
 *
 * Rules implemented:
 *  - 20 men each: Black on rows 0–3, White on rows 6–9. White moves first, men move "up" (row - 1).
 *  - Men move one square diagonally forward; they capture forward AND backward.
 *  - Kings fly: any distance along an empty diagonal, and capture at a distance, landing on any
 *    empty square beyond the captured piece.
 *  - Capturing is compulsory. A sequence must continue while another capture is possible.
 *    There is NO majority rule: any complete capture sequence may be chosen.
 *  - After each king jump, if some landing square allows the capture to continue, the king must
 *    land on one of those squares.
 *  - Captured pieces stay on the board (as blockers, and cannot be jumped twice) until the move ends.
 *  - A man becomes a king only if it ENDS its move on the far row.
 *  - A player with no pieces or no legal move loses.
 *  - Draw: 25 moves each without a capture or a man moving; or, when each side has at most 2 seeds,
 *    4 such moves each.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory();
	else root.Draughts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	const SIZE = 10;
	const EMPTY = 0, WM = 1, WK = 2, BM = 3, BK = 4; // White/Black Man/King
	const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

	const isDark = (r, c) => (r + c) % 2 === 0;
	const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
	const colorOf = (p) => (p === WM || p === WK ? 'w' : p === BM || p === BK ? 'b' : null);
	const isKing = (p) => p === WK || p === BK;
	const forward = (color) => (color === 'w' ? -1 : 1);
	const promoRow = (color) => (color === 'w' ? 0 : SIZE - 1);

	function initialBoard() {
		const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				if (!isDark(r, c)) continue;
				if (r <= 3) b[r][c] = BM;
				else if (r >= 6) b[r][c] = WM;
			}
		}
		return b;
	}

	function newGame() {
		return { board: initialBoard(), turn: 'w', quietPlies: 0, history: [] };
	}

	const cloneBoard = (b) => b.map((row) => row.slice());
	const key = (r, c) => r * SIZE + c;

	/**
	 * All complete capture sequences for the piece at (r, c).
	 * Each move: { from:[r,c], path:[[r,c],...landings], captures:[[r,c],...] }.
	 */
	function captureSequences(board, r, c) {
		const piece = board[r][c];
		const color = colorOf(piece);
		const king = isKing(piece);
		const results = [];

		// Single jumps available from (pr, pc) given pieces already captured this turn.
		function jumpsFrom(pr, pc, taken) {
			const out = [];
			for (const [dr, dc] of DIRS) {
				if (king) {
					let rr = pr + dr, cc = pc + dc;
					while (inside(rr, cc) && board[rr][cc] === EMPTY) { rr += dr; cc += dc; }
					if (!inside(rr, cc)) continue;
					const target = board[rr][cc];
					if (colorOf(target) === color || colorOf(target) === null) continue;
					if (taken.has(key(rr, cc))) continue; // already captured: a blocker, cannot be jumped again
					const landings = [];
					let lr = rr + dr, lc = cc + dc;
					while (inside(lr, lc) && board[lr][lc] === EMPTY) { landings.push([lr, lc]); lr += dr; lc += dc; }
					if (landings.length) out.push({ cap: [rr, cc], landings });
				} else {
					const rr = pr + dr, cc = pc + dc, lr = pr + 2 * dr, lc = pc + 2 * dc;
					if (!inside(lr, lc)) continue;
					const target = board[rr][cc];
					if (colorOf(target) === null || colorOf(target) === color) continue;
					if (taken.has(key(rr, cc))) continue;
					if (board[lr][lc] !== EMPTY) continue;
					out.push({ cap: [rr, cc], landings: [[lr, lc]] });
				}
			}
			return out;
		}

		function extend(pr, pc, path, caps, taken) {
			const jumps = jumpsFrom(pr, pc, taken);
			if (!jumps.length) {
				if (caps.length) results.push({ from: [r, c], path: path.slice(), captures: caps.slice() });
				return;
			}
			for (const j of jumps) {
				const nextTaken = new Set(taken);
				nextTaken.add(key(j.cap[0], j.cap[1]));
				let landings = j.landings;
				if (king && landings.length > 1) {
					// Must land where the capture can continue, if any such square exists.
					const continuing = landings.filter(([lr, lc]) => jumpsFrom(lr, lc, nextTaken).length);
					if (continuing.length) landings = continuing;
				}
				for (const [lr, lc] of landings) {
					path.push([lr, lc]);
					caps.push(j.cap);
					extend(lr, lc, path, caps, nextTaken);
					path.pop();
					caps.pop();
				}
			}
		}

		// The moving piece's origin square counts as empty while it travels.
		board[r][c] = EMPTY;
		try { extend(r, c, [], [], new Set()); } finally { board[r][c] = piece; }
		return results;
	}

	function quietMoves(board, r, c) {
		const piece = board[r][c];
		const color = colorOf(piece);
		const out = [];
		for (const [dr, dc] of DIRS) {
			if (isKing(piece)) {
				let rr = r + dr, cc = c + dc;
				while (inside(rr, cc) && board[rr][cc] === EMPTY) {
					out.push({ from: [r, c], path: [[rr, cc]], captures: [] });
					rr += dr; cc += dc;
				}
			} else if (dr === forward(color)) {
				const rr = r + dr, cc = c + dc;
				if (inside(rr, cc) && board[rr][cc] === EMPTY) out.push({ from: [r, c], path: [[rr, cc]], captures: [] });
			}
		}
		return out;
	}

	/** Every legal move for the side to play. Captures are compulsory. */
	function legalMoves(state) {
		const { board, turn } = state;
		const caps = [];
		const quiet = [];
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				if (colorOf(board[r][c]) !== turn) continue;
				caps.push(...captureSequences(board, r, c));
			}
		}
		if (caps.length) return caps;
		for (let r = 0; r < SIZE; r++) {
			for (let c = 0; c < SIZE; c++) {
				if (colorOf(board[r][c]) === turn) quiet.push(...quietMoves(board, r, c));
			}
		}
		return quiet;
	}

	/** Apply a legal move; returns a new state (the input is not modified). */
	function applyMove(state, move) {
		const board = cloneBoard(state.board);
		const [fr, fc] = move.from;
		const piece = board[fr][fc];
		board[fr][fc] = EMPTY;
		for (const [cr, cc] of move.captures) board[cr][cc] = EMPTY; // removed only when the move is complete
		const [tr, tc] = move.path[move.path.length - 1];
		let placed = piece;
		if (!isKing(piece) && tr === promoRow(colorOf(piece))) placed = piece === WM ? WK : BK;
		board[tr][tc] = placed;
		const resets = move.captures.length > 0 || !isKing(piece);
		return {
			board,
			turn: state.turn === 'w' ? 'b' : 'w',
			quietPlies: resets ? 0 : state.quietPlies + 1,
			history: state.history.concat([move]),
		};
	}

	// Draw rules. "Quiet" moves are moves without a capture and without a man advancing.
	const DRAW_QUIET_PLIES = 50;     // 25 quiet moves each, in general
	const FEW_SEEDS = 2;             // when each side has at most this many seeds...
	const FEW_SEEDS_QUIET_PLIES = 8; // ...the game is a draw after 4 quiet moves each

	/** Why the game is drawn ('few' or 'quiet'), or null if it is not. */
	function drawReason(state) {
		if (state.quietPlies >= DRAW_QUIET_PLIES) return 'quiet';
		if (state.quietPlies >= FEW_SEEDS_QUIET_PLIES) {
			const n = count(state.board);
			if (n.w <= FEW_SEEDS && n.b <= FEW_SEEDS) return 'few';
		}
		return null;
	}

	/** 'w' or 'b' if someone has won, 'draw', or null while the game continues. */
	function result(state) {
		if (!legalMoves(state).length) return state.turn === 'w' ? 'b' : 'w';
		if (drawReason(state)) return 'draw';
		return null;
	}

	function count(board) {
		const n = { w: 0, b: 0, wk: 0, bk: 0 };
		for (const row of board) for (const p of row) {
			if (p === WM) n.w++; else if (p === WK) { n.w++; n.wk++; }
			else if (p === BM) n.b++; else if (p === BK) { n.b++; n.bk++; }
		}
		return n;
	}

	const sameSq = (a, b) => a[0] === b[0] && a[1] === b[1];

	return { SIZE, EMPTY, WM, WK, BM, BK, isDark, colorOf, isKing, newGame, initialBoard, legalMoves, applyMove, result, drawReason, count, captureSequences, sameSq, cloneBoard, FEW_SEEDS, FEW_SEEDS_QUIET_PLIES };
});
