/* GastroMetrik · guarda la app en el equipo para que abra aunque falle internet */
const CACHE = 'gastrometrik-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icono-192.png']))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;          // Supabase y fuentes van directo
  e.respondWith(fetch(r).then(res => { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); return res; })
    .catch(() => caches.match(r).then(x => x || caches.match('/'))));
});
