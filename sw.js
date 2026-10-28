/* Naija Draft Club service worker: the game works offline once visited; the API is never cached. */
const CACHE = 'ndc-v3';
const SHELL = [
	'./', 'index.html', 'how-to-play.html', 'manifest.webmanifest',
	'src/engine.js?v=4', 'src/ai.js?v=4', 'src/ai-worker.js?v=4',
	'assets/logo.svg', 'assets/icon-192.png', 'assets/icon-512.png',
];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
		.then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
	if (e.request.mode === 'navigate') {
		// Pages: always try the network first so players get updates, fall back to the cached game offline.
		e.respondWith(fetch(e.request).then((res) => {
			const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
		}).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
		return;
	}
	// Scripts and images: answer from the cache at once, refresh it in the background.
	e.respondWith(caches.match(e.request).then((cached) => {
		const fresh = fetch(e.request).then((res) => {
			if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
			return res;
		}).catch(() => cached);
		return cached || fresh;
	}));
});
