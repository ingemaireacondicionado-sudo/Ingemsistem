/* ==========================================================================
   NUESTROS TRABAJOS
   --------------------------------------------------------------------------
   Cada entrada es una tarjeta de la página "Trabajos".
     categoria    'instalacion' | 'mantenimiento' | 'vrf' | 'refrigeracion'
     tipo         Dibujo que se muestra mientras no haya foto:
                  'split' | 'piso-techo' | 'cassette' | 'conducto' | 'rooftop' | 'vrf'
     titulo       Nombre del trabajo.
     descripcion  Una o dos oraciones contando qué se hizo.
     lugar        Zona o localidad.
     imagen       Ruta a la foto, ej. 'img/trabajos/vrf-oficinas.jpg'.
                  Al cargar una foto, reemplaza al dibujo.
     inicio       true para que aparezca en la página de inicio (máx. 3).

   Para sumar un trabajo real: copiar un bloque, cambiar los textos y poner
   la foto en la carpeta img/trabajos/.
   ========================================================================== */
window.INGEM_TRABAJOS_CATEGORIAS = [
  { id: 'instalacion', nombre: 'Instalaciones' },
  { id: 'vrf', nombre: 'VRF / VRV' },
  { id: 'mantenimiento', nombre: 'Mantenimiento' },
  { id: 'refrigeracion', nombre: 'Refrigeración' }
];

window.INGEM_TRABAJOS = [
  {
    categoria: 'vrf', tipo: 'vrf', inicio: true,
    titulo: 'Sistemas VRF / VRV en edificios',
    descripcion: 'Montaje de unidades exteriores e interiores, tendido de cañerías de cobre, prueba de estanqueidad, vacío, carga y puesta en marcha.',
    lugar: 'Buenos Aires',
    imagen: ''
  },
  {
    categoria: 'instalacion', tipo: 'cassette', inicio: true,
    titulo: 'Climatización de oficinas y locales',
    descripcion: 'Equipos cassette, piso-techo y baja silueta con conductos, instalados sin interrumpir la actividad del comercio.',
    lugar: 'Buenos Aires',
    imagen: ''
  },
  {
    categoria: 'mantenimiento', tipo: 'piso-techo', inicio: true,
    titulo: 'Mantenimiento preventivo para empresas',
    descripcion: 'Limpieza de unidades, control de presiones de gas, revisión eléctrica y registro del estado de cada equipo.',
    lugar: 'Buenos Aires y Neuquén',
    imagen: ''
  },
  {
    categoria: 'instalacion', tipo: 'split',
    titulo: 'Instalación de splits en viviendas',
    descripcion: 'Instalación prolija con cañería de cobre aislada, desagüe con pendiente, vacío con bomba y prueba de funcionamiento.',
    lugar: 'Zona sur del Gran Buenos Aires',
    imagen: ''
  },
  {
    categoria: 'instalacion', tipo: 'conducto',
    titulo: 'Equipos por conductos',
    descripcion: 'Unidades baja silueta ocultas en el cielorraso, con conductos, rejas y difusores calculados para cada ambiente.',
    lugar: 'Buenos Aires',
    imagen: ''
  },
  {
    categoria: 'vrf', tipo: 'vrf',
    titulo: 'Service de sistemas VRF / VRV',
    descripcion: 'Diagnóstico de códigos de error, fallas de comunicación entre unidades, pérdidas de gas y reemplazo de placas.',
    lugar: 'Buenos Aires y Neuquén',
    imagen: ''
  },
  {
    categoria: 'refrigeracion', tipo: 'rooftop',
    titulo: 'Refrigeración comercial',
    descripcion: 'Reparación y mantenimiento de equipos de frío para comercios y gastronomía.',
    lugar: 'Buenos Aires',
    imagen: ''
  },
  {
    categoria: 'refrigeracion', tipo: 'conducto',
    titulo: 'Cocinas industriales',
    descripcion: 'Trabajos termomecánicos en cocinas de restaurantes y comedores: equipos de frío, ventilación y extracción.',
    lugar: 'Buenos Aires',
    imagen: ''
  },
  {
    categoria: 'mantenimiento', tipo: 'rooftop',
    titulo: 'Trabajos programados en Neuquén',
    descripcion: 'Viajes periódicos para instalaciones, mantenimiento y service de equipos de clientes de la zona.',
    lugar: 'Neuquén',
    imagen: ''
  }
];
