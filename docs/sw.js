// Service Worker der JH Draft League — nur für Systemmeldungen.
// Kein Cache, kein Offline-Betrieb: Die Anwendung lädt ihre Daten live aus Firestore.
// Ein Tipp auf eine Meldung holt das offene Fenster nach vorn oder öffnet die App.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => 'focus' in c);
    if (open) return open.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
