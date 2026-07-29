(() => {
  const offer = {
    id: 'meta-quest-3s-128gb',
    category: 'Tecnología',
    featured: false,
    active: true,
    brand: 'Meta',
    name: 'Quest 3S',
    variant: 'Blanco · 128 GB · Controles incluidos',
    title: 'Meta Quest 3S 128 GB con controles',
    shortDescription: 'Visor inalámbrico de realidad virtual y mixta con procesador Snapdragon XR2 Gen 2, audio 3D, controles Touch Plus y resolución de 1832 × 1920 por ojo.',
    price: 459990,
    oldPrice: 599990,
    currency: 'CLP',
    badge: '23% OFF · Más vendido',
    score: 9.3,
    image: 'assets/meta-quest-3s.svg',
    imageFallback: 'assets/meta-quest-3s.svg',
    specs: [
      { label: 'Almacenamiento', value: '128 GB' },
      { label: 'Resolución', value: '1832 × 1920 por ojo' },
      { label: 'Procesador', value: 'Snapdragon XR2 Gen 2' },
      { label: 'Controles', value: 'Touch Plus incluidos' }
    ],
    webUrl: 'https://www.mercadolibre.cl/lentes-de-realidad-virtual-oculus-meta-quest-3s-128gb-832x1920p-audio-3d-foco-ajustable-con-controles/p/MLC62870227?matt_event_ts=1785353628247&matt_d2id=0ee0c1b8-6b46-4625-b8c1-42bf91df045b&matt_tracing_id=07694a91-5dbe-42b6-bb8e-0b80e5b867f3#polycard_client=recommendations_home_affiliate-profile&reco_backend=item_decorator&reco_client=home_affiliate-profile&matt_tool_id=82210482&reco_item_pos=0&source=affiliate-profile&reco_backend_type=function&reco_id=89fba180-7f3d-4c10-ba05-b5c292479a3c&tracking_id=265bbc39-b730-4b15-b597-25b0c0cf3b1e&c_uid=0fb84ab6-8afd-4098-ab62-c444acb14589&c_id=%2Fhome%2Fcard-featured%2Felement',
    affiliateUrl: 'https://ddnf.adj.st/webview/?adj_campaign=social&adj_t=1y8rwb1z&url=https%3A%2F%2Fwww.mercadolibre.cl%2Flentes-de-realidad-virtual-oculus-meta-quest-3s-128gb-832x1920p-audio-3d-foco-ajustable-con-controles%2Fp%2FMLC62870227%3Fmatt_event_ts%3D1785353628247%26matt_d2id%3D0ee0c1b8-6b46-4625-b8c1-42bf91df045b%26matt_tracing_id%3D07694a91-5dbe-42b6-bb8e-0b80e5b867f3%23polycard_client%3Drecommendations_home_affiliate-profile%26reco_backend%3Ditem_decorator%26reco_client%3Dhome_affiliate-profile%26matt_tool_id%3D82210482%26reco_item_pos%3D0%26source%3Daffiliate-profile%26reco_backend_type%3Dfunction%26reco_id%3D89fba180-7f3d-4c10-ba05-b5c292479a3c%26tracking_id%3D265bbc39-b730-4b15-b597-25b0c0cf3b1e%26c_uid%3D0fb84ab6-8afd-4098-ab62-c444acb14589%26c_id%3D%252Fhome%252Fcard-featured%252Felement',
    publishedAt: '2026-07-29'
  };

  window.EXTRA_OFFERS = Array.isArray(window.EXTRA_OFFERS) ? window.EXTRA_OFFERS : [];
  if (!window.EXTRA_OFFERS.some((item) => item.id === offer.id)) window.EXTRA_OFFERS.push(offer);
  window.OFFERS = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  if (!window.OFFERS.some((item) => item.id === offer.id)) window.OFFERS.push(offer);
})();