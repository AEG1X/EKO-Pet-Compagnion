// Notifications d'EKO : chargé par le service worker généré (workbox importScripts).
// Le message arrive chiffré ; le navigateur le déchiffre avant cet évènement.
self.addEventListener('push', (event) => {
  let data = { title: 'EKO', body: '', url: '/', tag: 'eko' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Message illisible : notification générique.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'fr',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        open.navigate(target);
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
