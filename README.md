# Ofertas Flash Chile

Sitio de ofertas publicado mediante GitHub Pages.

- Sitio: https://ofertasflashcl.github.io/
- Repositorio: `ofertasflashcl/ofertasflashcl.github.io`
- Sitemap: https://ofertasflashcl.github.io/sitemap.xml

## Arquitectura

- `index.html`: página principal y secciones del catálogo.
- `styles.css`: diseño responsive y animaciones.
- `script.js`: renderizado de tarjetas, filtros y rutas por producto.
- `offers-data.js`: registro central de todas las ofertas.
- `offer-page.css` y `offer-page.js`: pantalla compartida para abrir cada oferta.
- `oferta/<id>/index.html`: ruta física permanente de cada producto.
- `go.html`: compatibilidad con enlaces antiguos; los traslada a la ruta permanente correspondiente.

## Agregar una oferta

1. Añade un objeto dentro de `window.OFFERS` en `offers-data.js`. Cada oferta debe tener un `id` único y sus propios campos `webUrl` y `affiliateUrl`.
2. Crea la carpeta `oferta/<id>/` y copia una de las páginas de oferta existentes, cambiando únicamente `data-offer-id` y la URL canónica.

Ejemplo mínimo:

```js
{
  id: 'producto-unico',
  category: 'Tecnología',
  active: true,
  title: 'Nombre del producto',
  variant: 'Color · capacidad',
  price: 99990,
  image: 'https://...',
  imageFallback: 'assets/phone-hero.svg',
  specs: [{ label: 'Memoria', value: '8 GB' }],
  webUrl: 'https://www.mercadolibre.cl/...',
  affiliateUrl: 'https://...'
}
```

La tarjeta se crea automáticamente y su botón apuntará a `/oferta/producto-unico/`. Como el identificador está en la ruta física, abrir el navegador externo conserva el producto aunque un navegador interno elimine parámetros de consulta.

La página contiene enlaces de afiliado y avisa que el precio y el stock pueden cambiar.