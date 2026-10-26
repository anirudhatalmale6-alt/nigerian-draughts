/* Runs the computer opponent off the main thread so the board stays responsive. */
importScripts('engine.js', 'ai.js');
self.onmessage = (e) => {
	const { state, level, id } = e.data;
	// Echo the request id so the page can ignore replies for a position it has already left.
	self.postMessage({ id, move: DraughtsAI.chooseMove(state, level) });
};
