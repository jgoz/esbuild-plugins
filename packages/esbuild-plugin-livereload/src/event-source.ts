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

  evt.addEventListener('reload', e => {
    writeWarnings(JSON.parse((e as MessageEvent)?.data ?? '{}'));
    console.log('esbuild-plugin-livereload: reloading...');
    location.reload();
  });

  evt.addEventListener('build-result', e => {
    const result = JSON.parse((e as MessageEvent)?.data ?? '{}');
    writeWarnings(result);
    if (result.errors) {
      overlay({
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
