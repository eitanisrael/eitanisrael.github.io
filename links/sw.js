/*
 * sw.js — Service Worker.
 *  • Shell (HTML/CSS/JS/פונטים/אייקונים): cache-first → עובד אופליין ומהיר.
 *  • data/links.json: network-first עם נפילה ל-cache → תמיד טרי כשיש רשת.
 *  • קריאות ל-api.github.com (חוצות מקור) עוברות ישירות, בלי מטמון.
 *
 * מעלים את מספר הגרסה כדי לרענן מטמון אחרי שינוי בקוד.
 */
const VERSION = "linkhub-v3";
const CACHE = VERSION;

const PRECACHE = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.webmanifest",
  "./admin.webmanifest",
  "./assets/css/styles.css",
  "./assets/css/admin.css",
  "./assets/js/config.js",
  "./assets/js/theme.js",
  "./assets/js/store.js",
  "./assets/js/public.js",
  "./assets/js/admin.js",
  "./assets/fonts/assistant-hebrew-400.woff2",
  "./assets/fonts/assistant-hebrew-600.woff2",
  "./assets/fonts/assistant-hebrew-700.woff2",
  "./assets/fonts/assistant-latin-400.woff2",
  "./assets/fonts/assistant-latin-600.woff2",
  "./assets/fonts/assistant-latin-700.woff2",
  "./assets/icons/favicon.svg",
  "./assets/icons/avatar.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./data/links.json",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // best-effort: קובץ חסר בודד לא יפיל את ההתקנה
      return Promise.allSettled(
        PRECACHE.map(function (u) {
          return cache.add(new Request(u, { cache: "reload" }));
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return k !== CACHE;
        }).map(function (k) {
          return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: "no-store" });
    if (res && res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && res.type === "basic") cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // מקורות חיצוניים (api.github.com וכו') — לא מטפלים, עוברים ישירות לרשת
  if (url.origin !== self.location.origin) return;

  // קובץ הנתונים — network-first (מתעלמים מ-query כדי לשמור מפתח מטמון יציב)
  if (url.pathname.endsWith("/data/links.json")) {
    event.respondWith(networkFirst(req, url.origin + url.pathname));
    return;
  }

  // ניווטים — network-first עם נפילה ל-shell מהמטמון (אופליין)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match("./index.html");
        });
      })
    );
    return;
  }

  // שאר הנכסים — cache-first
  event.respondWith(cacheFirst(req));
});
