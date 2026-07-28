# Ofertas Flash Chile

Sitio de ofertas publicado mediante GitHub Pages.

- Sitio: https://ofertasflashcl.github.io/
- Repositorio: `ofertasflashcl/ofertasflashcl.github.io`
- Sitemap: https://ofertasflashcl.github.io/sitemap.xml

## Arquitectura

- `index.html`: página principal y secciones del catálogo.
- `styles.css`: diseño responsive y animaciones.
- `script.js`: renderizado de tarjetas, filtros y animaciones al hacer scroll.
- `offers-data.js`: registro central de todas las ofertas.
- `go.html`: pantalla de salida que detecta TikTok y ofrece apertura web, navegador externo o copia del enlace.

## Agregar una oferta

Añade un nuevo objeto dentro de `window.OFFERS` en `offers-data.js`. Cada oferta debe tener un `id` único y sus propios campos `webUrl` y `affiliateUrl`.

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

La tarjeta se crea automáticamente y su botón apuntará a `go.html?offer=producto-unico`, por lo que no se mezclará con los enlaces de otras ofertas.

La página contiene enlaces de afiliado y avisa que el precio y el stock pueden cambiar.
