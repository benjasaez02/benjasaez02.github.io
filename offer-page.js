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
  const tiktokStatus = document.getElementById('tiktok-status');

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

  const buildIntent = (url, packageName = '') => {
    try {
      const parsed = new URL(url);
      const target = parsed.host + parsed.pathname + parsed.search;
      const packagePart = packageName ? `package=${packageName};` : '';
      return `intent://${target}#Intent;scheme=${parsed.protocol.replace(':', '')};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;${packagePart}S.browser_fallback_url=${encodeURIComponent(url)};end`;
    } catch (_) {
      return url;
    }
  };

  const createBrowserEscapeButtons = () => {
    if (!isAndroid) return [];
    const existingGrid = document.querySelector('.tiktok-panel .experimental .action-grid');
    const experimental = existingGrid?.parentElement;
    if (!existingGrid || !experimental) return [];

    const hint = document.createElement('p');
    hint.className = 'browser-escape-hint';
    hint.textContent = 'Prueba primero tu navegador predeterminado. Si TikTok lo bloquea, intenta abrir Chrome directamente.';

    const grid = document.createElement('div');
    grid.className = 'action-grid browser-escape-grid';

    const defaultBrowserButton = document.createElement('a');
    defaultBrowserButton.id = 'default-browser-button';
    defaultBrowserButton.className = 'action violet';
    defaultBrowserButton.href = buildIntent(routeUrl);
    defaultBrowserButton.target = '_self';
    defaultBrowserButton.rel = 'nofollow';
    defaultBrowserButton.textContent = 'Abrir en navegador predeterminado';

    const chromeButton = document.createElement('a');
    chromeButton.id = 'chrome-button';
    chromeButton.className = 'action secondary';
    chromeButton.href = buildIntent(routeUrl, 'com.android.chrome');
    chromeButton.target = '_self';
    chromeButton.rel = 'nofollow';
    chromeButton.textContent = 'Abrir en Chrome';

    grid.append(defaultBrowserButton, chromeButton);
    experimental.insertBefore(hint, existingGrid);
    experimental.insertBefore(grid, existingGrid);

    defaultBrowserButton.addEventListener('click', () => {
      tiktokStatus.textContent = 'Solicitando el navegador predeterminado de Android. Si TikTok lo bloquea, prueba Chrome o usa ⋯ → Abrir en navegador.';
    });
    chromeButton.addEventListener('click', () => {
      tiktokStatus.textContent = 'Solicitando Chrome. Si no se abre, usa ⋯ → Abrir en navegador.';
    });

    return [defaultBrowserButton, chromeButton];
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

  const browserEscapeButtons = createBrowserEscapeButtons();
  const directAppUrl = isAndroid ? buildIntent(offer.webUrl, 'com.mercadolibre') : offer.webUrl;
  appButton.href = offer.affiliateUrl || offer.webUrl;
  webButton.href = offer.webUrl;
  affiliateButton.href = offer.affiliateUrl || offer.webUrl;
  directAppButton.href = directAppUrl;
  [appButton, webButton, affiliateButton, directAppButton, ...browserEscapeButtons].forEach((link) => {
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

  document.getElementById('share-button').addEventListener('click', () => shareOffer(tiktokStatus));
  document.getElementById('copy-button').addEventListener('click', () => copyRoute(tiktokStatus));
  document.getElementById('select-button').addEventListener('click', () => {
    manual.focus();
    manual.select();
    tiktokStatus.textContent = 'Enlace seleccionado. Mantén presionado y toca “Copiar”.';
  });
  document.getElementById('normal-share-button').addEventListener('click', () => shareOffer(document.getElementById('normal-status')));

  affiliateButton.addEventListener('click', () => {
    tiktokStatus.textContent = 'Intentando abrir el enlace afiliado. TikTok puede bloquearlo.';
  });
  directAppButton.addEventListener('click', () => {
    tiktokStatus.textContent = 'Intentando abrir la app directamente. Si falla, usa el navegador externo o ⋯ → Abrir en navegador.';
  });
  appButton.addEventListener('click', () => {
    document.getElementById('normal-status').textContent = 'Abriendo Mercado Libre con el enlace afiliado…';
  });
  webButton.addEventListener('click', () => {
    document.getElementById('normal-status').textContent = 'Abriendo la publicación web exacta…';
  });
})();