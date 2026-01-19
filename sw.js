const CACHE_NAME = 'alagahelp-v1';
const ASSETS = [
  '/', 
  'index.html',
  'style.css',
  'script.js',
  'clima_3dias.js',
  'logo-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos map para tentar adicionar um por um, assim se um falhar, sabemos qual foi
      return Promise.all(
        ASSETS.map(url => {
          return cache.add(url).catch(err => console.log("Falha ao cachear:", url));
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});