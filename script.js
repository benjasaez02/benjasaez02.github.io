(() => {
  const offerRoute = new URL('go.html', window.location.href).href;

  document.querySelectorAll('.affiliate-link').forEach((link) => {
    link.href = offerRoute;
    link.target = '_self';
    link.rel = 'nofollow sponsored';

    link.addEventListener('click', (event) => {
      event.preventDefault();

      try {
        localStorage.setItem('ultima_visita_oferta', new Date().toISOString());
      } catch (_) {
        // El almacenamiento puede estar bloqueado en navegadores internos.
      }

      window.location.assign(offerRoute);
    });
  });
})();
