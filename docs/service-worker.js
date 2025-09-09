/* docs/service-worker.js */
const CACHE_NAME = 'jjs2025-cache-v3';
const PRECACHE_URLS = [
  './',
  './index.html',
  // 매니페스트는 쿼리스트링 없이도 캐싱되도록 원본 경로를 precache
  './manifest.webmanifest',
  // 아이콘(인덱스에서 참조하는 파일명 기준)
  './icon-192-v2.png',
  './icon-512-v2.png',
  // 혹시 이전 파일명을 쓰는 경우 대비(둘 다 존재해도 문제 없음)
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
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      )
    )
  );
  self.clients.claim();
});

// 헬퍼: 요청의 search/query 제거한 URL로 캐시 매칭 시도
function stripSearch(request) {
  try {
    const url = new URL(request.url);
    url.search = '';
    return new Request(url.toString(), { method: request.method, headers: request.headers, mode: request.mode, credentials: request.credentials, redirect: request.redirect, referrer: request.referrer, referrerPolicy: request.referrerPolicy, integrity: request.integrity, cache: request.cache, keepalive: request.keepalive });
  } catch {
    return request;
  }
}

// 네비게이션 요청: 네트워크 우선, 실패 시 캐시(또는 오프라인 대체)
async function handleNavigate(event) {
  try {
    const netRes = await fetch(event.request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(stripSearch(event.request), netRes.clone());
    return netRes;
  } catch (e) {
    // 네트워크 실패 시 index.html로 폴백(오프라인 라우팅)
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('./index.html');
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// 정적 리소스: 캐시 우선 + 백그라운드 갱신(Stale-While-Revalidate)
async function handleStatic(event) {
  const cache = await caches.open(CACHE_NAME);
  const reqNoSearch = stripSearch(event.request);
  const cached = await cache.match(reqNoSearch);
  const fetchPromise = fetch(event.request)
    .then((netRes) => {
      // 성공한 요청만 캐시에 갱신
      if (netRes && netRes.ok && event.request.method === 'GET' && new URL(event.request.url).origin === self.location.origin) {
        cache.put(reqNoSearch, netRes.clone());
      }
      return netRes;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

// Fetch 핸들러
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST 등은 그대로 네트워크
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 네비게이션(페이지 로드/SPA 라우팅)은 네트워크 우선
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // 동일 출처의 정적 파일: 캐시 우선
  if (isSameOrigin) {
    event.respondWith(handleStatic(event));
    return;
  }

  // 외부 리소스는 네트워크 우선(그냥 패스스루)
  event.respondWith(fetch(request).catch(() => new Response('Offline', { status: 503 })));
});

// 클라이언트에서 skipWaiting 트리거용
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
