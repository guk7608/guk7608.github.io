// 성광감리교회 홈페이지 PWA 서비스 워커.
// 전략: 네트워크 우선(온라인일 땐 항상 최신 내용을 받아오고 캐시를 갱신), 오프라인일 때만
// 마지막으로 저장된 캐시를 보여준다. 새벽묵상/이주의 말씀 데이터가 30분마다 갱신되므로
// 오래된 캐시를 우선 보여주는 방식(캐시 우선)은 쓰지 않는다.

const CACHE_NAME = 'skchurch-v7';
const PRECACHE_URLS = [
  './',
  'index.html',
  'home.css',
  'og-image.jpg',
  'church-full.jpg',
  'kmc-logo.gif',
  'devotion.html',
  'sunday-word.html',
  'bible-reading.html',
  'album.html',
  'word-shout.html',
  'favicon.png',
  'manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// 같은 사이트 파일은 브라우저 HTTP 캐시(GitHub Pages는 10분 보관)를 거치지 않고
// 서버에 바뀌었는지 확인(no-cache)해서 받아온다. 그래야 홈페이지를 고친 직후에도
// 휴대폰에서 바로 새 화면이 보인다. 다른 사이트(Firebase, 유튜브 등) 요청은 그대로 둔다.
function freshFetch(request) {
  if (new URL(request.url).origin !== self.location.origin) return fetch(request);
  if (request.mode === 'navigate') return fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
  return fetch(request, { cache: 'no-cache' });
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    freshFetch(event.request)
      .then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return response;
      })
      .catch(function () { return caches.match(event.request); })
  );
});
