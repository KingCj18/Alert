self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title = data.title || 'TOP Alert';
  const options = {
    body: data.body || 'Twenty One Pilots may be playing on 107.3 ALTCLE.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'top-alert',
    renotify: true,
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
