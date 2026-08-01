(() => {
  'use strict';

  const metaQuestOffer = {
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
    ]
  };

  const motoG06Offer = {
    id: 'moto-g06-256gb',
    category: 'Tecnología',
    featured: false,
    active: true,
    brand: 'Motorola',
    name: 'Moto G06',
    variant: 'Azul marino · 256 GB · 4 GB RAM',
    title: 'Motorola Moto G06 256 GB azul marino',
    shortDescription: 'Celular de pantalla grande con 256 GB, cámara principal de 50 MP, batería de 5200 mAh y pantalla fluida de hasta 120 Hz.',
    price: 112760,
    oldPrice: 289990,
    currency: 'CLP',
    badge: '61% OFF · #1 más vendido',
    score: 9.6,
    image: 'assets/moto-g06.svg',
    imageFallback: 'assets/moto-g06.svg',
    specs: [
      { label: 'Almacenamiento', value: '256 GB' },
      { label: 'Memoria RAM', value: '4 GB' },
      { label: 'Pantalla', value: '6,9″ · 120 Hz' },
      { label: 'Batería', value: '5200 mAh' }
    ]
  };

  const sourceOffers = Array.isArray(window.OFFERS) ? [...window.OFFERS] : [];
  [metaQuestOffer, motoG06Offer].forEach((newOffer) => {
    if (!sourceOffers.some((offer) => offer.id === newOffer.id)) sourceOffers.push(newOffer);
  });
  const offers = sourceOffers.filter((offer) => offer.active !== false);
  const powerBankOffer = offers.find((offer) => offer.id === 'master-g-powerbank-20000mah');
  const formatPrice = (value) => new Intl.NumberFormat('es-CL').format(Number(value) || 0);
  const offerRoute = (id) => `/oferta/${encodeURIComponent(id)}/`;
  const isTikTok = /tiktok|musical_ly|bytedance|trill/i.test(navigator.userAgent || '');

  document.documentElement.classList.add('js');
  document.body.classList.toggle('is-tiktok', isTikTok);

  const safeText = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function offerCard(offer) {
    const specs = (offer.specs || []).slice(0, 4)
      .map((spec) => `<span>${safeText(spec.value)}</span>`)
      .join('');
    const oldPrice = offer.oldPrice
      ? `<del style="display:block;margin-bottom:2px;color:#777d8d;font-size:.75rem;font-weight:800">Antes $${formatPrice(offer.oldPrice)}</del>`
      : '';
    const condition = offer.priceCondition
      ? `<span style="display:block;margin-top:5px;color:#ffcc45;font-size:.66rem;font-weight:900">${safeText(offer.priceCondition)}</span>`
      : '';
    const regularOfferPrice = offer.regularOfferPrice
      ? `<span style="display:block;margin-top:3px;color:#a6aabc;font-size:.68rem;font-weight:800">${safeText(offer.regularPriceCondition || 'Precio sin tarjeta')}: $${formatPrice(offer.regularOfferPrice)}</span>`
      : '';
    const retailer = offer.retailer || 'Mercado Libre';
    const category = offer.retailer ? `${offer.category} · ${retailer}` : offer.category;
    const priceLabel = offer.priceCondition ? 'PRECIO ESPECIAL' : 'PRECIO PUBLICADO';

    return `
      <article class="offer-card ${offer.featured ? 'featured' : ''} reveal" data-category="${safeText(offer.category)}">
        <div class="offer-media">
          <span class="offer-badge">${safeText(offer.badge || 'Oferta')}</span>
          <img src="${safeText(offer.image)}" alt="${safeText(offer.title)}" loading="lazy" referrerpolicy="no-referrer"
            onerror="this.onerror=null;this.src='${safeText(offer.imageFallback || 'assets/phone-hero.svg')}'">
          <span class="offer-score"><span>${safeText(offer.score || '—')}</span><small>NOTA</small></span>
        </div>
        <div class="offer-content">
          <span class="offer-category">${safeText(category)}</span>
          <h3>${safeText(offer.title)}</h3>
          <p class="offer-variant">${safeText(offer.variant)}</p>
          <p class="offer-description">${safeText(offer.shortDescription)}</p>
          <div class="offer-specs">${specs}</div>
          <div class="offer-footer">
            <div class="offer-price"><small>${priceLabel}</small>${oldPrice}<strong>$${formatPrice(offer.price)}</strong>${condition}${regularOfferPrice}</div>
            <a class="offer-button js-offer-link" data-offer-id="${safeText(offer.id)}" href="${offerRoute(offer.id)}">Ver oferta en ${safeText(retailer)} →</a>
          </div>
        </div>
      </article>`;
  }

  const grid = document.getElementById('offers-grid');
  const count = document.getElementById('offer-count');
  const filterGroup = document.querySelector('.filter-group');
  const categories = ['Todas', ...new Set(offers.map((offer) => offer.category).filter(Boolean))];

  function updateStaticHighlights() {
    const strip = document.querySelector('.top-strip');
    const stripCount = strip?.querySelector('span:nth-of-type(1)');
    const stripOffers = strip?.querySelector('strong');
    if (stripCount) stripCount.textContent = `${offers.length} ofertas activas`;
    if (stripOffers) stripOffers.textContent = 'Power bank CMR $19.990 · Moto G06 $112.760 · Naturalizer $16.820 · Air950 $19.990 · POCO $79.990';

    const ticker = document.querySelector('.ticker-track');
    if (ticker) {
      ticker.innerHTML = '<span>POWER BANK 20.000 MAH $19.990 CON CMR</span><i>✦</i><span>MOTO G06 256 GB $112.760</span><i>✦</i><span>NATURALIZER TARYN $16.820</span><i>✦</i><span>AIR950 ANC + ENC $19.990</span><i>✦</i><span>POWER BANK 20.000 MAH $19.990 CON CMR</span><i>✦</i><span>CELULARES DESDE $79.990</span><i>✦</i><span>META QUEST 3S 128 GB</span><i>✦</i><span>TROTADORAS DESDE $99.990</span>';
    }

    const banner = document.querySelector('.final-banner');
    const bannerCopy = banner?.querySelector('div');
    const bannerLink = banner?.querySelector('a');
    if (powerBankOffer && bannerCopy) {
      bannerCopy.innerHTML = '<span>NUEVA OFERTA · FALABELLA</span><h2>Power bank · 20.000 mAh</h2><p>$19.990 pagando con CMR Falabella · $21.990 sin CMR.</p>';
    }
    if (powerBankOffer && bannerLink) {
      bannerLink.dataset.offerId = powerBankOffer.id;
      bannerLink.href = offerRoute(powerBankOffer.id);
      bannerLink.innerHTML = '<span>Ver oferta en Falabella</span><b>→</b>';
    }
  }

  function bindOfferLinks(root = document) {
    root.querySelectorAll('.js-offer-link').forEach((link) => {
      const id = link.dataset.offerId;
      if (!offers.some((offer) => offer.id === id)) return;
      link.href = offerRoute(id);
      link.target = '_self';
      link.rel = 'nofollow sponsored';
      link.addEventListener('click', () => {
        try {
          localStorage.setItem('ultima_oferta', JSON.stringify({ id, at: new Date().toISOString() }));
        } catch (_) {
          // Algunos navegadores internos desactivan localStorage.
        }
      });
    });
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let revealObserver;

  function observeReveals(root = document) {
    const nodes = root.querySelectorAll('.reveal:not(.in-view)');
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('in-view'));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    }

    nodes.forEach((node) => revealObserver.observe(node));
  }

  function renderOffers(category = 'Todas') {
    if (!grid) return;
    const visible = category === 'Todas' ? offers : offers.filter((offer) => offer.category === category);
    grid.innerHTML = visible.map(offerCard).join('');
    if (visible.length === 1) grid.querySelector('.offer-card')?.style.setProperty('grid-column', '1 / -1');
    if (count) count.textContent = `${visible.length} ${visible.length === 1 ? 'oferta activa' : 'ofertas activas'}`;
    bindOfferLinks(grid);
    observeReveals(grid);
  }

  function buildFilters() {
    if (!filterGroup) return;
    filterGroup.innerHTML = categories.map((category, index) =>
      `<button class="filter-button ${index === 0 ? 'active' : ''}" type="button" data-category="${safeText(category)}">${safeText(category)}</button>`
    ).join('');

    filterGroup.querySelectorAll('.filter-button').forEach((button) => {
      button.addEventListener('click', () => {
        filterGroup.querySelectorAll('.filter-button').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        renderOffers(button.dataset.category || 'Todas');
      });
    });
  }

  const header = document.getElementById('site-header');
  const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 18);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  const stage = document.getElementById('hero-stage');
  if (stage && !prefersReducedMotion && window.matchMedia('(pointer:fine)').matches) {
    stage.addEventListener('pointermove', (event) => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      stage.style.transform = `perspective(900px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
    });
    stage.addEventListener('pointerleave', () => { stage.style.transform = ''; });
  }

  const notice = document.getElementById('tiktok-notice');
  if (notice && isTikTok) {
    notice.hidden = false;
    notice.querySelector('button')?.addEventListener('click', () => { notice.hidden = true; });
  }

  updateStaticHighlights();
  buildFilters();
  renderOffers();
  bindOfferLinks(document);
  observeReveals(document);
})();
