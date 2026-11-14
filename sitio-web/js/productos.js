/* ==========================================================================
   CATÁLOGO DE PRODUCTOS
   --------------------------------------------------------------------------
   IMPORTANTE: los modelos y precios de esta lista son DE EJEMPLO, para ver
   cómo queda la tienda. Hay que reemplazarlos por el catálogo real y después
   poner  catalogoDeEjemplo: false  en js/config.js.

   Cómo se carga cada producto:
     id          Identificador único, sin espacios (letras, números y guiones).
     categoria   'splits' | 'comerciales' | 'vrf'
     tipo        Dibujo que se muestra si no hay foto:
                 'split' | 'piso-techo' | 'cassette' | 'conducto' | 'rooftop' | 'vrf'
     marca       'Daikin' | 'Midea' | 'Carrier' | 'Surrey' (u otra)
     nombre      Título del producto.
     frigorias   Capacidad en frigorías (número, sin puntos). Opcional.
     kw          Capacidad en kW (número). Opcional.
     tecnologia  'Inverter' | 'On/Off'. Opcional.
     modo        'Frío / Calor' | 'Frío solo'. Opcional.
     ambiente    Texto libre, ej. 'Hasta 28 m²'. Opcional.
     precio      Número en pesos, sin puntos. Con  null  se muestra
                 "A cotizar" y el botón abre WhatsApp en vez del carrito.
     destacado   true para que aparezca en la página de inicio.
     descripcion Texto corto de venta.
     incluye     Lista de puntos a destacar. Opcional.
     imagen      Ruta a una foto, ej. 'img/productos/split-daikin-3000.jpg'.
                 Opcional: si no hay, se usa el dibujo del tipo.
   ========================================================================== */
window.INGEM_CATEGORIAS = [
  { id: 'splits', nombre: 'Splits para hogar', corto: 'Splits' },
  { id: 'comerciales', nombre: 'Equipos comerciales', corto: 'Comerciales' },
  { id: 'vrf', nombre: 'Sistemas VRF / VRV', corto: 'VRF / VRV' }
];

