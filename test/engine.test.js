// Run: node test/engine.test.js
const assert = require('assert');
const D = require('../src/engine.js');
const { WM, WK, BM, BK, EMPTY } = D;

function empty() { return Array.from({ length: 10 }, () => Array(10).fill(EMPTY)); }
function state(pieces, turn = 'w') {
	const board = empty();
	for (const [r, c, p] of pieces) {
		assert.ok(D.isDark(r, c), `(${r},${c}) is not a playable square`);
		board[r][c] = p;
	}
	return { board, turn, quietPlies: 0, history: [] };
}
const sq = (m) => m.path[m.path.length - 1].join(',');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

test('board: 10x10, 50 dark squares, bottom-right corner dark (long diagonal on the right)', () => {
	let dark = 0;
	for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (D.isDark(r, c)) dark++;
	assert.strictEqual(dark, 50);
	assert.ok(D.isDark(9, 9) && D.isDark(0, 0) && !D.isDark(9, 0));
});

test('setup: 20 seeds each, White moves first with 9 opening moves', () => {
	const s = D.newGame();
	const n = D.count(s.board);
	assert.strictEqual(n.w, 20); assert.strictEqual(n.b, 20);
	assert.strictEqual(s.turn, 'w');
	assert.strictEqual(D.legalMoves(s).length, 9);
});

test('men move forward only (no backward quiet move)', () => {
	const s = state([[5, 5, WM], [0, 0, BM]]);
	const dests = D.legalMoves(s).map(sq).sort();
	assert.deepStrictEqual(dests, ['4,4', '4,6']);
});

test('men capture BACKWARD', () => {
	const s = state([[4, 4, WM], [5, 5, BM], [0, 0, BM]]);
	const moves = D.legalMoves(s);
	assert.strictEqual(moves.length, 1);
	assert.strictEqual(sq(moves[0]), '6,6');
	assert.deepStrictEqual(moves[0].captures, [[5, 5]]);
});

test('capture is compulsory (quiet moves are not offered)', () => {
	const s = state([[6, 6, WM], [5, 5, BM], [8, 0, WM], [0, 0, BM]]);
	const moves = D.legalMoves(s);
	assert.ok(moves.every((m) => m.captures.length > 0));
});

test('no majority rule: a 1-piece capture is allowed even when a 2-piece capture exists', () => {
	// Piece A (8,2) can take 1; piece B (8,6) can take 2.
	const s = state([[8, 2, WM], [7, 1, BM], [8, 6, WM], [7, 7, BM], [5, 7, BM], [0, 0, BM]]);
	const moves = D.legalMoves(s);
	const lengths = moves.map((m) => m.captures.length).sort();
	assert.ok(lengths.includes(1) && lengths.includes(2), 'both 1- and 2-capture sequences offered: ' + lengths);
});

test('a sequence must continue while another capture is available', () => {
	const s = state([[8, 6, WM], [7, 7, BM], [5, 7, BM], [0, 0, BM]]);
	const moves = D.legalMoves(s);
	assert.strictEqual(moves.length, 1);
	assert.strictEqual(moves[0].captures.length, 2);
	assert.strictEqual(sq(moves[0]), '4,6');
});

test('flying king moves any distance', () => {
	const s = state([[9, 9, WK], [0, 2, BM]]);
	assert.ok(D.legalMoves(s).map(sq).includes('1,1'));
});

test('flying king captures at a distance and may land on any square beyond', () => {
	const s = state([[9, 9, WK], [5, 5, BM], [0, 2, BM]]);
	const dests = D.legalMoves(s).map(sq).sort();
	assert.deepStrictEqual(dests, ['0,0', '1,1', '2,2', '3,3', '4,4']);
});

test('king must land where the capture can continue, if possible', () => {
	// After taking (5,5), landing on (3,3) allows taking (2,4); other landings must be refused.
	const s = state([[9, 9, WK], [5, 5, BM], [2, 4, BM], [0, 8, BM]]);
	const moves = D.legalMoves(s);
	assert.ok(moves.every((m) => m.captures.length === 2), JSON.stringify(moves.map((m) => m.captures)));
});

test('captured pieces stay as blockers and cannot be jumped twice', () => {
	// King on a closed loop: it may not re-jump a piece it already took.
	const s = state([[7, 3, WK], [6, 4, BM], [4, 6, BM], [4, 2, BM], [6, 2, BM], [0, 0, BM]]);
	for (const m of D.legalMoves(s)) {
		const keys = m.captures.map((c) => c.join(','));
		assert.strictEqual(new Set(keys).size, keys.length, 'a piece captured twice: ' + keys);
	}
});

