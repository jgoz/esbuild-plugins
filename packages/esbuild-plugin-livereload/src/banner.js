/* global ErrorOverlay */

function init() {
  if (window.__ESBUILD_LR_PLUGIN__) return;

  const script = document.createElement('script');
  script.setAttribute('src', '{baseUrl}/overlay.js');
  document.head.appendChild(script);

  const evt = new EventSource('{baseUrl}/esbuild');

  evt.addEventListener('reload', () => {
    console.log('esbuild-plugin-livereload: reloading...');
    location.reload();
  });

  evt.addEventListener('build-result', e => {
    const result = JSON.parse(e.data);
    if (result.warnings) {
      for (const warning of result.warnings) {
        if (!warning.location) {
          console.warn(`WARN: ${warning.text}`);
        } else {
          const { file, line, column } = warning.location;
          const pluginText = e.pluginName ? `[plugin: ${e.pluginName}] ` : '';
          console.warn(`WARN: ${file}:${line}:${column}: warning: ${pluginText}${warning.text}`);
        }
      }
    }
    if (result.errors) {
      ErrorOverlay.overlay({ errors: result.errors, openFileURL: '{baseUrl}/open-editor' });
    }
  });

  window.__ESBUILD_LR_PLUGIN__ = true;
}

init();
