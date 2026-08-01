(() => {
  'use strict';

  const bodyId = document.body.dataset.offerId || '';
  const pathMatch = location.pathname.match(/\/oferta\/([^/]+)\/?$/i);
  const queryId = new URLSearchParams(location.search).get('offer') || '';
  const requestedId = bodyId || (pathMatch ? decodeURIComponent(pathMatch[1]) : '') || queryId;
  const offers = Array.isArray(window.OFFERS) ? window.OFFERS : [];
  const offer = offers.find((item) => item.id === requestedId) || offers.find((item) => item.featured) || offers[0];
  const ua = navigator.userAgent || '';
  const isTikTok = /tiktok|musical_ly|bytedance|trill/i.test(ua);
  const formatPrice = (value) => '$' + new Intl.NumberFormat('es-CL').format(Number(value) || 0);

  const title = document.getElementById('product-title');
  const variant = document.getElementById('product-variant');
  const image = document.getElementById('product-image');
  const price = document.getElementById('product-price');
  const priceLabel = document.getElementById('price-label') || document.querySelector('.price small');
  const priceDetails = document.getElementById('price-details');
  const badge = document.getElementById('product-badge');
  const environment = document.getElementById('environment');
  const manual = document.getElementById('manual-url');
  const appButton = document.getElementById('app-button');
  const affiliateButton = document.getElementById('affiliate-button');
  const tiktokStatus = document.getElementById('tiktok-status');
  const normalStatus = document.getElementById('normal-status');
  const normalPanelText = document.querySelector('.normal-panel > p');
  const legalNotice = document.querySelector('.legal');

  if (!offer) {
    title.textContent = 'No encontramos esta oferta';
    variant.textContent = 'Vuelve al catálogo para elegir otra publicación.';
    document.querySelector('.content').insertAdjacentHTML('beforeend', '<a class="action primary" href="/">Volver al catálogo</a>');
    return;
  }

  const retailer = String(offer.retailer || 'Mercado Libre').trim();
  const routeUrl = new URL(`/oferta/${encodeURIComponent(offer.id)}/`, location.origin).href;
  const resolveAsset = (asset) => {
    if (!asset) return '/assets/phone-hero.svg';
    if (/^(?:https?:)?\/\//i.test(asset) || asset.startsWith('/')) return asset;
    return `/${asset.replace(/^\.\//, '')}`;
  };

  document.title = `${offer.title} | Ofertas Flash Chile`;
  title.textContent = offer.title;
  variant.textContent = offer.variant || '';
  image.src = resolveAsset(offer.image);
  image.alt = offer.title;
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => { image.onerror = null; image.src = resolveAsset(offer.imageFallback); };
  price.textContent = formatPrice(offer.price);
  badge.textContent = offer.badge || 'Oferta seleccionada';
  manual.value = routeUrl;

  if (priceLabel) {
    priceLabel.textContent = offer.priceCondition
      ? String(offer.priceCondition).toUpperCase()
      : 'PRECIO PUBLICADO';
  }

  if (priceDetails) {
    priceDetails.replaceChildren();
    if (offer.regularOfferPrice) {
      const regular = document.createElement('span');
      regular.textContent = `${offer.regularPriceCondition || 'Precio sin tarjeta'}: ${formatPrice(offer.regularOfferPrice)}`;
      priceDetails.appendChild(regular);
    }
    if (offer.oldPrice) {
      const reference = document.createElement('span');
      reference.textContent = `Precio de referencia: ${formatPrice(offer.oldPrice)}`;
      reference.style.color = '#747989';
      priceDetails.appendChild(reference);
    }
    if (offer.priceCondition) {
      const condition = document.createElement('span');
      condition.textContent = 'El precio destacado depende del medio de pago indicado.';
      condition.style.color = '#ffcc45';
      priceDetails.appendChild(condition);
    }
  }

  const affiliateUrl = String(offer.affiliateUrl || '').trim();
  [appButton, affiliateButton].filter(Boolean).forEach((link) => {
    if (!affiliateUrl) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.style.opacity = '0.55';
      link.style.pointerEvents = 'none';
      link.textContent = 'Enlace afiliado temporalmente no disponible';
      return;
    }
    link.href = affiliateUrl;
    link.target = '_self';
    link.rel = 'nofollow sponsored';
  });

  if (affiliateButton && affiliateUrl) affiliateButton.textContent = `Abrir enlace afiliado de ${retailer}`;
  if (appButton && affiliateUrl) appButton.textContent = `Abrir oferta en ${retailer}`;

  if (normalPanelText) {
    normalPanelText.textContent = `Continúa a ${retailer} mediante nuestro enlace afiliado para revisar el precio, stock, vendedor y condiciones de compra.`;
  }
  if (legalNotice) {
    const paymentCondition = offer.priceCondition && offer.regularOfferPrice
      ? ` El precio de ${formatPrice(offer.price)} requiere ${offer.paymentRequirement || 'cumplir la condición de pago indicada'}; ${offer.regularPriceCondition || 'sin esa condición'} se publica a ${formatPrice(offer.regularOfferPrice)}.`
      : '';
    legalNotice.textContent = `Aviso de afiliación: podemos recibir una comisión si compras mediante nuestros enlaces, sin aumentar el precio para ti.${paymentCondition} La compra, el pago, el despacho y la garantía se realizan directamente en ${retailer}. Precios, condiciones y stock sujetos a cambios.`;
  }

  if (isTikTok) {
    document.body.classList.add('tiktok-mode');
    environment.querySelector('span').textContent = 'Navegador interno de TikTok detectado';
    environment.style.color = 'var(--danger)';
  } else {
    environment.querySelector('span').textContent = 'Navegador externo listo · misma oferta conservada';
  }

  async function copyRoute(statusElement) {
    try {
      await navigator.clipboard.writeText(routeUrl);
      statusElement.textContent = 'Enlace de esta oferta copiado. Pégalo en tu navegador.';
    } catch (_) {
      manual.focus();
      manual.select();
      statusElement.textContent = 'La copia automática fue bloqueada. El enlace quedó seleccionado.';
    }
  }

  async function shareOffer(statusElement) {
    const data = { title: offer.title, text: `Oferta: ${offer.title}`, url: routeUrl };
    if (navigator.share) {
      try {
        await navigator.share(data);
        statusElement.textContent = 'Opciones del teléfono abiertas.';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyRoute(statusElement);
  }

  document.getElementById('share-button')?.addEventListener('click', () => shareOffer(tiktokStatus));
  document.getElementById('copy-button')?.addEventListener('click', () => copyRoute(tiktokStatus));
  document.getElementById('select-button')?.addEventListener('click', () => {
    manual.focus();
    manual.select();
    tiktokStatus.textContent = 'Enlace seleccionado. Mantén presionado y toca “Copiar”.';
  });
  document.getElementById('normal-share-button')?.addEventListener('click', () => shareOffer(normalStatus));

  affiliateButton?.addEventListener('click', () => {
    tiktokStatus.textContent = `Abriendo ${retailer} mediante el enlace afiliado…`;
  });
  appButton?.addEventListener('click', () => {
    normalStatus.textContent = `Abriendo ${retailer} mediante el enlace afiliado…`;
  });
})();
