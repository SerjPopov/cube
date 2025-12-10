// Service Worker для приложения "Кубик"
// Версия для принудительного обновления кэша
const CACHE_NAME = 'cube-timer-v1.0.0';
const urlsToCache = [
  '/cube/',
  '/cube/index.html',
  '/cube/manifest.json',
  '/cube/icon-72x72.png',
  '/cube/icon-96x96.png',
  '/cube/icon-128x128.png',
  '/cube/icon-144x144.png',
  '/cube/icon-152x152.png',
  '/cube/icon-192x192.png',
  '/cube/icon-384x384.png',
  '/cube/icon-512x512.png',
  'https://unpkg.com/vue@3/dist/vue.global.js'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Установка Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('[SW] Ошибка кэширования:', error);
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  // Пропускаем запросы к BLE API (не поддерживаются оффлайн)
  if (event.request.url.includes('bluetooth')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Если есть в кэше, возвращаем оттуда
        if (response) {
          console.log('[SW] Загрузка из кэша:', event.request.url);
          return response;
        }
        
        // Иначе пытаемся загрузить из сети
        return fetch(event.request)
          .then((response) => {
            // Проверяем, что ответ корректный
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Кэшируем только GET запросы к нашим файлам
            if (event.request.method === 'GET' && 
                (event.request.url.startsWith(self.location.origin) ||
                 event.request.url.includes('unpkg.com/vue'))) {
              
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then((cache) => {
                  console.log('[SW] Кэширование нового ресурса:', event.request.url);
                  cache.put(event.request, responseToCache);
                });
            }
            
            return response;
          })
          .catch((error) => {
            console.error('[SW] Ошибка загрузки:', error);
            
            // Для HTML запросов или запросов к корню возвращаем index.html
            if (event.request.destination === 'document' || 
                event.request.url.endsWith('/') ||
                event.request.url === self.location.origin ||
                event.request.url === self.location.origin + '/cube/') {
              return caches.match('/cube/index.html');
            }
          });
      })
  );
});

// Обработка сообщений от приложения
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});