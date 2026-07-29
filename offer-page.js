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
  const isAndroid = /android/i.test(ua);
  const formatPrice = (value) => '$' + new Intl.NumberFormat('es-CL').format(Number(value) || 0);

  const title = document.getElementById('product-title');
  const variant = document.getElementById('product-variant');
  const image = document.getElementById('product-image');
  const price = document.getElementById('product-price');
  const badge = document.getElementById('product-badge');
  const environment = document.getElementById('environment');
  const manual = document.getElementById('manual-url');
  const appButton = document.getElementById('app-button');
  const webButton = document.getElementById('web-button');
  const affiliateButton = document.getElementById('affiliate-button');
  const directAppButton = document.getElementById('direct-app-button');

  if (!offer) {
    title.textContent = 'No encontramos esta oferta';
    variant.textContent = 'Vuelve al catálogo para elegir otra publicación.';
    document.querySelector('.content').insertAdjacentHTML('beforeend', '<a class="action primary" href="/">Volver al catálogo</a>');
    return;
  }

  const routeUrl = new URL(`/oferta/${encodeURIComponent(offer.id)}/`, location.origin).href;
  const resolveAsset = (asset) => {
    if (!asset) return '/assets/phone-hero.svg';
    if (/^(?:https?:)?\/\//i.test(asset) || asset.startsWith('/')) return asset;
    return `/${asset.replace(/^\.\//, '')}`;
  };
  const buildAndroidIntent = (url) => {
    try {
      const parsed = new URL(url);
      const target = parsed.host + parsed.pathname + parsed.search;
      return `intent://${target}#Intent;scheme=https;package=com.mercadolibre;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    } catch (_) {
      return url;
    }
  };

  document.title = `${offer.title} | Ofertas Flash Chile`;
  title.textContent = offer.title;
  variant.textContent = offer.variant || '';
  image.src = offer.image;
  image.alt = offer.title;
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => { image.onerror = null; image.src = resolveAsset(offer.imageFallback); };
  price.textContent = formatPrice(offer.price);
  badge.textContent = offer.badge || 'Oferta seleccionada';
  manual.value = routeUrl;

  const directAppUrl = isAndroid ? buildAndroidIntent(offer.webUrl) : offer.webUrl;
  appButton.href = offer.affiliateUrl || offer.webUrl;
  webButton.href = offer.webUrl;
  affiliateButton.href = offer.affiliateUrl || offer.webUrl;
  directAppButton.href = directAppUrl;
  [appButton, webButton, affiliateButton, directAppButton].forEach((link) => {
    link.target = '_self';
    link.rel = 'nofollow sponsored';
  });

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
      statusElement.textContent = 'Enlace de esta oferta copiado. Pégalo en Chrome.';
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

  document.getElementById('share-button').addEventListener('click', () => shareOffer(document.getElementById('tiktok-status')));
  document.getElementById('copy-button').addEventListener('click', () => copyRoute(document.getElementById('tiktok-status')));
  document.getElementById('select-button').addEventListener('click', () => {
    manual.focus();
    manual.select();
    document.getElementById('tiktok-status').textContent = 'Enlace seleccionado. Mantén presionado y toca “Copiar”.';
  });
  document.getElementById('normal-share-button').addEventListener('click', () => shareOffer(document.getElementById('normal-status')));

  affiliateButton.addEventListener('click', () => {
    document.getElementById('tiktok-status').textContent = 'Intentando abrir el enlace afiliado. TikTok puede bloquearlo.';
  });
  directAppButton.addEventListener('click', () => {
    document.getElementById('tiktok-status').textContent = 'Intentando abrir la app directamente. Si falla, usa ⋯ → Abrir en navegador.';
  });
  appButton.addEventListener('click', () => {
    document.getElementById('normal-status').textContent = 'Abriendo Mercado Libre con el enlace afiliado…';
  });
  webButton.addEventListener('click', () => {
    document.getElementById('normal-status').textContent = 'Abriendo la publicación web exacta…';
  });
})();