import type { Message } from 'esbuild';

import Overlay from './Overlay.svelte';

export interface OverlayProps {
  /**
   * Error messages to display.
   */
  errors: Message[];

  /**
   * If provided, this URL will be opened when the user clicks on the overlay.
   *
   * This can be used to open the source file of the error or warning.
   */
  openFileURL?: string;
}

const ROOT_ID = '__esbuild_lr_root__';

export function overlay(props: OverlayProps): () => void {
  let target = document.getElementById(ROOT_ID);
  if (!target) {
    target = document.createElement('div');
    target.setAttribute('id', ROOT_ID);
    document.body.appendChild(target);
  }

  const onClose = () => {
    component.$destroy();
    if (target) target.remove();
  };

  const component = new Overlay({
    target,
    props: {
      errors: props.errors,
      openFileURL: props.openFileURL,
      onClose,
    },
  });

  return onClose;
}
