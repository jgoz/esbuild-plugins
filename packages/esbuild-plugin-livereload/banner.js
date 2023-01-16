(() => {
  if (typeof window === 'undefined') return;
  if (window.__ESBUILD_LR_PLUGIN__) return;
  window.__ESBUILD_LR_PLUGIN__ = '{baseUrl}';
  const script = document.createElement('script');
  script.setAttribute('src', '{baseUrl}livereload-event-source.js');
  script.setAttribute('type', 'module');
  document.head.appendChild(script);
})();
