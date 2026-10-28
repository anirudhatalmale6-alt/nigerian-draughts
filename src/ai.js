/**
 * Computer opponent: iterative-deepening alpha-beta (negamax) over the rules engine.
 *
 *  - Capture extension: the search never stops while the side to move has a capture (captures are
 *    compulsory, so a position with a capture pending is never "quiet"). This removes the horizon
 *    blunders where the computer walked into a capture one move beyond its depth.
 *  - Transposition table and best-move-first ordering, so each extra ply costs far less.
 *  - An iteration cut short by the time limit is thrown away, never half-used.
 *  - Evaluation: material (man 100, king 320), advancement, centre, back-row guard, edge safety,
 *    and "trade when ahead" scaling for endgames.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
	else root.DraughtsAI = factory(root.Draughts);
})(typeof self !== 'undefined' ? self : this, function (D) {
	'use strict';

	const WIN = 1000000;
	const MAX_EXT = 12; // capture plies allowed beyond the nominal depth

	/** Static score from `me`'s point of view. */
	function evaluate(board, me) {
		let mat = { w: 0, b: 0 }, pos = 0, kings = { w: 0, b: 0 }, men = { w: 0, b: 0 };
		for (let r = 0; r < 10; r++) {
			for (let c = 0; c < 10; c++) {
				const p = board[r][c];
				if (!p) continue;
				const color = D.colorOf(p);
				const sign = color === me ? 1 : -1;
				if (D.isKing(p)) {
					mat[color] += 320; kings[color]++;
					// Kings on the long diagonals control the board.
					if (r === c || r + c === 9) pos += sign * 12;
				} else {
					mat[color] += 100; men[color]++;
					const advance = color === 'w' ? 9 - r : r; // 0..9
					let v = advance * 4;
					if (advance >= 7) v += 10;                  // close to crowning
					if ((color === 'w' && r === 9) || (color === 'b' && r === 0)) v += 8; // back-row guard
					if (c === 0 || c === 9) v += 4;             // edges can't be jumped sideways
					if (c >= 3 && c <= 6 && r >= 3 && r <= 6) v += 6; // centre
					pos += sign * v;
				}
			}
		}
		const opp = me === 'w' ? 'b' : 'w';
		const diff = mat[me] - mat[opp];
		const total = mat.w + mat.b;
		// The same material lead is worth more as the board empties: encourages trading when ahead.
		const trade = total > 0 ? Math.round(diff * 1400 / (total + 600)) : 0;
		// Back rank matters less once the opponent has kings.
		return diff + trade + Math.round(pos * (kings[opp] ? 0.6 : 1));
	}

	const keyOf = (s) => s.turn + s.board.map((row) => row.join('')).join('');
	const moveKey = (m) => m.from.join(',') + '>' + m.path.map((p) => p.join(',')).join('>');

	function makeSearcher(deadline) {
		const tt = new Map();
		let nodes = 0, aborted = false;

		function order(moves, bestKey) {
			// Previous best first, then bigger captures, then promotions / advances.
			return moves.map((m) => ({ m, k: moveKey(m) })).sort((a, b) => {
				if (a.k === bestKey) return -1;
				if (b.k === bestKey) return 1;
				return b.m.captures.length - a.m.captures.length;
			}).map((x) => x.m);
		}

		/** Negamax: score for the side to move. */
		function negamax(s, depth, alpha, beta, ply, ext) {
			if ((++nodes & 1023) === 0 && Date.now() > deadline) aborted = true;
			if (aborted) return 0;
			const moves = D.legalMoves(s);
			if (!moves.length) return -WIN + ply;           // no move = loss
			if (D.drawReason(s)) return 0;                  // same draw rules as the game
			const capturing = moves[0].captures.length > 0;
			if (depth <= 0 && !(capturing && ext < MAX_EXT)) return evaluate(s.board, s.turn);
			if (depth <= 0) ext++;                          // keep resolving captures past the horizon

			const key = keyOf(s);
			const hit = tt.get(key);
			if (hit && hit.depth >= depth && hit.ext <= ext) {
				if (hit.flag === 0) return hit.v;
				if (hit.flag < 0 && hit.v <= alpha) return hit.v;
				if (hit.flag > 0 && hit.v >= beta) return hit.v;
			}
			const a0 = alpha;
			let best = -Infinity, bestKey = null;
			for (const m of order(moves, hit && hit.best)) {
				// A single forced move doesn't use up depth.
				const nd = moves.length === 1 ? depth : depth - 1;
				const v = -negamax(D.applyMove(s, m), nd, -beta, -alpha, ply + 1, ext);
				if (aborted) return 0;
				if (v > best) { best = v; bestKey = moveKey(m); }
				if (v > alpha) alpha = v;
				if (alpha >= beta) break;
			}
			tt.set(key, { depth, ext, v: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0, best: bestKey });
			return best;
		}

		return { negamax, get aborted() { return aborted; }, get nodes() { return nodes; }, tt };
	}

	/** Settings per level: 1 Easy, 2 Medium, 3 Hard, 4 Master. */
	const LEVELS = {
		1: { maxDepth: 2, timeMs: 400, randomMove: 0.35, noise: 60 },
		2: { maxDepth: 4, timeMs: 900, randomMove: 0, noise: 20 },
		3: { maxDepth: 8, timeMs: 2200, randomMove: 0, noise: 0 },
		4: { maxDepth: 30, timeMs: 4500, randomMove: 0, noise: 0 },
	};

	/** Returns a legal move. `opts` can override timeMs / maxDepth (used by tests and matches). */
	function chooseMove(state, level = 2, opts = {}) {
		const moves = D.legalMoves(state);
		if (moves.length === 1) return moves[0];
		const cfg = Object.assign({}, LEVELS[level] || LEVELS[2], opts);
		if (cfg.randomMove && Math.random() < cfg.randomMove) return moves[Math.floor(Math.random() * moves.length)];

		const deadline = Date.now() + cfg.timeMs;
		const S = makeSearcher(deadline);
		let best = moves[0], bestKey = null;
		for (let depth = 1; depth <= cfg.maxDepth; depth++) {
			let alpha = -Infinity, iterBest = null, iterKey = null, scores = [];
			const ordered = bestKey ? [moves.find((m) => moveKey(m) === bestKey), ...moves.filter((m) => moveKey(m) !== bestKey)] : moves;
			for (const m of ordered) {
				const nd = depth - 1;
				// Full window per root move so that weaker levels can choose among near-equal moves.
				const v = -S.negamax(D.applyMove(state, m), nd, -Infinity, cfg.noise ? Infinity : -alpha, 1, 0);
				if (S.aborted) break;
				scores.push({ m, v });
				if (v > alpha) { alpha = v; iterBest = m; iterKey = moveKey(m); }
			}
			if (S.aborted) break;                 // never use a half-finished iteration
			best = iterBest; bestKey = iterKey;
			if (cfg.noise) {
				// Lower levels: pick among moves within `noise` of the best, so they feel human.
				const ok = scores.filter((x) => x.v >= alpha - cfg.noise);
				best = ok[Math.floor(Math.random() * ok.length)].m;
			}
			if (Math.abs(alpha) > WIN - 1000) break; // forced win or loss found
			if (Date.now() > deadline) break;
		}
		return best;
	}

	return { chooseMove, evaluate, LEVELS };
});
