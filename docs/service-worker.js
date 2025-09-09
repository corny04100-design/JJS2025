/* docs/service-worker.js */
const CACHE_NAME = 'jjs2025-cache-v4';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon_192.png',
  './icon_512.png'
];

// 설치: 미리 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// 활성화: 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)))
    )
  );
  self.clients.claim();
});

// 요청에서 쿼리스트링 제거해 캐시 매칭 향상
function stripSearch(request) {
  try {
    const url = new URL(request.url);
    url.search = '';
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      mode: request.mode,
      credentials: request.credentials,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      integrity: request.integrity,
      cache: request.cache,
      keepalive: request.keepalive
    });
  } catch {
    return request;
  }
}

// 네비게이션: 네트워크 우선, 실패 시 index.html
async function handleNavigate(event) {
  try {
    const netRes = await fetch(event.request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(stripSearch(event.request), netRes.clone());
    return netRes;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('./index.html');
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// 정적 리소스: 캐시 우선 + 백그라운드 갱신
async function handleStatic(event) {
  const cache = await caches.open(CACHE_NAME);
  const reqNoSearch = stripSearch(event.request);
  const cached = await cache.match(reqNoSearch);

  const fetchPromise = fetch(event.request)
    .then((netRes) => {
      if (netRes && netRes.ok && event.request.method === 'GET' &&
          new URL(event.request.url).origin === self.location.origin) {
        cache.put(reqNoSearch, netRes.clone());
      }
      return netRes;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  const isSameOrigin = new URL(request.url).origin === self.location.origin;
  if (isSameOrigin) {
    event.respondWith(handleStatic(event));
    return;
  }

  event.respondWith(fetch(request).catch(() => new Response('Offline', { status: 503 })));
});

// 선택: 클라이언트에서 즉시 업데이트 적용하려면 postMessage('SKIP_WAITING')
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