window.INGEM_PRODUCTOS = [
  /* ---------------- Splits para hogar ---------------- */
  {
    id: 'split-inverter-2250-daikin',
    categoria: 'splits', tipo: 'split', marca: 'Daikin',
    nombre: 'Split Inverter 2.250 frigorías',
    frigorias: 2250, kw: 2.6, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 18 m²',
    precio: 1189000,
    descripcion: 'Para dormitorios y escritorios. La tecnología Inverter mantiene la temperatura estable y consume menos que un equipo On/Off.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-3000-daikin',
    categoria: 'splits', tipo: 'split', marca: 'Daikin',
    nombre: 'Split Inverter 3.000 frigorías',
    frigorias: 3000, kw: 3.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 24 m²',
    precio: 1389000, destacado: true,
    descripcion: 'La capacidad más elegida para dormitorios grandes y livings chicos. Funcionamiento silencioso y bajo consumo.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-4500-daikin',
    categoria: 'splits', tipo: 'split', marca: 'Daikin',
    nombre: 'Split Inverter 4.500 frigorías',
    frigorias: 4500, kw: 5.3, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 36 m²',
    precio: 2049000,
    descripcion: 'Para livings, comedores y ambientes integrados. Enfría rápido y sostiene la temperatura sin picos de consumo.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-3000-midea',
    categoria: 'splits', tipo: 'split', marca: 'Midea',
    nombre: 'Split Inverter 3.000 frigorías',
    frigorias: 3000, kw: 3.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 24 m²',
    precio: 1149000, destacado: true,
    descripcion: 'Muy buena relación entre precio y prestaciones para uso diario en el hogar.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-5500-midea',
    categoria: 'splits', tipo: 'split', marca: 'Midea',
    nombre: 'Split Inverter 5.500 frigorías',
    frigorias: 5500, kw: 6.4, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 44 m²',
    precio: 2290000,
    descripcion: 'Para ambientes amplios, quinchos y locales chicos. Gran caudal de aire con consumo controlado.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-3000-carrier',
    categoria: 'splits', tipo: 'split', marca: 'Carrier',
    nombre: 'Split Inverter 3.000 frigorías',
    frigorias: 3000, kw: 3.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 24 m²',
    precio: 1259000,
    descripcion: 'Equipo confiable de una marca histórica en climatización, para dormitorios y livings.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-4500-carrier',
    categoria: 'splits', tipo: 'split', marca: 'Carrier',
    nombre: 'Split Inverter 4.500 frigorías',
    frigorias: 4500, kw: 5.3, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 36 m²',
    precio: 1879000,
    descripcion: 'Potencia para ambientes integrados con el ahorro de la tecnología Inverter.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-onoff-2250-surrey',
    categoria: 'splits', tipo: 'split', marca: 'Surrey',
    nombre: 'Split On/Off 2.250 frigorías',
    frigorias: 2250, kw: 2.6, tecnologia: 'On/Off', modo: 'Frío / Calor',
    ambiente: 'Hasta 18 m²',
    precio: 829000,
    descripcion: 'La opción más accesible para ambientes chicos y uso ocasional.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-inverter-3000-surrey',
    categoria: 'splits', tipo: 'split', marca: 'Surrey',
    nombre: 'Split Inverter 3.000 frigorías',
    frigorias: 3000, kw: 3.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Hasta 24 m²',
    precio: 1099000,
    descripcion: 'Inverter de marca nacional reconocida, con repuestos y service fáciles de conseguir.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'split-onoff-5500-surrey',
    categoria: 'splits', tipo: 'split', marca: 'Surrey',
    nombre: 'Split On/Off 5.500 frigorías',
    frigorias: 5500, kw: 6.4, tecnologia: 'On/Off', modo: 'Frío / Calor',
    ambiente: 'Hasta 44 m²',
    precio: 1690000,
    descripcion: 'Mucha capacidad a un precio conveniente para quinchos, salones y locales.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },

  /* ---------------- Equipos comerciales ---------------- */
  {
    id: 'piso-techo-9000-midea',
    categoria: 'comerciales', tipo: 'piso-techo', marca: 'Midea',
    nombre: 'Piso-techo Inverter 9.000 frigorías (3 TR)',
    frigorias: 9000, kw: 10.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Locales hasta 70 m²',
    precio: 3490000, destacado: true,
    descripcion: 'Se instala contra el piso o colgado del techo. Ideal para locales, oficinas y salones donde no hay cielorraso.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'piso-techo-15000-surrey',
    categoria: 'comerciales', tipo: 'piso-techo', marca: 'Surrey',
    nombre: 'Piso-techo 15.000 frigorías (5 TR)',
    frigorias: 15000, kw: 17.5, tecnologia: 'On/Off', modo: 'Frío / Calor',
    ambiente: 'Locales hasta 120 m²',
    precio: 4890000,
    descripcion: 'Equipo robusto para salones comerciales, gimnasios y depósitos. Alimentación trifásica.',
    incluye: ['Unidad interior y exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'cassette-9000-daikin',
    categoria: 'comerciales', tipo: 'cassette', marca: 'Daikin',
    nombre: 'Cassette 4 vías Inverter 9.000 frigorías (3 TR)',
    frigorias: 9000, kw: 10.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Oficinas hasta 70 m²',
    precio: 4150000, destacado: true,
    descripcion: 'Queda embutido en el cielorraso y reparte el aire en cuatro direcciones. La opción prolija para oficinas y comercios.',
    incluye: ['Unidad interior con panel', 'Unidad exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'cassette-15000-carrier',
    categoria: 'comerciales', tipo: 'cassette', marca: 'Carrier',
    nombre: 'Cassette 4 vías 15.000 frigorías (5 TR)',
    frigorias: 15000, kw: 17.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Salones hasta 120 m²',
    precio: 5690000,
    descripcion: 'Para salones amplios con cielorraso desmontable: distribución pareja y bajo nivel de ruido.',
    incluye: ['Unidad interior con panel', 'Unidad exterior', 'Control remoto', 'Garantía oficial de fábrica']
  },
  {
    id: 'baja-silueta-9000-midea',
    categoria: 'comerciales', tipo: 'conducto', marca: 'Midea',
    nombre: 'Baja silueta para conductos 9.000 frigorías (3 TR)',
    frigorias: 9000, kw: 10.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Varios ambientes por conductos',
    precio: 3790000,
    descripcion: 'El equipo queda oculto sobre el cielorraso y el aire llega por conductos y rejas. Climatiza varios ambientes con una sola unidad.',
    incluye: ['Unidad interior y exterior', 'Control de pared', 'Garantía oficial de fábrica']
  },
  {
    id: 'baja-silueta-15000-daikin',
    categoria: 'comerciales', tipo: 'conducto', marca: 'Daikin',
    nombre: 'Baja silueta para conductos 15.000 frigorías (5 TR)',
    frigorias: 15000, kw: 17.5, tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Varios ambientes por conductos',
    precio: 5990000,
    descripcion: 'Para viviendas grandes y oficinas con cielorraso. Instalación invisible y control desde un termostato de pared.',
    incluye: ['Unidad interior y exterior', 'Control de pared', 'Garantía oficial de fábrica']
  },
  {
    id: 'rooftop-10tr-carrier',
    categoria: 'comerciales', tipo: 'rooftop', marca: 'Carrier',
    nombre: 'Rooftop 10 TR',
    frigorias: 30000, kw: 35, modo: 'Frío / Calor',
    ambiente: 'Naves, supermercados y salones',
    precio: null,
    descripcion: 'Equipo compacto de techo para grandes superficies. Se cotiza junto con el proyecto de conductos y la puesta en marcha.',
    incluye: ['Relevamiento en obra', 'Cálculo de conductos', 'Puesta en marcha']
  },

  /* ---------------- Sistemas VRF / VRV ---------------- */
  {
    id: 'vrv-daikin',
    categoria: 'vrf', tipo: 'vrf', marca: 'Daikin',
    nombre: 'Sistema VRV para edificios y oficinas',
    tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Proyecto a medida',
    precio: null, destacado: true,
    descripcion: 'Una unidad exterior alimenta muchas unidades interiores, cada una con su propio control de temperatura. Se dimensiona según el edificio.',
    incluye: ['Relevamiento y balance térmico', 'Provisión de equipos', 'Montaje, cañerías y puesta en marcha', 'Mantenimiento posterior']
  },
  {
    id: 'vrf-midea',
    categoria: 'vrf', tipo: 'vrf', marca: 'Midea',
    nombre: 'Sistema VRF para comercios y edificios',
    tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Proyecto a medida',
    precio: null,
    descripcion: 'Caudal de refrigerante variable para climatizar varios ambientes con alta eficiencia y control por zona.',
    incluye: ['Relevamiento y balance térmico', 'Provisión de equipos', 'Montaje, cañerías y puesta en marcha', 'Mantenimiento posterior']
  },
  {
    id: 'mini-vrf-vivienda',
    categoria: 'vrf', tipo: 'vrf', marca: 'Midea',
    nombre: 'Mini VRF para viviendas y oficinas',
    tecnologia: 'Inverter', modo: 'Frío / Calor',
    ambiente: 'Casas y oficinas de 4 a 9 ambientes',
    precio: null,
    descripcion: 'La tecnología VRF en escala residencial: una sola unidad exterior y una interior por ambiente, sin llenar la fachada de condensadoras.',
    incluye: ['Relevamiento y balance térmico', 'Provisión de equipos', 'Montaje, cañerías y puesta en marcha']
  }
];
