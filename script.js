(() => {
  'use strict';

  const offers = Array.isArray(window.OFFERS) ? window.OFFERS.filter((offer) => offer.active !== false) : [];
  const formatPrice = (value) => new Intl.NumberFormat('es-CL').format(Number(value) || 0);
  const offerRoute = (id) => `go.html?v=7&offer=${encodeURIComponent(id)}`;
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

    return `
      <article class="offer-card ${offer.featured ? 'featured' : ''} reveal" data-category="${safeText(offer.category)}">
        <div class="offer-media">
          <span class="offer-badge">${safeText(offer.badge || 'Oferta')}</span>
          <img src="${safeText(offer.image)}" alt="${safeText(offer.title)}" loading="lazy" referrerpolicy="no-referrer"
            onerror="this.onerror=null;this.src='${safeText(offer.imageFallback || 'assets/phone-hero.svg')}'">
          <span class="offer-score"><span>${safeText(offer.score || '—')}</span><small>NOTA</small></span>
        </div>
        <div class="offer-content">
          <span class="offer-category">${safeText(offer.category)}</span>
          <h3>${safeText(offer.title)}</h3>
          <p class="offer-variant">${safeText(offer.variant)}</p>
          <p class="offer-description">${safeText(offer.shortDescription)}</p>
          <div class="offer-specs">${specs}</div>
          <div class="offer-footer">
            <div class="offer-price"><small>PRECIO PUBLICADO</small>${oldPrice}<strong>$${formatPrice(offer.price)}</strong></div>
            <a class="offer-button js-offer-link" data-offer-id="${safeText(offer.id)}" href="${offerRoute(offer.id)}">Ver oferta exacta →</a>
          </div>
        </div>
      </article>`;
  }

  const grid = document.getElementById('offers-grid');
  const count = document.getElementById('offer-count');
  const filterGroup = document.querySelector('.filter-group');
  const categories = ['Todas', ...new Set(offers.map((offer) => offer.category).filter(Boolean))];

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

  buildFilters();
  renderOffers();
  bindOfferLinks(document);
  observeReveals(document);
})();