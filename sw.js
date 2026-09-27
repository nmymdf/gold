// 離線快取：一律先向伺服器確認最新版，離線或失敗時才用快取（避免更新後還看到舊畫面）
const CACHE = 'gold-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // 外部檔案（圖表程式庫）交給瀏覽器處理
  const key = url.origin + url.pathname;
  // 略過瀏覽器 HTTP 快取，每次都向伺服器確認最新版
  e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(key, copy));
    }
    return res;
  }).catch(() => caches.match(key)));
});
