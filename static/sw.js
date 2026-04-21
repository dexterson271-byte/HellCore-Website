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
      url: '/?page=tickets'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('?page=tickets') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
