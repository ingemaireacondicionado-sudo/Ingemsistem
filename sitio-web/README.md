# Sitio web de INGEM

Sitio público de INGEM (Especialistas en Termomecánica): presentación de la
empresa, tienda con carrito y pedido por WhatsApp, servicio técnico, trabajos
realizados y contacto.

Es un sitio estático: HTML, CSS y JavaScript sin dependencias ni paso de
compilación. Es independiente del sistema de gestión que está en el resto del
repositorio y no comparte código ni base de datos con él.

## Páginas

| Archivo                 | Contenido                                               |
| ----------------------- | ------------------------------------------------------- |
| `index.html`            | Inicio                                                  |
| `productos.html`        | Tienda: catálogo, filtros, carrito y calculadora        |
| `servicio-tecnico.html` | Servicios, proceso, formulario de pedido y preguntas    |
| `trabajos.html`         | Nuestros trabajos                                       |
| `nosotros.html`         | Quiénes somos                                           |
| `contacto.html`         | Vías de contacto y formulario                           |

## Dónde se cambia cada cosa

| Qué                                              | Archivo             |
| ------------------------------------------------ | ------------------- |
| Teléfono, WhatsApp, email, dirección, horario, redes | `js/config.js`  |
| Productos, precios y categorías                  | `js/productos.js`   |
| Trabajos realizados                              | `js/trabajos.js`    |
| Textos de cada página                            | el `.html` de la página |
| Colores y tipografías                            | `css/styles.css` (bloque `:root`) |
| Encabezado, pie, carrito y formularios           | `js/sitio.js`       |

Cada archivo de datos tiene arriba un comentario con el significado de cada
campo.

### Cargar el catálogo real

Los productos y precios que vienen cargados son **de ejemplo**. Mientras
`catalogoDeEjemplo` esté en `true` en `js/config.js`, la tienda muestra un
aviso que lo aclara.

1. Reemplazar la lista de `js/productos.js` por los productos reales.
2. Un producto con `precio: null` se muestra como "A cotizar" y, en lugar de
   sumarse al carrito, abre WhatsApp con el pedido de cotización.
3. Para usar una foto, guardarla en `img/productos/` y poner la ruta en el
   campo `imagen`. Si no hay foto se muestra el dibujo del tipo de equipo.
4. Poner `catalogoDeEjemplo: false` en `js/config.js`.

### Cargar trabajos con fotos

1. Guardar las fotos en `img/trabajos/` (formato apaisado, por ejemplo
   1200 × 900 px).
2. En `js/trabajos.js`, completar el campo `imagen` de cada trabajo o sumar
   bloques nuevos. Con `inicio: true` el trabajo aparece también en la página
   de inicio (se muestran hasta tres).

## Cómo funciona el pedido

El carrito se guarda en el navegador del cliente. Al tocar "Enviar pedido por
WhatsApp" se abre WhatsApp con el detalle (productos, cantidades, total y
datos opcionales) listo para enviar al número configurado en `js/config.js`.
Los formularios de servicio técnico y de contacto funcionan igual. El sitio no
guarda datos de clientes ni necesita servidor.

## Verlo en la computadora

Abrir `index.html` con doble clic alcanza. Para servirlo como en internet:

```
npx serve sitio-web
```

## Publicarlo

Se puede subir a cualquier hosting de sitios estáticos (Netlify, Cloudflare
Pages, Vercel, un hosting con cPanel, etc.). No hay que compilar nada:

- Carpeta a publicar: `sitio-web`
- Comando de build: ninguno

Al tener el dominio definitivo conviene agregar en cada página la etiqueta
`<link rel="canonical">` y la dirección completa de la imagen `og:image`, y
sumar un `sitemap.xml`.
