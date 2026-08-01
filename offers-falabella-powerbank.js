(() => {
  const offer = {
    id: 'master-g-powerbank-20000mah',
    category: 'Tecnología',
    retailer: 'Falabella',
    featured: false,
    active: true,
    brand: 'Master G',
    name: 'UCP20LPD',
    variant: 'Azul · 20.000 mAh · 22,5 W',
    title: 'Power bank Master G 20.000 mAh 22,5 W',
    shortDescription: 'Batería externa de alta capacidad con carga rápida Power Delivery, pantalla indicadora, cuatro puertos y cable USB-C a USB-C incluido.',
    price: 19990,
    regularOfferPrice: 21990,
    oldPrice: 34990,
    priceCondition: 'Precio con CMR Falabella',
    regularPriceCondition: 'Sin CMR Falabella',
    currency: 'CLP',
    badge: '43% OFF · Precio CMR',
    score: 9.5,
    image: 'https://media.falabella.com/falabellaCL/135601655_01/w=1200,h=1200,fit=cover',
    imageFallback: '/assets/powerbank-master-g.svg',
    specs: [
      { label: 'Capacidad', value: '20.000 mAh' },
      { label: 'Carga rápida', value: 'Hasta 22,5 W' },
      { label: 'Puertos', value: '4 puertos' },
      { label: 'Cable incluido', value: 'USB-C a USB-C' }
    ],
    affiliateUrl: 'https://creators.falabella.com/-4iny',
    productCode: '135601655',
    seller: 'gasei',
    publishedAt: '2026-07-31'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
})();
