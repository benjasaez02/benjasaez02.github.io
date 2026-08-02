(() => {
  const offer = {
    id: 'nespresso-inissia-capsulas',
    category: 'Electrohogar',
    retailer: 'Falabella',
    featured: false,
    active: true,
    brand: 'Nespresso',
    name: 'Inissia',
    variant: 'Cápsulas · 0,7 litros · 1200–1310 W',
    title: 'Cafetera de cápsulas Nespresso Inissia',
    shortDescription: 'Cafetera compacta para cápsulas Nespresso, con depósito de 0,7 litros y potencia de hasta 1310 W para preparar café espresso de manera rápida.',
    price: 69990,
    oldPrice: 139990,
    currency: 'CLP',
    badge: '50% OFF · Falabella',
    score: 9.4,
    image: 'https://media.falabella.com/falabellaCL/17323992_01/w=1200,h=1200,fit=cover',
    imageFallback: '/assets/nespresso-inissia.svg',
    specs: [
      { label: 'Tipo', value: 'Cafetera de cápsulas' },
      { label: 'Capacidad', value: '0,7 litros' },
      { label: 'Potencia', value: '1200–1310 W' },
      { label: 'Ancho', value: '12 cm' }
    ],
    affiliateUrl: 'https://creators.falabella.com/-4jgJ',
    productCode: '17323992',
    seller: 'Falabella',
    publishedAt: '2026-08-02'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
})();
