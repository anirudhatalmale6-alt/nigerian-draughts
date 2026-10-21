# Nigerian Draughts

Play Nigerian draughts in the browser — 10×10 board, 20 seeds each, flying kings, men that capture backward, compulsory capture **without** the majority rule.

**Play:** https://anirudhatalmale6-alt.github.io/nigerian-draughts/

- `src/engine.js` — pure rules engine (browser + Node), the single source of truth for move validation; will also run on the multiplayer server.
- `src/ai.js` — computer opponent (alpha-beta, 3 levels), run in a Web Worker (`src/ai-worker.js`).
- `test/engine.test.js` — rule tests: `node test/engine.test.js`.
