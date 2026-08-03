(() => {
  const offer = {
    id: 'naturalizer-taryn-gris',
    category: 'Moda y Calzado',
    featured: false,
    active: true,
    brand: 'Naturalizer',
    name: 'Taryn',
    variant: 'Gris claro · Mujer · Tallas 35,5 a 40 CL',
    title: 'Zapatillas Naturalizer Taryn gris para mujer',
    shortDescription: 'Zapatillas casuales de caña baja con ajuste de velcro, plantilla acolchada, suela TPR antideslizante y tecnología de comodidad N5 Contour.',
    price: 16820,
    oldPrice: 58000,
    currency: 'CLP',
    badge: '70% OFF · Liquidación',
    score: 9.5,
    image: '/assets/naturalizer-taryn.svg',
    imageFallback: '/assets/naturalizer-taryn.svg',
    specs: [
      { label: 'Modelo', value: 'Taryn' },
      { label: 'Ajuste', value: 'Velcro' },
      { label: 'Suela', value: 'TPR antideslizante' },
      { label: 'Tallas publicadas', value: '35,5 a 40 CL' }
    ],
    affiliateUrl: 'https://ddnf.adj.st/webview/?adj_campaign=social&adj_t=1y8rwb1z&url=https%3A%2F%2Farticulo.mercadolibre.cl%2FMLC-1501393795-zapatillas-naturalizer-taryn-gris-_JM%3FsearchVariation%3D183558941777%26matt_event_ts%3D1785388709958%26matt_d2id%3D22b64f25-0715-4453-a266-b41dead4064c%26matt_tracing_id%3De3273b74-fea4-4837-8e2b-99d2fa8c99c2%23polycard_client%3Drecommendations_home_affiliate-profile%26reco_backend%3Ditem_decorator%26reco_client%3Dhome_affiliate-profile%26matt_tool_id%3D82210482%26reco_item_pos%3D0%26source%3Daffiliate-profile%26reco_backend_type%3Dfunction%26reco_id%3De8369c64-cf00-42ec-8f47-f1bfdb1bd467%26tracking_id%3D5f0a6a2a-e4c5-4cee-8648-e7ee07c2b094%26c_uid%3D1ec2fe8a-2d6d-47dc-af77-96009bc50e43%26c_id%3D%252Fhome%252Fcard-featured%252Felement',
    publishedAt: '2026-07-30'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);

  function applyPointSpecialOffer() {
    const cards = document.querySelectorAll('#maquinas-point .point-card');
    if (cards.length < 2) return;

    const specials = [
      {
        price: '$34.900',
        discount: '65% OFF · 12 cuotas de $2.908',
        label: 'PRECIO ESPECIAL CON EL CÓDIGO'
      },
      {
        price: '$6.900',
        discount: '65% OFF · 6 cuotas de $1.150',
        label: 'PRECIO ESPECIAL CON EL CÓDIGO'
      }
    ];

    cards.forEach((card, index) => {
      const special = specials[index];
      if (!special) return;
      const label = card.querySelector('.point-price small');
      const price = card.querySelector('.point-price strong');
      const discount = card.querySelector('.point-price b');
      const chip = card.querySelector('.point-chip');
      if (label) label.textContent = special.label;
      if (price) price.textContent = special.price;
      if (discount) discount.textContent = special.discount;
      if (chip) chip.textContent = '65% OFF con referido';
    });

    const note = document.querySelector('#maquinas-point .point-note');
    if (note) {
      note.textContent = 'Oferta especial activada mediante el código CZTE8NPY9M: Smart 2 a $34.900 y Mini a $6.900. La campaña es limitada y Mercado Pago puede modificarla o finalizarla.';
    }

    const strip = document.querySelector('.top-strip strong');
    if (strip) {
      strip.textContent = 'Point Mini $6.900 · Point Smart 2 $34.900 con código · Power bank CMR $19.990 · Moto G06 $112.760 · Naturalizer $16.820';
    }

    document.querySelectorAll('.ticker-track span').forEach((item) => {
      if (item.textContent.includes('MÁQUINAS POINT')) item.textContent = 'POINT MINI $6.900 CON CÓDIGO';
      if (item.textContent.includes('POINT SMART 2 Y POINT MINI')) item.textContent = 'POINT SMART 2 $34.900 · 65% OFF';
    });
  }

  setTimeout(applyPointSpecialOffer, 0);
  document.addEventListener('DOMContentLoaded', applyPointSpecialOffer, { once: true });
})();