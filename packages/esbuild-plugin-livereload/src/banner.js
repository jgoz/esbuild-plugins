/* global ErrorOverlay */

function init() {
  if (window.__ESBUILD_LR_PLUGIN__) return;

  const script = document.createElement('script');
  script.setAttribute('src', '{baseUrl}/overlay.js');
  document.head.appendChild(script);

  const evt = new EventSource('{baseUrl}/esbuild');
  evt.addEventListener('reload', () => {
    location.reload();
  });

  evt.addEventListener('build-error', e => {
    const result = JSON.parse(e.data);
    if (result.warnings) {
      for (const warning of result.warnings) {
        console.warn(`esbuild: ${warning.text}`);
      }
    }
    if (result.errors) {
      ErrorOverlay.overlay({ errors: result.errors });
    }
  });

  window.__ESBUILD_LR_PLUGIN__ = true;
}

init();
