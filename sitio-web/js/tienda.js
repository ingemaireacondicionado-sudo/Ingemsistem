/* ==========================================================================
   INGEM — Tienda: filtros, detalle de producto y calculadora de frigorías
   ========================================================================== */
(function () {
  'use strict';

  document.addEventListener('ingem:listo', function () {
    const UI = window.INGEM_UI;
    const C = window.INGEM || {};
    const PRODS = window.INGEM_PRODUCTOS || [];
    const CATS = window.INGEM_CATEGORIAS || [];
    const $ = function (id) { return document.getElementById(id); };

    const grilla = $('grilla');
    if (!grilla) return;

    const estado = { cat: 'todos', marcas: [], q: '', orden: 'destacados', fg: null };

    /* ---------- Aviso de catálogo de muestra ---------- */
    const aviso = $('aviso-ejemplo');
    if (aviso) aviso.hidden = !C.catalogoDeEjemplo;
    const nota = $('nota-precios');
    if (nota && C.notaPrecios) nota.textContent = C.notaPrecios;

    /* ---------- Pestañas y marcas ---------- */
    const tabs = $('tabs');
    tabs.innerHTML = [{ id: 'todos', nombre: 'Todos' }].concat(CATS).map(function (c) {
      const n = c.id === 'todos' ? PRODS.length : PRODS.filter(function (p) { return p.categoria === c.id; }).length;
      return '<button type="button" class="tab" data-cat="' + c.id + '" aria-pressed="false">' + UI.esc(c.nombre) + '<span class="n">' + n + '</span></button>';
    }).join('');

    const marcas = [];
    PRODS.forEach(function (p) { if (marcas.indexOf(p.marca) < 0) marcas.push(p.marca); });
    const chips = $('marcas');
    chips.innerHTML = marcas.map(function (m) {
      return '<button type="button" class="chip" data-marca="' + UI.esc(m) + '" aria-pressed="false">' + UI.esc(m) + '</button>';
    }).join('');

    /* ---------- Listado ---------- */
    function filtrados() {
      const q = estado.q.toLowerCase();
      let lista = PRODS.filter(function (p) {
        if (estado.cat !== 'todos' && p.categoria !== estado.cat) return false;
        if (estado.marcas.length && estado.marcas.indexOf(p.marca) < 0) return false;
        if (estado.fg && p.frigorias !== estado.fg) return false;
        if (q) {
          const texto = [p.nombre, p.marca, p.tecnologia, p.descripcion, p.ambiente].join(' ').toLowerCase();
          if (texto.indexOf(q) < 0) return false;
        }
        return true;
      });
      const precio = function (p, vacio) { return p.precio == null ? vacio : p.precio; };
      if (estado.orden === 'menor') lista = lista.slice().sort(function (a, b) { return precio(a, Infinity) - precio(b, Infinity); });
      if (estado.orden === 'mayor') lista = lista.slice().sort(function (a, b) { return precio(b, -1) - precio(a, -1); });
      if (estado.orden === 'capacidad') lista = lista.slice().sort(function (a, b) { return (a.frigorias || Infinity) - (b.frigorias || Infinity); });
      return lista;
    }

    function pintar() {
      const lista = filtrados();
      tabs.querySelectorAll('.tab').forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.cat === estado.cat ? 'true' : 'false');
      });
      chips.querySelectorAll('.chip').forEach(function (b) {
        b.setAttribute('aria-pressed', estado.marcas.indexOf(b.dataset.marca) >= 0 ? 'true' : 'false');
      });
      const quitarFg = $('quitar-fg');
      quitarFg.hidden = !estado.fg;
      if (estado.fg) quitarFg.querySelector('span').textContent = UI.miles(estado.fg) + ' FG';
      $('resultado').textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos');
      grilla.innerHTML = lista.length
        ? lista.map(function (p) { return UI.tarjeta(p); }).join('')
        : '<div class="vacio"><h3>No encontramos equipos con esos filtros</h3>' +
          '<p>Probá con otra marca o categoría, o consultanos por el modelo que buscás.</p>' +
          '<button type="button" class="btn btn--ghost" data-limpiar>Quitar filtros</button></div>';
    }

    function limpiar() {
      estado.cat = 'todos';
      estado.marcas = [];
      estado.q = '';
      estado.fg = null;
      $('buscar').value = '';
      pintar();
    }

    tabs.addEventListener('click', function (e) {
      const b = e.target.closest('.tab');
      if (!b) return;
      estado.cat = b.dataset.cat;
      try { history.replaceState(null, '', estado.cat === 'todos' ? location.pathname : '#' + estado.cat); } catch (err) { /* sin historial */ }
      pintar();
    });
    chips.addEventListener('click', function (e) {
      const b = e.target.closest('.chip');
      if (!b) return;
      const i = estado.marcas.indexOf(b.dataset.marca);
      if (i >= 0) estado.marcas.splice(i, 1); else estado.marcas.push(b.dataset.marca);
      pintar();
    });
    $('buscar').addEventListener('input', function (e) { estado.q = e.target.value.trim(); pintar(); });
    $('orden').addEventListener('change', function (e) { estado.orden = e.target.value; pintar(); });
    $('quitar-fg').addEventListener('click', function () { estado.fg = null; pintar(); });
    grilla.addEventListener('click', function (e) { if (e.target.closest('[data-limpiar]')) limpiar(); });

    /* ---------- Detalle de producto ---------- */
    document.body.insertAdjacentHTML('beforeend',
      '<dialog class="detalle" id="detalle" aria-labelledby="detalle-titulo"><div class="detalle__barra">' +
      '<button type="button" class="icon-btn" data-detalle-cerrar aria-label="Cerrar el detalle">' + UI.ico('x') + '</button></div>' +
      '<div class="detalle__grid" id="detalle-contenido"></div></dialog>');
    const dlg = $('detalle');

    function abrirDetalle(id) {
      const p = UI.porId[id];
      if (!p) return;
      const filas = [];
      if (p.frigorias) filas.push(['Capacidad', UI.miles(p.frigorias) + ' frigorías' + (p.kw ? ' · ' + UI.coma(p.kw) + ' kW' : '')]);
      if (p.tecnologia) filas.push(['Tecnología', p.tecnologia]);
      if (p.modo) filas.push(['Modo', p.modo]);
      if (p.ambiente) filas.push(['Ambiente', p.ambiente]);
      filas.push(['Marca', p.marca]);
      const pie = p.precio != null
        ? '<div class="precio">' + UI.fmt(p.precio) + '<small>IVA incluido</small></div>' +
          '<div class="detalle__btns"><button type="button" class="btn btn--primary" data-agregar="' + p.id + '">' + UI.ico('plus') + 'Agregar al pedido</button>' +
          '<a class="btn btn--ghost" target="_blank" rel="noopener" href="' + UI.wa('¡Hola INGEM! Tengo una consulta sobre: ' + p.nombre + ' (' + p.marca + ').') + '">Consultar</a></div>'
        : '<div class="precio precio--consultar">Se cotiza según el proyecto</div>' +
          '<div class="detalle__btns"><a class="btn btn--wa" target="_blank" rel="noopener" href="' + UI.wa(UI.msgCotizar(p)) + '">' + UI.ico('wa', 'ico--fill') + 'Pedir cotización</a></div>';
      $('detalle-contenido').innerHTML =
        '<div class="detalle__media">' + (p.imagen ? '<img src="' + UI.esc(p.imagen) + '" alt="' + UI.esc(p.nombre) + '">' : UI.ilus(p.tipo, p.nombre)) + '</div>' +
        '<div class="detalle__body">' +
        '<span class="prod__marca">' + UI.esc(p.marca) + '</span>' +
        '<h2 id="detalle-titulo">' + UI.esc(p.nombre) + '</h2>' +
        '<p>' + UI.esc(p.descripcion || '') + '</p>' +
        '<dl class="ficha">' + filas.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + UI.esc(f[1]) + '</dd>'; }).join('') + '</dl>' +
        (p.incluye && p.incluye.length
          ? '<ul class="checklist">' + p.incluye.map(function (i) { return '<li>' + UI.ico('check') + '<span>' + UI.esc(i) + '</span></li>'; }).join('') + '</ul>'
          : '') +
        '<div class="detalle__pie">' + pie + '</div>' +
        '</div>';
      if (!dlg.open) dlg.showModal();
      dlg.scrollTop = 0;
    }

    document.addEventListener('click', function (e) {
      const d = e.target.closest('[data-detalle]');
      if (d) abrirDetalle(d.dataset.detalle);
    });
    dlg.addEventListener('click', function (e) {
      // Cierra al tocar fuera, con el botón, o al agregar (para que se vea el aviso).
      if (e.target === dlg || e.target.closest('[data-detalle-cerrar]') || e.target.closest('[data-agregar]')) dlg.close();
    });

    /* ---------- Calculadora de frigorías ---------- */
    const TAMANOS = [2250, 3000, 4500, 5500, 9000, 15000];
    const FACTOR = { normal: 1, sol: 1.15, local: 1.3 };
    let recomendado = null;

    function calcular() {
      const m2 = parseFloat(String($('calc-m2').value).replace(',', '.'));
      const num = $('calc-num');
      const texto = $('calc-texto');
      const ver = $('calc-ver');
      const cotizar = $('calc-cotizar');
      if (!m2 || m2 <= 0) {
        num.innerHTML = '— <small>FG</small>';
        texto.textContent = 'Ingresá los metros cuadrados del ambiente.';
        ver.hidden = true;
        cotizar.hidden = true;
        return;
      }
      // Referencia: 50 frigorías por m³ con techo de 2,5 m (125 FG por m²).
      const fg = m2 * 125 * (FACTOR[$('calc-uso').value] || 1);
      const redondo = Math.round(fg / 50) * 50;
      recomendado = TAMANOS.find(function (t) { return t >= fg * 0.95; }) || null;
      num.innerHTML = UI.miles(redondo) + ' <small>FG</small>';
      if (recomendado) {
        texto.innerHTML = 'Para ' + UI.coma(m2) + ' m² te conviene un equipo de <strong>' + UI.miles(recomendado) + ' frigorías</strong>.';
        ver.querySelector('span').textContent = 'Ver equipos de ' + UI.miles(recomendado) + ' FG';
        ver.hidden = false;
        cotizar.hidden = true;
      } else {
        texto.innerHTML = 'Para esa superficie conviene un <strong>proyecto a medida</strong>: varios equipos comerciales o un sistema VRF.';
        ver.hidden = true;
        cotizar.hidden = false;
        cotizar.href = UI.wa('¡Hola INGEM! Necesito climatizar un ambiente de ' + UI.coma(m2) + ' m² y quiero que me asesoren.');
      }
    }
    $('calc-m2').addEventListener('input', calcular);
    $('calc-uso').addEventListener('change', calcular);
    $('calc-ver').addEventListener('click', function () {
      if (!recomendado) return;
      estado.cat = 'todos';
      estado.marcas = [];
      estado.q = '';
      $('buscar').value = '';
      estado.fg = recomendado;
      pintar();
      $('catalogo').scrollIntoView({ block: 'start' });
    });
    calcular();

    /* ---------- Enlaces directos: #splits, #comerciales, #vrf, #p-<producto> ---------- */
    function leerHash() {
      const h = decodeURIComponent(location.hash.replace('#', ''));
      if (!h) return;
      if (CATS.some(function (c) { return c.id === h; })) {
        estado.cat = h;
        pintar();
        $('catalogo').scrollIntoView({ block: 'start' });
      } else if (h.indexOf('p-') === 0 && UI.porId[h.slice(2)]) {
        estado.cat = UI.porId[h.slice(2)].categoria;
        pintar();
        abrirDetalle(h.slice(2));
      }
    }
    window.addEventListener('hashchange', leerHash);

    pintar();
    leerHash();
  });
})();
