/* Naija Draft Club service worker: the game works offline once visited; the API is never cached. */
const CACHE = 'ndc-v4';
const SHELL = [
	'./', 'index.html', 'how-to-play.html', 'manifest.webmanifest',
	'src/engine.js?v=4', 'src/ai.js?v=4', 'src/ai-worker.js?v=4',
	'assets/logo.svg', 'assets/icon-192.png', 'assets/icon-512.png',
];

// Safari refuses to show a page that a service worker answers with a "redirected" response,
// so store a clean copy (same body and headers, no redirect flag).
async function clean(res) {
	if (!res || !res.redirected) return res;
	const body = await res.blob();
	return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (e) => {
	// Each file on its own: one failed download must not stop the game from working offline.
	e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((url) =>
		fetch(url, { cache: 'reload' }).then((res) => (res.ok ? clean(res).then((r) => c.put(url, r)) : null))
	))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
		.then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
	if (e.request.mode === 'navigate') {
		// Pages: network first so players get updates; offline, any address of the site opens the cached game
		// (links shared on WhatsApp or Facebook often carry extra "?..." codes).
		e.respondWith(fetch(e.request).then(async (res) => {
			if (res.ok) { const copy = await clean(res.clone()); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
			return res;
		}).catch(async () => {
			const c = await caches.open(CACHE);
			return (await c.match(e.request, { ignoreSearch: true }))
				|| (url.pathname.endsWith('how-to-play.html') && await c.match('how-to-play.html'))
				|| (await c.match('index.html')) || (await c.match('./'));
		}));
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
