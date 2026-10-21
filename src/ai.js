/**
 * Computer opponent: alpha-beta search over the rules engine.
 * Evaluation: material (man 100, king 330), advancement, centre control, back-row guard.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
	else root.DraughtsAI = factory(root.Draughts);
})(typeof self !== 'undefined' ? self : this, function (D) {
	'use strict';

	function evaluate(board, me) {
		let score = 0;
		for (let r = 0; r < 10; r++) {
			for (let c = 0; c < 10; c++) {
				const p = board[r][c];
				if (!p) continue;
				const color = D.colorOf(p);
				let v;
				if (D.isKing(p)) v = 330;
				else {
					const advance = color === 'w' ? 9 - r : r; // 0..9 rows advanced
					v = 100 + advance * 3;
					if ((color === 'w' && r === 9) || (color === 'b' && r === 0)) v += 6; // back-row guard
				}
				if (c >= 3 && c <= 6 && r >= 3 && r <= 6) v += 4; // centre
				score += color === me ? v : -v;
			}
		}
		return score;
	}

	function search(state, depth, alpha, beta, me, deadline) {
		const res = D.result(state);
		if (res) return res === me ? 100000 + depth : res === 'draw' ? 0 : -100000 - depth;
		if (depth === 0 || Date.now() > deadline) return evaluate(state.board, me);
		const moves = D.legalMoves(state);
		// Captures first: better pruning.
		moves.sort((a, b) => b.captures.length - a.captures.length);
		const maximizing = state.turn === me;
		let best = maximizing ? -Infinity : Infinity;
		for (const m of moves) {
			const v = search(D.applyMove(state, m), depth - 1, alpha, beta, me, deadline);
			if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
			else { best = Math.min(best, v); beta = Math.min(beta, v); }
			if (beta <= alpha) break;
		}
		return best;
	}

	/** level: 1 (easy) .. 3 (hard). Returns a legal move. */
	function chooseMove(state, level = 2) {
		const moves = D.legalMoves(state);
		if (moves.length === 1) return moves[0];
		const me = state.turn;
		if (level <= 1 && Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
		const maxDepth = level <= 1 ? 2 : level === 2 ? 4 : 6;
		const deadline = Date.now() + (level >= 3 ? 2500 : 1200);
		let bestMoves = moves, bestScore = -Infinity;
		// Iterative deepening: keep the best result of the deepest finished search.
		for (let depth = 1; depth <= maxDepth && Date.now() < deadline; depth++) {
			let scored = [];
			for (const m of moves) {
				scored.push({ m, v: search(D.applyMove(state, m), depth - 1, -Infinity, Infinity, me, deadline) });
				if (Date.now() > deadline) break;
			}
			if (scored.length < moves.length) break;
			const top = Math.max(...scored.map((s) => s.v));
			bestScore = top;
			bestMoves = scored.filter((s) => s.v === top).map((s) => s.m);
		}
		return bestMoves[Math.floor(Math.random() * bestMoves.length)];
	}

	return { chooseMove, evaluate };
});
