/* IronTrack · Migración 238: recibe las alertas del teléfono y abre la pantalla al tocarlas. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { cuerpo: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || 'IronTrack', {
      body: d.cuerpo || '',
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      tag: d.etiqueta || undefined,
      requireInteraction: !!d.urgente,
      vibrate: d.urgente ? [300, 100, 300, 100, 300] : [200],
      data: { url: d.url || '/hoy' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/hoy', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if (c.url.startsWith(self.location.origin) && 'navigate' in c) return c.focus().then(() => c.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