test('pieces are removed only after the move, and the move applies correctly', () => {
	const s = state([[8, 6, WM], [7, 7, BM], [5, 7, BM], [0, 0, BM]]);
	const after = D.applyMove(s, D.legalMoves(s)[0]);
	assert.strictEqual(after.board[7][7], EMPTY);
	assert.strictEqual(after.board[5][7], EMPTY);
	assert.strictEqual(after.board[4][6], WM);
	assert.strictEqual(after.turn, 'b');
});

test('a man promotes when it ends on the far row', () => {
	const s = state([[1, 1, WM], [9, 9, BM]]);
	const m = D.legalMoves(s).find((x) => sq(x) === '0,0');
	assert.strictEqual(D.applyMove(s, m).board[0][0], WK);
});

test('a man passing the far row mid-capture does NOT promote', () => {
	// Jumps to row 0, then must continue capturing back down: stays a man.
	const s = state([[2, 2, WM], [1, 3, BM], [1, 5, BM], [9, 9, BM]]);
	const moves = D.legalMoves(s);
	const m = moves.find((x) => x.captures.length === 2);
	assert.ok(m, 'two-capture sequence exists');
	const after = D.applyMove(s, m);
	const [r, c] = m.path[m.path.length - 1];
	assert.notStrictEqual(r, 0);
	assert.strictEqual(after.board[r][c], WM);
});

test('a side with no pieces or no moves loses', () => {
	assert.strictEqual(D.result(state([[5, 5, WM]], 'b')), 'w');
	// White man blocked by two black men it cannot capture (landing squares occupied).
	const blocked = state([[9, 9, WM], [8, 8, BM], [7, 7, BM], [0, 0, BM]], 'w');
	assert.strictEqual(D.result(blocked), 'b');
});

test('random games always stay legal and end', () => {
	for (let g = 0; g < 200; g++) {
		let s = D.newGame();
		for (let ply = 0; ply < 400 && !D.result(s); ply++) {
			const moves = D.legalMoves(s);
			s = D.applyMove(s, moves[Math.floor(Math.random() * moves.length)]);
			const n = D.count(s.board);
			assert.ok(n.w <= 20 && n.b <= 20);
		}
	}
});

test('draw: 1-2 seeds each side and 4 quiet moves each (8 plies)', () => {
	const s = state([[9, 9, WK], [7, 1, WK], [0, 0, BK]]);
	s.quietPlies = 7;
	assert.strictEqual(D.result(s), null, 'not yet after 7 quiet plies');
	s.quietPlies = 8;
	assert.strictEqual(D.result(s), 'draw');
	assert.strictEqual(D.drawReason(s), 'few');
});

test('no early draw with 3 seeds on one side', () => {
	const s = state([[9, 9, WK], [7, 1, WK], [9, 3, WK], [0, 0, BK]]);
	s.quietPlies = 8;
	assert.strictEqual(D.result(s), null);
	s.quietPlies = 50;
	assert.strictEqual(D.drawReason(s), 'quiet');
});

test('quiet-move count: king moves add, captures and man moves reset', () => {
	let s = state([[9, 9, WK], [0, 0, BK], [3, 5, BM]]);
	s.quietPlies = 5;
	const kingQuiet = D.legalMoves(s).find((m) => !m.captures.length);
	assert.strictEqual(D.applyMove(s, kingQuiet).quietPlies, 6);
	s = state([[6, 4, WM], [0, 0, BK]]); s.quietPlies = 5;
	assert.strictEqual(D.applyMove(s, D.legalMoves(s)[0]).quietPlies, 0, 'a man move resets');
	s = state([[9, 9, WK], [5, 5, BM], [0, 2, BK]]); s.quietPlies = 5;
	assert.strictEqual(D.applyMove(s, D.legalMoves(s)[0]).quietPlies, 0, 'a capture resets');
});

test('a real 2-vs-1 king endgame is declared a draw after 4 quiet moves each', () => {
	let s = state([[9, 9, WK], [8, 2, WK], [0, 4, BK]]);
	let plies = 0;
	while (!D.result(s) && plies < 30) {
		// Pick a quiet move that doesn't give a capture away, so the game stays 2 v 1.
		const quiet = D.legalMoves(s).filter((m) => !m.captures.length);
		const safe = quiet.filter((m) => !D.legalMoves(D.applyMove(s, m)).some((r) => r.captures.length)) ;
		s = D.applyMove(s, (safe[0] || quiet[0] || D.legalMoves(s)[0]));
		plies++;
	}
	assert.strictEqual(D.result(s), 'draw');
	assert.strictEqual(plies, 8);
});

console.log(`\n${passed} tests passed`);
