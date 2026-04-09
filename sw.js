/**
 * Service Worker для учебного PWA-проекта.
 *
 * Реализована стратегия App Shell:
 * 1. При установке кэшируются все статические ресурсы и страницы.
 * 2. Навигационные запросы (документы) загружаются по стратегии Network First.
 * 3. Статические ресурсы читаются из кэша при каждом запросе.
 * 4. При отсутствии сети приложения показывает offline-страницу.
 */

const CACHE_NAME = 'practice-13-14-cache-v5';
const RUNTIME_CACHE_NAME = 'practice-13-14-runtime-cache-v2';
const FALLBACK_HTML = './offline.html';

/**
 * Набор ресурсов, которые кладём в кэш сразу при установке Service Worker.
 * Это основная оболочка приложения (App Shell) и статические страницы.
 */
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './about.html',
  './styles.css',
  './manifest.json',
  './offline.html',
  './assets/hero.png',
  './assets/icons/favicon.ico',
  './assets/icons/favicon-16x16.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/favicon-48x48.png',
  './assets/icons/favicon-64x64.png',
  './assets/icons/favicon-128x128.png',
  './assets/icons/favicon-256x256.png',
  './assets/icons/favicon-512x512.png',
  './assets/icons/apple-touch-icon-57x57.png',
  './assets/icons/apple-touch-icon-114x114.png',
  './assets/icons/apple-touch-icon-120x120.png',
  './assets/icons/apple-touch-icon.png'
];

/**
 * install:
 * предварительное кэширование основных ресурсов.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );

  self.skipWaiting();
});

/**
 * activate:
 * удаляем устаревшие версии кэша.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheKeys) => {
      return Promise.all(
        cacheKeys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      );
    })
  );

  self.clients.claim();
});

/**
 * fetch:
 * базовая стратегия Cache First.
 *
 * Логика:
 * 1. Если ресурс есть в кэше — сразу возвращаем его.
 * 2. Если ресурса в кэше нет — пробуем получить из сети.
 * 3. Если сеть недоступна и кэша нет — возвращаем простой текстовый fallback-ответ.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (requestUrl.origin === self.location.origin && ['style', 'script', 'image', 'font'].includes(event.request.destination)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match(FALLBACK_HTML);
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return Response.error();
  }
}
