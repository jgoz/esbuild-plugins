import type { ClientMessage } from './livereload-plugin';

declare global {
  interface Window {
    __ESBUILD_LR_PLUGIN__: string;
  }
}

function writeWarnings(result: ClientMessage | undefined) {
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

  const evt = new EventSource(window.__ESBUILD_LR_PLUGIN__ + 'esbuild');
  let removeOverlay: (() => void) | undefined;

  evt.addEventListener('change', e => {
    const msg: ClientMessage = JSON.parse(e?.data ?? '{}');
    writeWarnings(msg);

    const { forceReload = false, added, removed, updated } = msg;

    if (forceReload || added.length || removed.length || updated.length > 1) {
      console.log('esbuild-plugin-livereload: reloading...');
      location.reload();
      return;
    }

    if (updated.length === 1) {
      for (const link of Array.from(document.getElementsByTagName('link'))) {
        const url = new URL(link.href);

        if (url.host === location.host && url.pathname === msg.updated[0]) {
          console.log(`esbuild-plugin-livereload: reloading CSS file ${msg.updated[0]}...`);

          const next = link.cloneNode() as HTMLLinkElement;
          next.href = msg.updated[0] + '?' + Math.random().toString(36).slice(2);
          next.onload = () => link.remove();
          link.parentNode!.insertBefore(next, link.nextSibling);
          return;
        }
      }
      console.log('esbuild-plugin-livereload: reloading...');
      location.reload();
    }

    if (removeOverlay && !msg.errors?.length) {
      removeOverlay();
      removeOverlay = undefined;
    }

    if (msg.errors?.length) {
      removeOverlay = overlay({
        errors: msg.errors.slice(),
        openFileURL: window.__ESBUILD_LR_PLUGIN__ + 'esbuild/open-editor',
      });
    }
  });
}

init().catch(e => {
  console.error('ERROR: Unable to initialize esbuild-plugin-livereload');
  console.error(e.toString());
});
