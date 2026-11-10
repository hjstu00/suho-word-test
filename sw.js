// 오프라인: 앱 파일은 설치 때, 소리·글꼴은 처음 쓸 때 저장한다. 파일을 고치면 VERSION을 올린다.
const VERSION = '1f477e7c6b';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'rules.js', 'words.json', 'sounds.json', 'manifest.webmanifest', 'icon-180.png',
  'img/excavator.jpg', 'img/breaker.jpg', 'img/bulldozer.jpg', 'img/loader.jpg', 'img/forklift.jpg', 'img/tower-crane.jpg',
  'img/dump-truck.jpg', 'img/roller.jpg', 'img/tesla.jpg'];

// 저장소 이름에 앱 경로를 붙인다: 본 사이트와 시험 사이트가 같은 주소(hjstu00.github.io)라 저장소를 같이 쓰므로
// 새 버전이 켜질 때 남의 저장분까지 지우지 않게 자기 경로 것만 지운다.
const CACHE = self.registration.scope + VERSION;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(self.registration.scope) && k !== CACHE)
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  })));
});
