self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {

  let data = { title: "New Notification", body: "You have a new update." };
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data = { title: "Hellcore Network", body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/static/logo.png',
    badge: '/static/logo.png',
    data: {
      url: (data.data && data.data.url) || '/tickets',
      unread_count: (data.data && data.data.unread_count) || 0
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/tickets';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('/tickets') && 'focus' in client) {
          client.postMessage({ type: 'notification-open', url: targetUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
