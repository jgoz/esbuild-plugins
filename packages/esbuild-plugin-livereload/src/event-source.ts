import type { BuildResult } from 'esbuild';

declare global {
  interface Window {
    __ESBUILD_LR_PLUGIN__: string;
  }
}

function writeWarnings(result: BuildResult | undefined) {
  if (!result?.warnings) return;
  for (const warning of result.warnings) {
    if (!warning.location) {
      console.warn(`WARN: ${warning.text}`);
    } else {
      const { file, line, column } = warning.location;
      const pluginText = warning.pluginName ? `[plugin: ${warning.pluginName}] ` : '';
      console.warn(`WARN: ${file}:${line}:${column}: warning: ${pluginText}${warning.text}`);
    }
  }
}

async function init() {
  const { overlay } = await import('@jgoz/esbuild-overlay');

  const evt = new EventSource(window.__ESBUILD_LR_PLUGIN__ + '/esbuild');
  let removeOverlay: (() => void) | undefined;

  evt.addEventListener('reload', e => {
    writeWarnings(JSON.parse((e as MessageEvent)?.data ?? '{}'));
    console.log('esbuild-plugin-livereload: reloading...');
    location.reload();
  });

  evt.addEventListener('reload-css', e => {
    const result = JSON.parse((e as MessageEvent)?.data ?? '{}');

    writeWarnings(result);
    console.log('esbuild-plugin-livereload: reloading CSS...');

    const links = document.getElementsByTagName('link');
    for (let i = 0; i < links.length; i++) {
      const link = links.item(i);
      if (!link || link.rel !== 'stylesheet' || !link.href) continue;

      const url = new URL(link.href);
      url.searchParams.set('_hash', Date.now().toString());

      link.href = url.href;
    }
  });

  evt.addEventListener('build-result', e => {
    const result = JSON.parse((e as MessageEvent)?.data ?? '{}');
    writeWarnings(result);
    if (removeOverlay && !result.errors.length) {
      removeOverlay();
      removeOverlay = undefined;
    }
    if (result.errors?.length) {
      removeOverlay = overlay({
        errors: result.errors,
        openFileURL: window.__ESBUILD_LR_PLUGIN__ + '/open-editor',
      });
    }
  });
}

init().catch(e => {
  console.error('ERROR: Unable to initialize esbuild-plugin-livereload');
  console.error(e.toString());
});
