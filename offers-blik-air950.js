(() => {
  const offer = {
    id: 'blik-air950',
    category: 'Tecnología',
    featured: false,
    active: true,
    brand: 'Blik',
    name: 'Air950',
    variant: 'Negro · In-ear · Estuche de carga',
    title: 'Audífonos Bluetooth Blik Air950 con ANC',
    shortDescription: 'Audífonos TWS con cancelación activa y ambiental de ruido, hasta 40 horas de batería, cuatro micrófonos y resistencia IPX4.',
    price: 19990,
    oldPrice: 39990,
    currency: 'CLP',
    badge: '50% OFF · +5 mil vendidos',
    score: 9.6,
    image: '/assets/blik-air950.svg',
    imageFallback: '/assets/blik-air950.svg',
    specs: [
      { label: 'Cancelación', value: 'ANC + ENC' },
      { label: 'Batería total', value: 'Hasta 40 horas' },
      { label: 'Conectividad', value: 'Bluetooth 5.4' },
      { label: 'Resistencia', value: 'IPX4' }
    ],
    webUrl: 'https://www.mercadolibre.cl/audifonos-bluetooth-blik-air950-cancelacion-de-ruido-40-hrs-negro/p/MLC54500865?matt_event_ts=1785357457994&matt_d2id=58498f7a-d909-493f-89b9-78a95eef2fb8&matt_tracing_id=14d76aae-d3d1-4b9a-9e25-5bd00e61f09a#polycard_client=recommendations_home_affiliate-profile&reco_backend=item_decorator&reco_client=home_affiliate-profile&matt_tool_id=82210482&reco_item_pos=0&source=affiliate-profile&reco_backend_type=function&reco_id=1154b8dd-8509-404a-9238-54480d130adb&tracking_id=29b36feb-ee52-44d6-aae0-4c2821e5f27a&c_id=%2Fhome%2Fcard-featured%2Felement&c_uid=d8485a07-5b05-41ea-b9ac-cde94b253e23',
    affiliateUrl: 'https://ddnf.adj.st/webview/?url=https%3A%2F%2Fwww.mercadolibre.cl%2Faudifonos-bluetooth-blik-air950-cancelacion-de-ruido-40-hrs-negro%2Fp%2FMLC54500865%3Fmatt_event_ts%3D1785357457994%26matt_d2id%3D58498f7a-d909-493f-89b9-78a95eef2fb8%26matt_tracing_id%3D14d76aae-d3d1-4b9a-9e25-5bd00e61f09a%23polycard_client%3Drecommendations_home_affiliate-profile%26reco_backend%3Ditem_decorator%26reco_client%3Dhome_affiliate-profile%26matt_tool_id%3D82210482%26reco_item_pos%3D0%26source%3Daffiliate-profile%26reco_backend_type%3Dfunction%26reco_id%3D1154b8dd-8509-404a-9238-54480d130adb%26tracking_id%3D29b36feb-ee52-44d6-aae0-4c2821e5f27a%26c_id%3D%252Fhome%252Fcard-featured%252Felement%26c_uid%3Dd8485a07-5b05-41ea-b9ac-cde94b253e23&adj_t=1y8rwb1z&adj_campaign=social',
    publishedAt: '2026-07-29'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
})();