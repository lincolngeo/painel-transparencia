/* Service worker do Painel de Transparência da SEDEC (PWA).
   Estratégias:
   - HTML/navegação: network-first (mostra atualizações online; cai no cache offline).
   - dados.json: network-first — é o dado que muda a cada atualização do S2iD, NUNCA
     pode vir do cache quando há rede (senão o painel mostra dados velhos).
   - malhas (uf.geojson, mun/*.geojson): cache-first (grandes e estáveis).
   - demais estáticos mesmos-domínio (css/js/libs/img/fonts): stale-while-revalidate.
   - domínios externos (tiles Esri/CARTO/OSM): não intercepta (rede padrão).
   Ao editar arquivos do painel, incremente CACHE para limpar o cache antigo. */
'use strict';
var CACHE = 'painel-transparencia-v13';

// itens do "app shell" pré-cacheados na instalação (tolerante a falhas individuais)
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/estilo.css?v=27',
  './js/app.js?v=33',
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

/* malhas territoriais: grandes e estáveis -> cache-first */
function ehMalha(url) {
  return /\/dados\/.*\.geojson$/.test(url.pathname);
}
/* o dado consolidado do S2iD: muda a cada atualização -> network-first */
function ehDadosVivos(url) {
  return /\/dados\/dados\.json$/.test(url.pathname);
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

  // dados.json: network-first — sempre busca a versão nova quando há rede;
  // o cache só serve de reserva offline. Sem isto, uma atualização do S2iD
  // nunca aparecia para quem já tinha aberto o painel.
  if (ehDadosVivos(url)) {
    e.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copia = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return resp;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // malhas (geojson): cache-first (guarda ao baixar)
  if (ehMalha(url)) {
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
