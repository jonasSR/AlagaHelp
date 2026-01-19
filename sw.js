const CACHE_NAME = 'alagahelp-v2'; // Mudei para v2 para forçar atualização
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'clima_3dias.js',
  'manifest.json',
  'logo-512.png' // Ícone adicionado aqui
];

// Instala o Service Worker e guarda os arquivos no cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Arquivos em cache com sucesso!');
      return cache.addAll(ASSETS);
    })
  );
});

// Limpa caches antigos se você mudar o nome da CACHE_NAME
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('Removendo cache antigo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
});

// Responde com o cache ou busca na rede se não encontrar
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});