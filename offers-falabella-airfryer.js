(() => {
  const offer = {
    id: 'homen-airfryer-42l',
    category: 'Electrohogar',
    retailer: 'Falabella',
    featured: false,
    active: true,
    brand: 'Homen',
    name: 'FREIDORA4',
    variant: 'Negro · 4,2 litros · 1200 W',
    title: 'Freidora de aire Homen 4,2 L con recetario',
    shortDescription: 'Freidora de aire con circulación de calor 360°, panel análogo, siete programas y capacidad de 4,2 litros para preparar comidas con poco o nada de aceite.',
    price: 28990,
    oldPrice: 69990,
    currency: 'CLP',
    badge: '59% OFF · Falabella',
    score: 9.5,
    image: 'https://media.falabella.com/falabellaCL/151375019_01/w=1200,h=1200,fit=cover',
    imageFallback: '/assets/homen-airfryer-42l.svg',
    specs: [
      { label: 'Capacidad', value: '4,2 litros' },
      { label: 'Potencia', value: '1200 W' },
      { label: 'Programas', value: '7 programas' },
      { label: 'Panel', value: 'Análogo' }
    ],
    affiliateUrl: 'https://creators.falabella.com/-4jgl',
    productCode: '151375019',
    seller: 'lernen',
    publishedAt: '2026-08-02'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
})();
