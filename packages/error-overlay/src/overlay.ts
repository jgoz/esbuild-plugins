import type { Message } from 'esbuild';

import Overlay from './Overlay.svelte';

export interface OverlayProps {
  errors: Message[];
}

export function overlay(props: OverlayProps) {
  const target = document.createElement('div');
  document.body.appendChild(target);

  const component = new Overlay({
    target,
    props: {
      ...props,
      onClose: () => {
        component.$destroy();
        document.body.removeChild(target);
      },
    },
  });

  return component;
}
