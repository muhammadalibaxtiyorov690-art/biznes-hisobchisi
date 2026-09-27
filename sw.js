/* ==========================================================================
   BIZNES HISOBCHI - SERVICE WORKER (PWA Offline Support)
   ========================================================================== */

const CACHE_NAME = 'biznes-hisobchi-v2105';
const STATIC_CACHE = 'biznes-static-v2105';

// Offline rejimda ham ishlashi kerak bo'lgan asosiy fayllar
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './favicon.ico',
  './favicon.png',
  './apple-touch-icon.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

// Tashqi resurslar (CDN) — cache'da saqlanadi
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

// =============================================
// INSTALL — Barcha asosiy fayllarni cache'ga olish
// =============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Biznes Hisobchi PWA v2100...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Core assets cache error:', err);
      });

      for (const url of EXTERNAL_ASSETS) {
        await cache.add(url).catch(() => {
          console.warn('[SW] External asset not cached:', url);
        });
      }

      console.log('[SW] All assets cached successfully!');
    })
  );
  self.skipWaiting();
});

// =============================================
// ACTIVATE — Eski cache'larni tozalash
// =============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new Service Worker v2100...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// =============================================
// FETCH — Tarmoq so'rovlarini ushlash (Har doim Network-First)
// =============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Har doim Network-First: yangi versiyani darhol ko'rsatish
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate' || request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// =============================================
// Yordamchi: Tarmoqdan yuklab, cache'ga saqlash
// =============================================
async function fetchAndUpdateCache(request) {
  try {
    const networkResponse = await fetch(request);

    // Faqat muvaffaqiyatli javoblarni cache'laymiz
    if (networkResponse && networkResponse.status === 200) {
      const url = new URL(request.url);

      // Faqat same-origin yoki ruxsat etilgan tashqi domenlar
      const allowedOrigins = [
        self.location.origin,
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://cdnjs.cloudflare.com'
      ];

      const isAllowed = allowedOrigins.some((origin) => url.href.startsWith(origin));

      if (isAllowed) {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, networkResponse.clone());
      }
    }

    return networkResponse;
  } catch (error) {
    throw error;
  }
}

// =============================================
// MESSAGE — App dan xabarlar qabul qilish
// =============================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
    console.log('[SW] All caches cleared by app request');
  }
});

// =============================================
// BACKGROUND SYNC — Offline holatda yozilgan ma'lumotlarni sinxronlashtirish
// =============================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-products') {
    console.log('[SW] Background sync: products');
    // Bu yerda server bilan sinxronlash logikasi yozilishi mumkin
  }
});
