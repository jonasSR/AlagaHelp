const CACHE_NAME = 'alagahelp-v1';
const ASSETS = [
  '/', 
  'index.html',
  'style.css',
  'script.js',
  'logo-512.png',
  'login.html',    // Adicionado (está na sua imagem)
  'login.js',      // Adicionado (está na sua imagem)
  'login.css',     // Adicionado (está na sua imagem)
  'manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS.map(url => {
          return cache.add(url).catch(err => console.log("Erro ao cachear arquivo inexistente:", url));
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