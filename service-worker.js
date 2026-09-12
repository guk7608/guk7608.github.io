// 성광감리교회 홈페이지 PWA 서비스 워커.
// 전략: 네트워크 우선(온라인일 땐 항상 최신 내용을 받아오고 캐시를 갱신), 오프라인일 때만
// 마지막으로 저장된 캐시를 보여준다. 새벽묵상/이주의 말씀 데이터가 30분마다 갱신되므로
// 오래된 캐시를 우선 보여주는 방식(캐시 우선)은 쓰지 않는다.

const CACHE_NAME = 'skchurch-v1';
const PRECACHE_URLS = [
  './',
  'index.html',
  'devotion.html',
  'sunday-word.html',
  'bible-reading.html',
  'album.html',
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

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return response;
      })
      .catch(function () { return caches.match(event.request); })
  );
});
