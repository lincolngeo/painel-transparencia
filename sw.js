/* Service worker do Painel de Transparência da SEDEC (PWA).
   Estratégias:
   - HTML/navegação: network-first (mostra atualizações online; cai no cache offline).
   - dados/ (geojson/json/csv): cache-first (arquivos grandes e estáveis por versão).
   - demais estáticos mesmos-domínio (css/js/libs/img/fonts): stale-while-revalidate.
   - domínios externos (tiles Esri/CARTO/OSM): não intercepta (rede padrão).
   Ao editar arquivos do painel, incremente CACHE para limpar o cache antigo. */
'use strict';
var CACHE = 'painel-transparencia-v5';

// itens do "app shell" pré-cacheados na instalação (tolerante a falhas individuais)
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/estilo.css?v=25',
  './js/app.js?v=25',
  './libs/leaflet.css',
  './libs/leaflet.js',
  './libs/echarts.min.js',
  './libs/fflate.min.js',
  './libs/images/layers.png',
  './libs/images/layers-2x.png',
  './libs/images/marker-icon.png',
  './libs/fonts/mukta-300.woff2',
  './libs/fonts/mukta-500.woff2',
  './libs/fonts/mukta-700.woff2',
  './img/marca_defesa_civil_quadrada.png',
  './img/icon-192.png',
  './img/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.allSettled(SHELL.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        if (n !== CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function ehDados(url) {
  return /\/dados\/.*\.(geojson|json|csv)$/.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // outros domínios (tiles): deixa o navegador cuidar
  if (url.origin !== self.location.origin) return;

  // navegação / HTML: network-first
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    e.respondWith(
      fetch(req).then(function (resp) {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
        return resp;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // dados/: cache-first (guarda ao baixar)
  if (ehDados(url)) {
    e.respondWith(
      caches.match(req).then(function (cacheado) {
        return cacheado || fetch(req).then(function (resp) {
          if (resp && resp.ok) {
            var copia = resp.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copia); });
          }
          return resp;
        });
      })
    );
    return;
  }

  // demais estáticos: stale-while-revalidate
  e.respondWith(
    caches.match(req).then(function (cacheado) {
      var rede = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copia = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return resp;
      }).catch(function () { return cacheado; });
      return cacheado || rede;
    })
  );
});
