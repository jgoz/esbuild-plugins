<script lang="ts">
  import type { Message } from 'esbuild';
  import { setContext } from 'svelte';

  import StackEntry from './StackEntry.svelte';

  export let errors: Message[];
  export let openFileURL: string | undefined;
  export let onClose: () => void;

  setContext('openFileURL', openFileURL);

  const type = (errors.length > 0 && errors[0].detail?.type) || 'Error';
</script>

<div class="modal">
  <h1>
    Oops :( <button class="close" on:click={onClose}>×</button>
  </h1>
  <div class="errors">
    <div class="error">
      <div class="error-title">
        <span class="error-type">{type} <span class="error-counter">{errors.length}</span></span>
        <span class="error-message"
          >Build failed with {errors.length} error{errors.length > 1 ? 's' : ''}</span
        >
      </div>
      <div class="error-stack">
        {#each errors as error}
          <StackEntry {error} />
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .modal {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: white;
    z-index: 10000;
    box-sizing: border-box;
    overflow-y: scroll;
    overflow-x: hidden;
    font-size: 18px;
    --left-pad: 60px;
  }
  .modal,
  .modal * {
    display: block;
    padding: 0;
    margin: 0;
    font-family: Menlo, Monaco, 'Courier New', Courier, monospace;
  }
  .modal h1 {
    color: black;
    margin: 0;
    padding: 0;
    font-size: 1.77em;
    font-weight: 600;
    opacity: 0.75;
    margin-top: 50px;
    margin-bottom: 45px;
    position: relative;
    padding-left: var(--left-pad);
  }
  .close {
    all: unset;
    color: black;
    font-weight: normal;
    text-decoration: none;
    position: absolute;
    top: -0.32em;
    right: 1em;
    font-size: 1.77em;
    opacity: 0.15;
    transition: all 0.25s ease-in-out;
  }
  .close:hover {
    transform: scale(1.5);
    opacity: 0.25;
  }
  .error {
    margin: 1em 0 3em 0;
    left: 0;
  }
  .error-title {
    display: flex;
    align-items: stretch;
    padding-right: 50px;
  }
  .error-type {
    min-height: 2.8em;
    display: flex !important;
    align-items: center;
    padding: 0 1em;
    background: rgb(255, 0, 64);
    color: white;
    margin-right: 2em;
    padding-left: var(--left-pad);
    white-space: nowrap;
  }
  .error-counter {
    color: white;
    opacity: 0.3;
    position: absolute;
    left: 0.8em;
  }
  .error-message {
    display: flex !important;
    align-items: center;
    font-weight: 400;
    line-height: 1em;
  }
  .error-stack {
    margin-top: 2em;
    white-space: pre;
    padding-left: var(--left-pad);
  }

  @media only screen and (max-width: 640px) {
    .modal {
      font-size: 15px;
      --left-pad: 50px;
    }

    .modal h1 {
      margin: 40px 0;
    }
  }
  @media only screen and (max-width: 500px) {
    .modal {
      font-size: 14px;
      --left-pad: 45px;
    }

    .modal h1 {
      margin: 30px 0;
    }
  }
</style>
