/* IronTrack · Migración 238: recibe las alertas del teléfono y abre la pantalla al tocarlas.
   Migración 306: cada una queda pendiente hasta que se abre y el ícono de la app muestra cuántas hay. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/** El número rojo del ícono (iPhone con la app instalada y Chrome/Edge de computadora; en Android lo pone el teléfono). */
function ponerNumero(n) {
  const nav = self.navigator;
  if (typeof n !== 'number' || !nav || !('setAppBadge' in nav)) return Promise.resolve();
  return (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge()).catch(() => undefined);
}

/** Avisa a las pantallas abiertas que cambiaron las notificaciones sin revisar. */
function avisarPantallas() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) c.postMessage({ tipo: 'notificaciones' });
  });
}

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { cuerpo: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(d.titulo || 'IronTrack', {
        body: d.cuerpo || '',
        icon: '/icono-192.png',
        badge: '/icono-192.png',
        tag: d.etiqueta || undefined,
        requireInteraction: !!d.urgente,
        vibrate: d.urgente ? [300, 100, 300, 100, 300] : [200],
        data: { url: d.url || '/hoy', id: d.id || null },
      }),
      ponerNumero(d.pendientes),
      avisarPantallas(),
    ]),
  );
});

/** Al tocarla queda vista: la base la marca con la sesión del teléfono y dice cuántas quedan. */
function marcarVista(id) {
  if (!id) return Promise.resolve();
  return fetch('/api/notificaciones/vista', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    credentials: 'same-origin',
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && typeof j.pendientes === 'number' ? ponerNumero(j.pendientes) : undefined))
    .then(avisarPantallas)
    .catch(() => undefined);
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const datos = e.notification.data || {};
  const url = new URL(datos.url || '/hoy', self.location.origin).href;
  e.waitUntil(
    Promise.all([
      marcarVista(datos.id),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
        for (const c of lista) {
          if (c.url.startsWith(self.location.origin) && 'navigate' in c) return c.focus().then(() => c.navigate(url));
        }
        return self.clients.openWindow(url);
      }),
    ]),
  );
});
