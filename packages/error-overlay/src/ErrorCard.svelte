<script lang="ts">
  import type { Location, Message } from 'esbuild';

  import StackEntry from './StackEntry.svelte';

  export let errors: Message[];

  const type = (errors.length > 0 && errors[0].detail?.type) || 'Error';
</script>

<div class="error">
  <div class="error-title">
    <span class="error-type">{type} <span class="error-counter" style="display: none" /></span>
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

<style>
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
</style>
