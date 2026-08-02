(() => {
  const offers = [
    {
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
      paymentRequirement: 'pagar con CMR Falabella',
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
    },
    {
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
    },
    {
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
    }
  ];

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];

  offers.forEach((offer) => {
    if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
    if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
  });
})();
