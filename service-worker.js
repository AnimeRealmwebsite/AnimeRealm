const CACHE_NAME = 'animerealm-v1.0.0';
const STATIC_CACHE_NAME = 'animerealm-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'animerealm-dynamic-v1.0.0';

// Files to cache immediately (static assets)
const STATIC_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/chat.js',
  '/profile.js',
  '/supabaseConfig.js',
  '/manifest.json'
];

// Files to cache dynamically (API responses, images)
const DYNAMIC_CACHE_PATTERNS = [
  /^https:\/\/graphql\.anilist\.co/,
  /^https:\/\/api\.dicebear\.com/,
  /^https:\/\/images\.websim\.com/,
  /^https:\/\/via\.placeholder\.com/
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Caching static files...');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Error caching static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE_NAME &&
              cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve cached files or fetch from network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // Return cached version if available
      if (cachedResponse) {
        // For HTML files, try to update cache in background
        if (request.destination === 'document') {
          event.waitUntil(updateCache(request));
        }
        return cachedResponse;
      }

      // Fetch from network
      return fetch(request).then((response) => {
        // Only cache successful responses (allow same-origin and CORS)
        if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
          return response;
        }

        // Clone response for caching
        const responseToCache = response.clone();

        // Determine which cache to use
        let cacheName = DYNAMIC_CACHE_NAME;
        if (STATIC_FILES.includes(url.pathname) || 
            STATIC_FILES.includes(request.url)) {
          cacheName = STATIC_CACHE_NAME;
        }

        // Cache dynamic content that matches patterns
        const shouldCacheDynamic = DYNAMIC_CACHE_PATTERNS.some(pattern => 
          pattern.test(request.url)
        );

        if (shouldCacheDynamic || cacheName === STATIC_CACHE_NAME) {
          event.waitUntil(
            caches.open(cacheName).then((cache) => {
              return cache.put(request, responseToCache);
            })
          );
        }

        return response;
      }).catch(() => {
        // Return offline page for HTML requests
        if (request.destination === 'document') {
          return caches.match('/');
        }
        // Return placeholder image for image requests
        if (request.destination === 'image') {
          return new Response(
            '<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1A1A1A"/><text x="50%" y="50%" text-anchor="middle" fill="#6C63FF">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      });
    })
  );
});

// Update cache in background
async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      await cache.put(request, response);
    }
  } catch (error) {
    console.log('Background update failed:', error);
  }
}

// Background sync for when connection is restored
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  if (event.tag === 'background-sync') {
    event.waitUntil(Promise.resolve()); // no-op: localStorage is unavailable in SW
  }
});

async function syncPendingData() {
  // Removed usage of localStorage (not available in Service Worker)
  return Promise.resolve();
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    image: data.image,
    data: data.data,
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/view-icon.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/close-icon.png'
      }
    ],
    tag: data.tag || 'default',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  } else if (event.action !== 'close') {
    // Default action (clicking notification body)
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if no existing window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Cache management - clean up old cache entries
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            return caches.delete(cacheName);
          })
        );
      })
    );
  }
});

console.log('Service Worker loaded successfully');