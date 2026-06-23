const CACHE = 'otr-v5';
const OFFLINE_URL = '/';

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.add(OFFLINE_URL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.mode !== 'navigate') return;
    e.respondWith(
        fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    );
});

self.addEventListener('push', e => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch (_) { data = {}; }
    const title   = data.title || '📨 Новое VK сообщение';
    const options = {
        body:      data.body  || 'Лид написал в VK',
        icon:      '/logo-icon.svg',
        badge:     '/logo-icon.svg',
        tag:       'vk-incoming',
        renotify:  true,
        data:      { url: data.url || '/' }
    };
    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const targetUrl = (e.notification.data && e.notification.data.url) || '/';
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('focus' in client) return client.focus();
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});
