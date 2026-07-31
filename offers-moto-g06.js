(() => {
  const offer = {
    id: 'moto-g06-256gb',
    category: 'Tecnología',
    featured: false,
    active: true,
    brand: 'Motorola',
    name: 'Moto G06',
    variant: 'Azul marino · 256 GB · 4 GB RAM',
    title: 'Motorola Moto G06 256 GB azul marino',
    shortDescription: 'Celular de pantalla grande con 256 GB de almacenamiento, cámara principal de 50 MP, batería de 5200 mAh y pantalla fluida de hasta 120 Hz.',
    price: 112760,
    oldPrice: 289990,
    currency: 'CLP',
    badge: '61% OFF · #1 más vendido',
    score: 9.6,
    image: '/assets/moto-g06.svg',
    imageFallback: '/assets/moto-g06.svg',
    specs: [
      { label: 'Almacenamiento', value: '256 GB' },
      { label: 'Memoria RAM', value: '4 GB' },
      { label: 'Pantalla', value: '6,9″ · 120 Hz' },
      { label: 'Batería', value: '5200 mAh' }
    ],
    webUrl: 'https://www.mercadolibre.cl/moto-g06-256-gb-dual-sim-256-gb-azul-marino-4-gb-ram/p/MLC62677849?matt_event_ts=1785463245024&matt_d2id=0f8e733a-a85e-4ef0-aa9c-2d231e253b21&matt_tracing_id=e0cd5330-2d56-4663-bf2c-9e8133e6b75c#polycard_client=recommendations_home_affiliate-profile&reco_backend=item_decorator&reco_client=home_affiliate-profile&matt_tool_id=82210482&reco_item_pos=0&source=affiliate-profile&reco_backend_type=function&reco_id=702139dc-037e-4681-844f-9babd1529302&tracking_id=833002b3-3d74-4199-879c-4e26eb5b57ca&c_uid=6fc6fd9c-9a4f-4cd7-844d-0a3f31cc004a&c_id=%2Fhome%2Fcard-featured%2Felement',
    affiliateUrl: 'https://ddnf.adj.st/webview/?adj_campaign=social&adj_t=1y8rwb1z&url=https%3A%2F%2Fwww.mercadolibre.cl%2Fmoto-g06-256-gb-dual-sim-256-gb-azul-marino-4-gb-ram%2Fp%2FMLC62677849%3Fmatt_event_ts%3D1785463245024%26matt_d2id%3D0f8e733a-a85e-4ef0-aa9c-2d231e253b21%26matt_tracing_id%3De0cd5330-2d56-4663-bf2c-9e8133e6b75c%23polycard_client%3Drecommendations_home_affiliate-profile%26reco_backend%3Ditem_decorator%26reco_client%3Dhome_affiliate-profile%26matt_tool_id%3D82210482%26reco_item_pos%3D0%26source%3Daffiliate-profile%26reco_backend_type%3Dfunction%26reco_id%3D702139dc-037e-4681-844f-9babd1529302%26tracking_id%3D833002b3-3d74-4199-879c-4e26eb5b57ca%26c_uid%3D6fc6fd9c-9a4f-4cd7-844d-0a3f31cc004a%26c_id%3D%252Fhome%252Fcard-featured%252Felement',
    publishedAt: '2026-07-30'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
})();