/* Runs the computer opponent off the main thread so the board stays responsive. */
importScripts('engine.js', 'ai.js');
self.onmessage = (e) => {
	const { state, level } = e.data;
	self.postMessage(DraughtsAI.chooseMove(state, level));
};
