/* ==========================================================================
   INGEM — Lógica compartida por todas las páginas
   Encabezado, pie, íconos, carrito, formularios y enlaces de WhatsApp.
   Los datos salen de config.js, productos.js y trabajos.js.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.INGEM || {};
  const PRODS = window.INGEM_PRODUCTOS || [];
  const TRABAJOS = window.INGEM_TRABAJOS || [];
  const CATS_TRABAJOS = window.INGEM_TRABAJOS_CATEGORIAS || [];
  const porId = {};
  PRODS.forEach(function (p) { porId[p.id] = p; });

  /* ---------- Utilidades ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const coma = (n) => String(n).replace('.', ',');
  const fmt = (n) => '$ ' + miles(n);
  const wa = (msg) => 'https://wa.me/' + C.whatsapp + (msg ? '?text=' + encodeURIComponent(msg) : '');
  const ico = (id, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';

  /* ---------- Íconos (trazos de 24 px) ---------- */
  const ICONOS = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    snow: '<path d="M2 12h20"/><path d="M12 2v20"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
    thermo: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    store: '<path d="m3 9 1.5-5h15L21 9"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9 21v-6h6v6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    instagram: '<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    wa: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>'
  };
  const SPRITE = '<svg id="ingem-sprite" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">' +
    Object.keys(ICONOS).map(function (k) {
      return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONOS[k] + '</symbol>';
    }).join('') + '</svg>';

  function ponerSprite() {
    if (!document.getElementById('ingem-sprite')) {
      document.body.insertAdjacentHTML('afterbegin', SPRITE);
    }
  }

  /* ---------- Dibujos de equipos (se usan cuando no hay foto) ---------- */
  const K = { cuerpo: '#ffffff', borde: '#9dbdd1', sombra: '#e3eef5', oscuro: '#0e2738', aire: '#6facce', cobre: '#c9793f' };
  function ventilador(cx, cy, r) {
    let aspas = '';
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      aspas += '<path d="M' + cx + ' ' + cy + 'L' + (cx + Math.cos(a) * (r - 5)).toFixed(1) + ' ' + (cy + Math.sin(a) * (r - 5)).toFixed(1) + '"/>';
    }
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + K.sombra + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<g stroke="' + K.borde + '" stroke-width="2" stroke-linecap="round">' + aspas + '</g>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r / 4.2).toFixed(1) + '" fill="' + K.oscuro + '"/>';
  }
  const DIBUJOS = {
    split:
      '<rect x="46" y="48" width="228" height="72" rx="16" fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<path d="M47 94h226" stroke="' + K.sombra + '" stroke-width="2"/>' +
      '<rect x="66" y="102" width="188" height="8" rx="4" fill="' + K.oscuro + '"/>' +
      '<rect x="66" y="66" width="44" height="6" rx="3" fill="' + K.sombra + '"/>' +
      '<circle cx="250" cy="70" r="3.5" fill="' + K.aire + '"/>' +
      '<g fill="none" stroke="' + K.aire + '" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M100 134c-7 12-7 24 0 36"/><path d="M140 134c-4 14-4 28 0 42"/><path d="M180 134c4 14 4 28 0 42"/><path d="M220 134c7 12 7 24 0 36"/></g>',
    'piso-techo':
      '<path d="M24 36h272" stroke="' + K.borde + '" stroke-width="2" stroke-dasharray="6 6"/>' +
      '<path d="M74 36v22M246 36v22" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<rect x="34" y="58" width="252" height="66" rx="10" fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<g stroke="' + K.sombra + '" stroke-width="2"><path d="M52 72h216"/><path d="M52 80h216"/><path d="M52 88h216"/></g>' +
      '<rect x="48" y="102" width="224" height="12" rx="4" fill="' + K.oscuro + '"/>' +
      '<g fill="none" stroke="' + K.aire + '" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M84 138c-10 10-16 22-18 36"/><path d="M134 138c-6 12-9 24-9 38"/><path d="M186 138c6 12 9 24 9 38"/><path d="M236 138c10 10 16 22 18 36"/></g>',
    cassette:
      '<rect x="90" y="28" width="140" height="140" rx="14" fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<rect x="124" y="62" width="72" height="72" rx="6" fill="' + K.sombra + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<g stroke="' + K.borde + '" stroke-width="2"><path d="M132 76h56"/><path d="M132 88h56"/><path d="M132 100h56"/><path d="M132 112h56"/><path d="M132 124h56"/></g>' +
      '<g fill="' + K.oscuro + '"><rect x="118" y="40" width="84" height="8" rx="4"/><rect x="118" y="148" width="84" height="8" rx="4"/><rect x="102" y="56" width="8" height="84" rx="4"/><rect x="210" y="56" width="8" height="84" rx="4"/></g>' +
      '<g fill="none" stroke="' + K.aire + '" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M76 80c-10 6-16 12-22 20"/><path d="M76 116c-10-6-16-12-22-20"/><path d="M244 80c10 6 16 12 22 20"/><path d="M244 116c10-6 16-12 22-20"/>' +
      '<path d="M142 182c4 6 10 10 18 10s14-4 18-10"/></g>',
    conducto:
      '<path d="M20 150h280" stroke="' + K.borde + '" stroke-width="2" stroke-dasharray="6 6"/>' +
      '<rect x="28" y="62" width="118" height="68" rx="8" fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<g stroke="' + K.sombra + '" stroke-width="2"><path d="M42 78h60"/><path d="M42 88h60"/><path d="M42 98h60"/></g>' +
      '<circle cx="124" cy="112" r="4" fill="' + K.aire + '"/>' +
      '<rect x="146" y="76" width="112" height="40" fill="' + K.sombra + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<g stroke="' + K.borde + '" stroke-width="2"><path d="M174 76v40"/><path d="M202 76v40"/><path d="M230 76v40"/></g>' +
      '<path d="M258 96h10v54" fill="none" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<rect x="244" y="146" width="48" height="8" rx="3" fill="' + K.oscuro + '"/>' +
      '<g fill="none" stroke="' + K.aire + '" stroke-width="2.5" stroke-linecap="round"><path d="M254 166c-3 8-3 14 0 22"/><path d="M268 166v24"/><path d="M282 166c3 8 3 14 0 22"/></g>',
    rooftop:
      '<rect x="30" y="160" width="260" height="10" rx="3" fill="' + K.oscuro + '"/>' +
      '<rect x="40" y="62" width="240" height="98" rx="8" fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<path d="M150 62v98" stroke="' + K.borde + '" stroke-width="2"/>' +
      '<g stroke="' + K.sombra + '" stroke-width="3"><path d="M56 82h78"/><path d="M56 94h78"/><path d="M56 106h78"/><path d="M56 118h78"/><path d="M56 130h78"/><path d="M56 142h78"/></g>' +
      ventilador(215, 111, 36) +
      '<g fill="none" stroke="' + K.aire + '" stroke-width="2.5" stroke-linecap="round"><path d="M190 46c-4-8-4-14 0-22"/><path d="M215 46V22"/><path d="M240 46c4-8 4-14 0-22"/></g>',
    vrf:
      '<rect x="92" y="184" width="26" height="8" rx="2" fill="' + K.oscuro + '"/><rect x="186" y="184" width="26" height="8" rx="2" fill="' + K.oscuro + '"/>' +
      '<rect x="84" y="20" width="136" height="164" rx="10" fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"/>' +
      ventilador(152, 62, 32) + ventilador(152, 138, 32) +
      '<g fill="none" stroke="' + K.cobre + '" stroke-width="3" stroke-linecap="round"><path d="M220 150h42v-90"/><path d="M220 164h56V60"/></g>' +
      '<g fill="' + K.cuerpo + '" stroke="' + K.borde + '" stroke-width="2"><rect x="244" y="36" width="50" height="22" rx="6"/></g>' +
      '<rect x="252" y="50" width="34" height="3" rx="1.5" fill="' + K.oscuro + '"/>'
  };
  function ilus(tipo, titulo) {
    const cuerpo = DIBUJOS[tipo] || DIBUJOS.split;
    return '<svg class="ilu" viewBox="0 0 320 210" xmlns="http://www.w3.org/2000/svg"' +
      (titulo ? ' role="img" aria-label="' + esc(titulo) + '"' : ' aria-hidden="true"') + '>' + cuerpo + '</svg>';
  }

  /* ---------- Tarjetas ---------- */
  function specsDe(p) {
    const s = [];
    if (p.frigorias) s.push(miles(p.frigorias) + ' FG');
    if (p.kw) s.push(coma(p.kw) + ' kW');
    if (p.modo) s.push(p.modo);
    return s;
  }
  function msgCotizar(p) {
    return '¡Hola INGEM! Quiero pedir una cotización de: ' + p.nombre + ' (' + p.marca + ').';
  }
  function tarjeta(p, o) {
    o = o || {};
    const tag = p.tecnologia
      ? '<span class="prod__tag' + (p.tecnologia === 'Inverter' ? '' : ' prod__tag--onoff') + '">' + esc(p.tecnologia) + '</span>'
      : '';
    const media = (p.imagen ? '<img src="' + esc(p.imagen) + '" alt="" loading="lazy">' : ilus(p.tipo)) + tag;
    const destino = 'productos.html#p-' + p.id;
    const abrirMedia = o.enlace
      ? '<a class="prod__media" href="' + destino + '" tabindex="-1" aria-hidden="true">' + media + '</a>'
      : '<button type="button" class="prod__media" data-detalle="' + p.id + '" tabindex="-1" aria-hidden="true">' + media + '</button>';
    const abrirNombre = o.enlace
      ? '<a class="prod__link" href="' + destino + '">' + esc(p.nombre) + '</a>'
      : '<button type="button" class="prod__link" data-detalle="' + p.id + '">' + esc(p.nombre) + '</button>';
    const pie = p.precio != null
      ? '<div class="precio">' + fmt(p.precio) + '</div>' +
        '<button type="button" class="btn btn--primary btn--sm" data-agregar="' + p.id + '" aria-label="Agregar al carrito: ' + esc(p.nombre) + ' ' + esc(p.marca) + '">' + ico('plus') + 'Agregar</button>'
      : '<div class="precio precio--consultar">A cotizar</div>' +
        '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="' + wa(msgCotizar(p)) + '">Pedir cotización</a>';
    return '<article class="prod">' + abrirMedia +
      '<div class="prod__body">' +
      '<span class="prod__marca">' + esc(p.marca) + '</span>' +
      '<h3 class="prod__nombre">' + abrirNombre + '</h3>' +
      '<div class="prod__specs">' + specsDe(p).map(function (s) { return '<span class="spec">' + esc(s) + '</span>'; }).join('') + '</div>' +
      (p.ambiente ? '<p class="prod__amb">' + esc(p.ambiente) + '</p>' : '') +
      '<div class="prod__pie">' + pie + '</div>' +
      '</div></article>';
  }
  function obra(t) {
    const cat = (CATS_TRABAJOS.find(function (c) { return c.id === t.categoria; }) || {}).nombre || '';
    const tapa = t.imagen ? '<img src="' + esc(t.imagen) + '" alt="' + esc(t.titulo) + '" loading="lazy">' : ilus(t.tipo);
    return '<article class="obra">' +
      '<div class="obra__img">' + tapa + (cat ? '<span class="obra__cat">' + esc(cat) + '</span>' : '') + '</div>' +
      '<h3>' + esc(t.titulo) + '</h3>' +
      '<p>' + esc(t.descripcion) + '</p>' +
      (t.lugar ? '<span class="obra__lugar">' + ico('map-pin') + esc(t.lugar) + '</span>' : '') +
      '</article>';
  }

  /* ---------- Encabezado y pie ---------- */
  const NAV = [
    ['index.html', 'Inicio', 'inicio'],
    ['productos.html', 'Productos', 'productos'],
    ['servicio-tecnico.html', 'Servicio técnico', 'servicio'],
    ['trabajos.html', 'Trabajos', 'trabajos'],
    ['nosotros.html', 'Quiénes somos', 'nosotros'],
    ['contacto.html', 'Contacto', 'contacto']
  ];
  const MSG_HOLA = '¡Hola INGEM! Quiero hacer una consulta.';

  class IngemHeader extends HTMLElement {
    connectedCallback() {
      if (this.dataset.listo) return;
      this.dataset.listo = '1';
      ponerSprite();
      const pag = this.getAttribute('pagina') || '';
      const links = NAV.map(function (n) {
        return '<a href="' + n[0] + '"' + (n[2] === pag ? ' aria-current="page"' : '') + '>' + n[1] + '</a>';
      }).join('');
      this.innerHTML =
        '<div class="topbar"><div class="wrap topbar__in">' +
        '<span>' + ico('map-pin') + 'Base en Guernica · Trabajamos en Buenos Aires y Neuquén</span>' +
        '<div class="topbar__list">' +
        '<a href="tel:' + esc(C.telefonoLlamada) + '">' + ico('phone') + esc(C.telefono) + '</a>' +
        '<a href="mailto:' + esc(C.email) + '">' + ico('mail') + esc(C.email) + '</a>' +
        '</div></div></div>' +
        '<header class="hdr"><div class="wrap hdr__in">' +
        '<a class="hdr__logo" href="index.html" aria-label="INGEM, ir al inicio"><img src="img/logo-header.png" alt="INGEM" width="499" height="271"></a>' +
        '<nav class="nav" id="nav" aria-label="Principal">' + links +
        '<a class="btn btn--wa" target="_blank" rel="noopener" href="' + wa(MSG_HOLA) + '">' + ico('wa', 'ico--fill') + 'Escribinos por WhatsApp</a>' +
        '</nav>' +
        '<div class="hdr__acc">' +
        '<a class="btn btn--wa btn--sm hdr__wa" target="_blank" rel="noopener" href="' + wa(MSG_HOLA) + '">' + ico('wa', 'ico--fill') + 'WhatsApp</a>' +
        '<button type="button" class="icon-btn" data-cart-open aria-label="Abrir el carrito">' + ico('cart') + '<span class="cart-count" hidden>0</span></button>' +
        '<button type="button" class="icon-btn hdr__menu" aria-expanded="false" aria-controls="nav" aria-label="Abrir el menú">' + ico('menu') + '</button>' +
        '</div></div></header>';
    }
  }

  class IngemFooter extends HTMLElement {
    connectedCallback() {
      if (this.dataset.listo) return;
      this.dataset.listo = '1';
      ponerSprite();
      const redes = [
        C.instagram ? '<a href="' + esc(C.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram de INGEM">' + ico('instagram') + '</a>' : '',
        C.facebook ? '<a href="' + esc(C.facebook) + '" target="_blank" rel="noopener" aria-label="Facebook de INGEM">' + ico('facebook') + '</a>' : ''
      ].join('');
      this.innerHTML =
        '<footer class="ftr"><div class="wrap">' +
        '<div class="ftr__grid">' +
        '<div class="ftr__marca"><img src="img/logo-claro.png" alt="INGEM, Especialistas en Termomecánica" width="499" height="311">' +
        '<p>Venta, instalación y servicio técnico de aire acondicionado, sistemas VRF/VRV y refrigeración.</p>' +
        (redes ? '<div class="ftr__redes">' + redes + '</div>' : '') +
        '</div>' +
        '<div><h4>Sitio</h4><ul>' + NAV.map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + '</a></li>'; }).join('') + '</ul></div>' +
        '<div><h4>Productos</h4><ul>' +
        '<li><a href="productos.html#splits">Splits para hogar</a></li>' +
        '<li><a href="productos.html#comerciales">Equipos comerciales</a></li>' +
        '<li><a href="productos.html#vrf">Sistemas VRF / VRV</a></li>' +
        '<li><a href="productos.html#calculadora">Calculadora de frigorías</a></li>' +
        '</ul></div>' +
        '<div><h4>Contacto</h4><ul class="ftr__contacto">' +
        '<li>' + ico('wa', 'ico--fill') + '<a target="_blank" rel="noopener" href="' + wa(MSG_HOLA) + '">WhatsApp ' + esc(C.telefono) + '</a></li>' +
        '<li>' + ico('phone') + '<a href="tel:' + esc(C.telefonoLlamada) + '">' + esc(C.telefono) + '</a></li>' +
        '<li>' + ico('mail') + '<a href="mailto:' + esc(C.email) + '" style="overflow-wrap:anywhere">' + esc(C.email) + '</a></li>' +
        '<li>' + ico('map-pin') + '<a target="_blank" rel="noopener" href="' + esc(C.mapa) + '">' + esc(C.direccion) + '</a></li>' +
        (C.horario ? '<li>' + ico('clock') + '<span>' + esc(C.horario) + '</span></li>' : '') +
        '</ul></div>' +
        '</div>' +
        '<div class="ftr__base"><span>© ' + new Date().getFullYear() + ' INGEM · Especialistas en Termomecánica</span><span>Buenos Aires y Neuquén, Argentina</span></div>' +
        '</div></footer>';
    }
  }

  customElements.define('ingem-header', IngemHeader);
  customElements.define('ingem-footer', IngemFooter);

  /* ---------- Carrito ---------- */
  const CLAVE = 'ingem-carrito';
  let carrito = leer();

  function leer() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE) || '[]');
      if (!Array.isArray(v)) return [];
      return v.filter(function (i) {
        return i && porId[i.id] && porId[i.id].precio != null && i.cant > 0;
      }).map(function (i) { return { id: i.id, cant: Math.min(99, Math.floor(i.cant)) }; });
    } catch (e) {
      return [];
    }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(carrito)); } catch (e) { /* sin almacenamiento: sigue en memoria */ }
  }
  function unidades() { return carrito.reduce(function (n, i) { return n + i.cant; }, 0); }
  function total() { return carrito.reduce(function (n, i) { return n + porId[i.id].precio * i.cant; }, 0); }

  function agregar(id, cant) {
    const p = porId[id];
    if (!p || p.precio == null) return;
    const item = carrito.find(function (i) { return i.id === id; });
    if (item) item.cant = Math.min(99, item.cant + (cant || 1));
    else carrito.push({ id: id, cant: cant || 1 });
    guardar();
    pintarCarrito();
    avisar('Agregaste ' + p.nombre + ' al pedido', 'Ver pedido', abrirCarrito);
  }
  function cambiar(id, delta) {
    const item = carrito.find(function (i) { return i.id === id; });
    if (!item) return;
    item.cant += delta;
    if (item.cant <= 0) carrito = carrito.filter(function (i) { return i.id !== id; });
    else item.cant = Math.min(99, item.cant);
    guardar();
    pintarCarrito();
  }

  function mensajePedido() {
    const val = function (id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const lineas = ['¡Hola INGEM! Quiero hacer este pedido desde la web:', ''];
    carrito.forEach(function (i) {
      const p = porId[i.id];
      lineas.push('• ' + i.cant + ' × ' + p.nombre + ' (' + p.marca + '): ' + fmt(p.precio * i.cant));
    });
    lineas.push('', 'Total: ' + fmt(total()));
    const inst = document.getElementById('cart-inst');
    if (inst && inst.checked) lineas.push('Instalación: quiero que me la coticen.');
    if (val('cart-nombre')) lineas.push('Nombre: ' + val('cart-nombre'));
    if (val('cart-localidad')) lineas.push('Localidad: ' + val('cart-localidad'));
    if (val('cart-nota')) lineas.push('Comentarios: ' + val('cart-nota'));
    return lineas.join('\n');
  }

  function pintarCarrito() {
    const n = unidades();
    document.querySelectorAll('.cart-count').forEach(function (b) {
      b.textContent = n;
      b.hidden = n === 0;
    });
    const dlg = document.getElementById('cart');
    if (!dlg) return;
    const items = dlg.querySelector('#cart-items');
    const vacio = carrito.length === 0;
    dlg.querySelector('#cart-datos').hidden = vacio;
    dlg.querySelector('.cart__foot').hidden = vacio;
    if (vacio) {
      items.innerHTML = '<div class="cart__vacio">' + ico('cart') +
        '<p><strong>Tu pedido está vacío.</strong><br>Sumá equipos desde el catálogo y envialo por WhatsApp.</p>' +
        '<a class="btn btn--primary" href="productos.html">Ver productos</a></div>';
      return;
    }
    items.innerHTML = carrito.map(function (i) {
      const p = porId[i.id];
      return '<div class="cart-item">' +
        '<div class="cart-item__img">' + (p.imagen ? '<img src="' + esc(p.imagen) + '" alt="">' : ilus(p.tipo)) + '</div>' +
        '<div class="cart-item__nombre"><small>' + esc(p.marca) + '</small>' + esc(p.nombre) + '</div>' +
        '<button type="button" class="cart-item__quitar" data-quitar="' + p.id + '" aria-label="Quitar ' + esc(p.nombre) + '">' + ico('trash') + '</button>' +
        '<div class="cart-item__pie">' +
        '<div class="cant"><button type="button" data-cant="-1" data-id="' + p.id + '" aria-label="Restar una unidad">' + ico('minus') + '</button>' +
        '<output aria-label="Cantidad">' + i.cant + '</output>' +
        '<button type="button" data-cant="1" data-id="' + p.id + '" aria-label="Sumar una unidad">' + ico('plus') + '</button></div>' +
        '<span class="cart-item__sub">' + fmt(p.precio * i.cant) + '</span>' +
        '</div></div>';
    }).join('');
    dlg.querySelector('#cart-total').textContent = fmt(total());
    dlg.querySelector('#cart-enviar').href = wa(mensajePedido());
  }

  function abrirCarrito() {
    const dlg = document.getElementById('cart');
    if (!dlg || dlg.open) return;
    pintarCarrito();
    dlg.showModal();
  }

  function montarCarrito() {
    document.body.insertAdjacentHTML('beforeend',
      '<dialog class="cart" id="cart" aria-labelledby="cart-titulo">' +
      '<div class="cart__head"><h2 id="cart-titulo">Tu pedido</h2>' +
      '<button type="button" class="icon-btn" data-cart-close aria-label="Cerrar el carrito">' + ico('x') + '</button></div>' +
      '<div class="cart__body"><div id="cart-items"></div>' +
      '<div class="cart__datos" id="cart-datos">' +
      '<h3>Datos para el pedido</h3>' +
      '<div class="campo"><label for="cart-nombre">Nombre <span class="opc">(opcional)</span></label><input type="text" id="cart-nombre" autocomplete="name"></div>' +
      '<div class="campo"><label for="cart-localidad">Localidad <span class="opc">(opcional)</span></label><input type="text" id="cart-localidad" autocomplete="address-level2" placeholder="Ej.: Guernica"></div>' +
      '<label class="check"><input type="checkbox" id="cart-inst"><span>Quiero que INGEM me cotice la instalación</span></label>' +
      '<div class="campo"><label for="cart-nota">Comentarios <span class="opc">(opcional)</span></label><textarea id="cart-nota" rows="2" placeholder="Forma de pago, horarios, dudas…"></textarea></div>' +
      '</div></div>' +
      '<div class="cart__foot">' +
      '<div class="cart__total"><span>Total</span><b id="cart-total">$ 0</b></div>' +
      '<p class="form-nota">' + esc(C.notaPrecios || '') + ' La instalación se cotiza aparte.</p>' +
      '<a class="btn btn--wa btn--lg btn--block" id="cart-enviar" target="_blank" rel="noopener" href="' + wa() + '">' + ico('wa', 'ico--fill') + 'Enviar pedido por WhatsApp</a>' +
      '<button type="button" class="cart__vaciar" data-cart-vaciar>Vaciar el pedido</button>' +
      '</div></dialog>' +
      '<div class="toast" id="toast" role="status" aria-live="polite"></div>' +
      '<a class="wa-float" target="_blank" rel="noopener" href="' + wa(MSG_HOLA) + '" aria-label="Escribinos por WhatsApp">' + ico('wa', 'ico--fill') + '</a>'
    );
    const dlg = document.getElementById('cart');
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('input', function () {
      if (carrito.length) dlg.querySelector('#cart-enviar').href = wa(mensajePedido());
    });
    pintarCarrito();
  }

  /* ---------- Aviso emergente ---------- */
  let avisoT = null;
  function avisar(texto, accion, alTocar) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = ico('check') + '<span>' + esc(texto) + '</span>' + (accion ? '<button type="button">' + esc(accion) + '</button>' : '');
    const b = t.querySelector('button');
    if (b) b.addEventListener('click', function () { t.classList.remove('is-on'); alTocar(); });
    t.classList.add('is-on');
    clearTimeout(avisoT);
    avisoT = setTimeout(function () { t.classList.remove('is-on'); }, 4200);
  }

  /* ---------- Enlaces con datos de la empresa ---------- */
  function enlazar(raiz) {
    raiz.querySelectorAll('[data-c]').forEach(function (el) {
      const v = C[el.dataset.c];
      if (v) el.textContent = v;
    });
    raiz.querySelectorAll('[data-tel]').forEach(function (a) { a.href = 'tel:' + C.telefonoLlamada; });
    raiz.querySelectorAll('[data-mail]').forEach(function (a) { a.href = 'mailto:' + C.email; });
    raiz.querySelectorAll('[data-mapa]').forEach(function (a) { a.href = C.mapa; a.target = '_blank'; a.rel = 'noopener'; });
    raiz.querySelectorAll('[data-wa]').forEach(function (a) {
      a.href = wa(a.dataset.wa || MSG_HOLA);
      a.target = '_blank';
      a.rel = 'noopener';
    });
    raiz.querySelectorAll('[data-si]').forEach(function (el) { el.hidden = !C[el.dataset.si]; });
    raiz.querySelectorAll('[data-ico]').forEach(function (el) {
      el.outerHTML = ico(el.dataset.ico, el.dataset.icoClase || '');
    });
  }

  /* ---------- Formularios que se envían por WhatsApp ---------- */
  function formularios() {
    document.querySelectorAll('form[data-wa-form]').forEach(function (form) {
      const btn = form.querySelector('[data-enviar]');
      const ok = form.querySelector('[data-ok]');
      if (!btn) return;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.href = wa(form.dataset.waForm);

      function mensaje() {
        const lineas = [form.dataset.waForm, ''];
        form.querySelectorAll('[name]').forEach(function (f) {
          const v = f.type === 'checkbox' ? (f.checked ? 'Sí' : '') : f.value.trim();
          if (v) lineas.push((f.dataset.etiqueta || f.name) + ': ' + v);
        });
        return lineas.join('\n');
      }
      function validar() {
        let primero = null;
        form.querySelectorAll('.campo').forEach(function (campo) {
          const f = campo.querySelector('[name]');
          if (!f) return;
          const falta = f.required && !f.value.trim();
          campo.classList.toggle('is-error', falta);
          let err = campo.querySelector('.campo__error');
          if (falta) {
            if (!err) {
              err = document.createElement('span');
              err.className = 'campo__error';
              err.id = f.id + '-error';
              campo.appendChild(err);
            }
            err.textContent = f.dataset.error || 'Completá este dato.';
            f.setAttribute('aria-invalid', 'true');
            f.setAttribute('aria-describedby', err.id);
            if (!primero) primero = f;
          } else {
            if (err) err.remove();
            f.removeAttribute('aria-invalid');
            f.removeAttribute('aria-describedby');
          }
        });
        if (primero) primero.focus();
        return !primero;
      }

      btn.addEventListener('click', function (e) {
        if (!validar()) {
          e.preventDefault();
          if (ok) ok.hidden = true;
          return;
        }
        btn.href = wa(mensaje());
        if (ok) ok.hidden = false;
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        btn.click();
      });
      form.addEventListener('input', function (e) {
        const campo = e.target.closest('.campo');
        if (campo && campo.classList.contains('is-error') && e.target.value.trim()) {
          campo.classList.remove('is-error');
          const err = campo.querySelector('.campo__error');
          if (err) err.remove();
          e.target.removeAttribute('aria-invalid');
        }
      });
    });
  }

  /* ---------- Bloques que se arman con los datos ---------- */
  function bloques() {
    document.querySelectorAll('[data-destacados]').forEach(function (el) {
      el.innerHTML = PRODS.filter(function (p) { return p.destacado; }).slice(0, 4)
        .map(function (p) { return tarjeta(p, { enlace: true }); }).join('');
    });
    document.querySelectorAll('[data-trabajos-inicio]').forEach(function (el) {
      el.innerHTML = TRABAJOS.filter(function (t) { return t.inicio; }).slice(0, 3).map(obra).join('');
    });
  }

  /* ---------- Eventos globales ---------- */
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-agregar],[data-cart-open],[data-cart-close],[data-cart-vaciar],[data-cant],[data-quitar],.hdr__menu,.nav a');
    if (!t) return;
    if (t.matches('[data-agregar]')) {
      agregar(t.dataset.agregar, 1);
    } else if (t.matches('[data-cart-open]')) {
      abrirCarrito();
    } else if (t.matches('[data-cart-close]')) {
      document.getElementById('cart').close();
    } else if (t.matches('[data-cart-vaciar]')) {
      carrito = [];
      guardar();
      pintarCarrito();
    } else if (t.matches('[data-cant]')) {
      cambiar(t.dataset.id, Number(t.dataset.cant));
    } else if (t.matches('[data-quitar]')) {
      cambiar(t.dataset.quitar, -999);
    } else if (t.matches('.hdr__menu')) {
      const hdr = t.closest('.hdr');
      const abierto = hdr.classList.toggle('is-open');
      t.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      t.setAttribute('aria-label', abierto ? 'Cerrar el menú' : 'Abrir el menú');
      t.innerHTML = ico(abierto ? 'x' : 'menu');
    } else if (t.matches('.nav a')) {
      const hdr = t.closest('.hdr');
      if (hdr) hdr.classList.remove('is-open');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const hdr = document.querySelector('.hdr.is-open');
    if (hdr) hdr.querySelector('.hdr__menu').click();
  });
  window.addEventListener('storage', function (e) {
    if (e.key === CLAVE) { carrito = leer(); pintarCarrito(); }
  });

  function iniciar() {
    ponerSprite();
    enlazar(document);
    bloques();
    montarCarrito();
    formularios();
    document.dispatchEvent(new CustomEvent('ingem:listo'));
  }

  /* API para las páginas que necesitan algo más (tienda, trabajos) */
  window.INGEM_UI = {
    esc: esc, miles: miles, coma: coma, fmt: fmt, wa: wa, ico: ico, ilus: ilus,
    tarjeta: tarjeta, obra: obra, specsDe: specsDe, msgCotizar: msgCotizar,
    agregar: agregar, abrirCarrito: abrirCarrito, enlazar: enlazar, porId: porId
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
